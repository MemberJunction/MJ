import { describe, it, expect, afterAll } from 'vitest';
import { HubSpotConnector } from '../HubSpotConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext } from '@memberjunction/integration-engine';

const MOCK_CONFIG = JSON.stringify({
    server: 'sql-claude',
    database: 'MockHubSpot',
    user: 'sa',
    password: 'Claude2Sql99',
});

/** Minimal stub for MJCompanyIntegrationEntity */
function makeCI(config: string): MJCompanyIntegrationEntity {
    return { Configuration: config } as unknown as MJCompanyIntegrationEntity;
}

const contextUser = {} as UserInfo;

describe('HubSpotConnector', () => {
    const connector = new HubSpotConnector();

    afterAll(async () => {
        await connector.CloseAllPools();
    });

    describe('TestConnection', () => {
        it('should connect successfully to MockHubSpot', async () => {
            const result = await connector.TestConnection(makeCI(MOCK_CONFIG), contextUser);
            expect(result.Success).toBe(true);
            expect(result.Message).toContain('MockHubSpot');
            expect(result.ServerVersion).toBeDefined();
        });

        it('should fail with bad configuration', async () => {
            const badConfig = JSON.stringify({
                server: 'nonexistent',
                database: 'MockHubSpot',
                user: 'sa',
                password: 'wrong',
            });
            const result = await connector.TestConnection(makeCI(badConfig), contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Connection failed');
        });
    });

    describe('DiscoverObjects', () => {
        it('should return all HubSpot tables', async () => {
            const objects = await connector.DiscoverObjects(makeCI(MOCK_CONFIG), contextUser);
            const names = objects.map((o) => o.Name);
            expect(names).toContain('hs_Contacts');
            expect(names).toContain('hs_Companies');
            expect(names).toContain('hs_Deals');
            expect(names).toContain('hs_Owners');
            expect(objects.length).toBe(4);
        });
    });

    describe('DiscoverFields', () => {
        it('should return columns for hs_Contacts', async () => {
            const fields = await connector.DiscoverFields(
                makeCI(MOCK_CONFIG),
                'hs_Contacts',
                contextUser
            );
            const names = fields.map((f) => f.Name);
            expect(names).toContain('hs_object_id');
            expect(names).toContain('firstname');
            expect(names).toContain('lastname');
            expect(names).toContain('email');
            expect(names).toContain('phone');
            expect(names).toContain('lastmodifieddate');
        });
    });

    describe('FetchChanges', () => {
        it('should return ~300 contacts with no watermark', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'hs_Contacts',
                WatermarkValue: null,
                BatchSize: 500,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThanOrEqual(200);
            expect(result.Records.length).toBeLessThanOrEqual(500);
            expect(result.HasMore).toBe(false);

            // Verify record structure
            const record = result.Records[0];
            expect(record.ExternalID).toBeDefined();
            expect(record.ObjectType).toBe('hs_Contacts');
            expect(record.Fields).toBeDefined();
            expect(record.IsDeleted).toBeDefined();
        });

        it('should return 0 contacts with far-future watermark', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'hs_Contacts',
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
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'hs_Contacts',
                WatermarkValue: null,
                BatchSize: 10,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(10);
            expect(result.HasMore).toBe(true);
            expect(result.NewWatermarkValue).toBeDefined();
        });

        it('should fetch hs_Owners using owner_id column', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'hs_Owners',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThan(0);
            expect(result.Records[0].ObjectType).toBe('hs_Owners');
        });
    });

    describe('GetDefaultFieldMappings', () => {
        it('should return mappings for hs_Contacts', () => {
            const mappings = connector.GetDefaultFieldMappings('hs_Contacts', 'Contacts');
            expect(mappings.length).toBe(6);

            const emailMapping = mappings.find((m) => m.SourceFieldName === 'email');
            expect(emailMapping).toBeDefined();
            expect(emailMapping!.DestinationFieldName).toBe('Email');
            expect(emailMapping!.IsKeyField).toBe(true);

            const firstNameMapping = mappings.find((m) => m.SourceFieldName === 'firstname');
            expect(firstNameMapping!.DestinationFieldName).toBe('FirstName');
        });

        it('should return mappings for hs_Companies', () => {
            const mappings = connector.GetDefaultFieldMappings('hs_Companies', 'Companies');
            expect(mappings.length).toBe(5);

            const nameMapping = mappings.find((m) => m.SourceFieldName === 'name');
            expect(nameMapping).toBeDefined();
            expect(nameMapping!.DestinationFieldName).toBe('Name');
            expect(nameMapping!.IsKeyField).toBe(true);
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('hs_Deals', 'Deals');
            expect(mappings).toEqual([]);
        });
    });
});
