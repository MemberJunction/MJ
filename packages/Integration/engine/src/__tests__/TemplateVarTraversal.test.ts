import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { BaseRESTIntegrationConnector, type RESTAuthContext, type RESTResponse, type PaginationState, type PaginationType } from '../BaseRESTIntegrationConnector.js';
import type { FetchContext } from '../BaseIntegrationConnector.js';

// RunView is mocked so LoadParentIDs reads canned parent rows (with the ExtraFilter applied).
let runViewImpl: (params: { EntityName: string; ExtraFilter?: string; Fields?: string[] }) => { Success: boolean; Results: Record<string, unknown>[] };
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string; ExtraFilter?: string; Fields?: string[] }) {
                return runViewImpl(params);
            }
        },
    };
});

// ── Fixture: /orgs/{OrgId}/profiles/{ProfileId}/events ───────────────────────
// objOrg (PK OrgId) → MJ entity "Orgs": org1, org2
// objProfile (PK ProfileId, FK OrgId→objOrg) → MJ entity "Profiles":
//   p1(org1), p2(org2), p3(org1)
// Valid combinations (profiles filtered by their org) → 3 events fetches, NOT the
// invalid cross-products (org1×p2, org2×p1, org2×p3).
const f = (o: Partial<MJIntegrationObjectFieldEntity>) => o as unknown as MJIntegrationObjectFieldEntity;
const FIELDS: Record<string, MJIntegrationObjectFieldEntity[]> = {
    objEvents: [
        f({ Name: 'OrgId', RelatedIntegrationObjectID: 'objOrg', Status: 'Active', Sequence: 1 }),
        f({ Name: 'ProfileId', RelatedIntegrationObjectID: 'objProfile', Status: 'Active', Sequence: 2 }),
    ],
    objOrg: [f({ Name: 'OrgId', IsPrimaryKey: true, Status: 'Active', Sequence: 1 })],
    objProfile: [
        f({ Name: 'ProfileId', IsPrimaryKey: true, Status: 'Active', Sequence: 1 }),
        f({ Name: 'OrgId', RelatedIntegrationObjectID: 'objOrg', Status: 'Active', Sequence: 2 }),
    ],
};
const OBJ_BY_ID: Record<string, MJIntegrationObjectEntity> = {
    objOrg: { ID: 'objOrg', Name: 'Orgs' } as unknown as MJIntegrationObjectEntity,
    objProfile: { ID: 'objProfile', Name: 'Profiles' } as unknown as MJIntegrationObjectEntity,
};

/** Minimal concrete REST connector that records the URLs it would fetch. */
class TestConnector extends BaseRESTIntegrationConnector {
    public urls: string[] = [];
    constructor(private readonly mainObj: MJIntegrationObjectEntity, private readonly mainFields: MJIntegrationObjectFieldEntity[]) { super(); }
    public get IntegrationName(): string { return 'Test'; }
    protected GetCachedObject(): MJIntegrationObjectEntity { return this.mainObj; }
    protected GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return objectID === this.mainObj.ID ? this.mainFields : (FIELDS[objectID] ?? []);
    }
    protected async Authenticate(): Promise<RESTAuthContext> { return { Token: 't' } as RESTAuthContext; }
    protected BuildHeaders(): Record<string, string> { return {}; }
    protected GetBaseURL(): string { return 'https://api.test'; }
    protected async MakeHTTPRequest(_a: RESTAuthContext, url: string): Promise<RESTResponse> {
        this.urls.push(url);
        return { Status: 200, Body: [{ id: 'e' }], Headers: {} } as RESTResponse;
    }
    protected NormalizeResponse(body: unknown): Record<string, unknown>[] { return Array.isArray(body) ? body as Record<string, unknown>[] : []; }
    protected ExtractPaginationInfo(): PaginationState { return { HasMore: false } as PaginationState; }
}

function ctx(): FetchContext {
    return {
        CompanyIntegration: { IntegrationID: 'int1' } as unknown as MJCompanyIntegrationEntity,
        ObjectName: 'events',
        WatermarkValue: null,
        BatchSize: 100,
        ContextUser: {} as UserInfo,
    };
}

describe('BaseRESTIntegrationConnector — multi-level template traversal', () => {
    beforeEach(() => {
        vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
            GetIntegrationObjectByID: (id: string) => OBJ_BY_ID[id],
            GetIntegrationObjectFields: (id: string) => FIELDS[id] ?? [],
            GetActiveIntegrationObjects: () => [],
        } as unknown as IntegrationEngineBase);

        const profileRows = [{ ProfileId: 'p1', OrgId: 'org1' }, { ProfileId: 'p2', OrgId: 'org2' }, { ProfileId: 'p3', OrgId: 'org1' }];
        runViewImpl = (params) => {
            if (params.EntityName === 'MJ: Company Integration Entity Maps') {
                if (params.ExtraFilter?.includes("ExternalObjectName='Orgs'")) return { Success: true, Results: [{ EntityID: 'eOrg', Entity: 'Orgs' }] };
                if (params.ExtraFilter?.includes("ExternalObjectName='Profiles'")) return { Success: true, Results: [{ EntityID: 'eProfile', Entity: 'Profiles' }] };
                return { Success: true, Results: [] };
            }
            if (params.EntityName === 'Orgs') return { Success: true, Results: [{ OrgId: 'org1' }, { OrgId: 'org2' }] };
            if (params.EntityName === 'Profiles') {
                const m = /OrgId='([^']+)'/.exec(params.ExtraFilter ?? '');
                const rows = m ? profileRows.filter(r => r.OrgId === m[1]) : profileRows;
                return { Success: true, Results: rows.map(r => ({ ProfileId: r.ProfileId })) };
            }
            return { Success: false, Results: [] };
        };
    });

    it('fetches the FK-pruned subset of combinations across all prior layers', async () => {
        const obj = { ID: 'objEvents', Name: 'events', APIPath: '/orgs/{OrgId}/profiles/{ProfileId}/events', SupportsPagination: false, PaginationType: 'None', ResponseDataKey: null } as unknown as MJIntegrationObjectEntity;
        const c = new TestConnector(obj, FIELDS.objEvents);
        const result = await c.FetchChanges(ctx());

        const paths = c.urls.map(u => u.replace('https://api.test', '')).sort();
        expect(paths).toEqual([
            '/orgs/org1/profiles/p1/events',
            '/orgs/org1/profiles/p3/events',
            '/orgs/org2/profiles/p2/events',
        ]);
        // Invalid cross-products must NOT be fetched.
        expect(paths).not.toContain('/orgs/org1/profiles/p2/events');
        expect(paths).not.toContain('/orgs/org2/profiles/p1/events');
        // Each fetched child record is tagged with the resolved parent FK values.
        expect(result.Records.length).toBe(3);
    });

    it('skips an object whose template vars form a dependency cycle', async () => {
        // Both vars resolve (via Strategy 1) to the SAME parent object → cycle on the 2nd.
        const fields = [
            f({ Name: 'AId', RelatedIntegrationObjectID: 'objOrg', Status: 'Active', Sequence: 1 }),
            f({ Name: 'BId', RelatedIntegrationObjectID: 'objOrg', Status: 'Active', Sequence: 2 }),
        ];
        const obj = { ID: 'objCycle', Name: 'cyc', APIPath: '/a/{AId}/b/{BId}/x', SupportsPagination: false, PaginationType: 'None', ResponseDataKey: null } as unknown as MJIntegrationObjectEntity;
        const c = new TestConnector(obj, fields);
        const result = await c.FetchChanges(ctx());
        expect(result.Records).toEqual([]);
        expect(c.urls).toEqual([]); // never fetched — bailed before loading
    });
});
