/**
 * The sync loop warms what it reads (MJ-RUN-43, engine half).
 *
 * A connection's field rows are no longer resident: they are warmed per object into a row-bounded
 * cache, and a sync runs in a scope where reading a cold object of its own connection THROWS
 * rather than answering `[]` — an empty answer there builds records with no key, which can never
 * be matched again and are re-inserted on every later sync.
 *
 * So the loop must warm, before the reads happen:
 *  - each entity map's own object, and its parents (a child's nested fetch reads its parent's
 *    key fields), pinned while the map runs and released after — in the layer loop AND in the
 *    opt-in cross-layer pipelined path;
 * and it must build its dependency graph from the edge set, because the graph is built before
 * anything is warm. It also re-reads the connection's catalog at the head of the run: rows are
 * memoised per process, and a discovery that ran since would otherwise be invisible to the sync.
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

vi.mock('@memberjunction/core', async (orig) => {
    const actual = await orig<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: () => {},
        LogStatusEx: () => {},
        RunView: class {
            async RunView(p: Params) { return answer(p); }
        },
        Metadata: class {
            static get Provider() { return { EntityByName: (n: string) => ({ Name: n }) }; }
        },
    };
});

const { IntegrationEngine } = await import('../IntegrationEngine.js');
const { CatalogFieldCacheStats, EvictCatalogScope, LoadCatalogScope, RunInWarmedCatalogScope } = await import('../CatalogScope.js');

const INTEGRATION = 'AAAAAAAA-1111-2222-3333-444444444444';
const CONN = 'CCCCCCCC-0000-0000-0000-000000000001';
const PARENT = 'BBBBBBBB-0000-0000-0000-000000000001';
const CHILD = 'BBBBBBBB-0000-0000-0000-000000000002';
const USER = { ID: 'u-1' } as never;

function row(columns: readonly string[], values: Record<string, unknown>) {
    const all: Record<string, unknown> = {};
    for (const c of columns) all[c] = null;
    Object.assign(all, values);
    return { Fields: Object.keys(all).map(Name => ({ Name })), Get: (c: string) => all[c] };
}
// The child has the LOWER Sequence, so only a real edge puts the parent first.
const parentRow = row(CATALOG_OBJECT_COLUMNS, { ID: PARENT, CompanyIntegrationID: CONN, IntegrationID: INTEGRATION, Name: 'Parent', Status: 'Active', Sequence: 2 });
const childRow = row(CATALOG_OBJECT_COLUMNS, { ID: CHILD, CompanyIntegrationID: CONN, IntegrationID: INTEGRATION, Name: 'Child', Status: 'Active', Sequence: 1 });
const field = (id: string, objectID: string, name: string) =>
    row(CATALOG_FIELD_COLUMNS, { ID: id, CompanyIntegrationObjectID: objectID, Name: name, Status: 'Active', Sequence: 1 });

let objectsInDb: ReturnType<typeof row>[] = [];
const fieldsInDb: Record<string, ReturnType<typeof row>[]> = {
    [PARENT]: [field('p0', PARENT, 'parentKey'), field('p1', PARENT, 'parentName')],
    [CHILD]: [field('c0', CHILD, 'childKey')],
};

function answer(p: Params) {
    if (p.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECTS) return { Success: true, Results: objectsInDb };
    if (p.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS && p.ResultType === 'simple') {
        return { Success: true, Results: [{ ID: 'c0', CompanyIntegrationObjectID: CHILD, RelatedCompanyIntegrationObjectID: PARENT }] };
    }
    if (p.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS) {
        const oid = /CompanyIntegrationObjectID = '([^']+)'/.exec(p.ExtraFilter ?? '')?.[1] ?? '';
        return { Success: true, Results: fieldsInDb[oid] ?? [] };
    }
    return { Success: true, Results: [] };
}

type Seen = { map: string; own: string[]; parents: string[]; pinned: number };
type Host = {
    ProcessSingleEntityMap: (config: unknown, entityMap: { ExternalObjectName: string }) => Promise<unknown>;
    ExecuteEntityMaps: (config: unknown, run: unknown, user: unknown) => Promise<{ Success: boolean; RecordsErrored: number; Errors: Array<{ ErrorMessage: string }> }>;
};

/** A real engine with ONE stub: the per-map work, which reports what it could read. */
function makeHost(seen: Seen[]): Host {
    const host = Object.create(IntegrationEngine.prototype) as Host;
    host.ProcessSingleEntityMap = async (_config, entityMap) => {
        const base = IntegrationEngineBase.Instance;
        const own = base.GetIntegrationObject(INTEGRATION, entityMap.ExternalObjectName);
        if (!own) throw new Error(`no object ${entityMap.ExternalObjectName}`);
        seen.push({
            map: entityMap.ExternalObjectName,
            own: base.GetIntegrationObjectFields(own.ID).map(f => f.Name),        // throws if cold
            parents: base.GetRelatedIntegrationObjectIDs(own.ID)
                .flatMap(id => base.GetIntegrationObjectFields(id).map(f => f.Name)),  // so does a cold parent
            pinned: CatalogFieldCacheStats().Pinned,
        });
        return { Success: true, RecordsProcessed: 1, RecordsCreated: 1, RecordsUpdated: 0, RecordsDeleted: 0, RecordsErrored: 0, RecordsSkipped: 0, Errors: [] };
    };
    return host;
}

function config(configuration: string | null) {
    return {
        companyIntegration: { ID: CONN, IntegrationID: INTEGRATION, Configuration: configuration, Get: () => undefined },
        // Child FIRST in configuration order: the parent-first order below can only come from the edge.
        entityMaps: [
            { ID: 'map-child', ExternalObjectName: 'Child', Entity: 'Children', SyncDirection: 'Pull' },
            { ID: 'map-parent', ExternalObjectName: 'Parent', Entity: 'Parents', SyncDirection: 'Pull' },
        ],
        connector: {},
    };
}

beforeEach(() => {
    EvictCatalogScope();
    objectsInDb = [parentRow, childRow];
    IntegrationEngineBase.Instance.SeedForTesting({ IntegrationObjects: [], IntegrationObjectFields: [], CompanyIntegrationObjects: [], CompanyIntegrationObjectFields: [] });
});

describe('the sync loop warms what each map reads', () => {
    it('layer loop: parents first, own and parent fields warm, pinned while the map runs, released after', async () => {
        const seen: Seen[] = [];
        const result = await RunInWarmedCatalogScope(CONN, () => makeHost(seen).ExecuteEntityMaps(config(null), {}, USER));

        expect(result.Errors.map(e => e.ErrorMessage)).toEqual([]);
        expect(result.RecordsErrored).toBe(0);
        expect(seen.map(s => s.map)).toEqual(['Parent', 'Child']);
        expect(seen.find(s => s.map === 'Parent')).toMatchObject({ own: ['parentKey', 'parentName'], parents: [], pinned: 1 });
        expect(seen.find(s => s.map === 'Child')).toMatchObject({ own: ['childKey'], parents: ['parentKey', 'parentName'], pinned: 2 });
        expect(CatalogFieldCacheStats().Pinned).toBe(0);
    });

    it('cross-layer pipelined path: the same warm site, the same release', async () => {
        const seen: Seen[] = [];
        const result = await RunInWarmedCatalogScope(CONN, () =>
            makeHost(seen).ExecuteEntityMaps(config(JSON.stringify({ crossLayerPipeline: true })), {}, USER));

        expect(result.Errors.map(e => e.ErrorMessage)).toEqual([]);
        expect(seen.map(s => s.map)).toEqual(['Parent', 'Child']);
        expect(seen.find(s => s.map === 'Child')?.parents).toEqual(['parentKey', 'parentName']);
        expect(CatalogFieldCacheStats().Pinned).toBe(0);
    });

    it('re-reads the connection\'s catalog at the head of the run, so a discovery since is visible', async () => {
        objectsInDb = [parentRow];
        await LoadCatalogScope(CONN, USER);              // this process last read it with one object
        objectsInDb = [parentRow, childRow];             // a discovery has since added the child

        const seen: Seen[] = [];
        const result = await RunInWarmedCatalogScope(CONN, () => makeHost(seen).ExecuteEntityMaps(config(null), {}, USER));

        expect(result.Errors.map(e => e.ErrorMessage)).toEqual([]);
        expect(seen.map(s => s.map)).toEqual(['Parent', 'Child']);
    });
});
