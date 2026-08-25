/**
 * The promoter's one-pass batch, spread recovery, and idempotent spread.
 *
 * Before: PromoteForSync ran the FULL RSU pipeline (migrate + CodeGen + compile) once per entity —
 * a sync touching N entities with candidates paid N passes where the batch API exists to pay one.
 * And a run interrupted between ADD COLUMN and the value spread was a dead end: the column and
 * field map existed, so the terminate check skipped the key as done, capture stopped (the key was
 * no longer unmapped), and rows kept the value only in the overflow JSON forever.
 *
 * These tests drive PromoteForSync with plan/metadata/spread stubbed at the seam and
 * RuntimeSchemaManager mocked, plus the two pure-ish decision points (resolveWorkItems,
 * spreadOneRow) directly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const runPipelineBatchMock = vi.fn();
vi.mock('@memberjunction/schema-engine', () => ({
    RuntimeSchemaManager: {
        get Instance() {
            return { RunPipelineBatch: runPipelineBatchMock };
        },
    },
}));

vi.mock('@memberjunction/integration-schema-builder', () => ({
    DDLGenerator: class {
        GenerateAlterTableAddColumn(schema: string, table: string, col: { ColumnName: string }): string {
            return `ALTER TABLE [${schema}].[${table}] ADD [${col.ColumnName}]`;
        }
    },
}));

// The engine package registers a singleton hook at import; neutralize it.
vi.mock('@memberjunction/integration-engine', () => ({
    IntegrationEngine: { Instance: { SetPostSyncSchemaPromotionCallback: vi.fn() } },
    CUSTOM_OVERFLOW_COLUMN: '__mj_integration_CustomFields',
    CONTENT_HASH_COLUMN: '__mj_integration_ContentHash',
    computeContentHash: (mapped: Record<string, unknown>) => `hash:${Object.keys(mapped).sort().join(',')}`,
    // Mirror of the real sanitizer, close enough for these fixtures (plain identifiers pass through).
    sanitizeColumnName: (key: string) => key.replace(/[^A-Za-z0-9_]/g, '_'),
}));

import { IntegrationCustomColumnPromoter } from '../integration/CustomColumnPromoter.js';
import type { UserInfo, IMetadataProvider, EntityInfo } from '@memberjunction/core';

type AnyPromoter = IntegrationCustomColumnPromoter & Record<string, unknown>;

const user = { ID: 'u1' } as unknown as UserInfo;

function makeProvider() {
    return {
        Refresh: vi.fn().mockResolvedValue(undefined),
        EntityByName: vi.fn().mockReturnValue(undefined),
        PlatformKey: 'sqlserver',
    } as unknown as IMetadataProvider;
}

function workItem(sourceKey: string, opts: Partial<{ needsColumn: boolean; needsFieldMap: boolean; recoverSpread: boolean }> = {}) {
    return {
        candidate: { Key: sourceKey, Inferred: { SchemaFieldType: 'nvarchar(100)' } },
        sourceKey,
        columnName: sourceKey,
        needsColumn: opts.needsColumn ?? true,
        needsFieldMap: opts.needsFieldMap ?? true,
        recoverSpread: opts.recoverSpread ?? false,
    };
}

function stubPromoter(provider: IMetadataProvider, planByEntity: Record<string, ReturnType<typeof workItem>[]>) {
    const promoter = new IntegrationCustomColumnPromoter(user, provider) as AnyPromoter;
    const p = promoter as unknown as {
        resolveIntegrationID: unknown; planWorkForEntity: unknown;
        createIntegrationObjectFields: unknown; createFieldMaps: unknown; spreadAndRebaseline: unknown;
        buildSchemaInput: unknown; activeFieldMapSources: unknown;
    };
    // CompletePromotion re-reads the active field maps (it must: post-restart it has no plan to
    // trust). That is a RunView, so it is stubbed at the seam like the other DB touches.
    p.activeFieldMapSources = vi.fn().mockResolvedValue(new Set<string>());
    p.resolveIntegrationID = vi.fn().mockResolvedValue('int-1');
    p.planWorkForEntity = vi.fn().mockImplementation(async (_ci: string, entityName: string) => {
        const work = planByEntity[entityName];
        if (!work) return null;
        return {
            entityInfo: { Name: entityName, SchemaName: 'mjc', BaseTable: entityName } as unknown as EntityInfo,
            entityMap: { ID: `em-${entityName}`, ExternalObjectName: entityName.toLowerCase() },
            work,
        };
    });
    const iof = vi.fn().mockResolvedValue(undefined);
    const maps = vi.fn().mockResolvedValue(undefined);
    const spread = vi.fn().mockResolvedValue(undefined);
    p.createIntegrationObjectFields = iof;
    p.createFieldMaps = maps;
    p.spreadAndRebaseline = spread;
    return { promoter: promoter as IntegrationCustomColumnPromoter, iof, maps, spread };
}

beforeEach(() => {
    runPipelineBatchMock.mockReset();
});

describe('PromoteForSync — one batched RSU pass', () => {
    it('runs ONE RunPipelineBatch for all entities instead of one pipeline per entity', async () => {
        const provider = makeProvider();
        const { promoter } = stubPromoter(provider, {
            A: [workItem('a1')],
            B: [workItem('b1')],
            C: [workItem('c1')],
        });
        runPipelineBatchMock.mockResolvedValue({
            Results: [{ Success: true }, { Success: true }, { Success: true }],
            SuccessCount: 3, FailureCount: 0, TotalCount: 3,
        });

        const result = await promoter.PromoteForSync('ci-1', ['A', 'B', 'C']);

        expect(runPipelineBatchMock).toHaveBeenCalledTimes(1);
        expect(runPipelineBatchMock.mock.calls[0][0]).toHaveLength(3);
        expect(result.Promoted).toBe(true);
        expect(result.ColumnsAdded).toEqual([
            { EntityName: 'A', ColumnName: 'a1' },
            { EntityName: 'B', ColumnName: 'b1' },
            { EntityName: 'C', ColumnName: 'c1' },
        ]);
        // ONE metadata refresh for the whole batch — before any spread reads the field list.
        expect((provider as unknown as { Refresh: ReturnType<typeof vi.fn> }).Refresh).toHaveBeenCalledTimes(1);
    });

    it('registers the follow-up as promote-columns PendingWork, and does NOT skip the restart', async () => {
        // The restart is what loads the regenerated entity classes, so everything downstream of the
        // DDL belongs after it. Skipping the restart to finish inline is what left promoted columns
        // invisible to GraphQL; skipping the commit left the database carrying columns git had no
        // record of. Both flags are optional and RSU treats absent as false, so omitting them IS
        // commit + restart — no caller or platform change required.
        const provider = makeProvider();
        const { promoter } = stubPromoter(provider, { A: [workItem('a1')], B: [workItem('b1')] });
        runPipelineBatchMock.mockResolvedValue({
            Results: [{ Success: true }, { Success: true }], SuccessCount: 2, FailureCount: 0, TotalCount: 2,
        });

        await promoter.PromoteForSync('ci-1', ['A', 'B']);

        const inputs = runPipelineBatchMock.mock.calls[0][0] as Array<Record<string, unknown>>;
        for (const input of inputs) {
            expect(input.SkipRestart).toBeUndefined();
            expect(input.SkipGitCommit).toBeUndefined();
        }
        // Carried on the FIRST input: RSU restarts once for the whole batch, so one payload
        // describes every entity in the pass.
        const pending = (inputs[0].PendingWork as Array<Record<string, unknown>>)[0];
        expect(pending.WorkType).toBe('promote-columns');
        expect(pending.CompanyIntegrationID).toBe('ci-1');
        expect(inputs[1].PendingWork).toBeUndefined();

        // The destination names are CARRIED, not recomputed — uniqueColumnName may have suffixed
        // one to dodge a collision, and re-deriving it post-restart could pick a different name.
        const promoted = pending.PromotedColumns as Array<{ EntityName: string; Columns: Array<{ SourceKey: string; ColumnName: string }> }>;
        expect(promoted.map(p => p.EntityName)).toEqual(['A', 'B']);
        expect(promoted[0].Columns[0]).toMatchObject({ ColumnName: 'a1' });
    });

    it('a failed migration leaves ITS entity captured for retry and does not stop the others', async () => {
        const provider = makeProvider();
        const { promoter, spread } = stubPromoter(provider, {
            A: [workItem('a1')],
            B: [workItem('b1')],
        });
        runPipelineBatchMock.mockResolvedValue({
            Results: [{ Success: false, ErrorMessage: 'boom' }, { Success: true }],
            SuccessCount: 1, FailureCount: 1, TotalCount: 2,
        });

        const result = await promoter.PromoteForSync('ci-1', ['A', 'B']);

        // A's DDL failed → nothing written, not counted, left captured for retry.
        // B's DDL succeeded → COUNTED (SchemaUpdatePending is derived from this list, and the
        // client keys its "workspace updating" state off it), but its metadata and spread are NOT
        // done here: the batch restarts, so the post-restart consumer owns them. Doing them inline
        // as well would duplicate the work — and for B it would not run at all, since `pm2 restart`
        // ends this process.
        expect(result.ColumnsAdded).toEqual([{ EntityName: 'B', ColumnName: 'b1' }]);
        expect(spread).not.toHaveBeenCalled();
    });

    it('a spread-recovery-only pass runs NO pipeline and reports no columns added', async () => {
        const provider = makeProvider();
        const { promoter, spread } = stubPromoter(provider, {
            A: [workItem('a1', { needsColumn: false, needsFieldMap: false, recoverSpread: true })],
        });

        const result = await promoter.PromoteForSync('ci-1', ['A']);

        // No DDL to run — the batch API is never touched, and SchemaUpdatePending stays honest.
        expect(runPipelineBatchMock).not.toHaveBeenCalled();
        expect(result.Promoted).toBe(false);
        expect(result.ColumnsAdded).toEqual([]);
        // But the backfill DID run — that is the whole point of the recovery item.
        expect(spread).toHaveBeenCalledTimes(1);
    });
});

describe('resolveWorkItems — the terminate check becomes spread recovery', () => {
    function resolve(promoter: IntegrationCustomColumnPromoter, candidates: string[], entityFields: string[], fieldMapSources: string[]) {
        const entityInfo = { Fields: entityFields.map(n => ({ Name: n })) } as unknown as EntityInfo;
        return (promoter as unknown as {
            resolveWorkItems: (p: Array<{ Key: string }>, e: EntityInfo, f: ReadonlySet<string>) => Array<Record<string, unknown>>;
        }).resolveWorkItems(candidates.map(Key => ({ Key })), entityInfo, new Set(fieldMapSources.map(f => f.toLowerCase())));
    }

    it('a key whose column AND field map exist becomes a recoverSpread item, not a silent skip', () => {
        const promoter = new IntegrationCustomColumnPromoter(user, makeProvider());
        const items = resolve(promoter, ['roundId'], ['ID', 'roundId'], ['roundId']);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ recoverSpread: true, needsColumn: false, needsFieldMap: false, columnName: 'roundId' });
    });

    it('a brand-new key still plans column + field map, with no recovery flag', () => {
        const promoter = new IntegrationCustomColumnPromoter(user, makeProvider());
        const items = resolve(promoter, ['newKey'], ['ID'], []);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ needsColumn: true, needsFieldMap: true });
        expect(items[0].recoverSpread).toBeFalsy();
    });
});

describe('spreadOneRow — idempotent backfill', () => {
    function makeRow(values: Record<string, unknown>) {
        const data = { ...values };
        return {
            Get: vi.fn((f: string) => data[f]),
            Set: vi.fn((f: string, v: unknown) => { data[f] = v; }),
            Save: vi.fn().mockResolvedValue(true),
            _data: data,
        };
    }

    async function spread(row: ReturnType<typeof makeRow>, named: Array<ReturnType<typeof workItem>>) {
        const promoter = new IntegrationCustomColumnPromoter(user, makeProvider());
        await (promoter as unknown as {
            spreadOneRow: (r: unknown, n: unknown, h: boolean, m: string[]) => Promise<void>;
        }).spreadOneRow(row, named, false, []);
    }

    it('fills a still-null destination from the overflow JSON and saves', async () => {
        const row = makeRow({ __mj_integration_CustomFields: JSON.stringify({ roundId: 42 }), roundId: null });
        await spread(row, [workItem('roundId')]);
        expect(row._data['roundId']).toBe(42);
        expect(row.Save).toHaveBeenCalledTimes(1);
    });

    it('leaves an already-backfilled destination alone — a recovery re-run does not rewrite settled rows', async () => {
        const row = makeRow({ __mj_integration_CustomFields: JSON.stringify({ roundId: 42 }), roundId: 99 });
        await spread(row, [workItem('roundId', { recoverSpread: true })]);
        expect(row._data['roundId']).toBe(99);
        expect(row.Save).not.toHaveBeenCalled();
    });
});
