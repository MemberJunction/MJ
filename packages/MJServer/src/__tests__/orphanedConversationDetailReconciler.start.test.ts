/**
 * `conversationDetailReconciler` settings: the reconciler always runs its startup pass, and repeats
 * on the configured interval only while enabled. Disabled, an idle server sends it no periodic query.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const { mockRunView } = vi.hoisted(() => ({ mockRunView: vi.fn() }));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    UserCache: { Instance: { Users: [] } },
}));

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        public static FromMetadataProvider(): MockRunView {
            return new MockRunView();
        }
        public async RunView(...args: unknown[]): Promise<unknown> {
            return mockRunView(...args);
        }
    }
    return { LogError: vi.fn(), LogStatus: vi.fn(), RunView: MockRunView };
});

import { StartOrphanedConversationDetailReconciler } from '../generic/OrphanedConversationDetailReconciler.js';

const USER = { ID: 'U1' } as unknown as UserInfo;
const PROVIDER = {
    EntityByName: (name: string) =>
        name === 'MJ: AI Agent Runs' ? { SchemaName: '__mj', BaseView: 'vwAIAgentRuns' } : undefined,
    QuoteIdentifier: (name: string) => `[${name}]`,
    QuoteSchemaAndView: (schema: string, view: string) => `[${schema}].[${view}]`,
} as never;
const HOUR = 60 * 60_000;

/** Passes run so far: each pass starts with one read of in-progress conversation details. */
const passes = (): number => mockRunView.mock.calls.length;

describe('StartOrphanedConversationDetailReconciler', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockRunView.mockReset();
        mockRunView.mockResolvedValue({ Success: true, Results: [] });
    });
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('enabled: runs a pass now, then one every interval', async () => {
        const timer = StartOrphanedConversationDetailReconciler(PROVIDER, USER, { enabled: true, sweepIntervalMs: 60_000 });
        await vi.advanceTimersByTimeAsync(5 * 60_000);

        expect(timer).not.toBeNull();
        expect(passes()).toBe(6);
    });

    it('disabled: runs the startup pass only, and schedules nothing', async () => {
        const timer = StartOrphanedConversationDetailReconciler(PROVIDER, USER, { enabled: false, sweepIntervalMs: 60_000 });
        await vi.advanceTimersByTimeAsync(HOUR);

        expect(passes()).toBe(1);
        expect(timer).toBeNull();
    });

    it('with no settings keeps the shipped 5-minute repeat', async () => {
        StartOrphanedConversationDetailReconciler(PROVIDER, USER);
        await vi.advanceTimersByTimeAsync(HOUR);

        expect(passes()).toBe(13);
    });

    it('a failing pass is logged, not thrown, and the next pass still runs', async () => {
        mockRunView.mockRejectedValueOnce(new Error('db down'));
        StartOrphanedConversationDetailReconciler(PROVIDER, USER, { enabled: true, sweepIntervalMs: 60_000 });
        await vi.advanceTimersByTimeAsync(60_000);

        expect(passes()).toBe(2);
    });
});
