import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YourMembershipConnector } from '../YourMembershipConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext, RESTResponse } from '@memberjunction/integration-engine';

// ─── Test helpers ────────────────────────────────────────────────

function createMockCompanyIntegration(config: Record<string, string>): MJCompanyIntegrationEntity {
    const configJson = JSON.stringify(config);
    return {
        Get: (field: string) => field === 'Configuration' ? configJson : null,
        IntegrationID: 'test-integration-id',
    } as unknown as MJCompanyIntegrationEntity;
}

const VALID_CONFIG = {
    ClientID: '25363',
    APIKey: 'test-api-key',
    APIPassword: 'test-api-password',
};

const MOCK_CI = createMockCompanyIntegration(VALID_CONFIG);
const contextUser = {} as UserInfo;

/**
 * Helper to create a testable connector with mocked HTTP/auth internals.
 * Since the refactored connector delegates to BaseRESTIntegrationConnector
 * for most operations, we mock at the HTTP layer.
 */
function createMockedConnector(
    makeRequestFn: (...args: unknown[]) => Promise<RESTResponse>
): YourMembershipConnector {
    const connector = new YourMembershipConnector();

    // Mock Authenticate to bypass real API auth
    (connector as unknown as Record<string, unknown>)['Authenticate'] = vi.fn().mockResolvedValue({
        SessionID: 'fake-session',
        Config: { ClientID: '25363', APIKey: 'key', APIPassword: 'pass' },
    });

    // Mock ParseConfig for TestConnection
    (connector as unknown as Record<string, unknown>)['ParseConfig'] = vi.fn().mockResolvedValue({
        ClientID: '25363',
        APIKey: 'key',
        APIPassword: 'pass',
    });

    // Mock GetSession for session cache operations
    (connector as unknown as Record<string, unknown>)['GetSession'] = vi.fn().mockResolvedValue('fake-session');

    // Mock MakeHTTPRequest — this is the core HTTP transport
    (connector as unknown as Record<string, unknown>)['MakeHTTPRequest'] = makeRequestFn;

    return connector;
}

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
        it('should return YourMembership schema name', () => {
            const connector = new YourMembershipConnector();
            const config = connector.GetDefaultConfiguration();
            expect(config.DefaultSchemaName).toBe('YourMembership');
        });
    });

    describe('NormalizeResponse', () => {
        it('should extract data from response using responseDataKey', () => {
            const connector = new YourMembershipConnector();
            const normalize = (connector as unknown as Record<string, (...args: unknown[]) => unknown>)['NormalizeResponse'].bind(connector);

            const body = { Members: [{ id: 1 }, { id: 2 }], ResponseStatus: { ErrorCode: 'None' } };
            const result = normalize(body, 'Members');
            expect(result).toEqual([{ id: 1 }, { id: 2 }]);
        });

        it('should handle raw array response (null responseDataKey)', () => {
            const connector = new YourMembershipConnector();
            const normalize = (connector as unknown as Record<string, (...args: unknown[]) => unknown>)['NormalizeResponse'].bind(connector);

            const body = [{ id: 1 }, { id: 2 }];
            const result = normalize(body, null);
            expect(result).toEqual([{ id: 1 }, { id: 2 }]);
        });

        it('should wrap single object response in array and filter metadata', () => {
            const connector = new YourMembershipConnector();
            const normalize = (connector as unknown as Record<string, (...args: unknown[]) => unknown>)['NormalizeResponse'].bind(connector);

            const body = { EngagementScore: 85, ResponseStatus: { ErrorCode: 'None' }, UsingRedis: true, ServerID: 'WS-1' };
            const result = normalize(body, null) as Record<string, unknown>[];
            expect(result.length).toBe(1);
            expect(result[0]['EngagementScore']).toBe(85);
            expect(result[0]['UsingRedis']).toBeUndefined();
            expect(result[0]['ServerID']).toBeUndefined();
            expect(result[0]['ResponseStatus']).toBeUndefined();
        });

        it('should throw on API error response', () => {
            const connector = new YourMembershipConnector();
            const normalize = (connector as unknown as Record<string, (...args: unknown[]) => unknown>)['NormalizeResponse'].bind(connector);

            const body = { ResponseStatus: { ErrorCode: 'InvalidSession', Message: 'Session expired' } };
            expect(() => normalize(body, 'Data')).toThrow('Session expired');
        });
    });

    describe('ExtractPaginationInfo', () => {
        it('should detect more pages when records fill page', () => {
            const connector = new YourMembershipConnector();
            const extract = (connector as unknown as Record<string, (...args: unknown[]) => unknown>)['ExtractPaginationInfo'].bind(connector);

            const body = { Items: [1, 2, 3, 4, 5] };
            const result = extract(body, 'PageNumber', 1, 0, 5) as { HasMore: boolean; NextPage: number };
            expect(result.HasMore).toBe(true);
            expect(result.NextPage).toBe(2);
        });

        it('should detect last page when records fewer than page size', () => {
            const connector = new YourMembershipConnector();
            const extract = (connector as unknown as Record<string, (...args: unknown[]) => unknown>)['ExtractPaginationInfo'].bind(connector);

            const body = { Items: [1, 2] };
            const result = extract(body, 'PageNumber', 3, 0, 5) as { HasMore: boolean };
            expect(result.HasMore).toBe(false);
        });

        it('should return HasMore=false for None pagination', () => {
            const connector = new YourMembershipConnector();
            const extract = (connector as unknown as Record<string, (...args: unknown[]) => unknown>)['ExtractPaginationInfo'].bind(connector);

            const result = extract({}, 'None', 1, 0, 100) as { HasMore: boolean };
            expect(result.HasMore).toBe(false);
        });

        it('should handle Offset pagination', () => {
            const connector = new YourMembershipConnector();
            const extract = (connector as unknown as Record<string, (...args: unknown[]) => unknown>)['ExtractPaginationInfo'].bind(connector);

            const body = { Records: new Array(100) };
            const result = extract(body, 'Offset', 1, 200, 100) as { HasMore: boolean; NextOffset: number };
            expect(result.HasMore).toBe(true);
            expect(result.NextOffset).toBe(300);
        });
    });
});

// ─── Groups fetching tests ──────────────────────────────────────

describe('YourMembershipConnector (Groups)', () => {
    it('should flatten nested Groups response', async () => {
        const makeRequest = vi.fn().mockResolvedValue({
            Status: 200,
            Body: {
                GroupTypeList: [
                    {
                        Id: 1, TypeName: 'Committee', SortIndex: 0,
                        Groups: [
                            { Id: 10, Name: 'Finance Committee' },
                            { Id: 11, Name: 'Tech Committee' },
                        ],
                    },
                    {
                        Id: 2, TypeName: 'Chapter', SortIndex: 1,
                        Groups: [{ Id: 20, Name: 'NYC Chapter' }],
                    },
                ],
                ResponseStatus: { ErrorCode: 'None' },
            },
            Headers: {},
        });

        const connector = createMockedConnector(makeRequest);
        const ctx: FetchContext = {
            CompanyIntegration: MOCK_CI,
            ObjectName: 'Groups',
            WatermarkValue: null,
            BatchSize: 500,
            ContextUser: contextUser,
        };

        const result = await connector.FetchChanges(ctx);
        expect(result.Records.length).toBe(3);
        expect(result.HasMore).toBe(false);

        const first = result.Records[0];
        expect(first.Fields['Name']).toBe('Finance Committee');
        expect(first.Fields['GroupTypeName']).toBe('Committee');
        expect(first.Fields['GroupTypeId']).toBe(1);
    });

    it('should return GroupTypes only when requested', async () => {
        const makeRequest = vi.fn().mockResolvedValue({
            Status: 200,
            Body: {
                GroupTypeList: [
                    { Id: 1, TypeName: 'Committee', SortIndex: 0, Groups: [{ Id: 10, Name: 'G1' }] },
                    { Id: 2, TypeName: 'Chapter', SortIndex: 1, Groups: [] },
                ],
                ResponseStatus: { ErrorCode: 'None' },
            },
            Headers: {},
        });

        const connector = createMockedConnector(makeRequest);
        const ctx: FetchContext = {
            CompanyIntegration: MOCK_CI,
            ObjectName: 'GroupTypes',
            WatermarkValue: null,
            BatchSize: 500,
            ContextUser: contextUser,
        };

        const result = await connector.FetchChanges(ctx);
        expect(result.Records.length).toBe(2);
        expect(result.Records[0].Fields['TypeName']).toBe('Committee');
        expect(result.Records[1].Fields['TypeName']).toBe('Chapter');
    });
});

// ─── Detail enrichment tests ────────────────────────────────────

describe('YourMembershipConnector (enrichment)', () => {
    it('should enrich Members records with detail data', async () => {
        let callCount = 0;
        const makeRequest = vi.fn().mockImplementation(
            (_auth: unknown, url: string): Promise<RESTResponse> => {
                callCount++;
                if ((url as string).includes('Members/123')) {
                    // Detail endpoint for ProfileID 123
                    return Promise.resolve({
                        Status: 200,
                        Body: {
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
                        },
                        Headers: {},
                    });
                }
                // Any other request (shouldn't happen in this test path)
                return Promise.resolve({ Status: 200, Body: {}, Headers: {} });
            }
        );

        const connector = createMockedConnector(makeRequest);

        // Mock super.FetchChanges to return a basic Members result
        // We do this by mocking the parent class's FetchChanges via prototype
        const originalFetchChanges = Object.getPrototypeOf(Object.getPrototypeOf(connector)).FetchChanges;
        const superFetchMock = vi.fn().mockResolvedValue({
            Records: [{
                ExternalID: '123',
                ObjectType: 'Members',
                Fields: { ProfileID: 123, FirstName: 'Jane', LastName: 'Doe' },
            }],
            HasMore: false,
        });
        // Temporarily replace the grandparent's FetchChanges
        Object.getPrototypeOf(Object.getPrototypeOf(connector)).FetchChanges = superFetchMock;

        try {
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
            // Enriched fields from detail endpoint
            expect(record.Fields['EmailAddr']).toBe('jane@example.com');
            expect(record.Fields['Phone']).toBe('555-1234');
            expect(record.Fields['City']).toBe('Portland');
            expect(record.Fields['State']).toBe('Oregon');
            expect(record.Fields['PostalCode']).toBe('97201');
            expect(record.Fields['Organization']).toBe('Acme Corp');
            expect(record.Fields['Address1']).toBe('123 Main St');
            // Metadata keys should be filtered out by NormalizeMemberDetail
            expect(record.Fields['UsingRedis']).toBeUndefined();
            expect(record.Fields['ServerID']).toBeUndefined();
        } finally {
            // Restore original prototype method
            Object.getPrototypeOf(Object.getPrototypeOf(connector)).FetchChanges = originalFetchChanges;
        }
    });

    it('should gracefully handle detail endpoint failures', async () => {
        const makeRequest = vi.fn().mockImplementation(
            (_auth: unknown, url: string): Promise<RESTResponse> => {
                if ((url as string).includes('Members/456')) {
                    return Promise.reject(new Error('API timeout'));
                }
                return Promise.resolve({ Status: 200, Body: {}, Headers: {} });
            }
        );

        const connector = createMockedConnector(makeRequest);

        const superFetchMock = vi.fn().mockResolvedValue({
            Records: [{
                ExternalID: '456',
                ObjectType: 'Members',
                Fields: { ProfileID: 456, FirstName: 'Bob', LastName: 'Smith' },
            }],
            HasMore: false,
        });
        const originalFetchChanges = Object.getPrototypeOf(Object.getPrototypeOf(connector)).FetchChanges;
        Object.getPrototypeOf(Object.getPrototypeOf(connector)).FetchChanges = superFetchMock;

        try {
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
        } finally {
            Object.getPrototypeOf(Object.getPrototypeOf(connector)).FetchChanges = originalFetchChanges;
        }
    });
});

// ─── GetBaseURL tests ───────────────────────────────────────────

describe('YourMembershipConnector (GetBaseURL)', () => {
    it('should build base URL from configuration ClientID', () => {
        const connector = new YourMembershipConnector();
        const getBaseURL = (connector as unknown as Record<string, (...args: unknown[]) => string>)['GetBaseURL'].bind(connector);

        const ci = createMockCompanyIntegration({ ClientID: '12345', APIKey: 'k', APIPassword: 'p' });
        expect(getBaseURL(ci)).toBe('https://ws.yourmembership.com/Ams/12345');
    });

    it('should throw when no ClientID in configuration', () => {
        const connector = new YourMembershipConnector();
        const getBaseURL = (connector as unknown as Record<string, (...args: unknown[]) => string>)['GetBaseURL'].bind(connector);

        const ci = { Get: () => null } as unknown as MJCompanyIntegrationEntity;
        expect(() => getBaseURL(ci)).toThrow('Cannot determine YM base URL');
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
});
