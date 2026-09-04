import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine.js';

/**
 * Delete-detection (the full-sync orphan sweep) is a DELETE PATH, and must answer to the same
 * `DeleteBehavior` policy as every other delete. It used to call `entity.Delete()`
 * unconditionally — its own warning text promised "archived/deleted" while the code only ever
 * deleted — and it never pruned the record-map row, so every stale mapping was re-detected as an
 * orphan on EVERY subsequent full sync: ORPHANS_DETECTED became a cumulative counter of history
 * (observed live as a count that only grew, sync after sync) rather than a signal about the run.
 *
 * The sweep's collaborators are stubbed at its own seams (LoadAllRecordMaps, ProviderToUse) so
 * the tests exercise exactly the policy branching + pruning and nothing else.
 */

type MockEntity = {
    InnerLoad: ReturnType<typeof vi.fn>;
    Delete: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    Set: ReturnType<typeof vi.fn>;
    Fields: Array<{ Name: string }>;
    LatestResult?: { CompleteMessage?: string };
};

function mockEntity(overrides: Partial<MockEntity> = {}): MockEntity {
    return {
        InnerLoad: vi.fn().mockResolvedValue(true),
        Delete: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(true),
        Set: vi.fn(),
        Fields: [
            { Name: '__mj_integration_SyncStatus' },
            { Name: '__mj_integration_LastSyncedAt' },
            { Name: '__mj_integration_IsTombstoned' },
            { Name: '__mj_integration_DeletedDetectedAt' },
        ],
        ...overrides,
    };
}

/**
 * The private members this suite drives. Named explicitly rather than reached for with `as any`:
 * the cast still has to happen (they are private), but writing the signature down means a change
 * to either member breaks this file at compile time instead of at run time.
 */
type OrphanSweepInternals = {
    LoadAllRecordMaps: unknown;
    DeleteOrphanedRecords: (
        companyIntegration: { ID: string },
        entityMap: { ID: string; Entity: string; ExternalObjectName: string; DeleteBehavior: string; EntityID: string },
        fetchedExternalIDs: ReadonlySet<string>,
        result: { RecordsDeleted: number },
        contextUser: { ID: string },
        logger: { warning: (object: string, code: string, message: string, data?: unknown) => void },
    ) => Promise<unknown>;
};

function harness(opts: {
    deleteBehavior: 'HardDelete' | 'SoftDelete' | 'DoNothing';
    mapRows: Array<{ ID: string; EntityRecordID: string; ExternalSystemRecordID: string }>;
    fetched: string[];
    dataEntity?: MockEntity;
}) {
    const engine = Object.create(IntegrationEngine.prototype) as IntegrationEngine;
    const dataEntity = opts.dataEntity ?? mockEntity();
    const mapEntities: MockEntity[] = [];
    const md = {
        EntityByName: vi.fn().mockReturnValue({ PrimaryKeys: [{ Name: 'ID' }] }),
        GetEntityObject: vi.fn(async (name: string) => {
            if (name === 'MJ: Company Integration Record Maps') {
                const m = mockEntity();
                mapEntities.push(m);
                return m;
            }
            return dataEntity;
        }),
    };
    Object.defineProperty(engine, 'ProviderToUse', { get: () => md });
    const internals = engine as unknown as OrphanSweepInternals;
    internals.LoadAllRecordMaps = vi.fn().mockResolvedValue({ Rows: opts.mapRows, Complete: true });
    const warnings: Array<{ code: string; data?: unknown }> = [];
    const logger = { warning: (_o: string, code: string, _m: string, data?: unknown) => warnings.push({ code, data }) };
    const result = { RecordsDeleted: 0 };
    const run = async () =>
        internals.DeleteOrphanedRecords(
            { ID: 'ci-1' },
            { ID: 'em-1', Entity: 'Widgets', ExternalObjectName: 'Widget', DeleteBehavior: opts.deleteBehavior, EntityID: 'e-1' },
            new Set(opts.fetched),
            result, { ID: 'u-1' }, logger,
        );
    return { run, md, dataEntity, mapEntities, warnings, result };
}

const rows = [
    { ID: 'map-1', EntityRecordID: 'rec-1', ExternalSystemRecordID: 'ext-1' },
    { ID: 'map-2', EntityRecordID: 'rec-2', ExternalSystemRecordID: 'ext-2' },
];

describe('IntegrationEngine — the orphan sweep answers to DeleteBehavior', () => {
    beforeEach(() => vi.clearAllMocks());

    it('HardDelete: deletes the record AND prunes its map row', async () => {
        const h = harness({ deleteBehavior: 'HardDelete', mapRows: rows, fetched: ['ext-2'] });
        await h.run();
        expect(h.dataEntity.Delete).toHaveBeenCalledTimes(1);
        expect(h.result.RecordsDeleted).toBe(1);
        // the map row for ext-1 was pruned — one map-entity was created and deleted
        expect(h.mapEntities).toHaveLength(1);
        expect(h.mapEntities[0].Delete).toHaveBeenCalledTimes(1);
    });

    it('SoftDelete: ARCHIVES (Save with tombstone fields), never Delete — and still prunes the map row', async () => {
        const h = harness({ deleteBehavior: 'SoftDelete', mapRows: rows, fetched: ['ext-2'] });
        await h.run();
        expect(h.dataEntity.Delete).not.toHaveBeenCalled();
        expect(h.dataEntity.Save).toHaveBeenCalledTimes(1);
        expect(h.dataEntity.Set).toHaveBeenCalledWith('__mj_integration_SyncStatus', 'Archived');
        expect(h.dataEntity.Set).toHaveBeenCalledWith('__mj_integration_IsTombstoned', true);
        expect(h.result.RecordsDeleted).toBe(1);
        expect(h.mapEntities[0].Delete).toHaveBeenCalledTimes(1);
    });

    it('DoNothing: touches NOTHING and says so once, not once per orphan', async () => {
        const h = harness({ deleteBehavior: 'DoNothing', mapRows: rows, fetched: [] });
        await h.run();
        expect(h.dataEntity.Delete).not.toHaveBeenCalled();
        expect(h.dataEntity.Save).not.toHaveBeenCalled();
        expect(h.mapEntities).toHaveLength(0);
        expect(h.result.RecordsDeleted).toBe(0);
        expect(h.warnings.map(w => w.code)).toContain('ORPHANS_POLICY_SKIPPED');
        expect(h.warnings.filter(w => w.code === 'ORPHANS_POLICY_SKIPPED')).toHaveLength(1);
    });

    it('a record already gone from MJ still gets its stale map row pruned — the re-detection loop breaker', async () => {
        // This is the accumulating-ORPHANS_DETECTED defect: nothing anywhere deleted record-map
        // rows, so an already-deleted record was re-reported as an orphan on every full sync.
        const gone = mockEntity({ InnerLoad: vi.fn().mockResolvedValue(false) });
        const h = harness({ deleteBehavior: 'HardDelete', mapRows: rows, fetched: ['ext-2'], dataEntity: gone });
        await h.run();
        expect(gone.Delete).not.toHaveBeenCalled();
        expect(h.mapEntities).toHaveLength(1);
        expect(h.mapEntities[0].Delete).toHaveBeenCalledTimes(1);
    });

    it('a BLOCKED delete keeps its map row — the orphan was NOT handled', async () => {
        const blocked = mockEntity({ Delete: vi.fn().mockResolvedValue(false) });
        const h = harness({ deleteBehavior: 'HardDelete', mapRows: rows, fetched: ['ext-2'], dataEntity: blocked });
        await h.run();
        expect(h.result.RecordsDeleted).toBe(0);
        expect(h.mapEntities).toHaveLength(0);
    });
});
