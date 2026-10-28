/**
 * Archive-seed pending-work payload and lookups.
 *
 * The archive-seed job persists its state as the PayloadJSON of an `MJ: RSU Pending Works`
 * row. These pins cover the by-ID read, the status-preserving payload rewrite, and the
 * per-integration/per-WorkType lookup that the job's resolvers rely on.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { RSUPendingWork, ArchiveSeedWork } from '../RuntimeSchemaManager.js';

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

function archiveSeed(): ArchiveSeedWork {
    return {
        State: 'AwaitingSelection',
        StateChangedAt: '2026-10-28T00:00:00.000Z',
        UserID: 'user-1',
        CompanyID: 'co-1',
        IntegrationID: 'int-1',
        ConnectionName: 'Archive',
        BackupUrls: 'https://x/a.bak',
        StagingDatabaseName: 'stg',
        BatchSize: 500,
        Tables: [{ Name: 'dbo.Member', ColumnCount: 4, HasPrimaryKey: true, WatermarkField: 'ModifiedDate' }],
        SelectedTables: ['dbo.Member'],
        Summary: { TablesProcessed: 1, TotalRowsTransferred: 10, DurationSeconds: 2, StagingDatabaseDropped: false },
    };
}

function archivePayload(): RSUPendingWork {
    return {
        WorkType: 'archive-seed',
        CompanyIntegrationID: 'ci-1',
        SourceObjectNames: [],
        SchemaName: 'archive',
        CreatedAt: '2026-10-28T00:00:00.000Z',
        ArchiveSeed: archiveSeed(),
    };
}

function createMockRow(overrides: Record<string, unknown> = {}) {
    return {
        ID: 'pw-1',
        CompanyIntegrationID: 'ci-1',
        PayloadJSON: JSON.stringify(archivePayload()),
        Status: 'Pending',
        ErrorMessage: null,
        ProcessedAt: null,
        __mj_CreatedAt: new Date('2026-10-28T00:00:00Z'),
        LatestResult: { CompleteMessage: 'save blew up' },
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
}

describe('RuntimeSchemaManager archive-seed pending work', () => {
    const rsm = RuntimeSchemaManager.Instance;

    beforeEach(() => {
        loggedErrors = [];
        mockRunViewFn = vi.fn().mockResolvedValue({ Success: true, Results: [] });
        mockGetEntityObjectFn = vi.fn();
    });

    describe('ReadPendingWorkByID', () => {
        it('returns the parsed payload, status and creation time, round-tripping ArchiveSeed', async () => {
            const row = createMockRow({ Status: 'Completed' });
            mockGetEntityObjectFn.mockResolvedValue(row);

            const found = await rsm.ReadPendingWorkByID('pw-1', mockContextUser);

            expect(row.Load).toHaveBeenCalledWith('pw-1');
            expect(found?.ID).toBe('pw-1');
            expect(found?.Status).toBe('Completed');
            expect(found?.Work.WorkType).toBe('archive-seed');
            expect(found?.Work.ArchiveSeed).toEqual(archiveSeed());
            expect(found?.CreatedAt).toEqual(new Date('2026-10-28T00:00:00Z'));
        });

        it('returns undefined when the row does not exist', async () => {
            mockGetEntityObjectFn.mockResolvedValue(createMockRow({ Load: vi.fn().mockResolvedValue(false) }));
            await expect(rsm.ReadPendingWorkByID('missing', mockContextUser)).resolves.toBeUndefined();
        });

        it('returns undefined and logs when the payload is corrupt', async () => {
            mockGetEntityObjectFn.mockResolvedValue(createMockRow({ PayloadJSON: '{not json' }));
            await expect(rsm.ReadPendingWorkByID('pw-1', mockContextUser)).resolves.toBeUndefined();
            expect(loggedErrors.some((m) => m.includes('pw-1'))).toBe(true);
        });
    });

    describe('UpdatePendingWorkPayload', () => {
        it('saves the new PayloadJSON without changing Status', async () => {
            const row = createMockRow({ Status: 'Failed' });
            mockGetEntityObjectFn.mockResolvedValue(row);
            const next = archivePayload();
            next.ArchiveSeed = { ...archiveSeed(), State: 'Building' };

            await expect(rsm.UpdatePendingWorkPayload('pw-1', next, mockContextUser)).resolves.toBe(true);

            expect(JSON.parse(row.PayloadJSON as string).ArchiveSeed.State).toBe('Building');
            expect(row.Status).toBe('Failed');
            expect(row.Save).toHaveBeenCalledTimes(1);
        });

        it('returns false and logs the save detail when Save fails', async () => {
            mockGetEntityObjectFn.mockResolvedValue(createMockRow({ Save: vi.fn().mockResolvedValue(false) }));
            await expect(rsm.UpdatePendingWorkPayload('pw-1', archivePayload(), mockContextUser)).resolves.toBe(false);
            expect(loggedErrors.some((m) => m.includes('save blew up'))).toBe(true);
        });

        it('returns false when the row is not found', async () => {
            const row = createMockRow({ Load: vi.fn().mockResolvedValue(false) });
            mockGetEntityObjectFn.mockResolvedValue(row);
            await expect(rsm.UpdatePendingWorkPayload('nope', archivePayload(), mockContextUser)).resolves.toBe(false);
            expect(row.Save).not.toHaveBeenCalled();
        });
    });

    describe('ReadPendingWorkForCompanyIntegration', () => {
        it('filters by CompanyIntegrationID in the query, newest first, across all statuses', async () => {
            await rsm.ReadPendingWorkForCompanyIntegration('ci-1', 'archive-seed', mockContextUser);
            const params = mockRunViewFn.mock.calls[0][0];
            expect(params.EntityName).toBe('MJ: RSU Pending Works');
            expect(params.ExtraFilter).toContain(`CompanyIntegrationID = 'ci-1'`);
            expect(params.ExtraFilter).not.toContain('Status');
            expect(params.OrderBy).toBe('__mj_CreatedAt DESC');
            expect(params.BypassCache).toBe(true);
        });

        it('keeps only the requested WorkType, treating an absent WorkType as apply-objects', async () => {
            const legacy = { ...archivePayload(), WorkType: undefined, ArchiveSeed: undefined };
            const promote = { ...archivePayload(), WorkType: 'promote-columns' as const, ArchiveSeed: undefined };
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [
                    createMockRow({ ID: 'a', Status: 'Failed', ErrorMessage: 'boom' }),
                    createMockRow({ ID: 'b', PayloadJSON: JSON.stringify(legacy) }),
                    createMockRow({ ID: 'c', PayloadJSON: JSON.stringify(promote) }),
                    createMockRow({ ID: 'd', PayloadJSON: '{bad' }),
                ],
            });

            const seeds = await rsm.ReadPendingWorkForCompanyIntegration('ci-1', 'archive-seed', mockContextUser);
            expect(seeds.map((s) => s.ID)).toEqual(['a']);
            expect(seeds[0].Status).toBe('Failed');
            expect(seeds[0].ErrorMessage).toBe('boom');
            expect(seeds[0].Work.ArchiveSeed).toEqual(archiveSeed());

            const applies = await rsm.ReadPendingWorkForCompanyIntegration('ci-1', undefined, mockContextUser);
            expect(applies.map((s) => s.ID)).toEqual(['b']);
        });

        it('escapes quotes in the ID and returns [] when the query fails', async () => {
            mockRunViewFn.mockResolvedValue({ Success: false, ErrorMessage: 'db down', Results: [] });
            await expect(rsm.ReadPendingWorkForCompanyIntegration("x'y", 'archive-seed', mockContextUser)).resolves.toEqual([]);
            expect(mockRunViewFn.mock.calls[0][0].ExtraFilter).toContain(`'x''y'`);
            expect(loggedErrors.some((m) => m.includes('db down'))).toBe(true);
        });
    });
});
