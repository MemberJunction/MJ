/**
 * Tests for the Home dashboard agent-context helpers
 * (`Home/home-agent-context.ts`):
 * - buildHomeAgentContext: state snapshot → agent context object
 * - resolveNamedRecord: tolerant exact→contains name resolution
 * - buildHomeNotFoundError: tolerant miss error with a bounded sample
 *
 * The helpers are pure (no Angular / component deps) so the context shape stays
 * deterministic and unit-testable, decoupled from change-detection timing.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildHomeAgentContext,
    BuildHomeNotFoundError,
    ResolveNamedRecord,
    HomeAgentContextInput,
    NamedRecord,
    HOME_AGENT_CONTEXT_NAME_LIST_CAP,
} from '../Home/home-agent-context';

/** A baseline snapshot with small, untruncated lists. */
function baseInput(overrides: Partial<HomeAgentContextInput> = {}): HomeAgentContextInput {
    return {
        AppCount: 2,
        VisibleAppCount: 2,
        AppNames: ['Data Explorer', 'Knowledge Hub'],
        PinnedItemCount: 1,
        PinGroupCount: 0,
        PinGroupNames: [],
        PinNames: ['My Dashboard'],
        UnreadNotifications: 3,
        NotificationTitles: [],
        RecentItemsCount: 5,
        RecentItems: [],
        EditMode: false,
        AddPanelOpen: false,
        SidebarOpen: false,
        AddPanelSearchQuery: '',
        ContinueDashboardName: null,
        FavoriteDashboardNames: [],
        DashboardTotal: 0,
        HomeTabNames: [],
        ActiveHomeTab: 'Overview',
        ActiveHomeTabDashboardID: null,
        DashboardsCollapsed: false,
        PinnedCollapsed: false,
        ...overrides,
    };
}

describe('buildHomeAgentContext', () => {
    it('reports the core launcher / pin / sidebar state', () => {
        const ctx = BuildHomeAgentContext(baseInput());
        expect(ctx['AppCount']).toBe(2);
        expect(ctx['VisibleAppCount']).toBe(2);
        expect(ctx['AvailableApps']).toEqual(['Data Explorer', 'Knowledge Hub']);
        expect(ctx['PinnedItemCount']).toBe(1);
        expect(ctx['PinGroupCount']).toBe(0);
        expect(ctx['PinnedItems']).toEqual(['My Dashboard']);
        expect(ctx['UnreadNotifications']).toBe(3);
        expect(ctx['RecentItemsCount']).toBe(5);
        expect(ctx['EditMode']).toBe(false);
        expect(ctx['AddPanelOpen']).toBe(false);
        expect(ctx['SidebarOpen']).toBe(false);
    });

    it('omits the panel search query when the panel is closed', () => {
        const ctx = BuildHomeAgentContext(baseInput({ AddPanelOpen: false, AddPanelSearchQuery: 'dash' }));
        expect('AddPanelSearchQuery' in ctx).toBe(false);
    });

    it('omits the panel search query when the panel is open but the query is empty', () => {
        const ctx = BuildHomeAgentContext(baseInput({ AddPanelOpen: true, AddPanelSearchQuery: '' }));
        expect('AddPanelSearchQuery' in ctx).toBe(false);
    });

    it('surfaces the panel search query when the panel is open and a query exists', () => {
        const ctx = BuildHomeAgentContext(baseInput({ AddPanelOpen: true, AddPanelSearchQuery: 'dash' }));
        expect(ctx['AddPanelSearchQuery']).toBe('dash');
    });

    it('caps the app name list and surfaces the true total when truncated', () => {
        const appNames = Array.from({ length: HOME_AGENT_CONTEXT_NAME_LIST_CAP + 5 }, (_, i) => `App ${i}`);
        const ctx = BuildHomeAgentContext(baseInput({ AppNames: appNames, AppCount: appNames.length }));
        expect((ctx['AvailableApps'] as string[]).length).toBe(HOME_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['AvailableAppCount']).toBe(appNames.length);
    });

    it('does not add the app total-count field when the list is within the cap', () => {
        const ctx = BuildHomeAgentContext(baseInput());
        expect('AvailableAppCount' in ctx).toBe(false);
    });

    it('caps the pin name list and surfaces the true total when truncated', () => {
        const pinNames = Array.from({ length: HOME_AGENT_CONTEXT_NAME_LIST_CAP + 2 }, (_, i) => `Pin ${i}`);
        const ctx = BuildHomeAgentContext(baseInput({ PinNames: pinNames, PinnedItemCount: pinNames.length }));
        expect((ctx['PinnedItems'] as string[]).length).toBe(HOME_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['PinnedItemNameCount']).toBe(pinNames.length);
    });

    it('publishes pin group names when present', () => {
        const ctx = BuildHomeAgentContext(baseInput({ PinGroupCount: 2, PinGroupNames: ['Work', 'Personal'] }));
        expect(ctx['PinGroupNames']).toEqual(['Work', 'Personal']);
    });

    it('omits pin group names when there are no groups', () => {
        const ctx = BuildHomeAgentContext(baseInput({ PinGroupNames: [] }));
        expect('PinGroupNames' in ctx).toBe(false);
    });

    it('publishes bounded notification titles when there are unread notifications', () => {
        const ctx = BuildHomeAgentContext(baseInput({ NotificationTitles: ['Sync done', 'New comment'] }));
        expect(ctx['NotificationTitles']).toEqual(['Sync done', 'New comment']);
    });

    it('publishes structured recent-item summaries (bounded)', () => {
        const ctx = BuildHomeAgentContext(baseInput({
            RecentItems: [
                { Name: 'Q2 Report', ResourceType: 'dashboard' },
                { Name: 'Active Users', ResourceType: 'view' },
            ],
        }));
        expect(ctx['RecentItems']).toEqual([
            { Name: 'Q2 Report', ResourceType: 'dashboard' },
            { Name: 'Active Users', ResourceType: 'view' },
        ]);
    });

    it('caps the recent-item list and surfaces the true total when truncated', () => {
        const recents = Array.from({ length: HOME_AGENT_CONTEXT_NAME_LIST_CAP + 4 }, (_, i) => ({ Name: `R${i}`, ResourceType: 'record' }));
        const ctx = BuildHomeAgentContext(baseInput({ RecentItems: recents }));
        expect((ctx['RecentItems'] as unknown[]).length).toBe(HOME_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['RecentItemNameCount']).toBe(recents.length);
    });

    it('reports whether the Dashboards strip and the Pinned section are collapsed', () => {
        const dashboardsOnly = BuildHomeAgentContext(baseInput({ DashboardsCollapsed: true, PinnedCollapsed: false }));
        expect(dashboardsOnly['DashboardsCollapsed']).toBe(true);
        expect(dashboardsOnly['PinnedCollapsed']).toBe(false);

        const pinnedOnly = BuildHomeAgentContext(baseInput({ DashboardsCollapsed: false, PinnedCollapsed: true }));
        expect(pinnedOnly['DashboardsCollapsed']).toBe(false);
        expect(pinnedOnly['PinnedCollapsed']).toBe(true);
    });

    it('reflects edit mode and sidebar/panel toggles', () => {
        const ctx = BuildHomeAgentContext(baseInput({ EditMode: true, SidebarOpen: true, AddPanelOpen: true }));
        expect(ctx['EditMode']).toBe(true);
        expect(ctx['SidebarOpen']).toBe(true);
        expect(ctx['AddPanelOpen']).toBe(true);
    });

    it('reports the Dashboards strip: the total, the Continue dashboard and the favorite dashboards', () => {
        const ctx = BuildHomeAgentContext(baseInput({
            DashboardTotal: 7,
            ContinueDashboardName: 'Board Pack',
            FavoriteDashboardNames: ['Partner KPIs', 'Revenue'],
        }));
        expect(ctx['DashboardTotal']).toBe(7);
        expect(ctx['ContinueDashboardName']).toBe('Board Pack');
        expect(ctx['FavoriteDashboardNames']).toEqual(['Partner KPIs', 'Revenue']);
        expect('FavoriteDashboardNameCount' in ctx).toBe(false);
    });

    it('omits the Continue dashboard and the favorite dashboards when there are none', () => {
        const ctx = BuildHomeAgentContext(baseInput());
        expect(ctx['DashboardTotal']).toBe(0);
        expect('ContinueDashboardName' in ctx).toBe(false);
        expect('FavoriteDashboardNames' in ctx).toBe(false);
    });

    it('caps the favorite dashboard names and surfaces the true total when truncated', () => {
        const names = Array.from({ length: HOME_AGENT_CONTEXT_NAME_LIST_CAP + 3 }, (_, i) => `Dashboard ${i}`);
        const ctx = BuildHomeAgentContext(baseInput({ FavoriteDashboardNames: names }));
        expect((ctx['FavoriteDashboardNames'] as string[]).length).toBe(HOME_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['FavoriteDashboardNameCount']).toBe(names.length);
    });

    it('reports the Home tabs and the active tab by name and dashboard id', () => {
        const ctx = BuildHomeAgentContext(baseInput({
            HomeTabNames: ['Sales pipeline', 'Ops health'],
            ActiveHomeTab: 'Ops health',
            ActiveHomeTabDashboardID: 'D1000000-0000-4000-8000-00000000000B',
        }));
        expect(ctx['HomeTabNames']).toEqual(['Sales pipeline', 'Ops health']);
        expect(ctx['ActiveHomeTab']).toBe('Ops health');
        expect(ctx['ActiveHomeTabDashboardID']).toBe('D1000000-0000-4000-8000-00000000000B');
    });

    it('reports Overview as the active tab with no dashboard id, and omits an empty tab list', () => {
        const ctx = BuildHomeAgentContext(baseInput());
        expect(ctx['ActiveHomeTab']).toBe('Overview');
        expect('ActiveHomeTabDashboardID' in ctx).toBe(false);
        expect('HomeTabNames' in ctx).toBe(false);
    });

    it('caps the Home tab names and surfaces the true total when truncated', () => {
        const names = Array.from({ length: HOME_AGENT_CONTEXT_NAME_LIST_CAP + 1 }, (_, i) => `Tab ${i}`);
        const ctx = BuildHomeAgentContext(baseInput({ HomeTabNames: names }));
        expect((ctx['HomeTabNames'] as string[]).length).toBe(HOME_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['HomeTabNameCount']).toBe(names.length);
    });
});

describe('resolveNamedRecord', () => {
    const candidates: NamedRecord[] = [
        { Name: 'Data Explorer' },
        { Name: 'Knowledge Hub' },
        { Name: 'My Sales Dashboard' },
    ];

    it('resolves by exact name (case-insensitive, trimmed)', () => {
        expect(ResolveNamedRecord('  data explorer ', candidates)?.Name).toBe('Data Explorer');
    });

    it('falls back to a partial (contains) match', () => {
        expect(ResolveNamedRecord('Sales', candidates)?.Name).toBe('My Sales Dashboard');
    });

    it('returns null on a miss and on empty input', () => {
        expect(ResolveNamedRecord('Nope', candidates)).toBeNull();
        expect(ResolveNamedRecord('   ', candidates)).toBeNull();
    });
});

describe('buildHomeNotFoundError', () => {
    it('lists a bounded sample of available names with the kind label', () => {
        const candidates: NamedRecord[] = [{ Name: 'Data Explorer' }, { Name: 'Knowledge Hub' }];
        const msg = BuildHomeNotFoundError('Foo', 'app', candidates);
        expect(msg).toContain('No app named "Foo"');
        expect(msg).toContain('Data Explorer');
        expect(msg).toContain('Knowledge Hub');
    });

    it('handles an empty candidate list', () => {
        expect(BuildHomeNotFoundError('Foo', 'pinned item', [])).toContain('(none)');
    });
});
