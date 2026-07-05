import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { BaseRESTIntegrationConnector, type RESTAuthContext, type RESTResponse, type PaginationState } from '../BaseRESTIntegrationConnector.js';
import type { FetchContext } from '../BaseIntegrationConnector.js';

// LoadParentIDs reads the SYNCED DB via RunView. At DISCOVERY the DB is empty, so this mock returns
// no synced parent rows — the exact condition that makes a template-var CHILD un-sampleable (the gap
// this fix closes). The Company Integration Entity Maps lookup returns [] → LoadParentIDs returns [].
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class {
            async RunView() { return { Success: true, Results: [] as Record<string, unknown>[] }; }
        },
    };
});

// ── Fixture: parent Orgs (flat, PK OrgId) → child events (/orgs/{OrgId}/events) ──
const f = (o: Partial<MJIntegrationObjectFieldEntity>) => o as unknown as MJIntegrationObjectFieldEntity;
const FIELDS: Record<string, MJIntegrationObjectFieldEntity[]> = {
    objOrg: [f({ Name: 'OrgId', IsPrimaryKey: true, Status: 'Active', Sequence: 1 })],
    objEvents: [
        f({ Name: 'id', IsPrimaryKey: true, Status: 'Active', Sequence: 1 }),
        f({ Name: 'OrgId', RelatedIntegrationObjectID: 'objOrg', Status: 'Active', Sequence: 2 }),
    ],
};
const objOrg = { ID: 'objOrg', Name: 'Orgs', APIPath: '/orgs', SupportsPagination: false, PaginationType: 'None', ResponseDataKey: null } as unknown as MJIntegrationObjectEntity;
const objEvents = { ID: 'objEvents', Name: 'events', APIPath: '/orgs/{OrgId}/events', SupportsPagination: false, PaginationType: 'None', ResponseDataKey: null } as unknown as MJIntegrationObjectEntity;
const OBJ_BY_ID: Record<string, MJIntegrationObjectEntity> = { objOrg, objEvents };
const OBJ_BY_NAME: Record<string, MJIntegrationObjectEntity> = { Orgs: objOrg, events: objEvents };

/** How many parent Orgs the (mock) vendor returns from GET /orgs. Varied per test. */
let orgRows: Array<{ OrgId: string }> = [];

class TestConnector extends BaseRESTIntegrationConnector {
    public urls: string[] = [];
    public get IntegrationName(): string { return 'Test'; }
    protected GetCachedObject(_intID: string, objectName: string): MJIntegrationObjectEntity {
        const o = OBJ_BY_NAME[objectName];
        if (!o) throw new Error(`no object ${objectName}`);
        return o;
    }
    protected GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] { return FIELDS[objectID] ?? []; }
    protected async Authenticate(): Promise<RESTAuthContext> { return { Token: 't' } as RESTAuthContext; }
    protected BuildHeaders(): Record<string, string> { return {}; }
    protected GetBaseURL(): string { return 'https://api.test'; }
    protected async MakeHTTPRequest(_a: RESTAuthContext, url: string): Promise<RESTResponse> {
        this.urls.push(url);
        const path = url.replace('https://api.test', '');
        if (path === '/orgs') return { Status: 200, Body: orgRows, Headers: {} } as RESTResponse;
        const m = /^\/orgs\/([^/]+)\/events$/.exec(path);
        if (m) return { Status: 200, Body: [{ id: `e-${m[1]}` }], Headers: {} } as RESTResponse;
        return { Status: 404, Body: [], Headers: {} } as RESTResponse;
    }
    protected NormalizeResponse(body: unknown): Record<string, unknown>[] { return Array.isArray(body) ? body as Record<string, unknown>[] : []; }
    protected ExtractPaginationInfo(): PaginationState { return { HasMore: false } as PaginationState; }
}

const childCtx = (extra?: Partial<FetchContext>): FetchContext => ({
    CompanyIntegration: { IntegrationID: 'int1' } as unknown as MJCompanyIntegrationEntity,
    ObjectName: 'events',
    WatermarkValue: null,
    BatchSize: 100,
    ContextUser: {} as UserInfo,
    ...extra,
});

const childPaths = (c: TestConnector) => c.urls.map(u => u.replace('https://api.test', '')).filter(p => p.endsWith('/events')).sort();

describe('BaseRESTIntegrationConnector — discovery-time parent sampling (§sample-discover per entity)', () => {
    beforeEach(() => {
        orgRows = [{ OrgId: 'org1' }, { OrgId: 'org2' }, { OrgId: 'org3' }];
        vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
            GetIntegrationObjectByID: (id: string) => OBJ_BY_ID[id],
            GetIntegrationObject: (_int: string, name: string) => OBJ_BY_NAME[name],
            GetIntegrationObjectFields: (id: string) => FIELDS[id] ?? [],
            GetActiveIntegrationObjects: () => [objOrg, objEvents],
        } as unknown as IntegrationEngineBase);
    });

    describe('the gap (proves the fix is required)', () => {
        it('a template-var child yields ZERO records at discovery when no parents are synced', async () => {
            const c = new TestConnector();
            const result = await c.FetchChanges(childCtx());   // no DiscoverySampleParents flag
            expect(result.Records).toEqual([]);
            expect(result.Warnings?.[0]?.Code).toBe('ZERO_PARENTS');
            // Without the flag the connector must NOT reach out for a parent sample — the child is simply empty.
            expect(c.urls).toEqual([]);
        });

        it('is ALSO the sync-path behavior: no flag → ZERO_PARENTS is preserved (sync must sync the parent first)', async () => {
            // Same call as above, asserted as the regression guard: the fix must NOT change the sync path,
            // which never sets DiscoverySampleParents. An unsynced parent still means "sync the parent first".
            const c = new TestConnector();
            const result = await c.FetchChanges(childCtx());
            expect(result.Warnings?.[0]?.Code).toBe('ZERO_PARENTS');
        });
    });

    describe('the fix', () => {
        it('with DiscoverySampleParents, the child live-samples its parent and yields records', async () => {
            const c = new TestConnector();
            const result = await c.FetchChanges(childCtx({ DiscoverySampleParents: true }));
            // Parent GET /orgs sampled exactly once, then one child fetch per sampled org.
            expect(c.urls.filter(u => u.endsWith('/orgs')).length).toBe(1);
            expect(childPaths(c)).toEqual(['/orgs/org1/events', '/orgs/org2/events', '/orgs/org3/events']);
            expect(result.Records.length).toBe(3);
            // Each child record carries the resolved parent FK (tagged during iteration) + its own PK.
            expect(result.Records[0].Fields.OrgId).toBeDefined();
        });

        it('bounds the live parent sample to DiscoverySampleParentCount (default 3)', async () => {
            orgRows = [{ OrgId: 'o1' }, { OrgId: 'o2' }, { OrgId: 'o3' }, { OrgId: 'o4' }, { OrgId: 'o5' }];
            const c = new TestConnector();
            await c.FetchChanges(childCtx({ DiscoverySampleParents: true }));
            // 5 parents available, but discovery only needs a few to sample the child's fields.
            expect(childPaths(c).length).toBe(3);
        });

        it('DiscoverFieldsViaFetch surfaces a template-var child\'s fields at discovery on an empty DB', async () => {
            // The real user-facing path: DiscoverFieldsViaFetch sets DiscoverySampleParents itself, so the
            // child is no longer field-less at discovery. Pre-fix this returned no sampled fields.
            const c = new TestConnector();
            const ci = { IntegrationID: 'int1' } as unknown as MJCompanyIntegrationEntity;
            const fields = await c.DiscoverFieldsViaFetch(ci, 'events', {} as UserInfo);
            const names = fields.map(fl => fl.Name);
            expect(names).toContain('id');
            expect(names).toContain('OrgId');
        });
    });
});
