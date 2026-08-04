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
    buildHomeAgentContext,
    buildHomeNotFoundError,
    resolveNamedRecord,
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
        ...overrides,
    };
}

describe('buildHomeAgentContext', () => {
    it('reports the core launcher / pin / sidebar state', () => {
        const ctx = buildHomeAgentContext(baseInput());
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
        const ctx = buildHomeAgentContext(baseInput({ AddPanelOpen: false, AddPanelSearchQuery: 'dash' }));
        expect('AddPanelSearchQuery' in ctx).toBe(false);
    });

    it('omits the panel search query when the panel is open but the query is empty', () => {
        const ctx = buildHomeAgentContext(baseInput({ AddPanelOpen: true, AddPanelSearchQuery: '' }));
        expect('AddPanelSearchQuery' in ctx).toBe(false);
    });

    it('surfaces the panel search query when the panel is open and a query exists', () => {
        const ctx = buildHomeAgentContext(baseInput({ AddPanelOpen: true, AddPanelSearchQuery: 'dash' }));
        expect(ctx['AddPanelSearchQuery']).toBe('dash');
    });

    it('caps the app name list and surfaces the true total when truncated', () => {
        const appNames = Array.from({ length: HOME_AGENT_CONTEXT_NAME_LIST_CAP + 5 }, (_, i) => `App ${i}`);
        const ctx = buildHomeAgentContext(baseInput({ AppNames: appNames, AppCount: appNames.length }));
        expect((ctx['AvailableApps'] as string[]).length).toBe(HOME_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['AvailableAppCount']).toBe(appNames.length);
    });

    it('does not add the app total-count field when the list is within the cap', () => {
        const ctx = buildHomeAgentContext(baseInput());
        expect('AvailableAppCount' in ctx).toBe(false);
    });

    it('caps the pin name list and surfaces the true total when truncated', () => {
        const pinNames = Array.from({ length: HOME_AGENT_CONTEXT_NAME_LIST_CAP + 2 }, (_, i) => `Pin ${i}`);
        const ctx = buildHomeAgentContext(baseInput({ PinNames: pinNames, PinnedItemCount: pinNames.length }));
        expect((ctx['PinnedItems'] as string[]).length).toBe(HOME_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['PinnedItemNameCount']).toBe(pinNames.length);
    });

    it('publishes pin group names when present', () => {
        const ctx = buildHomeAgentContext(baseInput({ PinGroupCount: 2, PinGroupNames: ['Work', 'Personal'] }));
        expect(ctx['PinGroupNames']).toEqual(['Work', 'Personal']);
    });

    it('omits pin group names when there are no groups', () => {
        const ctx = buildHomeAgentContext(baseInput({ PinGroupNames: [] }));
        expect('PinGroupNames' in ctx).toBe(false);
    });

    it('publishes bounded notification titles when there are unread notifications', () => {
        const ctx = buildHomeAgentContext(baseInput({ NotificationTitles: ['Sync done', 'New comment'] }));
        expect(ctx['NotificationTitles']).toEqual(['Sync done', 'New comment']);
    });

    it('publishes structured recent-item summaries (bounded)', () => {
        const ctx = buildHomeAgentContext(baseInput({
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
        const ctx = buildHomeAgentContext(baseInput({ RecentItems: recents }));
        expect((ctx['RecentItems'] as unknown[]).length).toBe(HOME_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['RecentItemNameCount']).toBe(recents.length);
    });

    it('reflects edit mode and sidebar/panel toggles', () => {
        const ctx = buildHomeAgentContext(baseInput({ EditMode: true, SidebarOpen: true, AddPanelOpen: true }));
        expect(ctx['EditMode']).toBe(true);
        expect(ctx['SidebarOpen']).toBe(true);
        expect(ctx['AddPanelOpen']).toBe(true);
    });
});

describe('resolveNamedRecord', () => {
    const candidates: NamedRecord[] = [
        { Name: 'Data Explorer' },
        { Name: 'Knowledge Hub' },
        { Name: 'My Sales Dashboard' },
    ];

    it('resolves by exact name (case-insensitive, trimmed)', () => {
        expect(resolveNamedRecord('  data explorer ', candidates)?.Name).toBe('Data Explorer');
    });

    it('falls back to a partial (contains) match', () => {
        expect(resolveNamedRecord('Sales', candidates)?.Name).toBe('My Sales Dashboard');
    });

    it('returns null on a miss and on empty input', () => {
        expect(resolveNamedRecord('Nope', candidates)).toBeNull();
        expect(resolveNamedRecord('   ', candidates)).toBeNull();
    });
});

describe('buildHomeNotFoundError', () => {
    it('lists a bounded sample of available names with the kind label', () => {
        const candidates: NamedRecord[] = [{ Name: 'Data Explorer' }, { Name: 'Knowledge Hub' }];
        const msg = buildHomeNotFoundError('Foo', 'app', candidates);
        expect(msg).toContain('No app named "Foo"');
        expect(msg).toContain('Data Explorer');
        expect(msg).toContain('Knowledge Hub');
    });

    it('handles an empty candidate list', () => {
        expect(buildHomeNotFoundError('Foo', 'pinned item', [])).toContain('(none)');
    });
});
