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
    // Keyless parent: declares NO IsPrimaryKey. Its key must be resolved from the FETCHED rows (the value-statistic classifier over the fetched rows), never presupposed.
    objOrgKeyless: [f({ Name: 'id', Status: 'Active', Sequence: 1 })],
    objEventsKL: [
        f({ Name: 'evId', IsPrimaryKey: true, Status: 'Active', Sequence: 1 }),
        f({ Name: 'id', RelatedIntegrationObjectID: 'objOrgKeyless', Status: 'Active', Sequence: 2 }),
    ],
};
const objOrg = { ID: 'objOrg', Name: 'Orgs', APIPath: '/orgs', SupportsPagination: false, PaginationType: 'None', ResponseDataKey: null } as unknown as MJIntegrationObjectEntity;
const objEvents = { ID: 'objEvents', Name: 'events', APIPath: '/orgs/{OrgId}/events', SupportsPagination: false, PaginationType: 'None', ResponseDataKey: null } as unknown as MJIntegrationObjectEntity;
const objOrgKeyless = { ID: 'objOrgKeyless', Name: 'OrgsKL', APIPath: '/orgskl', SupportsPagination: false, PaginationType: 'None', ResponseDataKey: null } as unknown as MJIntegrationObjectEntity;
const objEventsKL = { ID: 'objEventsKL', Name: 'eventsKL', APIPath: '/orgskl/{id}/events', SupportsPagination: false, PaginationType: 'None', ResponseDataKey: null } as unknown as MJIntegrationObjectEntity;
const OBJ_BY_ID: Record<string, MJIntegrationObjectEntity> = { objOrg, objEvents, objOrgKeyless, objEventsKL };
const OBJ_BY_NAME: Record<string, MJIntegrationObjectEntity> = { Orgs: objOrg, events: objEvents, OrgsKL: objOrgKeyless, eventsKL: objEventsKL };

/** Parent rows the (mock) vendor returns. Varied per test. */
let orgRows: Array<{ OrgId: string }> = [];
let keylessOrgRows: Array<{ id: string }> = [];

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
        if (path === '/orgskl') return { Status: 200, Body: keylessOrgRows, Headers: {} } as RESTResponse;
        const mkl = /^\/orgskl\/([^/]+)\/events$/.exec(path);
        if (mkl) return { Status: 200, Body: [{ evId: `e-${mkl[1]}` }], Headers: {} } as RESTResponse;
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
        keylessOrgRows = [{ id: 'kl1' }, { id: 'kl2' }];
        vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
            GetIntegrationObjectByID: (id: string) => OBJ_BY_ID[id],
            GetIntegrationObject: (_int: string, name: string) => OBJ_BY_NAME[name],
            GetIntegrationObjectFields: (id: string) => FIELDS[id] ?? [],
            GetActiveIntegrationObjects: () => [objOrg, objEvents, objOrgKeyless, objEventsKL],
        } as unknown as IntegrationEngineBase);
    });

    describe('the gap (proves the fix is required)', () => {
        it('a template-var child yields ZERO records at discovery when no parents are synced', async () => {
            const c = new TestConnector();
            const result = await c.FetchChanges(childCtx());   // sync path — FetchChanges never samples parents
            expect(result.Records).toEqual([]);
            expect(result.Warnings?.[0]?.Code).toBe('ZERO_PARENTS');
            // On the sync path the connector must NOT reach out for a parent sample — the child is simply empty.
            expect(c.urls).toEqual([]);
        });

        it('is ALSO the sync-path behavior: no flag → ZERO_PARENTS is preserved (sync must sync the parent first)', async () => {
            // Same call as above, asserted as the regression guard: the fix must NOT change the sync path,
            // which never live-samples parents. An unsynced parent still means "sync the parent first".
            const c = new TestConnector();
            const result = await c.FetchChanges(childCtx());
            expect(result.Warnings?.[0]?.Code).toBe('ZERO_PARENTS');
        });
    });

    describe('the fix', () => {
        // NOTE: these exercise the SINGLE discovery mechanism — DiscoverFieldsViaFetch → the REST
        // DiscoverySampleRecordStream override → StreamRecordsForDiscovery. (The old FetchChanges-with-
        // DiscoverySampleParents path was removed as dead code; see rkihm-BC #3049.)
        it('the child live-samples its parent and yields child records tagged with the parent FK', async () => {
            const c = new TestConnector();
            const ci = { IntegrationID: 'int1' } as unknown as MJCompanyIntegrationEntity;
            const fields = await c.DiscoverFieldsViaFetch(ci, 'events', {} as UserInfo);
            // Parent /orgs live-sampled, then one child fetch per sampled org.
            expect(c.urls.filter(u => u.endsWith('/orgs')).length).toBeGreaterThanOrEqual(1);
            expect(childPaths(c)).toEqual(['/orgs/org1/events', '/orgs/org2/events', '/orgs/org3/events']);
            // The resolved parent FK (OrgId, tagged onto each child row) is surfaced in the child's fields.
            expect(fields.map(fl => fl.Name)).toContain('OrgId');
        });

        it('resolves a keyless parent\'s key from the FETCHED rows (no declared PK) — not presupposed', async () => {
            // OrgsKL declares no IsPrimaryKey. The key must come from the rows fetch returned — the
            // value-statistic classifier over the fetched rows picks 'id', never an assumed name. So a
            // keyless parent's child still samples.
            const c = new TestConnector();
            const ci = { IntegrationID: 'int1' } as unknown as MJCompanyIntegrationEntity;
            await c.DiscoverFieldsViaFetch(ci, 'eventsKL', {} as UserInfo);
            expect(c.urls.filter(u => u.endsWith('/orgskl')).length).toBeGreaterThanOrEqual(1); // keyless parent WAS fetched
            const kids = c.urls.map(u => u.replace('https://api.test', '')).filter(p => p.startsWith('/orgskl/')).sort();
            expect(kids).toEqual(['/orgskl/kl1/events', '/orgskl/kl2/events']);   // child sampled via key from fetched rows
        });

        it('walks parents until the CHILD target — no fixed "N parents per child" cap', async () => {
            orgRows = [{ OrgId: 'o1' }, { OrgId: 'o2' }, { OrgId: 'o3' }, { OrgId: 'o4' }, { OrgId: 'o5' }];
            const c = new TestConnector();
            const ci = { IntegrationID: 'int1' } as unknown as MJCompanyIntegrationEntity;
            // Each org yields 1 child, so with a large target the child accumulates across as many parents
            // as it takes — all 5 here — NOT a fixed count of parents.
            await c.DiscoverFieldsViaFetch(ci, 'events', {} as UserInfo, { MaxRecords: 500 });
            expect(childPaths(c).length).toBe(5);
        });

        it('DiscoverFieldsViaFetch surfaces a template-var child\'s fields at discovery on an empty DB', async () => {
            // The real user-facing path: DiscoverFieldsViaFetch drives the recursive parent-sample stream
            // itself, so the child is no longer field-less at discovery. Pre-fix this returned no sampled fields.
            const c = new TestConnector();
            const ci = { IntegrationID: 'int1' } as unknown as MJCompanyIntegrationEntity;
            const fields = await c.DiscoverFieldsViaFetch(ci, 'events', {} as UserInfo);
            const names = fields.map(fl => fl.Name);
            expect(names).toContain('id');
            expect(names).toContain('OrgId');
        });

        it('the recursive sampler is RECORD-CONSTRAINED: streams parents only until the child hits its target', async () => {
            // 5 parents, 1 child each. With a target of 2, StreamRecordsForDiscovery must fetch children
            // under only ~2 parents and STOP — it must NOT walk all 5. (Sync walks everything via the DAG;
            // discovery is record-constrained, so a million-row parent is streamed and cut off early.)
            orgRows = [{ OrgId: 'o1' }, { OrgId: 'o2' }, { OrgId: 'o3' }, { OrgId: 'o4' }, { OrgId: 'o5' }];
            const c = new TestConnector();
            const ci = { IntegrationID: 'int1' } as unknown as MJCompanyIntegrationEntity;
            await c.DiscoverFieldsViaFetch(ci, 'events', {} as UserInfo, { MaxRecords: 2 });
            const kids = c.urls.map(u => u.replace('https://api.test', '')).filter(p => p.endsWith('/events'));
            expect(kids.length).toBe(2);   // stopped at the target — did NOT fetch under all 5 parents
        });
    });
});
