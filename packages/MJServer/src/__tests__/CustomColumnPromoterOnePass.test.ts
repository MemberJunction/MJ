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

function stubPromoter(
    provider: IMetadataProvider,
    planByEntity: Record<string, ReturnType<typeof workItem>[]>,
    staleByEntity: Record<string, Array<{ sourceKey: string; columnName: string }>> = {},
) {
    const promoter = new IntegrationCustomColumnPromoter(user, provider) as AnyPromoter;
    const p = promoter as unknown as {
        resolveIntegrationID: unknown; planWorkForEntity: unknown;
        createIntegrationObjectFields: unknown; createFieldMaps: unknown; spreadAndRebaseline: unknown;
        buildSchemaInput: unknown; activeFieldMaps: unknown; purgeStaleOverflowKeys: unknown;
    };
    // CompletePromotion re-reads the active field maps (it must: post-restart it has no plan to
    // trust). That is a RunView, so it is stubbed at the seam like the other DB touches.
    p.activeFieldMaps = vi.fn().mockResolvedValue(new Map<string, string>());
    p.resolveIntegrationID = vi.fn().mockResolvedValue('int-1');
    p.planWorkForEntity = vi.fn().mockImplementation(async (_ci: string, entityName: string) => {
        const work = planByEntity[entityName];
        if (!work) return null;
        return {
            entityInfo: { Name: entityName, SchemaName: 'mjc', BaseTable: entityName } as unknown as EntityInfo,
            entityMap: { ID: `em-${entityName}`, ExternalObjectName: entityName.toLowerCase() },
            work,
            stale: staleByEntity[entityName] ?? [],
        };
    });
    const iof = vi.fn().mockResolvedValue(undefined);
    const maps = vi.fn().mockResolvedValue(undefined);
    const spread = vi.fn().mockResolvedValue(undefined);
    const purge = vi.fn().mockResolvedValue(undefined);
    p.createIntegrationObjectFields = iof;
    p.createFieldMaps = maps;
    p.spreadAndRebaseline = spread;
    p.purgeStaleOverflowKeys = purge;
    return { promoter: promoter as IntegrationCustomColumnPromoter, iof, maps, spread, purge };
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

    it('purges stale staged keys BEFORE the pipeline, even with nothing to promote', async () => {
        // The residue case: every key is already promoted, so there is no work and no DDL — but the
        // staged JSON still carries the keys and nothing else will ever clear them. The purge must
        // run anyway, and must run before any migration (it is not evidence a column is missing).
        const provider = makeProvider();
        const { promoter, purge } = stubPromoter(
            provider,
            { A: [] },
            { A: [{ sourceKey: 'roundId', columnName: 'roundId' }] },
        );

        const result = await promoter.PromoteForSync('ci-1', ['A']);

        expect(purge).toHaveBeenCalledTimes(1);
        expect(purge.mock.calls[0][3]).toEqual([{ sourceKey: 'roundId', columnName: 'roundId' }]);
        expect(runPipelineBatchMock).not.toHaveBeenCalled();
        expect(result.Promoted).toBe(false);
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
    /** fieldMaps: source key -> the destination column the field map names (as the data records it). */
    function resolve(
        promoter: IntegrationCustomColumnPromoter,
        candidates: string[],
        entityFields: string[],
        fieldMaps: Record<string, string>,
    ) {
        const entityInfo = { Fields: entityFields.map(n => ({ Name: n })) } as unknown as EntityInfo;
        return (promoter as unknown as {
            resolveWorkItems: (p: Array<{ Key: string }>, e: EntityInfo, f: ReadonlyMap<string, string>) => Array<Record<string, unknown>>;
        }).resolveWorkItems(
            candidates.map(Key => ({ Key })),
            entityInfo,
            new Map(Object.entries(fieldMaps).map(([k, v]) => [k.toLowerCase(), v])),
        );
    }

    it('a key whose column AND field map exist becomes a recoverSpread item, not a silent skip', () => {
        const promoter = new IntegrationCustomColumnPromoter(user, makeProvider());
        const items = resolve(promoter, ['roundId'], ['ID', 'roundId'], { roundId: 'roundId' });
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ recoverSpread: true, needsColumn: false, needsFieldMap: false, columnName: 'roundId' });
    });

    it('a brand-new key still plans column + field map, with no recovery flag', () => {
        const promoter = new IntegrationCustomColumnPromoter(user, makeProvider());
        const items = resolve(promoter, ['newKey'], ['ID'], {});
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ needsColumn: true, needsFieldMap: true });
        expect(items[0].recoverSpread).toBeFalsy();
    });

    it('a collision-suffixed column is found via the field map, not re-promoted', () => {
        // The real column is `roundId_2` — re-sanitizing 'roundId' can never produce that name, so the
        // old check read "no column yet" and minted a THIRD column beside the working one.
        const promoter = new IntegrationCustomColumnPromoter(user, makeProvider());
        const items = resolve(promoter, ['roundId'], ['ID', 'roundId_2'], { roundId: 'roundId_2' });
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ recoverSpread: true, needsColumn: false, columnName: 'roundId_2' });
    });

    it('a field map whose column is missing from stale in-process metadata is still terminal', () => {
        // entityInfo predates the ADD COLUMN in THIS process. The map names the column, so the key is
        // already promoted — planning another column for it is the duplicate-column bug.
        const promoter = new IntegrationCustomColumnPromoter(user, makeProvider());
        const items = resolve(promoter, ['roundId'], ['ID'], { roundId: 'roundId' });
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ needsColumn: false, needsFieldMap: false, columnName: 'roundId' });
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
            spreadOneRow: (r: unknown, n: unknown, h: boolean, m: string[]) => Promise<boolean>;
        }).spreadOneRow(row, named, false, []);
    }

    it('fills a still-null destination from the overflow JSON, strips the key, and saves', async () => {
        const row = makeRow({ __mj_integration_CustomFields: JSON.stringify({ roundId: 42 }), roundId: null });
        await spread(row, [workItem('roundId')]);
        expect(row._data['roundId']).toBe(42);
        // The key was the only one staged, so the column goes null — the same shape the engine's
        // own eviction writes, and what drops this row out of the `IS NOT NULL` scan.
        expect(row._data['__mj_integration_CustomFields']).toBeNull();
        expect(row.Save).toHaveBeenCalledTimes(1);
    });

    it('leaves an already-backfilled VALUE alone but still strips the key', async () => {
        // The destination is settled, so the value is not rewritten. The key is removed regardless:
        // it has a column and an active field map, so it is no longer unmapped, and leaving it staged
        // is exactly what re-offers it as a phantom new column forever.
        const row = makeRow({ __mj_integration_CustomFields: JSON.stringify({ roundId: 42 }), roundId: 99 });
        await spread(row, [workItem('roundId', { recoverSpread: true })]);
        expect(row._data['roundId']).toBe(99);
        expect(row._data['__mj_integration_CustomFields']).toBeNull();
        expect(row.Save).toHaveBeenCalledTimes(1);
    });

    it('keeps the still-unmapped keys and reports the row as staying in the scan', async () => {
        const row = makeRow({
            __mj_integration_CustomFields: JSON.stringify({ roundId: 42, notYetPromoted: 'x' }),
            roundId: null,
        });
        const promoter = new IntegrationCustomColumnPromoter(user, makeProvider());
        const left = await (promoter as unknown as {
            spreadOneRow: (r: unknown, n: unknown, h: boolean, m: string[]) => Promise<boolean>;
        }).spreadOneRow(row, [workItem('roundId')], false, []);
        expect(JSON.parse(row._data['__mj_integration_CustomFields'] as string)).toEqual({ notYetPromoted: 'x' });
        // Still carries overflow, so it is still in the filtered set — the paged walk must NOT count
        // it as removed or it will skip a later row.
        expect(left).toBe(false);
    });
});
