/**
 * @fileoverview The user's recently opened dashboards, for the Library (its order and Recently
 * opened).
 *
 * The list comes from a query of the user's MJ: User Record Logs for the MJ: Dashboards entity, so it
 * lists every dashboard the user opened, not only the dashboards among the latest records of any
 * entity. Record logs are not cached, so the list is read again each time it can have changed.
 *
 * Opening a dashboard saves a record log (RecentAccessService.LogAccess). The service then reloads its
 * recent items and emits RecentItems, after the log is saved. ObserveRecentDashboardIds reads the list
 * again each time its trigger emits, so a caller that passes RecentItems shows the new open.
 */
import { LogError, RunView } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/** The entity whose record logs are dashboard opens. */
export const DASHBOARDS_ENTITY_NAME = 'MJ: Dashboards';

const USER_RECORD_LOGS_ENTITY_NAME = 'MJ: User Record Logs';

/** A record log, as far as dashboard recents need it. A simple RunView row can carry `LatestAt` as text. */
export interface DashboardRecordLog {
  RecordID: string;
  LatestAt: Date | string;
}

/**
 * The record ids of `logs`, most recently opened first, each id once (compared with UUIDsEqual,
 * keeping the newest), at most `maxItems` of them. Logs without a record id are skipped.
 */
export function OrderRecentDashboardIds(logs: ReadonlyArray<DashboardRecordLog>, maxItems: number = Number.POSITIVE_INFINITY): string[] {
  const newestFirst = [...logs].sort((a, b) => timeOf(b.LatestAt) - timeOf(a.LatestAt));
  const ids: string[] = [];
  for (const log of newestFirst) {
    if (ids.length >= maxItems) {
      break;
    }
    if (log.RecordID && !ids.some(id => UUIDsEqual(id, log.RecordID))) {
      ids.push(log.RecordID);
    }
  }
  return ids;
}

/**
 * Loads the ids of the dashboards the current user of `provider` opened, most recent first, at most
 * `maxItems` (all of them when omitted), with one query of the user's MJ: User Record Logs for the
 * MJ: Dashboards entity. Returns an empty list when the metadata has no MJ: Dashboards entity, there
 * is no current user, or the query fails or throws (for example when the user cannot read the record
 * logs, or the server cannot be reached). A failed or thrown read is logged; it never rejects.
 */
export async function LoadRecentDashboardIds(provider: IMetadataProvider, maxItems?: number): Promise<string[]> {
  const dashboardsEntity = provider.EntityByName(DASHBOARDS_ENTITY_NAME);
  const user = provider.CurrentUser;
  if (!dashboardsEntity || !user) {
    return [];
  }
  try {
    const result = await RunView.FromMetadataProvider(provider).RunView<DashboardRecordLog>({
      EntityName: USER_RECORD_LOGS_ENTITY_NAME,
      ExtraFilter: `UserID='${EscapeSQLString(user.ID)}' AND EntityID='${EscapeSQLString(dashboardsEntity.ID)}'`,
      OrderBy: 'LatestAt DESC',
      Fields: ['RecordID', 'LatestAt'],
      ResultType: 'simple',
    });
    if (!result.Success) {
      LogError(`Recently opened dashboards could not be read: ${result.ErrorMessage}`);
      return [];
    }
    return OrderRecentDashboardIds(result.Results, maxItems);
  } catch (error) {
    LogError(`Recently opened dashboards could not be read: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Emits the ids of the dashboards the current user opened (see {@link LoadRecentDashboardIds}) each
 * time `trigger` emits, read again each time. A read that a newer emission overtakes is dropped.
 * With the default `load`, a read that fails or throws gives an empty list, so the stream keeps running.
 *
 * @param provider The provider whose metadata and current user the read uses.
 * @param trigger Emits when the list can have changed, for example RecentAccessService.RecentItems,
 *   which emits after a dashboard open is logged.
 * @param load Reads the ids. The default is {@link LoadRecentDashboardIds}.
 */
export function ObserveRecentDashboardIds(
  provider: IMetadataProvider,
  trigger: Observable<unknown>,
  load: (provider: IMetadataProvider) => Promise<string[]> = LoadRecentDashboardIds
): Observable<string[]> {
  return trigger.pipe(switchMap(() => from(load(provider))));
}

/** Milliseconds since the epoch, or 0 for a missing or invalid date. */
function timeOf(value: Date | string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
