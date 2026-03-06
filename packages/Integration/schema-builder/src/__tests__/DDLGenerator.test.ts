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
            expect(sql).toContain('[ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID()');
            expect(sql).toContain('[SourceRecordID] NVARCHAR(255) NOT NULL');
            expect(sql).toContain('[SourceJSON] NVARCHAR(MAX) NULL');
            expect(sql).toContain('[SyncStatus] NVARCHAR(50) NOT NULL');
            expect(sql).toContain('[LastSyncedAt] DATETIMEOFFSET NULL');
        });

        it('should include standard integration columns for PostgreSQL', () => {
            const config = MakeTableConfig();
            const sql = gen.GenerateCreateTable(config, 'postgresql');
            expect(sql).toContain('"ID" UUID NOT NULL DEFAULT gen_random_uuid()');
            expect(sql).toContain('"SourceRecordID" VARCHAR(255) NOT NULL');
            expect(sql).toContain('"SourceJSON" TEXT NULL');
            expect(sql).toContain('"SyncStatus" VARCHAR(50) NOT NULL');
            expect(sql).toContain('"LastSyncedAt" TIMESTAMPTZ NULL');
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

        it('should include primary key and unique constraints', () => {
            const config = MakeTableConfig();
            const sql = gen.GenerateCreateTable(config, 'sqlserver');
            expect(sql).toContain('CONSTRAINT [PK_hubspot_Contact] PRIMARY KEY ([ID])');
            expect(sql).toContain('CONSTRAINT [UQ_hubspot_Contact_SourceRecordID] UNIQUE ([SourceRecordID])');
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
    });

    describe('GenerateAlterTableAddColumn', () => {
        it('should generate SQL Server ADD column', () => {
            const col = MakeColumn({ TargetColumnName: 'Phone', TargetSqlType: 'NVARCHAR(50)', IsNullable: true });
            const sql = gen.GenerateAlterTableAddColumn('hubspot', 'Contact', col, 'sqlserver');
            expect(sql).toContain('ALTER TABLE [hubspot].[Contact]');
            expect(sql).toContain('ADD [Phone] NVARCHAR(50) NULL');
            expect(sql).not.toContain('ADD COLUMN');
        });

        it('should generate PostgreSQL ADD COLUMN', () => {
            const col = MakeColumn({ TargetColumnName: 'Phone', TargetSqlType: 'VARCHAR(50)', IsNullable: true });
            const sql = gen.GenerateAlterTableAddColumn('hubspot', 'Contact', col, 'postgresql');
            expect(sql).toContain('ALTER TABLE "hubspot"."Contact"');
            expect(sql).toContain('ADD COLUMN "Phone" VARCHAR(50) NULL');
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
