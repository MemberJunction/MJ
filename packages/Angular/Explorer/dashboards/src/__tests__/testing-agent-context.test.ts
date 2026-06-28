/**
 * Tests for the Testing dashboard's pure agent-context helpers
 * (`Testing/testing-agent-context.ts`).
 *
 * These back the agent context + the SAFE client tools wired into the Testing
 * dashboard. The validators must be tolerant (reject bad input, never throw),
 * and the context builder must produce a stable, rounded, flat payload.
 */
import { describe, it, expect } from 'vitest';
import {
    buildTestingAgentContext,
    isValidTestingTab,
    isValidTestingStatusFilter,
    isValidTestingTimeRange,
    TestingAgentContextInput,
} from '../Testing/testing-agent-context';

describe('testing-agent-context', () => {
    describe('isValidTestingTab', () => {
        it('accepts each known tab', () => {
            for (const tab of ['dashboard', 'runs', 'analytics', 'review']) {
                expect(isValidTestingTab(tab)).toBe(true);
            }
        });

        it('rejects unknown / non-string input', () => {
            expect(isValidTestingTab('settings')).toBe(false);
            expect(isValidTestingTab('')).toBe(false);
            expect(isValidTestingTab(undefined)).toBe(false);
            expect(isValidTestingTab(null)).toBe(false);
            expect(isValidTestingTab(42)).toBe(false);
        });
    });

    describe('isValidTestingStatusFilter', () => {
        it('accepts each known status', () => {
            for (const s of ['all', 'running', 'passed', 'failed', 'error']) {
                expect(isValidTestingStatusFilter(s)).toBe(true);
            }
        });

        it('rejects unknown / non-string input', () => {
            expect(isValidTestingStatusFilter('skipped')).toBe(false);
            expect(isValidTestingStatusFilter(undefined)).toBe(false);
            expect(isValidTestingStatusFilter(0)).toBe(false);
        });
    });

    describe('isValidTestingTimeRange', () => {
        it('accepts each known range', () => {
            for (const r of ['today', 'week', 'month', '90days']) {
                expect(isValidTestingTimeRange(r)).toBe(true);
            }
        });

        it('rejects unknown / non-string input', () => {
            expect(isValidTestingTimeRange('year')).toBe(false);
            expect(isValidTestingTimeRange('90 days')).toBe(false);
            expect(isValidTestingTimeRange(null)).toBe(false);
        });
    });

    describe('buildTestingAgentContext', () => {
        const base: TestingAgentContextInput = {
            ActiveTab: 'runs',
            ActiveRunCount: 2,
            TotalTestsRun: 120,
            PassRate: 83.33333,
            FailureCount: 7,
            AverageRunDuration: 1234.6,
            TotalTestCost: 4.56789,
            PendingReviewCount: 5,
        };

        it('maps and rounds fields into a flat payload', () => {
            const ctx = buildTestingAgentContext(base);
            expect(ctx).toEqual({
                ActiveTab: 'runs',
                ActiveRunCount: 2,
                TotalTestsRun: 120,
                PassRate: 83.3,            // 1 decimal
                FailureCount: 7,
                AverageRunDuration: 1235,  // rounded to integer ms
                TotalTestCost: 4.57,       // 2 decimals
                PendingReviewCount: 5,
            });
        });

        it('coerces non-finite numeric inputs to 0', () => {
            const ctx = buildTestingAgentContext({
                ...base,
                PassRate: Number.NaN,
                TotalTestCost: Number.POSITIVE_INFINITY,
            });
            expect(ctx['PassRate']).toBe(0);
            expect(ctx['TotalTestCost']).toBe(0);
        });

        it('preserves the active tab verbatim', () => {
            const ctx = buildTestingAgentContext({ ...base, ActiveTab: 'analytics' });
            expect(ctx['ActiveTab']).toBe('analytics');
        });
    });
});
