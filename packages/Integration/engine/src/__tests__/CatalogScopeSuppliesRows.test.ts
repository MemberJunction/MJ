/**
 * The catalog scope supplies a connection's rows (MJ-RUN-43, engine half).
 *
 * The per-connection catalog stopped being two boot-time datasets holding every connection's
 * objects and fields for the life of the process (a ~3.8 GB idle floor on a NetForum catalog of
 * 888 objects / 97,414 fields). This package now supplies the rows to the engine-base getters per
 * scope, split by access pattern:
 *
 *   objects — every consumer walks them; loaded whole at scope entry;
 *   edges   — only the dependency sort needs every field, and only three columns of each; loaded
 *             whole at scope entry as plain rows;
 *   fields  — everything else wants ONE object's fields; warmed per object into a cache bounded
 *             by ROWS, because width varies 117 average to 2,539 widest.
 *
 * Every read here bypasses the query cache: these entities' cached answers are not invalidated by
 * the writes a discovery makes, and a stale empty answer is how every object came to look keyless.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CATALOG_EDGE_COLUMNS,
    CATALOG_FIELD_COLUMNS,
    CATALOG_OBJECT_COLUMNS,
    ENTITY_COMPANY_INTEGRATION_OBJECTS,
    ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
    IntegrationEngineBase,
} from '@memberjunction/integration-engine-base';

type Params = {
    EntityName: string; ExtraFilter?: string; ResultType?: string; Fields?: string[]; BypassCache?: boolean;
};
type Answer = { Success: boolean; Results?: unknown[]; ErrorMessage?: string };

const calls: Params[] = [];
/** Answers by entity; a function answer sees the params, so a field read can answer per object. */
const answers: Record<string, Answer | ((p: Params) => Answer)> = {};
let catalogRegistered = true;

vi.mock('@memberjunction/core', async (orig) => {
    const actual = await orig<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: () => {},
        RunView: class {
            async RunView(p: Params) {
                calls.push(p);
                const a = answers[p.EntityName];
                return typeof a === 'function' ? a(p) : (a ?? { Success: true, Results: [] });
            }
        },
        Metadata: class {
            static get Provider() {
                return { EntityByName: (n: string) => (catalogRegistered ? { Name: n } : undefined) };
            }
        },
    };
});

const {
    CatalogFieldCacheStats,
    EvictCatalogScope,
    FIELD_ROW_BUDGET,
    LoadCatalogScope,
    RunInCatalogScope,
    RunInWarmedCatalogScope,
    UnpinCatalogObjects,
    WarmCatalogObject,
    WithCatalogScope,
} = await import('../CatalogScope.js');
const { CompanyIntegrationCatalogReadFailed } = await import('../CatalogWriter.js');

const INTEGRATION = 'AAAAAAAA-1111-2222-3333-444444444444';
const CONN_A = 'CCCCCCCC-0000-0000-0000-00000000000A';
const CONN_B = 'CCCCCCCC-0000-0000-0000-00000000000B';
const USER = { ID: 'u-1', Name: 'tester' } as never;

function row(columns: readonly string[], values: Record<string, unknown>) {
    const all: Record<string, unknown> = {};
    for (const c of columns) all[c] = null;
    Object.assign(all, values);
    return { Fields: Object.keys(all).map(Name => ({ Name })), Get: (c: string) => all[c] };
}

const objectRow = (id: string, ci: string, name: string, sequence = 1) =>
    row(CATALOG_OBJECT_COLUMNS, { ID: id, CompanyIntegrationID: ci, IntegrationID: INTEGRATION, Name: name, Status: 'Active', Sequence: sequence });
const fieldRow = (id: string, objectID: string, name: string) =>
    row(CATALOG_FIELD_COLUMNS, { ID: id, CompanyIntegrationObjectID: objectID, Name: name, Status: 'Active', Sequence: 1 });
const fieldRows = (objectID: string, n: number) => Array.from({ length: n }, (_, i) => fieldRow(`${objectID}-f${i}`, objectID, `col${i}`));

const OBJ_A1 = 'BBBBBBBB-0000-0000-0000-0000000000A1';
const OBJ_A2 = 'BBBBBBBB-0000-0000-0000-0000000000A2';
const OBJ_B1 = 'BBBBBBBB-0000-0000-0000-0000000000B1';

/** Objects per connection, and field rows per object, as the database would answer them. */
let objectsByConnection: Record<string, ReturnType<typeof objectRow>[]> = {};
let fieldsByObject: Record<string, ReturnType<typeof fieldRow>[]> = {};

function answerFromTables(): void {
    answers[ENTITY_COMPANY_INTEGRATION_OBJECTS] = (p) => {
        const ci = /CompanyIntegrationID = '([^']+)'/.exec(p.ExtraFilter ?? '')?.[1] ?? '';
        return { Success: true, Results: objectsByConnection[ci] ?? [] };
    };
    answers[ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS] = (p) => {
        if (p.ResultType === 'simple') return { Success: true, Results: [] }; // the edge set
        const oid = /CompanyIntegrationObjectID = '([^']+)'/.exec(p.ExtraFilter ?? '')?.[1] ?? '';
        return { Success: true, Results: fieldsByObject[oid] ?? [] };
    };
}

const engine = () => IntegrationEngineBase.Instance;
const objectReads = () => calls.filter(c => c.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECTS);
const edgeReads = () => calls.filter(c => c.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS && c.ResultType === 'simple');
const fieldReads = () => calls.filter(c => c.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS && c.ResultType !== 'simple');

beforeEach(() => {
    EvictCatalogScope();
    calls.length = 0;
    for (const k of Object.keys(answers)) delete answers[k];
    catalogRegistered = true;
    objectsByConnection = {
        [CONN_A]: [objectRow(OBJ_A1, CONN_A, 'Members', 1), objectRow(OBJ_A2, CONN_A, 'Orders', 2)],
        [CONN_B]: [objectRow(OBJ_B1, CONN_B, 'Events', 1)],
    };
    fieldsByObject = { [OBJ_A1]: fieldRows(OBJ_A1, 3), [OBJ_A2]: fieldRows(OBJ_A2, 2), [OBJ_B1]: fieldRows(OBJ_B1, 1) };
    answerFromTables();
    engine().SeedForTesting({
        IntegrationObjects: [{ ID: 'shared-1', IntegrationID: INTEGRATION, Name: 'SharedOnly', Status: 'Active', Sequence: 1 }] as never,
        CompanyIntegrationObjects: [],
        CompanyIntegrationObjectFields: [],
    });
});

describe('a scope loads its connection\'s objects and edges at entry', () => {
    it('WithCatalogScope reads objects and the narrow edge set once, bypassing the query cache', async () => {
        const names = await WithCatalogScope(CONN_A, async () => engine().GetActiveIntegrationObjects(INTEGRATION).map(o => o.Name), USER);
        expect(names).toEqual(['Members', 'Orders']);

        expect(objectReads()).toHaveLength(1);
        expect(objectReads()[0].ExtraFilter).toBe(`CompanyIntegrationID = '${CONN_A}'`);
        expect(objectReads()[0].ResultType).toBe('entity_object');
        expect(objectReads()[0].BypassCache).toBe(true);

        expect(edgeReads()).toHaveLength(1);
        expect(edgeReads()[0].Fields).toEqual([...CATALOG_EDGE_COLUMNS]);
        // The ids come from the rows' VALUES. A loaded row has no `ID` property (no generated
        // subclass), so reading `row.ID` would put 'undefined' into this filter.
        expect(edgeReads()[0].ExtraFilter).toBe(`CompanyIntegrationObjectID IN ('${OBJ_A1}','${OBJ_A2}')`);
        expect(edgeReads()[0].BypassCache).toBe(true);

        // Memoised: a second entry for the same connection reads nothing.
        await WithCatalogScope(CONN_A, async () => undefined, USER);
        expect(objectReads()).toHaveLength(1);
    });

    it('the edge set is read in chunks of 200 object ids', async () => {
        objectsByConnection[CONN_A] = Array.from({ length: 401 }, (_, i) =>
            objectRow(`BBBBBBBB-0000-0000-0000-${String(i).padStart(12, '0')}`, CONN_A, `O${i}`, i));
        await LoadCatalogScope(CONN_A, USER);
        expect(edgeReads()).toHaveLength(3);
    });

    it('RunInCatalogScope never loads — a synchronous entry reads only what is already loaded', async () => {
        expect(RunInCatalogScope(CONN_A, () => engine().GetActiveIntegrationObjects(INTEGRATION).map(o => o.Name))).toEqual(['SharedOnly']);
        expect(calls).toHaveLength(0);
        await LoadCatalogScope(CONN_A, USER);
        expect(RunInCatalogScope(CONN_A, () => engine().GetActiveIntegrationObjects(INTEGRATION).map(o => o.Name))).toEqual(['Members', 'Orders']);
    });

    it('a failed load is an error that is not remembered, never an empty catalog', async () => {
        answers[ENTITY_COMPANY_INTEGRATION_OBJECTS] = { Success: false, ErrorMessage: 'permission denied' };
        await expect(LoadCatalogScope(CONN_A, USER)).rejects.toBeInstanceOf(CompanyIntegrationCatalogReadFailed);
        answerFromTables();
        await LoadCatalogScope(CONN_A, USER);
        expect(RunInCatalogScope(CONN_A, () => engine().HasCompanyIntegrationCatalog(CONN_A))).toBe(true);
    });

    it('a workspace without the per-connection entities reads nothing and stays on the shared catalog', async () => {
        catalogRegistered = false;
        const names = await WithCatalogScope(CONN_A, async () => engine().GetActiveIntegrationObjects(INTEGRATION).map(o => o.Name), USER);
        expect(names).toEqual(['SharedOnly']);
        expect(calls).toHaveLength(0);
    });
});

describe('field rows are warmed per object into a row-bounded cache', () => {
    it('an armed scope refuses a cold object, and answers once it is warm', async () => {
        await LoadCatalogScope(CONN_A, USER);
        RunInWarmedCatalogScope(CONN_A, () => {
            expect(() => engine().GetIntegrationObjectFields(OBJ_A1)).toThrow(/PER_CONNECTION_CATALOG_OBJECT_COLD/);
        });
        await RunInWarmedCatalogScope(CONN_A, () => WarmCatalogObject(OBJ_A1, USER));
        RunInWarmedCatalogScope(CONN_A, () => {
            expect(engine().GetIntegrationObjectFields(OBJ_A1).map(f => f.Name)).toEqual(['col0', 'col1', 'col2']);
        });
        expect(fieldReads()).toHaveLength(1);
        expect(fieldReads()[0].ExtraFilter).toBe(`CompanyIntegrationObjectID = '${OBJ_A1}'`);
        expect(fieldReads()[0].ResultType).toBe('entity_object');
        expect(fieldReads()[0].BypassCache).toBe(true);
    });

    it('an unarmed scope reads a cold object as empty, as it always did', async () => {
        const fields = await WithCatalogScope(CONN_A, async () => engine().GetIntegrationObjectFields(OBJ_A1), USER);
        expect(fields).toEqual([]);
    });

    it('re-warming a warm object costs no query, and concurrent warms share one', async () => {
        await Promise.all([WarmCatalogObject(OBJ_A1, USER), WarmCatalogObject(OBJ_A1, USER)]);
        await WarmCatalogObject(OBJ_A1, USER);
        expect(fieldReads()).toHaveLength(1);
        expect(CatalogFieldCacheStats()).toEqual({ Objects: 1, Rows: 3, Pinned: 1 });
        UnpinCatalogObjects([OBJ_A1, OBJ_A1, OBJ_A1]);
        expect(CatalogFieldCacheStats().Pinned).toBe(0);
    });

    it('past the row budget the oldest UNPINNED object goes; a pinned one never does', async () => {
        const half = Math.ceil(FIELD_ROW_BUDGET * 0.6);
        fieldsByObject[OBJ_A1] = fieldRows(OBJ_A1, half);
        fieldsByObject[OBJ_A2] = fieldRows(OBJ_A2, half);
        fieldsByObject[OBJ_B1] = fieldRows(OBJ_B1, half);

        await WarmCatalogObject(OBJ_A1, USER);
        await WarmCatalogObject(OBJ_A2, USER);          // both pinned: over budget, nothing may go
        expect(CatalogFieldCacheStats()).toEqual({ Objects: 2, Rows: 2 * half, Pinned: 2 });

        UnpinCatalogObjects([OBJ_A1]);                  // A1 is now evictable, and is evicted
        expect(CatalogFieldCacheStats()).toEqual({ Objects: 1, Rows: half, Pinned: 1 });

        UnpinCatalogObjects([OBJ_A2]);
        await WarmCatalogObject(OBJ_B1, USER);          // A2 is the oldest unpinned
        expect(CatalogFieldCacheStats()).toEqual({ Objects: 1, Rows: half, Pinned: 1 });
        await LoadCatalogScope(CONN_A, USER);
        RunInWarmedCatalogScope(CONN_A, () => {
            expect(() => engine().GetIntegrationObjectFields(OBJ_A2)).toThrow(/OBJECT_COLD/);
        });
    });

    it('a failed warm throws, releases its pin and caches nothing', async () => {
        answers[ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS] = { Success: false, ErrorMessage: 'timeout' };
        await expect(WarmCatalogObject(OBJ_A1, USER)).rejects.toBeInstanceOf(CompanyIntegrationCatalogReadFailed);
        expect(CatalogFieldCacheStats()).toEqual({ Objects: 0, Rows: 0, Pinned: 0 });
    });

    it('EvictCatalogScope(connection) drops that connection\'s rows and leaves another\'s', async () => {
        await WithCatalogScope(CONN_A, () => WarmCatalogObject(OBJ_A1, USER), USER);
        await WithCatalogScope(CONN_B, () => WarmCatalogObject(OBJ_B1, USER), USER);
        expect(CatalogFieldCacheStats().Objects).toBe(2);

        EvictCatalogScope(CONN_A);
        expect(CatalogFieldCacheStats()).toEqual({ Objects: 1, Rows: 1, Pinned: 1 });
        expect(RunInCatalogScope(CONN_A, () => engine().HasCompanyIntegrationCatalog(CONN_A))).toBe(false);
        expect(RunInCatalogScope(CONN_B, () => engine().HasCompanyIntegrationCatalog(CONN_B))).toBe(true);
    });
});
