import { describe, it, expect, afterAll } from 'vitest';
import { YourMembershipConnector } from '../YourMembershipConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext } from '@memberjunction/integration-engine';

const MOCK_CONFIG = JSON.stringify({
    server: 'sql-claude',
    database: 'MockYourMembership',
    user: 'sa',
    password: 'Claude2Sql99',
});

function makeCI(config: string): MJCompanyIntegrationEntity {
    return { Configuration: config } as unknown as MJCompanyIntegrationEntity;
}

const contextUser = {} as UserInfo;

describe('YourMembershipConnector', () => {
    const connector = new YourMembershipConnector();

    afterAll(async () => {
        await connector.CloseAllPools();
    });

    describe('TestConnection', () => {
        it('should connect successfully to MockYourMembership', async () => {
            const result = await connector.TestConnection(makeCI(MOCK_CONFIG), contextUser);
            expect(result.Success).toBe(true);
            expect(result.Message).toContain('MockYourMembership');
        });
    });

    describe('DiscoverObjects', () => {
        it('should return all YourMembership tables', async () => {
            const objects = await connector.DiscoverObjects(makeCI(MOCK_CONFIG), contextUser);
            const names = objects.map((o) => o.Name);
            expect(names).toContain('ym_Members');
            expect(names).toContain('ym_Events');
            expect(names).toContain('ym_EventRegistrations');
            expect(names).toContain('ym_Chapters');
            expect(names).toContain('ym_MembershipLevels');
            expect(objects.length).toBe(5);
        });
    });

    describe('DiscoverFields', () => {
        it('should return columns for ym_Members', async () => {
            const fields = await connector.DiscoverFields(
                makeCI(MOCK_CONFIG),
                'ym_Members',
                contextUser
            );
            const names = fields.map((f) => f.Name);
            expect(names).toContain('member_id');
            expect(names).toContain('email');
            expect(names).toContain('first_name');
            expect(names).toContain('last_name');
            expect(names).toContain('phone');
            expect(names).toContain('updated_at');
        });
    });

    describe('FetchChanges', () => {
        it('should return ~300 members with no watermark', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'ym_Members',
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
            expect(record.ObjectType).toBe('ym_Members');
        });

        it('should return 0 members with far-future watermark', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'ym_Members',
                WatermarkValue: '2099-01-01T00:00:00.000Z',
                BatchSize: 500,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(0);
        });

        it('should respect BatchSize and indicate HasMore', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'ym_Members',
                WatermarkValue: null,
                BatchSize: 10,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(10);
            expect(result.HasMore).toBe(true);
        });

        it('should fetch ym_Events using created_at', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'ym_Events',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThan(0);
            expect(result.Records[0].ObjectType).toBe('ym_Events');
        });
    });

    describe('GetDefaultFieldMappings', () => {
        it('should return mappings for ym_Members', () => {
            const mappings = connector.GetDefaultFieldMappings('ym_Members', 'Contacts');
            expect(mappings.length).toBe(5);

            const emailMapping = mappings.find((m) => m.SourceFieldName === 'email');
            expect(emailMapping).toBeDefined();
            expect(emailMapping!.DestinationFieldName).toBe('Email');
            expect(emailMapping!.IsKeyField).toBe(true);

            const firstNameMapping = mappings.find((m) => m.SourceFieldName === 'first_name');
            expect(firstNameMapping!.DestinationFieldName).toBe('FirstName');
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('ym_Events', 'Events');
            expect(mappings).toEqual([]);
        });
    });
});
