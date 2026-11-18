/**
 * After an apply's restart, the field maps come from the connection's PERSISTED catalog first, and
 * the connector is introspected only for objects that have no persisted fields.
 *
 * The step used to introspect the connector for every object, in the connection's catalog scope.
 * For a connector whose `IntrospectSchema` calls the vendor (NetForum fetches a definition and a
 * sample per object), that is a live re-discovery of the whole catalog at every restart, and its
 * answer need not match the columns the apply just built from the persisted rows. The persisted
 * ACTIVE field rows are what the tables were built from, so they are what the maps are built from.
 *
 * A map that still ends with no field maps cannot write a single column, and the sync skips it.
 * The step says so by name, in the log and in the run's stream, instead of reporting a created map.
 *
 * The resolver runs against the real catalog scope from a cold cache, with only the database reads
 * stubbed. The wiring into index.ts is pinned against the source, because the consumer needs a
 * provider, a connector and an RSU queue to invoke.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RunView, type UserInfo } from '@memberjunction/core';
import {
    CATALOG_FIELD_COLUMNS,
    CATALOG_OBJECT_COLUMNS,
    ENTITY_COMPANY_INTEGRATION_OBJECTS,
    ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS,
    IntegrationEngineBase,
} from '@memberjunction/integration-engine-base';
import { EvictCatalogScope } from '@memberjunction/integration-engine';
import { ResolvePostRestartFields, type IntrospectedSchema } from '../integration/PostRestartIntrospect.js';

const SRC = readFileSync(join(__dirname, '..', 'index.ts'), 'utf-8');

const INTEGRATION = 'AAAAAAAA-1111-2222-3333-444444444444';
const CONN = 'CCCCCCCC-0000-0000-0000-000000000001';
const MEMBERS = 'BBBBBBBB-0000-0000-0000-000000000001'; // persisted fields
const EVENTS = 'BBBBBBBB-0000-0000-0000-000000000002';  // persisted object, no field rows
const OTHER = 'BBBBBBBB-0000-0000-0000-000000000003';   // persisted, never requested
const USER = { ID: 'u-1' } as UserInfo;
type RunViewParams = Parameters<RunView['RunView']>[0];
type RunViewResult = Awaited<ReturnType<RunView['RunView']>>;

function entityRow(columns: readonly string[], values: Record<string, unknown>) {
    const all: Record<string, unknown> = {};
    for (const c of columns) all[c] = null;
    Object.assign(all, values);
    return { Fields: Object.keys(all).map(Name => ({ Name })), Get: (c: string) => all[c] };
}
const objectRow = (ID: string, Name: string, Sequence: number) => entityRow(CATALOG_OBJECT_COLUMNS, {
    ID, CompanyIntegrationID: CONN, IntegrationID: INTEGRATION, Name, Status: 'Active', Sequence,
});
/** A per-connection field row as the build read returns it (plain, not an entity). */
const storedField = (CompanyIntegrationObjectID: string, Name: string, extra: Record<string, unknown> = {}) => ({
    ID: `${CompanyIntegrationObjectID}-${Name}`, CompanyIntegrationObjectID, Name, Status: 'Active',
    IsPrimaryKey: false, IsRequired: false, RelatedCompanyIntegrationObjectID: null, ...extra,
});

let objectsInDb: ReturnType<typeof entityRow>[] = [];
let storedFields: ReturnType<typeof storedField>[] = [];
let buildReadFails = false;
let buildReadFilters: string[] = [];
let warmedObjectIDs: string[] = [];

function answer(p: RunViewParams): RunViewResult {
    const ok = (Results: unknown[]) => ({ Success: true, Results } as unknown as RunViewResult);
    const filter = String(p.ExtraFilter ?? '');
    if (p.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECTS) return ok(objectsInDb);
    if (p.EntityName !== ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS) return ok([]);
    if (filter.includes('RelatedCompanyIntegrationObjectID IS NOT NULL')) return ok([]); // the scope's edge set
    if (filter.includes(' IN (')) {
        // The persisted-field read (LoadScopedFieldsForBuild).
        buildReadFilters.push(filter);
        if (buildReadFails) return { Success: false, ErrorMessage: 'connection reset', Results: [] } as unknown as RunViewResult;
        const ids = new Set([...filter.matchAll(/'([^']+)'/g)].map(m => m[1].toUpperCase()));
        return ok(storedFields.filter(f => ids.has(f.CompanyIntegrationObjectID.toUpperCase())));
    }
    // A per-object warm (IntrospectInCatalogScope) — answered from the same stored rows.
    const oid = /CompanyIntegrationObjectID = '([^']+)'/.exec(filter)?.[1] ?? '';
    warmedObjectIDs.push(oid.toUpperCase());
    return ok(storedFields
        .filter(f => f.CompanyIntegrationObjectID.toUpperCase() === oid.toUpperCase())
        .map(f => entityRow(CATALOG_FIELD_COLUMNS, f)));
}

/** A connector whose introspection would call the vendor. It answers for every object it knows. */
function vendorIntrospect(objects: IntrospectedSchema['Objects']) {
    return vi.fn(async (): Promise<IntrospectedSchema> => ({ Objects: objects }));
}

const resolve = (names: string[], introspect: () => Promise<IntrospectedSchema>) =>
    ResolvePostRestartFields(CONN, INTEGRATION, names, introspect, USER);

beforeEach(() => {
    EvictCatalogScope(); // a freshly restarted process: nothing loaded, nothing warm
    objectsInDb = [objectRow(MEMBERS, 'Members', 1), objectRow(EVENTS, 'Events', 2), objectRow(OTHER, 'Other', 3)];
    storedFields = [
        storedField(MEMBERS, 'id', { IsPrimaryKey: true, IsRequired: true }),
        storedField(MEMBERS, 'region', { IsRequired: null }),
        storedField(MEMBERS, 'retired', { Status: 'Inactive' }),
        storedField(OTHER, 'other_id', { IsPrimaryKey: true }),
    ];
    buildReadFails = false;
    buildReadFilters = [];
    warmedObjectIDs = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (p: RunViewParams) => answer(p));
    vi.spyOn(IntegrationEngineBase.Instance, 'ProviderToUse', 'get')
        .mockImplementation(() => ({ EntityByName: (n: string) => ({ Name: n }) }) as never);
    IntegrationEngineBase.Instance.SeedForTesting({
        IntegrationObjects: [], IntegrationObjectFields: [], CompanyIntegrationObjects: [], CompanyIntegrationObjectFields: [],
    });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('ResolvePostRestartFields', () => {
    it('maps an object with persisted fields from them, without calling IntrospectSchema', async () => {
        const introspect = vendorIntrospect([{ ExternalName: 'Members', Fields: [{ Name: 'declared_only' }] }]);

        const resolved = await resolve(['Members'], introspect);

        expect(introspect).not.toHaveBeenCalled();
        expect(resolved.Introspected).toEqual([]);
        expect(resolved.PersistedCount).toBe(1);
        // ACTIVE rows only, flags carried as booleans (a null IsRequired is false).
        expect(resolved.FieldsByObject.get('members')).toEqual([
            { Name: 'id', IsPrimaryKey: true, IsRequired: true },
            { Name: 'region', IsPrimaryKey: false, IsRequired: false },
        ]);
    });

    it('matches the requested name in any case', async () => {
        const resolved = await resolve(['MEMBERS'], vendorIntrospect([]));
        expect(resolved.FieldsByObject.get('members')?.map(f => f.Name)).toEqual(['id', 'region']);
    });

    it('reads persisted fields only for the requested objects', async () => {
        await resolve(['Members'], vendorIntrospect([]));
        expect(buildReadFilters).toHaveLength(1);
        expect(buildReadFilters[0]).toContain(MEMBERS);
        expect(buildReadFilters[0]).not.toContain(EVENTS);
        expect(buildReadFilters[0]).not.toContain(OTHER);
    });

    it('introspects only for an object with none persisted, and warms only that object', async () => {
        const introspect = vendorIntrospect([
            { ExternalName: 'Members', Fields: [{ Name: 'declared_only' }] },
            { ExternalName: 'Events', Fields: [{ Name: 'evt_id', IsPrimaryKey: true }, { Name: 'title' }] },
        ]);

        const resolved = await resolve(['Members', 'Events'], introspect);

        expect(introspect).toHaveBeenCalledOnce();
        expect(resolved.Introspected).toEqual(['Events']);
        expect(warmedObjectIDs).toEqual([EVENTS]);
        // The persisted answer wins for Members even though the introspection also named it.
        expect(resolved.FieldsByObject.get('members')?.map(f => f.Name)).toEqual(['id', 'region']);
        expect(resolved.FieldsByObject.get('events')).toEqual([
            { Name: 'evt_id', IsPrimaryKey: true, IsRequired: false },
            { Name: 'title', IsPrimaryKey: false, IsRequired: false },
        ]);
    });

    it('leaves an object no source answers for absent, for the caller to report', async () => {
        const resolved = await resolve(['Members', 'Ghost'], vendorIntrospect([]));

        expect(resolved.Introspected).toEqual(['Ghost']);
        expect(resolved.FieldsByObject.has('ghost')).toBe(false);
    });

    it('THROWS on a failed persisted read, and introspects nothing', async () => {
        buildReadFails = true;
        const introspect = vendorIntrospect([]);

        await expect(resolve(['Members'], introspect)).rejects.toThrow(/PER_CONNECTION_FIELDS_UNREADABLE/);
        expect(introspect).not.toHaveBeenCalled();
    });

    it('a connection with no catalog of its own introspects every object, as before', async () => {
        objectsInDb = [];
        const introspect = vendorIntrospect([{ ExternalName: 'Members', Fields: [{ Name: 'shared_id', IsPrimaryKey: true }] }]);

        const resolved = await resolve(['Members'], introspect);

        expect(introspect).toHaveBeenCalledOnce();
        expect(buildReadFilters).toEqual([]);
        expect(resolved.FieldsByObject.get('members')?.map(f => f.Name)).toEqual(['shared_id']);
    });

    it('an empty request reads nothing and introspects nothing', async () => {
        const introspect = vendorIntrospect([]);
        const resolved = await resolve([], introspect);
        expect(resolved.FieldsByObject.size).toBe(0);
        expect(buildReadFilters).toEqual([]);
        expect(introspect).not.toHaveBeenCalled();
    });
});

describe('index.ts builds the post-restart field maps from the resolver', () => {
    const loopStart = SRC.indexOf('for (const objName of item.SourceObjectNames)');
    const loopEnd = SRC.indexOf('progress?.CompleteEntityMaps(', loopStart);
    const loop = loopStart >= 0 && loopEnd > loopStart ? SRC.slice(loopStart, loopEnd) : '';

    it('resolves the fields once, for the item\'s connection and objects, before the loop', () => {
        const at = SRC.search(
            /await ResolvePostRestartFields\(\s*item\.CompanyIntegrationID\s*,\s*companyIntegration\.IntegrationID\s*,\s*item\.SourceObjectNames\s*,\s*\(\)\s*=>\s*introspect\(\s*companyIntegration\s*,\s*systemUser\s*\)\s*,\s*systemUser\s*,?\s*\)/,
        );
        expect(at).toBeGreaterThan(0);
        expect(at).toBeLessThan(loopStart);
    });

    it('maps each object from the resolved fields', () => {
        expect(loop).toMatch(/SelectFieldsToMap\(\s*postRestartFields\.FieldsByObject\.get\(\s*objName\.toLowerCase\(\)\s*\)\s*\?\?\s*\[\]\s*,\s*selectedFields\s*\)/);
        expect(SRC).not.toMatch(/sourceObj\?\.Fields/);
    });

    it('names a map that ends with no field maps with console.error, and does not count it as mapped', () => {
        expect(loop).toMatch(/console\.error\(\s*`\[RSU\] NO FIELD MAPS for \$\{objName\}/);
        const noMapsAt = loop.indexOf('withoutFieldMaps.push(objName)');
        const mappedAt = loop.indexOf('mappedObjectNames.add(objName)');
        expect(noMapsAt).toBeGreaterThan(0);
        expect(mappedAt).toBeGreaterThan(noMapsAt);
        expect(loop.slice(noMapsAt, mappedAt)).toMatch(/^withoutFieldMaps\.push\(objName\);\s*continue;/);
    });

    it('reports those objects into the run as a failed entity-map stage', () => {
        expect(SRC).toMatch(/if \(withoutFieldMaps\.length > 0\) \{\s*progress\?\.FailEntityMaps\([\s\S]*?withoutFieldMaps\s*\)/);
    });
});
