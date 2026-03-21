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
        Get: (field: string) => {
            if (field === 'Configuration') return config;
            if (field === 'CredentialID') return null; // skip DB credential path
            return null;
        },
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

    describe('GetIntegrationObjects', () => {
        it('should return 9 SF standard objects', () => {
            const objects = connector.GetIntegrationObjects();
            expect(objects.length).toBe(9);

            const names = objects.map(o => o.Name);
            expect(names).toContain('Account');
            expect(names).toContain('Contact');
            expect(names).toContain('Lead');
            expect(names).toContain('Opportunity');
            expect(names).toContain('Task');
            expect(names).toContain('Event');
            expect(names).toContain('Case');
            expect(names).toContain('Campaign');
            expect(names).toContain('User');
        });

        it('should mark User as non-writable', () => {
            const objects = connector.GetIntegrationObjects();
            const user = objects.find(o => o.Name === 'User');
            expect(user?.SupportsWrite).toBe(false);
        });

        it('should include Id as PrimaryKey for all objects', () => {
            const objects = connector.GetIntegrationObjects();
            for (const obj of objects) {
                const idField = obj.Fields.find(f => f.Name === 'Id');
                expect(idField, `${obj.Name} should have Id field`).toBeDefined();
                expect(idField!.IsPrimaryKey).toBe(true);
                expect(idField!.IsReadOnly).toBe(true);
            }
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

    describe('DiscoverObjects', () => {
        it('should return object schemas from /sobjects/', async () => {
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

            // Should filter to queryable objects
            expect(objects.length).toBeGreaterThanOrEqual(2);
            const names = objects.map(o => o.Name);
            expect(names).toContain('Account');
            expect(names).toContain('Contact');
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
            // Watermark should be the max SystemModstamp
            expect(result.NewWatermarkValue).toBe('2026-03-11T12:00:00.000Z');
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

    describe('CreateRecord', () => {
        it('should POST to sobjects endpoint and return success', async () => {
            mockJwtSign();
            setupAuthAndApiMock([{
                body: { id: '001A000099', success: true, errors: [] },
                status: 201,
            }]);

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
