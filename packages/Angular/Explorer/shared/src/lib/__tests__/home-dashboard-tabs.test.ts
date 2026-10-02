import { describe, it, expect } from 'vitest';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { PlanHomeTabChange, ResolveHomeTabDashboards, SelectHomeTabPreferences } from '../home-dashboard-tabs';

const pref = (o: { UserID: string | null; Scope: string; DashboardID: string; DisplayOrder: number; ApplicationID?: string | null }) =>
  ({ ApplicationID: null, ...o });

describe('SelectHomeTabPreferences', () => {
  it('returns the user\'s own Global rows ordered by DisplayOrder', () => {
    const prefs = [
      pref({ UserID: 'u1', Scope: 'Global', DashboardID: 'b', DisplayOrder: 2 }),
      pref({ UserID: 'u1', Scope: 'Global', DashboardID: 'a', DisplayOrder: 1 }),
      pref({ UserID: null, Scope: 'Global', DashboardID: 'sys', DisplayOrder: 1 }),
    ];
    expect(SelectHomeTabPreferences(prefs, 'u1').map(p => p.DashboardID)).toEqual(['a', 'b']);
  });

  it('falls back to system defaults when the user has no rows', () => {
    const prefs = [
      pref({ UserID: null, Scope: 'Global', DashboardID: 'sys2', DisplayOrder: 2 }),
      pref({ UserID: null, Scope: 'Global', DashboardID: 'sys1', DisplayOrder: 1 }),
      pref({ UserID: 'u2', Scope: 'Global', DashboardID: 'other', DisplayOrder: 1 }),
    ];
    expect(SelectHomeTabPreferences(prefs, 'u1').map(p => p.DashboardID)).toEqual(['sys1', 'sys2']);
  });

  it('ignores App-scope rows entirely', () => {
    const prefs = [pref({ UserID: 'u1', Scope: 'App', DashboardID: 'x', DisplayOrder: 1, ApplicationID: 'app' })];
    expect(SelectHomeTabPreferences(prefs, 'u1')).toEqual([]);
  });

  it('shows no defaults to a customized user who has no rows', () => {
    const prefs = [pref({ UserID: null, Scope: 'Global', DashboardID: 'sys', DisplayOrder: 1 })];
    expect(SelectHomeTabPreferences(prefs, 'u1', true)).toEqual([]);
  });

  it('returns a customized user\'s own rows ordered by DisplayOrder', () => {
    const prefs = [
      pref({ UserID: 'u1', Scope: 'Global', DashboardID: 'b', DisplayOrder: 2 }),
      pref({ UserID: 'u1', Scope: 'Global', DashboardID: 'a', DisplayOrder: 1 }),
      pref({ UserID: null, Scope: 'Global', DashboardID: 'sys', DisplayOrder: 1 }),
    ];
    expect(SelectHomeTabPreferences(prefs, 'u1', true).map(p => p.DashboardID)).toEqual(['a', 'b']);
  });
});

describe('ResolveHomeTabDashboards', () => {
  const dash = (ID: string, Type: MJDashboardEntity['Type'] = 'Config') => ({ ID, Type });
  const canReadAll = () => true;

  it('returns the dashboards in preference order and skips missing ones', () => {
    const prefs = [{ DashboardID: 'b' }, { DashboardID: 'missing' }, { DashboardID: 'a' }];
    const tabs = ResolveHomeTabDashboards(prefs, [dash('a'), dash('b')], canReadAll);
    expect(tabs.map(d => d.ID)).toEqual(['b', 'a']);
  });

  it('keeps only Config dashboards', () => {
    const prefs = [{ DashboardID: 'config' }, { DashboardID: 'code' }, { DashboardID: 'dynamic' }];
    const dashboards = [dash('config'), dash('code', 'Code'), dash('dynamic', 'Dynamic Code')];
    expect(ResolveHomeTabDashboards(prefs, dashboards, canReadAll).map(d => d.ID)).toEqual(['config']);
  });

  it('skips dashboards the user cannot read', () => {
    const prefs = [{ DashboardID: 'mine' }, { DashboardID: 'hidden' }];
    const tabs = ResolveHomeTabDashboards(prefs, [dash('mine'), dash('hidden')], id => !UUIDsEqual(id, 'hidden'));
    expect(tabs.map(d => d.ID)).toEqual(['mine']);
  });

  it('matches ids case-insensitively and lists each dashboard once', () => {
    const prefs = [{ DashboardID: 'ABC' }, { DashboardID: 'abc' }];
    expect(ResolveHomeTabDashboards(prefs, [dash('abc')], canReadAll).map(d => d.ID)).toEqual(['abc']);
  });
});

describe('PlanHomeTabChange', () => {
  const defaults = [
    pref({ UserID: null, Scope: 'Global', DashboardID: 'sys2', DisplayOrder: 20 }),
    pref({ UserID: null, Scope: 'Global', DashboardID: 'sys1', DisplayOrder: 10 }),
  ];
  const noise = [
    pref({ UserID: 'u2', Scope: 'Global', DashboardID: 'other', DisplayOrder: 1 }),
    pref({ UserID: 'u1', Scope: 'App', DashboardID: 'app-dash', DisplayOrder: 1, ApplicationID: 'app' }),
  ];

  describe('when the user sees the system defaults', () => {
    it('copies the defaults in order, adds the new tab, and marks the user customized', () => {
      expect(PlanHomeTabChange([...defaults, ...noise], 'u1', { Action: 'Add', DashboardID: 'new' })).toEqual({
        Create: [
          { DashboardID: 'sys1', DisplayOrder: 1 },
          { DashboardID: 'sys2', DisplayOrder: 2 },
          { DashboardID: 'new', DisplayOrder: 3 },
        ],
        Delete: [],
        Reorder: [],
        MarkCustomized: true,
      });
    });

    it('copies the defaults without the removed tab', () => {
      expect(PlanHomeTabChange([...defaults, ...noise], 'u1', { Action: 'Remove', DashboardID: 'sys1' })).toEqual({
        Create: [{ DashboardID: 'sys2', DisplayOrder: 1 }],
        Delete: [],
        Reorder: [],
        MarkCustomized: true,
      });
    });

    it('removes the only default by marking the user customized, with no rows to write', () => {
      const only = [pref({ UserID: null, Scope: 'Global', DashboardID: 'sys', DisplayOrder: 1 })];
      expect(PlanHomeTabChange(only, 'u1', { Action: 'Remove', DashboardID: 'sys' }))
        .toEqual({ Create: [], Delete: [], Reorder: [], MarkCustomized: true });
    });

    it('creates one row when there are no defaults', () => {
      expect(PlanHomeTabChange(noise, 'u1', { Action: 'Add', DashboardID: 'new' })?.Create)
        .toEqual([{ DashboardID: 'new', DisplayOrder: 1 }]);
    });

    it('returns null when adding a default or removing a dashboard that is not a tab', () => {
      expect(PlanHomeTabChange(defaults, 'u1', { Action: 'Add', DashboardID: 'sys2' })).toBeNull();
      expect(PlanHomeTabChange(defaults, 'u1', { Action: 'Remove', DashboardID: 'nope' })).toBeNull();
    });
  });

  describe('when the user is customized and has no rows', () => {
    it('ignores the defaults and creates the first row', () => {
      expect(PlanHomeTabChange(defaults, 'u1', { Action: 'Add', DashboardID: 'x' }, true))
        .toEqual({ Create: [{ DashboardID: 'x', DisplayOrder: 1 }], Delete: [], Reorder: [], MarkCustomized: false });
    });

    it('returns null when removing a default, because the defaults are not the user\'s tabs', () => {
      expect(PlanHomeTabChange(defaults, 'u1', { Action: 'Remove', DashboardID: 'sys1' }, true)).toBeNull();
    });
  });

  describe('when the user has own rows', () => {
    const a = pref({ UserID: 'u1', Scope: 'Global', DashboardID: 'a', DisplayOrder: 1 });
    const b = pref({ UserID: 'u1', Scope: 'Global', DashboardID: 'b', DisplayOrder: 2 });
    const c = pref({ UserID: 'u1', Scope: 'Global', DashboardID: 'c', DisplayOrder: 3 });

    it('appends the new tab after the user\'s rows and ignores the defaults', () => {
      expect(PlanHomeTabChange([b, a, ...defaults, ...noise], 'u1', { Action: 'Add', DashboardID: 'd' }, true))
        .toEqual({ Create: [{ DashboardID: 'd', DisplayOrder: 3 }], Delete: [], Reorder: [], MarkCustomized: false });
    });

    it('deletes the removed row and closes the gap in DisplayOrder', () => {
      expect(PlanHomeTabChange([a, b, c, ...defaults], 'u1', { Action: 'Remove', DashboardID: 'b' }, true))
        .toEqual({ Create: [], Delete: [b], Reorder: [{ Row: c, DisplayOrder: 2 }], MarkCustomized: false });
    });

    it('deletes the last row, and the defaults do not come back for a customized user', () => {
      const last = pref({ UserID: 'u1', Scope: 'Global', DashboardID: 'sys2', DisplayOrder: 1 });
      expect(PlanHomeTabChange([...defaults, last], 'u1', { Action: 'Remove', DashboardID: 'sys2' }, true))
        .toEqual({ Create: [], Delete: [last], Reorder: [], MarkCustomized: false });
      expect(SelectHomeTabPreferences(defaults, 'u1', true)).toEqual([]);
    });

    it('marks a user who has rows but no marker on the first change', () => {
      expect(PlanHomeTabChange([a, b], 'u1', { Action: 'Add', DashboardID: 'd' })?.MarkCustomized).toBe(true);
    });

    it('renumbers rows with gaps before appending', () => {
      const late = pref({ UserID: 'u1', Scope: 'Global', DashboardID: 'late', DisplayOrder: 7 });
      const plan = PlanHomeTabChange([a, late], 'u1', { Action: 'Add', DashboardID: 'd' }, true);
      expect(plan?.Reorder).toEqual([{ Row: late, DisplayOrder: 2 }]);
      expect(plan?.Create).toEqual([{ DashboardID: 'd', DisplayOrder: 3 }]);
    });

    it('deletes every row for the removed dashboard, matching ids case-insensitively', () => {
      const dupe = pref({ UserID: 'U1', Scope: 'Global', DashboardID: 'B', DisplayOrder: 4 });
      const plan = PlanHomeTabChange([a, b, c, dupe], 'u1', { Action: 'Remove', DashboardID: 'b' }, true);
      expect(plan?.Delete).toEqual([b, dupe]);
      expect(plan?.Reorder).toEqual([{ Row: c, DisplayOrder: 2 }]);
    });

    it('returns null when adding a tab the user already has', () => {
      expect(PlanHomeTabChange([a, b], 'u1', { Action: 'Add', DashboardID: 'A' }, true)).toBeNull();
    });
  });
});
