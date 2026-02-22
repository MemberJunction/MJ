import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import { CompositeKey } from '@memberjunction/core';

// Mock pg module
vi.mock('pg', () => {
    const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
        release: vi.fn(),
    };

    const mockPool = {
        connect: vi.fn().mockResolvedValue(mockClient),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn().mockResolvedValue(undefined),
    };

    return {
        default: {
            Pool: vi.fn(() => mockPool),
        },
    };
});

describe('PostgreSQLDataProvider', () => {
    let provider: PostgreSQLDataProvider;

    beforeEach(() => {
        provider = new PostgreSQLDataProvider();
    });

    describe('PlatformKey', () => {
        it('should return postgresql', () => {
            expect(provider.PlatformKey).toBe('postgresql');
        });
    });

    describe('Dialect', () => {
        it('should return a PostgreSQLDialect instance', () => {
            const dialect = provider.Dialect;
            expect(dialect.PlatformKey).toBe('postgresql');
        });
    });

    describe('ProviderType', () => {
        it('should return Database type', () => {
            // ProviderType.Database = 'Database'
            expect(provider.ProviderType).toBeDefined();
        });
    });

    describe('ResolveSQL (inherited)', () => {
        it('should return string as-is', () => {
            expect(provider.ResolveSQL("Status = 'Active'")).toBe("Status = 'Active'");
        });

        it('should resolve PlatformSQL for postgresql', () => {
            const platformSQL = {
                default: "Status = 'Active'",
                sqlserver: "[Status] = 1",
                postgresql: '"Status" = true',
            };
            expect(provider.ResolveSQL(platformSQL)).toBe('"Status" = true');
        });

        it('should fall back to default when postgresql variant is missing', () => {
            const platformSQL = {
                default: "Status = 'Active'",
                sqlserver: "[Status] = 1",
            };
            expect(provider.ResolveSQL(platformSQL)).toBe("Status = 'Active'");
        });

        it('should return empty string for null', () => {
            expect(provider.ResolveSQL(null)).toBe('');
        });

        it('should return empty string for undefined', () => {
            expect(provider.ResolveSQL(undefined)).toBe('');
        });
    });

    describe('InstanceConnectionString', () => {
        it('should return empty string when not configured', () => {
            expect(provider.InstanceConnectionString).toBe('');
        });
    });

    describe('ConfigData', () => {
        it('should throw when not configured', () => {
            expect(() => provider.ConfigData).toThrow('not configured');
        });
    });

    describe('CreateTransactionGroup', () => {
        it('should throw not implemented', async () => {
            await expect(provider.CreateTransactionGroup()).rejects.toThrow('not yet implemented');
        });
    });

    describe('GetCurrentUser', () => {
        it('should return null when called without auth context', async () => {
            // Access the protected method via type assertion for testing
            const providerWithAccess = provider as unknown as { GetCurrentUser(): Promise<unknown> };
            const result = await providerWithAccess.GetCurrentUser();
            expect(result).toBeNull();
        });
    });

    describe('stub methods', () => {
        it('GetRecordChanges should return empty array', async () => {
            // Mock ExecuteSQL to return empty results
            vi.spyOn(provider, 'ExecuteSQL').mockResolvedValueOnce([]);
            const ck = new CompositeKey([{ FieldName: 'ID', Value: 'test-id' }]);
            const result = await provider.GetRecordChanges('Entity', ck);
            expect(result).toEqual([]);
        });

        it('GetRecordFavoriteStatus should return false', async () => {
            // Mock ExecuteSQL to return empty results (no favorite found)
            vi.spyOn(provider, 'ExecuteSQL').mockResolvedValueOnce([]);
            const ck = new CompositeKey([{ FieldName: 'ID', Value: 'test-id' }]);
            const result = await provider.GetRecordFavoriteStatus('user1', 'Entity', ck);
            expect(result).toBe(false);
        });

        it('GetRecordDependencies should return empty array', async () => {
            const result = await provider.GetRecordDependencies('Entity', {} as never);
            expect(result).toEqual([]);
        });

        it('GetRecordDuplicates should throw without contextUser', async () => {
            await expect(provider.GetRecordDuplicates({} as never)).rejects.toThrow('User context is required');
        });

        it('MergeRecords should throw for invalid entity', async () => {
            await expect(provider.MergeRecords({ EntityName: 'nonexistent' } as never)).rejects.toThrow('does not allow record merging');
        });

        it('FindISAChildEntity should return null for entity with no children', async () => {
            // Provide an EntityInfo-like object with empty ChildEntities
            const mockEntityInfo = { ChildEntities: [] } as never;
            const result = await provider.FindISAChildEntity(mockEntityInfo, 'pk1');
            expect(result).toBeNull();
        });

        it('RunReport should return Report not found when no report exists', async () => {
            // Mock ExecuteSQL to return empty results (no report found)
            vi.spyOn(provider, 'ExecuteSQL').mockResolvedValueOnce([]);
            const result = await provider.RunReport({ ReportID: '00000000-0000-0000-0000-000000000000' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe('Report not found');
        });
    });
});
