import { describe, it, expect } from 'vitest';
import { DDLGenerator, ValidateIdentifier } from '../DDLGenerator.js';
import type { TargetTableConfig, TargetColumnConfig, ColumnModification } from '../interfaces.js';

function MakeColumn(overrides: Partial<TargetColumnConfig> = {}): TargetColumnConfig {
    return {
        SourceFieldName: 'email',
        TargetColumnName: 'Email',
        TargetSqlType: 'NVARCHAR(255)',
        IsNullable: true,
        MaxLength: 255,
        Precision: null,
        Scale: null,
        DefaultValue: null,
        ...overrides,
    };
}

function MakeTableConfig(overrides: Partial<TargetTableConfig> = {}): TargetTableConfig {
    return {
        SourceObjectName: 'contacts',
        SchemaName: 'hubspot',
        TableName: 'Contact',
        EntityName: 'HubSpot Contact',
        PrimaryKeyFields: ['ContactID'],
        Columns: [MakeColumn()],
        SoftForeignKeys: [],
        ...overrides,
    };
}

describe('DDLGenerator', () => {
    const gen = new DDLGenerator();

    describe('GenerateCreateSchema', () => {
        it('should generate SQL Server schema creation', () => {
            const sql = gen.GenerateCreateSchema('hubspot', 'sqlserver');
            expect(sql).toContain('sys.schemas');
            expect(sql).toContain('[hubspot]');
            expect(sql).toContain('GO');
        });

        it('should generate PostgreSQL schema creation', () => {
            const sql = gen.GenerateCreateSchema('hubspot', 'postgresql');
            expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS');
            expect(sql).toContain('"hubspot"');
        });

        it('should reject invalid schema names', () => {
            expect(() => gen.GenerateCreateSchema('bad schema!', 'sqlserver')).toThrow('Invalid schema name');
        });
    });

    describe('GenerateCreateTable', () => {
        it('should include standard integration columns for SQL Server', () => {
            const config = MakeTableConfig();
            const sql = gen.GenerateCreateTable(config, 'sqlserver');
            expect(sql).toContain('[__mj_integration_SyncStatus] NVARCHAR(50) NOT NULL');
            expect(sql).toContain('[__mj_integration_LastSyncedAt] DATETIMEOFFSET NULL');
            // Should NOT contain old column names
            expect(sql).not.toContain('[ID] UNIQUEIDENTIFIER');
            expect(sql).not.toContain('[SourceRecordID]');
            expect(sql).not.toContain('[SourceJSON]');
        });

        it('should include standard integration columns for PostgreSQL', () => {
            const config = MakeTableConfig();
            const sql = gen.GenerateCreateTable(config, 'postgresql');
            expect(sql).toContain('"__mj_integration_SyncStatus" VARCHAR(50) NOT NULL');
            expect(sql).toContain('"__mj_integration_LastSyncedAt" TIMESTAMPTZ NULL');
            // Should NOT contain old column names
            expect(sql).not.toContain('"ID" UUID');
            expect(sql).not.toContain('"SourceRecordID"');
            expect(sql).not.toContain('"SourceJSON"');
        });

        it('should include user-defined columns', () => {
            const config = MakeTableConfig({
                Columns: [
                    MakeColumn({ TargetColumnName: 'Email', TargetSqlType: 'NVARCHAR(255)', IsNullable: true }),
                    MakeColumn({ TargetColumnName: 'FirstName', TargetSqlType: 'NVARCHAR(100)', IsNullable: false }),
                ],
            });
            const sql = gen.GenerateCreateTable(config, 'sqlserver');
            expect(sql).toContain('[Email] NVARCHAR(255) NULL');
            expect(sql).toContain('[FirstName] NVARCHAR(100) NOT NULL');
        });

        it('should cap NVARCHAR(MAX) PK columns to NVARCHAR(450) for SQL Server indexability', () => {
            const config = MakeTableConfig({
                PrimaryKeyFields: ['ProfileID'],
                Columns: [MakeColumn({ TargetColumnName: 'ProfileID', TargetSqlType: 'NVARCHAR(MAX)', IsNullable: false })],
            });
            const sql = gen.GenerateCreateTable(config, 'sqlserver');
            expect(sql).toContain('[ProfileID] NVARCHAR(450) NOT NULL');
            expect(sql).not.toContain('[ProfileID] NVARCHAR(MAX)');
        });

        it('should not cap non-PK NVARCHAR(MAX) columns', () => {
            const config = MakeTableConfig({
                PrimaryKeyFields: ['ID'],
                Columns: [
                    MakeColumn({ TargetColumnName: 'ID', TargetSqlType: 'NVARCHAR(255)', IsNullable: false }),
                    MakeColumn({ TargetColumnName: 'Notes', TargetSqlType: 'NVARCHAR(MAX)', IsNullable: true }),
                ],
            });
            const sql = gen.GenerateCreateTable(config, 'sqlserver');
            expect(sql).toContain('[Notes] NVARCHAR(MAX) NULL');
        });

        it('should include UNIQUE constraint on PK fields', () => {
            const config = MakeTableConfig();
            const sql = gen.GenerateCreateTable(config, 'sqlserver');
            expect(sql).toContain('CONSTRAINT [UQ_hubspot_Contact_PK] UNIQUE ([ContactID])');
            // Should NOT contain old PK constraint
            expect(sql).not.toContain('PRIMARY KEY ([ID])');
        });

        it('should include default values when specified', () => {
            const config = MakeTableConfig({
                Columns: [MakeColumn({ TargetColumnName: 'Status', TargetSqlType: 'NVARCHAR(50)', DefaultValue: "'Active'" })],
            });
            const sql = gen.GenerateCreateTable(config, 'sqlserver');
            expect(sql).toContain("DEFAULT 'Active'");
        });

        it('should reject invalid table names', () => {
            const config = MakeTableConfig({ TableName: 'bad table!' });
            expect(() => gen.GenerateCreateTable(config, 'sqlserver')).toThrow('Invalid table name');
        });

        it('should be idempotent on SQL Server via an IF OBJECT_ID guard before CREATE TABLE', () => {
            const config = MakeTableConfig();
            const sql = gen.GenerateCreateTable(config, 'sqlserver');
            expect(sql).toContain("IF OBJECT_ID(N'[hubspot].[Contact]', N'U') IS NULL");
            // The guard must precede CREATE TABLE so it governs it (single-statement IF).
            expect(sql.indexOf("IF OBJECT_ID")).toBeGreaterThanOrEqual(0);
            expect(sql.indexOf("IF OBJECT_ID")).toBeLessThan(sql.indexOf('CREATE TABLE'));
        });

        it('should be idempotent on PostgreSQL via native CREATE TABLE IF NOT EXISTS (NOT the SQL Server guard)', () => {
            const config = MakeTableConfig();
            const sql = gen.GenerateCreateTable(config, 'postgresql');
            expect(sql).toContain('CREATE TABLE IF NOT EXISTS "hubspot"."Contact"');
            // Postgres must never receive the SQL Server OBJECT_ID guard — explicit per-platform handling.
            expect(sql).not.toContain('OBJECT_ID');
        });

        it('should guard extended properties so a re-run does not re-add descriptions (SQL Server)', () => {
            const config = MakeTableConfig({ Description: 'Contacts from HubSpot' });
            const sql = gen.GenerateCreateTable(config, 'sqlserver');
            // Table-level guard uses NULL, NULL for the level-2 (column) args.
            expect(sql).toContain("sys.fn_listextendedproperty(N'MS_Description', N'SCHEMA', N'hubspot', N'TABLE', N'Contact', NULL, NULL)");
            // Standard column description is guarded at the column level.
            expect(sql).toContain("sys.fn_listextendedproperty(N'MS_Description', N'SCHEMA', N'hubspot', N'TABLE', N'Contact', N'COLUMN', N'__mj_integration_SyncStatus')");
            expect(sql).toContain('IF NOT EXISTS (SELECT 1 FROM sys.fn_listextendedproperty');
        });
    });

    describe('GenerateAlterTableAddColumn', () => {
        it('should generate SQL Server ADD column guarded by IF NOT EXISTS (idempotent re-apply)', () => {
            const col = MakeColumn({ TargetColumnName: 'Phone', TargetSqlType: 'NVARCHAR(50)', IsNullable: true });
            const sql = gen.GenerateAlterTableAddColumn('hubspot', 'Contact', col, 'sqlserver');
            expect(sql).toContain('ALTER TABLE [hubspot].[Contact]');
            expect(sql).toContain('ADD [Phone] NVARCHAR(50) NULL');
            expect(sql).not.toContain('ADD COLUMN');
            // Idempotency guard: re-applying after a partial run must not throw "column already exists" (SQL Server 2705).
            expect(sql).toContain('IF NOT EXISTS (SELECT 1 FROM sys.columns');
            expect(sql).toContain("OBJECT_ID(N'[hubspot].[Contact]')");
            expect(sql).toContain("name = N'Phone'");
        });

        it('should generate PostgreSQL ADD COLUMN with native IF NOT EXISTS (idempotent re-apply)', () => {
            const col = MakeColumn({ TargetColumnName: 'Phone', TargetSqlType: 'VARCHAR(50)', IsNullable: true });
            const sql = gen.GenerateAlterTableAddColumn('hubspot', 'Contact', col, 'postgresql');
            expect(sql).toContain('ALTER TABLE "hubspot"."Contact"');
            expect(sql).toContain('ADD COLUMN IF NOT EXISTS "Phone" VARCHAR(50) NULL');
        });
    });

    describe('GenerateAlterTableAlterColumn', () => {
        it('should generate SQL Server ALTER COLUMN', () => {
            const mod: ColumnModification = {
                ColumnName: 'Email',
                OldType: 'NVARCHAR(100)',
                NewType: 'NVARCHAR(255)',
                OldNullable: true,
                NewNullable: true,
            };
            const sql = gen.GenerateAlterTableAlterColumn('hubspot', 'Contact', mod, 'sqlserver');
            expect(sql).toContain('ALTER COLUMN [Email] NVARCHAR(255) NULL');
        });

        it('should generate PostgreSQL ALTER COLUMN with TYPE and nullability', () => {
            const mod: ColumnModification = {
                ColumnName: 'Email',
                OldType: 'VARCHAR(100)',
                NewType: 'VARCHAR(255)',
                OldNullable: true,
                NewNullable: false,
            };
            const sql = gen.GenerateAlterTableAlterColumn('hubspot', 'Contact', mod, 'postgresql');
            expect(sql).toContain('ALTER COLUMN "Email" TYPE VARCHAR(255)');
            expect(sql).toContain('ALTER COLUMN "Email" SET NOT NULL');
        });

        it('Bug 5a: PostgreSQL ALTER COLUMN drops dependent views first (named-tag DO block)', () => {
            const mod: ColumnModification = {
                ColumnName: 'Email', OldType: 'TEXT', NewType: 'BOOLEAN', OldNullable: true, NewNullable: true,
            };
            const sql = gen.GenerateAlterTableAlterColumn('hubspot', 'Contact', mod, 'postgresql');
            // A DO block that discovers + drops views depending on this table precedes the ALTER, so
            // PG won't reject the type change with "cannot alter type of a column used by a view".
            expect(sql).toContain('DO $mj_dropviews$');
            expect(sql).toContain('$mj_dropviews$;');
            expect(sql).toContain("WHERE sn.nspname = 'hubspot' AND st.relname = 'Contact'");
            expect(sql).toContain('DROP VIEW IF EXISTS %I.%I CASCADE');
            // The DO block comes BEFORE the ALTER.
            expect(sql.indexOf('DO $mj_dropviews$')).toBeLessThan(sql.indexOf('ALTER COLUMN "Email" TYPE BOOLEAN'));
        });

        it('SQL Server ALTER COLUMN does NOT emit the PG view-drop block', () => {
            const mod: ColumnModification = {
                ColumnName: 'Email', OldType: 'NVARCHAR(100)', NewType: 'NVARCHAR(255)', OldNullable: true, NewNullable: true,
            };
            const sql = gen.GenerateAlterTableAlterColumn('hubspot', 'Contact', mod, 'sqlserver');
            expect(sql).not.toContain('mj_dropviews');
        });

        it('should generate PostgreSQL DROP NOT NULL when making nullable', () => {
            const mod: ColumnModification = {
                ColumnName: 'Email',
                OldType: 'VARCHAR(100)',
                NewType: 'VARCHAR(255)',
                OldNullable: false,
                NewNullable: true,
            };
            const sql = gen.GenerateAlterTableAlterColumn('hubspot', 'Contact', mod, 'postgresql');
            expect(sql).toContain('DROP NOT NULL');
        });
    });

    describe('ValidateIdentifier', () => {
        it('should accept valid identifiers', () => {
            expect(() => ValidateIdentifier('MyTable', 'table')).not.toThrow();
            expect(() => ValidateIdentifier('_private', 'column')).not.toThrow();
            expect(() => ValidateIdentifier('schema123', 'schema')).not.toThrow();
        });

        it('should reject identifiers starting with numbers', () => {
            expect(() => ValidateIdentifier('123table', 'table')).toThrow();
        });

        it('should reject identifiers with spaces or special chars', () => {
            expect(() => ValidateIdentifier('my table', 'table')).toThrow();
            expect(() => ValidateIdentifier('drop;--', 'table')).toThrow();
            expect(() => ValidateIdentifier("Robert'); DROP TABLE--", 'table')).toThrow();
        });
    });
});
