import { describe, it, expect } from 'vitest';
import { SchemaBuilder } from '../SchemaBuilder.js';
import type { SchemaBuilderInput, SourceSchemaInfo, TargetTableConfig } from '../interfaces.js';

function MakeSourceSchema(): SourceSchemaInfo {
    return {
        Objects: [
            {
                ExternalName: 'contacts',
                ExternalLabel: 'Contacts',
                Fields: [
                    { Name: 'id', Label: 'ID', SourceType: 'string', IsRequired: true, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null, IsPrimaryKey: true, IsForeignKey: false, ForeignKeyTarget: null },
                    { Name: 'email', Label: 'Email', SourceType: 'string', IsRequired: false, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null, IsPrimaryKey: false, IsForeignKey: false, ForeignKeyTarget: null },
                    { Name: 'first_name', Label: 'First Name', SourceType: 'string', IsRequired: false, MaxLength: 100, Precision: null, Scale: null, DefaultValue: null, IsPrimaryKey: false, IsForeignKey: false, ForeignKeyTarget: null },
                ],
                PrimaryKeyFields: ['id'],
                Relationships: [],
            },
            {
                ExternalName: 'deals',
                ExternalLabel: 'Deals',
                Fields: [
                    { Name: 'id', Label: 'ID', SourceType: 'string', IsRequired: true, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null, IsPrimaryKey: true, IsForeignKey: false, ForeignKeyTarget: null },
                    { Name: 'amount', Label: 'Amount', SourceType: 'decimal', IsRequired: false, MaxLength: null, Precision: 18, Scale: 2, DefaultValue: null, IsPrimaryKey: false, IsForeignKey: false, ForeignKeyTarget: null },
                    { Name: 'contact_id', Label: 'Contact ID', SourceType: 'string', IsRequired: false, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null, IsPrimaryKey: false, IsForeignKey: true, ForeignKeyTarget: 'contacts' },
                ],
                PrimaryKeyFields: ['id'],
                Relationships: [{ FieldName: 'contact_id', TargetObject: 'contacts', TargetField: 'id' }],
            },
        ],
    };
}

function MakeTargetConfigs(): TargetTableConfig[] {
    return [
        {
            SourceObjectName: 'contacts',
            SchemaName: 'hubspot',
            TableName: 'Contact',
            EntityName: 'HubSpot Contact',
            PrimaryKeyFields: ['ContactID'],
            Columns: [
                { SourceFieldName: 'id', TargetColumnName: 'ContactID', TargetSqlType: 'NVARCHAR(50)', IsNullable: false, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null },
                { SourceFieldName: 'email', TargetColumnName: 'Email', TargetSqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null },
                { SourceFieldName: 'first_name', TargetColumnName: 'FirstName', TargetSqlType: 'NVARCHAR(100)', IsNullable: true, MaxLength: 100, Precision: null, Scale: null, DefaultValue: null },
            ],
            SoftForeignKeys: [],
        },
        {
            SourceObjectName: 'deals',
            SchemaName: 'hubspot',
            TableName: 'Deal',
            EntityName: 'HubSpot Deal',
            PrimaryKeyFields: ['DealID'],
            Columns: [
                { SourceFieldName: 'id', TargetColumnName: 'DealID', TargetSqlType: 'NVARCHAR(50)', IsNullable: false, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null },
                { SourceFieldName: 'amount', TargetColumnName: 'Amount', TargetSqlType: 'DECIMAL(18,2)', IsNullable: true, MaxLength: null, Precision: 18, Scale: 2, DefaultValue: null },
                { SourceFieldName: 'contact_id', TargetColumnName: 'ContactID', TargetSqlType: 'NVARCHAR(50)', IsNullable: true, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null },
            ],
            SoftForeignKeys: [],
        },
    ];
}

function MakeInput(overrides: Partial<SchemaBuilderInput> = {}): SchemaBuilderInput {
    return {
        SourceSchema: MakeSourceSchema(),
        TargetConfigs: MakeTargetConfigs(),
        Platform: 'sqlserver',
        MJVersion: '5.6.0',
        SourceType: 'HubSpot',
        AdditionalSchemaInfoPath: 'config/additionalSchemaInfo.json',
        MigrationsDir: 'migrations/v2',
        MetadataDir: 'metadata',
        ExistingTables: [],
        EntitySettingsForTargets: {},
        ...overrides,
    };
}

describe('SchemaBuilder (integration)', () => {
    const builder = new SchemaBuilder();

    describe('new table creation', () => {
        it('should produce a single consolidated migration file for new tables', () => {
            const output = builder.BuildSchema(MakeInput());

            // One consolidated migration per integration
            expect(output.MigrationFiles).toHaveLength(1);
            expect(output.Errors).toHaveLength(0);

            const migration = output.MigrationFiles[0];

            // Should contain CREATE SCHEMA
            expect(migration.Content).toContain('CREATE SCHEMA');
            expect(migration.Content).toContain('hubspot');

            // Should contain both CREATE TABLE statements
            expect(migration.Content).toContain('CREATE TABLE');
            expect(migration.Content).toContain('[hubspot].[Contact]');
            expect(migration.Content).toContain('[Email]');
            expect(migration.Content).toContain('[hubspot].[Deal]');
            expect(migration.Content).toContain('[Amount]');
        });

        it('should produce soft FK entries from source relationships', () => {
            const output = builder.BuildSchema(MakeInput());

            expect(output.AdditionalSchemaInfoUpdate).not.toBeNull();
            const config = JSON.parse(output.AdditionalSchemaInfoUpdate!.Content);
            expect(config['hubspot']).toBeDefined();

            const dealEntry = config['hubspot'].find((t: Record<string, unknown>) => t['TableName'] === 'Deal');
            expect(dealEntry).toBeDefined();
            expect(dealEntry['ForeignKeys']).toHaveLength(1);
            expect(dealEntry['ForeignKeys'][0]['FieldName']).toBe('ContactID');
            expect(dealEntry['ForeignKeys'][0]['RelatedTable']).toBe('Contact');
        });

        it('should not produce metadata files for non-__mj targets', () => {
            const output = builder.BuildSchema(MakeInput());
            expect(output.MetadataFiles).toHaveLength(0);
        });
    });

    describe('__mj entity targets', () => {
        it('should produce metadata files for __mj targets with IntegrationWriteAllowed', () => {
            const input = MakeInput({
                TargetConfigs: [{
                    SourceObjectName: 'contacts',
                    SchemaName: '__mj',
                    TableName: 'Contact',
                    EntityName: 'Contacts',
                    PrimaryKeyFields: ['ContactID'],
                    Columns: [
                        { SourceFieldName: 'id', TargetColumnName: 'ContactID', TargetSqlType: 'NVARCHAR(50)', IsNullable: false, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null },
                        { SourceFieldName: 'email', TargetColumnName: 'Email', TargetSqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null },
                    ],
                    SoftForeignKeys: [],
                }],
                EntitySettingsForTargets: {
                    'Contacts': [{ Name: 'IntegrationWriteAllowed', Value: 'true' }],
                },
            });

            const output = builder.BuildSchema(input);
            expect(output.Errors).toHaveLength(0);
            expect(output.MetadataFiles.length).toBeGreaterThan(0);

            const settingsFile = output.MetadataFiles.find(f => f.FilePath.includes('integration-write-allowed'));
            expect(settingsFile).toBeDefined();
            const parsed = JSON.parse(settingsFile!.Content);
            expect(parsed[0].fields.Name).toBe('Contacts');
        });

        it('should produce errors for __mj targets without IntegrationWriteAllowed', () => {
            const input = MakeInput({
                TargetConfigs: [{
                    SourceObjectName: 'contacts',
                    SchemaName: '__mj',
                    TableName: 'Contact',
                    EntityName: 'Contacts',
                    PrimaryKeyFields: [],
                    Columns: [],
                    SoftForeignKeys: [],
                }],
                EntitySettingsForTargets: {},
            });

            const output = builder.BuildSchema(input);
            expect(output.Errors.length).toBeGreaterThan(0);
            expect(output.Errors[0]).toContain('does not have IntegrationWriteAllowed');
            // Should not produce any migration files when access control fails
            expect(output.MigrationFiles).toHaveLength(0);
        });
    });

    describe('schema evolution', () => {
        it('should generate ALTER TABLE for existing tables with new columns', () => {
            const input = MakeInput({
                ExistingTables: [{
                    SchemaName: 'hubspot',
                    TableName: 'Contact',
                    Columns: [
                        { Name: 'ContactID', SqlType: 'NVARCHAR(50)', IsNullable: false, MaxLength: 50, Precision: null, Scale: null },
                        { Name: 'Email', SqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null },
                        // FirstName is missing — should produce ALTER TABLE ADD
                    ],
                }],
                TargetConfigs: [{
                    SourceObjectName: 'contacts',
                    SchemaName: 'hubspot',
                    TableName: 'Contact',
                    EntityName: 'HubSpot Contact',
                    PrimaryKeyFields: ['ContactID'],
                    Columns: [
                        { SourceFieldName: 'id', TargetColumnName: 'ContactID', TargetSqlType: 'NVARCHAR(50)', IsNullable: false, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null },
                        { SourceFieldName: 'email', TargetColumnName: 'Email', TargetSqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null },
                        { SourceFieldName: 'first_name', TargetColumnName: 'FirstName', TargetSqlType: 'NVARCHAR(100)', IsNullable: true, MaxLength: 100, Precision: null, Scale: null, DefaultValue: null },
                    ],
                    SoftForeignKeys: [],
                }],
            });

            const output = builder.BuildSchema(input);
            expect(output.Errors).toHaveLength(0);
            // Should have warnings about existing table
            expect(output.Warnings.length).toBeGreaterThan(0);

            // Should have an ALTER TABLE migration (no CREATE SCHEMA or CREATE TABLE for existing)
            const alterMigration = output.MigrationFiles.find(f => f.Content.includes('ALTER TABLE'));
            expect(alterMigration).toBeDefined();
            expect(alterMigration!.Content).toContain('FirstName');
        });

        it('should skip evolution migration if no columns changed', () => {
            const input = MakeInput({
                ExistingTables: [{
                    SchemaName: 'hubspot',
                    TableName: 'Contact',
                    Columns: [
                        { Name: 'ContactID', SqlType: 'NVARCHAR(50)', IsNullable: false, MaxLength: 50, Precision: null, Scale: null },
                        { Name: 'Email', SqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null },
                    ],
                }],
                TargetConfigs: [{
                    SourceObjectName: 'contacts',
                    SchemaName: 'hubspot',
                    TableName: 'Contact',
                    EntityName: 'HubSpot Contact',
                    PrimaryKeyFields: ['ContactID'],
                    Columns: [
                        { SourceFieldName: 'id', TargetColumnName: 'ContactID', TargetSqlType: 'NVARCHAR(50)', IsNullable: false, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null },
                        { SourceFieldName: 'email', TargetColumnName: 'Email', TargetSqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null },
                    ],
                    SoftForeignKeys: [],
                }],
            });

            const output = builder.BuildSchema(input);
            // No migration files since nothing changed
            const alterMigrations = output.MigrationFiles.filter(f => f.Content.includes('ALTER TABLE'));
            expect(alterMigrations).toHaveLength(0);
        });
    });

    describe('PostgreSQL platform', () => {
        it('should generate PostgreSQL-compatible DDL', () => {
            const input = MakeInput({ Platform: 'postgresql' });
            const output = builder.BuildSchema(input);

            expect(output.Errors).toHaveLength(0);
            expect(output.MigrationFiles).toHaveLength(1);

            const migration = output.MigrationFiles[0];
            expect(migration.Content).toContain('CREATE SCHEMA IF NOT EXISTS "hubspot"');
            expect(migration.Content).toContain('"hubspot"."Contact"');
            expect(migration.Content).toContain('"__mj_integration_SyncStatus" VARCHAR(50) NOT NULL');
        });
    });

    describe('collision detection', () => {
        it('should warn about existing tables', () => {
            const input = MakeInput({
                ExistingTables: [{
                    SchemaName: 'hubspot',
                    TableName: 'Contact',
                    Columns: [],
                }],
            });

            const output = builder.BuildSchema(input);
            expect(output.Warnings.some(w => w.includes('already exists'))).toBe(true);
        });
    });

    describe('migration file naming', () => {
        it('should produce a single migration file', () => {
            const output = builder.BuildSchema(MakeInput());
            expect(output.MigrationFiles).toHaveLength(1);
        });

        it('should use Flyway naming convention', () => {
            const output = builder.BuildSchema(MakeInput());
            for (const f of output.MigrationFiles) {
                expect(f.FilePath).toMatch(/^migrations\/v2\/V\d{12}__v5\.6\.0\.x_Integration_HubSpot_\w+\.sql$/);
            }
        });
    });
});
