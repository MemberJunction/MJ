/**
 * Fonteva no-creds SYNC tests — camelCase/API-name mapping, FDService wrapper parsing,
 * SOQL filter construction, and custom-field passthrough.
 *
 * Implements fontevacontext.md §4 (camelCase ↔ API-name mapping + wrapper), §5 (SOQL
 * filters), and the custom-column-capture contract. These are vitest unit tests against
 * the mocked connector — no MJAPI, no DB, no live calls. Reuses the MockedFontevaConnector
 * pattern from FontevaConnector.test.ts (overrides fetch + IntegrationEngineBase).
 *
 * SCOPE: record SYNC behavior only. FDService ACTION services (pay-an-order, item-price,
 * subscription-renewal) are out-of-scope Actions and are NOT tested here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FontevaConnector } from '../FontevaConnector.js';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext } from '@memberjunction/integration-engine';
import {
    FDSERVICE_ORDERS,
    wrapFontevaService,
    CONTACT_WITH_CUSTOM_FIELDS,
    CUSTOM_FIELD_NAMES,
    SALES_ORDERS,
    SALES_ORDER_LINES,
    CONTACTS,
    ACCOUNTS,
    REGISTRATIONS,
    EVENTS,
    DUPLICATE_CONTACT_PAIR,
    MEMBER_VS_NONMEMBER_PRICE,
    ITEMS,
    FIXTURE_COUNTS,
    soqlResponse,
    describeResponse,
    fieldNamesOf,
} from './fixtures/fonteva-rich/fonteva-rich-fixtures.js';

// ─── Shared mock scaffolding (mirrors FontevaConnector.test.ts) ─────────

const contextUser = {} as UserInfo;

function createMockCompanyIntegration(configOverrides?: Record<string, unknown>): MJCompanyIntegrationEntity {
    const config = JSON.stringify({
        loginUrl: 'https://login.salesforce.com',
        clientId: 'test-consumer-key',
        username: 'test@example.com',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nfake-key\n-----END RSA PRIVATE KEY-----',
        apiVersion: '61.0',
        ...configOverrides,
    });
    return {
        IntegrationID: 'fonteva-integration-id',
        Configuration: config,
        CredentialID: null,
    } as unknown as MJCompanyIntegrationEntity;
}

function mockTokenResponse(instanceUrl = 'https://na1.my.salesforce.com'): Response {
    return {
        ok: true, status: 200, headers: new Headers(),
        json: async () => ({ access_token: 'mock-token', instance_url: instanceUrl, token_type: 'Bearer' }),
        text: async () => '',
    } as unknown as Response;
}

function mockApiResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
    const h = new Headers(headers);
    return {
        ok: status >= 200 && status < 300, status, headers: h,
        json: async () => body, text: async () => JSON.stringify(body),
    } as unknown as Response;
}

/** Per-IO Configuration: friendly IO name → backing sObject + FDService path. */
const IO_CONFIGS: Record<string, {
    BackingSObject: string; Namespace: string; FDServiceWrapper: string;
    AccessPath: { primary: string; fdServicePath: string; salesforceSObjectPath: string; soqlObject: string };
}> = {
    SalesOrder: {
        BackingSObject: 'OrderApi__Sales_Order__c',
        Namespace: 'OrderApi',
        FDServiceWrapper: 'Order',
        AccessPath: {
            primary: 'FDService',
            fdServicePath: '/services/apexrest/FDService/OrderService',
            salesforceSObjectPath: '/services/data/v{version}/sobjects/OrderApi__Sales_Order__c',
            soqlObject: 'OrderApi__Sales_Order__c',
        },
    },
    Contact: {
        BackingSObject: 'Contact',
        Namespace: 'OrderApi',
        FDServiceWrapper: 'Contact',
        AccessPath: {
            primary: 'Salesforce',
            fdServicePath: '/services/apexrest/FDService/ContactService',
            salesforceSObjectPath: '/services/data/v{version}/sobjects/Contact',
            soqlObject: 'Contact',
        },
    },
};

function mockEngineObjects() {
    vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
        GetIntegrationObject: (_integrationID: string, objectName: string): MJIntegrationObjectEntity | undefined => {
            const cfg = IO_CONFIGS[objectName];
            if (!cfg) return undefined;
            return { Configuration: JSON.stringify(cfg) } as unknown as MJIntegrationObjectEntity;
        },
        IntegrationObjects: [],
    } as unknown as IntegrationEngineBase);
}

// ─── Test suite ─────────────────────────────────────────────────────────

describe('Fonteva rich fixture dataset (§11) — integrity + FK consistency', () => {
    it('has the dataset cardinality the spec calls for', () => {
        expect(FIXTURE_COUNTS.Account).toBe(3);
        expect(FIXTURE_COUNTS.Contact).toBe(10);
        expect(FIXTURE_COUNTS.Membership).toBe(4);
        expect(FIXTURE_COUNTS.Subscription).toBe(3);
        expect(FIXTURE_COUNTS.Item).toBe(5);
        expect(FIXTURE_COUNTS.Event).toBe(3);
        expect(FIXTURE_COUNTS.Registration).toBe(6);
        expect(FIXTURE_COUNTS.SalesOrder).toBe(4);
        expect(FIXTURE_COUNTS.SalesOrderLine).toBe(8);
        expect(FIXTURE_COUNTS.EPayment).toBe(3);
        expect(FIXTURE_COUNTS.Receipt).toBe(2);
        expect(FIXTURE_COUNTS.Journal).toBe(2);
        expect(FIXTURE_COUNTS.Store).toBe(2);
        expect(FIXTURE_COUNTS.CustomFields).toBe(5);
    });

    it('keys every record by a well-formed, unique Salesforce 18-char Id', () => {
        const all = [...ACCOUNTS, ...CONTACTS, ...ITEMS, ...EVENTS, ...REGISTRATIONS, ...SALES_ORDERS, ...SALES_ORDER_LINES];
        const ids = all.map(r => r.Id);
        expect(ids.every(id => /^[A-Za-z0-9]{15}AAA$/.test(id))).toBe(true);
        expect(new Set(ids).size).toBe(ids.length); // all unique
    });

    it('keeps order-line → order and registration → event/contact FKs referential', () => {
        const orderIds = new Set(SALES_ORDERS.map(o => o.Id));
        for (const line of SALES_ORDER_LINES) {
            expect(orderIds.has(line.OrderApi__Sales_Order__c as string)).toBe(true);
        }
        const eventIds = new Set(EVENTS.map(e => e.Id));
        const contactIds = new Set(CONTACTS.map(c => c.Id));
        for (const reg of REGISTRATIONS) {
            expect(eventIds.has(reg.EventApi__Event__c as string)).toBe(true);
            expect(contactIds.has(reg.EventApi__Contact__c as string)).toBe(true);
        }
    });

    it('carries the documented edge cases (duplicate, cancelled, failed pay, expired sub, member price)', () => {
        // Duplicate contact pair — distinct Ids, case-different same email.
        expect(DUPLICATE_CONTACT_PAIR.original.Id).not.toBe(DUPLICATE_CONTACT_PAIR.duplicate.Id);
        expect(DUPLICATE_CONTACT_PAIR.original.Email.toLowerCase())
            .toBe(DUPLICATE_CONTACT_PAIR.duplicate.Email.toLowerCase());
        // Cancelled registration present.
        expect(REGISTRATIONS.some(r => r.EventApi__Status__c === 'Cancelled')).toBe(true);
        // Member vs nonmember price pair: member price strictly cheaper.
        expect(MEMBER_VS_NONMEMBER_PRICE.memberPrice).toBeLessThan(MEMBER_VS_NONMEMBER_PRICE.listPrice);
        const item1 = ITEMS.find(i => i.Id === MEMBER_VS_NONMEMBER_PRICE.itemId);
        expect(item1?.OrderApi__Member_Price__c).toBe(MEMBER_VS_NONMEMBER_PRICE.memberPrice);
        // A tax line and an inactive item exist.
        expect(SALES_ORDER_LINES.some(l => l.OrderApi__Line_Type__c === 'Tax')).toBe(true);
        expect(ITEMS.some(i => i.OrderApi__Is_Active__c === false)).toBe(true);
    });
});

describe('FontevaConnector — camelCase mapping + FDService wrapper parsing (§4)', () => {
    let connector: FontevaConnector;
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    let capturedUrls: string[];
    let capturedMethods: string[];

    beforeEach(() => {
        connector = new FontevaConnector();
        capturedUrls = [];
        capturedMethods = [];
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        vi.mock('jsonwebtoken', () => ({ default: { sign: () => 'mock-jwt-assertion' } }));
    });
    afterEach(() => { vi.restoreAllMocks(); });

    function setupMock(apiResponses: Array<{ body: unknown; status?: number; headers?: Record<string, string> }>) {
        let i = 0;
        fetchSpy.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            if (url.includes('/services/oauth2/token')) return mockTokenResponse();
            capturedUrls.push(url);
            capturedMethods.push(init?.method ?? 'GET');
            const cfg = apiResponses[i] ?? apiResponses[apiResponses.length - 1];
            i++;
            return mockApiResponse(cfg.body, cfg.status ?? 200, cfg.headers);
        });
    }

    it('parses the {records:[...]} FDService envelope and surfaces camelCase fields verbatim', async () => {
        mockEngineObjects();
        // FDService OrderService returns camelCase wrapper records under `records`.
        setupMock([{ body: { records: FDSERVICE_ORDERS } }]);

        const ctx: FetchContext = {
            CompanyIntegration: createMockCompanyIntegration({ UseFDServiceForRead: true }),
            ObjectName: 'SalesOrder',
            WatermarkValue: '2026-01-01T00:00:00.000Z',
            BatchSize: 100,
            ContextUser: contextUser,
        };
        const result = await connector.FetchChanges(ctx);

        expect(capturedUrls[0]).toContain('/services/apexrest/FDService/OrderService');
        expect(result.Records.length).toBe(4);

        // The connector preserves the camelCase wrapper keys verbatim (isPosted, balanceDue) —
        // it does NOT eagerly remap them to OrderApi__Is_Posted__c. Full-record passthrough.
        const first = result.Records[0];
        expect(first.ExternalID).toBe(SALES_ORDERS[0].Id);
        expect(first.ObjectType).toBe('SalesOrder');
        expect(first.Fields).toHaveProperty('isPosted', true);
        expect(first.Fields).toHaveProperty('balanceDue', 0);
        expect(first.Fields).toHaveProperty('status', 'Posted');
        // The camelCase id maps onto ExternalID but stays in Fields too.
        expect(first.Fields).toHaveProperty('id', SALES_ORDERS[0].Id);
    });

    it('preserves a custom field carried through the FDService wrapper (custom-column capture)', async () => {
        mockEngineObjects();
        setupMock([{ body: { records: FDSERVICE_ORDERS } }]);

        const ctx: FetchContext = {
            CompanyIntegration: createMockCompanyIntegration({ UseFDServiceForRead: true }),
            ObjectName: 'SalesOrder',
            WatermarkValue: null,
            BatchSize: 100,
            ContextUser: contextUser,
        };
        const result = await connector.FetchChanges(ctx);

        // The synthetic camelCase custom field `customExternalRef` must survive in Fields —
        // nothing hand-filtered the record down to a known subset.
        expect(result.Records[0].Fields).toHaveProperty('customExternalRef', 'EXT-1000');
        expect(result.Records[3].Fields).toHaveProperty('customExternalRef', 'EXT-1003');
    });

    it('handles the documented service wrapper shape and an empty data payload', async () => {
        mockEngineObjects();
        // The full documented wrapper with a populated data array still parses via `records`
        // when present; here we send the canonical empty wrapper (statusCode/errors/etc).
        const emptyWrapper = wrapFontevaService([]); // data:[]
        setupMock([{ body: { ...emptyWrapper, records: [] } }]);

        const ctx: FetchContext = {
            CompanyIntegration: createMockCompanyIntegration({ UseFDServiceForRead: true }),
            ObjectName: 'SalesOrder',
            WatermarkValue: null,
            BatchSize: 100,
            ContextUser: contextUser,
        };
        const result = await connector.FetchChanges(ctx);
        expect(result.Records.length).toBe(0);
        expect(result.HasMore).toBe(false);
        expect(result.NewWatermarkValue).toBeUndefined();
    });

    it('advances the watermark past the max SystemModstamp seen in an FDService batch', async () => {
        mockEngineObjects();
        // Records out of chronological order — connector must pick the MAX, not the last.
        const outOfOrder = [
            { id: 'a06000000000003AAA', name: 'SO-c', SystemModstamp: '2026-02-20T13:10:00.000Z' },
            { id: 'a06000000000001AAA', name: 'SO-a', SystemModstamp: '2026-02-20T13:00:00.000Z' },
            { id: 'a06000000000002AAA', name: 'SO-b', SystemModstamp: '2026-02-20T13:05:00.000Z' },
        ];
        setupMock([{ body: { records: outOfOrder } }]);

        const ctx: FetchContext = {
            CompanyIntegration: createMockCompanyIntegration({ UseFDServiceForRead: true }),
            ObjectName: 'SalesOrder',
            WatermarkValue: null,
            BatchSize: 100,
            ContextUser: contextUser,
        };
        const result = await connector.FetchChanges(ctx);
        // Max is 13:10:00 (record 0), advanced +1ms — NOT 13:05:00 (the last record).
        expect(result.NewWatermarkValue).toBe('2026-02-20T13:10:00.001Z');
    });
});

describe('FontevaConnector — SOQL filter construction (§5)', () => {
    let connector: FontevaConnector;
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    let capturedUrls: string[];

    beforeEach(() => {
        connector = new FontevaConnector();
        capturedUrls = [];
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        vi.mock('jsonwebtoken', () => ({ default: { sign: () => 'mock-jwt-assertion' } }));
    });
    afterEach(() => { vi.restoreAllMocks(); });

    function setupMock(apiResponses: Array<{ body: unknown; status?: number }>) {
        let i = 0;
        fetchSpy.mockImplementation(async (input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            if (url.includes('/services/oauth2/token')) return mockTokenResponse();
            capturedUrls.push(url);
            const cfg = apiResponses[i] ?? apiResponses[apiResponses.length - 1];
            i++;
            return mockApiResponse(cfg.body, cfg.status ?? 200);
        });
    }

    it('builds a SOQL WHERE SystemModstamp >= <ts> watermark filter against the backing sObject', async () => {
        mockEngineObjects();
        setupMock([
            { body: describeResponse(['Id', 'SystemModstamp', 'IsDeleted', 'LastModifiedById', 'OrderApi__Is_Posted__c']) },
            { body: soqlResponse(SALES_ORDERS) },
        ]);

        const ctx: FetchContext = {
            CompanyIntegration: createMockCompanyIntegration(),
            ObjectName: 'SalesOrder',
            WatermarkValue: '2026-02-15T00:00:00.000Z',
            BatchSize: 2000,
            ContextUser: contextUser,
        };
        await connector.FetchChanges(ctx);

        const soqlUrl = decodeURIComponent(capturedUrls.find(u => u.includes('/query')) ?? '');
        expect(soqlUrl).toContain('FROM OrderApi__Sales_Order__c');
        expect(soqlUrl).toContain('WHERE SystemModstamp >= 2026-02-15T00:00:00.000Z');
        expect(soqlUrl).toContain('ORDER BY SystemModstamp ASC');
    });

    it('omits the WHERE clause on a first full sync (no watermark)', async () => {
        mockEngineObjects();
        setupMock([
            { body: describeResponse(['Id', 'SystemModstamp', 'IsDeleted', 'LastModifiedById']) },
            { body: soqlResponse(SALES_ORDERS) },
        ]);

        const ctx: FetchContext = {
            CompanyIntegration: createMockCompanyIntegration(),
            ObjectName: 'SalesOrder',
            WatermarkValue: null,
            BatchSize: 2000,
            ContextUser: contextUser,
        };
        await connector.FetchChanges(ctx);

        const soqlUrl = decodeURIComponent(capturedUrls.find(u => u.includes('/query')) ?? '');
        expect(soqlUrl).toContain('FROM OrderApi__Sales_Order__c');
        expect(soqlUrl).not.toContain('WHERE');
        // ORDER BY watermark column still present for stable pagination.
        expect(soqlUrl).toContain('ORDER BY SystemModstamp ASC');
    });

    it('URL-encodes the SOQL query (spaces, >=, colons) on the wire', async () => {
        mockEngineObjects();
        setupMock([
            { body: describeResponse(['Id', 'SystemModstamp', 'IsDeleted', 'LastModifiedById']) },
            { body: soqlResponse(SALES_ORDERS) },
        ]);

        const ctx: FetchContext = {
            CompanyIntegration: createMockCompanyIntegration(),
            ObjectName: 'SalesOrder',
            WatermarkValue: '2026-02-15T00:00:00.000Z',
            BatchSize: 2000,
            ContextUser: contextUser,
        };
        await connector.FetchChanges(ctx);

        // The RAW (un-decoded) SOQL URL must be percent-encoded — spaces as %20, '>' as %3E,
        // ':' as %3A — proving the connector does not ship a raw, un-encoded query string.
        const rawUrl = capturedUrls.find(u => u.includes('/query')) ?? '';
        expect(rawUrl).toContain('q=');
        expect(rawUrl).toContain('%20'); // encoded space
        expect(rawUrl).toContain('%3E'); // encoded '>'
        expect(rawUrl).toContain('%3A'); // encoded ':'
        expect(rawUrl).not.toMatch(/q=SELECT /); // not a raw, unencoded query
    });

    it('uses queryAll (soft-deleted included) for the standard sObject family', async () => {
        mockEngineObjects();
        setupMock([
            { body: describeResponse(['Id', 'SystemModstamp', 'IsDeleted', 'LastModifiedById']) },
            { body: soqlResponse(SALES_ORDERS) },
        ]);

        const ctx: FetchContext = {
            CompanyIntegration: createMockCompanyIntegration(),
            ObjectName: 'SalesOrder',
            WatermarkValue: null,
            BatchSize: 2000,
            ContextUser: contextUser,
        };
        await connector.FetchChanges(ctx);
        // The fetch query goes to /queryAll (not /query) so IsDeleted rows are returned.
        expect(capturedUrls.some(u => u.includes('/queryAll?q='))).toBe(true);
    });

    it('FDService filter escapes a SystemModstamp watermark and URL-encodes the param', async () => {
        mockEngineObjects();
        setupMock([{ body: { records: FDSERVICE_ORDERS } }]);

        const ctx: FetchContext = {
            CompanyIntegration: createMockCompanyIntegration({ UseFDServiceForRead: true }),
            ObjectName: 'SalesOrder',
            WatermarkValue: '2026-02-15T00:00:00.000Z',
            BatchSize: 50,
            ContextUser: contextUser,
        };
        await connector.FetchChanges(ctx);

        const url = capturedUrls[0];
        // URLSearchParams encodes ' ' as '+', '>' as %3E, '=' as %3D, ':' as %3A.
        expect(url).toContain('filter=SystemModstamp+%3E%3D+2026-02-15T00%3A00%3A00.000Z');
        expect(url).toContain('limit=50');
        expect(url).toContain('sort=SystemModstamp');
        expect(url).toContain('sorDir=ASC');
    });

    it('passes a requested-field whitelist into the FDService fields param', async () => {
        mockEngineObjects();
        setupMock([{ body: { records: FDSERVICE_ORDERS } }]);

        const ctx: FetchContext = {
            CompanyIntegration: createMockCompanyIntegration({ UseFDServiceForRead: true }),
            ObjectName: 'SalesOrder',
            WatermarkValue: null,
            BatchSize: 50,
            ContextUser: contextUser,
            RequestedSourceFields: ['Id', 'OrderApi__Contact__c', 'OrderApi__Is_Posted__c'],
        };
        await connector.FetchChanges(ctx);

        const url = capturedUrls[0];
        // fields is a comma-separated list of API names (fontevacontext.md §5);
        // URLSearchParams encodes the commas as %2C.
        expect(url).toContain('fields=Id%2COrderApi__Contact__c%2COrderApi__Is_Posted__c');
    });
});

describe('FontevaConnector — custom-field passthrough (SOQL path)', () => {
    let connector: FontevaConnector;
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        connector = new FontevaConnector();
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        vi.mock('jsonwebtoken', () => ({ default: { sign: () => 'mock-jwt-assertion' } }));
    });
    afterEach(() => { vi.restoreAllMocks(); });

    function setupMock(apiResponses: Array<{ body: unknown; status?: number }>) {
        let i = 0;
        fetchSpy.mockImplementation(async (input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            if (url.includes('/services/oauth2/token')) return mockTokenResponse();
            const cfg = apiResponses[i] ?? apiResponses[apiResponses.length - 1];
            i++;
            return mockApiResponse(cfg.body, cfg.status ?? 200);
        });
    }

    it('preserves all 5 unmapped custom __c fields in Fields and strips only the attributes blob', async () => {
        mockEngineObjects();
        const fieldNames = fieldNamesOf([CONTACT_WITH_CUSTOM_FIELDS]);
        setupMock([
            { body: describeResponse(fieldNames) },
            { body: soqlResponse([CONTACT_WITH_CUSTOM_FIELDS]) },
        ]);

        const ctx: FetchContext = {
            CompanyIntegration: createMockCompanyIntegration(),
            ObjectName: 'Contact',
            WatermarkValue: null,
            BatchSize: 2000,
            ContextUser: contextUser,
        };
        const result = await connector.FetchChanges(ctx);

        expect(result.Records.length).toBe(1);
        const fields = result.Records[0].Fields;
        // Every custom field the metadata does NOT declare must survive in Fields.
        for (const name of CUSTOM_FIELD_NAMES) {
            expect(fields).toHaveProperty(name);
        }
        expect(fields['OrderApi__Custom_Loyalty_Tier__c']).toBe('Platinum');
        expect(fields['EventApi__Custom_Dietary_Pref__c']).toBe('Vegetarian');
        // The Salesforce envelope blob is the only sanctioned removal.
        expect(fields).not.toHaveProperty('attributes');
        // Standard mapped fields still present.
        expect(fields).toHaveProperty('Email', 'example+1@example.com');
    });
});
