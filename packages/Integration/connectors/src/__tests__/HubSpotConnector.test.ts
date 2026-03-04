import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { HubSpotConnector } from '../HubSpotConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext } from '@memberjunction/integration-engine';
import { canConnectToMockDB } from './db-availability.js';

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

// --- Tests that always run (no DB required) ---
describe('HubSpotConnector (unit)', () => {
    describe('GetDefaultFieldMappings', () => {
        const connector = new HubSpotConnector();

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

// --- Tests that require sql-claude (skipped in CI) ---
describe('HubSpotConnector (integration)', () => {
    let dbAvailable = false;

    beforeAll(async () => {
        dbAvailable = await canConnectToMockDB();
    });

    describe('TestConnection', () => {
        it('should connect successfully to mock_data', async ({ skip }) => {
            if (!dbAvailable) skip();
            const connector = new HubSpotConnector();
            try {
                const result = await connector.TestConnection(MOCK_CI, contextUser);
                expect(result.Success).toBe(true);
                expect(result.Message).toContain('mock_data');
                expect(result.ServerVersion).toBeDefined();
            } finally {
                await connector.CloseAllPools();
            }
        });

        it('should fail with bad configuration', async ({ skip }) => {
            if (!dbAvailable) skip();
            const connector = new HubSpotConnector();
            try {
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
            } finally {
                await connector.CloseAllPools();
            }
        });
    });

    describe('DiscoverObjects', () => {
        it('should return all HubSpot tables in hs schema', async ({ skip }) => {
            if (!dbAvailable) skip();
            const connector = new HubSpotConnector();
            try {
                const objects = await connector.DiscoverObjects(MOCK_CI, contextUser);
                const names = objects.map((o) => o.Name);
                expect(names).toContain('contacts');
                expect(names).toContain('companies');
                expect(names).toContain('deals');
                expect(objects.length).toBe(3);
            } finally {
                await connector.CloseAllPools();
            }
        });
    });

    describe('DiscoverFields', () => {
        it('should return columns for contacts', async ({ skip }) => {
            if (!dbAvailable) skip();
            const connector = new HubSpotConnector();
            try {
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
            } finally {
                await connector.CloseAllPools();
            }
        });
    });

    describe('FetchChanges', () => {
        let connector: HubSpotConnector;

        beforeAll(() => {
            connector = new HubSpotConnector();
        });

        afterAll(async () => {
            await connector.CloseAllPools();
        });

        it('should return 50 contacts with no watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
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

            const record = result.Records[0];
            expect(record.ExternalID).toBeDefined();
            expect(record.ObjectType).toBe('contacts');
            expect(record.Fields).toBeDefined();
        });

        it('should return 0 contacts with far-future watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
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

        it('should respect BatchSize and indicate HasMore', async ({ skip }) => {
            if (!dbAvailable) skip();
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

        it('should fetch companies using companyId column', async ({ skip }) => {
            if (!dbAvailable) skip();
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

        it('should fetch deals using dealId column', async ({ skip }) => {
            if (!dbAvailable) skip();
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
});
