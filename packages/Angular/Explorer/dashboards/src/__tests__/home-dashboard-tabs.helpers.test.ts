import { describe, it, expect } from 'vitest';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import {
  CreateHomeTabView,
  FindHomeTab,
  HOME_OVERVIEW_TAB_ID,
  IsHomeOverviewTab,
  NextHomeTabFocusIndex,
  PlanHomeTabView,
  ResolveHomeTabReference,
} from '../Home/home-dashboard-tabs.helpers';

const d = (ID: string, Name: string, UIConfigDetails: string | null = '{"layout":null}') =>
  ({ ID, Name, UIConfigDetails } as unknown as MJDashboardEntity);

const SALES = d('D1000000-0000-4000-8000-00000000000A', 'Sales pipeline');
const OPS = d('D1000000-0000-4000-8000-00000000000B', 'Ops health');
const TABS = [SALES, OPS];

describe('IsHomeOverviewTab', () => {
  it('is true for the Overview id in any letter case, and for no id', () => {
    for (const id of [HOME_OVERVIEW_TAB_ID, 'Overview', ' OVERVIEW ', '', '  ', null, undefined]) {
      expect(IsHomeOverviewTab(id)).toBe(true);
    }
  });

  it('is false for a dashboard id', () => {
    expect(IsHomeOverviewTab(SALES.ID)).toBe(false);
  });
});

describe('FindHomeTab', () => {
  it('finds the tab with the dashboard id, in any letter case', () => {
    expect(FindHomeTab(TABS, OPS.ID.toLowerCase())).toBe(OPS);
  });

  it('is null for Overview and for an id that is not in the list', () => {
    expect(FindHomeTab(TABS, HOME_OVERVIEW_TAB_ID)).toBeNull();
    expect(FindHomeTab(TABS, '')).toBeNull();
    expect(FindHomeTab(TABS, 'D1000000-0000-4000-8000-0000000000FF')).toBeNull();
  });
});

describe('CreateHomeTabView', () => {
  it('copies the id, name and layout the viewer is built from, with the key', () => {
    const view = CreateHomeTabView(SALES, 7);
    expect(view).toEqual({ Key: 7, Dashboard: SALES, ID: SALES.ID, Name: 'Sales pipeline', UIConfigDetails: '{"layout":null}' });
  });

  it('keeps the copied values when the dashboard object is edited in place later', () => {
    const dashboard = d(SALES.ID, SALES.Name);
    const view = CreateHomeTabView(dashboard, 1);
    (dashboard as unknown as { UIConfigDetails: string }).UIConfigDetails = '{"layout":{"root":null}}';
    expect(view.UIConfigDetails).toBe('{"layout":null}');
    expect(view.Dashboard).toBe(dashboard);
  });
});

describe('PlanHomeTabView', () => {
  const built = CreateHomeTabView(SALES, 1);

  it('keeps the viewer when the dashboard has the name and layout it was built from, even as a new object', () => {
    const reloaded = d(SALES.ID.toLowerCase(), SALES.Name);
    expect(PlanHomeTabView(built, reloaded, true)).toBe('keep');
    expect(PlanHomeTabView(built, reloaded, false)).toBe('keep');
  });

  it('builds a viewer at once when there is none yet or the tab shows another dashboard', () => {
    expect(PlanHomeTabView(null, SALES, null)).toBe('build');
    expect(PlanHomeTabView(null, SALES, false)).toBe('build');
    expect(PlanHomeTabView(built, OPS, false)).toBe('build');
  });

  it('rebuilds when the layout or the name differs from what the viewer was built from', () => {
    expect(PlanHomeTabView(built, d(SALES.ID, SALES.Name, '{"layout":{"root":null}}'), true)).toBe('build');
    expect(PlanHomeTabView(built, d(SALES.ID, 'Pipeline'), true)).toBe('build');
  });

  it('waits to rebuild while the tab container has no size, and rebuilds when it is not rendered', () => {
    const edited = d(SALES.ID, SALES.Name, '{"layout":{"root":null}}');
    expect(PlanHomeTabView(built, edited, false)).toBe('wait');
    expect(PlanHomeTabView(built, edited, null)).toBe('build');
  });
});

describe('ResolveHomeTabReference', () => {
  it('resolves Overview in any letter case', () => {
    expect(ResolveHomeTabReference(' overview ', TABS)).toEqual({ ID: HOME_OVERVIEW_TAB_ID, Name: 'Overview' });
  });

  it('resolves a dashboard id in any letter case', () => {
    expect(ResolveHomeTabReference(OPS.ID.toLowerCase(), TABS)).toEqual({ ID: OPS.ID, Name: 'Ops health' });
  });

  it('resolves a dashboard name, exact before partial', () => {
    expect(ResolveHomeTabReference('sales pipeline', TABS)).toEqual({ ID: SALES.ID, Name: 'Sales pipeline' });
    expect(ResolveHomeTabReference('health', TABS)).toEqual({ ID: OPS.ID, Name: 'Ops health' });
  });

  it('is null on a miss and for an empty reference', () => {
    expect(ResolveHomeTabReference('Revenue', TABS)).toBeNull();
    expect(ResolveHomeTabReference('   ', TABS)).toBeNull();
  });
});

describe('NextHomeTabFocusIndex', () => {
  it('moves right and left, and wraps at both ends', () => {
    expect(NextHomeTabFocusIndex('ArrowRight', 0, 3)).toBe(1);
    expect(NextHomeTabFocusIndex('ArrowRight', 2, 3)).toBe(0);
    expect(NextHomeTabFocusIndex('ArrowLeft', 1, 3)).toBe(0);
    expect(NextHomeTabFocusIndex('ArrowLeft', 0, 3)).toBe(2);
  });

  it('moves to the first tab on Home and to the last on End', () => {
    expect(NextHomeTabFocusIndex('Home', 2, 3)).toBe(0);
    expect(NextHomeTabFocusIndex('End', 0, 3)).toBe(2);
  });

  it('starts from the first tab when focus is not on a tab', () => {
    expect(NextHomeTabFocusIndex('ArrowRight', -1, 3)).toBe(1);
    expect(NextHomeTabFocusIndex('ArrowLeft', -1, 3)).toBe(2);
  });

  it('is null for other keys and when there are no tabs', () => {
    expect(NextHomeTabFocusIndex('Enter', 0, 3)).toBeNull();
    expect(NextHomeTabFocusIndex('ArrowDown', 0, 3)).toBeNull();
    expect(NextHomeTabFocusIndex('ArrowRight', 0, 0)).toBeNull();
  });
});
