/**
 * Deleting a connection that an archive seed created. The seed's job row in `MJ: RSU Pending Works`
 * carries a foreign key to the connection, so a plain delete fails on the constraint and the
 * Integrations dashboard could never remove a failed seed. The server subclass removes the job rows
 * first (refusing while the seed still runs) and the seed's data source after; these tests pin the
 * pure decisions and that the override exists.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseEntity, BaseEntityResult, RunView, type UserInfo } from '@memberjunction/core';
import { IsArchiveSeedInProgress, IsArchiveSeedWorkRow, PlanArchiveSeedRowCleanup, ReadArchiveSeedConfiguration } from '../custom/CompanyIntegrationArchiveSeed';
import { MJCompanyIntegrationEntityServer } from '../custom/MJCompanyIntegrationEntityServer.server';

function payload(state: string | undefined, workType = 'archive-seed'): string {
    return JSON.stringify({ WorkType: workType, CompanyIntegrationID: 'ci-1', ArchiveSeed: state ? { State: state } : undefined });
}

describe('ReadArchiveSeedConfiguration', () => {
    it('reads the job and data source of a seeded connection', () => {
        const configuration = JSON.stringify({ externalDataSourceID: 'eds-1', seededFromBackup: { jobID: 'job-1', backupDatabaseName: 'MJ_TRG' } });
        expect(ReadArchiveSeedConfiguration(configuration)).toEqual({ JobID: 'job-1', ExternalDataSourceID: 'eds-1' });
    });

    it('reports no data source when none is recorded', () => {
        expect(ReadArchiveSeedConfiguration(JSON.stringify({ seededFromBackup: { jobID: 'job-1' } }))).toEqual({ JobID: 'job-1', ExternalDataSourceID: null });
        expect(ReadArchiveSeedConfiguration(JSON.stringify({ externalDataSourceID: '', seededFromBackup: { jobID: 'job-1' } }))?.ExternalDataSourceID).toBeNull();
    });

    it.each([
        ['null', null],
        ['empty', ''],
        ['not JSON', '{nope'],
        ['an array', '[1]'],
        ['a live connection', JSON.stringify({ externalDataSourceID: 'eds-9' })],
        ['an empty job id', JSON.stringify({ seededFromBackup: { jobID: ' ' } })],
        ['a non-string job id', JSON.stringify({ seededFromBackup: { jobID: 7 } })],
    ])('is undefined for %s', (_label, configuration) => {
        expect(ReadArchiveSeedConfiguration(configuration)).toBeUndefined();
    });
});

describe('IsArchiveSeedInProgress', () => {
    it.each(['Created', 'Restoring', 'AwaitingSelection', 'Building', 'Mapping', 'Loading', 'AwaitingCleanupDecision'])(
        'is true for a Pending archive-seed row in %s',
        state => {
            expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: payload(state) })).toBe(true);
        },
    );

    it.each(['Done', 'Failed'])('is false for a Pending row whose seed is %s', state => {
        expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: payload(state) })).toBe(false);
    });

    it.each(['Completed', 'Failed'] as const)('is false for a row whose store status is %s', status => {
        expect(IsArchiveSeedInProgress({ Status: status, PayloadJSON: payload('Restoring') })).toBe(false);
    });

    it('is false for other pending work of the connection', () => {
        expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: payload('Restoring', 'apply-objects') })).toBe(false);
    });

    it('treats an unreadable or state-less Pending payload as running', () => {
        expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: '{broken' })).toBe(true);
        expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: null })).toBe(true);
        expect(IsArchiveSeedInProgress({ Status: 'Pending', PayloadJSON: payload(undefined) })).toBe(true);
    });
});

describe('PlanArchiveSeedRowCleanup', () => {
    const seedFailed = { ID: 'seed', Status: 'Failed' as const, PayloadJSON: payload('Failed') };
    const seedDonePending = { ID: 'seed-pending', Status: 'Pending' as const, PayloadJSON: payload('Done') };
    const seedRunning = { ID: 'seed-run', Status: 'Pending' as const, PayloadJSON: payload('Mapping') };
    const applyDone = { ID: 'apply-done', Status: 'Completed' as const, PayloadJSON: payload(undefined, 'apply-objects') };
    const applyPending = { ID: 'apply-pending', Status: 'Pending' as const, PayloadJSON: payload(undefined, 'apply-objects') };
    const legacyPending = { ID: 'legacy', Status: 'Pending' as const, PayloadJSON: JSON.stringify({ CompanyIntegrationID: 'ci-1' }) };

    it('deletes the archive-seed rows and the finished history of other work', () => {
        expect(PlanArchiveSeedRowCleanup([seedFailed, seedDonePending, applyDone])).toEqual({ Delete: [seedFailed, seedDonePending, applyDone] });
    });

    it('refuses, deleting nothing, while the seed still runs', () => {
        const plan = PlanArchiveSeedRowCleanup([seedRunning, applyDone]);
        expect(plan.Delete).toEqual([]);
        expect(plan.Refusal).toContain('still running');
    });

    it.each([
        ['an apply-objects row', applyPending],
        ['a legacy row with no WorkType', legacyPending],
    ])('keeps other pending work: refuses, deleting nothing, for %s', (_label, row) => {
        const plan = PlanArchiveSeedRowCleanup([seedFailed, row]);
        expect(plan.Delete).toEqual([]);
        expect(plan.Refusal).toContain('1 other pending work item(s)');
    });
});

describe('IsArchiveSeedWorkRow', () => {
    it('is true only for an archive-seed payload', () => {
        expect(IsArchiveSeedWorkRow({ Status: 'Completed', PayloadJSON: payload('Done') })).toBe(true);
        expect(IsArchiveSeedWorkRow({ Status: 'Pending', PayloadJSON: payload(undefined, 'apply-objects') })).toBe(false);
        expect(IsArchiveSeedWorkRow({ Status: 'Pending', PayloadJSON: '{broken' })).toBe(false);
    });
});

describe('MJCompanyIntegrationEntityServer.Delete', () => {
    it('overrides Delete so a seeded connection removes its job rows and data source', () => {
        const own = Object.getOwnPropertyDescriptor(MJCompanyIntegrationEntityServer.prototype, 'Delete');
        expect(own).toBeDefined();
        expect(typeof own?.value).toBe('function');
    });

    interface FakeRow {
        ID: string;
        Status: 'Completed' | 'Failed' | 'Pending';
        PayloadJSON: string;
        Deleted?: boolean;
        DeleteResult?: boolean;
        LatestResult?: { CompleteMessage: string };
        Delete(): Promise<boolean>;
    }

    function Row(id: string, status: FakeRow['Status'], json: string, deleteResult = true): FakeRow {
        return {
            ID: id, Status: status, PayloadJSON: json, DeleteResult: deleteResult, LatestResult: { CompleteMessage: `${id} refused` },
            async Delete() { this.Deleted = this.DeleteResult; return this.DeleteResult ?? true; },
        };
    }

    let pendingRows: FakeRow[];
    let dataSource: FakeRow;
    let superDelete: ReturnType<typeof vi.spyOn>;
    let scope: { IsNested: boolean; Commit: ReturnType<typeof vi.fn>; Rollback: ReturnType<typeof vi.fn> };
    let recorded: BaseEntityResult[];

    function SeededConnection(): MJCompanyIntegrationEntityServer {
        const ci = Object.create(MJCompanyIntegrationEntityServer.prototype) as MJCompanyIntegrationEntityServer;
        scope = { IsNested: false, Commit: vi.fn(async () => undefined), Rollback: vi.fn(async () => undefined) };
        const provider = { SupportsEntityTransactions: true, BeginEntityTransaction: vi.fn(async () => scope) };
        recorded = [];
        const props: Record<string, unknown> = {
            ID: 'ci-1',
            Configuration: JSON.stringify({ externalDataSourceID: 'eds-1', seededFromBackup: { jobID: 'job-1' } }),
            ContextCurrentUser: { ID: 'u-1' } as UserInfo,
            ProviderToUse: provider,
            RunViewProviderToUse: provider,
            RegisterResultHistoryEntry: (r: BaseEntityResult) => recorded.push(r),
        };
        for (const [key, value] of Object.entries(props)) {
            Object.defineProperty(ci, key, { value, configurable: true });
        }
        return ci;
    }

    beforeEach(() => {
        dataSource = Row('eds-1', 'Completed', '');
        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async params => ({
            Success: true,
            Results: params.EntityName === 'MJ: RSU Pending Works' ? pendingRows : [dataSource],
        }) as Awaited<ReturnType<RunView['RunView']>>);
        superDelete = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('deletes the job rows and the connection in one committed transaction, then the data source', async () => {
        pendingRows = [Row('job-1', 'Failed', payload('Failed')), Row('apply-1', 'Completed', payload(undefined, 'apply-objects'))];

        await expect(SeededConnection().Delete()).resolves.toBe(true);

        expect(pendingRows.every(r => r.Deleted)).toBe(true);
        expect(superDelete).toHaveBeenCalledTimes(1);
        expect(scope.Commit).toHaveBeenCalledTimes(1);
        expect(scope.Rollback).not.toHaveBeenCalled();
        expect(dataSource.Deleted).toBe(true);
    });

    it('rolls the row deletes back when the connection delete fails, and keeps the data source', async () => {
        pendingRows = [Row('job-1', 'Failed', payload('Failed'))];
        superDelete.mockResolvedValue(false);

        await expect(SeededConnection().Delete()).resolves.toBe(false);

        expect(scope.Rollback).toHaveBeenCalledTimes(1);
        expect(scope.Commit).not.toHaveBeenCalled();
        expect(dataSource.Deleted).toBeUndefined();
    });

    it('rolls back and records the refusal when a job row cannot be deleted', async () => {
        pendingRows = [Row('job-1', 'Failed', payload('Failed'), false)];

        await expect(SeededConnection().Delete()).resolves.toBe(false);

        expect(superDelete).not.toHaveBeenCalled();
        expect(scope.Rollback).toHaveBeenCalledTimes(1);
        expect(recorded.at(-1)?.Message).toContain('job-1 refused');
    });

    it('keeps other pending work: refuses before deleting anything', async () => {
        pendingRows = [Row('job-1', 'Failed', payload('Failed')), Row('apply-1', 'Pending', payload(undefined, 'apply-objects'))];

        await expect(SeededConnection().Delete()).resolves.toBe(false);

        expect(pendingRows.some(r => r.Deleted)).toBe(false);
        expect(superDelete).not.toHaveBeenCalled();
        expect(recorded.at(-1)?.Message).toContain('other pending work');
    });
});
