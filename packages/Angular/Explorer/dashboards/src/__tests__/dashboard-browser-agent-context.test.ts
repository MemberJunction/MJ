/**
 * Tests for the Dashboard Browser's pure agent-context helpers
 * (`DashboardBrowser/dashboard-browser-agent-context.ts`).
 *
 * These pure functions back the SAFE, browse-only agent integration on the
 * Dashboard Browser. `buildDashboardBrowserAgentContext` shapes a state snapshot
 * into the flat context object; `isValidBrowserViewMode` keeps the
 * `SwitchViewMode` tool tolerant of arbitrary agent input.
 */
import { describe, it, expect } from 'vitest';
import {
    buildDashboardBrowserAgentContext,
    isValidBrowserViewMode,
    DashboardBrowserAgentContextInput,
} from '../DashboardBrowser/dashboard-browser-agent-context';

describe('dashboard-browser-agent-context', () => {
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
        const base: DashboardBrowserAgentContextInput = {
            Mode: 'list',
            SelectedDashboardId: null,
            SelectedDashboardName: null,
            TotalDashboardCount: 12,
            SelectedCategoryId: null,
            ViewMode: 'cards',
            IsLoading: false,
        };

        it('passes through the list-level snapshot verbatim', () => {
            expect(buildDashboardBrowserAgentContext(base)).toEqual({
                Mode: 'list',
                SelectedDashboardId: null,
                SelectedDashboardName: null,
                TotalDashboardCount: 12,
                SelectedCategoryId: null,
                ViewMode: 'cards',
                IsLoading: false,
            });
        });

        it('reflects a selected dashboard in view mode', () => {
            const ctx = buildDashboardBrowserAgentContext({
                ...base,
                Mode: 'view',
                SelectedDashboardId: 'abc-123',
                SelectedDashboardName: 'Revenue',
                SelectedCategoryId: 'cat-9',
                ViewMode: 'list',
                IsLoading: true,
            });
            expect(ctx['Mode']).toBe('view');
            expect(ctx['SelectedDashboardId']).toBe('abc-123');
            expect(ctx['SelectedDashboardName']).toBe('Revenue');
            expect(ctx['SelectedCategoryId']).toBe('cat-9');
            expect(ctx['ViewMode']).toBe('list');
            expect(ctx['IsLoading']).toBe(true);
        });

        it('produces a flat object with exactly the documented keys', () => {
            const keys = Object.keys(buildDashboardBrowserAgentContext(base)).sort();
            expect(keys).toEqual([
                'IsLoading',
                'Mode',
                'SelectedCategoryId',
                'SelectedDashboardId',
                'SelectedDashboardName',
                'TotalDashboardCount',
                'ViewMode',
            ]);
        });
    });
});
