/**
 * @fileoverview Pure helpers for the dashboards pinned to Home: the type of a pin, the dashboard a pin opens, the
 * names dashboard pins show, and the list, filter and lookup of the Dashboards switcher.
 */
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import type { HomeAppPinnedItem } from '@memberjunction/ng-shared';
import { ResolveNamedRecord } from './home-agent-context';

/** A dashboard the Dashboards switcher lists: a pinned Config dashboard the user can open. */
export interface HomeSwitcherDashboard {
  ID: string;
  Name: string;
}

const KNOWN_PIN_TYPES = ['Dashboards', 'User Views', 'Queries', 'Reports', 'Records', 'Custom', 'Actions'];

/**
 * A pin's resource type: its stored ResourceType when that is a known type, else its configuration's resourceType,
 * else a type read from its configuration keys (legacy pins). Unknown pins keep what they stored.
 */
export function ResolvePinResourceType(pin: HomeAppPinnedItem): string {
  const config = pin.Configuration;
  if (KNOWN_PIN_TYPES.includes(pin.ResourceType)) return pin.ResourceType;
  const configType = config['resourceType'];
  if (typeof configType === 'string' && KNOWN_PIN_TYPES.includes(configType)) return configType;
  if (config['dashboardId']) return 'Dashboards';
  if (config['viewId']) return 'User Views';
  if (config['queryId']) return 'Queries';
  if (config['reportId']) return 'Reports';
  if ((config['Entity'] || config['entity']) && config['recordId']) return 'Records';
  if (config['actionId']) return 'Actions';
  if (config['navItemName']) return 'Custom';
  return pin.ResourceType;
}

/** The dashboard a Dashboards pin opens: its dashboardId, else its recordId (a pin of an app's default dashboard tab). Null for other pins. */
export function DashboardIdOfPin(pin: HomeAppPinnedItem): string | null {
  if (ResolvePinResourceType(pin) !== 'Dashboards') return null;
  const id = pin.Configuration['dashboardId'] ?? pin.Configuration['recordId'];
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/** The dashboard with this id (any letter case), or null. */
export function FindDashboard<T extends { ID: string }>(dashboards: readonly T[], dashboardId: string | null): T | null {
  return dashboardId ? dashboards.find(d => UUIDsEqual(d.ID, dashboardId)) ?? null : null;
}

/** True for a dashboard Home shows in its dashboard view: a Config dashboard. Code dashboards open in a tab. */
export function CanShowInHome(dashboard: Pick<MJDashboardEntity, 'Type'>): boolean {
  return dashboard.Type === 'Config';
}

/** The names dashboard pins show, by pin id. A pin whose dashboard is not in `dashboards` is left out and shows its stored name. */
export function BuildPinDashboardNames(pins: readonly HomeAppPinnedItem[], dashboards: readonly MJDashboardEntity[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const pin of pins) {
    const dashboard = FindDashboard(dashboards, DashboardIdOfPin(pin));
    if (dashboard) names.set(pin.Id, dashboard.Name);
  }
  return names;
}

/** The pinned Config dashboards in pin order, each once. Pins whose dashboard is not in `dashboards` are left out. */
export function BuildPinnedDashboards(pins: readonly HomeAppPinnedItem[], dashboards: readonly MJDashboardEntity[]): HomeSwitcherDashboard[] {
  const result: HomeSwitcherDashboard[] = [];
  for (const pin of pins) {
    const dashboard = FindDashboard(dashboards, DashboardIdOfPin(pin));
    if (dashboard && CanShowInHome(dashboard) && !FindDashboard(result, dashboard.ID)) {
      result.push({ ID: dashboard.ID, Name: dashboard.Name });
    }
  }
  return result;
}

/** The dashboards whose name contains `query` (case-insensitive). An empty query keeps them all. */
export function FilterSwitcherDashboards(dashboards: readonly HomeSwitcherDashboard[], query: string): HomeSwitcherDashboard[] {
  const needle = query.trim().toLowerCase();
  return needle ? dashboards.filter(d => d.Name.toLowerCase().includes(needle)) : [...dashboards];
}

/** A pinned dashboard by id (any letter case), else by name (exact, then partial). Null on a miss. */
export function ResolvePinnedDashboardReference(reference: string, dashboards: readonly HomeSwitcherDashboard[]): HomeSwitcherDashboard | null {
  return FindDashboard(dashboards, reference.trim()) ?? ResolveNamedRecord(reference, dashboards);
}
