import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FontevaConnector } from '../FontevaConnector.js';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext, CreateRecordContext, UpdateRecordContext, DeleteRecordContext, GetRecordContext } from '@memberjunction/integration-engine';

// ─── Mocks ────────────────────────────────────────────────────────────

const contextUser = {} as UserInfo;

/** Mock CompanyIntegration carrying SF credentials + Fonteva config in Configuration JSON. */
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

/** Maps the friendly IO name → a per-IO Configuration with the backing sObject + FDService path. */
const IO_CONFIGS: Record<string, { BackingSObject: string; Namespace: string; FDServiceWrapper: string; AccessPath: { primary: string; fdServicePath: string; salesforceSObjectPath: string; soqlObject: string } }> = {
    Assignment: {
        BackingSObject: 'OrderApi__Assignment__c',
        Namespace: 'OrderApi',
        FDServiceWrapper: 'Assignment',
        AccessPath: {
            primary: 'FDService',
            fdServicePath: '/services/apexrest/FDService/AssignmentService',
            salesforceSObjectPath: '/services/data/v{version}/sobjects/OrderApi__Assignment__c',
            soqlObject: 'OrderApi__Assignment__c',
        },
    },
    Term: {
        BackingSObject: 'OrderApi__Renewal__c',
        Namespace: 'OrderApi',
        FDServiceWrapper: 'Term',
        AccessPath: {
            primary: 'FDService',
            fdServicePath: '/services/apexrest/FDService/TermService',
            salesforceSObjectPath: '/services/data/v{version}/sobjects/OrderApi__Renewal__c',
            soqlObject: 'OrderApi__Renewal__c',
        },
    },
};

/** Mocks IntegrationEngineBase so GetObjectConfig/ResolveBackingSObject can read per-IO metadata. */
function mockEngineObjects() {
    vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
        GetIntegrationObject: (_integrationID: string, objectName: string): MJIntegrationObjectEntity | undefined => {
            const cfg = IO_CONFIGS[objectName];
            if (!cfg) return undefined;
            return { Configuration: JSON.stringify(cfg) } as unknown as MJIntegrationObjectEntity;
        },
    } as unknown as IntegrationEngineBase);
}

// ─── Pure unit tests ──────────────────────────────────────────────────

describe('FontevaConnector (unit)', () => {
    let connector: FontevaConnector;

    beforeEach(() => { connector = new FontevaConnector(); });
    afterEach(() => { vi.restoreAllMocks(); });

    describe('IntegrationName (three-way invariant)', () => {
        it('returns the verbatim "Fonteva"', () => {
            expect(connector.IntegrationName).toBe('Fonteva');
        });
    });

    describe('DiscoveryIsAuthoritative', () => {
        it('affirms authoritative discovery (scoped global describe is complete)', () => {
            expect(connector.DiscoveryIsAuthoritative).toBe(true);
        });
    });

    describe('Inherited Salesforce capabilities', () => {
        it('supports full CRUD + search via the composed SalesforceConnector', () => {
            expect(connector.SupportsCreate).toBe(true);
            expect(connector.SupportsUpdate).toBe(true);
            expect(connector.SupportsDelete).toBe(true);
            expect(connector.SupportsSearch).toBe(true);
        });
    });

    describe('GetIntegrationObjects (no baked catalog)', () => {
        it('returns [] when the metadata cache is unseeded — never a hardcoded list', () => {
            const objects = connector.GetIntegrationObjects();
            expect(Array.isArray(objects)).toBe(true);
            expect(objects.length).toBe(0);
        });
    });
});

// ─── Mocked-API tests ─────────────────────────────────────────────────

describe('FontevaConnector (mocked API)', () => {
    let connector: FontevaConnector;
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    let capturedUrls: string[];
    let capturedMethods: string[];
    let capturedBodies: unknown[];

    beforeEach(() => {
        connector = new FontevaConnector();
        capturedUrls = [];
        capturedMethods = [];
        capturedBodies = [];
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        vi.mock('jsonwebtoken', () => ({ default: { sign: () => 'mock-jwt-assertion' } }));
    });

    afterEach(() => { vi.restoreAllMocks(); });

    /** Routes token exchange + sequenced API responses, capturing every non-token call. */
    function setupMock(apiResponses: Array<{ body: unknown; status?: number; headers?: Record<string, string> }>) {
        let i = 0;
        fetchSpy.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            if (url.includes('/services/oauth2/token')) return mockTokenResponse();
            capturedUrls.push(url);
            capturedMethods.push(init?.method ?? 'GET');
            capturedBodies.push(init?.body);
            const cfg = apiResponses[i] ?? apiResponses[apiResponses.length - 1];
            i++;
            return mockApiResponse(cfg.body, cfg.status ?? 200, cfg.headers);
        });
    }

    describe('DiscoverObjects (namespace scoping over live describe)', () => {
        it('scopes the global describe to OrderApi__/EventApi__ and presents friendly IO names', async () => {
            setupMock([{
                body: {
                    sobjects: [
                        // Fonteva managed-package objects (custom) — should pass + be renamed
                        { name: 'OrderApi__Assignment__c', label: 'Assignment', custom: true, createable: true, updateable: true, deletable: true, queryable: true, searchable: true },
                        { name: 'EventApi__Event__c', label: 'Event', custom: true, createable: true, updateable: true, deletable: true, queryable: true, searchable: true },
                        // Standard SF CRM objects — out of scope, must be filtered OUT
                        { name: 'Account', label: 'Account', custom: false, createable: true, updateable: true, deletable: true, queryable: true, searchable: true },
                        { name: 'Contact', label: 'Contact', custom: false, createable: true, updateable: true, deletable: true, queryable: true, searchable: true },
                        // A different managed package — out of scope
                        { name: 'Other__Thing__c', label: 'Thing', custom: true, createable: true, updateable: true, deletable: true, queryable: true, searchable: true },
                    ],
                },
            }]);

            const ci = createMockCompanyIntegration();
            const objects = await connector.DiscoverObjects(ci, contextUser);
            const names = objects.map(o => o.Name).sort();

            expect(names).toEqual(['Event', 'Assignment'].sort());
            expect(names).not.toContain('Account');
            expect(names).not.toContain('Contact');
            // All Fonteva objects support incremental sync (SystemModstamp).
            expect(objects.every(o => o.SupportsIncrementalSync)).toBe(true);
        });
    });

    describe('DiscoverFields (IO name → backing sObject /describe)', () => {
        it('describes the backing sObject, not the friendly IO name', async () => {
            mockEngineObjects();
            setupMock([{
                body: {
                    fields: [
                        { name: 'Id', label: 'Id', type: 'id', length: 18, precision: 0, scale: 0, nillable: false, createable: false, updateable: false, custom: false, calculated: false, externalId: false, defaultedOnCreate: false, defaultValue: null, inlineHelpText: null, referenceTo: [], relationshipName: null },
                        { name: 'OrderApi__Term__c', label: 'Term', type: 'reference', length: 18, precision: 0, scale: 0, nillable: true, createable: true, updateable: true, custom: true, calculated: false, externalId: false, defaultedOnCreate: false, defaultValue: null, inlineHelpText: null, referenceTo: ['OrderApi__Renewal__c'], relationshipName: 'Term__r' },
                    ],
                },
            }]);

            const ci = createMockCompanyIntegration();
            const fields = await connector.DiscoverFields(ci, 'Assignment', contextUser);

            // The describe URL must target the backing sObject OrderApi__Assignment__c.
            expect(capturedUrls.some(u => u.includes('/sobjects/OrderApi__Assignment__c/describe'))).toBe(true);
            expect(fields.find(f => f.Name === 'Id')?.IsPrimaryKey).toBe(true);
        });
    });

    describe('FetchChanges (SOQL platform layer reused + ObjectType rewrite)', () => {
        it('queries the backing sObject and rewrites record ObjectType back to the IO name', async () => {
            mockEngineObjects();
            setupMock([
                // describe call for queryable field names
                { body: { fields: [
                    { name: 'Id', label: 'Id', type: 'id', length: 18, precision: 0, scale: 0, nillable: false, createable: false, updateable: false, custom: false, calculated: false, externalId: false, defaultedOnCreate: false, defaultValue: null, inlineHelpText: null, referenceTo: [], relationshipName: null },
                    { name: 'SystemModstamp', label: 'System Modstamp', type: 'datetime', length: 0, precision: 0, scale: 0, nillable: false, createable: false, updateable: false, custom: false, calculated: false, externalId: false, defaultedOnCreate: false, defaultValue: null, inlineHelpText: null, referenceTo: [], relationshipName: null },
                ] } },
                // SOQL query result
                { body: { totalSize: 1, done: true, records: [
                    { attributes: { type: 'OrderApi__Assignment__c', url: '/x' }, Id: 'a01000000000001', SystemModstamp: '2026-02-01T00:00:00.000Z' },
                ] } },
            ]);

            const ctx: FetchContext = {
                CompanyIntegration: createMockCompanyIntegration(),
                ObjectName: 'Assignment',
                WatermarkValue: null,
                BatchSize: 2000,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);

            // SOQL FROM clause targets the backing sObject.
            expect(capturedUrls.some(u => decodeURIComponent(u).includes('FROM OrderApi__Assignment__c'))).toBe(true);
            // Records carry the IO name (Assignment), NOT the raw sObject name, for engine identity.
            expect(result.Records.length).toBe(1);
            expect(result.Records[0].ObjectType).toBe('Assignment');
            expect(result.Records[0].ExternalID).toBe('a01000000000001');
            // Full record pass-through: every source field is present in Fields.
            expect(result.Records[0].Fields).toHaveProperty('Id');
            expect(result.Records[0].Fields).toHaveProperty('SystemModstamp');
        });
    });

    describe('CreateRecord (generic sObject path via backing sObject)', () => {
        it('POSTs to the backing sObject and routes through BuildCreatedResult', async () => {
            mockEngineObjects();
            setupMock([{ body: { id: 'a01000000000abc', success: true, errors: [] }, status: 201 }]);

            const ctx: CreateRecordContext = {
                CompanyIntegration: createMockCompanyIntegration(),
                ObjectName: 'Assignment',
                ContextUser: contextUser,
                Attributes: { OrderApi__Quantity__c: 5 },
            };
            const result = await connector.CreateRecord(ctx);

            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('a01000000000abc');
            expect(capturedMethods[0]).toBe('POST');
            expect(capturedUrls[0]).toContain('/sobjects/OrderApi__Assignment__c');
        });

        it('fails loudly when a 2xx create returns success=false (no silent record loss)', async () => {
            mockEngineObjects();
            setupMock([{ body: { id: null, success: false, errors: [{ errorCode: 'REQUIRED_FIELD_MISSING', message: 'missing field' }] }, status: 200 }]);

            const ctx: CreateRecordContext = {
                CompanyIntegration: createMockCompanyIntegration(),
                ObjectName: 'Assignment',
                ContextUser: contextUser,
                Attributes: {},
            };
            const result = await connector.CreateRecord(ctx);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('REQUIRED_FIELD_MISSING');
        });
    });

    describe('UpdateRecord / DeleteRecord (backing sObject + ID)', () => {
        it('PATCHes the backing sObject row by Id', async () => {
            mockEngineObjects();
            setupMock([{ body: {}, status: 204 }]);

            const ctx: UpdateRecordContext = {
                CompanyIntegration: createMockCompanyIntegration(),
                ObjectName: 'Term',
                ContextUser: contextUser,
                ExternalID: 'r01000000000xyz',
                Attributes: { OrderApi__Status__c: 'Active' },
            };
            const result = await connector.UpdateRecord(ctx);
            expect(result.Success).toBe(true);
            expect(capturedMethods[0]).toBe('PATCH');
            // Term maps to the OrderApi__Renewal__c sObject (wrapper name ≠ sObject name).
            expect(capturedUrls[0]).toContain('/sobjects/OrderApi__Renewal__c/r01000000000xyz');
        });

        it('DELETEs the backing sObject row by Id', async () => {
            mockEngineObjects();
            setupMock([{ body: {}, status: 204 }]);

            const ctx: DeleteRecordContext = {
                CompanyIntegration: createMockCompanyIntegration(),
                ObjectName: 'Assignment',
                ContextUser: contextUser,
                ExternalID: 'a01000000000del',
            };
            const result = await connector.DeleteRecord(ctx);
            expect(result.Success).toBe(true);
            expect(capturedMethods[0]).toBe('DELETE');
            expect(capturedUrls[0]).toContain('/sobjects/OrderApi__Assignment__c/a01000000000del');
        });
    });

    describe('GetRecord (backing sObject + ObjectType rewrite)', () => {
        it('GETs the backing sObject and returns the IO name as ObjectType', async () => {
            mockEngineObjects();
            setupMock([{ body: { attributes: { type: 'OrderApi__Assignment__c' }, Id: 'a01000000000get', OrderApi__Quantity__c: 3, SystemModstamp: '2026-03-01T00:00:00.000Z' } }]);

            const ctx: GetRecordContext = {
                CompanyIntegration: createMockCompanyIntegration(),
                ObjectName: 'Assignment',
                ContextUser: contextUser,
                ExternalID: 'a01000000000get',
            };
            const record = await connector.GetRecord(ctx);
            expect(record).not.toBeNull();
            expect(record!.ObjectType).toBe('Assignment');
            expect(capturedUrls[0]).toContain('/sobjects/OrderApi__Assignment__c/a01000000000get');
            // attributes blob stripped (sanctioned), other fields preserved.
            expect(record!.Fields).not.toHaveProperty('attributes');
            expect(record!.Fields).toHaveProperty('OrderApi__Quantity__c');
        });
    });

    describe('FetchChanges via FDService (opt-in Apex REST domain service)', () => {
        it('routes reads through /services/apexrest/FDService/<Service> with SearchRequest params', async () => {
            mockEngineObjects();
            setupMock([{
                body: { records: [
                    { id: 'a01000000000fd1', subscriptionPlan: 'Gold', SystemModstamp: '2026-04-01T00:00:00.000Z' },
                ] },
            }]);

            const ci = createMockCompanyIntegration({ UseFDServiceForRead: true });
            const ctx: FetchContext = {
                CompanyIntegration: ci,
                ObjectName: 'Assignment',
                WatermarkValue: '2026-01-01T00:00:00.000Z',
                BatchSize: 100,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);

            // Raw URL: URLSearchParams encodes spaces as '+'. Assert on the wire form.
            const url = capturedUrls[0];
            expect(url).toContain('/services/apexrest/FDService/AssignmentService');
            expect(url).toContain('filter=SystemModstamp+%3E%3D+2026-01-01T00%3A00%3A00.000Z');
            expect(url).toContain('limit=100');
            expect(url).toContain('sort=SystemModstamp');
            expect(url).toContain('sorDir=ASC');

            expect(result.Records.length).toBe(1);
            expect(result.Records[0].ObjectType).toBe('Assignment');
            expect(result.Records[0].ExternalID).toBe('a01000000000fd1');
            // Full wrapper record preserved (custom-column capture).
            expect(result.Records[0].Fields).toHaveProperty('subscriptionPlan');
            // Watermark advanced past the max SystemModstamp seen.
            expect(result.NewWatermarkValue).toBe('2026-04-01T00:00:00.001Z');
        });

        it('does NOT use FDService when the connection has not opted in', async () => {
            mockEngineObjects();
            setupMock([
                { body: { fields: [
                    { name: 'Id', label: 'Id', type: 'id', length: 18, precision: 0, scale: 0, nillable: false, createable: false, updateable: false, custom: false, calculated: false, externalId: false, defaultedOnCreate: false, defaultValue: null, inlineHelpText: null, referenceTo: [], relationshipName: null },
                ] } },
                { body: { totalSize: 0, done: true, records: [] } },
            ]);

            const ctx: FetchContext = {
                CompanyIntegration: createMockCompanyIntegration(), // UseFDServiceForRead defaults false
                ObjectName: 'Assignment',
                WatermarkValue: null,
                BatchSize: 2000,
                ContextUser: contextUser,
            };
            await connector.FetchChanges(ctx);
            expect(capturedUrls.some(u => u.includes('/services/apexrest/FDService'))).toBe(false);
            expect(capturedUrls.some(u => u.includes('/services/data/'))).toBe(true);
        });
    });
});
