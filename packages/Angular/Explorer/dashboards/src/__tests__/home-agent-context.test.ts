/**
 * Tests for the Home dashboard agent-context shaping helper
 * (`Home/home-agent-context.ts`).
 *
 * The helper is pure (no Angular / component deps) so the context shape stays
 * deterministic and unit-testable, decoupled from change-detection timing.
 */
import { describe, it, expect } from 'vitest';
import {
    buildHomeAgentContext,
    HomeAgentContextInput,
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
        PinNames: ['My Dashboard'],
        UnreadNotifications: 3,
        RecentItemsCount: 5,
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

    it('reflects edit mode and sidebar/panel toggles', () => {
        const ctx = buildHomeAgentContext(baseInput({ EditMode: true, SidebarOpen: true, AddPanelOpen: true }));
        expect(ctx['EditMode']).toBe(true);
        expect(ctx['SidebarOpen']).toBe(true);
        expect(ctx['AddPanelOpen']).toBe(true);
    });
});
