import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SalesforceConnector } from '../SalesforceConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext, CreateRecordContext, UpdateRecordContext, DeleteRecordContext, GetRecordContext, SearchContext } from '@memberjunction/integration-engine';

// ─── Mocks ────────────────────────────────────────────────────────────

/**
 * Creates a mock CompanyIntegration that stores SF credentials in Configuration JSON.
 * This avoids the Metadata().GetEntityObject path used by CredentialID.
 */
function createMockCompanyIntegration(
    credentialJson: Record<string, string>,
    configOverrides?: Record<string, unknown>
): MJCompanyIntegrationEntity {
    // Merge credentials + overrides into a single Configuration JSON
    const config = JSON.stringify({ ...credentialJson, ...configOverrides });

    return {
        // The connector reads the strongly-typed entity properties directly
        // (per MJ convention — no `.Get()`), so expose them as real properties.
        Configuration: config,
        CredentialID: null, // skip the DB credential-entity path; use Configuration JSON
    } as unknown as MJCompanyIntegrationEntity;
}

const MOCK_CREDENTIALS = {
    loginUrl: 'https://login.salesforce.com',
    clientId: 'test-consumer-key',
    username: 'test@example.com',
    privateKey: '-----BEGIN RSA PRIVATE KEY-----\nfake-key\n-----END RSA PRIVATE KEY-----',
    apiVersion: '61.0',
};

const contextUser = {} as UserInfo;

/**
 * Builds a mock SF OAuth token response.
 */
function mockTokenResponse(instanceUrl = 'https://na1.salesforce.com') {
    return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
            access_token: 'mock-access-token-123',
            instance_url: instanceUrl,
            token_type: 'Bearer',
        }),
        text: async () => '',
    } as unknown as Response;
}

/**
 * Builds a mock SF API response (JSON body, with headers).
 */
function mockApiResponse(body: unknown, status = 200, headers?: Record<string, string>) {
    const h = new Headers(headers);
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: h,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

// ─── Pure Unit Tests (no mocking needed) ──────────────────────────────

describe('SalesforceConnector (unit)', () => {
    let connector: SalesforceConnector;

    beforeEach(() => {
        connector = new SalesforceConnector();
    });

    describe('IntegrationName', () => {
        it('should return "Salesforce"', () => {
            expect(connector.IntegrationName).toBe('Salesforce');
        });
    });

    describe('Capability getters', () => {
        it('should support CRUD and search', () => {
            expect(connector.SupportsCreate).toBe(true);
            expect(connector.SupportsUpdate).toBe(true);
            expect(connector.SupportsDelete).toBe(true);
            expect(connector.SupportsSearch).toBe(true);
        });
    });

    describe('DiscoveryIsAuthoritative', () => {
        it('should affirm authoritative discovery (global describe = complete gamut)', () => {
            // IMPROVE-build correction: the global /sobjects/ describe returns the complete
            // credentialed object gamut, so comprehensive refresh may safely deactivate
            // dropped objects (reversible). Default on the base is false.
            expect(connector.DiscoveryIsAuthoritative).toBe(true);
        });
    });

    describe('GetIntegrationObjects (no baked famous catalog)', () => {
        it('should NOT return a hardcoded famous-subset catalog when the metadata cache is unseeded', () => {
            // IMPROVE-build correction: the connector used to return a baked ~9-object catalog.
            // It now derives the action-generation hint set ENTIRELY from runtime-cached
            // IntegrationObject metadata. With no seeded integration, it returns [] — it NEVER
            // falls back to a hardcoded list. The per-tenant object universe comes from
            // DiscoverObjects (live describe), proven separately below.
            const objects = connector.GetIntegrationObjects();
            expect(Array.isArray(objects)).toBe(true);
            expect(objects.length).toBe(0);
        });
    });

    describe('GetDefaultFieldMappings', () => {
        it('should return mappings for Contact', () => {
            const mappings = connector.GetDefaultFieldMappings('Contact', 'Contacts');
            expect(mappings.length).toBe(12);

            const emailMapping = mappings.find(m => m.SourceFieldName === 'Email');
            expect(emailMapping).toBeDefined();
            expect(emailMapping!.DestinationFieldName).toBe('Email');
            expect(emailMapping!.IsKeyField).toBe(true);
        });

        it('should return mappings for Account', () => {
            const mappings = connector.GetDefaultFieldMappings('Account', 'Companies');
            expect(mappings.length).toBe(10);

            const nameMapping = mappings.find(m => m.SourceFieldName === 'Name');
            expect(nameMapping!.DestinationFieldName).toBe('Name');
            expect(nameMapping!.IsKeyField).toBe(true);
        });

        it('should return mappings for Lead', () => {
            const mappings = connector.GetDefaultFieldMappings('Lead', 'Contacts');
            expect(mappings.length).toBe(6);

            const lastNameMapping = mappings.find(m => m.SourceFieldName === 'LastName');
            expect(lastNameMapping!.DestinationFieldName).toBe('LastName');
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('Opportunity', 'Opportunities');
            expect(mappings).toEqual([]);
        });
    });

    describe('GetDefaultConfiguration', () => {
        it('should return config with 3 default objects', () => {
            const config = connector.GetDefaultConfiguration();
            expect(config.DefaultSchemaName).toBe('Salesforce');
            expect(config.DefaultObjects.length).toBe(3);

            const objectNames = config.DefaultObjects.map(o => o.SourceObjectName);
            expect(objectNames).toContain('Account');
            expect(objectNames).toContain('Contact');
            expect(objectNames).toContain('Lead');
        });

        it('should have SyncEnabled=true for all default objects', () => {
            const config = connector.GetDefaultConfiguration();
            for (const obj of config.DefaultObjects) {
                expect(obj.SyncEnabled).toBe(true);
            }
        });

        it('should include field mappings for each default object', () => {
            const config = connector.GetDefaultConfiguration();
            for (const obj of config.DefaultObjects) {
                expect(obj.FieldMappings.length).toBeGreaterThan(0);
            }
        });
    });

    describe('GetActionGeneratorConfig', () => {
        it('should return config with Salesforce icon', () => {
            const config = connector.GetActionGeneratorConfig();
            // config may be null if the base class returns null (no integration set up)
            // but the override adds the icon if base returns non-null
            // Since IntegrationName is set, super.GetActionGeneratorConfig() should work
            if (config) {
                expect(config.IconClass).toBe('fa-brands fa-salesforce');
            }
        });
    });
});

// ─── Integration Tests (mocked fetch) ─────────────────────────────────

describe('SalesforceConnector (mocked API)', () => {
    let connector: SalesforceConnector;
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        connector = new SalesforceConnector();
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Helper: mock jwt.sign to avoid needing a real RSA key
    function mockJwtSign() {
        vi.mock('jsonwebtoken', () => ({
            default: {
                sign: () => 'mock-jwt-assertion',
            },
        }));
    }

    /**
     * Sets up fetch to handle:
     * 1. Token exchange (POST to /services/oauth2/token)
     * 2. Subsequent API calls
     */
    function setupAuthAndApiMock(
        apiResponses: Array<{ body: unknown; status?: number; headers?: Record<string, string> }>,
        instanceUrl = 'https://na1.salesforce.com'
    ) {
        let callIndex = 0;
        fetchSpy.mockImplementation(async (input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

            // Token exchange
            if (url.includes('/services/oauth2/token')) {
                return mockTokenResponse(instanceUrl);
            }

            // API calls
            const responseConfig = apiResponses[callIndex] ?? apiResponses[apiResponses.length - 1];
            callIndex++;
            return mockApiResponse(
                responseConfig.body,
                responseConfig.status ?? 200,
                responseConfig.headers
            );
        });
    }

    describe('TestConnection', () => {
        it('should return success when SF responds to /services/data', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: [{ version: '61.0', url: '/services/data/v61.0' }],
            }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const result = await connector.TestConnection(ci, contextUser);
            expect(result.Success).toBe(true);
            expect(result.Message).toContain('Salesforce');
        });

        it('should return failure when fetch throws', async () => {
            mockJwtSign();
            fetchSpy.mockRejectedValue(new Error('Network error'));

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const result = await connector.TestConnection(ci, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Network error');
        });
    });

    describe('DiscoverObjects (live describe — runtime MECHANISM, not a baked catalog)', () => {
        it('should enumerate objects from the live /sobjects/ describe response', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: {
                    sobjects: [
                        { name: 'Account', label: 'Account', queryable: true, createable: true, custom: false },
                        { name: 'Contact', label: 'Contact', queryable: true, createable: true, custom: false },
                        { name: 'ApexLog', label: 'Apex Log', queryable: true, createable: false, custom: false },
                    ],
                },
            }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const objects = await connector.DiscoverObjects(ci, contextUser);

            // The object universe comes from the LIVE describe — not a hardcoded list.
            const names = objects.map(o => o.Name);
            expect(names).toContain('Account');
            expect(names).toContain('Contact');
            // ApexLog is system noise — filtered out by the user-relevance heuristic.
            expect(names).not.toContain('ApexLog');
        });

        it('should always surface per-tenant custom (__c) objects', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: {
                    sobjects: [
                        { name: 'Account', label: 'Account', queryable: true, createable: true, custom: false },
                        { name: 'Widget__c', label: 'Widget', queryable: true, createable: true, custom: true },
                        { name: 'AuditLog__c', label: 'Audit Log', queryable: true, createable: false, custom: true },
                    ],
                },
            }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const objects = await connector.DiscoverObjects(ci, contextUser);

            const names = objects.map(o => o.Name);
            // Custom objects ALWAYS pass — they are customer-defined data the catalog can't predict.
            expect(names).toContain('Widget__c');
            expect(names).toContain('AuditLog__c');
            const widget = objects.find(o => o.Name === 'Widget__c');
            expect(widget?.SupportsWrite).toBe(true);
            expect(widget?.SupportsIncrementalSync).toBe(true);
        });

        it('should exclude non-queryable objects', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: {
                    sobjects: [
                        { name: 'Account', label: 'Account', queryable: true, createable: true, custom: false },
                        { name: 'NonQueryable', label: 'NQ', queryable: false, createable: true, custom: false },
                    ],
                },
            }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const objects = await connector.DiscoverObjects(ci, contextUser);
            expect(objects.map(o => o.Name)).not.toContain('NonQueryable');
        });
    });

    describe('DiscoverFields', () => {
        it('should return field schemas from describe endpoint', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: {
                    fields: [
                        { name: 'Id', label: 'Record ID', type: 'id', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [], inlineHelpText: null },
                        { name: 'Name', label: 'Account Name', type: 'string', nillable: false, defaultedOnCreate: false, externalId: false, calculated: false, updateable: true, referenceTo: [], inlineHelpText: 'The name of the account' },
                        { name: 'BillingAddress', label: 'Billing Address', type: 'address', nillable: true, defaultedOnCreate: false, externalId: false, calculated: false, updateable: false, referenceTo: [], inlineHelpText: null },
                    ],
                },
            }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const fields = await connector.DiscoverFields(ci, 'Account', contextUser);

            // Should skip compound field types (address)
            const names = fields.map(f => f.Name);
            expect(names).toContain('Id');
            expect(names).toContain('Name');
            expect(names).not.toContain('BillingAddress');

            // Check Id field properties
            const idField = fields.find(f => f.Name === 'Id');
            expect(idField!.IsUniqueKey).toBe(true);
            expect(idField!.IsReadOnly).toBe(true);
        });
    });

    describe('FetchChanges', () => {
        it('should build SOQL and return records with watermark', async () => {
            mockJwtSign();

            // First call: describe to get queryable fields
            // Second call: queryAll SOQL
            setupAuthAndApiMock([
                {
                    // describe response for queryable fields
                    body: {
                        fields: [
                            { name: 'Id', type: 'id', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                            { name: 'Name', type: 'string', nillable: true, defaultedOnCreate: false, externalId: false, calculated: false, updateable: true, referenceTo: [] },
                            { name: 'SystemModstamp', type: 'datetime', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                            { name: 'IsDeleted', type: 'boolean', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                            { name: 'LastModifiedById', type: 'reference', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: ['User'] },
                        ],
                    },
                },
                {
                    // SOQL query response
                    body: {
                        totalSize: 2,
                        done: true,
                        records: [
                            { attributes: { type: 'Account' }, Id: '001A000001', Name: 'Acme Inc', SystemModstamp: '2026-03-10T10:00:00.000Z', IsDeleted: false, LastModifiedById: '005xx' },
                            { attributes: { type: 'Account' }, Id: '001A000002', Name: 'Widget Corp', SystemModstamp: '2026-03-11T12:00:00.000Z', IsDeleted: false, LastModifiedById: '005xx' },
                        ],
                    },
                },
            ]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const ctx: FetchContext = {
                CompanyIntegration: ci,
                ObjectName: 'Account',
                WatermarkValue: null,
                BatchSize: 500,
                ContextUser: contextUser,
            };

            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(2);
            expect(result.HasMore).toBe(false);
            expect(result.Records[0].ExternalID).toBe('001A000001');
            expect(result.Records[0].ObjectType).toBe('Account');
            expect(result.Records[0].Fields['Name']).toBe('Acme Inc');
            // Watermark = max SystemModstamp + 1ms. The SOQL filter uses `>=`
            // to avoid dropping records modified at the exact watermark instant,
            // so the saved watermark is shifted past the max we just observed.
            // SF's SystemModstamp is millisecond-precision, so +1ms cannot skip
            // a real record. See SalesforceConnector.ExtractMaxWatermark.
            expect(result.NewWatermarkValue).toBe('2026-03-11T12:00:00.001Z');
        });

        it('should indicate HasMore when query is not done', async () => {
            mockJwtSign();
            setupAuthAndApiMock([
                {
                    body: {
                        fields: [
                            { name: 'Id', type: 'id', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                            { name: 'SystemModstamp', type: 'datetime', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                            { name: 'IsDeleted', type: 'boolean', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                            { name: 'LastModifiedById', type: 'reference', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: ['User'] },
                        ],
                    },
                },
                {
                    body: {
                        totalSize: 100,
                        done: false,
                        nextRecordsUrl: '/services/data/v61.0/query/01gD0000002HU6KIAW-2000',
                        records: [
                            { attributes: { type: 'Contact' }, Id: '003xx1', SystemModstamp: '2026-03-10T10:00:00.000Z', IsDeleted: false, LastModifiedById: '005xx' },
                        ],
                    },
                },
            ]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const ctx: FetchContext = {
                CompanyIntegration: ci,
                ObjectName: 'Contact',
                WatermarkValue: null,
                BatchSize: 1,
                ContextUser: contextUser,
            };

            const result = await connector.FetchChanges(ctx);
            expect(result.HasMore).toBe(true);
        });
    });

    describe('CreateRecord (sObject row resource — BuildCreatedResult invariant)', () => {
        it('should POST to /sobjects/{Type} and extract the ID from the {id,success,errors} body', async () => {
            mockJwtSign();
            let capturedUrl = '';
            let capturedMethod = '';
            let capturedBody: unknown;
            fetchSpy.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
                const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
                if (url.includes('/services/oauth2/token')) return mockTokenResponse();
                capturedUrl = url;
                capturedMethod = init?.method ?? '';
                capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
                return mockApiResponse({ id: '001A000099', success: true, errors: [] }, 201);
            });

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const ctx: CreateRecordContext = {
                CompanyIntegration: ci,
                ObjectName: 'Account',
                Attributes: { Name: 'New Account', Industry: 'Technology' },
                ContextUser: contextUser,
            };

            const result = await connector.CreateRecord(ctx);
            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('001A000099');
            expect(capturedMethod).toBe('POST');
            expect(capturedUrl).toContain('/services/data/v61.0/sobjects/Account/');
            expect(capturedBody).toMatchObject({ Name: 'New Account', Industry: 'Technology' });
        });

        it('should FAIL LOUDLY when a 2xx response carries no record ID (silent-loss guard)', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{ body: { id: '', success: true, errors: [] }, status: 201 }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const result = await connector.CreateRecord({
                CompanyIntegration: ci,
                ObjectName: 'Account',
                Attributes: { Name: 'New Account' },
                ContextUser: contextUser,
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('no record ID');
        });

        it('should FAIL when SF returns 2xx with success=false', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: { id: null, success: false, errors: [{ errorCode: 'REQUIRED_FIELD_MISSING', message: 'Required fields are missing: [Name]' }] },
                status: 201,
            }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const result = await connector.CreateRecord({
                CompanyIntegration: ci,
                ObjectName: 'Account',
                Attributes: {},
                ContextUser: contextUser,
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('success=false');
            expect(result.ErrorMessage).toContain('REQUIRED_FIELD_MISSING');
        });

        it('should strip read-only/system fields from the create body', async () => {
            mockJwtSign();
            let capturedBody: Record<string, unknown> | undefined;
            fetchSpy.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
                const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
                if (url.includes('/services/oauth2/token')) return mockTokenResponse();
                capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
                return mockApiResponse({ id: '001A0000AA', success: true, errors: [] }, 201);
            });

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            await connector.CreateRecord({
                CompanyIntegration: ci,
                ObjectName: 'Account',
                Attributes: { Name: 'X', Id: 'should-not-be-sent', SystemModstamp: '2026-01-01T00:00:00Z' },
                ContextUser: contextUser,
            });
            expect(capturedBody).toBeDefined();
            expect(capturedBody!['Name']).toBe('X');
            expect(capturedBody!['Id']).toBeUndefined();
            expect(capturedBody!['SystemModstamp']).toBeUndefined();
        });
    });

    describe('UpdateRecord', () => {
        it('should PATCH to sobjects endpoint with delta fields', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: null,
                status: 204,
            }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const ctx: UpdateRecordContext = {
                CompanyIntegration: ci,
                ObjectName: 'Account',
                ExternalID: '001A000001',
                Attributes: { Name: 'Updated Account' },
                ContextUser: contextUser,
            };

            const result = await connector.UpdateRecord(ctx);
            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('001A000001');
        });
    });

    describe('DeleteRecord', () => {
        it('should DELETE from sobjects endpoint', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: null,
                status: 204,
            }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const ctx: DeleteRecordContext = {
                CompanyIntegration: ci,
                ObjectName: 'Account',
                ExternalID: '001A000001',
                ContextUser: contextUser,
            };

            const result = await connector.DeleteRecord(ctx);
            expect(result.Success).toBe(true);
        });

        it('should handle ENTITY_IS_DELETED as success', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: [{ message: 'entity is deleted', errorCode: 'ENTITY_IS_DELETED' }],
                status: 404,
            }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const ctx: DeleteRecordContext = {
                CompanyIntegration: ci,
                ObjectName: 'Account',
                ExternalID: '001A000001',
                ContextUser: contextUser,
            };

            const result = await connector.DeleteRecord(ctx);
            expect(result.Success).toBe(true);
        });
    });

    describe('GetRecord', () => {
        it('should return a record by ID', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: { Id: '001A000001', Name: 'Acme', attributes: { type: 'Account' } },
            }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const ctx: GetRecordContext = {
                CompanyIntegration: ci,
                ObjectName: 'Account',
                ExternalID: '001A000001',
                ContextUser: contextUser,
            };

            const result = await connector.GetRecord(ctx);
            expect(result).not.toBeNull();
            expect(result!.ExternalID).toBe('001A000001');
            expect(result!.Fields['Name']).toBe('Acme');
        });

        it('should return null for 404', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: [{ message: 'not found', errorCode: 'NOT_FOUND' }],
                status: 404,
            }]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const ctx: GetRecordContext = {
                CompanyIntegration: ci,
                ObjectName: 'Account',
                ExternalID: '001NOTEXIST',
                ContextUser: contextUser,
            };

            const result = await connector.GetRecord(ctx);
            expect(result).toBeNull();
        });
    });

    describe('SearchRecords', () => {
        it('should build SOQL WHERE clause from filters', async () => {
            mockJwtSign();

            // describe + query
            setupAuthAndApiMock([
                {
                    body: {
                        fields: [
                            { name: 'Id', type: 'id', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                            { name: 'Email', type: 'email', nillable: true, defaultedOnCreate: false, externalId: false, calculated: false, updateable: true, referenceTo: [] },
                            { name: 'SystemModstamp', type: 'datetime', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                            { name: 'IsDeleted', type: 'boolean', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                            { name: 'LastModifiedById', type: 'reference', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: ['User'] },
                        ],
                    },
                },
                {
                    body: {
                        totalSize: 1,
                        done: true,
                        records: [
                            { attributes: { type: 'Contact' }, Id: '003xx1', Email: 'john@example.com', SystemModstamp: '2026-03-10T10:00:00.000Z', IsDeleted: false, LastModifiedById: '005xx' },
                        ],
                    },
                },
            ]);

            const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
            const ctx: SearchContext = {
                CompanyIntegration: ci,
                ObjectName: 'Contact',
                Filters: { Email: 'john@example.com' },
                ContextUser: contextUser,
            };

            const result = await connector.SearchRecords(ctx);
            expect(result.Records.length).toBe(1);
            expect(result.TotalCount).toBe(1);
            expect(result.Records[0].Fields['Email']).toBe('john@example.com');
        });
    });
});

// ─── Create-path response-body validation (BuildCreatedResult + composite) ─────────
//
// CreateBulkJob and ExecuteCompositeRequest are private; this test connector overrides
// the HTTP transport boundary (MakeHTTPRequest) and exposes thin public wrappers so the
// CRUD logic above the wire runs for real. Mirrors the HubSpot silent-failure-guard tests.

interface MockRESTResponse {
    Status: number;
    Body: unknown;
    Headers: Record<string, string>;
}

class TestSalesforceConnector extends SalesforceConnector {
    public NextResponse: MockRESTResponse = { Status: 200, Body: {}, Headers: {} };

    protected override async MakeHTTPRequest(): Promise<MockRESTResponse> {
        return this.NextResponse;
    }

    private get fakeAuth() {
        return { Token: 't', InstanceUrl: 'https://na1.salesforce.com', ApiVersion: '61.0', Config: {} };
    }

    /** Public wrapper around the protected TransformRecord hook. */
    public CallTransformRecord(raw: Record<string, unknown>): Record<string, unknown> {
        const self = this as unknown as {
            TransformRecord: (r: Record<string, unknown>, o: unknown, f: unknown) => Record<string, unknown>;
        };
        return self.TransformRecord(raw, {} as unknown, [] as unknown);
    }

    /** Public wrapper around the protected ExcludedSourceKeys hook. */
    public CallExcludedSourceKeys(objectName: string): string[] {
        const self = this as unknown as { ExcludedSourceKeys: (o: string) => string[] };
        return self.ExcludedSourceKeys(objectName);
    }

    /** Public wrapper around the protected NormalizeResponse hook. */
    public CallNormalizeResponse(rawBody: unknown): Record<string, unknown>[] {
        const self = this as unknown as {
            NormalizeResponse: (b: unknown, k: string | null) => Record<string, unknown>[];
        };
        return self.NormalizeResponse(rawBody, null);
    }

    /** Public wrapper around the private CreateBulkJob for testing. */
    public async CallCreateBulkJob(attrs: Record<string, unknown>) {
        const self = this as unknown as {
            CreateBulkJob: (auth: unknown, family: string, attrs: Record<string, unknown>) => Promise<{ Success: boolean; ExternalID?: string; ErrorMessage?: string; StatusCode: number }>;
        };
        return self.CreateBulkJob(this.fakeAuth, 'bulk_ingest', attrs);
    }

    /** Public wrapper around the private ExecuteCompositeRequest for testing. */
    public async CallExecuteCompositeRequest(attrs: Record<string, unknown>) {
        const self = this as unknown as {
            ExecuteCompositeRequest: (auth: unknown, attrs: Record<string, unknown>) => Promise<{ Success: boolean; ExternalID?: string; ErrorMessage?: string; StatusCode: number }>;
        };
        return self.ExecuteCompositeRequest(this.fakeAuth, attrs);
    }
}

describe('SalesforceConnector.CreateBulkJob (response-body validation)', () => {
    it('returns Success=false when a 2xx response carries no job id (silent-loss guard)', async () => {
        const connector = new TestSalesforceConnector();
        connector.NextResponse = { Status: 200, Body: {}, Headers: {} }; // no id field

        const result = await connector.CallCreateBulkJob({ object: 'Account', operation: 'insert' });

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('no record ID');
    });

    it('returns Success=true with the job id on a clean create', async () => {
        const connector = new TestSalesforceConnector();
        connector.NextResponse = { Status: 200, Body: { id: '750ABC' }, Headers: {} };

        const result = await connector.CallCreateBulkJob({ object: 'Account', operation: 'insert' });

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('750ABC');
    });
});

describe('SalesforceConnector.ExecuteCompositeRequest (sub-request error validation)', () => {
    it('returns Success=false when the envelope is 200 but a sub-request failed (batch-error-swallow guard)', async () => {
        const connector = new TestSalesforceConnector();
        // SF returns HTTP 200 for the overall composite call even though a sub-request 400'd.
        connector.NextResponse = {
            Status: 200,
            Body: {
                compositeResponse: [
                    { referenceId: 'ref1', httpStatusCode: 201, body: { id: '001ABC', success: true } },
                    { referenceId: 'ref2', httpStatusCode: 400, body: [{ errorCode: 'REQUIRED_FIELD_MISSING', message: 'Required fields are missing: [Name]' }] },
                ],
            },
            Headers: {},
        };

        const result = await connector.CallExecuteCompositeRequest({ allOrNone: true, compositeRequest: [] });

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('ref2');
        expect(result.ErrorMessage).toContain('REQUIRED_FIELD_MISSING');
    });

    it('returns Success=true when all sub-requests succeeded', async () => {
        const connector = new TestSalesforceConnector();
        connector.NextResponse = {
            Status: 200,
            Body: {
                compositeResponse: [
                    { referenceId: 'ref1', httpStatusCode: 201, body: { id: '001ABC', success: true } },
                ],
            },
            Headers: {},
        };

        const result = await connector.CallExecuteCompositeRequest({ allOrNone: true, compositeRequest: [] });

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('composite');
    });
});

// ─── TransformRecord / ExcludedSourceKeys (attributes-strip — sanctioned removal) ──────

describe('SalesforceConnector.TransformRecord', () => {
    it('strips the SF `attributes` metadata blob while preserving every data field', () => {
        const connector = new TestSalesforceConnector();
        const raw = {
            attributes: { type: 'Account', url: '/services/data/v61.0/sobjects/Account/001A' },
            Id: '001A',
            Name: 'Acme',
            Custom_Field__c: 'kept',
            AnnualRevenue: 1000,
        };

        const out = connector.CallTransformRecord(raw);

        // attributes removed...
        expect(out['attributes']).toBeUndefined();
        // ...everything else (including custom __c) preserved — full-record pass-through.
        expect(out['Id']).toBe('001A');
        expect(out['Name']).toBe('Acme');
        expect(out['Custom_Field__c']).toBe('kept');
        expect(out['AnnualRevenue']).toBe(1000);
    });

    it('is identity (returns the same object) when no attributes key is present', () => {
        const connector = new TestSalesforceConnector();
        const raw = { Id: '001A', Name: 'Acme' };
        const out = connector.CallTransformRecord(raw);
        expect(out).toBe(raw); // identity fast-path
    });

    it('declares `attributes` as the sanctioned excluded key', () => {
        const connector = new TestSalesforceConnector();
        expect(connector.CallExcludedSourceKeys('Account')).toEqual(['attributes']);
        expect(connector.CallExcludedSourceKeys('Widget__c')).toEqual(['attributes']);
    });
});

// ─── NormalizeResponse (SOQL envelope unwrapping) ─────────────────────────────

describe('SalesforceConnector.NormalizeResponse', () => {
    it('extracts records[] from a SOQL query envelope', () => {
        const connector = new TestSalesforceConnector();
        const out = connector.CallNormalizeResponse({
            totalSize: 2,
            done: true,
            records: [{ Id: 'a' }, { Id: 'b' }],
        });
        expect(out.length).toBe(2);
        expect(out[0]['Id']).toBe('a');
    });

    it('returns an empty array when the envelope has no records', () => {
        const connector = new TestSalesforceConnector();
        expect(connector.CallNormalizeResponse({ totalSize: 0, done: true })).toEqual([]);
    });
});

// ─── FetchChanges incremental — watermark filter + attributes-strip end to end ────────

describe('SalesforceConnector.FetchChanges (incremental + attributes-strip)', () => {
    let connector: SalesforceConnector;
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        connector = new SalesforceConnector();
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });
    afterEach(() => vi.restoreAllMocks());

    it('adds a SystemModstamp watermark filter on a subsequent (incremental) sync and strips attributes from emitted records', async () => {
        vi.mock('jsonwebtoken', () => ({ default: { sign: () => 'mock-jwt-assertion' } }));

        let soqlUrl = '';
        fetchSpy.mockImplementation(async (input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            if (url.includes('/services/oauth2/token')) return mockTokenResponse();
            if (url.includes('/describe')) {
                return mockApiResponse({
                    fields: [
                        { name: 'Id', type: 'id', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                        { name: 'Name', type: 'string', nillable: true, defaultedOnCreate: false, externalId: false, calculated: false, updateable: true, referenceTo: [] },
                        { name: 'SystemModstamp', type: 'datetime', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                        { name: 'IsDeleted', type: 'boolean', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: [] },
                        { name: 'LastModifiedById', type: 'reference', nillable: false, defaultedOnCreate: true, externalId: false, calculated: false, updateable: false, referenceTo: ['User'] },
                    ],
                });
            }
            soqlUrl = url;
            return mockApiResponse({
                totalSize: 1,
                done: true,
                records: [
                    { attributes: { type: 'Account', url: '/x' }, Id: '001A', Name: 'Acme', SystemModstamp: '2026-04-01T00:00:00.000Z', IsDeleted: false, LastModifiedById: '005' },
                ],
            });
        });

        const ci = createMockCompanyIntegration(MOCK_CREDENTIALS);
        const result = await connector.FetchChanges({
            CompanyIntegration: ci,
            ObjectName: 'Account',
            WatermarkValue: '2026-03-01T00:00:00.000Z',
            BatchSize: 500,
            ContextUser: contextUser,
        });

        // Incremental WHERE filter present on the SOQL using the per-object watermark column.
        const decoded = decodeURIComponent(soqlUrl);
        expect(decoded).toContain('WHERE SystemModstamp >= 2026-03-01T00:00:00.000Z');
        expect(decoded).toContain('ORDER BY SystemModstamp ASC');

        // Emitted record carries the full source EXCEPT the stripped attributes blob.
        expect(result.Records.length).toBe(1);
        expect(result.Records[0].Fields['attributes']).toBeUndefined();
        expect(result.Records[0].Fields['Name']).toBe('Acme');
        expect(result.Records[0].Fields['Id']).toBe('001A');
        // Watermark advances past the max SystemModstamp (+1ms).
        expect(result.NewWatermarkValue).toBe('2026-04-01T00:00:00.001Z');
    });
});
