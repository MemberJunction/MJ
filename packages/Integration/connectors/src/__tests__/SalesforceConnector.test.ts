import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { SalesforceConnector } from '../SalesforceConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext } from '@memberjunction/integration-engine';
import { canConnectToMockDB } from './db-availability.js';

function createMockCompanyIntegration(config: Record<string, string>): MJCompanyIntegrationEntity {
    const configJson = JSON.stringify(config);
    return { Get: (field: string) => field === 'Configuration' ? configJson : null } as unknown as MJCompanyIntegrationEntity;
}

const MOCK_CI = createMockCompanyIntegration({
    server: 'sql-claude',
    database: 'mock_data',
    schema: 'sf',
    user: 'sa',
    password: 'Claude2Sql99',
});

const contextUser = {} as UserInfo;

// --- Tests that always run (no DB required) ---
describe('SalesforceConnector (unit)', () => {
    describe('GetDefaultFieldMappings', () => {
        const connector = new SalesforceConnector();

        it('should return mappings for Contact', () => {
            const mappings = connector.GetDefaultFieldMappings('Contact', 'Contacts');
            expect(mappings.length).toBe(6);

            const emailMapping = mappings.find((m) => m.SourceFieldName === 'Email');
            expect(emailMapping).toBeDefined();
            expect(emailMapping!.DestinationFieldName).toBe('Email');
            expect(emailMapping!.IsKeyField).toBe(true);
        });

        it('should return mappings for Account', () => {
            const mappings = connector.GetDefaultFieldMappings('Account', 'Companies');
            expect(mappings.length).toBe(5);

            const nameMapping = mappings.find((m) => m.SourceFieldName === 'Name');
            expect(nameMapping!.DestinationFieldName).toBe('Name');
            expect(nameMapping!.IsKeyField).toBe(true);
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('Opportunity', 'Opportunities');
            expect(mappings).toEqual([]);
        });
    });
});

// --- Tests that require sql-claude (skipped in CI) ---
describe('SalesforceConnector (integration)', () => {
    let dbAvailable = false;

    beforeAll(async () => {
        dbAvailable = await canConnectToMockDB();
    });

    describe('TestConnection', () => {
        it('should connect successfully to mock_data', async ({ skip }) => {
            if (!dbAvailable) skip();
            const connector = new SalesforceConnector();
            try {
                const result = await connector.TestConnection(MOCK_CI, contextUser);
                expect(result.Success).toBe(true);
                expect(result.Message).toContain('mock_data');
            } finally {
                await connector.CloseAllPools();
            }
        });
    });

    describe('DiscoverObjects', () => {
        it('should return all Salesforce tables in sf schema', async ({ skip }) => {
            if (!dbAvailable) skip();
            const connector = new SalesforceConnector();
            try {
                const objects = await connector.DiscoverObjects(MOCK_CI, contextUser);
                const names = objects.map((o) => o.Name);
                expect(names).toContain('Contact');
                expect(names).toContain('Account');
                expect(names).toContain('Opportunity');
                expect(objects.length).toBe(3);
            } finally {
                await connector.CloseAllPools();
            }
        });
    });

    describe('DiscoverFields', () => {
        it('should return columns for Contact', async ({ skip }) => {
            if (!dbAvailable) skip();
            const connector = new SalesforceConnector();
            try {
                const fields = await connector.DiscoverFields(
                    MOCK_CI,
                    'Contact',
                    contextUser
                );
                const names = fields.map((f) => f.Name);
                expect(names).toContain('Id');
                expect(names).toContain('FirstName');
                expect(names).toContain('LastName');
                expect(names).toContain('Email');
                expect(names).toContain('Phone');
                expect(names).toContain('LastModifiedDate');
            } finally {
                await connector.CloseAllPools();
            }
        });
    });

    describe('FetchChanges', () => {
        let connector: SalesforceConnector;

        beforeAll(() => {
            connector = new SalesforceConnector();
        });

        afterAll(async () => {
            await connector.CloseAllPools();
        });

        it('should return 50 contacts with no watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'Contact',
                WatermarkValue: null,
                BatchSize: 500,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThanOrEqual(50);
            expect(result.HasMore).toBe(false);

            const record = result.Records[0];
            expect(record.ExternalID).toBeDefined();
            expect(record.ObjectType).toBe('Contact');
            expect(record.Fields).toBeDefined();
        });

        it('should return 0 contacts with far-future watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'Contact',
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
                ObjectName: 'Contact',
                WatermarkValue: null,
                BatchSize: 10,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(10);
            expect(result.HasMore).toBe(true);
            expect(result.NewWatermarkValue).toBeDefined();
        });

        it('should fetch Account records', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'Account',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThanOrEqual(20); // seed has 20, E2E may add more
            expect(result.Records[0].ObjectType).toBe('Account');
        });

        it('should fetch Opportunity records', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'Opportunity',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThanOrEqual(30); // seed has 30, E2E may add more
            expect(result.Records[0].ObjectType).toBe('Opportunity');
        });
    });
});
