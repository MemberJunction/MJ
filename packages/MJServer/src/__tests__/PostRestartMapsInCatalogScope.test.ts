/**
 * The per-connection catalog answers correctly only when a read happens INSIDE a scope naming the
 * connection; an unscoped read falls back to the shared catalog by design. Every request-time entry
 * point enters the scope in the resolver. The one entry point that is NOT request-time is the
 * post-restart consumer in index.ts: after the RSU restarts the process it introspects the connector
 * to build the entity and field maps, and nothing upstream of it has entered a scope.
 *
 * Unscoped, that introspection sees only the declared fields, so every column this connection's own
 * discovery sampled gets a table column (the RSU built the schema in scope) but no field map, and its
 * values land in the overflow JSON instead of the column. On the sandbox that was 69 of 556 columns.
 *
 * Entering the scope is not enough on its own. In a freshly restarted process nothing has loaded the
 * connection's catalog, so a synchronous entry reads the shared one; and an async entry loads objects
 * but not fields, so a connector reading fields gets the connection's objects with none. These run
 * the real catalog scope from a cold cache, with only the database reads stubbed.
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
import { CatalogFieldCacheStats, EvictCatalogScope, RunInCatalogScope, WithCatalogScope } from '@memberjunction/integration-engine';
import { IntrospectInCatalogScope } from '../integration/PostRestartIntrospect.js';

const SRC = readFileSync(join(__dirname, '..', 'index.ts'), 'utf-8');

const INTEGRATION = 'AAAAAAAA-1111-2222-3333-444444444444';
const CONN = 'CCCCCCCC-0000-0000-0000-000000000001';
const MEMBERS = 'BBBBBBBB-0000-0000-0000-000000000001';
const USER = { ID: 'u-1' } as UserInfo;
type RunViewParams = Parameters<RunView['RunView']>[0];
type RunViewResult = Awaited<ReturnType<RunView['RunView']>>;

function row(columns: readonly string[], values: Record<string, unknown>) {
    const all: Record<string, unknown> = {};
    for (const c of columns) all[c] = null;
    Object.assign(all, values);
    return { Fields: Object.keys(all).map(Name => ({ Name })), Get: (c: string) => all[c] };
}
const membersRow = row(CATALOG_OBJECT_COLUMNS, {
    ID: MEMBERS, CompanyIntegrationID: CONN, IntegrationID: INTEGRATION, Name: 'Members', Status: 'Active', Sequence: 1,
});
// `region` is the column this connection's discovery sampled; the connector never declared it.
const memberFields = [
    row(CATALOG_FIELD_COLUMNS, { ID: 'f0', CompanyIntegrationObjectID: MEMBERS, Name: 'id', Status: 'Active', Sequence: 1 }),
    row(CATALOG_FIELD_COLUMNS, { ID: 'f1', CompanyIntegrationObjectID: MEMBERS, Name: 'region', Status: 'Active', Sequence: 2 }),
];

let objectsInDb: ReturnType<typeof row>[] = [];
let fieldReadFails = false;
let fieldReads = 0;

function answer(p: RunViewParams): RunViewResult {
    const ok = (Results: unknown[]) => ({ Success: true, Results } as unknown as RunViewResult);
    if (p.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECTS) return ok(objectsInDb);
    if (p.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS && p.ResultType === 'simple') return ok([]); // the edge set
    if (p.EntityName === ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS) {
        fieldReads++;
        if (fieldReadFails) return { Success: false, ErrorMessage: 'connection reset', Results: [] } as unknown as RunViewResult;
        const oid = /CompanyIntegrationObjectID = '([^']+)'/.exec(String(p.ExtraFilter ?? ''))?.[1] ?? '';
        return ok(oid.toUpperCase() === MEMBERS ? memberFields : []);
    }
    return ok([]);
}

/** What a REST connector's IntrospectSchema reads: the object by integration + name, then its fields. */
async function introspectMembers(): Promise<string[]> {
    const base = IntegrationEngineBase.Instance;
    const obj = base.GetIntegrationObject(INTEGRATION, 'Members');
    return obj ? base.GetIntegrationObjectFields(obj.ID).map(f => f.Name) : [];
}

beforeEach(() => {
    EvictCatalogScope();                     // a freshly restarted process: nothing loaded, nothing warm
    objectsInDb = [membersRow];
    fieldReadFails = false;
    fieldReads = 0;
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (p: RunViewParams) => answer(p));
    vi.spyOn(IntegrationEngineBase.Instance, 'ProviderToUse', 'get')
        .mockImplementation(() => ({ EntityByName: (n: string) => ({ Name: n }) }) as never);
    IntegrationEngineBase.Instance.SeedForTesting({
        IntegrationObjects: [], IntegrationObjectFields: [], CompanyIntegrationObjects: [], CompanyIntegrationObjectFields: [],
    });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('post-restart introspection sees the connection\'s own fields from a cold catalog', () => {
    it('introspects the per-connection fields, sampled column included', async () => {
        const fields = await IntrospectInCatalogScope(CONN, ['Members'], introspectMembers, USER);
        expect(fields).toEqual(['id', 'region']);
    });

    it('releases its pins after the introspection', async () => {
        await IntrospectInCatalogScope(CONN, ['Members'], introspectMembers, USER);
        expect(CatalogFieldCacheStats().Pinned).toBe(0);
    });

    it('releases its pins when the introspection throws, and the error propagates', async () => {
        await expect(IntrospectInCatalogScope(CONN, ['Members'], async () => { throw new Error('vendor 503'); }, USER))
            .rejects.toThrow('vendor 503');
        expect(CatalogFieldCacheStats().Pinned).toBe(0);
    });

    it('a failed field read throws instead of introspecting an object with no fields', async () => {
        fieldReadFails = true;
        const introspect = vi.fn(introspectMembers);
        await expect(IntrospectInCatalogScope(CONN, ['Members'], introspect, USER)).rejects.toThrow();
        expect(introspect).not.toHaveBeenCalled();
    });

    it('a connection with no catalog of its own warms nothing and introspects as before', async () => {
        objectsInDb = [];
        const introspect = vi.fn(async () => 'shared');
        expect(await IntrospectInCatalogScope(CONN, ['Members'], introspect, USER)).toBe('shared');
        expect(introspect).toHaveBeenCalledOnce();
        expect(fieldReads).toBe(0);
    });

    it('why: a synchronous scope on a cold process reads the shared catalog — no object at all', async () => {
        expect(await RunInCatalogScope(CONN, introspectMembers)).toEqual([]);
    });

    it('why: an async scope without the warm finds the object but none of its fields', async () => {
        expect(await WithCatalogScope(CONN, introspectMembers, USER)).toEqual([]);
    });
});

describe('index.ts wires the post-restart introspection through it', () => {
    it('introspects through IntrospectInCatalogScope for the item\'s connection and objects', () => {
        // Whitespace-tolerant: formatters may wrap the call.
        expect(SRC).toMatch(
            /const schema = await IntrospectInCatalogScope\(\s*item\.CompanyIntegrationID\s*,\s*item\.SourceObjectNames\s*,\s*\(\)\s*=>\s*introspect\(\s*companyIntegration\s*,\s*systemUser\s*\)\s*,\s*systemUser\s*,?\s*\)/,
        );
    });

    it('has no bare or synchronously scoped post-restart introspect call left', () => {
        expect(SRC).not.toMatch(/const schema = await introspect\(companyIntegration, systemUser\)/);
        expect(SRC).not.toMatch(/RunInCatalogScope\(\s*item\.CompanyIntegrationID/);
    });
});
