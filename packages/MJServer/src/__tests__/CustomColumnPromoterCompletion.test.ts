/**
 * Completing a promotion after the restart.
 *
 * The post-restart consumer calls CompletePromotion with no catalog scope. Unscoped, a connection
 * with per-connection rows reads as having none, so building its catalog writer threw
 * PER_CONNECTION_CATALOG_MISSING. CompletePromotion caught that per entity and returned normally,
 * and the consumer marked the pending work Completed: the columns existed in the database and were
 * never mapped, with nothing failed anywhere.
 *
 * So: the catalog writes run in the connection's own scope, entered per entry; and a failed entry
 * no longer returns normally — the others still run, then the failure is thrown, so the consumer
 * fails the pending row instead of completing it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
    scopeAtBuild: [] as Array<string | undefined>,
    savedFields: [] as string[],
}));

vi.mock('@memberjunction/schema-engine', () => ({
    RuntimeSchemaManager: { get Instance() { return {}; } },
}));
vi.mock('@memberjunction/integration-schema-builder', () => ({ DDLGenerator: class {} }));

// The real scope; only the writer is replaced. It behaves as the real one does for a connection
// with per-connection rows: outside that connection's scope it cannot tell, and refuses.
vi.mock('@memberjunction/integration-engine', async (orig) => {
    const actual = await orig<typeof import('@memberjunction/integration-engine')>();
    return {
        ...actual,
        BuildCatalogWriter: () => {
            const ci = actual.CurrentCatalogCI();
            h.scopeAtBuild.push(ci);
            if (!ci) throw new Error('PER_CONNECTION_CATALOG_MISSING: built outside the connection scope');
            return {
                ObjectsInScope: async () => [{ Name: 'Members', ID: 'obj-members' }],
                FieldsForObject: async () => [],
                LoadField: async () => null,
                NewFieldRow: async () => {
                    const row: Record<string, unknown> = {};
                    return Object.assign(row, { Save: async () => { h.savedFields.push(String(row.Name)); return true; } });
                },
                StampNewField: () => undefined,
            };
        },
    };
});

import type { UserInfo, IMetadataProvider, EntityInfo } from '@memberjunction/core';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { WithCatalogScope } from '@memberjunction/integration-engine';
import { IntegrationCustomColumnPromoter } from '../integration/CustomColumnPromoter.js';

const USER = { ID: 'u-1' } as UserInfo;
const CONN = 'CCCCCCCC-0000-0000-0000-000000000001';
const OTHER_CONN = 'CCCCCCCC-0000-0000-0000-000000000002';

type Seams = {
    createIntegrationObjectFields: (integrationID: string, entityMapID: string, objectName: string, named: unknown[]) => Promise<void>;
    activeFieldMaps: unknown; createFieldMaps: unknown; spreadAndRebaseline: unknown;
};

function provider(known: string[]): IMetadataProvider {
    return {
        EntityByName: (n: string) => (known.includes(n) ? ({ Name: n } as unknown as EntityInfo) : undefined),
        PlatformKey: 'sqlserver',
    } as unknown as IMetadataProvider;
}

const region = { sourceKey: 'region', columnName: 'region', candidate: { Coverage: 0.5, Inferred: { SchemaFieldType: 'nvarchar', MaxLength: 50 } } };

function entry(entityName: string) {
    return {
        EntityName: entityName, EntityMapID: `em-${entityName}`, ExternalObjectName: 'Members', IntegrationID: 'int-1',
        Columns: [{ SourceKey: 'region', ColumnName: 'region', SchemaFieldType: 'nvarchar', MaxLength: 50, Coverage: 0.5 }],
    };
}

beforeEach(() => {
    h.scopeAtBuild.length = 0;
    h.savedFields.length = 0;
    // No catalog entities registered: entering a scope loads nothing and reads nothing.
    vi.spyOn(IntegrationEngineBase.Instance, 'ProviderToUse', 'get').mockImplementation(() => ({ EntityByName: () => undefined }) as never);
    vi.spyOn(IntegrationEngineBase.Instance, 'EntityMaps', 'get')
        .mockReturnValue([{ ID: 'em-Members', CompanyIntegrationID: CONN }] as never);
    vi.spyOn(IntegrationEngineBase.Instance, 'GetCompanyIntegrationByID')
        .mockImplementation((id: string) => ({ ID: id }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('the catalog writes of a promotion run in the connection\'s own scope', () => {
    it('called with no scope (the post-restart consumer), the writer is built in the connection\'s scope', async () => {
        const promoter = new IntegrationCustomColumnPromoter(USER, provider([])) as unknown as Seams;
        await promoter.createIntegrationObjectFields('int-1', 'em-Members', 'Members', [region]);
        expect(h.scopeAtBuild).toEqual([CONN]);
        expect(h.savedFields).toEqual(['region']);
    });

    it('called inside another connection\'s scope, the entry\'s own connection wins', async () => {
        const promoter = new IntegrationCustomColumnPromoter(USER, provider([])) as unknown as Seams;
        await WithCatalogScope(OTHER_CONN, () => promoter.createIntegrationObjectFields('int-1', 'em-Members', 'Members', [region]), USER);
        expect(h.scopeAtBuild).toEqual([CONN]);
    });
});

describe('CompletePromotion does not complete over a failed entity', () => {
    function stub(known: string[], failing: string[] = []) {
        const promoter = new IntegrationCustomColumnPromoter(USER, provider(known));
        const p = promoter as unknown as Seams;
        p.activeFieldMaps = vi.fn().mockResolvedValue(new Map<string, string>());
        p.createIntegrationObjectFields = vi.fn(async (_i: string, emID: string) => {
            if (failing.some(f => emID === `em-${f}`)) throw new Error('PER_CONNECTION_CATALOG_MISSING');
        });
        const maps = vi.fn().mockResolvedValue(undefined);
        p.createFieldMaps = maps;
        p.spreadAndRebaseline = vi.fn().mockResolvedValue(undefined);
        return { promoter, maps };
    }

    it('every entry completes: returns the columns and throws nothing', async () => {
        const { promoter } = stub(['A', 'B']);
        await expect(promoter.CompletePromotion([entry('A'), entry('B')])).resolves.toEqual([
            { EntityName: 'A', ColumnName: 'region' },
            { EntityName: 'B', ColumnName: 'region' },
        ]);
    });

    it('one entry fails: the others still complete, then it throws naming the failed one', async () => {
        const { promoter, maps } = stub(['A', 'B'], ['A']);
        await expect(promoter.CompletePromotion([entry('A'), entry('B')]))
            .rejects.toThrow(/PROMOTION_INCOMPLETE: 1 of 2 .*A: PER_CONNECTION_CATALOG_MISSING/);
        expect(maps).toHaveBeenCalledTimes(1);   // B's field maps were still created
    });

    it('an entity that is not found after the restart is a failure, not a skip', async () => {
        const { promoter } = stub(['B']);
        await expect(promoter.CompletePromotion([entry('A'), entry('B')]))
            .rejects.toThrow(/PROMOTION_INCOMPLETE: 1 of 2 .*A: entity not found/);
    });
});
