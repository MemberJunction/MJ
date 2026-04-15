/**
 * @module pipeline-executor
 * @description Shared service that drives the SchemaEngine → RuntimeSchemaManager
 * pipeline for both the Schema Builder agent and the action layer.
 *
 * Centralising this logic ensures that the agent and the actions stay thin
 * (per the Actions Design Philosophy) and that bug fixes in one place propagate
 * everywhere.  Also provides `LoadExistingTableInfo` so both the agent's alter
 * path and the Modify Entity action share a single, correct implementation.
 */

import { Metadata, RunView, UserInfo, LogError } from '@memberjunction/core';
import { MJEntitySettingEntity } from '@memberjunction/core-entities';
import {
    SchemaEngine,
    SchemaEvolution,
    RuntimeSchemaManager,
    type TableDefinition,
    type ExistingTableInfo,
    type RSUPipelineInput,
} from '@memberjunction/schema-engine';

import {
    type PipelineExecutionResult,
    type PipelineStepSummary,
    UDT_SETTINGS,
    escapeSqlLiteral,
} from './interfaces.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Target database platform — Entity Designer only supports SQL Server. */
const TARGET_PLATFORM = 'sqlserver' as const;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Options passed through to RuntimeSchemaManager.
 * Defaults are conservative: skip git commit and restart so the caller can
 * test without side-effects.  Production callers should override.
 */
export interface PipelineExecutionOptions {
    /**
     * Skip creating a git commit for the migration file.
     * Default: false (commit is created in production).
     */
    SkipGitCommit?: boolean;

    /**
     * Skip restarting MJAPI after the pipeline completes.
     * Set to true when running integration tests or in dev workbench mode.
     * Default: false.
     *
     * Note: if the API restarts, the calling agent run will be terminated.
     * The entity will still be created — the restart only affects in-flight
     * requests.  Future agent runs will see the new entity.
     */
    SkipRestart?: boolean;

    /**
     * Source tag written into MJ: Entity Settings after a successful create.
     * Defaults to 'EntityDesigner'; pass 'AgentManager' when invoked via the
     * Agent Manager sub-agent relationship.
     */
    Source?: string;
}

/**
 * Stateless service that coordinates SchemaEngine + RuntimeSchemaManager to
 * create or modify database entities.  Both the agent layer and the action
 * layer delegate here.
 */
export class EntityDesignerPipelineExecutor {
    /**
     * Create a new entity: generate migration SQL, execute the RSU pipeline,
     * refresh metadata, and persist provenance settings.
     */
    public static async CreateEntity(
        tableDefinition: TableDefinition,
        contextUser: UserInfo,
        options: PipelineExecutionOptions = {}
    ): Promise<PipelineExecutionResult> {
        const migrationOutput = EntityDesignerPipelineExecutor.generateCreateMigration(tableDefinition);
        return EntityDesignerPipelineExecutor.executePipeline(
            migrationOutput.SQL,
            `Create entity: ${tableDefinition.EntityName}`,
            migrationOutput.AffectedTables,
            tableDefinition,
            contextUser,
            options
        );
    }

    /**
     * Modify an existing entity: diff desired vs existing schema, generate ALTER
     * TABLE migration SQL, execute the RSU pipeline, and refresh metadata.
     */
    public static async ModifyEntity(
        desired: TableDefinition,
        existing: ExistingTableInfo,
        contextUser: UserInfo,
        options: PipelineExecutionOptions = {}
    ): Promise<PipelineExecutionResult> {
        const evolution = new SchemaEvolution();
        const alterSQL = evolution.GenerateFromEvolutionInput(
            { Desired: desired, ExistingTable: existing },
            TARGET_PLATFORM
        );
        const affectedTables = [`${desired.SchemaName}.${desired.TableName}`];
        return EntityDesignerPipelineExecutor.executePipeline(
            alterSQL,
            `Modify entity: ${desired.EntityName}`,
            affectedTables,
            desired,
            contextUser,
            options
        );
    }

    /**
     * Load the physical column information for an existing table from MJ's
     * Entity Fields metadata.  Returns null if the table is not known to MJ.
     *
     * Shared by both the Schema Builder agent (alter path) and the Modify
     * Entity action so there is a single, correct implementation — including
     * Precision and Scale which are required for SchemaEvolution to correctly
     * diff numeric column changes.
     */
    public static async LoadExistingTableInfo(
        schemaName: string,
        tableName: string,
        contextUser: UserInfo
    ): Promise<ExistingTableInfo | null> {
        const rv = new RunView();

        // Step 1: Resolve the entity ID from Entities metadata.
        const entityResult = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Entities',
            ExtraFilter: `BaseTable = '${escapeSqlLiteral(tableName)}' AND SchemaName = '${escapeSqlLiteral(schemaName)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
        }, contextUser);

        if (!entityResult.Success || entityResult.Results.length === 0) {
            return null;
        }

        const entityID = entityResult.Results[0].ID;

        // Step 2: Load column details from Entity Fields — include Precision and
        // Scale so SchemaEvolution can correctly diff numeric column changes.
        const fieldsResult = await rv.RunView<{
            Name: string;
            Type: string;
            AllowsNull: boolean;
            MaxLength: number | null;
            Precision: number | null;
            Scale: number | null;
        }>({
            EntityName: 'Entity Fields',
            ExtraFilter: `EntityID = '${escapeSqlLiteral(entityID)}'`,
            Fields: ['Name', 'Type', 'AllowsNull', 'MaxLength', 'Precision', 'Scale'],
            OrderBy: 'Sequence ASC',
            ResultType: 'simple',
        }, contextUser);

        if (!fieldsResult.Success) {
            return null;
        }

        return {
            SchemaName: schemaName,
            TableName: tableName,
            Columns: fieldsResult.Results.map(f => ({
                Name: f.Name,
                SqlType: f.Type,
                IsNullable: f.AllowsNull,
                MaxLength: f.MaxLength,
                Precision: f.Precision,
                Scale: f.Scale,
            })),
        };
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Delegate to SchemaEngine to produce CREATE TABLE SQL + affected-table metadata.
     * The FileName field in the returned MigrationOutput is discarded — RuntimeSchemaManager
     * generates its own filename (V{timestamp}__RSU_{tables}.sql) when writing to disk.
     */
    private static generateCreateMigration(tableDefinition: TableDefinition) {
        const engine = new SchemaEngine();
        // mjVersion only affects the discarded FileName; pass empty string.
        return engine.GenerateMigration(tableDefinition, TARGET_PLATFORM, '');
    }

    /**
     * Build the RSUPipelineInput, run the pipeline, refresh metadata, and
     * (on create) save EntitySettings for provenance tracking.
     */
    private static async executePipeline(
        migrationSQL: string,
        description: string,
        affectedTables: string[],
        tableDefinition: TableDefinition,
        contextUser: UserInfo,
        options: PipelineExecutionOptions
    ): Promise<PipelineExecutionResult> {
        const input: RSUPipelineInput = {
            MigrationSQL: migrationSQL,
            Description: description,
            AffectedTables: affectedTables,
            SkipGitCommit: options.SkipGitCommit ?? false,
            SkipRestart: options.SkipRestart ?? false,
        };

        const result = await RuntimeSchemaManager.Instance.RunPipeline(input);

        if (!result.Success) {
            return {
                Success: false,
                ErrorMessage: result.ErrorMessage ?? 'RSU pipeline failed',
                PipelineSteps: EntityDesignerPipelineExecutor.mapPipelineSteps(result.Steps ?? []),
            };
        }

        const steps = EntityDesignerPipelineExecutor.mapPipelineSteps(result.Steps ?? []);

        // Refresh metadata so the newly created entity is immediately visible
        const md = new Metadata();
        await md.Refresh();

        const entityInfo = md.Entities.find(
            e =>
                e.BaseTable.toLowerCase() === tableDefinition.TableName.toLowerCase() &&
                e.SchemaName?.toLowerCase() === tableDefinition.SchemaName.toLowerCase()
        );

        if (!entityInfo) {
            // Pipeline succeeded but CodeGen hasn't registered the entity yet —
            // this is rare but can happen if SkipRestart is true.
            return {
                Success: true,
                SchemaName: tableDefinition.SchemaName,
                TableName: tableDefinition.TableName,
                PipelineSteps: steps,
            };
        }

        // Persist provenance so the Modify and security layers can later
        // determine ownership and origin.
        await EntityDesignerPipelineExecutor.saveProvenance(
            entityInfo.ID,
            contextUser,
            options.Source ?? UDT_SETTINGS.SOURCE_ENTITY_DESIGNER
        );

        return {
            Success: true,
            EntityID: entityInfo.ID,
            EntityName: entityInfo.Name,
            SchemaName: tableDefinition.SchemaName,
            TableName: tableDefinition.TableName,
            PipelineSteps: steps,
        };
    }

    /**
     * Write MJ: Entity Settings records that track who created the entity and
     * via which subsystem (EntityDesigner vs AgentManager).
     */
    private static async saveProvenance(
        entityID: string,
        contextUser: UserInfo,
        source: string
    ): Promise<void> {
        const entries: Array<{ name: string; value: string }> = [
            { name: UDT_SETTINGS.OWNER_KEY, value: contextUser?.ID ?? 'unknown' },
            { name: UDT_SETTINGS.SOURCE_KEY, value: source },
        ];

        const md = new Metadata();
        for (const entry of entries) {
            try {
                const setting = await md.GetEntityObject<MJEntitySettingEntity>(
                    'MJ: Entity Settings',
                    contextUser
                );
                setting.NewRecord();
                setting.EntityID = entityID;
                setting.Name = entry.name;
                setting.Value = entry.value;
                setting.Comments = `Auto-set by Entity Designer Agent at ${new Date().toISOString()}`;
                const saved = await setting.Save();
                if (!saved) {
                    LogError(
                        `EntityDesignerPipelineExecutor: failed to save setting '${entry.name}' for entity ${entityID}: ` +
                        `${setting.LatestResult?.CompleteMessage ?? 'unknown error'}`
                    );
                }
            } catch (err) {
                LogError(`EntityDesignerPipelineExecutor: error saving setting '${entry.name}': ${String(err)}`);
            }
        }
    }

    /**
     * Convert RSU step records to our lightweight summary type.
     * Preserves the `Message` field from RSUPipelineStep so callers can surface
     * human-readable error details from pipeline failures.
     */
    private static mapPipelineSteps(
        steps: Array<{ Name: string; Status: string; DurationMs: number; Message?: string }>
    ): PipelineStepSummary[] {
        return steps.map(s => ({
            Name: s.Name,
            Status: s.Status as PipelineStepSummary['Status'],
            DurationMs: s.DurationMs,
            Message: s.Message,
        }));
    }
}
