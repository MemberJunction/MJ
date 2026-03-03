import { describe, it, expect, afterAll } from 'vitest';
import { SalesforceConnector } from '../SalesforceConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext } from '@memberjunction/integration-engine';

const MOCK_CONFIG = JSON.stringify({
    server: 'sql-claude',
    database: 'MockSalesforce',
    user: 'sa',
    password: 'Claude2Sql99',
});

function makeCI(config: string): MJCompanyIntegrationEntity {
    return { Configuration: config } as unknown as MJCompanyIntegrationEntity;
}

const contextUser = {} as UserInfo;

describe('SalesforceConnector', () => {
    const connector = new SalesforceConnector();

    afterAll(async () => {
        await connector.CloseAllPools();
    });

    describe('TestConnection', () => {
        it('should connect successfully to MockSalesforce', async () => {
            const result = await connector.TestConnection(makeCI(MOCK_CONFIG), contextUser);
            expect(result.Success).toBe(true);
            expect(result.Message).toContain('MockSalesforce');
        });
    });

    describe('DiscoverObjects', () => {
        it('should return all Salesforce tables', async () => {
            const objects = await connector.DiscoverObjects(makeCI(MOCK_CONFIG), contextUser);
            const names = objects.map((o) => o.Name);
            expect(names).toContain('sf_Contact');
            expect(names).toContain('sf_Account');
            expect(names).toContain('sf_Opportunity');
            expect(names).toContain('sf_User');
            expect(objects.length).toBe(4);
        });
    });

    describe('DiscoverFields', () => {
        it('should return columns for sf_Contact', async () => {
            const fields = await connector.DiscoverFields(
                makeCI(MOCK_CONFIG),
                'sf_Contact',
                contextUser
            );
            const names = fields.map((f) => f.Name);
            expect(names).toContain('Id');
            expect(names).toContain('FirstName');
            expect(names).toContain('LastName');
            expect(names).toContain('Email');
            expect(names).toContain('Phone');
            expect(names).toContain('LastModifiedDate');
        });
    });

    describe('FetchChanges', () => {
        it('should return ~300 contacts with no watermark', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'sf_Contact',
                WatermarkValue: null,
                BatchSize: 500,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThanOrEqual(200);
            expect(result.Records.length).toBeLessThanOrEqual(500);
            expect(result.HasMore).toBe(false);

            const record = result.Records[0];
            expect(record.ExternalID).toBeDefined();
            expect(record.ObjectType).toBe('sf_Contact');
            expect(record.Fields).toBeDefined();
        });

        it('should return 0 contacts with far-future watermark', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'sf_Contact',
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
                ObjectName: 'sf_Contact',
                WatermarkValue: null,
                BatchSize: 10,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(10);
            expect(result.HasMore).toBe(true);
            expect(result.NewWatermarkValue).toBeDefined();
        });

        it('should fetch sf_User using CreatedDate', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'sf_User',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThan(0);
            expect(result.Records[0].ObjectType).toBe('sf_User');
        });
    });

    describe('GetDefaultFieldMappings', () => {
        it('should return mappings for sf_Contact', () => {
            const mappings = connector.GetDefaultFieldMappings('sf_Contact', 'Contacts');
            expect(mappings.length).toBe(6);

            const emailMapping = mappings.find((m) => m.SourceFieldName === 'Email');
            expect(emailMapping).toBeDefined();
            expect(emailMapping!.DestinationFieldName).toBe('Email');
            expect(emailMapping!.IsKeyField).toBe(true);
        });

        it('should return mappings for sf_Account', () => {
            const mappings = connector.GetDefaultFieldMappings('sf_Account', 'Companies');
            expect(mappings.length).toBe(5);

            const nameMapping = mappings.find((m) => m.SourceFieldName === 'Name');
            expect(nameMapping!.DestinationFieldName).toBe('Name');
            expect(nameMapping!.IsKeyField).toBe(true);
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('sf_Opportunity', 'Opportunities');
            expect(mappings).toEqual([]);
        });
    });
});
