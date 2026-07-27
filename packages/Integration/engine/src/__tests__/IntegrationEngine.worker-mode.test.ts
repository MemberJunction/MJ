/**
 * Worker-mode enqueue/poll/execute pins (tasks.md PR 1 item 8).
 *
 * The split that lets a sync outlive the request that asked for it: the caller writes a
 * `Queued` row and returns a real RunID immediately; a worker polls for claimable rows and
 * executes them. These tests cover the parts that are pure logic — what gets persisted at
 * enqueue, which rows the poll considers claimable, and the refusal paths that must NOT be
 * treated as errors when two workers race for the same row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationRunEntity } from '@memberjunction/core-entities';

let mockRunViewFn: ReturnType<typeof vi.fn>;

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            RunView(...args: unknown[]) {
                return mockRunViewFn(...args);
            }
        },
    };
});

const { IntegrationEngine } = await import('../IntegrationEngine.js');

const mockContextUser = { ID: 'user-42' } as UserInfo;
const CI_ID = 'ci-1111';

/** A run entity stand-in that records what the engine wrote to it. */
function createMockRunEntity(overrides: Record<string, unknown> = {}) {
    const extras: Record<string, unknown> = {};
    return {
        ID: 'run-new-1',
        CompanyIntegrationID: null,
        RunByUserID: null,
        StartedAt: null,
        Status: null,
        TotalRecords: null,
        ConfigData: null,
        LatestResult: { CompleteMessage: 'mock failure detail' },
        NewRecord: vi.fn(),
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(true),
        Set: vi.fn((field: string, value: unknown) => { extras[field] = value; }),
        GetExtra: (field: string) => extras[field],
        ...overrides,
    };
}

function createMockProvider(run: ReturnType<typeof createMockRunEntity>) {
    return {
        GetEntityObject: vi.fn().mockResolvedValue(run),
        Dialect: { CurrentTimestampUTC: () => 'SYSDATETIMEOFFSET()' },
    } as unknown as IMetadataProvider;
}

describe('IntegrationEngine worker mode (PR 1 item 8)', () => {
    beforeEach(() => {
        mockRunViewFn = vi.fn().mockResolvedValue({ Success: true, Results: [] });
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    describe('EnqueueSync', () => {
        it('persists a Queued row and returns its ID without executing anything', async () => {
            const run = createMockRunEntity();
            const provider = createMockProvider(run);

            const runID = await IntegrationEngine.Instance.EnqueueSync(CI_ID, mockContextUser, 'Manual', undefined, provider);

            expect(runID).toBe('run-new-1');
            expect(run.NewRecord).toHaveBeenCalled();
            expect(run.Status).toBe('Queued');
            expect(run.CompanyIntegrationID).toBe(CI_ID);
            expect(run.RunByUserID).toBe(mockContextUser.ID);
            expect(run.TotalRecords).toBe(0);
            expect(run.Save).toHaveBeenCalledTimes(1);
        });

        it('persists the trigger type and options on ConfigData so a DIFFERENT process runs what was asked', async () => {
            const run = createMockRunEntity();
            const provider = createMockProvider(run);
            const options = { FullSync: true, EntityMapIDs: ['em-1', 'em-2'] };

            await IntegrationEngine.Instance.EnqueueSync(CI_ID, mockContextUser, 'Scheduled', options, provider);

            expect(JSON.parse(run.ConfigData as unknown as string)).toEqual({ triggerType: 'Scheduled', options });
        });

        it('records a null options payload rather than omitting the key', async () => {
            const run = createMockRunEntity();
            await IntegrationEngine.Instance.EnqueueSync(CI_ID, mockContextUser, 'Manual', undefined, createMockProvider(run));
            expect(JSON.parse(run.ConfigData as unknown as string)).toEqual({ triggerType: 'Manual', options: null });
        });

        it('links the scheduled-job run when one drove the enqueue', async () => {
            const run = createMockRunEntity();
            await IntegrationEngine.Instance.EnqueueSync(
                CI_ID, mockContextUser, 'Scheduled', { ScheduledJobRunID: 'sjr-9' }, createMockProvider(run)
            );
            expect(run.GetExtra('ScheduledJobRunID')).toBe('sjr-9');
        });

        it('throws with the underlying detail when the row cannot be written — never returns a phantom RunID', async () => {
            const run = createMockRunEntity({ Save: vi.fn().mockResolvedValue(false) });
            await expect(
                IntegrationEngine.Instance.EnqueueSync(CI_ID, mockContextUser, 'Manual', undefined, createMockProvider(run))
            ).rejects.toThrow('mock failure detail');
        });
    });

    describe('PollQueuedRuns', () => {
        function providerOnly() {
            return {
                Dialect: { CurrentTimestampUTC: () => 'SYSDATETIMEOFFSET()' },
            } as unknown as IMetadataProvider;
        }

        it('asks only for Queued rows that are unowned or whose lease has lapsed', async () => {
            await IntegrationEngine.PollQueuedRuns(mockContextUser, 3, providerOnly());

            const params = mockRunViewFn.mock.calls[0][0];
            expect(params.EntityName).toBe('MJ: Company Integration Runs');
            expect(params.ExtraFilter).toContain(`Status='Queued'`);
            expect(params.ExtraFilter).toContain('OwnerToken IS NULL');
            expect(params.ExtraFilter).toContain('LeaseExpiresAt IS NULL');
            expect(params.ExtraFilter).toContain('LeaseExpiresAt < SYSDATETIMEOFFSET()');
        });

        it('takes the oldest first, bounded by the caller free slots, and bypasses the cache', async () => {
            await IntegrationEngine.PollQueuedRuns(mockContextUser, 2, providerOnly());
            const params = mockRunViewFn.mock.calls[0][0];
            expect(params.OrderBy).toBe('StartedAt ASC');
            expect(params.MaxRows).toBe(2);
            expect(params.BypassCache).toBe(true);
            expect(params.ResultType).toBe('simple');
            expect(params.Fields).toEqual(['ID', 'CompanyIntegrationID']);
        });

        it('returns the candidates the view produced', async () => {
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'r1', CompanyIntegrationID: 'c1' }, { ID: 'r2', CompanyIntegrationID: 'c2' }],
            });
            await expect(IntegrationEngine.PollQueuedRuns(mockContextUser, 5, providerOnly())).resolves.toEqual([
                { ID: 'r1', CompanyIntegrationID: 'c1' },
                { ID: 'r2', CompanyIntegrationID: 'c2' },
            ]);
        });

        it('degrades to an empty queue rather than throwing when the view fails', async () => {
            mockRunViewFn.mockResolvedValue({ Success: false, ErrorMessage: 'timeout' });
            await expect(IntegrationEngine.PollQueuedRuns(mockContextUser, 5, providerOnly())).resolves.toEqual([]);
        });
    });

    describe('ExecuteQueuedRun refusals', () => {
        /** Every refusal must be zero-work — a caller must never mistake it for partial progress. */
        function expectZeroWork(result: { RecordsProcessed: number; RecordsCreated: number; RecordsUpdated: number; RecordsDeleted: number; RecordsErrored: number; RecordsSkipped: number; Errors: unknown[]; EntityMapResults: unknown[]; Duration: number }) {
            expect(result.RecordsProcessed).toBe(0);
            expect(result.RecordsCreated).toBe(0);
            expect(result.RecordsUpdated).toBe(0);
            expect(result.RecordsDeleted).toBe(0);
            expect(result.RecordsErrored).toBe(0);
            expect(result.RecordsSkipped).toBe(0);
            expect(result.Errors).toEqual([]);
            expect(result.EntityMapResults).toEqual([]);
            expect(result.Duration).toBe(0);
        }

        it('refuses a run row that no longer exists', async () => {
            const run = createMockRunEntity({ Load: vi.fn().mockResolvedValue(false) });
            const result = await IntegrationEngine.Instance.ExecuteQueuedRun('run-x', mockContextUser, createMockProvider(run));
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('not found');
            expectZeroWork(result);
        });

        it('refuses a row another worker already claimed, and says so plainly', async () => {
            const run = createMockRunEntity({ Status: 'In Progress' });
            const result = await IntegrationEngine.Instance.ExecuteQueuedRun('run-x', mockContextUser, createMockProvider(run));
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('another worker already took it');
            expectZeroWork(result);
        });

        it('refuses an already-terminal row rather than re-running it', async () => {
            for (const status of ['Success', 'Failed'] as const) {
                const run = createMockRunEntity({ Status: status });
                const result = await IntegrationEngine.Instance.ExecuteQueuedRun('run-x', mockContextUser, createMockProvider(run));
                expect(result.Success).toBe(false);
                expect(result.ErrorMessage).toContain(`is '${status}'`);
            }
        });
    });
});

describe('MJCompanyIntegrationRunEntity queued-status typing', () => {
    it('accepts Queued as a run status (the CHECK constraint was widened in the PR 1 migration)', () => {
        const status: MJCompanyIntegrationRunEntity['Status'] = 'Queued';
        expect(status).toBe('Queued');
    });
});
