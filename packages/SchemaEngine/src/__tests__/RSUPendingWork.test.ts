/**
 * Durable RSU pending-work queue pins (tasks.md PR 1 item 5).
 *
 * Pending work used to be a JSON file under `.rsu_pending` that the consumer deleted as it
 * read it — so a crash between read and completion lost the work silently, and a crash
 * before the read left an invisible file. It is now a row in `MJ: RSU Pending Works` that
 * is only marked terminal AFTER the consumer's work succeeds, and stays visible (and
 * loudly reported once stale) otherwise.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { RSUPendingWork } from '../RuntimeSchemaManager.js';

let mockRunViewFn: ReturnType<typeof vi.fn>;
let mockGetEntityObjectFn: ReturnType<typeof vi.fn>;
let loggedErrors: string[];

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        LogError: (msg: string) => { loggedErrors.push(msg); },
        RunView: class MockRunView {
            RunView(...args: unknown[]) {
                return mockRunViewFn(...args);
            }
        },
        Metadata: class MockMetadata {
            GetEntityObject(...args: unknown[]) {
                return mockGetEntityObjectFn(...args);
            }
        },
    };
});

const { RuntimeSchemaManager } = await import('../RuntimeSchemaManager.js');

const mockContextUser = { ID: 'user-1' } as UserInfo;

function samplePayload(): RSUPendingWork {
    return {
        CompanyIntegrationID: 'ci-1',
        SourceObjectNames: ['Contact', 'Deal'],
        SourceObjectFields: {},
        SchemaName: 'hubspot',
        StartSync: true,
        SyncScope: 'created',
        UnselectedAction: 'ignore',
        CreateDisabled: false,
        CreatedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    };
}

/** A pending-work row stand-in that records what the manager wrote to it. */
function createMockRow(overrides: Record<string, unknown> = {}) {
    return {
        ID: 'pw-1',
        CompanyIntegrationID: null,
        PayloadJSON: null,
        Status: null,
        ErrorMessage: undefined,
        ProcessedAt: null,
        __mj_CreatedAt: new Date('2026-01-01T00:00:00Z'),
        LatestResult: { CompleteMessage: 'save blew up' },
        NewRecord: vi.fn(),
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
}

describe('RuntimeSchemaManager durable pending work', () => {
    const rsm = RuntimeSchemaManager.Instance;

    beforeEach(() => {
        loggedErrors = [];
        mockRunViewFn = vi.fn().mockResolvedValue({ Success: true, Results: [] });
        mockGetEntityObjectFn = vi.fn();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    describe('WritePendingWork', () => {
        it('registers a Pending row carrying the whole payload and returns its ID', async () => {
            const row = createMockRow();
            mockGetEntityObjectFn.mockResolvedValue(row);
            const payload = samplePayload();

            await expect(rsm.WritePendingWork(payload, mockContextUser)).resolves.toBe('pw-1');

            expect(mockGetEntityObjectFn).toHaveBeenCalledWith('MJ: RSU Pending Works', mockContextUser);
            expect(row.NewRecord).toHaveBeenCalled();
            expect(row.CompanyIntegrationID).toBe('ci-1');
            expect(row.Status).toBe('Pending');
            expect(JSON.parse(row.PayloadJSON as unknown as string)).toEqual(payload);
        });

        it('throws with the save detail rather than returning an ID for a row that was never written', async () => {
            mockGetEntityObjectFn.mockResolvedValue(createMockRow({ Save: vi.fn().mockResolvedValue(false) }));
            await expect(rsm.WritePendingWork(samplePayload(), mockContextUser)).rejects.toThrow('save blew up');
        });
    });

    describe('ReadPendingWork', () => {
        it('reads only Pending rows, oldest first, bypassing the cache', async () => {
            await rsm.ReadPendingWork(mockContextUser);
            const params = mockRunViewFn.mock.calls[0][0];
            expect(params.EntityName).toBe('MJ: RSU Pending Works');
            expect(params.ExtraFilter).toContain(`Status = 'Pending'`);
            expect(params.OrderBy).toBe('__mj_CreatedAt ASC');
            expect(params.BypassCache).toBe(true);
        });

        it('does NOT clear rows as it reads them — completion is a separate, later step', async () => {
            const row = createMockRow({ PayloadJSON: JSON.stringify(samplePayload()) });
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [row] });

            const items = await rsm.ReadPendingWork(mockContextUser);

            expect(items).toHaveLength(1);
            expect(items[0].ID).toBe('pw-1');
            expect(items[0].Work.SourceObjectNames).toEqual(['Contact', 'Deal']);
            expect(row.Save).not.toHaveBeenCalled();
        });

        it('fails a corrupt row out instead of throwing and stranding every other item', async () => {
            const corrupt = createMockRow({ ID: 'pw-bad', PayloadJSON: '{not json' });
            const good = createMockRow({ ID: 'pw-good', PayloadJSON: JSON.stringify(samplePayload()) });
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [corrupt, good] });
            const failRow = createMockRow();
            mockGetEntityObjectFn.mockResolvedValue(failRow);

            const items = await rsm.ReadPendingWork(mockContextUser);

            expect(items.map(i => i.ID)).toEqual(['pw-good']);
            expect(failRow.Status).toBe('Failed');
            expect(failRow.ErrorMessage).toContain('Corrupt PayloadJSON');
        });

        it('reports an empty queue rather than throwing when the view fails', async () => {
            mockRunViewFn.mockResolvedValue({ Success: false, ErrorMessage: 'timeout' });
            await expect(rsm.ReadPendingWork(mockContextUser)).resolves.toEqual([]);
            expect(loggedErrors.join('\n')).toContain('timeout');
        });

        it('names stale items loudly so stranded work cannot sit unnoticed', async () => {
            const old = createMockRow({ ID: 'pw-old', PayloadJSON: JSON.stringify(samplePayload()), __mj_CreatedAt: new Date(Date.now() - 60 * 60_000) });
            const fresh = createMockRow({ ID: 'pw-fresh', PayloadJSON: JSON.stringify(samplePayload()), __mj_CreatedAt: new Date() });
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [old, fresh] });

            const items = await rsm.ReadPendingWork(mockContextUser, 30);

            expect(items).toHaveLength(2); // stale items are still returned — they must be attempted
            const warning = loggedErrors.join('\n');
            expect(warning).toContain('pw-old');
            expect(warning).not.toContain('pw-fresh');
        });

        it('says nothing about staleness when no threshold is supplied', async () => {
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [createMockRow({ PayloadJSON: JSON.stringify(samplePayload()), __mj_CreatedAt: new Date(0) })],
            });
            await rsm.ReadPendingWork(mockContextUser);
            expect(loggedErrors).toHaveLength(0);
        });
    });

    describe('CompletePendingWork / FailPendingWork', () => {
        it('marks a row Completed and stamps when it was processed', async () => {
            const row = createMockRow();
            mockGetEntityObjectFn.mockResolvedValue(row);

            await expect(rsm.CompletePendingWork('pw-1', mockContextUser)).resolves.toBe(true);
            expect(row.Load).toHaveBeenCalledWith('pw-1');
            expect(row.Status).toBe('Completed');
            expect(row.ErrorMessage).toBeNull();
            expect(row.ProcessedAt).toBeInstanceOf(Date);
        });

        it('records WHY a row failed instead of deleting the evidence', async () => {
            const row = createMockRow();
            mockGetEntityObjectFn.mockResolvedValue(row);

            await expect(rsm.FailPendingWork('pw-1', 'connector not found', mockContextUser)).resolves.toBe(true);
            expect(row.Status).toBe('Failed');
            expect(row.ErrorMessage).toBe('connector not found');
        });

        it('reports false (not a throw) when the row is gone', async () => {
            mockGetEntityObjectFn.mockResolvedValue(createMockRow({ Load: vi.fn().mockResolvedValue(false) }));
            await expect(rsm.CompletePendingWork('pw-missing', mockContextUser)).resolves.toBe(false);
            expect(loggedErrors.join('\n')).toContain('pw-missing');
        });

        it('reports false when the terminal save itself fails, leaving the row Pending and retryable', async () => {
            mockGetEntityObjectFn.mockResolvedValue(createMockRow({ Save: vi.fn().mockResolvedValue(false) }));
            await expect(rsm.CompletePendingWork('pw-1', mockContextUser)).resolves.toBe(false);
            expect(loggedErrors.join('\n')).toContain('save blew up');
        });
    });
});
