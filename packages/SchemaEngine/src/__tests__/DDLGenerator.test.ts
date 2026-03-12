import { describe, it, expect } from 'vitest';
import { DDLGenerator, ValidateIdentifier, EscapeSqlString } from '../DDLGenerator.js';
import type { TableDefinition } from '../interfaces.js';

const makeTable = (overrides: Partial<TableDefinition> = {}): TableDefinition => ({
    SchemaName: 'custom',
    TableName: 'TestTable',
    EntityName: 'Test Table',
    Columns: [
        { Name: 'ExternalId', Type: 'string', IsNullable: false, MaxLength: 100, Description: 'External ID' },
        { Name: 'Name', Type: 'string', IsNullable: false },
        { Name: 'CreatedAt', Type: 'datetime', IsNullable: true },
    ],
    ...overrides,
});

describe('DDLGenerator', () => {
    const gen = new DDLGenerator();

    // ─── GenerateCreateSchema ─────────────────────────────────────────

    describe('GenerateCreateSchema', () => {
        it('emits SQL Server EXEC-based CREATE SCHEMA', () => {
            const sql = gen.GenerateCreateSchema('hubspot', 'sqlserver');
            expect(sql).toContain("IF NOT EXISTS");
            expect(sql).toContain("CREATE SCHEMA [hubspot]");
        });

        it('emits PostgreSQL CREATE SCHEMA IF NOT EXISTS', () => {
            const sql = gen.GenerateCreateSchema('hubspot', 'postgresql');
            expect(sql).toBe('CREATE SCHEMA IF NOT EXISTS "hubspot";');
        });

        it('rejects invalid schema names', () => {
            expect(() => gen.GenerateCreateSchema('has space', 'sqlserver')).toThrow();
            expect(() => gen.GenerateCreateSchema('123invalid', 'sqlserver')).toThrow();
        });
    });

    // ─── GenerateCreateTable ─────────────────────────────────────────

    describe('GenerateCreateTable', () => {
        it('generates CREATE TABLE with all user columns (SQL Server)', () => {
            const table = makeTable();
            const sql = gen.GenerateCreateTable(table, 'sqlserver');
            expect(sql).toContain('CREATE TABLE [custom].[TestTable]');
            expect(sql).toContain('[ExternalId]');
            expect(sql).toContain('[Name]');
            expect(sql).toContain('[CreatedAt]');
        });

        it('generates CREATE TABLE with PostgreSQL quoting', () => {
            const sql = gen.GenerateCreateTable(makeTable(), 'postgresql');
            expect(sql).toContain('CREATE TABLE "custom"."TestTable"');
            expect(sql).toContain('"ExternalId"');
        });

        it('appends AdditionalColumns after user columns', () => {
            const table = makeTable({
                AdditionalColumns: [
                    { Name: '__mj_integration_SyncStatus', Type: 'string', IsNullable: false, MaxLength: 50, DefaultValue: "'Active'" },
                    { Name: '__mj_integration_LastSyncedAt', Type: 'datetime', IsNullable: true },
                ],
            });
            const sql = gen.GenerateCreateTable(table, 'sqlserver');
            expect(sql).toContain('[__mj_integration_SyncStatus]');
            expect(sql).toContain('[__mj_integration_LastSyncedAt]');
        });

        it('generates UNIQUE constraint for SoftPrimaryKeys', () => {
            const table = makeTable({ SoftPrimaryKeys: ['ExternalId'] });
            const sql = gen.GenerateCreateTable(table, 'sqlserver');
            expect(sql).toContain('UNIQUE');
            expect(sql).toContain('[ExternalId]');
        });

        it('generates hard FK constraint for IsSoft=false foreign keys', () => {
            const table = makeTable({
                ForeignKeys: [{
                    ColumnName: 'OwnerId',
                    ReferencedSchema: 'dbo',
                    ReferencedTable: 'Users',
                    ReferencedColumn: 'ID',
                    IsSoft: false,
                }],
                Columns: [
                    ...makeTable().Columns,
                    { Name: 'OwnerId', Type: 'uuid', IsNullable: true },
                ],
            });
            const sql = gen.GenerateCreateTable(table, 'sqlserver');
            expect(sql).toContain('FOREIGN KEY');
            expect(sql).toContain('[OwnerId]');
        });

        it('does NOT generate FK constraint for soft foreign keys', () => {
            const table = makeTable({
                ForeignKeys: [{
                    ColumnName: 'OwnerId',
                    ReferencedSchema: 'dbo',
                    ReferencedTable: 'Users',
                    ReferencedColumn: 'ID',
                    IsSoft: true,
                }],
            });
            const sql = gen.GenerateCreateTable(table, 'sqlserver');
            expect(sql).not.toContain('FOREIGN KEY');
        });

        it('emits extended properties for table + column descriptions (SQL Server)', () => {
            const table = makeTable({ Description: 'A test table' });
            const sql = gen.GenerateCreateTable(table, 'sqlserver');
            expect(sql).toContain('sp_addextendedproperty');
            expect(sql).toContain('A test table');
            expect(sql).toContain('External ID');
        });

        it('does NOT emit extended properties for PostgreSQL', () => {
            const sql = gen.GenerateCreateTable(makeTable({ Description: 'desc' }), 'postgresql');
            expect(sql).not.toContain('sp_addextendedproperty');
        });

        it('emits DEFAULT clause when column has DefaultValue', () => {
            const table = makeTable({
                Columns: [{ Name: 'Status', Type: 'string', IsNullable: false, MaxLength: 50, DefaultValue: "'Active'" }],
            });
            const sql = gen.GenerateCreateTable(table, 'sqlserver');
            expect(sql).toContain("DEFAULT 'Active'");
        });

        it('respects NOT NULL / NULL correctly', () => {
            const sql = gen.GenerateCreateTable(makeTable(), 'sqlserver');
            expect(sql).toContain('[ExternalId] NVARCHAR(100) NOT NULL');
            expect(sql).toContain('[CreatedAt] DATETIMEOFFSET NULL');
        });

        it('handles RawSqlType override on a column', () => {
            const table = makeTable({
                Columns: [{ Name: 'Payload', Type: 'string', RawSqlType: 'NVARCHAR(MAX)', IsNullable: true }],
            });
            const sql = gen.GenerateCreateTable(table, 'sqlserver');
            expect(sql).toContain('[Payload] NVARCHAR(MAX)');
        });
    });

    // ─── AlterTable ────────────────────────────────────────────────────

    describe('GenerateAlterTableAddColumn', () => {
        it('emits ADD for SQL Server', () => {
            const sql = gen.GenerateAlterTableAddColumn(
                'custom', 'TestTable',
                { Name: 'Score', Type: 'integer', IsNullable: true },
                'sqlserver'
            );
            expect(sql).toBe('ALTER TABLE [custom].[TestTable]\n    ADD [Score] INT NULL;');
        });

        it('emits ADD COLUMN for PostgreSQL', () => {
            const sql = gen.GenerateAlterTableAddColumn(
                'custom', 'TestTable',
                { Name: 'Score', Type: 'integer', IsNullable: true },
                'postgresql'
            );
            expect(sql).toBe('ALTER TABLE "custom"."TestTable"\n    ADD COLUMN "Score" INTEGER NULL;');
        });
    });

    describe('GenerateAlterTableAlterColumn', () => {
        it('emits ALTER COLUMN for SQL Server', () => {
            const sql = gen.GenerateAlterTableAlterColumn('custom', 'TestTable', {
                ColumnName: 'Name',
                OldType: 'NVARCHAR(100)',
                NewType: 'NVARCHAR(200)',
                OldNullable: false,
                NewNullable: true,
            }, 'sqlserver');
            expect(sql).toContain('ALTER COLUMN [Name] NVARCHAR(200) NULL');
        });

        it('emits TYPE + SET NOT NULL for PostgreSQL', () => {
            const sql = gen.GenerateAlterTableAlterColumn('custom', 'TestTable', {
                ColumnName: 'Name',
                OldType: 'VARCHAR(100)',
                NewType: 'VARCHAR(200)',
                OldNullable: true,
                NewNullable: false,
            }, 'postgresql');
            expect(sql).toContain('TYPE VARCHAR(200)');
            expect(sql).toContain('SET NOT NULL');
        });
    });

    // ─── Identifier validation ──────────────────────────────────────────

    describe('ValidateIdentifier', () => {
        it('accepts valid identifiers', () => {
            expect(() => ValidateIdentifier('mySchema', 'schema')).not.toThrow();
            expect(() => ValidateIdentifier('My_Table_123', 'table')).not.toThrow();
        });

        it('rejects names with spaces', () => {
            expect(() => ValidateIdentifier('my schema', 'schema')).toThrow();
        });

        it('rejects names starting with a digit', () => {
            expect(() => ValidateIdentifier('123table', 'table')).toThrow();
        });

        it('rejects SQL injection attempts', () => {
            expect(() => ValidateIdentifier("'; DROP TABLE", 'table')).toThrow();
        });
    });

    // ─── EscapeSqlString ─────────────────────────────────────────────

    describe('EscapeSqlString', () => {
        it('doubles single quotes', () => {
            expect(EscapeSqlString("it's a test")).toBe("it''s a test");
        });

        it('leaves strings without quotes unchanged', () => {
            expect(EscapeSqlString('hello world')).toBe('hello world');
        });
    });
});
