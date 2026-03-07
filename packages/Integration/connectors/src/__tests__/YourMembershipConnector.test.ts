import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YourMembershipConnector } from '../YourMembershipConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext } from '@memberjunction/integration-engine';

// ─── Test helpers ────────────────────────────────────────────────

function createMockCompanyIntegration(config: Record<string, string>): MJCompanyIntegrationEntity {
    const configJson = JSON.stringify(config);
    return { Get: (field: string) => field === 'Configuration' ? configJson : null } as unknown as MJCompanyIntegrationEntity;
}

const VALID_CONFIG = {
    ClientID: '25363',
    APIKey: 'test-api-key',
    APIPassword: 'test-api-password',
};

const MOCK_CI = createMockCompanyIntegration(VALID_CONFIG);
const contextUser = {} as UserInfo;

// ─── Unit Tests (no network) ─────────────────────────────────────

describe('YourMembershipConnector (unit)', () => {
    describe('GetDefaultFieldMappings', () => {
        const connector = new YourMembershipConnector();

        it('should return mappings for Members', () => {
            const mappings = connector.GetDefaultFieldMappings('Members', 'Contacts');
            expect(mappings.length).toBe(6);

            const emailMapping = mappings.find(m => m.SourceFieldName === 'EmailAddr');
            expect(emailMapping).toBeDefined();
            expect(emailMapping!.DestinationFieldName).toBe('Email');
            expect(emailMapping!.IsKeyField).toBe(true);
        });

        it('should return mappings for Events', () => {
            const mappings = connector.GetDefaultFieldMappings('Events', 'Events');
            expect(mappings.length).toBe(4);

            const idMapping = mappings.find(m => m.SourceFieldName === 'EventId');
            expect(idMapping).toBeDefined();
            expect(idMapping!.IsKeyField).toBe(true);
        });

        it('should return empty array for unknown objects', () => {
            expect(connector.GetDefaultFieldMappings('Unknown', 'Whatever')).toEqual([]);
        });
    });

    describe('DiscoverObjects', () => {
        it('should return all known YM objects', async () => {
            const connector = new YourMembershipConnector();
            const objects = await connector.DiscoverObjects(MOCK_CI, contextUser);
            const names = objects.map(o => o.Name);

            expect(names).toContain('Members');
            expect(names).toContain('Events');
            expect(names).toContain('MemberTypes');
            expect(names).toContain('Memberships');
            expect(names).toContain('Groups');
            expect(names).toContain('Products');
            expect(names).toContain('DonationFunds');
            expect(names).toContain('Certifications');
            expect(objects.length).toBe(8);

            for (const obj of objects) {
                expect(obj.SupportsWrite).toBe(false);
                expect(obj.Label).toBeTruthy();
            }
        });
    });

    describe('DiscoverFields', () => {
        const connector = new YourMembershipConnector();

        it('should return fields for Members', async () => {
            const fields = await connector.DiscoverFields(MOCK_CI, 'Members', contextUser);
            const names = fields.map(f => f.Name);

            expect(names).toContain('ProfileID');
            expect(names).toContain('FirstName');
            expect(names).toContain('LastName');
            expect(names).toContain('EmailAddr');
            expect(names).toContain('MemberTypeCode');
            expect(fields.length).toBeGreaterThan(10);

            const profileId = fields.find(f => f.Name === 'ProfileID');
            expect(profileId!.IsUniqueKey).toBe(true);
            expect(profileId!.IsRequired).toBe(true);
        });

        it('should return fields for Events', async () => {
            const fields = await connector.DiscoverFields(MOCK_CI, 'Events', contextUser);
            expect(fields.find(f => f.Name === 'EventId')).toBeDefined();
            expect(fields.find(f => f.Name === 'Name')).toBeDefined();
        });

        it('should return fields for Groups', async () => {
            const fields = await connector.DiscoverFields(MOCK_CI, 'Groups', contextUser);
            expect(fields.find(f => f.Name === 'Id')).toBeDefined();
            expect(fields.find(f => f.Name === 'GroupTypeName')).toBeDefined();
        });

        it('should return empty for unknown object', async () => {
            const fields = await connector.DiscoverFields(MOCK_CI, 'Unknown', contextUser);
            expect(fields).toEqual([]);
        });
    });

    describe('ParseConfig', () => {
        it('should return failure on missing Configuration', async () => {
            const badCi = { Get: () => null } as unknown as MJCompanyIntegrationEntity;
            const connector = new YourMembershipConnector();
            const result = await connector.TestConnection(badCi, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('No YM credentials found');
        });

        it('should return failure on incomplete Configuration', async () => {
            const badCi = createMockCompanyIntegration({ ClientID: '123' });
            const connector = new YourMembershipConnector();
            const result = await connector.TestConnection(badCi, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('must contain');
        });
    });

    describe('GetDefaultConfiguration', () => {
        it('should include Members with DetailPath', () => {
            const connector = new YourMembershipConnector();
            const config = connector.GetDefaultConfiguration();
            expect(config.DefaultSchemaName).toBe('YourMembership');
            expect(config.DefaultObjects.find(o => o.SourceObjectName === 'Members')).toBeDefined();
        });
    });
});

// ─── Detail enrichment tests ────────────────────────────────────

describe('YourMembershipConnector (enrichment)', () => {
    it('should enrich records with detail data when detail endpoint is available', async () => {
        const connector = new YourMembershipConnector();

        // Mock MakeRequest to return detail data
        const mockMakeRequest = vi.fn()
            // First call: list endpoint
            .mockResolvedValueOnce({
                Members: [
                    { ProfileID: 123, FirstName: 'Jane', LastName: 'Doe' },
                ],
            })
            // Second call: detail endpoint for ProfileID 123 (returns camelCase + nested)
            .mockResolvedValueOnce({
                id: 123,
                firstName: 'Jane',
                lastName: 'Doe',
                emailAddress: 'jane@example.com',
                organization: 'Acme Corp',
                primaryAddress: {
                    phone: '555-1234',
                    address1: '123 Main St',
                    city: 'Portland',
                    location: 'Oregon',
                    postalCode: '97201',
                    countryName: 'United States',
                },
                UsingRedis: true,
                ServerID: 'WS-1',
                ResponseStatus: { ErrorCode: 'None' },
            });

        (connector as unknown as Record<string, unknown>)['MakeRequest'] = mockMakeRequest;
        (connector as unknown as Record<string, unknown>)['GetSession'] = vi.fn().mockResolvedValue('fake-session');
        (connector as unknown as Record<string, unknown>)['ParseConfig'] = vi.fn().mockResolvedValue({
            ClientID: '12345',
            APIKey: 'key',
            APIPassword: 'pass',
        });

        const ctx: FetchContext = {
            CompanyIntegration: MOCK_CI,
            ObjectName: 'Members',
            WatermarkValue: null,
            BatchSize: 5,
            ContextUser: contextUser,
        };

        const result = await connector.FetchChanges(ctx);
        expect(result.Records.length).toBe(1);

        const record = result.Records[0];
        // Should have enriched and normalized data from detail endpoint
        expect(record.Fields['EmailAddr']).toBe('jane@example.com');
        expect(record.Fields['Phone']).toBe('555-1234');
        expect(record.Fields['City']).toBe('Portland');
        expect(record.Fields['State']).toBe('Oregon');
        expect(record.Fields['PostalCode']).toBe('97201');
        expect(record.Fields['Organization']).toBe('Acme Corp');
        expect(record.Fields['Address1']).toBe('123 Main St');
        // Metadata keys should be filtered out
        expect(record.Fields['UsingRedis']).toBeUndefined();
        expect(record.Fields['ServerID']).toBeUndefined();
        expect(record.Fields['ResponseStatus']).toBeUndefined();

        // Verify detail endpoint was called with correct path
        expect(mockMakeRequest).toHaveBeenCalledTimes(2);
        expect(mockMakeRequest).toHaveBeenLastCalledWith(expect.anything(), 'Members/123');
    });

    it('should gracefully handle detail endpoint failures', async () => {
        const connector = new YourMembershipConnector();

        const mockMakeRequest = vi.fn()
            .mockResolvedValueOnce({
                Members: [
                    { ProfileID: 456, FirstName: 'Bob', LastName: 'Smith' },
                ],
            })
            .mockRejectedValueOnce(new Error('API timeout'));

        (connector as unknown as Record<string, unknown>)['MakeRequest'] = mockMakeRequest;
        (connector as unknown as Record<string, unknown>)['GetSession'] = vi.fn().mockResolvedValue('fake-session');
        (connector as unknown as Record<string, unknown>)['ParseConfig'] = vi.fn().mockResolvedValue({
            ClientID: '12345',
            APIKey: 'key',
            APIPassword: 'pass',
        });

        const ctx: FetchContext = {
            CompanyIntegration: MOCK_CI,
            ObjectName: 'Members',
            WatermarkValue: null,
            BatchSize: 5,
            ContextUser: contextUser,
        };

        const result = await connector.FetchChanges(ctx);
        expect(result.Records.length).toBe(1);
        // Should still have list data even though detail call failed
        expect(result.Records[0].Fields['FirstName']).toBe('Bob');
    });
});

// ─── Integration tests (require live YM API) ────────────────────

describe('YourMembershipConnector (live API)', () => {
    const apiKey = process.env['MRAA_YM_LICENSE_KEY'];
    const apiPassword = process.env['MRAA_YM_API_KEY'];
    const clientId = process.env['MRAA_YM_CLIENT_ID'];

    const hasCredentials = !!(apiKey && apiPassword && clientId);

    const liveCi = hasCredentials
        ? createMockCompanyIntegration({ ClientID: clientId!, APIKey: apiKey!, APIPassword: apiPassword! })
        : MOCK_CI;

    describe('TestConnection', () => {
        it('should authenticate and return site info', async ({ skip }) => {
            if (!hasCredentials) skip();
            const connector = new YourMembershipConnector();
            const result = await connector.TestConnection(liveCi, contextUser);

            expect(result.Success).toBe(true);
            expect(result.Message).toContain('YourMembership');
            expect(result.ServerVersion).toContain(clientId);
        });
    });

    describe('FetchChanges', () => {
        it('should fetch members with pagination', async ({ skip }) => {
            if (!hasCredentials) skip();
            const connector = new YourMembershipConnector();
            const ctx: FetchContext = {
                CompanyIntegration: liveCi,
                ObjectName: 'Members',
                WatermarkValue: null,
                BatchSize: 5,
                ContextUser: contextUser,
            };

            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThan(0);
            expect(result.Records.length).toBeLessThanOrEqual(5);
            expect(result.HasMore).toBe(true);

            const firstMember = result.Records[0];
            expect(firstMember.ExternalID).toBeTruthy();
            expect(firstMember.ObjectType).toBe('Members');
            expect(firstMember.Fields['ProfileID']).toBeDefined();
            expect(firstMember.Fields['FirstName']).toBeDefined();
        });

        it('should fetch page 2 using watermark', async ({ skip }) => {
            if (!hasCredentials) skip();
            const connector = new YourMembershipConnector();
            const ctx: FetchContext = {
                CompanyIntegration: liveCi,
                ObjectName: 'Members',
                WatermarkValue: '2',
                BatchSize: 3,
                ContextUser: contextUser,
            };

            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThan(0);
        });

        it('should fetch MemberTypes (non-paginated)', async ({ skip }) => {
            if (!hasCredentials) skip();
            const connector = new YourMembershipConnector();
            const ctx: FetchContext = {
                CompanyIntegration: liveCi,
                ObjectName: 'MemberTypes',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };

            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThan(0);
            expect(result.HasMore).toBe(false);
            expect(result.Records[0].Fields['TypeCode']).toBeDefined();
        });

        it('should fetch Memberships', async ({ skip }) => {
            if (!hasCredentials) skip();
            const connector = new YourMembershipConnector();
            const ctx: FetchContext = {
                CompanyIntegration: liveCi,
                ObjectName: 'Memberships',
                WatermarkValue: null,
                BatchSize: 100,
                ContextUser: contextUser,
            };

            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThan(0);
            expect(result.HasMore).toBe(false);
            expect(result.Records[0].Fields['Name']).toBeDefined();
        });

        it('should fetch Events', async ({ skip }) => {
            if (!hasCredentials) skip();
            const connector = new YourMembershipConnector();
            const ctx: FetchContext = {
                CompanyIntegration: liveCi,
                ObjectName: 'Events',
                WatermarkValue: null,
                BatchSize: 5,
                ContextUser: contextUser,
            };

            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThan(0);
            expect(result.Records[0].Fields['EventId']).toBeDefined();
            expect(result.Records[0].Fields['Name']).toBeDefined();
        });

        it('should fetch Groups (nested/flattened)', async ({ skip }) => {
            if (!hasCredentials) skip();
            const connector = new YourMembershipConnector();
            const ctx: FetchContext = {
                CompanyIntegration: liveCi,
                ObjectName: 'Groups',
                WatermarkValue: null,
                BatchSize: 500,
                ContextUser: contextUser,
            };

            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThan(0);
            expect(result.HasMore).toBe(false);

            const firstGroup = result.Records[0];
            expect(firstGroup.Fields['Name']).toBeDefined();
            expect(firstGroup.Fields['GroupTypeName']).toBeDefined();
        });

        it('should fetch Products (raw array)', async ({ skip }) => {
            if (!hasCredentials) skip();
            const connector = new YourMembershipConnector();
            const ctx: FetchContext = {
                CompanyIntegration: liveCi,
                ObjectName: 'Products',
                WatermarkValue: null,
                BatchSize: 500,
                ContextUser: contextUser,
            };

            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBeGreaterThan(0);
            expect(result.HasMore).toBe(false);
            expect(result.Records[0].Fields['description']).toBeDefined();
        });

        it('should throw on unknown object', async ({ skip }) => {
            if (!hasCredentials) skip();
            const connector = new YourMembershipConnector();
            const ctx: FetchContext = {
                CompanyIntegration: liveCi,
                ObjectName: 'NonExistent',
                WatermarkValue: null,
                BatchSize: 10,
                ContextUser: contextUser,
            };

            await expect(connector.FetchChanges(ctx)).rejects.toThrow('Unknown YourMembership object');
        });
    });
});
