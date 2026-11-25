import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetDialect } from '@memberjunction/sql-dialect';
import { STANDARD_COLUMN_DESCRIPTIONS } from '../DDLGenerator.js';
import { SchemaBuilder } from '../SchemaBuilder.js';
import type { SchemaBuilderInput, SourceSchemaInfo, TargetTableConfig } from '../interfaces.js';
import { RuntimeSchemaManager } from '@memberjunction/schema-engine';

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

/** A pathologically wide table (one PK + `numCols` NVARCHAR(255) columns) — models a 600+ field CRM object. */
function MakeWideConfig(numCols: number): TargetTableConfig {
    const cols = [
        { SourceFieldName: 'id', TargetColumnName: 'WideID', TargetSqlType: 'NVARCHAR(50)', IsNullable: false, MaxLength: 50, Precision: null, Scale: null, DefaultValue: null },
    ];
    for (let i = 0; i < numCols; i++) {
        cols.push({ SourceFieldName: `f${i}`, TargetColumnName: `Field_${i}`, TargetSqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null });
    }
    return {
        SourceObjectName: 'wide',
        SchemaName: 'netforum',
        TableName: 'WideObject',
        EntityName: 'NetForum Wide',
        PrimaryKeyFields: ['WideID'],
        Columns: cols,
        SoftForeignKeys: [],
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
                        // Standard sync columns a real mirror table already carries (so EnsureStandardColumns is a no-op).
                        { Name: '__mj_integration_SyncStatus', SqlType: 'NVARCHAR(50)', IsNullable: false, MaxLength: 50, Precision: null, Scale: null },
                        { Name: '__mj_integration_LastSyncedAt', SqlType: 'DATETIMEOFFSET', IsNullable: true, MaxLength: null, Precision: null, Scale: null },
                        { Name: '__mj_integration_LastSyncedSnapshot', SqlType: 'NVARCHAR(MAX)', IsNullable: true, MaxLength: null, Precision: null, Scale: null },
                        { Name: '__mj_integration_SyncMessage', SqlType: 'NVARCHAR(MAX)', IsNullable: true, MaxLength: null, Precision: null, Scale: null },
                        { Name: '__mj_integration_ContentHash', SqlType: 'NVARCHAR(64)', IsNullable: true, MaxLength: 64, Precision: null, Scale: null },
                        { Name: '__mj_integration_CustomOverflow', SqlType: 'NVARCHAR(MAX)', IsNullable: true, MaxLength: null, Precision: null, Scale: null },
                        // Per-record sync ledger (plan §2.5)
                        { Name: '__mj_integration_ExternalVersion', SqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null },
                        { Name: '__mj_integration_LastSeenModifiedValue', SqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null },
                        { Name: '__mj_integration_LastReconciledAt', SqlType: 'DATETIMEOFFSET', IsNullable: true, MaxLength: null, Precision: null, Scale: null },
                        { Name: '__mj_integration_LastWriterDirection', SqlType: 'NVARCHAR(10)', IsNullable: true, MaxLength: 10, Precision: null, Scale: null },
                        { Name: '__mj_integration_IsTombstoned', SqlType: 'BIT', IsNullable: false, MaxLength: null, Precision: null, Scale: null },
                        { Name: '__mj_integration_DeletedDetectedAt', SqlType: 'DATETIMEOFFSET', IsNullable: true, MaxLength: null, Precision: null, Scale: null },
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
            expect(migration.Content).toContain('CREATE INDEX IF NOT EXISTS "IX_hubspot_Contact_PK" ON hubspot."Contact"("ContactID")');
            expect(migration.Content).toContain('CREATE INDEX IF NOT EXISTS "IX_hubspot_Deal_FK_ContactID" ON hubspot."Deal"("ContactID")');
            for (const colName of Object.keys(STANDARD_COLUMN_DESCRIPTIONS)) {
                expect(migration.Content).toContain(`COMMENT ON COLUMN "hubspot"."Contact"."${colName}" IS`);
            }
        });

        it('should strip whitespace-only descriptions, cap SQL Server length, preserve multi-line descriptions verbatim, and keep SplitBatches/SplitStatements intact via BuildSchema', () => {
            const maxChars = GetDialect('sqlserver').MaxCommentLength!;
            const longDesc = 'Z'.repeat(4500);
            const trickyDesc = 'Line 1 (cost in $$);\nGo\nLine 2;\r\nLine 3';
            const configs = MakeTargetConfigs();
            configs[0].Description = trickyDesc;
            configs[0].Columns[0].Description = '   \t  '; // whitespace-only — must be omitted
            configs[0].Columns[1].Description = longDesc;
            configs[1].Description = '   '; // whitespace-only table description — must be omitted

            const ssDialect = GetDialect('sqlserver');
            const ssOut = builder.BuildSchema(MakeInput({ Platform: 'sqlserver', TargetConfigs: structuredClone(configs) }));
            expect(ssOut.Errors).toHaveLength(0);
            const ssSql = ssOut.MigrationFiles[0].Content;
            // Whitespace-only ContactID and Deal table descriptions omitted
            expect(ssSql).not.toContain("@level2name = N'ContactID'");
            expect(ssSql).not.toContain("sys.fn_listextendedproperty(N'MS_Description', N'SCHEMA', N'hubspot', N'TABLE', N'Deal', NULL, NULL)");
            // Multi-line description preserved verbatim and survives SplitBatches + SplitStatements
            expect(ssSql).toContain(trickyDesc);
            const ssBatches = ssDialect.SplitBatches(ssSql);
            // Expect 2 batches: CREATE SCHEMA (followed by GO) + CREATE TABLE/indexes/descriptions (not split on 'Go' inside description)
            expect(ssBatches).toHaveLength(2);
            for (const stmt of ssDialect.SplitStatements(ssBatches[1])) {
                const quoteCount = (stmt.match(/'/g) ?? []).length;
                expect(quoteCount % 2).toBe(0);
            }
            // Email description capped at SQL Server MaxCommentLength
            const emailExecMatch = ssSql.match(/@value = N'(Z+\.\.\.)'[\s\S]*?@level2name = N'Email'/);
            expect(emailExecMatch).not.toBeNull();
            expect(emailExecMatch![1].length).toBe(maxChars);
            // Every standard column description emitted on SQL Server
            for (const colName of Object.keys(STANDARD_COLUMN_DESCRIPTIONS)) {
                expect(ssSql).toContain(`@level2name = N'${colName}'`);
            }

            const pgDialect = GetDialect('postgresql');
            const pgOut = builder.BuildSchema(MakeInput({ Platform: 'postgresql', TargetConfigs: structuredClone(configs) }));
            expect(pgOut.Errors).toHaveLength(0);
            const pgSql = pgOut.MigrationFiles[0].Content;
            expect(pgSql).not.toContain(`COMMENT ON COLUMN "hubspot"."Contact"."ContactID"`);
            expect(pgSql).not.toContain(`COMMENT ON TABLE "hubspot"."Deal"`);
            expect(pgSql).toContain(`COMMENT ON TABLE "hubspot"."Contact" IS '${trickyDesc}';`);
            // PostgreSQL keeps full >3,700-char description uncapped
            expect(pgSql).toContain(`COMMENT ON COLUMN "hubspot"."Contact"."Email" IS '${longDesc}';`);
            // SplitBatches + SplitStatements keep every statement intact with balanced quotes (even with `;\n`, `$$`, and `Go`)
            const pgBatches = pgDialect.SplitBatches(pgSql);
            expect(pgBatches).toHaveLength(1);
            const pgStatements = pgDialect.SplitStatements(pgBatches[0]);
            expect(pgStatements.length).toBeGreaterThan(20);
            for (const stmt of pgStatements) {
                const quoteCount = (stmt.match(/'/g) ?? []).length;
                expect(quoteCount % 2).toBe(0);
            }
        });
    });

    describe('SQL Server row-size guard (8060)', () => {
        const capFired = (w: string) => w.includes('deferred') && w.includes('8060-byte');

        it('caps a very wide table to a fitting core subset on SQL Server, retaining the PK + emitting a warning', () => {
            const output = builder.BuildSchema(MakeInput({ SourceSchema: { Objects: [] }, TargetConfigs: [MakeWideConfig(400)] }));
            expect(output.Errors).toHaveLength(0);

            // The guard fired: a structured warning naming the deferral + the 8060 reason.
            const capWarn = output.Warnings.find(capFired);
            expect(capWarn).toBeDefined();

            const migration = output.MigrationFiles[0];
            expect(migration).toBeDefined();
            // Primary key is non-negotiable identity — always retained.
            expect(migration.Content).toContain('WideID');
            // Far fewer than the 400 declared field columns survive (a fitting core subset).
            const keptFields = (migration.Content.match(/\bField_\d+\b/g) ?? []).length;
            expect(keptFields).toBeGreaterThan(0);
            expect(keptFields).toBeLessThan(400);
        });

        it('does NOT cap on PostgreSQL — TOAST absorbs oversized rows (all columns retained, no deferral warning)', () => {
            const output = builder.BuildSchema(MakeInput({ Platform: 'postgresql', SourceSchema: { Objects: [] }, TargetConfigs: [MakeWideConfig(400)] }));
            expect(output.Errors).toHaveLength(0);
            expect(output.Warnings.some(capFired)).toBe(false);

            const migration = output.MigrationFiles[0];
            // All 400 declared fields present — no subset taken.
            expect(migration.Content).toContain('Field_399');
            expect(migration.Content).toContain('Field_0');
        });

        it('leaves a normal-width table untouched (no cap, no deferral warning)', () => {
            const output = builder.BuildSchema(MakeInput()); // the 3-column contacts/deals fixture
            expect(output.Warnings.some(capFired)).toBe(false);
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

    describe('RunSchemaPipeline', () => {
        beforeEach(() => {
            vi.restoreAllMocks();
        });

        it('should return schema errors without calling RSU pipeline', async () => {
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

            const { SchemaOutput, PipelineResult } = await builder.RunSchemaPipeline(input);

            expect(SchemaOutput.Errors.length).toBeGreaterThan(0);
            expect(PipelineResult.Success).toBe(false);
            expect(PipelineResult.ErrorStep).toBe('BuildSchema');
        });

        it('should return success when no migration SQL is produced', async () => {
            const input = MakeInput({
                TargetConfigs: [],
            });

            const { SchemaOutput, PipelineResult } = await builder.RunSchemaPipeline(input);

            expect(SchemaOutput.Errors).toHaveLength(0);
            expect(PipelineResult.Success).toBe(true);
            expect(PipelineResult.Steps[0]?.Status).toBe('skipped');
        });

        it('should call RuntimeSchemaManager.RunPipeline when migration SQL is produced', async () => {
            const mockResult = {
                Success: true,
                APIRestarted: true,
                GitCommitSuccess: false,
                Steps: [{ Name: 'Mock', Status: 'success' as const, DurationMs: 10, Message: 'ok' }],
            };

            // Mock RunPipeline on the singleton
            const runPipelineSpy = vi.spyOn(RuntimeSchemaManager.Instance, 'RunPipeline')
                .mockResolvedValue(mockResult);

            const input = MakeInput();
            const { SchemaOutput, PipelineResult } = await builder.RunSchemaPipeline(input, { SkipGitCommit: true });

            expect(SchemaOutput.Errors).toHaveLength(0);
            expect(SchemaOutput.MigrationFiles).toHaveLength(1);
            expect(runPipelineSpy).toHaveBeenCalledOnce();

            // Verify the RSU input was correctly built
            const rsuInput = runPipelineSpy.mock.calls[0][0];
            expect(rsuInput.Description).toContain('HubSpot');
            expect(rsuInput.AffectedTables).toContain('hubspot.Contact');
            expect(rsuInput.AffectedTables).toContain('hubspot.Deal');
            expect(rsuInput.MigrationSQL).toContain('CREATE TABLE');
            expect(rsuInput.SkipGitCommit).toBe(true);
            expect(rsuInput.AdditionalSchemaInfo).toBeDefined();

            expect(PipelineResult.Success).toBe(true);
        });
    });
});
