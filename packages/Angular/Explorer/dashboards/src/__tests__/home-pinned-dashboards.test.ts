/**
 * Tests for the pinned-dashboard helpers of Home (`Home/home-pinned-dashboards.ts`): the type of a
 * pin, the dashboard a pin opens, the names dashboard pins show, the list and filter of the
 * Dashboards switcher, and how a reference by id or by name finds a pinned dashboard.
 */
import { describe, it, expect } from 'vitest';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import type { HomeAppPinnedItem } from '@memberjunction/ng-shared';
import {
  BuildPinDashboardNames,
  BuildPinnedDashboards,
  DashboardIdOfPin,
  FilterSwitcherDashboards,
  HomeSwitcherDashboard,
  ResolvePinnedDashboardReference,
  ResolvePinResourceType,
} from '../Home/home-pinned-dashboards';

const REVENUE_ID = 'D0000000-0000-4000-8000-000000000001';
const QUOTA_ID = 'D0000000-0000-4000-8000-000000000002';
const REVIEW_ID = 'D0000000-0000-4000-8000-000000000003';
const CODE_ID = 'D0000000-0000-4000-8000-000000000004';
const DYNAMIC_ID = 'D0000000-0000-4000-8000-000000000005';
const DELETED_ID = 'D0000000-0000-4000-8000-0000000000FF';
const LEGACY_RESOURCE_TYPE_ID = 'E1A3F2C4-7B8D-4E6F-9A0B-1C2D3E4F5A6B';

/** A dashboard as the dashboard cache holds it. */
const dashboard = (ID: string, Name: string, Type: MJDashboardEntity['Type'] = 'Config') =>
  ({ ID, Name, Type }) as unknown as MJDashboardEntity;

const REVENUE = dashboard(REVENUE_ID, 'Revenue');
const QUOTA = dashboard(QUOTA_ID, 'Quota');
const CUSTOM_CODE = dashboard(CODE_ID, 'Custom Code', 'Code');
const DYNAMIC_CODE = dashboard(DYNAMIC_ID, 'Live feed', 'Dynamic Code');
const CACHE = [REVENUE, QUOTA, CUSTOM_CODE, DYNAMIC_CODE];

/** A pin of `ResourceType` that stores `Configuration`. */
function pin(Id: string, DisplayName: string, ResourceType: string, Configuration: Record<string, unknown>): HomeAppPinnedItem {
  return { Id, DisplayName, ResourceType, Configuration, Sequence: 0, PinnedAt: '2026-10-01T00:00:00.000Z' };
}

/** The pin the Add to menu of a dashboard tab stores. */
const dashboardPin = (Id: string, dashboardId: string, DisplayName = 'Stored name') =>
  pin(Id, DisplayName, 'Dashboards', { resourceType: 'Dashboards', dashboardId, recordId: dashboardId });

/** The pin of an app's default dashboard tab: a recordId and no dashboardId. */
const appDefaultPin = (Id: string, recordId: string) =>
  pin(Id, 'Sales', 'Dashboards', { resourceType: 'Dashboards', recordId, appName: 'Sales', isAppDefault: true });

const QUERY_PIN = pin('P-QUERY', 'Open deals', 'Queries', { queryId: 'Q-1' });

describe('ResolvePinResourceType', () => {
  it('keeps a known stored type, whatever the configuration holds', () => {
    expect(ResolvePinResourceType(pin('P-1', 'Acme', 'Records', { dashboardId: REVENUE_ID }))).toBe('Records');
  });

  it("uses the configuration's resourceType when the stored type is not known", () => {
    expect(ResolvePinResourceType(pin('P-1', 'Deals', LEGACY_RESOURCE_TYPE_ID, { resourceType: 'User Views', dashboardId: REVENUE_ID }))).toBe('User Views');
  });

  it('reads the type of a legacy pin from its configuration keys, and keeps an unknown stored type', () => {
    const typeOf = (Configuration: Record<string, unknown>) => ResolvePinResourceType(pin('P-1', 'Legacy', LEGACY_RESOURCE_TYPE_ID, Configuration));
    expect(typeOf({ resourceType: 'Nope', dashboardId: REVENUE_ID })).toBe('Dashboards');
    expect(typeOf({ viewId: 'V-1' })).toBe('User Views');
    expect(typeOf({ queryId: 'Q-1' })).toBe('Queries');
    expect(typeOf({ reportId: 'R-1' })).toBe('Reports');
    expect(typeOf({ Entity: 'Accounts', recordId: 'A-1' })).toBe('Records');
    expect(typeOf({ entity: 'Accounts', recordId: 'A-1' })).toBe('Records');
    expect(typeOf({ actionId: 'X-1' })).toBe('Actions');
    expect(typeOf({ navItemName: 'Inbox' })).toBe('Custom');
    expect(typeOf({ recordId: 'A-1' })).toBe(LEGACY_RESOURCE_TYPE_ID);
  });
});

describe('DashboardIdOfPin', () => {
  it('reads the dashboardId of a dashboard pin', () => {
    expect(DashboardIdOfPin(dashboardPin('P-1', REVENUE_ID))).toBe(REVENUE_ID);
  });

  it('falls back to the recordId of a pin of an app default dashboard tab', () => {
    expect(DashboardIdOfPin(appDefaultPin('P-1', QUOTA_ID))).toBe(QUOTA_ID);
  });

  it('returns null for a Records pin, which also carries a recordId', () => {
    expect(DashboardIdOfPin(pin('P-1', 'Acme', 'Records', { Entity: 'Accounts', recordId: 'A-1' }))).toBeNull();
  });

  it('reads the dashboardId of a legacy pin that stored a UUID as its ResourceType', () => {
    expect(DashboardIdOfPin(pin('P-1', 'Revenue', LEGACY_RESOURCE_TYPE_ID, { dashboardId: REVENUE_ID }))).toBe(REVENUE_ID);
  });

  it('trims a padded id', () => {
    expect(DashboardIdOfPin(dashboardPin('P-1', `  ${REVENUE_ID} `))).toBe(REVENUE_ID);
  });

  it('returns null for an id that is not a string', () => {
    expect(DashboardIdOfPin(pin('P-1', 'Revenue', 'Dashboards', { dashboardId: 42 }))).toBeNull();
  });
});

describe('BuildPinnedDashboards', () => {
  it('lists the pinned dashboards in pin order', () => {
    const pins = [dashboardPin('P-1', QUOTA_ID), dashboardPin('P-2', REVENUE_ID)];
    expect(BuildPinnedDashboards(pins, CACHE)).toEqual([
      { ID: QUOTA_ID, Name: 'Quota' },
      { ID: REVENUE_ID, Name: 'Revenue' },
    ]);
  });

  it('lists only Config dashboards', () => {
    const pins = [dashboardPin('P-1', CODE_ID), dashboardPin('P-2', REVENUE_ID), dashboardPin('P-3', DYNAMIC_ID)];
    expect(BuildPinnedDashboards(pins, CACHE)).toEqual([{ ID: REVENUE_ID, Name: 'Revenue' }]);
  });

  it('lists a dashboard pinned twice once', () => {
    const pins = [dashboardPin('P-1', REVENUE_ID), appDefaultPin('P-2', REVENUE_ID.toLowerCase())];
    expect(BuildPinnedDashboards(pins, CACHE)).toEqual([{ ID: REVENUE_ID, Name: 'Revenue' }]);
  });

  it('leaves out pins whose dashboard is not in the cache', () => {
    const pins = [dashboardPin('P-1', DELETED_ID), QUERY_PIN, dashboardPin('P-2', REVENUE_ID)];
    expect(BuildPinnedDashboards(pins, CACHE)).toEqual([{ ID: REVENUE_ID, Name: 'Revenue' }]);
  });

  it('names each dashboard as the cache names it now, not as its pin stored it', () => {
    const renamed = dashboard(REVENUE_ID, 'Revenue FY27');
    expect(BuildPinnedDashboards([dashboardPin('P-1', REVENUE_ID, 'Revenue')], [renamed])).toEqual([{ ID: REVENUE_ID, Name: 'Revenue FY27' }]);
  });
});

describe('BuildPinDashboardNames', () => {
  it('maps each dashboard pin to its dashboard name, and leaves out other pins and missing dashboards', () => {
    const pins = [
      dashboardPin('P-1', REVENUE_ID, 'Old revenue name'),
      dashboardPin('P-2', CODE_ID, 'Old code name'),
      dashboardPin('P-3', DELETED_ID, 'Old board'),
      QUERY_PIN,
    ];
    expect([...BuildPinDashboardNames(pins, CACHE)]).toEqual([
      ['P-1', 'Revenue'],
      ['P-2', 'Custom Code'],
    ]);
  });
});

describe('FilterSwitcherDashboards', () => {
  const SWITCHER: HomeSwitcherDashboard[] = [
    { ID: REVENUE_ID, Name: 'Revenue' },
    { ID: QUOTA_ID, Name: 'Quota' },
    { ID: REVIEW_ID, Name: 'Pipeline review' },
  ];

  it('keeps the dashboards whose name contains the query, in any letter case', () => {
    expect(FilterSwitcherDashboards(SWITCHER, 'QUO').map(d => d.Name)).toEqual(['Quota']);
    expect(FilterSwitcherDashboards(SWITCHER, ' REV ').map(d => d.Name)).toEqual(['Revenue', 'Pipeline review']);
  });

  it('keeps every dashboard for a blank query, in a new array', () => {
    const all = FilterSwitcherDashboards(SWITCHER, '   ');
    expect(all).toEqual(SWITCHER);
    expect(all).not.toBe(SWITCHER);
    expect(FilterSwitcherDashboards(SWITCHER, '')).toEqual(SWITCHER);
  });
});

describe('ResolvePinnedDashboardReference', () => {
  const PINNED: HomeSwitcherDashboard[] = [
    { ID: REVENUE_ID, Name: 'Revenue' },
    { ID: REVIEW_ID, Name: 'Quota review' },
    { ID: QUOTA_ID, Name: 'Quota' },
  ];

  it('finds a dashboard by its id, in any letter case', () => {
    expect(ResolvePinnedDashboardReference(` ${REVENUE_ID.toLowerCase()} `, PINNED)).toBe(PINNED[0]);
  });

  it('finds a dashboard by its exact name before a partial match', () => {
    expect(ResolvePinnedDashboardReference('quota', PINNED)).toBe(PINNED[2]);
  });

  it('finds a dashboard by part of its name', () => {
    expect(ResolvePinnedDashboardReference('VENUE', PINNED)).toBe(PINNED[0]);
  });

  it('returns null when no id or name matches', () => {
    expect(ResolvePinnedDashboardReference('Margin', PINNED)).toBeNull();
    expect(ResolvePinnedDashboardReference('   ', PINNED)).toBeNull();
  });
});
