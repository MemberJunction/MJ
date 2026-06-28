/**
 * Tests for the Dashboard Browser's pure agent-context helpers
 * (`DashboardBrowser/dashboard-browser-agent-context.ts`).
 *
 * These pure functions back the SAFE, read-only / navigational agent integration on
 * the Dashboard Browser. `buildDashboardBrowserAgentContext` shapes a state snapshot
 * into the flat context object — including the bounded name lists (visible dashboards,
 * available categories) the agent uses to pick a dashboard/category to open, and the
 * companion total-count fields surfaced when those lists are truncated.
 * `isValidBrowserViewMode` keeps the `SwitchViewMode` tool tolerant of arbitrary input.
 */
import { describe, it, expect } from 'vitest';
import {
    buildDashboardBrowserAgentContext,
    isValidBrowserViewMode,
    AGENT_CONTEXT_NAME_LIST_CAP,
    DashboardBrowserAgentContextInput,
} from '../DashboardBrowser/dashboard-browser-agent-context';

/** Build a list of `count` distinct placeholder names. */
function names(prefix: string, count: number): string[] {
    return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);
}

describe('dashboard-browser-agent-context', () => {
    const base: DashboardBrowserAgentContextInput = {
        Mode: 'list',
        SelectedDashboardId: null,
        SelectedDashboardName: null,
        VisibleDashboardNames: [],
        TotalDashboardCount: 12,
        FilteredDashboardCount: 0,
        SearchText: '',
        AvailableCategoryNames: [],
        SelectedCategoryId: null,
        SelectedCategoryName: null,
        ViewMode: 'cards',
        IsLoading: false,
    };

    describe('isValidBrowserViewMode', () => {
        it('accepts the two known modes', () => {
            expect(isValidBrowserViewMode('cards')).toBe(true);
            expect(isValidBrowserViewMode('list')).toBe(true);
        });

        it('rejects unknown / malformed input without throwing', () => {
            expect(isValidBrowserViewMode('grid')).toBe(false);
            expect(isValidBrowserViewMode('')).toBe(false);
            expect(isValidBrowserViewMode('CARDS')).toBe(false); // case-sensitive
            expect(isValidBrowserViewMode(undefined)).toBe(false);
            expect(isValidBrowserViewMode(null)).toBe(false);
            expect(isValidBrowserViewMode(42)).toBe(false);
            expect(isValidBrowserViewMode({})).toBe(false);
        });
    });

    describe('buildDashboardBrowserAgentContext', () => {
        it('passes through the list-level snapshot fields', () => {
            const ctx = buildDashboardBrowserAgentContext(base);
            expect(ctx['Mode']).toBe('list');
            expect(ctx['SelectedDashboardId']).toBeNull();
            expect(ctx['SelectedDashboardName']).toBeNull();
            expect(ctx['TotalDashboardCount']).toBe(12);
            expect(ctx['FilteredDashboardCount']).toBe(0);
            expect(ctx['SelectedCategoryId']).toBeNull();
            expect(ctx['SelectedCategoryName']).toBeNull();
            expect(ctx['ViewMode']).toBe('cards');
            expect(ctx['IsLoading']).toBe(false);
            // Bounded name lists are always present (possibly empty arrays).
            expect(ctx['VisibleDashboards']).toEqual([]);
            expect(ctx['AvailableCategories']).toEqual([]);
        });

        it('reflects a selected dashboard in view mode', () => {
            const ctx = buildDashboardBrowserAgentContext({
                ...base,
                Mode: 'view',
                SelectedDashboardId: 'abc-123',
                SelectedDashboardName: 'Revenue',
                SelectedCategoryId: 'cat-9',
                SelectedCategoryName: 'Finance',
                ViewMode: 'list',
                IsLoading: true,
            });
            expect(ctx['Mode']).toBe('view');
            expect(ctx['SelectedDashboardId']).toBe('abc-123');
            expect(ctx['SelectedDashboardName']).toBe('Revenue');
            expect(ctx['SelectedCategoryId']).toBe('cat-9');
            expect(ctx['SelectedCategoryName']).toBe('Finance');
            expect(ctx['ViewMode']).toBe('list');
            expect(ctx['IsLoading']).toBe(true);
        });

        it('publishes the visible dashboard NAMES so the agent can pick one to open', () => {
            const ctx = buildDashboardBrowserAgentContext({
                ...base,
                VisibleDashboardNames: ['Revenue', 'Pipeline', 'Churn'],
                FilteredDashboardCount: 3,
            });
            expect(ctx['VisibleDashboards']).toEqual(['Revenue', 'Pipeline', 'Churn']);
            expect(ctx['FilteredDashboardCount']).toBe(3);
        });

        it('publishes the available category NAMES and the selected category name', () => {
            const ctx = buildDashboardBrowserAgentContext({
                ...base,
                AvailableCategoryNames: ['Finance', 'Ops', 'Marketing'],
                SelectedCategoryId: 'cat-7',
                SelectedCategoryName: 'Ops',
            });
            expect(ctx['AvailableCategories']).toEqual(['Finance', 'Ops', 'Marketing']);
            expect(ctx['SelectedCategoryName']).toBe('Ops');
        });

        it('caps the visible-dashboard name list and adds a companion count when truncated', () => {
            const visible = names('Dashboard', AGENT_CONTEXT_NAME_LIST_CAP + 10);
            const ctx = buildDashboardBrowserAgentContext({
                ...base,
                VisibleDashboardNames: visible,
                FilteredDashboardCount: visible.length,
            });
            expect((ctx['VisibleDashboards'] as string[]).length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
            expect(ctx['VisibleDashboardCount']).toBe(visible.length);
            // FilteredDashboardCount still reports the true (uncapped) visible count.
            expect(ctx['FilteredDashboardCount']).toBe(visible.length);
        });

        it('caps the available-category name list and adds a companion count when truncated', () => {
            const cats = names('Category', AGENT_CONTEXT_NAME_LIST_CAP + 5);
            const ctx = buildDashboardBrowserAgentContext({ ...base, AvailableCategoryNames: cats });
            expect((ctx['AvailableCategories'] as string[]).length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
            expect(ctx['AvailableCategoryCount']).toBe(cats.length);
        });

        it('omits the companion count fields when the lists are within the cap', () => {
            const ctx = buildDashboardBrowserAgentContext({
                ...base,
                VisibleDashboardNames: names('Dashboard', 5),
                AvailableCategoryNames: names('Category', 3),
            });
            expect(ctx).not.toHaveProperty('VisibleDashboardCount');
            expect(ctx).not.toHaveProperty('AvailableCategoryCount');
        });

        it('derives HasSearch = false for empty / whitespace search text', () => {
            expect(buildDashboardBrowserAgentContext({ ...base, SearchText: '' })['HasSearch']).toBe(false);
            expect(buildDashboardBrowserAgentContext({ ...base, SearchText: '   ' })['HasSearch']).toBe(false);
        });

        it('derives HasSearch = true and forwards the search text when present', () => {
            const ctx = buildDashboardBrowserAgentContext({ ...base, SearchText: 'revenue' });
            expect(ctx['HasSearch']).toBe(true);
            expect(ctx['SearchText']).toBe('revenue');
        });

        it('produces exactly the documented keys when lists are within the cap (no leakage)', () => {
            const ctx = buildDashboardBrowserAgentContext({
                ...base,
                VisibleDashboardNames: ['A'],
                AvailableCategoryNames: ['X'],
            });
            expect(Object.keys(ctx).sort()).toEqual([
                'AvailableCategories',
                'FilteredDashboardCount',
                'HasSearch',
                'IsLoading',
                'Mode',
                'SearchText',
                'SelectedCategoryId',
                'SelectedCategoryName',
                'SelectedDashboardId',
                'SelectedDashboardName',
                'TotalDashboardCount',
                'ViewMode',
                'VisibleDashboards',
            ]);
        });
    });

    /**
     * The name→id resolution itself lives in the component's private OpenDashboard /
     * SelectCategory handlers, but its shape mirrors the Data Explorer's SelectView:
     * prefer an exact id match, then fall back to a case-insensitive name match
     * against the loaded list. These tests pin that resolution contract in isolation.
     */
    describe('name→id resolution (mirrors the OpenDashboard / SelectCategory handlers)', () => {
        interface Named { ID: string; Name: string }
        const items: Named[] = [
            { ID: 'AAAA-1111', Name: 'Sales Overview' },
            { ID: 'BBBB-2222', Name: 'Churn Analysis' },
        ];

        function resolve(raw: string): Named | undefined {
            const trimmed = raw.trim();
            const lowered = trimmed.toLowerCase();
            return (
                items.find(i => i.ID.toUpperCase() === trimmed.toUpperCase()) ??
                items.find(i => i.Name.toLowerCase() === lowered)
            );
        }

        it('resolves by exact id', () => {
            expect(resolve('AAAA-1111')?.Name).toBe('Sales Overview');
        });

        it('resolves by case-insensitive, whitespace-trimmed name', () => {
            expect(resolve('churn analysis')?.ID).toBe('BBBB-2222');
            expect(resolve('  Sales Overview  ')?.ID).toBe('AAAA-1111');
        });

        it('returns undefined for an unknown name or id', () => {
            expect(resolve('Nonexistent')).toBeUndefined();
            expect(resolve('ZZZZ-9999')).toBeUndefined();
        });
    });
});
