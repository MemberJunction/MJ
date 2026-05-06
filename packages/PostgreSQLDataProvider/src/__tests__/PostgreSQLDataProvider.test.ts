import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import { CompositeKey, EntityInfo, EntityFieldTSType } from '@memberjunction/core';

/**
 * Helper: build a minimal EntityInfo-like object with the given field names.
 * quoteIdentifiersInSQL only accesses `entityInfo.Fields[].Name`.
 */
function mockEntityInfo(fieldNames: string[]): EntityInfo {
    return {
        Fields: fieldNames.map(name => ({ Name: name })),
    } as unknown as EntityInfo;
}

/**
 * Helper: build a minimal EntityInfo with mixed-type fields. Each entry is
 * `{name, tsType}` so callers can mark a field as Boolean for the bool-coercion
 * tests without having to construct a full EntityFieldInfo.
 */
function mockEntityInfoTyped(fields: Array<{ name: string; tsType: EntityFieldTSType }>): EntityInfo {
    return {
        Fields: fields.map(f => ({ Name: f.name, TSType: f.tsType })),
    } as unknown as EntityInfo;
}

/** Type alias for accessing private quoting methods in tests */
type ProviderWithQuoting = {
    quoteIdentifiersInSQL(sql: string, entityInfo: EntityInfo): string;
    quoteFieldNamesInToken(token: string, fieldNames: Set<string>): string;
    coerceBooleanLiteralsInSQL(sql: string, entityInfo: EntityInfo): string;
    TransformExternalSQLClause(clause: string, entityInfo: EntityInfo): string;
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

    describe('Transaction nesting (savepoint-based)', () => {
        // Test wiring: replace the connection manager's AcquireClient so we can
        // capture the queries the provider issues. This is the lightest-weight
        // way to validate nesting semantics without spinning up real PG.
        type CapturedClient = {
            queries: string[];
            query: (sql: string) => Promise<{ rows: unknown[] }>;
            release: () => void;
            released: boolean;
        };

        function installFakeClient(p: PostgreSQLDataProvider): CapturedClient {
            const client: CapturedClient = {
                queries: [],
                released: false,
                query: vi.fn(async (sql: string) => {
                    client.queries.push(sql);
                    return { rows: [] };
                }) as unknown as (sql: string) => Promise<{ rows: unknown[] }>,
                release: vi.fn(() => { client.released = true; }) as unknown as () => void,
            };
            // Replace the private connection manager's AcquireClient with a stub.
            const cm = (p as unknown as { _connectionManager: { AcquireClient: () => Promise<unknown> } })._connectionManager;
            cm.AcquireClient = vi.fn(async () => client) as unknown as typeof cm.AcquireClient;
            return client;
        }

        it('depth==1: BeginTransaction issues BEGIN on the acquired client', async () => {
            const client = installFakeClient(provider);
            await provider.BeginTransaction();
            expect(client.queries).toEqual(['BEGIN']);
            expect(provider.IsInTransaction).toBe(true);
            expect(provider.TransactionDepth).toBe(1);
        });

        it('depth>1: nested Begin issues SAVEPOINT instead of new BEGIN', async () => {
            const client = installFakeClient(provider);
            await provider.BeginTransaction();
            await provider.BeginTransaction();
            await provider.BeginTransaction();
            expect(client.queries).toEqual(['BEGIN', 'SAVEPOINT mj_sp_1', 'SAVEPOINT mj_sp_2']);
            expect(provider.TransactionDepth).toBe(3);
        });

        it('Commit at depth>1 issues RELEASE SAVEPOINT, depth-1 issues COMMIT and releases client', async () => {
            const client = installFakeClient(provider);
            await provider.BeginTransaction();    // depth 1
            await provider.BeginTransaction();    // depth 2
            await provider.CommitTransaction();   // releases sp, depth 1
            expect(provider.TransactionDepth).toBe(1);
            expect(client.queries.at(-1)).toBe('RELEASE SAVEPOINT mj_sp_1');
            expect(client.released).toBe(false); // still in outer

            await provider.CommitTransaction();   // commits outer
            expect(client.queries.at(-1)).toBe('COMMIT');
            expect(client.released).toBe(true);
            expect(provider.TransactionDepth).toBe(0);
            expect(provider.IsInTransaction).toBe(false);
        });

        it('Rollback at depth>1 rolls back to + releases savepoint without affecting outer', async () => {
            const client = installFakeClient(provider);
            await provider.BeginTransaction();
            await provider.BeginTransaction();
            await provider.RollbackTransaction();
            expect(provider.TransactionDepth).toBe(1);
            // Last two queries should be the rollback-to + release of the savepoint
            expect(client.queries.slice(-2)).toEqual(['ROLLBACK TO SAVEPOINT mj_sp_1', 'RELEASE SAVEPOINT mj_sp_1']);
            expect(client.released).toBe(false); // outer transaction still active

            await provider.CommitTransaction();   // outer commits successfully
            expect(client.released).toBe(true);
        });

        it('Rollback at depth==1 issues ROLLBACK and releases client', async () => {
            const client = installFakeClient(provider);
            await provider.BeginTransaction();
            await provider.RollbackTransaction();
            expect(client.queries.at(-1)).toBe('ROLLBACK');
            expect(client.released).toBe(true);
            expect(provider.TransactionDepth).toBe(0);
        });

        it('Commit/Rollback without active transaction throws', async () => {
            await expect(provider.CommitTransaction()).rejects.toThrow('No active transaction');
            await expect(provider.RollbackTransaction()).rejects.toThrow('No active transaction');
        });

        it('Savepoint counter is fresh after the outer transaction commits', async () => {
            const client = installFakeClient(provider);
            await provider.BeginTransaction();
            await provider.BeginTransaction();      // mj_sp_1
            await provider.CommitTransaction();     // RELEASE mj_sp_1
            await provider.CommitTransaction();     // outer COMMIT, resets counter
            // Re-installing a client because the previous one was released
            const client2 = installFakeClient(provider);
            await provider.BeginTransaction();
            await provider.BeginTransaction();      // should be mj_sp_1 again, not mj_sp_2
            expect(client2.queries.at(-1)).toBe('SAVEPOINT mj_sp_1');
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

    /**
     * Bool literals in user-provided SQL filters (`IsActive = 1`,
     * `IsAutoGenerated = 0`) are widespread across MJ — engines, agents,
     * dashboards all use SQL Server's bit-as-integer convention. PG rejects
     * those with `operator does not exist: boolean = integer`. The provider's
     * filter rewriter coerces them to `TRUE`/`FALSE` for boolean fields.
     */
    describe('coerceBooleanLiteralsInSQL (bit literal → bool coercion)', () => {
        let provider: PostgreSQLDataProvider;
        let coercer: ProviderWithQuoting;

        beforeEach(() => {
            provider = new PostgreSQLDataProvider();
            coercer = provider as unknown as ProviderWithQuoting;
        });

        it('rewrites = 1 to = TRUE for boolean fields', () => {
            const ei = mockEntityInfoTyped([{ name: 'IsActive', tsType: EntityFieldTSType.Boolean }]);
            expect(coercer.coerceBooleanLiteralsInSQL('"IsActive" = 1', ei))
                .toBe('"IsActive" = TRUE');
        });

        it('rewrites = 0 to = FALSE for boolean fields', () => {
            const ei = mockEntityInfoTyped([{ name: 'IsActive', tsType: EntityFieldTSType.Boolean }]);
            expect(coercer.coerceBooleanLiteralsInSQL('"IsActive" = 0', ei))
                .toBe('"IsActive" = FALSE');
        });

        it('rewrites != 1 / <> 1 to != TRUE / <> TRUE for boolean fields', () => {
            const ei = mockEntityInfoTyped([{ name: 'IsActive', tsType: EntityFieldTSType.Boolean }]);
            expect(coercer.coerceBooleanLiteralsInSQL('"IsActive" != 1', ei))
                .toBe('"IsActive" != TRUE');
            expect(coercer.coerceBooleanLiteralsInSQL('"IsActive" <> 0', ei))
                .toBe('"IsActive" <> FALSE');
        });

        it('handles quoted bit literals (\'1\' / \'0\')', () => {
            const ei = mockEntityInfoTyped([{ name: 'IsActive', tsType: EntityFieldTSType.Boolean }]);
            expect(coercer.coerceBooleanLiteralsInSQL("\"IsActive\" = '1'", ei))
                .toBe('"IsActive" = TRUE');
        });

        it('does NOT rewrite non-boolean fields', () => {
            // Status is a String field; the literal `1` is meaningful (could
            // be a code/value comparison) and must not be coerced.
            const ei = mockEntityInfoTyped([{ name: 'Status', tsType: EntityFieldTSType.String }]);
            expect(coercer.coerceBooleanLiteralsInSQL('"Status" = 1', ei))
                .toBe('"Status" = 1');
        });

        it('leaves TRUE / FALSE the caller already wrote alone', () => {
            const ei = mockEntityInfoTyped([{ name: 'IsActive', tsType: EntityFieldTSType.Boolean }]);
            expect(coercer.coerceBooleanLiteralsInSQL('"IsActive" = TRUE', ei))
                .toBe('"IsActive" = TRUE');
        });

        it('rewrites multiple boolean fields in compound predicates', () => {
            const ei = mockEntityInfoTyped([
                { name: 'IsAutoGenerated', tsType: EntityFieldTSType.Boolean },
                { name: 'Status', tsType: EntityFieldTSType.String },
            ]);
            const input = `"IsAutoGenerated" = 1 AND "Status" = 'Active'`;
            expect(coercer.coerceBooleanLiteralsInSQL(input, ei))
                .toBe(`"IsAutoGenerated" = TRUE AND "Status" = 'Active'`);
        });

        it('does NOT rewrite a 0/1 in a numeric column comparison even if a bool col with similar name exists', () => {
            // No name collision to test here — coercer only touches columns
            // that match a Boolean field's exact name. Non-bool stays literal.
            const ei = mockEntityInfoTyped([
                { name: 'Priority', tsType: EntityFieldTSType.Number },
            ]);
            expect(coercer.coerceBooleanLiteralsInSQL('"Priority" = 1', ei))
                .toBe('"Priority" = 1');
        });

        it('TransformExternalSQLClause runs identifier-quote AND bool-coerce together', () => {
            // End-to-end: bare identifier IsActive should get quoted AND its
            // bit literal coerced in one pass. (quoteIdentifiersInSQL inserts
            // spaces around tokens — we just check both transforms applied.)
            const ei = mockEntityInfoTyped([{ name: 'IsActive', tsType: EntityFieldTSType.Boolean }]);
            const transformer = provider as unknown as ProviderWithQuoting;
            const out = transformer.TransformExternalSQLClause('IsActive=1', ei);
            expect(out).toContain('"IsActive"');
            expect(out).toContain('TRUE');
            expect(out).not.toMatch(/=\s*1\b/); // no bare bit literal remains
        });
    });

    describe('ValidateDeleteResult', () => {
        // The override must accept both result shapes that PG sprocs use:
        //   - Legacy `{ "_result_id": <uuid> }` from baseline migration sprocs
        //   - Current `{ "<PKName>": <uuid> }` from latest codegen template
        // and reject anything that doesn't match the expected primary key.

        type Validator = {
            ValidateDeleteResult(
                entity: { PrimaryKeys: { Name: string; Value: unknown }[] },
                rawResult: Record<string, unknown>[],
                entityResult: { Message?: string },
            ): boolean;
        };

        function buildEntity(pks: { Name: string; Value: unknown }[]) {
            return { PrimaryKeys: pks } as unknown as Parameters<Validator['ValidateDeleteResult']>[0];
        }

        let validator: Validator;
        beforeEach(() => {
            validator = provider as unknown as Validator;
        });

        it('returns true when single-PK result matches via PK-named column (current codegen shape)', () => {
            const entity = buildEntity([{ Name: 'ID', Value: 'abc' }]);
            const result = { Message: '' };
            expect(validator.ValidateDeleteResult(entity, [{ ID: 'abc' }], result)).toBe(true);
        });

        it('returns true when single-PK result matches via legacy _result_id column', () => {
            const entity = buildEntity([{ Name: 'ID', Value: 'abc' }]);
            const result = { Message: '' };
            expect(validator.ValidateDeleteResult(entity, [{ _result_id: 'abc' }], result)).toBe(true);
        });

        it('returns false and sets message when single-PK result has wrong value', () => {
            const entity = buildEntity([{ Name: 'ID', Value: 'expected' }]);
            const result: { Message?: string } = {};
            expect(validator.ValidateDeleteResult(entity, [{ _result_id: 'wrong' }], result)).toBe(false);
            expect(result.Message).toContain('ID=expected');
        });

        it('returns false when sproc reports zero rows (NULL result)', () => {
            const entity = buildEntity([{ Name: 'ID', Value: 'abc' }]);
            const result: { Message?: string } = {};
            expect(validator.ValidateDeleteResult(entity, [{ _result_id: null }], result)).toBe(false);
            expect(result.Message).toContain('ID=abc');
        });

        it('returns false on empty result', () => {
            const entity = buildEntity([{ Name: 'ID', Value: 'abc' }]);
            expect(validator.ValidateDeleteResult(entity, [], { Message: '' })).toBe(false);
        });

        it('compound PK requires every key matched by name (legacy _result_id is single-PK only)', () => {
            const entity = buildEntity([
                { Name: 'TagAID', Value: 'a1' },
                { Name: 'TagBID', Value: 'b1' },
            ]);
            const result: { Message?: string } = {};
            expect(validator.ValidateDeleteResult(entity, [{ TagAID: 'a1', TagBID: 'b1' }], result)).toBe(true);
            expect(validator.ValidateDeleteResult(entity, [{ _result_id: 'a1' }], { Message: '' })).toBe(false);
            expect(validator.ValidateDeleteResult(entity, [{ TagAID: 'a1', TagBID: 'wrong' }], result)).toBe(false);
        });
    });
});
