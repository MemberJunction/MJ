/**
 * The per-connection catalog is not resident (MJ-RUN-43, engine-base half).
 *
 * It used to be two boot-time CacheLocal datasets that loaded EVERY connection's objects and
 * fields as BaseEntity rows and kept them for the life of the process. On a NetForum catalog
 * (888 objects / 97,414 fields) an idle server held a ~3.8 GB floor against a 4748 MB heap
 * ceiling, with nothing running.
 *
 * The rows now come from whoever owns the catalog scope in force, through
 * `IntegrationEngineBase.CatalogDataResolver`. These tests pin the contract that hook has to
 * honour, from the engine-base side:
 *
 *  - Config registers neither per-connection dataset, whatever the provider knows about;
 *  - inside a scope the getters answer from the rows the scope supplies;
 *  - a scope's object whose fields were never warmed THROWS when the scope owner warms what it
 *    reads — an empty answer there is a table with no columns on a run that reports success;
 *  - the dependency walk reads the scope's narrow edge set, never full field rows, and a scope
 *    that carries no edge set is refused rather than silently sorted by Sequence.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { BaseEntity } from '@memberjunction/core';
import { IntegrationEngineBase } from '../IntegrationEngineBase';
import {
    CATALOG_FIELD_COLUMNS,
    CATALOG_OBJECT_COLUMNS,
    ENTITY_COMPANY_INTEGRATION_OBJECTS,
    ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
} from '../CompanyIntegrationCatalog';

const INTEGRATION = 'AAAAAAAA-1111-2222-3333-444444444444';
const CONNECTION = 'CCCCCCCC-1111-2222-3333-444444444444';
// Parent and child objects of ONE connection. Sequence order is deliberately the REVERSE of the
// dependency order, so a test can tell an edge-driven sort from a Sequence fallback.
const PARENT = 'BBBBBBBB-0000-0000-0000-000000000001';
const CHILD = 'BBBBBBBB-0000-0000-0000-000000000002';
const SHARED_OBJECT = 'DDDDDDDD-0000-0000-0000-000000000001';

/** A loaded per-connection row stand-in: `Get` answers for the real view columns. */
function row(columns: readonly string[], values: Record<string, unknown>): BaseEntity {
    const all: Record<string, unknown> = {};
    for (const c of columns) all[c] = null;
    Object.assign(all, values);
    return { Fields: Object.keys(all).map(Name => ({ Name })), Get: (c: string) => all[c] } as unknown as BaseEntity;
}

const objectRow = (id: string, name: string, sequence: number) => row(CATALOG_OBJECT_COLUMNS, {
    ID: id, CompanyIntegrationID: CONNECTION, IntegrationID: INTEGRATION, Name: name, Status: 'Active', Sequence: sequence,
});

const fieldRow = (id: string, objectID: string, name: string, related: string | null = null) => row(CATALOG_FIELD_COLUMNS, {
    ID: id, CompanyIntegrationObjectID: objectID, RelatedCompanyIntegrationObjectID: related, Name: name,
    Status: 'Active', Sequence: 1, IsPrimaryKey: name === 'id',
});

type ScopeData = {
    Objects: BaseEntity[];
    FieldsByObjectID: Map<string, BaseEntity[]>;
    Edges?: Array<{ ID: string; CompanyIntegrationObjectID: string; RelatedCompanyIntegrationObjectID: string | null }>;
    RequireWarmFields: boolean;
};

/** The two static hooks the engine package installs; set here directly, as a scope owner would. */
type Hooks = {
    CatalogScopeResolver: (() => string | undefined) | undefined;
    CatalogDataResolver: (() => ScopeData | undefined) | undefined;
};
const hooks = IntegrationEngineBase as unknown as Hooks;

function enterScope(data: ScopeData): void {
    hooks.CatalogScopeResolver = () => CONNECTION;
    hooks.CatalogDataResolver = () => data;
}

function scopeData(overrides: Partial<ScopeData> = {}): ScopeData {
    return {
        // CHILD first: Sequence 1 is the child, so a Sequence-order answer puts it before its parent.
        Objects: [objectRow(CHILD, 'Child', 1), objectRow(PARENT, 'Parent', 2)],
        FieldsByObjectID: new Map(),
        Edges: [{ ID: 'e1', CompanyIntegrationObjectID: CHILD, RelatedCompanyIntegrationObjectID: PARENT }],
        RequireWarmFields: true,
        ...overrides,
    };
}

describe('the per-connection catalog is not resident', () => {
    let engine: IntegrationEngineBase;

    beforeEach(() => {
        engine = IntegrationEngineBase.Instance;
        engine.SeedForTesting({
            IntegrationObjects: [{ ID: SHARED_OBJECT, IntegrationID: INTEGRATION, Name: 'Shared', Status: 'Active', Sequence: 1 }] as never,
            IntegrationObjectFields: [{ ID: 'sf1', IntegrationObjectID: SHARED_OBJECT, Name: 'id', Status: 'Active', Sequence: 1 }] as never,
            CompanyIntegrationObjects: [],
            CompanyIntegrationObjectFields: [],
        });
    });

    afterEach(() => {
        hooks.CatalogScopeResolver = undefined;
        hooks.CatalogDataResolver = undefined;
    });

    it('Config registers neither per-connection dataset, even once its entities exist', async () => {
        const captured: string[][] = [];
        const host = engine as unknown as { Load(params: Array<{ PropertyName: string; EntityName?: string }>): Promise<void> };
        const savedLoad = host.Load;
        host.Load = async params => { captured.push(params.map(p => p.EntityName ?? p.PropertyName)); };
        try {
            await engine.Config(false, {} as never, { EntityByName: (n: string) => ({ Name: n }) } as never);
        } finally {
            host.Load = savedLoad;
        }
        expect(captured).toHaveLength(1);
        expect(captured[0]).toContain('MJ: Integration Objects');
        expect(captured[0]).not.toContain(ENTITY_COMPANY_INTEGRATION_OBJECTS);
        expect(captured[0]).not.toContain(ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS);
    });

    it('inside a scope, the existing getters answer from the rows the scope supplies', () => {
        enterScope(scopeData());
        expect(engine.HasCompanyIntegrationCatalog(CONNECTION)).toBe(true);
        expect(engine.GetActiveIntegrationObjects(INTEGRATION).map(o => o.Name)).toEqual(['Child', 'Parent']);
        expect(engine.GetIntegrationObjectByID(PARENT)?.Name).toBe('Parent');
    });

    it('a WARM object answers with its own field rows, projected', () => {
        const fields = [fieldRow('f1', PARENT, 'id'), fieldRow('f2', PARENT, 'name')];
        enterScope(scopeData({ FieldsByObjectID: new Map([[PARENT.toLowerCase(), fields]]) }));
        const read = engine.GetIntegrationObjectFields(PARENT);
        expect(read.map(f => f.Name)).toEqual(['id', 'name']);
        // Projected, not the raw rows: the per-connection column surfaces under its legacy name.
        expect(read[0].IntegrationObjectID).toBe(PARENT);
        expect(engine.GetIntegrationObjectFields(PARENT.toLowerCase()).map(f => f.Name)).toEqual(['id', 'name']);
    });

    it('a COLD object of the scope throws when the scope owner warms what it reads', () => {
        enterScope(scopeData());
        expect(() => engine.GetIntegrationObjectFields(PARENT)).toThrow(/PER_CONNECTION_CATALOG_OBJECT_COLD/);
    });

    it('…and answers empty in a scope whose owner does not warm (the pre-existing quiet answer)', () => {
        enterScope(scopeData({ RequireWarmFields: false }));
        expect(engine.GetIntegrationObjectFields(PARENT)).toEqual([]);
    });

    it('an id the scope does not own is never refused — a shared object still reads its resident fields', () => {
        enterScope(scopeData());
        expect(engine.GetIntegrationObjectFields(SHARED_OBJECT).map(f => f.Name)).toEqual(['id']);
        expect(engine.GetIntegrationObjectFields('99999999-9999-9999-9999-999999999999')).toEqual([]);
    });

    it('the dependency order comes from the edge set, with no field row warm at all', () => {
        enterScope(scopeData());
        expect(engine.GetObjectsInDependencyOrder(INTEGRATION).map(o => o.Name)).toEqual(['Parent', 'Child']);
    });

    it('a scope that carries no edge set is refused rather than sorted by Sequence', () => {
        enterScope(scopeData({ Edges: undefined }));
        expect(() => engine.GetObjectsInDependencyOrder(INTEGRATION)).toThrow(/PER_CONNECTION_CATALOG_NO_EDGES/);
    });

    it('GetRelatedIntegrationObjectIDs reads a cold per-connection object\'s parents from the edges', () => {
        enterScope(scopeData());
        expect(engine.GetRelatedIntegrationObjectIDs(CHILD)).toEqual([PARENT]);
        expect(engine.GetRelatedIntegrationObjectIDs(PARENT)).toEqual([]);
    });

    it('GetRelatedIntegrationObjectIDs reads a shared object\'s parents from its resident fields', () => {
        engine.SeedForTesting({
            IntegrationObjectFields: [
                { ID: 'sf1', IntegrationObjectID: SHARED_OBJECT, Name: 'parentId', RelatedIntegrationObjectID: 'P-1', Status: 'Active', Sequence: 1 },
                { ID: 'sf2', IntegrationObjectID: SHARED_OBJECT, Name: 'otherParentId', RelatedIntegrationObjectID: 'P-1', Status: 'Active', Sequence: 2 },
                { ID: 'sf3', IntegrationObjectID: SHARED_OBJECT, Name: 'name', RelatedIntegrationObjectID: null, Status: 'Active', Sequence: 3 },
            ] as never,
        });
        expect(engine.GetRelatedIntegrationObjectIDs(SHARED_OBJECT)).toEqual(['P-1']);
    });

    it('with no resolver installed (a client bundle), the seeded rows answer exactly as before', () => {
        engine.SeedForTesting({
            CompanyIntegrationObjects: [objectRow(PARENT, 'Parent', 1)],
            CompanyIntegrationObjectFields: [fieldRow('f1', PARENT, 'id')],
        });
        hooks.CatalogScopeResolver = () => CONNECTION;
        expect(engine.GetActiveIntegrationObjects(INTEGRATION).map(o => o.Name)).toEqual(['Parent']);
        expect(engine.GetIntegrationObjectFields(PARENT).map(f => f.Name)).toEqual(['id']);
    });

    it('a resolver installed but no scope in force reads the seeded rows too — a probe must answer "no", not throw', () => {
        hooks.CatalogDataResolver = () => undefined;
        expect(engine.HasCompanyIntegrationCatalog(CONNECTION)).toBe(false);
        expect(engine.GetIntegrationObjectFields(PARENT)).toEqual([]);
    });
});
