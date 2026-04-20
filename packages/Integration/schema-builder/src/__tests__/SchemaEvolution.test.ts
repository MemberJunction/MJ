import { describe, it, expect } from 'vitest';
import { SchemaEvolution } from '../SchemaEvolution.js';
import type { SourceObjectInfo, TargetTableConfig, TargetColumnConfig, ExistingTableInfo } from '../interfaces.js';

function MakeSourceObject(fields: Array<{ Name: string; SourceType: string }> = []): SourceObjectInfo {
    return {
        ExternalName: 'contacts',
        ExternalLabel: 'Contacts',
        Fields: fields.map(f => ({
            Name: f.Name,
            Label: f.Name,
            SourceType: f.SourceType,
            IsRequired: false,
            MaxLength: null,
            Precision: null,
            Scale: null,
            DefaultValue: null,
            IsPrimaryKey: false,
            IsForeignKey: false,
            ForeignKeyTarget: null,
        })),
        PrimaryKeyFields: [],
        Relationships: [],
    };
}

function MakeTargetConfig(columns: TargetColumnConfig[]): TargetTableConfig {
    return {
        SourceObjectName: 'contacts',
        SchemaName: 'hubspot',
        TableName: 'Contact',
        EntityName: 'HubSpot Contact',
        Columns: columns,
        SoftForeignKeys: [],
    };
}

function MakeExistingTable(columns: Array<{ Name: string; SqlType: string; IsNullable: boolean }>): ExistingTableInfo {
    return {
        SchemaName: 'hubspot',
        TableName: 'Contact',
        Columns: columns.map(c => ({ ...c, MaxLength: null, Precision: null, Scale: null })),
    };
}

describe('SchemaEvolution', () => {
    const evo = new SchemaEvolution();

    describe('DiffSchema', () => {
        it('should detect added columns', () => {
            const target = MakeTargetConfig([
                { SourceFieldName: 'email', TargetColumnName: 'Email', TargetSqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null },
                { SourceFieldName: 'phone', TargetColumnName: 'Phone', TargetSqlType: 'NVARCHAR(50)', IsNullable: true, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null },
            ]);
            const existing = MakeExistingTable([
                { Name: 'Email', SqlType: 'NVARCHAR(255)', IsNullable: true },
            ]);

            const diff = evo.DiffSchema(MakeSourceObject(), target, existing, 'sqlserver');
            expect(diff.AddedColumns).toHaveLength(1);
            expect(diff.AddedColumns[0].TargetColumnName).toBe('Phone');
            expect(diff.ModifiedColumns).toHaveLength(0);
        });

        it('should detect modified columns (type change)', () => {
            const target = MakeTargetConfig([
                { SourceFieldName: 'email', TargetColumnName: 'Email', TargetSqlType: 'NVARCHAR(500)', IsNullable: true, MaxLength: 500, Precision: null, Scale: null, DefaultValue: null },
            ]);
            const existing = MakeExistingTable([
                { Name: 'Email', SqlType: 'NVARCHAR(255)', IsNullable: true },
            ]);

            const diff = evo.DiffSchema(MakeSourceObject(), target, existing, 'sqlserver');
            expect(diff.ModifiedColumns).toHaveLength(1);
            expect(diff.ModifiedColumns[0].OldType).toBe('NVARCHAR(255)');
            expect(diff.ModifiedColumns[0].NewType).toBe('NVARCHAR(500)');
        });

        it('should detect modified columns (nullability change)', () => {
            const target = MakeTargetConfig([
                { SourceFieldName: 'email', TargetColumnName: 'Email', TargetSqlType: 'NVARCHAR(255)', IsNullable: false, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null },
            ]);
            const existing = MakeExistingTable([
                { Name: 'Email', SqlType: 'NVARCHAR(255)', IsNullable: true },
            ]);

            const diff = evo.DiffSchema(MakeSourceObject(), target, existing, 'sqlserver');
            expect(diff.ModifiedColumns).toHaveLength(1);
            expect(diff.ModifiedColumns[0].OldNullable).toBe(true);
            expect(diff.ModifiedColumns[0].NewNullable).toBe(false);
        });

        it('should detect removed columns', () => {
            const target = MakeTargetConfig([
                { SourceFieldName: 'email', TargetColumnName: 'Email', TargetSqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null },
            ]);
            const existing = MakeExistingTable([
                { Name: 'Email', SqlType: 'NVARCHAR(255)', IsNullable: true },
                { Name: 'Phone', SqlType: 'NVARCHAR(50)', IsNullable: true },
            ]);

            const diff = evo.DiffSchema(MakeSourceObject(), target, existing, 'sqlserver');
            expect(diff.RemovedColumns).toHaveLength(1);
            expect(diff.RemovedColumns[0]).toBe('Phone');
        });

        it('should ignore standard integration columns', () => {
            const target = MakeTargetConfig([]);
            const existing = MakeExistingTable([
                { Name: 'ID', SqlType: 'UNIQUEIDENTIFIER', IsNullable: false },
                { Name: 'SourceRecordID', SqlType: 'NVARCHAR(255)', IsNullable: false },
                { Name: '__mj_CreatedAt', SqlType: 'DATETIMEOFFSET', IsNullable: false },
            ]);

            const diff = evo.DiffSchema(MakeSourceObject(), target, existing, 'sqlserver');
            expect(diff.RemovedColumns).toHaveLength(0);
            expect(diff.AddedColumns).toHaveLength(0);
        });

        it('should be case-insensitive on column name matching', () => {
            const target = MakeTargetConfig([
                { SourceFieldName: 'email', TargetColumnName: 'Email', TargetSqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null },
            ]);
            const existing = MakeExistingTable([
                { Name: 'email', SqlType: 'NVARCHAR(255)', IsNullable: true },
            ]);

            const diff = evo.DiffSchema(MakeSourceObject(), target, existing, 'sqlserver');
            expect(diff.AddedColumns).toHaveLength(0);
        });
    });

    describe('GenerateEvolutionMigration', () => {
        it('should produce ALTER TABLE ADD for new columns', () => {
            const diff = {
                AddedColumns: [
                    { SourceFieldName: 'phone', TargetColumnName: 'Phone', TargetSqlType: 'NVARCHAR(50)', IsNullable: true, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null },
                ],
                ModifiedColumns: [],
                RemovedColumns: [],
            };
            const sql = evo.GenerateEvolutionMigration(diff, 'hubspot', 'Contact', 'sqlserver');
            expect(sql).toContain('ALTER TABLE [hubspot].[Contact]');
            expect(sql).toContain('ADD [Phone]');
        });

        it('should produce ALTER TABLE ALTER for modified columns', () => {
            const diff = {
                AddedColumns: [],
                ModifiedColumns: [{
                    ColumnName: 'Email',
                    OldType: 'NVARCHAR(100)',
                    NewType: 'NVARCHAR(255)',
                    OldNullable: true,
                    NewNullable: true,
                }],
                RemovedColumns: [],
            };
            const sql = evo.GenerateEvolutionMigration(diff, 'hubspot', 'Contact', 'sqlserver');
            expect(sql).toContain('ALTER COLUMN [Email] NVARCHAR(255)');
        });

        it('should produce DEPRECATED comment for removed columns', () => {
            const diff = {
                AddedColumns: [],
                ModifiedColumns: [],
                RemovedColumns: ['OldField'],
            };
            const sql = evo.GenerateEvolutionMigration(diff, 'hubspot', 'Contact', 'sqlserver');
            expect(sql).toContain('DEPRECATED');
            expect(sql).toContain('OldField');
        });
    });

    describe('GenerateEvolutionSoftFKUpdates', () => {
        it('should return soft FKs for newly added FK columns', () => {
            const diff = {
                AddedColumns: [
                    { SourceFieldName: 'owner_id', TargetColumnName: 'OwnerID', TargetSqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null },
                ],
                ModifiedColumns: [],
                RemovedColumns: [],
            };
            const config = MakeTargetConfig([]);
            config.SoftForeignKeys = [{
                SchemaName: 'hubspot', TableName: 'Contact', FieldName: 'OwnerID',
                TargetSchemaName: '__mj', TargetTableName: 'User', TargetFieldName: 'ID',
            }];

            const fks = evo.GenerateEvolutionSoftFKUpdates(diff, config);
            expect(fks).toHaveLength(1);
            expect(fks[0].FieldName).toBe('OwnerID');
        });
    });
});
