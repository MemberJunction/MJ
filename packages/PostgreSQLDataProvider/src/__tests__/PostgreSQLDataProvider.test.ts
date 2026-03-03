import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import { CompositeKey, EntityInfo } from '@memberjunction/core';

/**
 * Helper: build a minimal EntityInfo-like object with the given field names.
 * quoteIdentifiersInSQL only accesses `entityInfo.Fields[].Name`.
 */
function mockEntityInfo(fieldNames: string[]): EntityInfo {
    return {
        Fields: fieldNames.map(name => ({ Name: name })),
    } as unknown as EntityInfo;
}

/** Type alias for accessing private quoting methods in tests */
type ProviderWithQuoting = {
    quoteIdentifiersInSQL(sql: string, entityInfo: EntityInfo): string;
    quoteFieldNamesInToken(token: string, fieldNames: Set<string>): string;
};

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
        it('should return a PostgreSQLTransactionGroup instance', async () => {
            const group = await provider.CreateTransactionGroup();
            expect(group).toBeDefined();
            expect(group.Status).toBe('Pending');
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

    describe('quoteIdentifiersInSQL', () => {
        let quoter: ProviderWithQuoting;

        beforeEach(() => {
            // Access private methods via type assertion
            quoter = provider as unknown as ProviderWithQuoting;
        });

        it('should quote bare field names with double quotes', () => {
            const ei = mockEntityInfo(['Entity', 'RecordID', 'ChangedAt']);
            const result = quoter.quoteIdentifiersInSQL(
                "Entity = 'Users' AND RecordID = 'abc'",
                ei,
            );
            expect(result).toBe(`"Entity" = 'Users' AND "RecordID" = 'abc'`);
        });

        it('should NOT corrupt field names inside single-quoted string values (bug fix)', () => {
            // This was the Record Changes bug: RecordID='ID|uuid' had 'ID' inside
            // the value corrupted to '"ID"' by the field-name regex.
            const ei = mockEntityInfo(['ID', 'Entity', 'RecordID']);
            const result = quoter.quoteIdentifiersInSQL(
                "Entity='MJ: Action Categories' AND RecordID='ID|0750dceb-123a-485d-9052-c72fc7bfa5f8'",
                ei,
            );
            // The value portion must stay untouched
            expect(result).toContain("'ID|0750dceb-123a-485d-9052-c72fc7bfa5f8'");
            // The RecordID field name should be quoted
            expect(result).toContain('"RecordID"=');
            // ID inside the value must NOT be double-quoted
            expect(result).not.toContain(`'"ID"|`);
        });

        it('should handle value containing a field name with no space around =', () => {
            const ei = mockEntityInfo(['Status', 'Name']);
            const result = quoter.quoteIdentifiersInSQL(
                "Status='Name is valid'",
                ei,
            );
            // Status (the field) should be quoted; 'Name is valid' string untouched
            expect(result).toContain('"Status"=');
            expect(result).toContain("'Name is valid'");
        });

        it('should leave already-quoted identifiers untouched', () => {
            const ei = mockEntityInfo(['Entity', 'RecordID']);
            const result = quoter.quoteIdentifiersInSQL(
                `"Entity" = 'Users'`,
                ei,
            );
            // Should not double-quote: "Entity" stays as-is
            expect(result).toBe(`"Entity" = 'Users'`);
        });

        it('should convert SQL Server bracket notation to PG double-quote notation', () => {
            const ei = mockEntityInfo(['ColumnName']);
            const result = quoter.quoteIdentifiersInSQL(
                "[ColumnName] = 'value'",
                ei,
            );
            expect(result).toContain('"ColumnName"');
            // No brackets should remain
            expect(result).not.toContain('[');
            expect(result).not.toContain(']');
        });

        it('should handle OrderBy-style expressions', () => {
            const ei = mockEntityInfo(['ChangedAt', 'Entity']);
            const result = quoter.quoteIdentifiersInSQL(
                'ChangedAt DESC',
                ei,
            );
            expect(result).toBe('"ChangedAt" DESC');
        });

        it('should be case-insensitive when matching field names', () => {
            const ei = mockEntityInfo(['UserID']);
            const result = quoter.quoteIdentifiersInSQL(
                "userid = 'abc'",
                ei,
            );
            // Should produce "UserID" (the canonical casing from the field definition)
            expect(result).toContain('"UserID"');
        });

        it('should return original string when no fields match', () => {
            const ei = mockEntityInfo(['Foo', 'Bar']);
            const result = quoter.quoteIdentifiersInSQL(
                "NoMatch = 'test'",
                ei,
            );
            expect(result).toBe("NoMatch = 'test'");
        });

        it('should return original string for empty input', () => {
            const ei = mockEntityInfo(['ID']);
            expect(quoter.quoteIdentifiersInSQL('', ei)).toBe('');
        });

        it('should handle multiple conditions joined by AND/OR', () => {
            const ei = mockEntityInfo(['Entity', 'Status', 'RecordID']);
            const result = quoter.quoteIdentifiersInSQL(
                "Entity = 'Users' AND Status = 'Active' OR RecordID = '123'",
                ei,
            );
            expect(result).toContain('"Entity"');
            expect(result).toContain('"Status"');
            expect(result).toContain('"RecordID"');
            // Values must be preserved
            expect(result).toContain("'Users'");
            expect(result).toContain("'Active'");
            expect(result).toContain("'123'");
        });

        it('should handle IS NULL and IS NOT NULL', () => {
            const ei = mockEntityInfo(['DeletedAt']);
            const result = quoter.quoteIdentifiersInSQL(
                'DeletedAt IS NULL',
                ei,
            );
            expect(result).toBe('"DeletedAt" IS NULL');
        });

        it('should handle IN clause with parenthesized values', () => {
            const ei = mockEntityInfo(['Status']);
            const result = quoter.quoteIdentifiersInSQL(
                "Status IN ('Active','Inactive')",
                ei,
            );
            expect(result).toContain('"Status"');
            expect(result).toContain("'Active'");
            expect(result).toContain("'Inactive'");
        });

        it('should handle composite key value with pipe separator', () => {
            // Real-world case: Record Changes uses composite key format "ID|uuid"
            const ei = mockEntityInfo(['ID', 'RecordID', 'Entity']);
            const result = quoter.quoteIdentifiersInSQL(
                "RecordID='ID|550e8400-e29b-41d4-a716-446655440000'",
                ei,
            );
            expect(result).toBe(`"RecordID"='ID|550e8400-e29b-41d4-a716-446655440000'`);
        });
    });

    describe('quoteFieldNamesInToken', () => {
        let quoter: ProviderWithQuoting;

        beforeEach(() => {
            quoter = provider as unknown as ProviderWithQuoting;
        });

        it('should replace a bare field name with double-quoted version', () => {
            const fields = new Set(['Entity']);
            expect(quoter.quoteFieldNamesInToken('Entity', fields)).toBe('"Entity"');
        });

        it('should handle field name at start of compound token', () => {
            const fields = new Set(['Status']);
            expect(quoter.quoteFieldNamesInToken('Status=', fields)).toBe('"Status"=');
        });

        it('should replace multiple field names in one token', () => {
            // Unlikely in practice but tests the loop behavior
            const fields = new Set(['A', 'B']);
            expect(quoter.quoteFieldNamesInToken('A+B', fields)).toBe('"A"+"B"');
        });

        it('should not replace partial matches', () => {
            const fields = new Set(['ID']);
            // "VALID" contains "ID" but not at a word boundary
            expect(quoter.quoteFieldNamesInToken('VALID', fields)).toBe('VALID');
        });
    });
});
