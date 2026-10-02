import { UUIDsEqual } from '@memberjunction/global';
import type { MJDashboardEntity, MJDashboardUserPreferenceEntity } from '@memberjunction/core-entities';

const GLOBAL_SCOPE: MJDashboardUserPreferenceEntity['Scope'] = 'Global';
const CONFIG_TYPE: MJDashboardEntity['Type'] = 'Config';

/** The preference fields that Home tab selection reads. */
export interface HomeTabPreferenceLike {
  UserID: string | null;
  Scope: string;
  DashboardID: string;
  DisplayOrder: number;
}

/** The dashboard fields that decide whether a dashboard can show as a Home tab. */
export type HomeTabDashboardLike = Pick<MJDashboardEntity, 'ID' | 'Type'>;

/** A change to a user's Home tabs. */
export interface HomeTabChange {
  Action: 'Add' | 'Remove';
  DashboardID: string;
}

/** The writes that apply a {@link HomeTabChange}. */
export interface HomeTabChangePlan<T extends HomeTabPreferenceLike> {
  /** Rows to create for the user. */
  Create: Array<{ DashboardID: string; DisplayOrder: number }>;
  /** The user's rows to delete. */
  Delete: T[];
  /** The user's rows that move to a new DisplayOrder. */
  Reorder: Array<{ Row: T; DisplayOrder: number }>;
  /** True when the user must be marked customized after the row writes, so the defaults stop showing. */
  MarkCustomized: boolean;
}

/**
 * The preference rows that define a user's Home tabs: their own Global-scope rows when they have
 * any or when their tabs are customized, else the Global-scope system defaults (UserID null).
 * Sorted by DisplayOrder.
 * @param customized - True when the user is marked customized. A customized user with no rows has no tabs.
 */
export function SelectHomeTabPreferences<T extends HomeTabPreferenceLike>(
  prefs: ReadonlyArray<T>,
  userId: string,
  customized = false
): T[] {
  const global = prefs.filter(p => p.Scope === GLOBAL_SCOPE);
  const own = global.filter(p => p.UserID != null && UUIDsEqual(p.UserID, userId));
  const chosen = own.length > 0 || customized ? own : global.filter(p => p.UserID == null);
  return [...chosen].sort((a, b) => a.DisplayOrder - b.DisplayOrder);
}

/**
 * The dashboards to show as Home tabs, in preference order. Skips dashboards that are missing,
 * are not Config dashboards, or that the user cannot read. Lists each dashboard once.
 */
export function ResolveHomeTabDashboards<D extends HomeTabDashboardLike>(
  prefs: ReadonlyArray<Pick<HomeTabPreferenceLike, 'DashboardID'>>,
  dashboards: ReadonlyArray<D>,
  canRead: (dashboardId: string) => boolean
): D[] {
  const tabs: D[] = [];
  for (const pref of prefs) {
    const dashboard = dashboards.find(d => UUIDsEqual(d.ID, pref.DashboardID));
    if (!dashboard || dashboard.Type !== CONFIG_TYPE || !canRead(dashboard.ID)) continue;
    if (!tabs.some(t => UUIDsEqual(t.ID, dashboard.ID))) tabs.push(dashboard);
  }
  return tabs;
}

/**
 * The writes for a Home tab change. The user's rows end with DisplayOrder 1..n.
 * When the user sees the system defaults, the plan copies them into the user's own rows
 * (same order) and applies the change to that copy.
 * A user who is not yet customized is marked customized by any change, so a list that the
 * user empties stays empty.
 * @param customized - True when the user is already marked customized.
 * @returns The plan, or null when the change is already in effect.
 */
export function PlanHomeTabChange<T extends HomeTabPreferenceLike>(
  prefs: ReadonlyArray<T>,
  userId: string,
  change: HomeTabChange,
  customized = false
): HomeTabChangePlan<T> | null {
  const current = SelectHomeTabPreferences(prefs, userId, customized);
  const isTarget = (p: T): boolean => UUIDsEqual(p.DashboardID, change.DashboardID);
  const adding = change.Action === 'Add';
  if (adding === current.some(isTarget)) return null;
  const kept = adding ? current : current.filter(p => !isTarget(p));
  const added = adding ? [change.DashboardID] : [];
  const markCustomized = !customized;
  if (current.every(p => p.UserID == null)) {
    const create = numberedRows([...kept.map(p => p.DashboardID), ...added]);
    return { Create: create, Delete: [], Reorder: [], MarkCustomized: markCustomized };
  }
  return {
    Create: added.map(dashboardId => ({ DashboardID: dashboardId, DisplayOrder: kept.length + 1 })),
    Delete: adding ? [] : current.filter(isTarget),
    Reorder: kept
      .map((row, i) => ({ Row: row, DisplayOrder: i + 1 }))
      .filter(step => step.Row.DisplayOrder !== step.DisplayOrder),
    MarkCustomized: markCustomized,
  };
}

/** New rows for the given dashboards, numbered from 1 in the given order. */
function numberedRows(dashboardIds: string[]): HomeTabChangePlan<HomeTabPreferenceLike>['Create'] {
  return dashboardIds.map((dashboardId, i) => ({ DashboardID: dashboardId, DisplayOrder: i + 1 }));
}
