import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sql-formatter (used by SqlLoggingSessionImpl, transitively imported)
vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));

// Mock encryption engine (transitively required)
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return {
                Config: vi.fn(),
                Encrypt: vi.fn(),
                IsEncrypted: vi.fn().mockReturnValue(false),
                GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
            };
        }
    }
}));

import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import {
    AfterKeyNotSupportedError,
    CompositeKey,
    EntityFieldInfo,
    EntityInfo,
    IsKeysetPaginationOrderableType,
    KEYSET_PAGINATION_ORDERABLE_PK_TYPES,
    RunViewParams,
    SaveSQLResult,
    DeleteSQLResult,
} from '@memberjunction/core';

/**
 * Concrete test subclass — only implements the bare minimum needed to call
 * BuildKeysetSeekClause + formatKeysetSeekValue. We aren't running real queries.
 */
class TestProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return TestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return TestProvider._defaultPattern; }

    public QuoteIdentifier(name: string): string { return `[${name}]`; } // SQL Server style for clarity
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    // Test wrappers
    public testBuildKeysetSeekClause(entityInfo: EntityInfo, params: RunViewParams) {
        return this.BuildKeysetSeekClause(entityInfo, params);
    }
    public testFormatKeysetSeekValue(value: unknown, sqlType: string): string {
        return this.formatKeysetSeekValue(value, sqlType);
    }
}

// Helper: build a minimal EntityInfo with one or more PK columns
function makeEntity(name: string, pkColumns: Array<{ name: string; type: string }>): EntityInfo {
    const fields: EntityFieldInfo[] = pkColumns.map((pk, i) => ({
        Name: pk.name,
        Type: pk.type,
        IsPrimaryKey: true,
        Sequence: i,
    } as EntityFieldInfo));
    return {
        Name: name,
        SchemaName: 'test',
        BaseView: `vw${name}`,
        Fields: fields,
        PrimaryKeys: fields,
        FirstPrimaryKey: fields[0],
    } as EntityInfo;
}

describe('Keyset (AfterKey) pagination', () => {
    let provider: TestProvider;

    beforeEach(() => {
        provider = new TestProvider();
    });

    describe('IsKeysetPaginationOrderableType', () => {
        it('accepts uniqueidentifier', () => {
            expect(IsKeysetPaginationOrderableType('uniqueidentifier')).toBe(true);
        });
        it('accepts uuid (PG)', () => {
            expect(IsKeysetPaginationOrderableType('uuid')).toBe(true);
        });
        it('accepts numeric types', () => {
            expect(IsKeysetPaginationOrderableType('int')).toBe(true);
            expect(IsKeysetPaginationOrderableType('bigint')).toBe(true);
            expect(IsKeysetPaginationOrderableType('decimal')).toBe(true);
        });
        it('accepts string types', () => {
            expect(IsKeysetPaginationOrderableType('nvarchar')).toBe(true);
            expect(IsKeysetPaginationOrderableType('varchar')).toBe(true);
        });
        it('strips type parameterization', () => {
            expect(IsKeysetPaginationOrderableType('nvarchar(255)')).toBe(true);
            expect(IsKeysetPaginationOrderableType('decimal(10, 2)')).toBe(true);
        });
        it('is case-insensitive', () => {
            expect(IsKeysetPaginationOrderableType('UNIQUEIDENTIFIER')).toBe(true);
            expect(IsKeysetPaginationOrderableType('Int')).toBe(true);
        });
        it('rejects exotic types', () => {
            expect(IsKeysetPaginationOrderableType('xml')).toBe(false);
            expect(IsKeysetPaginationOrderableType('sql_variant')).toBe(false);
            expect(IsKeysetPaginationOrderableType('varbinary')).toBe(false);
        });
        it('rejects empty / null / undefined', () => {
            expect(IsKeysetPaginationOrderableType('')).toBe(false);
            expect(IsKeysetPaginationOrderableType(null)).toBe(false);
            expect(IsKeysetPaginationOrderableType(undefined)).toBe(false);
        });
        it('exports the allowlist as a readonly array', () => {
            expect(KEYSET_PAGINATION_ORDERABLE_PK_TYPES.length).toBeGreaterThan(10);
            expect(KEYSET_PAGINATION_ORDERABLE_PK_TYPES).toContain('uniqueidentifier');
        });
    });

    describe('BuildKeysetSeekClause — happy paths', () => {
        it('emits `[ID] > value` for a uniqueidentifier PK with ASC ordering (default)', () => {
            const entity = makeEntity('Users', [{ name: 'ID', type: 'uniqueidentifier' }]);
            const afterKey = CompositeKey.FromID('a1b2c3d4-1234-5678-9abc-def012345678');
            const result = provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Users',
                MaxRows: 100,
                AfterKey: afterKey,
            });
            expect(result.seekPredicate).toBe(`[ID] > 'a1b2c3d4-1234-5678-9abc-def012345678'`);
            expect(result.direction).toBe('ASC');
            expect(result.pkColumnName).toBe('[ID]');
        });

        it('emits `[ID] < value` when OrderBy specifies DESC', () => {
            const entity = makeEntity('Users', [{ name: 'ID', type: 'uniqueidentifier' }]);
            const afterKey = CompositeKey.FromID('a1b2c3d4-1234-5678-9abc-def012345678');
            const result = provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Users',
                MaxRows: 100,
                OrderBy: 'ID DESC',
                AfterKey: afterKey,
            });
            expect(result.seekPredicate).toContain('<');
            expect(result.direction).toBe('DESC');
        });

        it('accepts OrderBy with quoting variations', () => {
            const entity = makeEntity('Users', [{ name: 'ID', type: 'uniqueidentifier' }]);
            const afterKey = CompositeKey.FromID('a1b2c3d4-1234-5678-9abc-def012345678');
            // Brackets, quotes, backticks
            for (const ob of ['[ID]', '"ID"', '`ID`', 'ID', 'ID ASC']) {
                const result = provider.testBuildKeysetSeekClause(entity, {
                    EntityName: 'Users',
                    MaxRows: 100,
                    OrderBy: ob,
                    AfterKey: afterKey,
                });
                expect(result.direction).toBe('ASC');
            }
        });

        it('works with int PK', () => {
            const entity = makeEntity('Things', [{ name: 'ThingID', type: 'int' }]);
            const afterKey = CompositeKey.FromKeyValuePair('ThingID', 42);
            const result = provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Things',
                MaxRows: 100,
                AfterKey: afterKey,
            });
            expect(result.seekPredicate).toBe('[ThingID] > 42');
        });

        it('works with string PK and escapes single quotes', () => {
            const entity = makeEntity('Things', [{ name: 'Code', type: 'nvarchar' }]);
            const afterKey = CompositeKey.FromKeyValuePair('Code', "O'Brien");
            const result = provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Things',
                MaxRows: 100,
                AfterKey: afterKey,
            });
            expect(result.seekPredicate).toBe(`[Code] > 'O''Brien'`);
        });
    });

    describe('BuildKeysetSeekClause — validation throws', () => {
        it('throws CompositePK on entities with > 1 PK column', () => {
            const entity = makeEntity('Link', [
                { name: 'TenantID', type: 'uniqueidentifier' },
                { name: 'RecordID', type: 'uniqueidentifier' },
            ]);
            const afterKey = CompositeKey.FromID('any');
            expect(() => provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Link', MaxRows: 100, AfterKey: afterKey,
            })).toThrow(AfterKeyNotSupportedError);

            try {
                provider.testBuildKeysetSeekClause(entity, { EntityName: 'Link', MaxRows: 100, AfterKey: afterKey });
            } catch (e) {
                expect((e as AfterKeyNotSupportedError).Reason).toBe('CompositePK');
            }
        });

        it('throws UnsupportedPKType on exotic PK types', () => {
            const entity = makeEntity('Weird', [{ name: 'ID', type: 'xml' }]);
            const afterKey = CompositeKey.FromID('any');
            expect(() => provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Weird', MaxRows: 100, AfterKey: afterKey,
            })).toThrow(AfterKeyNotSupportedError);
        });

        it('throws StartRowConflict when AfterKey + StartRow > 0', () => {
            const entity = makeEntity('Users', [{ name: 'ID', type: 'uniqueidentifier' }]);
            const afterKey = CompositeKey.FromID('a1b2c3d4-1234-5678-9abc-def012345678');
            expect(() => provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Users',
                MaxRows: 100,
                StartRow: 100,
                AfterKey: afterKey,
            })).toThrow(/AfterKey cannot be combined with StartRow/);
        });

        it('permits AfterKey with StartRow: 0 (first-page semantics)', () => {
            const entity = makeEntity('Users', [{ name: 'ID', type: 'uniqueidentifier' }]);
            const afterKey = CompositeKey.FromID('a1b2c3d4-1234-5678-9abc-def012345678');
            // Should not throw
            const r = provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Users',
                MaxRows: 100,
                StartRow: 0,
                AfterKey: afterKey,
            });
            expect(r.seekPredicate).toBeTruthy();
        });

        it('throws AfterKeyShape on multi-pair CompositeKey', () => {
            const entity = makeEntity('Users', [{ name: 'ID', type: 'uniqueidentifier' }]);
            const afterKey = CompositeKey.FromKeyValuePairs([
                { FieldName: 'ID', Value: 'a1b2c3d4-1234-5678-9abc-def012345678' },
                { FieldName: 'Other', Value: 'extra' },
            ]);
            expect(() => provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Users', MaxRows: 100, AfterKey: afterKey,
            })).toThrow(/exactly one key/);
        });

        it('throws AfterKeyShape when key name does not match PK column', () => {
            const entity = makeEntity('Users', [{ name: 'ID', type: 'uniqueidentifier' }]);
            const afterKey = CompositeKey.FromKeyValuePair('NotID', 'a1b2c3d4-1234-5678-9abc-def012345678');
            expect(() => provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Users', MaxRows: 100, AfterKey: afterKey,
            })).toThrow(/does not match/);
        });

        it('throws AfterKeyShape on null/empty value', () => {
            const entity = makeEntity('Users', [{ name: 'ID', type: 'uniqueidentifier' }]);
            const afterKey = CompositeKey.FromKeyValuePair('ID', '');
            expect(() => provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Users', MaxRows: 100, AfterKey: afterKey,
            })).toThrow(/null\/empty/);
        });

        it('throws IncompatibleOrderBy when OrderBy references non-PK column', () => {
            const entity = makeEntity('Users', [{ name: 'ID', type: 'uniqueidentifier' }]);
            const afterKey = CompositeKey.FromID('a1b2c3d4-1234-5678-9abc-def012345678');
            expect(() => provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Users',
                MaxRows: 100,
                OrderBy: 'Name',
                AfterKey: afterKey,
            })).toThrow(/OrderBy must reference only the PK column/);
        });

        it('throws IncompatibleOrderBy when OrderBy has multiple columns', () => {
            const entity = makeEntity('Users', [{ name: 'ID', type: 'uniqueidentifier' }]);
            const afterKey = CompositeKey.FromID('a1b2c3d4-1234-5678-9abc-def012345678');
            expect(() => provider.testBuildKeysetSeekClause(entity, {
                EntityName: 'Users',
                MaxRows: 100,
                OrderBy: 'ID, Name',
                AfterKey: afterKey,
            })).toThrow(/OrderBy/);
        });
    });

    describe('formatKeysetSeekValue', () => {
        it('formats valid UUID with single quotes', () => {
            expect(provider.testFormatKeysetSeekValue('a1b2c3d4-1234-5678-9abc-def012345678', 'uniqueidentifier'))
                .toBe(`'a1b2c3d4-1234-5678-9abc-def012345678'`);
        });

        it('rejects malformed UUID', () => {
            expect(() => provider.testFormatKeysetSeekValue('not-a-uuid', 'uniqueidentifier'))
                .toThrow(/not a valid UUID/);
        });

        it('formats integers without quotes', () => {
            expect(provider.testFormatKeysetSeekValue(42, 'int')).toBe('42');
            expect(provider.testFormatKeysetSeekValue('42', 'int')).toBe('42');
            expect(provider.testFormatKeysetSeekValue(-7, 'bigint')).toBe('-7');
        });

        it('rejects non-numeric values for numeric types', () => {
            expect(() => provider.testFormatKeysetSeekValue('abc', 'int'))
                .toThrow(/not a valid numeric/);
        });

        it('formats strings with single-quote escaping', () => {
            expect(provider.testFormatKeysetSeekValue("O'Brien", 'nvarchar')).toBe(`'O''Brien'`);
        });

        it('rejects SQL injection patterns in string values', () => {
            expect(() => provider.testFormatKeysetSeekValue("'; DROP TABLE Users--", 'nvarchar'))
                .toThrow(/disallowed characters/);
        });

        it('formats date strings with quoting', () => {
            const r = provider.testFormatKeysetSeekValue('2026-01-01T00:00:00Z', 'datetime');
            expect(r).toBe(`'2026-01-01T00:00:00Z'`);
        });

        it('formats booleans as 0/1', () => {
            expect(provider.testFormatKeysetSeekValue(true, 'bit')).toBe('1');
            expect(provider.testFormatKeysetSeekValue(false, 'bit')).toBe('0');
            expect(provider.testFormatKeysetSeekValue('1', 'bit')).toBe('1');
        });
    });

    describe('AfterKeyNotSupportedError', () => {
        it('stores the entity name and reason', () => {
            const err = new AfterKeyNotSupportedError('Users', 'CompositePK', 'test message');
            expect(err.name).toBe('AfterKeyNotSupportedError');
            expect(err.EntityName).toBe('Users');
            expect(err.Reason).toBe('CompositePK');
            expect(err.message).toBe('test message');
        });
        it('is an instanceof Error', () => {
            const err = new AfterKeyNotSupportedError('Users', 'CompositePK', 'test');
            expect(err).toBeInstanceOf(Error);
        });
    });
});
