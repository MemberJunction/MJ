/**
 * @fileoverview Pure logic for the dashboard tabs on Home: which tab an id names, when the open
 * tab's dashboard viewer is kept, rebuilt or waits, how an agent names a tab, and keyboard focus
 * in the tab row.
 */
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { ResolveNamedRecord } from './home-agent-context';

/** The id of Home's Overview tab. Each dashboard tab uses its dashboard's ID. */
export const HOME_OVERVIEW_TAB_ID = 'overview';

/** The label of Home's Overview tab. */
export const HOME_OVERVIEW_TAB_NAME = 'Overview';

/** The dashboard values a Home tab's viewer is built from. */
export type HomeTabViewSource = Pick<MJDashboardEntity, 'ID' | 'Name' | 'UIConfigDetails'>;

/** The dashboard viewer on the open Home tab, with a copy of the values it was built from. */
export interface HomeTabView extends HomeTabViewSource {
  /** Changes each time the viewer must be created again. */
  Key: number;
  /** The dashboard object the viewer shows. */
  Dashboard: MJDashboardEntity;
}

/** What Home does with the open tab's viewer: keep it, build it now, or wait until the tab container has a size. */
export type HomeTabViewPlan = 'keep' | 'build' | 'wait';

/** A Home tab by id and name. The Overview tab has the id {@link HOME_OVERVIEW_TAB_ID}. */
export interface HomeTabReference {
  ID: string;
  Name: string;
}

/** True when `tabId` is the Overview tab (any letter case) or empty. */
export function IsHomeOverviewTab(tabId: string | null | undefined): boolean {
  const id = tabId?.trim() ?? '';
  return id === '' || id.toLowerCase() === HOME_OVERVIEW_TAB_ID;
}

/** The tab whose dashboard ID is `tabId`, or null for Overview and for an id that is not in the list. */
export function FindHomeTab<D extends Pick<MJDashboardEntity, 'ID'>>(tabs: readonly D[], tabId: string): D | null {
  if (IsHomeOverviewTab(tabId)) {
    return null;
  }
  return tabs.find(tab => UUIDsEqual(tab.ID, tabId)) ?? null;
}

/**
 * A viewer for the dashboard. It copies the id, name and layout, because an edit saved in the
 * dashboard tab changes the same object in place, and only a copy shows that change.
 */
export function CreateHomeTabView(dashboard: MJDashboardEntity, key: number): HomeTabView {
  return { Key: key, Dashboard: dashboard, ID: dashboard.ID, Name: dashboard.Name, UIConfigDetails: dashboard.UIConfigDetails };
}

/**
 * Plans the viewer for the open tab's dashboard `current`.
 * - keep: the viewer `built` shows this dashboard with the same name and layout. A reload returns
 *   new objects with equal values, and those do not rebuild the panels.
 * - wait: this dashboard changed, but Home's tab container has no size (Home is hidden), so a new
 *   viewer could not lay out its panels yet.
 * - build: otherwise. The first viewer of a tab, and a different dashboard, build at once.
 * @param built - the values the current viewer was built from, or null when there is no viewer
 * @param containerHasSize - whether Home's tab container has a size, or null when it is not rendered
 */
export function PlanHomeTabView(built: HomeTabViewSource | null, current: HomeTabViewSource, containerHasSize: boolean | null): HomeTabViewPlan {
  if (built && UUIDsEqual(built.ID, current.ID)) {
    if (built.Name === current.Name && built.UIConfigDetails === current.UIConfigDetails) {
      return 'keep';
    }
    if (containerHasSize === false) {
      return 'wait';
    }
  }
  return 'build';
}

/**
 * Resolves a reference to a Home tab: "Overview", a dashboard ID, or a dashboard name (exact before
 * partial, any letter case). Returns null when nothing matches.
 */
export function ResolveHomeTabReference(
  reference: string,
  tabs: readonly Pick<MJDashboardEntity, 'ID' | 'Name'>[]
): HomeTabReference | null {
  const needle = reference.trim();
  if (!needle) {
    return null;
  }
  const byId = tabs.find(tab => UUIDsEqual(tab.ID, needle));
  if (byId) {
    return { ID: byId.ID, Name: byId.Name };
  }
  const candidates: HomeTabReference[] = [
    { ID: HOME_OVERVIEW_TAB_ID, Name: HOME_OVERVIEW_TAB_NAME },
    ...tabs.map(tab => ({ ID: tab.ID, Name: tab.Name })),
  ];
  return ResolveNamedRecord(needle, candidates);
}

/**
 * The index of the tab that gets focus after `key` in a row of `count` tabs: ArrowRight and ArrowLeft
 * move one tab and wrap, Home and End go to the first and last tab. Returns null for other keys.
 * A negative `current` counts as the first tab.
 */
export function NextHomeTabFocusIndex(key: string, current: number, count: number): number | null {
  if (count === 0) {
    return null;
  }
  const from = Math.max(current, 0);
  switch (key) {
    case 'ArrowRight':
      return (from + 1) % count;
    case 'ArrowLeft':
      return (from - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
