import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { ApplicationSettingEngine, MJActionEntity, MJListEntity, MJUserRoutineEntity } from '@memberjunction/core-entities';

/** The Lists application, whose settings hold the default refresh schedule. */
export const LISTS_APPLICATION_ID = '140166B9-4064-4C3F-ACF1-3EB7DB2C9BD0';

/** The action a list's refresh routine runs. */
export const REFRESH_LIST_ACTION_NAME = 'Refresh List From Source';

/** Lists app settings a new refresh routine copies. A later change to a setting leaves existing routines alone. */
export const LIST_REFRESH_SETTINGS = {
  DefaultCron: 'Lists.Refresh.DefaultCron',
  DefaultTimezone: 'Lists.Refresh.DefaultTimezone',
} as const;

/** Used when the Lists app settings are missing: daily at 2:00 am, New York time. */
const FALLBACK_SCHEDULE = { Cron: '0 2 * * *', Timezone: 'America/New_York' };

/** The routine name a list's refresh routine carries. */
export function RefreshRoutineName(listName: string): string {
  return `Refresh list: ${listName}`;
}

/**
 * Keeps a list's User Routine in step with the list. Called by `MJListEntityServer` after a
 * successful save, as the user who saved it (who is the list's owner: only the owner may turn on
 * Refresh automatically).
 *
 * - Refresh automatically on, with a source: the routine exists and is Active. It is created on
 *   first use from the Lists app's default schedule; a Disabled one is re-enabled. A Paused routine
 *   stays paused, because it is waiting for the owner to approve a source change.
 * - Off, or no source: an existing routine is Disabled, never deleted, so its run history stays.
 * - Its name and owner follow the list's.
 */
export class ListRefreshRoutine {
  constructor(
    private readonly provider: IMetadataProvider,
    private readonly contextUser: UserInfo,
  ) {}

  /** Brings the routine in line with the list. Returns the routine's ID, or null when the list has none. */
  public async ReconcileAsync(list: MJListEntity): Promise<string | null> {
    const wanted = list.AutoRefresh && (!!list.SourceViewID || !!list.SourceQueryID);
    const routine = await this.loadRoutineAsync(list.RefreshRoutineID);
    if (!routine) {
      return wanted ? this.createAsync(list) : null;
    }
    this.applyListIdentity(routine, list);
    if (wanted && routine.Status === 'Disabled') routine.Status = 'Active';
    if (!wanted) routine.Status = 'Disabled';
    await this.saveAsync(routine, list);
    return routine.ID;
  }

  /** Deletes a list's routine, after the list that pointed at it is deleted. */
  public async DeleteAsync(routineID: string): Promise<void> {
    const routine = await this.loadRoutineAsync(routineID);
    if (routine && !(await routine.Delete())) {
      throw new Error(`could not delete refresh routine ${routine.ID}: ${routine.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
  }

  private async createAsync(list: MJListEntity): Promise<string> {
    const routine = await this.provider.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', this.contextUser);
    routine.NewRecord();
    const schedule = await this.defaultScheduleAsync();
    this.applyListIdentity(routine, list);
    routine.RoutineType = 'Scheduled';
    routine.ScheduleMode = 'Recurring';
    routine.TargetType = 'Action';
    routine.TargetID = await this.refreshActionIdAsync();
    // No Mode: the action then uses the list's own RefreshMode, so a mode change needs no routine edit.
    routine.StartingPayload = JSON.stringify({ ListID: list.ID, ConfirmDrops: true });
    routine.CronExpression = schedule.Cron;
    routine.Timezone = schedule.Timezone;
    routine.NotifyCondition = 'OnFailure';
    routine.NotifyViaInApp = true;
    routine.NotifyViaEmail = false;
    routine.Status = 'Active';
    await this.saveAsync(routine, list);
    return routine.ID;
  }

  private applyListIdentity(routine: MJUserRoutineEntity, list: MJListEntity): void {
    routine.Name = RefreshRoutineName(list.Name);
    routine.UserID = list.UserID;
  }

  private async saveAsync(routine: MJUserRoutineEntity, list: MJListEntity): Promise<void> {
    if (!routine.Dirty) return;
    if (!(await routine.Save())) {
      throw new Error(`could not save the refresh routine of list '${list.Name}': ${routine.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
  }

  private async loadRoutineAsync(routineID: string | null): Promise<MJUserRoutineEntity | null> {
    if (!routineID) return null;
    const routine = await this.provider.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', this.contextUser);
    return (await routine.Load(routineID)) ? routine : null;
  }

  private async defaultScheduleAsync(): Promise<{ Cron: string; Timezone: string }> {
    await ApplicationSettingEngine.Instance.Config(false, this.contextUser, this.provider);
    const engine = ApplicationSettingEngine.Instance;
    return {
      Cron: engine.GetSetting(LIST_REFRESH_SETTINGS.DefaultCron, LISTS_APPLICATION_ID)?.trim() || FALLBACK_SCHEDULE.Cron,
      Timezone: engine.GetSetting(LIST_REFRESH_SETTINGS.DefaultTimezone, LISTS_APPLICATION_ID)?.trim() || FALLBACK_SCHEDULE.Timezone,
    };
  }

  private async refreshActionIdAsync(): Promise<string> {
    const result = await RunView.FromMetadataProvider(this.provider).RunView<Pick<MJActionEntity, 'ID'>>({
      EntityName: 'MJ: Actions',
      ExtraFilter: `Name='${REFRESH_LIST_ACTION_NAME}'`,
      Fields: ['ID'],
      ResultType: 'simple',
    }, this.contextUser);
    if (!result.Success || result.Results.length === 0) {
      throw new Error(`Action '${REFRESH_LIST_ACTION_NAME}' not found — has the metadata seed been pushed?`);
    }
    return result.Results[0].ID;
  }
}
