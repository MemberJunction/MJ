/**
 * Tests for `Query Scheduled Jobs`: the JobTypeID filter value and the error reply.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const runViewResult = vi.fn();

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (_target: Function) => {},
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {},
}));

vi.mock('@memberjunction/scheduling-engine', () => ({
    SchedulingEngine: { Instance: {} },
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class {},
    UserInfo: class {},
    RunView: class { RunView = runViewResult; },
    LogError: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
}));

import { QueryScheduledJobsAction } from '../QueryJobsAction';
import type { RunActionParams } from '@memberjunction/actions-base';

class TestableAction extends QueryScheduledJobsAction {
    public Run(params: RunActionParams) {
        return this.InternalRunAction(params);
    }
}

const paramsWith = (values: Array<[string, string]>): RunActionParams =>
    ({ Params: values.map(([Name, Value]) => ({ Name, Value, Type: 'Input' })), ContextUser: { ID: 'user-1' } } as unknown as RunActionParams);

beforeEach(() => {
    runViewResult.mockReset();
});

describe('Query Scheduled Jobs', () => {
    it('refuses a JobTypeID that is not a UUID before any filter is built', async () => {
        runViewResult.mockResolvedValue({ Success: true, Results: [] });
        const marker = "' OR '1'='1";

        const result = await new TestableAction().Run(paramsWith([['JobTypeID', `aaaaaaaa-0000-0000-0000-000000000001${marker}`]]));

        const filters = runViewResult.mock.calls.map((c) => String((c[0] as { ExtraFilter?: string }).ExtraFilter ?? ''));
        expect(filters.filter((f) => f.includes(marker))).toEqual([]);
        expect(result.Success).toBe(false);
    });

    it('does not return the data provider error text when the query fails', async () => {
        runViewResult.mockResolvedValue({ Success: false, ErrorMessage: 'provider-detail-marker' });

        const result = await new TestableAction().Run(paramsWith([]));

        expect(result.Success).toBe(false);
        expect(result.Message).not.toContain('provider-detail-marker');
    });
});
