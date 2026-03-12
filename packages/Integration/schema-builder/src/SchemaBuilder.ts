/**
 * SchemaBuilder — orchestrates the full schema generation pipeline for integrations.
 * Thin wrapper around @memberjunction/schema-engine: converts integration-specific
 * types (TargetTableConfig) to generic TableDefinition, delegates DDL generation
 * to SchemaEngine, then adds integration-specific artifacts (soft FKs, metadata).
 */
import type {
    DatabasePlatform,
    EmittedFile,
    ExistingTableInfo,
    SchemaBuilderInput,
    SchemaBuilderOutput,
    SoftFKEntry,
    TargetTableConfig,
    TargetColumnConfig,
} from './interfaces.js';
import {
    SchemaEngine,
    DDLGenerator as GenericDDLGenerator,
    MigrationFileWriter as GenericMigrationWriter,
    RuntimeSchemaManager,
    type TableDefinition,
    type ColumnDefinition,
    type SchemaFieldType,
    type RSUPipelineInput,
    type RSUPipelineResult,
} from '@memberjunction/schema-engine';
import { SoftFKConfigEmitter } from './SoftFKConfigEmitter.js';
import { MetadataEmitter } from './MetadataEmitter.js';
import { SchemaEvolution } from './SchemaEvolution.js';
import { IsIntegrationWriteAllowed } from './AccessControl.js';

/**
 * Main entry point for the Integration Schema Builder.
 * Delegates DDL generation to @memberjunction/schema-engine and adds
 * integration-specific artifacts (sync columns, soft FKs, metadata files).
 */
export class SchemaBuilder {
    private readonly Engine = new SchemaEngine();
    private readonly SoftFKEmitter = new SoftFKConfigEmitter();
    private readonly MetaEmitter = new MetadataEmitter();
    private readonly Evolution = new SchemaEvolution();

    /**
     * Build all artifacts for a set of integration target tables.
     */
    BuildSchema(input: SchemaBuilderInput): SchemaBuilderOutput {
        const output: SchemaBuilderOutput = {
            MigrationFiles: [],
            AdditionalSchemaInfoUpdate: null,
            MetadataFiles: [],
            Warnings: [],
            Errors: [],
        };

        // Step 1: Validate access control
        const accessErrors = this.ValidateAccessControl(input);
        if (accessErrors.length > 0) {
            output.Errors.push(...accessErrors);
            return output;
        }

        // Step 2: Pre-flight collision checks
        const collisionWarnings = this.CheckCollisions(input);
        output.Warnings.push(...collisionWarnings);

        // Step 3: Separate new tables vs evolution
        const { newConfigs, evolutionConfigs } = this.ClassifyConfigs(input);

        // Step 4: Generate DDL using SchemaEngine
        const ddlParts: string[] = [];

        // Schema creation statements (deduplicate by schema name)
        const schemasToCreate = this.GetUniqueSchemas(newConfigs);
        for (const schemaName of schemasToCreate) {
            ddlParts.push(this.Engine.GenerateCreateSchema(schemaName, input.Platform));
            ddlParts.push(''); // blank line separator
        }

        // Convert new tables → TableDefinition and generate CREATE TABLE via SchemaEngine DDLGenerator
        // Note: we use DDLGenerator directly (not SchemaEngine.GenerateMigration) because
        // integrations may target __mj schema with proper access control, and SchemaValidator
        // blocks __mj by default. Integration access control is handled in Step 1 above.
        const ddlGen = new GenericDDLGenerator();
        for (const config of newConfigs) {
            const tableDef = this.ConvertToTableDefinition(config, input.Platform);
            ddlParts.push(ddlGen.GenerateCreateTable(tableDef, input.Platform));
            ddlParts.push(''); // blank line separator
        }

        // Evolution statements (ALTER TABLE) — uses integration-specific SchemaEvolution
        for (const { config, existing } of evolutionConfigs) {
            const sourceObj = input.SourceSchema.Objects.find(o => o.ExternalName === config.SourceObjectName);
            if (!sourceObj) continue;

            const diff = this.Evolution.DiffSchema(sourceObj, config, existing, input.Platform);
            if (diff.AddedColumns.length === 0 && diff.ModifiedColumns.length === 0 && diff.RemovedColumns.length === 0) {
                continue; // No changes
            }

            ddlParts.push(this.Evolution.GenerateEvolutionMigration(diff, config.SchemaName, config.TableName, input.Platform));
            ddlParts.push(''); // blank line separator
        }

        // Emit a single migration file if there's any DDL
        if (ddlParts.some(p => p.trim().length > 0)) {
            const tableNames = [
                ...newConfigs.map(c => c.TableName),
                ...evolutionConfigs.map(({ config }) => config.TableName),
            ];
            const action = newConfigs.length > 0 ? 'CreateTables' : 'AlterTables';
            const migrationWriter = new GenericMigrationWriter();
            const now = new Date();
            const timestamps = migrationWriter.GenerateTimestampSequence(1, now);
            const filePath = migrationWriter.GenerateMigrationFileName(
                input.SourceType, action, input.MJVersion, input.MigrationsDir, timestamps[0], 'Integration'
            );
            output.MigrationFiles = [migrationWriter.WrapInMigrationFile(ddlParts.join('\n'), {
                SourceType: input.SourceType,
                ObjectName: tableNames.join(', '),
                Action: action,
                GeneratedBy: 'MJ Integration Schema Builder (via SchemaEngine)',
                Timestamp: new Date().toISOString(),
            }, filePath)];
        }

        // Step 5: Generate soft PK and FK config
        const allConfigs = [...newConfigs, ...evolutionConfigs.map(ec => ec.config)];
        const allSoftFKs = this.CollectSoftFKs(input, evolutionConfigs);
        // Always emit additionalSchemaInfo — every integration table needs a soft PK
        if (allConfigs.length > 0) {
            const existingConfig = this.SoftFKEmitter.ParseExistingConfig(null);
            const withPKs = this.SoftFKEmitter.MergeSoftPKs(existingConfig, allConfigs);
            const merged = allSoftFKs.length > 0
                ? this.SoftFKEmitter.MergeSchemaConfig(withPKs, allSoftFKs)
                : withPKs;
            output.AdditionalSchemaInfoUpdate = this.SoftFKEmitter.EmitConfigFile(
                input.AdditionalSchemaInfoPath, merged
            );
        }

        // Step 6: Generate metadata files for __mj entity targets
        const mjTargets = input.TargetConfigs.filter(c => c.SchemaName === '__mj');
        if (mjTargets.length > 0) {
            const entityNames = mjTargets.map(c => c.EntityName);
            output.MetadataFiles.push(
                this.MetaEmitter.EmitEntitySettingsFile(entityNames, input.MetadataDir)
            );
            output.MetadataFiles.push(
                this.MetaEmitter.EmitMjSyncConfig(input.MetadataDir)
            );
        }

        return output;
    }

    // ─── RSU Pipeline Integration ──────────────────────────────────────

    /**
     * Build schema artifacts AND execute the full Runtime Schema Update pipeline.
     *
     * This is the end-to-end integration flow:
     *   1. Call BuildSchema() to generate migration SQL, soft FK config, and metadata
     *   2. Feed the output into RuntimeSchemaManager.RunPipeline()
     *   3. Pipeline executes: migration → CodeGen → compile → restart MJAPI → git commit/PR
     *
     * Returns both the SchemaBuilderOutput and the RSU pipeline result.
     *
     * @param input — Standard SchemaBuilderInput
     * @param rsuOptions — Optional overrides for the RSU pipeline (e.g., SkipGitCommit, SkipRestart)
     */
    async RunSchemaPipeline(
        input: SchemaBuilderInput,
        rsuOptions?: { SkipGitCommit?: boolean; SkipRestart?: boolean }
    ): Promise<{ SchemaOutput: SchemaBuilderOutput; PipelineResult: RSUPipelineResult }> {
        // Step 1: Generate all schema artifacts
        const schemaOutput = this.BuildSchema(input);

        // If BuildSchema produced errors, return immediately without running pipeline
        if (schemaOutput.Errors.length > 0) {
            return {
                SchemaOutput: schemaOutput,
                PipelineResult: {
                    Success: false,
                    APIRestarted: false,
                    GitCommitSuccess: false,
                    Steps: [],
                    ErrorMessage: `Schema generation failed: ${schemaOutput.Errors.join('; ')}`,
                    ErrorStep: 'BuildSchema',
                },
            };
        }

        // If no migration files were produced, nothing to execute
        if (schemaOutput.MigrationFiles.length === 0) {
            return {
                SchemaOutput: schemaOutput,
                PipelineResult: {
                    Success: true,
                    APIRestarted: false,
                    GitCommitSuccess: false,
                    Steps: [{ Name: 'BuildSchema', Status: 'skipped', DurationMs: 0, Message: 'No migration SQL produced — no schema changes needed' }],
                },
            };
        }

        // Step 2: Build RSU pipeline input from SchemaBuilder output
        const rsuInput = this.BuildRSUInput(schemaOutput, input, rsuOptions);

        // Step 3: Execute the RSU pipeline
        const rsm = RuntimeSchemaManager.Instance;
        const pipelineResult = await rsm.RunPipeline(rsuInput);

        return { SchemaOutput: schemaOutput, PipelineResult: pipelineResult };
    }

    /**
     * Convert SchemaBuilderOutput into an RSUPipelineInput suitable for
     * RuntimeSchemaManager.RunPipeline().
     */
    private BuildRSUInput(
        schemaOutput: SchemaBuilderOutput,
        input: SchemaBuilderInput,
        rsuOptions?: { SkipGitCommit?: boolean; SkipRestart?: boolean }
    ): RSUPipelineInput {
        // Combine all migration file contents into a single SQL block
        const migrationSQL = schemaOutput.MigrationFiles
            .map(f => f.Content)
            .join('\n\n');

        // Collect affected table names from the target configs
        const affectedTables = input.TargetConfigs.map(
            c => `${c.SchemaName}.${c.TableName}`
        );

        // Build metadata files array for the pipeline
        const metadataFiles: Array<{ Path: string; Content: string }> = [];
        for (const mf of schemaOutput.MetadataFiles) {
            metadataFiles.push({ Path: mf.FilePath, Content: mf.Content });
        }

        return {
            MigrationSQL: migrationSQL,
            Description: `Integration: ${input.SourceType} — ${affectedTables.join(', ')}`,
            AffectedTables: affectedTables,
            AdditionalSchemaInfo: schemaOutput.AdditionalSchemaInfoUpdate?.Content,
            MetadataFiles: metadataFiles.length > 0 ? metadataFiles : undefined,
            SkipGitCommit: rsuOptions?.SkipGitCommit,
            SkipRestart: rsuOptions?.SkipRestart,
        };
    }

    // ─── Conversion: Integration types → SchemaEngine types ─────────────

    /**
     * Convert an integration TargetTableConfig to a generic TableDefinition.
     * Adds integration-specific sync columns via AdditionalColumns.
     */
    private ConvertToTableDefinition(config: TargetTableConfig, platform: DatabasePlatform): TableDefinition {
        return {
            SchemaName: config.SchemaName,
            TableName: config.TableName,
            EntityName: config.EntityName,
            Description: config.Description,
            Columns: config.Columns.map(c => this.ConvertColumn(c)),
            SoftPrimaryKeys: config.PrimaryKeyFields,
            AdditionalColumns: this.IntegrationSyncColumns(platform),
        };
    }

    /** Convert a TargetColumnConfig to a generic ColumnDefinition. */
    private ConvertColumn(col: TargetColumnConfig): ColumnDefinition {
        return {
            Name: col.TargetColumnName,
            Type: 'string' as SchemaFieldType, // Overridden by RawSqlType
            RawSqlType: col.TargetSqlType,
            IsNullable: col.IsNullable,
            MaxLength: col.MaxLength ?? undefined,
            Precision: col.Precision ?? undefined,
            Scale: col.Scale ?? undefined,
            DefaultValue: col.DefaultValue ?? undefined,
            Description: col.Description,
        };
    }

    /** Integration-specific sync columns added to every integration table. */
    private IntegrationSyncColumns(platform: DatabasePlatform): ColumnDefinition[] {
        return [
            {
                Name: '__mj_integration_SyncStatus',
                Type: 'string' as SchemaFieldType,
                RawSqlType: platform === 'sqlserver' ? 'NVARCHAR(50)' : 'VARCHAR(50)',
                IsNullable: false,
                DefaultValue: "'Active'",
                Description: 'Current sync status: Active, Archived, or Error',
            },
            {
                Name: '__mj_integration_LastSyncedAt',
                Type: 'datetime' as SchemaFieldType,
                RawSqlType: platform === 'sqlserver' ? 'DATETIMEOFFSET' : 'TIMESTAMPTZ',
                IsNullable: true,
                Description: 'Timestamp of the last successful sync for this record',
            },
        ];
    }

    /**
     * Extract DDL body from a wrapped migration file (strips the header comments).
     * SchemaEngine wraps DDL in a migration header — we need just the DDL
     * since we produce our own single consolidated migration file.
     */
    private ExtractDDLFromMigration(migrationContent: string): string {
        const lines = migrationContent.split('\n');
        // Skip comment header lines (starting with --)  and the initial empty line
        const bodyLines: string[] = [];
        let pastHeader = false;
        for (const line of lines) {
            if (!pastHeader) {
                if (line.startsWith('--') || line.trim() === '') {
                    continue;
                }
                pastHeader = true;
            }
            bodyLines.push(line);
        }
        return bodyLines.join('\n').trim();
    }

    // ─── Validation & Classification ────────────────────────────────────

    private ValidateAccessControl(input: SchemaBuilderInput): string[] {
        const errors: string[] = [];
        for (const config of input.TargetConfigs) {
            if (config.SchemaName === '__mj') {
                const settings = input.EntitySettingsForTargets[config.EntityName] ?? [];
                const result = IsIntegrationWriteAllowed(config.EntityName, config.SchemaName, settings);
                if (!result.Allowed) {
                    errors.push(result.Reason);
                }
            }
        }
        return errors;
    }

    private CheckCollisions(input: SchemaBuilderInput): string[] {
        const warnings: string[] = [];
        const existingNames = new Set(input.ExistingTables.map(t => `${t.SchemaName}.${t.TableName}`.toLowerCase()));

        for (const config of input.TargetConfigs) {
            const key = `${config.SchemaName}.${config.TableName}`.toLowerCase();
            if (existingNames.has(key)) {
                warnings.push(`Table ${config.SchemaName}.${config.TableName} already exists — will generate ALTER TABLE if fields differ.`);
            }
        }

        return warnings;
    }

    private ClassifyConfigs(input: SchemaBuilderInput): {
        newConfigs: TargetTableConfig[];
        evolutionConfigs: Array<{ config: TargetTableConfig; existing: ExistingTableInfo }>;
    } {
        const existingMap = new Map<string, ExistingTableInfo>();
        for (const t of input.ExistingTables) {
            existingMap.set(`${t.SchemaName}.${t.TableName}`.toLowerCase(), t);
        }

        const newConfigs: TargetTableConfig[] = [];
        const evolutionConfigs: Array<{ config: TargetTableConfig; existing: ExistingTableInfo }> = [];

        for (const config of input.TargetConfigs) {
            const key = `${config.SchemaName}.${config.TableName}`.toLowerCase();
            const existing = existingMap.get(key);
            if (existing) {
                evolutionConfigs.push({ config, existing });
            } else {
                newConfigs.push(config);
            }
        }

        return { newConfigs, evolutionConfigs };
    }

    private GetUniqueSchemas(configs: TargetTableConfig[]): string[] {
        const schemas = new Set<string>();
        for (const config of configs) {
            schemas.add(config.SchemaName);
        }
        return Array.from(schemas);
    }

    private CollectSoftFKs(
        input: SchemaBuilderInput,
        evolutionConfigs: Array<{ config: TargetTableConfig; existing: ExistingTableInfo }>
    ): SoftFKEntry[] {
        // From source relationships
        const fromSource = this.SoftFKEmitter.GenerateConfigEntries(input.SourceSchema, input.TargetConfigs);

        // From evolution (new FK columns)
        for (const { config, existing } of evolutionConfigs) {
            const sourceObj = input.SourceSchema.Objects.find(o => o.ExternalName === config.SourceObjectName);
            if (!sourceObj) continue;
            const diff = this.Evolution.DiffSchema(sourceObj, config, existing, input.Platform);
            const newFKs = this.Evolution.GenerateEvolutionSoftFKUpdates(diff, config);
            fromSource.push(...newFKs);
        }

        return fromSource;
    }
}
