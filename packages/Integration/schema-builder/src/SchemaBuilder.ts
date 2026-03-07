/**
 * SchemaBuilder — orchestrates the full schema generation pipeline.
 * Pure function: takes input → produces output files. Never touches the database.
 */
import type {
    DatabasePlatform,
    EmittedFile,
    ExistingTableInfo,
    MigrationMetadata,
    SchemaBuilderInput,
    SchemaBuilderOutput,
    SoftFKEntry,
    TargetTableConfig,
} from './interfaces.js';
import { DDLGenerator } from './DDLGenerator.js';
import { MigrationFileWriter } from './MigrationFileWriter.js';
import { SoftFKConfigEmitter } from './SoftFKConfigEmitter.js';
import { MetadataEmitter } from './MetadataEmitter.js';
import { SchemaEvolution } from './SchemaEvolution.js';
import { IsIntegrationWriteAllowed } from './AccessControl.js';

/**
 * Main entry point for the Integration Schema Builder.
 * Coordinates DDL generation, soft FK emission, metadata emission, and evolution diffs.
 */
export class SchemaBuilder {
    private readonly DDL = new DDLGenerator();
    private readonly MigrationWriter = new MigrationFileWriter();
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

        // Step 4: Generate DDL — one migration file per integration
        const now = new Date();
        const ddlParts: string[] = [];

        // Schema creation statements (deduplicate by schema name)
        const schemasToCreate = this.GetUniqueSchemas(newConfigs);
        for (const schemaName of schemasToCreate) {
            ddlParts.push(this.DDL.GenerateCreateSchema(schemaName, input.Platform));
            ddlParts.push(''); // blank line separator
        }

        // Table creation statements
        for (const config of newConfigs) {
            ddlParts.push(this.DDL.GenerateCreateTable(config, input.Platform));
            ddlParts.push(''); // blank line separator
        }

        // Evolution statements (ALTER TABLE)
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
            const meta = this.MakeMigrationMeta(input, action, tableNames.join(', '));
            const timestamps = this.MigrationWriter.GenerateTimestampSequence(1, now);
            const filePath = this.MigrationWriter.GenerateMigrationFileName(
                input.SourceType, action, input.MJVersion, input.MigrationsDir, timestamps[0]
            );
            output.MigrationFiles = [this.MigrationWriter.WrapInMigrationFile(ddlParts.join('\n'), meta, filePath)];
        }

        // Step 5: Generate soft FK config
        const allSoftFKs = this.CollectSoftFKs(input, evolutionConfigs);
        if (allSoftFKs.length > 0) {
            const existingConfig = this.SoftFKEmitter.ParseExistingConfig(null); // Caller provides existing content via input
            const merged = this.SoftFKEmitter.MergeSchemaConfig(existingConfig, allSoftFKs);
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
                // Not necessarily an error — could be an evolution scenario
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

    private MakeMigrationMeta(input: SchemaBuilderInput, action: string, objectName: string): MigrationMetadata {
        return {
            SourceType: input.SourceType,
            ObjectName: objectName,
            Action: action,
            GeneratedBy: 'MJ Integration Schema Builder',
            Timestamp: new Date().toISOString(),
        };
    }
}
