/**
 * @fileoverview The user's recently opened dashboards, for Browse (Recently opened), Overview
 * (Continue) and the Home Dashboards strip.
 *
 * The list comes from UserInfoEngine's cache of the user's MJ: User Record Logs, which holds every
 * record the user has opened, so it lists every opened dashboard, not only the dashboards among
 * the latest records of any entity.
 *
 * Opening a dashboard saves a record log (RecentAccessService.LogAccess). UserInfoEngine reloads
 * its record-log cache after that save (a debounced reload, about 1.5 seconds later) and then emits
 * DataChange$. ObserveRecentDashboardChanges emits at that moment, so a caller that re-reads then
 * shows the new open.
 */
import type { EngineDataChangeEvent, IMetadataProvider } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

/** The entity whose record logs are dashboard opens. */
export const DASHBOARDS_ENTITY_NAME = 'MJ: Dashboards';

const USER_RECORD_LOGS_ENTITY_NAME = 'MJ: User Record Logs';

/** A record log, as far as dashboard recents need it. */
export interface DashboardRecordLog {
  RecordID: string;
  LatestAt: Date;
}

/** The part of UserInfoEngine the dashboard recents read. UserInfoEngine satisfies it. */
export interface DashboardRecentsSource {
  readonly IsPermissionConstrained: boolean;
  readonly DataChange$: Observable<EngineDataChangeEvent>;
  GetRecentRecordsForEntity(entityId: string, maxItems?: number): ReadonlyArray<DashboardRecordLog>;
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
 * The ids of the dashboards the current user opened, most recent first, at most `maxItems` (all
 * of them when omitted). Reads the record-log cache of `source`; the MJ: Dashboards entity id
 * comes from `provider`'s metadata. Returns an empty list when that entity is unknown or the user
 * cannot read the record logs.
 */
export function GetRecentDashboardIds(
  provider: IMetadataProvider,
  maxItems?: number,
  source: DashboardRecentsSource = UserInfoEngine.Instance
): string[] {
  const dashboardsEntity = provider.EntityByName(DASHBOARDS_ENTITY_NAME);
  if (!dashboardsEntity || source.IsPermissionConstrained) {
    return [];
  }
  return OrderRecentDashboardIds(source.GetRecentRecordsForEntity(dashboardsEntity.ID, Number.MAX_SAFE_INTEGER), maxItems);
}

/** Emits each time the record-log cache of `source` changes, which is when a new dashboard open can be read. */
export function ObserveRecentDashboardChanges(source: DashboardRecentsSource = UserInfoEngine.Instance): Observable<void> {
  return source.DataChange$.pipe(
    filter(IsRecordLogChange),
    map(() => undefined)
  );
}

/** True when an engine change event is for the MJ: User Record Logs cache. */
export function IsRecordLogChange(event: EngineDataChangeEvent): boolean {
  return (event.config.EntityName ?? '').trim().toLowerCase() === USER_RECORD_LOGS_ENTITY_NAME.toLowerCase();
}

/** Milliseconds since the epoch, or 0 for a missing or invalid date. */
function timeOf(value: Date): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
