import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseProviderBase, SaveSQLResult, DeleteSQLResult, ExecuteSQLOptions } from '../generic/databaseProviderBase';
import { EntityInfo, EntityFieldInfo, UserInfo, CompositeKey } from '@memberjunction/core';

/**
 * Minimal concrete subclass for testing abstract DatabaseProviderBase.
 * Only implements the abstract methods — actual logic stays in the base class.
 */
class TestSQLServerProvider extends DatabaseProviderBase {
    private static readonly _uuidPattern = /^\s*(newid|newsequentialid)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(getdate|getutcdate|sysdatetime|sysdatetimeoffset|sysutcdatetime|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return TestSQLServerProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return TestSQLServerProvider._defaultPattern; }

    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    async ExecuteSQL<T>(): Promise<Array<T>> { return []; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
}

class TestPostgreSQLProvider extends DatabaseProviderBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return TestPostgreSQLProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return TestPostgreSQLProvider._defaultPattern; }

    override get PlatformKey() { return 'postgresql' as const; }
    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    async ExecuteSQL<T>(): Promise<Array<T>> { return []; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
}

describe('DatabaseProviderBase', () => {
    let sqlServer: TestSQLServerProvider;
    let pgProvider: TestPostgreSQLProvider;

    beforeEach(() => {
        sqlServer = new TestSQLServerProvider();
        pgProvider = new TestPostgreSQLProvider();
    });

    describe('UUID Function Pattern (Instance Methods)', () => {
        it('SQL Server: matches NEWID()', () => {
            expect(sqlServer.IsUUIDGenerationFunction('NEWID()')).toBe(true);
            expect(sqlServer.IsUUIDGenerationFunction('newid()')).toBe(true);
            expect(sqlServer.IsUUIDGenerationFunction(' NEWID() ')).toBe(true);
        });

        it('SQL Server: matches NEWSEQUENTIALID()', () => {
            expect(sqlServer.IsUUIDGenerationFunction('NEWSEQUENTIALID()')).toBe(true);
        });

        it('SQL Server: does NOT match PostgreSQL UUID functions', () => {
            expect(sqlServer.IsUUIDGenerationFunction('gen_random_uuid()')).toBe(false);
            expect(sqlServer.IsUUIDGenerationFunction('uuid_generate_v4()')).toBe(false);
        });

        it('PostgreSQL: matches gen_random_uuid()', () => {
            expect(pgProvider.IsUUIDGenerationFunction('gen_random_uuid()')).toBe(true);
            expect(pgProvider.IsUUIDGenerationFunction(' gen_random_uuid() ')).toBe(true);
        });

        it('PostgreSQL: matches uuid_generate_v4()', () => {
            expect(pgProvider.IsUUIDGenerationFunction('uuid_generate_v4()')).toBe(true);
        });

        it('PostgreSQL: does NOT match SQL Server UUID functions', () => {
            expect(pgProvider.IsUUIDGenerationFunction('NEWID()')).toBe(false);
            expect(pgProvider.IsUUIDGenerationFunction('NEWSEQUENTIALID()')).toBe(false);
        });

        it('rejects non-function strings', () => {
            expect(sqlServer.IsUUIDGenerationFunction('hello')).toBe(false);
            expect(pgProvider.IsUUIDGenerationFunction('some-uuid-value')).toBe(false);
            expect(sqlServer.IsUUIDGenerationFunction('')).toBe(false);
        });
    });

    describe('DB Default Function Pattern (Instance Methods)', () => {
        it('SQL Server: matches GETDATE(), GETUTCDATE(), SYSDATETIME()', () => {
            expect(sqlServer.IsNonUUIDDatabaseFunction('GETDATE()')).toBe(true);
            expect(sqlServer.IsNonUUIDDatabaseFunction('getutcdate()')).toBe(true);
            expect(sqlServer.IsNonUUIDDatabaseFunction('SYSDATETIME()')).toBe(true);
            expect(sqlServer.IsNonUUIDDatabaseFunction('SYSDATETIMEOFFSET()')).toBe(true);
            expect(sqlServer.IsNonUUIDDatabaseFunction('SYSUTCDATETIME()')).toBe(true);
            expect(sqlServer.IsNonUUIDDatabaseFunction('CURRENT_TIMESTAMP()')).toBe(true);
        });

        it('SQL Server: does NOT match PostgreSQL-only default functions', () => {
            expect(sqlServer.IsNonUUIDDatabaseFunction('NOW()')).toBe(false);
            expect(sqlServer.IsNonUUIDDatabaseFunction('clock_timestamp()')).toBe(false);
        });

        it('PostgreSQL: matches NOW(), CURRENT_TIMESTAMP(), clock_timestamp()', () => {
            expect(pgProvider.IsNonUUIDDatabaseFunction('NOW()')).toBe(true);
            expect(pgProvider.IsNonUUIDDatabaseFunction('now()')).toBe(true);
            expect(pgProvider.IsNonUUIDDatabaseFunction('CURRENT_TIMESTAMP()')).toBe(true);
            expect(pgProvider.IsNonUUIDDatabaseFunction('clock_timestamp()')).toBe(true);
            expect(pgProvider.IsNonUUIDDatabaseFunction('statement_timestamp()')).toBe(true);
            expect(pgProvider.IsNonUUIDDatabaseFunction('transaction_timestamp()')).toBe(true);
        });

        it('PostgreSQL: does NOT match SQL Server-only default functions', () => {
            expect(pgProvider.IsNonUUIDDatabaseFunction('GETDATE()')).toBe(false);
            expect(pgProvider.IsNonUUIDDatabaseFunction('GETUTCDATE()')).toBe(false);
            expect(pgProvider.IsNonUUIDDatabaseFunction('SYSDATETIME()')).toBe(false);
        });
    });

    describe('Static All-Platform Methods', () => {
        it('IsUUIDGenerationFunctionAllPlatforms matches both SQL Server and PG functions', () => {
            expect(DatabaseProviderBase.IsUUIDGenerationFunctionAllPlatforms('NEWID()')).toBe(true);
            expect(DatabaseProviderBase.IsUUIDGenerationFunctionAllPlatforms('gen_random_uuid()')).toBe(true);
            expect(DatabaseProviderBase.IsUUIDGenerationFunctionAllPlatforms('uuid_generate_v4()')).toBe(true);
            expect(DatabaseProviderBase.IsUUIDGenerationFunctionAllPlatforms('NEWSEQUENTIALID()')).toBe(true);
        });

        it('IsNonUUIDDatabaseFunctionAllPlatforms matches both SQL Server and PG functions', () => {
            expect(DatabaseProviderBase.IsNonUUIDDatabaseFunctionAllPlatforms('GETDATE()')).toBe(true);
            expect(DatabaseProviderBase.IsNonUUIDDatabaseFunctionAllPlatforms('NOW()')).toBe(true);
            expect(DatabaseProviderBase.IsNonUUIDDatabaseFunctionAllPlatforms('CURRENT_TIMESTAMP()')).toBe(true);
        });
    });

    describe('QuoteIdentifier / QuoteSchemaAndView', () => {
        it('SQL Server uses brackets', () => {
            expect(sqlServer.QuoteIdentifier('MyColumn')).toBe('[MyColumn]');
            expect(sqlServer.QuoteSchemaAndView('__mj', 'vwUsers')).toBe('[__mj].[vwUsers]');
        });

        it('PostgreSQL uses double quotes', () => {
            expect(pgProvider.QuoteIdentifier('MyColumn')).toBe('"MyColumn"');
            expect(pgProvider.QuoteSchemaAndView('__mj', 'vwUsers')).toBe('"__mj"."vwUsers"');
        });
    });

    describe('GenerateNewID', () => {
        it('generates a valid UUID v4 string', () => {
            const id = sqlServer.GenerateNewID();
            expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        });

        it('generates unique IDs', () => {
            const id1 = pgProvider.GenerateNewID();
            const id2 = pgProvider.GenerateNewID();
            expect(id1).not.toBe(id2);
        });
    });
});
