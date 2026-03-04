import { describe, it, expect, afterAll } from 'vitest';
import { HubSpotConnector } from '../HubSpotConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext } from '@memberjunction/integration-engine';

/**
 * Creates a minimal mock MJCompanyIntegrationEntity with a .Get() method
 * matching the interface used by RelationalDBConnector.ParseConnectionConfig().
 */
function createMockCompanyIntegration(config: Record<string, string>): MJCompanyIntegrationEntity {
    const configJson = JSON.stringify(config);
    return { Get: (field: string) => field === 'Configuration' ? configJson : null } as unknown as MJCompanyIntegrationEntity;
}

const MOCK_CI = createMockCompanyIntegration({
    server: 'sql-claude',
    database: 'mock_data',
    schema: 'hs',
    user: 'sa',
    password: 'Claude2Sql99',
});

const contextUser = {} as UserInfo;

describe('HubSpotConnector', () => {
    const connector = new HubSpotConnector();

    afterAll(async () => {
        await connector.CloseAllPools();
    });

    describe('TestConnection', () => {
        it('should connect successfully to mock_data', async () => {
            const result = await connector.TestConnection(MOCK_CI, contextUser);
            expect(result.Success).toBe(true);
            expect(result.Message).toContain('mock_data');
            expect(result.ServerVersion).toBeDefined();
        });

        it('should fail with bad configuration', async () => {
            const badCI = createMockCompanyIntegration({
                server: 'nonexistent',
                database: 'mock_data',
                schema: 'hs',
                user: 'sa',
                password: 'wrong',
            });
            const result = await connector.TestConnection(badCI, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Connection failed');
        });
    });

    describe('DiscoverObjects', () => {
        it('should return all HubSpot tables in hs schema', async () => {
            const objects = await connector.DiscoverObjects(MOCK_CI, contextUser);
            const names = objects.map((o) => o.Name);
            expect(names).toContain('contacts');
            expect(names).toContain('companies');
            expect(names).toContain('deals');
            expect(objects.length).toBe(3);
        });
    });

    describe('DiscoverFields', () => {
        it('should return columns for contacts', async () => {
            const fields = await connector.DiscoverFields(
                MOCK_CI,
                'contacts',
                contextUser
            );
            const names = fields.map((f) => f.Name);
            expect(names).toContain('vid');
            expect(names).toContain('firstname');
            expect(names).toContain('lastname');
            expect(names).toContain('email');
            expect(names).toContain('phone');
            expect(names).toContain('lastmodifieddate');
        });
    });

    describe('FetchChanges', () => {
        it('should return 50 contacts with no watermark', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'contacts',
                WatermarkValue: null,
                BatchSize: 500,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(50);
            expect(result.HasMore).toBe(false);

            // Verify record structure
            const record = result.Records[0];
            expect(record.ExternalID).toBeDefined();
            expect(record.ObjectType).toBe('contacts');
            expect(record.Fields).toBeDefined();
        });

        it('should return 0 contacts with far-future watermark', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'contacts',
                WatermarkValue: '2099-01-01T00:00:00.000Z',
                BatchSize: 500,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(0);
            expect(result.HasMore).toBe(false);
        });

        it('should respect BatchSize and indicate HasMore', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'contacts',
                WatermarkValue: null,
                BatchSize: 10,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(10);
            expect(result.HasMore).toBe(true);
            expect(result.NewWatermarkValue).toBeDefined();
        });

        it('should fetch companies using companyId column', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'companies',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(20);
            expect(result.Records[0].ObjectType).toBe('companies');
        });

        it('should fetch deals using dealId column', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'deals',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(30);
            expect(result.Records[0].ObjectType).toBe('deals');
        });
    });

    describe('GetDefaultFieldMappings', () => {
        it('should return mappings for contacts', () => {
            const mappings = connector.GetDefaultFieldMappings('contacts', 'Contacts');
            expect(mappings.length).toBe(6);

            const emailMapping = mappings.find((m) => m.SourceFieldName === 'email');
            expect(emailMapping).toBeDefined();
            expect(emailMapping!.DestinationFieldName).toBe('Email');
            expect(emailMapping!.IsKeyField).toBe(true);

            const firstNameMapping = mappings.find((m) => m.SourceFieldName === 'firstname');
            expect(firstNameMapping!.DestinationFieldName).toBe('FirstName');
        });

        it('should return mappings for companies', () => {
            const mappings = connector.GetDefaultFieldMappings('companies', 'Companies');
            expect(mappings.length).toBe(5);

            const nameMapping = mappings.find((m) => m.SourceFieldName === 'name');
            expect(nameMapping).toBeDefined();
            expect(nameMapping!.DestinationFieldName).toBe('Name');
            expect(nameMapping!.IsKeyField).toBe(true);
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('deals', 'Deals');
            expect(mappings).toEqual([]);
        });
    });
});
