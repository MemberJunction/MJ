/**
 * Tests for the Communication dashboard's pure agent-context helpers:
 * - buildCommunicationAgentContext: state snapshot → agent context object
 * - isValidCommunicationTab: tab validation for the SwitchCommunicationTab client tool
 */
import { describe, it, expect } from 'vitest';
import {
    buildCommunicationAgentContext,
    isValidCommunicationTab,
    CommunicationAgentContextInput,
} from '../Communication/communication-agent-context';

function makeInput(overrides: Partial<CommunicationAgentContextInput> = {}): CommunicationAgentContextInput {
    return {
        ActiveTab: 'logs',
        ActiveTabLabel: 'Logs',
        VisitedTabs: ['monitor', 'logs'],
        IsRefreshing: false,
        LogCount: 200,
        FilteredLogCount: 25,
        LogStatusFilter: 'Failed',
        ProviderCount: 4,
        TemplateCount: 12,
        RunCount: 7,
        RecentSentCount: 180,
        FailedCount: 20,
        ...overrides,
    };
}

describe('isValidCommunicationTab', () => {
    it('accepts the six known tabs', () => {
        expect(isValidCommunicationTab('monitor')).toBe(true);
        expect(isValidCommunicationTab('logs')).toBe(true);
        expect(isValidCommunicationTab('providers')).toBe(true);
        expect(isValidCommunicationTab('templates')).toBe(true);
        expect(isValidCommunicationTab('runs')).toBe(true);
        expect(isValidCommunicationTab('settings')).toBe(true);
    });

    it('rejects unknown / wrong-case / non-string values', () => {
        expect(isValidCommunicationTab('inbox')).toBe(false);
        expect(isValidCommunicationTab('Logs')).toBe(false); // case-sensitive
        expect(isValidCommunicationTab('')).toBe(false);
        expect(isValidCommunicationTab(undefined)).toBe(false);
        expect(isValidCommunicationTab(null)).toBe(false);
        expect(isValidCommunicationTab(3)).toBe(false);
        expect(isValidCommunicationTab({})).toBe(false);
    });
});

describe('buildCommunicationAgentContext', () => {
    it('always reports active tab + refresh state', () => {
        const ctx = buildCommunicationAgentContext(makeInput({ ActiveTab: 'monitor', ActiveTabLabel: 'Monitor', IsRefreshing: true }));
        expect(ctx['ActiveTab']).toBe('monitor');
        expect(ctx['ActiveTabLabel']).toBe('Monitor');
        expect(ctx['IsRefreshing']).toBe(true);
    });

    it('copies the visited-tabs list (does not share the input reference)', () => {
        const visited = ['monitor', 'logs'];
        const ctx = buildCommunicationAgentContext(makeInput({ VisitedTabs: visited }));
        expect(ctx['VisitedTabs']).toEqual(['monitor', 'logs']);
        expect(ctx['VisitedTabs']).not.toBe(visited);
    });

    it('includes all counts and the log status filter when present', () => {
        const ctx = buildCommunicationAgentContext(makeInput());
        expect(ctx['LogCount']).toBe(200);
        expect(ctx['FilteredLogCount']).toBe(25);
        expect(ctx['LogStatusFilter']).toBe('Failed');
        expect(ctx['ProviderCount']).toBe(4);
        expect(ctx['TemplateCount']).toBe(12);
        expect(ctx['RunCount']).toBe(7);
        expect(ctx['RecentSentCount']).toBe(180);
        expect(ctx['FailedCount']).toBe(20);
    });

    it('omits counts that are null (tab not yet mounted) rather than reporting a misleading 0', () => {
        const ctx = buildCommunicationAgentContext(
            makeInput({
                LogCount: null,
                FilteredLogCount: null,
                LogStatusFilter: null,
                ProviderCount: null,
                TemplateCount: null,
                RunCount: null,
                RecentSentCount: null,
                FailedCount: null,
            }),
        );
        expect('LogCount' in ctx).toBe(false);
        expect('FilteredLogCount' in ctx).toBe(false);
        expect('LogStatusFilter' in ctx).toBe(false);
        expect('ProviderCount' in ctx).toBe(false);
        expect('TemplateCount' in ctx).toBe(false);
        expect('RunCount' in ctx).toBe(false);
        expect('RecentSentCount' in ctx).toBe(false);
        expect('FailedCount' in ctx).toBe(false);
        // ...but the always-present fields remain.
        expect(ctx['ActiveTab']).toBe('logs');
        expect(ctx['IsRefreshing']).toBe(false);
    });

    it('keeps a zero count (distinct from null/unmounted)', () => {
        const ctx = buildCommunicationAgentContext(makeInput({ FailedCount: 0 }));
        expect('FailedCount' in ctx).toBe(true);
        expect(ctx['FailedCount']).toBe(0);
    });

    it("preserves an empty-string log filter ('' = all) when the logs tab is mounted", () => {
        const ctx = buildCommunicationAgentContext(makeInput({ LogStatusFilter: '' }));
        expect('LogStatusFilter' in ctx).toBe(true);
        expect(ctx['LogStatusFilter']).toBe('');
    });
});
