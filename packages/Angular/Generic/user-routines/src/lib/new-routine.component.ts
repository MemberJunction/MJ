import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { CompositeKey, IMetadataProvider, RunView } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJUserRoutineEntity, MJUserRoutineRecipientEntity, UserRoutineEngine } from '@memberjunction/core-entities';
import {
    BuildCronExpression,
    CRON_DAY_NAMES,
    CronPresetKind,
    CronSchedule,
    DescribeCronExpression,
    IsPlausibleCronExpression,
    NormalizeUUID,
    ParseCronExpression,
} from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AfterNodeSelectEventArgs, TreeBranchConfig, TreeLeafConfig } from '@memberjunction/ng-trees';
import {
    FromDateTimeLocal,
    GetLocalTimezone,
    GetTimezoneOptions,
    IsPlausibleEmail,
    ParseSkillIDs,
    SerializeSkillIDs,
    ToDateTimeLocal,
    ValidateOptionalJson,
} from './routine-ui-helpers';
import { LoadRoutineTargetCatalog, RoutineSkillOption, RoutineTargetCatalog } from './routine-target-catalog';
import { AfterRoutineCreatedEventArgs, BeforeRoutineCreatedEventArgs } from './user-routines-events';

/** One editable recipient row (existing rows carry their entity for update/delete). */
interface RecipientRow {
    Entity: MJUserRoutineRecipientEntity | null;
    Mode: 'user' | 'email';
    UserID: string | null;
    Email: string;
    Channel: MJUserRoutineRecipientEntity['Channel'];
}

/** Minimal user shape for the recipient user picker. */
interface UserOption {
    ID: string;
    Name: string;
    Email: string | null;
}

/**
 * Create/edit form for a User Routine. Routines run an AI AGENT on a schedule
 * (TargetType is implicitly 'Agent') — the agent is chosen from a categorical tree
 * grouped by Agent Category, showing each agent's own IconClass, with Realtime-type
 * agents excluded (interactive-only). Also covers the initial message, optional JSON
 * payload, AI Skills pre-activation, cron presets + advanced escape hatch, IANA
 * timezone, activation window, notification settings, and the ordered recipients list.
 *
 * Reusable (Generic) component: no Router, no page chrome. The host mounts it
 * (slide-in / dialog / inline), passes `RoutineID` (null = create), and reacts to
 * `Saved` / `Cancelled` plus the cancelable `BeforeRoutineCreated` /
 * `AfterRoutineCreated` pair for new routines. All persistence flows through MJ
 * entity objects with explicit `Save()` boolean checks; failures surface
 * `LatestResult.CompleteMessage`. Cached routine/recipient data comes from
 * {@link UserRoutineEngine}.
 */
@Component({
    standalone: false,
    selector: 'mj-new-routine',
    templateUrl: './new-routine.component.html',
    styleUrls: ['./new-routine.component.css'],
})
export class NewRoutineComponent extends BaseAngularComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private notifications = inject(MJNotificationService);

    // ---------------------------------------------------------------
    // Inputs / Outputs
    // ---------------------------------------------------------------
    private _routineID: string | null = null;
    /** ID of the routine to edit, or null to create a new one. */
    @Input()
    public set RoutineID(value: string | null) {
        if (value !== this._routineID) {
            this._routineID = value;
            if (this.initialized) {
                void this.reload();
            }
        }
    }
    public get RoutineID(): string | null {
        return this._routineID;
    }

    /** Emitted after a successful save (routine + recipients persisted) — create AND edit. */
    @Output() Saved = new EventEmitter<MJUserRoutineEntity>();
    /** Emitted when the user cancels without saving. */
    @Output() Cancelled = new EventEmitter<void>();
    /** Cancelable: fires before a NEW routine is saved for the first time. */
    @Output() BeforeRoutineCreated = new EventEmitter<BeforeRoutineCreatedEventArgs>();
    /** Informational: fires after a new routine (and its recipients) was persisted. */
    @Output() AfterRoutineCreated = new EventEmitter<AfterRoutineCreatedEventArgs>();

    // ---------------------------------------------------------------
    // Form state
    // ---------------------------------------------------------------
    public Name = '';
    public Description = '';
    /** The selected agent's ID (TargetType is implicitly 'Agent'). */
    public TargetID: string | null = null;
    public InitialMessage = '';
    public StartingPayloadText = '';
    public SelectedSkillIDs: string[] = [];
    public RoutineType: MJUserRoutineEntity['RoutineType'] = 'Scheduled';

    public ScheduleKind: CronPresetKind = 'daily';
    /** Minute past each hour for the hourly preset. */
    public ScheduleMinute = 0;
    /** "HH:MM" run time for daily/weekly/monthly presets. */
    public ScheduleTime = '09:00';
    public ScheduleDayOfWeek = 1;
    public ScheduleDayOfMonth = 1;
    public RawCron = '';

    public Timezone: string = GetLocalTimezone();
    public StartAtLocal = '';
    public EndAtLocal = '';

    public NotifyCondition: MJUserRoutineEntity['NotifyCondition'] = 'Always';
    public NotifyViaInApp = true;
    public NotifyViaEmail = false;
    public Recipients: RecipientRow[] = [];

    // ---------------------------------------------------------------
    // Options / status
    // ---------------------------------------------------------------
    public Catalog: RoutineTargetCatalog | null = null;
    public UserOptions: UserOption[] = [];
    public TimezoneOptions: string[] = GetTimezoneOptions();
    public IsLoading = true;
    public IsSaving = false;
    public ValidationErrors: string[] = [];

    /** Tree config for the agent-category branches. */
    public AgentTreeBranchConfig: TreeBranchConfig = {
        EntityName: 'MJ: AI Agent Categories',
        DisplayField: 'Name',
        ParentIDField: 'ParentID',
        DefaultIcon: 'fa-solid fa-folder',
        OrderBy: 'Name ASC',
    };
    /** Tree config for the pickable agents (built at load time — excludes Realtime types). */
    public AgentTreeLeafConfig: TreeLeafConfig | undefined;
    /** Tree selection binding (single agent). */
    public SelectedAgentIDs: string[] = [];

    public readonly DayNames = CRON_DAY_NAMES;
    public readonly DayOfWeekOptions = CRON_DAY_NAMES.map((name, i) => ({ text: name, value: i }));
    public readonly DayOfMonthOptions = Array.from({ length: 31 }, (_, i) => ({ text: `${i + 1}`, value: i + 1 }));
    public readonly ScheduleKindOptions: Array<{ Value: CronPresetKind; Label: string }> = [
        { Value: 'hourly', Label: 'Hourly' },
        { Value: 'daily', Label: 'Daily' },
        { Value: 'weekly', Label: 'Weekly' },
        { Value: 'monthly', Label: 'Monthly' },
        { Value: 'advanced', Label: 'Advanced (cron)' },
    ];
    public readonly NotifyConditionOptions = [
        { text: 'Always — after every run', value: 'Always' },
        { text: 'On success only', value: 'OnSuccess' },
        { text: 'On failure only', value: 'OnFailure' },
        { text: 'On change — when the result differs from the prior run', value: 'OnChange' },
    ];
    public readonly ChannelOptions = [
        { text: 'In-app', value: 'InApp' },
        { text: 'Email', value: 'Email' },
    ];
    public readonly RecipientModeOptions = [
        { text: 'MJ user', value: 'user' },
        { text: 'External email', value: 'email' },
    ];

    private editingEntity: MJUserRoutineEntity | null = null;
    private deletedRecipients: MJUserRoutineRecipientEntity[] = [];
    private initialized = false;

    async ngOnInit(): Promise<void> {
        this.initialized = true;
        await this.reload();
    }

    /** True when editing an existing routine (vs. creating a new one). */
    public get IsEdit(): boolean {
        return this._routineID != null;
    }

    /** Active skills available for pre-activation. */
    public get SkillOptions(): RoutineSkillOption[] {
        return this.Catalog?.Skills ?? [];
    }

    /** Name of the currently selected agent (empty when none). */
    public get SelectedAgentName(): string {
        if (!this.TargetID) {
            return '';
        }
        return this.Catalog?.NameByID.get(NormalizeUUID(this.TargetID)) ?? '';
    }

    /** IconClass of the currently selected agent (robot fallback). */
    public get SelectedAgentIcon(): string {
        if (!this.TargetID) {
            return 'fa-solid fa-robot';
        }
        return this.Catalog?.IconByID.get(NormalizeUUID(this.TargetID)) ?? 'fa-solid fa-robot';
    }

    /** Live human-readable preview of the schedule being built. */
    public get SchedulePreview(): string {
        return DescribeCronExpression(this.buildCron());
    }

    /** Helper text under the RoutineType toggle. */
    public get RoutineTypeHelp(): string {
        return this.RoutineType === 'Scheduled'
            ? 'Runs on the schedule and notifies per the notification condition.'
            : 'Runs on the schedule and hashes each result — pair with the "On change" condition to be notified only when the result changes.';
    }

    /** Handles agent selection from the category tree (leaf nodes only). */
    /** The selected agent as a CompositeKey for the tree-dropdown's Value binding. */
    public get SelectedAgentKey(): CompositeKey | null {
        return this.TargetID ? CompositeKey.FromID(this.TargetID) : null;
    }

    public OnAgentNodeSelected(args: AfterNodeSelectEventArgs): void {
        if (args.Node.Type === 'leaf') {
            this.TargetID = args.Node.ID;
            this.SelectedAgentIDs = [args.Node.ID];
            this.cdr.markForCheck();
        }
    }

    public SetScheduleKind(kind: CronPresetKind): void {
        if (kind === this.ScheduleKind) {
            return;
        }
        if (kind === 'advanced' && !this.RawCron.trim()) {
            // Seed the advanced box from the current preset so nothing is lost
            this.RawCron = this.buildCron();
        }
        this.ScheduleKind = kind;
        this.cdr.markForCheck();
    }

    /** Toggles a skill in/out of the RequestedSkillIDs selection. */
    public ToggleSkill(skillID: string): void {
        const index = this.SelectedSkillIDs.indexOf(skillID);
        if (index >= 0) {
            this.SelectedSkillIDs = this.SelectedSkillIDs.filter((id) => id !== skillID);
        } else {
            this.SelectedSkillIDs = [...this.SelectedSkillIDs, skillID];
        }
        this.cdr.markForCheck();
    }

    public IsSkillSelected(skillID: string): boolean {
        return this.SelectedSkillIDs.includes(skillID);
    }

    // ---------------------------------------------------------------
    // Recipients
    // ---------------------------------------------------------------
    public AddRecipient(): void {
        this.Recipients = [
            ...this.Recipients,
            { Entity: null, Mode: 'user', UserID: null, Email: '', Channel: 'InApp' },
        ];
        void this.ensureUserOptions();
    }

    public RemoveRecipient(index: number): void {
        const row = this.Recipients[index];
        if (row?.Entity) {
            this.deletedRecipients.push(row.Entity);
        }
        this.Recipients = this.Recipients.filter((_, i) => i !== index);
    }

    /** Moves a recipient up/down — the saved Sequence is the row index. */
    public MoveRecipient(index: number, delta: -1 | 1): void {
        const target = index + delta;
        if (target < 0 || target >= this.Recipients.length) {
            return;
        }
        const next = [...this.Recipients];
        [next[index], next[target]] = [next[target], next[index]];
        this.Recipients = next;
    }

    /** When the row's mode flips, clear the other identity field. */
    public OnRecipientModeChange(row: RecipientRow): void {
        if (row.Mode === 'user') {
            row.Email = '';
            void this.ensureUserOptions();
        } else {
            row.UserID = null;
        }
    }

    // ---------------------------------------------------------------
    // Save / cancel
    // ---------------------------------------------------------------
    public Cancel(): void {
        this.Cancelled.emit();
    }

    public async Save(): Promise<void> {
        if (this.IsSaving) {
            return;
        }
        this.ValidationErrors = this.validate();
        if (this.ValidationErrors.length > 0) {
            this.cdr.markForCheck();
            return;
        }

        this.IsSaving = true;
        this.cdr.markForCheck();
        try {
            const p = this.ProviderToUse;
            const isNew = !this.IsEdit;
            const routine =
                this.editingEntity ??
                (await p.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', p.CurrentUser));
            if (isNew) {
                routine.UserID = p.CurrentUser.ID;
            }

            routine.Name = this.Name.trim();
            routine.Description = this.Description.trim() || null;
            routine.RoutineType = this.RoutineType;
            routine.TargetType = 'Agent';
            // Validated non-null in validate()
            routine.TargetID = this.TargetID as string;
            routine.InitialMessage = this.InitialMessage.trim() || null;
            routine.StartingPayload = this.StartingPayloadText.trim() || null;
            routine.RequestedSkillIDs = SerializeSkillIDs(this.SelectedSkillIDs);
            routine.CronExpression = this.buildCron();
            routine.Timezone = this.Timezone;
            routine.StartAt = FromDateTimeLocal(this.StartAtLocal);
            routine.EndAt = FromDateTimeLocal(this.EndAtLocal);
            routine.NotifyCondition = this.NotifyCondition;
            routine.NotifyViaInApp = this.NotifyViaInApp;
            routine.NotifyViaEmail = this.NotifyViaEmail;

            if (isNew) {
                const beforeArgs = new BeforeRoutineCreatedEventArgs(routine);
                this.BeforeRoutineCreated.emit(beforeArgs);
                if (beforeArgs.Cancel) {
                    return;
                }
            }

            const saved = await routine.Save();
            if (!saved) {
                this.ValidationErrors = [
                    `Save failed: ${routine.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                ];
                return;
            }

            const recipientErrors = await this.saveRecipients(routine);
            if (recipientErrors.length > 0) {
                this.ValidationErrors = recipientErrors;
                return;
            }

            if (isNew) {
                // Re-scope the engine's dependent (recipients/runs) configs to include
                // the new routine — their client-side filter is a Config-time snapshot.
                await this.engine().Refresh(p.CurrentUser);
                this.AfterRoutineCreated.emit(new AfterRoutineCreatedEventArgs(routine));
            }

            this.notifications.CreateSimpleNotification(
                isNew ? `'${routine.Name}' created` : `'${routine.Name}' updated`,
                'success',
                3000
            );
            this.Saved.emit(routine);
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    // ---------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------
    private engine(): UserRoutineEngine {
        return UserRoutineEngine.GetProviderInstance<UserRoutineEngine>(this.ProviderToUse, UserRoutineEngine) as UserRoutineEngine;
    }

    private async reload(): Promise<void> {
        this.IsLoading = true;
        this.ValidationErrors = [];
        this.deletedRecipients = [];
        this.cdr.markForCheck();
        try {
            const p = this.ProviderToUse;
            const [catalog] = await Promise.all([
                LoadRoutineTargetCatalog(p),
                this.engine().Config(false, p.CurrentUser, p),
            ]);
            this.Catalog = catalog;
            this.buildAgentTreeConfig(p);
            if (this._routineID) {
                await this.loadExisting(this._routineID);
            } else {
                this.resetForNew();
            }
            if (this.Recipients.some((r) => r.Mode === 'user')) {
                await this.ensureUserOptions();
            }
        } catch (e) {
            this.ValidationErrors = [
                `Failed to load the editor: ${e instanceof Error ? e.message : 'unknown error'}`,
            ];
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Builds the agent tree leaf config: Active, root-level agents only, EXCLUDING
     * agents whose type is the Realtime agent type. The exclusion is expressed as an
     * inline NOT IN list of type IDs resolved from metadata BY NAME (never hardcoded).
     */
    private buildAgentTreeConfig(provider: IMetadataProvider): void {
        const realtimeTypeIDs = this.resolveRealtimeTypeIDs(provider);
        const filters = [`Status='Active'`, `ParentID IS NULL`];
        if (realtimeTypeIDs.length > 0) {
            const inList = realtimeTypeIDs.map((id) => `'${id}'`).join(',');
            filters.push(`(TypeID IS NULL OR TypeID NOT IN (${inList}))`);
        }
        this.AgentTreeLeafConfig = {
            EntityName: 'MJ: AI Agents',
            ParentField: 'CategoryID',
            DisplayField: 'Name',
            IconField: 'IconClass',
            DefaultIcon: 'fa-solid fa-robot',
            ExtraFilter: filters.join(' AND '),
            OrderBy: 'Name ASC',
        };
    }

    /** Realtime agent-type IDs resolved from the cached AI metadata by type NAME. */
    private resolveRealtimeTypeIDs(provider: IMetadataProvider): string[] {
        // The catalog load above already Config'd AIEngineBase for this provider —
        // reuse its cached AgentTypes through the provider-scoped instance.
        const engine = AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
        return engine.AgentTypes
            .filter((t) => t.Name?.trim().toLowerCase() === 'realtime')
            .map((t) => t.ID);
    }

    private resetForNew(): void {
        this.editingEntity = null;
        this.Name = '';
        this.Description = '';
        this.TargetID = null;
        this.SelectedAgentIDs = [];
        this.InitialMessage = '';
        this.StartingPayloadText = '';
        this.SelectedSkillIDs = [];
        this.RoutineType = 'Scheduled';
        this.ScheduleKind = 'daily';
        this.ScheduleMinute = 0;
        this.ScheduleTime = '09:00';
        this.ScheduleDayOfWeek = 1;
        this.ScheduleDayOfMonth = 1;
        this.RawCron = '';
        this.Timezone = GetLocalTimezone();
        this.StartAtLocal = '';
        this.EndAtLocal = '';
        this.NotifyCondition = 'Always';
        this.NotifyViaInApp = true;
        this.NotifyViaEmail = false;
        this.Recipients = [];
    }

    private async loadExisting(routineID: string): Promise<void> {
        const p = this.ProviderToUse;
        // Prefer the engine's cached entity; fall back to a direct load (e.g., deep link
        // into a routine saved elsewhere before the cache refreshed).
        let routine = this.engine().GetRoutineByID(routineID) ?? null;
        if (!routine) {
            const loadedEntity = await p.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', p.CurrentUser);
            const loaded = await loadedEntity.Load(routineID);
            routine = loaded ? loadedEntity : null;
        }
        if (!routine) {
            this.ValidationErrors = [`Routine ${routineID} could not be loaded.`];
            this.resetForNew();
            return;
        }
        this.editingEntity = routine;
        this.Name = routine.Name;
        this.Description = routine.Description ?? '';
        this.TargetID = routine.TargetID;
        this.SelectedAgentIDs = routine.TargetID ? [routine.TargetID] : [];
        this.InitialMessage = routine.InitialMessage ?? '';
        this.StartingPayloadText = routine.StartingPayload ?? '';
        this.SelectedSkillIDs = ParseSkillIDs(routine.RequestedSkillIDs);
        this.RoutineType = routine.RoutineType;
        this.applyCron(ParseCronExpression(routine.CronExpression));
        this.Timezone = routine.Timezone;
        this.StartAtLocal = ToDateTimeLocal(routine.StartAt);
        this.EndAtLocal = ToDateTimeLocal(routine.EndAt);
        this.NotifyCondition = routine.NotifyCondition;
        this.NotifyViaInApp = routine.NotifyViaInApp;
        this.NotifyViaEmail = routine.NotifyViaEmail;
        this.loadRecipientRows(routineID);
    }

    private applyCron(schedule: CronSchedule): void {
        this.ScheduleKind = schedule.Kind;
        this.ScheduleMinute = schedule.Minute;
        this.ScheduleTime = `${schedule.Hour.toString().padStart(2, '0')}:${schedule.Minute.toString().padStart(2, '0')}`;
        this.ScheduleDayOfWeek = schedule.DayOfWeek;
        this.ScheduleDayOfMonth = schedule.DayOfMonth;
        this.RawCron = schedule.Raw;
    }

    private buildCron(): string {
        const { hour, minute } = this.parseScheduleTime();
        const schedule: CronSchedule = {
            Kind: this.ScheduleKind,
            Minute: this.ScheduleKind === 'hourly' ? this.clampMinute(this.ScheduleMinute) : minute,
            Hour: hour,
            DayOfWeek: this.ScheduleDayOfWeek,
            DayOfMonth: this.ScheduleDayOfMonth,
            Raw: this.RawCron,
        };
        return BuildCronExpression(schedule);
    }

    private parseScheduleTime(): { hour: number; minute: number } {
        const match = /^(\d{1,2}):(\d{2})$/.exec(this.ScheduleTime.trim());
        if (!match) {
            return { hour: 9, minute: 0 };
        }
        return {
            hour: Math.min(23, Math.max(0, parseInt(match[1], 10))),
            minute: this.clampMinute(parseInt(match[2], 10)),
        };
    }

    private clampMinute(minute: number): number {
        return Math.min(59, Math.max(0, Math.round(minute ?? 0)));
    }

    /** Builds the editable recipient rows from the engine's cached recipients. */
    private loadRecipientRows(routineID: string): void {
        this.Recipients = this.engine()
            .RecipientsForRoutine(routineID)
            .map((entity) => ({
                Entity: entity,
                Mode: entity.UserID ? ('user' as const) : ('email' as const),
                UserID: entity.UserID,
                Email: entity.Email ?? '',
                Channel: entity.Channel,
            }));
    }

    /** Lazily loads the user picker options the first time a user-mode row exists. */
    private async ensureUserOptions(): Promise<void> {
        if (this.UserOptions.length > 0) {
            return;
        }
        const p = this.ProviderToUse;
        const rv = RunView.FromMetadataProvider(p);
        const result = await rv.RunView<UserOption>(
            {
                EntityName: 'MJ: Users',
                Fields: ['ID', 'Name', 'Email'],
                ExtraFilter: `IsActive=1`,
                OrderBy: 'Name ASC',
                ResultType: 'simple',
            },
            p.CurrentUser
        );
        if (result.Success) {
            this.UserOptions = result.Results ?? [];
            this.cdr.markForCheck();
        }
    }

    private validate(): string[] {
        const errors: string[] = [];
        if (!this.Name.trim()) {
            errors.push('Name is required.');
        }
        if (!this.TargetID) {
            errors.push('Select the agent this routine should run.');
        }
        if (this.ScheduleKind === 'advanced' && !IsPlausibleCronExpression(this.RawCron)) {
            errors.push('The advanced cron expression must have 5 (or 6) space-separated fields.');
        }
        if (!this.Timezone?.trim()) {
            errors.push('Timezone is required.');
        }
        const payloadCheck = ValidateOptionalJson(this.StartingPayloadText);
        if (!payloadCheck.Valid) {
            errors.push(`Starting payload is not valid JSON: ${payloadCheck.Error}`);
        }
        const startAt = FromDateTimeLocal(this.StartAtLocal);
        const endAt = FromDateTimeLocal(this.EndAtLocal);
        if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
            errors.push('End of the activation window must be after its start.');
        }
        this.Recipients.forEach((row, i) => {
            if (row.Mode === 'user' && !row.UserID) {
                errors.push(`Recipient ${i + 1}: choose a user (or switch the row to an external email).`);
            }
            if (row.Mode === 'email' && !IsPlausibleEmail(row.Email)) {
                errors.push(`Recipient ${i + 1}: enter a valid email address.`);
            }
        });
        return errors;
    }

    /** Persists recipient rows in order (Sequence = index) and deletes removed rows. */
    private async saveRecipients(routine: MJUserRoutineEntity): Promise<string[]> {
        const p = this.ProviderToUse;
        const errors: string[] = [];

        for (const entity of this.deletedRecipients) {
            const deleted = await entity.Delete();
            if (!deleted) {
                errors.push(
                    `Failed to remove a recipient: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`
                );
            }
        }
        this.deletedRecipients = [];

        for (let i = 0; i < this.Recipients.length; i++) {
            const row = this.Recipients[i];
            const entity =
                row.Entity ??
                (await p.GetEntityObject<MJUserRoutineRecipientEntity>('MJ: User Routine Recipients', p.CurrentUser));
            entity.RoutineID = routine.ID;
            entity.UserID = row.Mode === 'user' ? row.UserID : null;
            entity.Email = row.Mode === 'email' ? row.Email.trim() : null;
            entity.Channel = row.Channel;
            entity.Sequence = i;
            const saved = await entity.Save();
            if (saved) {
                row.Entity = entity;
            } else {
                errors.push(
                    `Failed to save recipient ${i + 1}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`
                );
            }
        }
        return errors;
    }
}
