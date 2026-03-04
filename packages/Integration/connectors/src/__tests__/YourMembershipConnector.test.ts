import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { YourMembershipConnector } from '../YourMembershipConnector.js';
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
    schema: 'ym',
    user: 'sa',
    password: 'Claude2Sql99',
});

const contextUser = {} as UserInfo;

// --- Tests that always run (no DB required) ---
describe('YourMembershipConnector (unit)', () => {
    describe('GetDefaultFieldMappings', () => {
        const connector = new YourMembershipConnector();

        it('should return mappings for members', () => {
            const mappings = connector.GetDefaultFieldMappings('members', 'Contacts');
            expect(mappings.length).toBe(5);

            const emailMapping = mappings.find((m) => m.SourceFieldName === 'email');
            expect(emailMapping).toBeDefined();
            expect(emailMapping!.DestinationFieldName).toBe('Email');
            expect(emailMapping!.IsKeyField).toBe(true);

            const firstNameMapping = mappings.find((m) => m.SourceFieldName === 'first_name');
            expect(firstNameMapping!.DestinationFieldName).toBe('FirstName');
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('events', 'Events');
            expect(mappings).toEqual([]);
        });
    });
});

// --- Tests that require sql-claude (skipped in CI) ---
describe('YourMembershipConnector (integration)', () => {
    let dbAvailable = false;

    beforeAll(async () => {
        dbAvailable = await canConnectToMockDB();
    });

    describe('TestConnection', () => {
        it('should connect successfully to mock_data', async ({ skip }) => {
            if (!dbAvailable) skip();
            const connector = new YourMembershipConnector();
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
        it('should return all YourMembership tables in ym schema', async ({ skip }) => {
            if (!dbAvailable) skip();
            const connector = new YourMembershipConnector();
            try {
                const objects = await connector.DiscoverObjects(MOCK_CI, contextUser);
                const names = objects.map((o) => o.Name);
                expect(names).toContain('members');
                expect(names).toContain('membership_types');
                expect(names).toContain('events');
                expect(names).toContain('event_registrations');
                expect(objects.length).toBe(4);
            } finally {
                await connector.CloseAllPools();
            }
        });
    });

    describe('DiscoverFields', () => {
        it('should return columns for members', async ({ skip }) => {
            if (!dbAvailable) skip();
            const connector = new YourMembershipConnector();
            try {
                const fields = await connector.DiscoverFields(
                    MOCK_CI,
                    'members',
                    contextUser
                );
                const names = fields.map((f) => f.Name);
                expect(names).toContain('member_id');
                expect(names).toContain('email');
                expect(names).toContain('first_name');
                expect(names).toContain('last_name');
                expect(names).toContain('phone');
                expect(names).toContain('updated_at');
            } finally {
                await connector.CloseAllPools();
            }
        });
    });

    describe('FetchChanges', () => {
        let connector: YourMembershipConnector;

        beforeAll(() => {
            connector = new YourMembershipConnector();
        });

        afterAll(async () => {
            await connector.CloseAllPools();
        });

        it('should return all members with no watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'members',
                WatermarkValue: null,
                BatchSize: 500,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThanOrEqual(50);
            expect(result.HasMore).toBe(false);

            const record = result.Records[0];
            expect(record.ExternalID).toBeDefined();
            expect(record.ObjectType).toBe('members');
        });

        it('should return 0 members with far-future watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'members',
                WatermarkValue: '2099-01-01T00:00:00.000Z',
                BatchSize: 500,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(0);
        });

        it('should respect BatchSize and indicate HasMore', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'members',
                WatermarkValue: null,
                BatchSize: 10,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(10);
            expect(result.HasMore).toBe(true);
        });

        it('should fetch events using updated_at', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'events',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(10);
            expect(result.Records[0].ObjectType).toBe('events');
        });

        it('should fetch membership_types using updated_at', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'membership_types',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(5);
            expect(result.Records[0].ObjectType).toBe('membership_types');
        });

        it('should fetch event_registrations using updated_at', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx: FetchContext = {
                CompanyIntegration: MOCK_CI,
                ObjectName: 'event_registrations',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(40);
            expect(result.Records[0].ObjectType).toBe('event_registrations');
        });
    });
});
