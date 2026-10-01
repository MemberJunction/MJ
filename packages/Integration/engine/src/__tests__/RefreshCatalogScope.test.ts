/**
 * RefreshCatalogScope re-reads a connection's catalog inside a scope that is already open
 * (MJ-RUN-46).
 *
 * A scope's catalog is memoised from when it was loaded. A FIRST discovery loads it before the
 * connection has any rows, so it is empty — and Persist then writing 888 rows does not disturb
 * it. The two-pass discovery heal exists to sample objects that "came into existence in the
 * Persist that follows", and it refreshed IntegrationEngineBase's arrays, which since the catalog
 * stopped being resident (MJ-RUN-43) are not where a connection's rows live. So the heal re-read
 * an empty catalog and sampled nothing. Live on the sandbox 2026-09-21: both passes failed with
 * 460+1248 `IntegrationObject not found`, AFTER Persist had written all 888 rows; 862 of 888
 * objects ended with no primary key and no fields, and the run reported Success.
 *
 * Eviction alone is not a refresh: inside an open scope the getters are synchronous and cannot
 * query, so an evicted connection reads as having no catalog and falls back to the shared one.
 * RefreshCatalogScope reads, then swaps.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CATALOG_FIELD_COLUMNS,
    CATALOG_OBJECT_COLUMNS,
    ENTITY_COMPANY_INTEGRATION_OBJECTS,
    ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
    IntegrationEngineBase,
} from '@memberjunction/integration-engine-base';

type Params = { EntityName: string; ExtraFilter?: string; ResultType?: string };
let objectsInDb: unknown[] = [];
let objectReadFails = false;
let objectReadGate: Promise<void> | null = null;

vi.mock('@memberjunction/core', async (orig) => {
    const actual = await orig<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: () => {},
        RunView: class {
            async RunView(p: Params) {
                if (p.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECTS) {
                    if (objectReadGate) await objectReadGate;
                    return objectReadFails ? { Success: false, ErrorMessage: 'connection reset' } : { Success: true, Results: objectsInDb };
                }
                if (p.ResultType === 'simple') return { Success: true, Results: [] };
                const oid = /CompanyIntegrationObjectID = '([^']+)'/.exec(p.ExtraFilter ?? '')?.[1] ?? '';
                return { Success: true, Results: [fieldRow(oid)] };
            }
        },
        Metadata: class {
            static get Provider() { return { EntityByName: (n: string) => ({ Name: n }) }; }
        },
    };
});

const {
    CatalogFieldCacheStats, EvictCatalogScope, RefreshCatalogScope, UnpinCatalogObjects, WarmCatalogObject, WithCatalogScope,
} = await import('../CatalogScope.js');

const INTEGRATION = 'AAAAAAAA-1111-2222-3333-444444444444';
const CONN = 'CCCCCCCC-0000-0000-0000-000000000001';
const OTHER = 'CCCCCCCC-0000-0000-0000-000000000002';
const USER = { ID: 'u-1' } as never;

function row(columns: readonly string[], values: Record<string, unknown>) {
    const all: Record<string, unknown> = {};
    for (const c of columns) all[c] = null;
    Object.assign(all, values);
    return { Fields: Object.keys(all).map(Name => ({ Name })), Get: (c: string) => all[c] };
}
const objectRow = (id: string, name: string) =>
    row(CATALOG_OBJECT_COLUMNS, { ID: id, CompanyIntegrationID: CONN, IntegrationID: INTEGRATION, Name: name, Status: 'Active', Sequence: 1 });
function fieldRow(objectID: string) {
    return row(CATALOG_FIELD_COLUMNS, { ID: `${objectID}-f`, CompanyIntegrationObjectID: objectID, Name: 'id', Status: 'Active', Sequence: 1 });
}

const engine = () => IntegrationEngineBase.Instance;
const names = () => engine().GetActiveIntegrationObjects(INTEGRATION).map(o => o.Name);

beforeEach(() => {
    EvictCatalogScope();
    objectsInDb = [];
    objectReadFails = false;
    objectReadGate = null;
    engine().SeedForTesting({
        IntegrationObjects: [{ ID: 'shared-1', IntegrationID: INTEGRATION, Name: 'Declared', Status: 'Active', Sequence: 1 }] as never,
        CompanyIntegrationObjects: [],
        CompanyIntegrationObjectFields: [],
    });
});

describe('RefreshCatalogScope', () => {
    it('makes what Persist wrote visible inside a scope opened before the connection had rows', async () => {
        await WithCatalogScope(CONN, async () => {
            expect(names()).toEqual(['Declared']);                 // a first discovery: no rows yet
            objectsInDb = [objectRow('BBBBBBBB-0000-0000-0000-000000000001', 'Members')];  // Persist
            expect(names()).toEqual(['Declared']);                 // memoised from scope entry
            await RefreshCatalogScope(CONN, USER);
            expect(names()).toEqual(['Members']);                  // the heal can now sample it
            expect(engine().HasCompanyIntegrationCatalog(CONN)).toBe(true);
        }, USER);
    });

    it('eviction alone is not a refresh: the open scope falls back to the shared catalog', async () => {
        objectsInDb = [objectRow('BBBBBBBB-0000-0000-0000-000000000001', 'Members')];
        await WithCatalogScope(CONN, async () => {
            expect(names()).toEqual(['Members']);
            EvictCatalogScope(CONN);
            expect(names()).toEqual(['Declared']);
        }, USER);
    });

    it('reads, THEN swaps — the previous catalog answers until the fresh one is in place', async () => {
        objectsInDb = [objectRow('BBBBBBBB-0000-0000-0000-000000000001', 'Members')];
        await WithCatalogScope(CONN, async () => {
            let release!: () => void;
            objectReadGate = new Promise<void>(r => { release = r; });
            objectsInDb = [objectRow('BBBBBBBB-0000-0000-0000-000000000001', 'Members'), objectRow('BBBBBBBB-0000-0000-0000-000000000002', 'Orders')];
            const refreshing = RefreshCatalogScope(CONN, USER);
            expect(names()).toEqual(['Members']);                  // never "no catalog" mid-refresh
            release();
            await refreshing;
            expect(names()).toEqual(['Members', 'Orders']);
        }, USER);
    });

    it('a failed refresh throws and leaves the previous catalog in place', async () => {
        objectsInDb = [objectRow('BBBBBBBB-0000-0000-0000-000000000001', 'Members')];
        await WithCatalogScope(CONN, async () => {
            objectReadFails = true;
            await expect(RefreshCatalogScope(CONN, USER)).rejects.toThrow(/connection reset/);
            expect(names()).toEqual(['Members']);
        }, USER);
    });

    it('drops the connection\'s stale field rows — but not another connection\'s, nor one a running map has pinned', async () => {
        await WithCatalogScope(CONN, async () => {
            await WarmCatalogObject('BBBBBBBB-0000-0000-0000-0000000000A1', USER);
            UnpinCatalogObjects(['BBBBBBBB-0000-0000-0000-0000000000A1']);  // finished: stale after a rewrite
            await WarmCatalogObject('BBBBBBBB-0000-0000-0000-0000000000A2', USER);  // still in flight
        }, USER);
        await WithCatalogScope(OTHER, () => WarmCatalogObject('BBBBBBBB-0000-0000-0000-0000000000B1', USER), USER);
        expect(CatalogFieldCacheStats().Objects).toBe(3);

        await RefreshCatalogScope(CONN, USER);
        expect(CatalogFieldCacheStats()).toEqual({ Objects: 2, Rows: 2, Pinned: 2 });
    });

    it('is a no-op for an empty connection id', async () => {
        await RefreshCatalogScope('', USER);
        expect(CatalogFieldCacheStats().Objects).toBe(0);
    });
});
