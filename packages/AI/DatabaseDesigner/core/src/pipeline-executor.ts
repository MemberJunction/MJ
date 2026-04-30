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
    SoftFKConfigEmitter,
    type SoftFKEntry,
    type TableDefinition,
    type ExistingTableInfo,
    type RSUPipelineInput,
    type RSUPipelineBatchResult,
} from '@memberjunction/schema-engine';

import {
    type PipelineExecutionResult,
    type PipelineStepSummary,
    type BatchPipelineExecutionResult,
    UDT_SETTINGS,
    escapeSqlLiteral,
} from './interfaces.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Target database platform — Database Designer only supports SQL Server. */
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
     * Defaults to 'DatabaseDesigner'; pass 'AgentManager' when invoked via the
     * Agent Manager sub-agent relationship.
     */
    Source?: string;
}

/**
 * One table to create or modify as part of a CreateEntitiesBatch call.
 * Includes the modification type and optional existing entity ID for alters.
 */
export interface BatchTableInput {
    tableDefinition: TableDefinition;
    modificationType: 'create' | 'alter';
    /** Required when modificationType === 'alter'. */
    existingEntityID?: string;
}

// Internal discriminated union for batch input building
type BatchPipelineInputSuccess = { type: 'success'; input: RSUPipelineInput };
type BatchPipelineInputError = { type: 'error'; message: string };

/**
 * Stateless service that coordinates SchemaEngine + RuntimeSchemaManager to
 * create or modify database entities.  Both the agent layer and the action
 * layer delegate here.
 */
export class DatabaseDesignerPipelineExecutor {
    /**
     * Create a new entity: generate migration SQL, execute the RSU pipeline,
     * refresh metadata, and persist provenance settings.
     */
    public static async CreateEntity(
        tableDefinition: TableDefinition,
        contextUser: UserInfo,
        options: PipelineExecutionOptions = {}
    ): Promise<PipelineExecutionResult> {
        const migrationOutput = DatabaseDesignerPipelineExecutor.generateCreateMigration(
            DatabaseDesignerPipelineExecutor.normalizeForeignKeys(tableDefinition)
        );
        return DatabaseDesignerPipelineExecutor.executePipeline(
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
        const normalizedDesired = DatabaseDesignerPipelineExecutor.normalizeForeignKeys(desired);
        const evolution = new SchemaEvolution();
        const alterSQL = evolution.GenerateFromEvolutionInput(
            { Desired: normalizedDesired, ExistingTable: existing },
            TARGET_PLATFORM
        );
        const affectedTables = [`${normalizedDesired.SchemaName}.${normalizedDesired.TableName}`];
        return DatabaseDesignerPipelineExecutor.executePipeline(
            alterSQL,
            `Modify entity: ${normalizedDesired.EntityName}`,
            affectedTables,
            normalizedDesired,
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
            EntityName: 'MJ: Entity Fields',
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

    /**
     * Sort table definitions so that tables referenced by FK from other tables
     * in the batch appear BEFORE the tables that reference them.
     *
     * Uses Kahn's topological sort algorithm — runs in O(V+E) time where V is
     * the number of tables and E is the number of FK relationships within the
     * batch. Tables with no intra-batch FK dependencies retain their original
     * relative order (stable sort property of Kahn's algorithm with a queue).
     *
     * If a circular FK dependency exists (which SchemaEngine would reject during
     * DDL generation anyway), the cycle is detected and the remaining tables are
     * appended in original order so the batch does not silently drop tables.
     *
     * @param tables - Table definitions to sort. Not mutated.
     * @returns A new array with the same tables in dependency order.
     */
    public static sortByFKDependency(tables: TableDefinition[]): TableDefinition[] {
        if (tables.length <= 1) return [...tables];

        // Build an index from "schema.table" → original array index for fast lookup
        const tableKey = (t: TableDefinition): string =>
            `${t.SchemaName.toLowerCase()}.${t.TableName.toLowerCase()}`;

        const keyToIndex = new Map<string, number>(
            tables.map((t, i) => [tableKey(t), i])
        );

        // Build adjacency list: edge[i] = set of table indices that table i depends on
        // (i.e., tables that must be created BEFORE table i)
        const inDegree = new Array<number>(tables.length).fill(0);
        const dependents = new Array<Set<number>>(tables.length)
            .fill(null as unknown as Set<number>)
            .map(() => new Set<number>());

        for (let i = 0; i < tables.length; i++) {
            for (const fk of tables[i].ForeignKeys ?? []) {
                const targetKey = `${fk.ReferencedSchema.toLowerCase()}.${fk.ReferencedTable.toLowerCase()}`;
                const targetIdx = keyToIndex.get(targetKey);
                if (targetIdx === undefined || targetIdx === i) continue; // not in batch or self-ref
                // table[targetIdx] must come BEFORE table[i]
                if (!dependents[targetIdx].has(i)) {
                    dependents[targetIdx].add(i);
                    inDegree[i]++;
                }
            }
        }

        // Kahn's BFS — enqueue all tables with no unresolved dependencies
        const queue: number[] = [];
        for (let i = 0; i < tables.length; i++) {
            if (inDegree[i] === 0) queue.push(i);
        }

        const sorted: TableDefinition[] = [];
        while (queue.length > 0) {
            const idx = queue.shift()!;
            sorted.push(tables[idx]);
            for (const dependentIdx of dependents[idx]) {
                inDegree[dependentIdx]--;
                if (inDegree[dependentIdx] === 0) queue.push(dependentIdx);
            }
        }

        // Append any tables caught in a cycle so we never silently drop them
        if (sorted.length < tables.length) {
            for (let i = 0; i < tables.length; i++) {
                if (inDegree[i] > 0) sorted.push(tables[i]);
            }
        }

        return sorted;
    }

    /**
     * Create or modify multiple entities in a single pipeline batch — one CodeGen
     * run covers all tables, which is the primary performance benefit over calling
     * CreateEntity/ModifyEntity individually.
     *
     * Execution sequence:
     *  1. Sort tables by FK dependency so referenced tables are created first
     *  2. For each table: normalise FKs + generate migration SQL (CREATE or ALTER)
     *  3. Run RuntimeSchemaManager.RunPipelineBatch() — one lock, one CodeGen run
     *  4. Refresh metadata once after all migrations complete
     *  5. Save provenance (MJ:UDT:Owner, MJ:UDT:Source) for every successful table
     *
     * Partial failure is supported: if 3 of 5 tables succeed and 2 fail, the
     * successful tables are live in the DB, CodeGen runs on them, and the caller
     * receives per-table Success flags to present to the user.
     *
     * @param inputs - One entry per table. Tables are sorted internally by FK
     *   dependency before migration SQL is generated.
     * @param contextUser - MJ context user forwarded to DB queries and provenance.
     * @param options - Pipeline execution options applied to the whole batch.
     */
    public static async CreateEntitiesBatch(
        inputs: BatchTableInput[],
        contextUser: UserInfo,
        options: PipelineExecutionOptions = {}
    ): Promise<BatchPipelineExecutionResult> {
        if (inputs.length === 0) {
            return { Success: true, Results: [] };
        }

        // Single-table shortcut — avoids batch overhead for the common case
        if (inputs.length === 1) {
            const single = await DatabaseDesignerPipelineExecutor.runSingleBatchInput(
                inputs[0], contextUser, options
            );
            return {
                Success: single.Success,
                Results: [single],
                Warnings: single.Warnings,
            };
        }

        // Sort by FK dependency so migration SQL is generated in the right order
        const sorted = DatabaseDesignerPipelineExecutor.sortByFKDependency(
            inputs.map(i => i.tableDefinition)
        );

        // Re-map sorted definitions back to their original BatchTableInput entries
        const sortedInputs = sorted.map(td =>
            inputs.find(i =>
                i.tableDefinition.SchemaName.toLowerCase() === td.SchemaName.toLowerCase() &&
                i.tableDefinition.TableName.toLowerCase() === td.TableName.toLowerCase()
            )!
        );

        // Build RSUPipelineInput for each table
        const pipelineInputs = await DatabaseDesignerPipelineExecutor.buildBatchPipelineInputs(
            sortedInputs, contextUser, options
        );

        // Check if any input failed to build (e.g. existing table not found for alter)
        const buildErrors = pipelineInputs.filter(r => r.type === 'error');
        if (buildErrors.length > 0) {
            return {
                Success: false,
                Results: sortedInputs.map((inp, i) => {
                    const err = pipelineInputs[i];
                    return err.type === 'error'
                        ? { Success: false, ErrorMessage: err.message, SchemaName: inp.tableDefinition.SchemaName, TableName: inp.tableDefinition.TableName }
                        : { Success: false, ErrorMessage: 'Aborted due to other table build error', SchemaName: inp.tableDefinition.SchemaName, TableName: inp.tableDefinition.TableName };
                }),
            };
        }

        const rsuInputs = pipelineInputs.map(r => (r as BatchPipelineInputSuccess).input);
        const batchResult: RSUPipelineBatchResult = await RuntimeSchemaManager.Instance.RunPipelineBatch(rsuInputs);

        // Refresh metadata once for all successful migrations
        const warnings: string[] = [];
        const md = new Metadata(); // global-provider-ok: MJAPI server-side, single-provider deployment
        try {
            await md.Refresh();
        } catch (refreshErr) {
            const msg = `Metadata refresh failed after batch pipeline: ${String(refreshErr)}. ` +
                `Created entities may not be visible until MJAPI restarts.`;
            LogError(`DatabaseDesignerPipelineExecutor.CreateEntitiesBatch: ${msg}`);
            warnings.push(msg);
        }

        // Map per-item results and save provenance for each successful table
        const results: PipelineExecutionResult[] = [];
        for (let i = 0; i < sortedInputs.length; i++) {
            const inp = sortedInputs[i];
            const rsuResult = batchResult.Results[i];
            const steps = DatabaseDesignerPipelineExecutor.mapPipelineSteps(rsuResult?.Steps ?? []);

            if (!rsuResult?.Success) {
                results.push({
                    Success: false,
                    SchemaName: inp.tableDefinition.SchemaName,
                    TableName: inp.tableDefinition.TableName,
                    ErrorMessage: rsuResult?.ErrorMessage ?? 'Pipeline step failed',
                    PipelineSteps: steps,
                });
                continue;
            }

            const entityResult = await DatabaseDesignerPipelineExecutor.resolveEntityAfterMigration(
                inp.tableDefinition, md, contextUser
            );

            if (entityResult.entityID) {
                await DatabaseDesignerPipelineExecutor.saveProvenance(
                    entityResult.entityID,
                    contextUser,
                    options.Source ?? UDT_SETTINGS.SOURCE_DATABASE_DESIGNER
                );
            }

            results.push({
                Success: true,
                EntityID: entityResult.entityID,
                EntityName: entityResult.entityName ?? inp.tableDefinition.EntityName,
                SchemaName: inp.tableDefinition.SchemaName,
                TableName: inp.tableDefinition.TableName,
                PipelineSteps: steps,
                Warnings: entityResult.warnings.length > 0 ? entityResult.warnings : undefined,
            });
        }

        const allSucceeded = results.every(r => r.Success);
        return { Success: allSucceeded, Results: results, Warnings: warnings.length > 0 ? warnings : undefined };
    }

    /**
     * Run a single BatchTableInput through the standard single-pipeline path.
     * Delegates to CreateEntity or ModifyEntity based on modificationType.
     * Used internally by CreateEntitiesBatch for single-table batches (avoids
     * batch-infrastructure overhead for the common single-table case).
     */
    private static async runSingleBatchInput(
        input: BatchTableInput,
        contextUser: UserInfo,
        options: PipelineExecutionOptions
    ): Promise<PipelineExecutionResult> {
        if (input.modificationType === 'alter') {
            const existing = await DatabaseDesignerPipelineExecutor.LoadExistingTableInfo(
                input.tableDefinition.SchemaName,
                input.tableDefinition.TableName,
                contextUser
            );
            if (!existing) {
                return {
                    Success: false,
                    ErrorMessage: `Cannot modify entity: table '${input.tableDefinition.SchemaName}.${input.tableDefinition.TableName}' not found.`,
                };
            }
            return DatabaseDesignerPipelineExecutor.ModifyEntity(input.tableDefinition, existing, contextUser, options);
        }
        return DatabaseDesignerPipelineExecutor.CreateEntity(input.tableDefinition, contextUser, options);
    }

    /**
     * Build RSUPipelineInput entries for each BatchTableInput.
     * Returns discriminated union results so the caller can detect per-table
     * build failures (e.g. existing table not found for an alter operation)
     * before executing any pipeline SQL.
     */
    private static async buildBatchPipelineInputs(
        inputs: BatchTableInput[],
        contextUser: UserInfo,
        options: PipelineExecutionOptions
    ): Promise<Array<BatchPipelineInputSuccess | BatchPipelineInputError>> {
        const results: Array<BatchPipelineInputSuccess | BatchPipelineInputError> = [];

        for (const inp of inputs) {
            if (inp.modificationType === 'alter') {
                const existing = await DatabaseDesignerPipelineExecutor.LoadExistingTableInfo(
                    inp.tableDefinition.SchemaName,
                    inp.tableDefinition.TableName,
                    contextUser
                );
                if (!existing) {
                    results.push({
                        type: 'error',
                        message: `Cannot modify: table '${inp.tableDefinition.SchemaName}.${inp.tableDefinition.TableName}' not found in the database.`,
                    });
                    continue;
                }
                const normalized = DatabaseDesignerPipelineExecutor.normalizeForeignKeys(inp.tableDefinition);
                const evolution = new SchemaEvolution();
                const alterSQL = evolution.GenerateFromEvolutionInput(
                    { Desired: normalized, ExistingTable: existing },
                    TARGET_PLATFORM
                );
                results.push({
                    type: 'success',
                    input: {
                        MigrationSQL: alterSQL,
                        Description: `Modify entity: ${normalized.EntityName}`,
                        AffectedTables: [`${normalized.SchemaName}.${normalized.TableName}`],
                        AdditionalSchemaInfo: DatabaseDesignerPipelineExecutor.buildAdditionalSchemaInfo(normalized),
                        SkipGitCommit: options.SkipGitCommit ?? false,
                        SkipRestart: options.SkipRestart ?? false,
                    },
                });
            } else {
                const normalized = DatabaseDesignerPipelineExecutor.normalizeForeignKeys(inp.tableDefinition);
                const migrationOutput = DatabaseDesignerPipelineExecutor.generateCreateMigration(normalized);
                results.push({
                    type: 'success',
                    input: {
                        MigrationSQL: migrationOutput.SQL,
                        Description: `Create entity: ${normalized.EntityName}`,
                        AffectedTables: migrationOutput.AffectedTables,
                        AdditionalSchemaInfo: DatabaseDesignerPipelineExecutor.buildAdditionalSchemaInfo(normalized),
                        SkipGitCommit: options.SkipGitCommit ?? false,
                        SkipRestart: options.SkipRestart ?? false,
                    },
                });
            }
        }

        return results;
    }

    /**
     * Resolve the entity ID and name for a table after a successful migration.
     * Tries the in-memory metadata cache first, then falls back to a DB query
     * if the cache hasn't caught up (e.g. Refresh() failed or lagged).
     */
    private static async resolveEntityAfterMigration(
        tableDefinition: TableDefinition,
        md: Metadata,
        contextUser: UserInfo
    ): Promise<{ entityID?: string; entityName?: string; warnings: string[] }> {
        const warnings: string[] = [];

        const cached = md.Entities.find(
            e =>
                e.BaseTable.toLowerCase() === tableDefinition.TableName.toLowerCase() &&
                e.SchemaName?.toLowerCase() === tableDefinition.SchemaName.toLowerCase()
        );

        if (cached) {
            return { entityID: cached.ID, entityName: cached.Name, warnings };
        }

        // Cache miss — Refresh may have failed or CodeGen hasn't run yet
        const rv = new RunView();
        const dbResult = await rv.RunView<{ ID: string; Name: string }>({
            EntityName: 'MJ: Entities',
            ExtraFilter: (
                `BaseTable = '${escapeSqlLiteral(tableDefinition.TableName)}' ` +
                `AND SchemaName = '${escapeSqlLiteral(tableDefinition.SchemaName)}'`
            ),
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
        }, contextUser);

        if (dbResult.Success && dbResult.Results.length > 0) {
            warnings.push(
                `Entity found in DB but not in metadata cache — metadata may be stale until MJAPI restarts.`
            );
            return { entityID: dbResult.Results[0].ID, entityName: dbResult.Results[0].Name, warnings };
        }

        return { warnings };
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Build the AdditionalSchemaInfo JSON string for soft FKs in a TableDefinition.
     * Returns undefined when there are no soft FKs, so the caller can omit the field.
     */
    private static buildAdditionalSchemaInfo(tableDefinition: TableDefinition): string | undefined {
        const softFKs = (tableDefinition.ForeignKeys ?? []).filter(fk => fk.IsSoft);
        if (softFKs.length === 0) return undefined;

        const entries: SoftFKEntry[] = softFKs.map(fk => ({
            SchemaName: tableDefinition.SchemaName,
            TableName: tableDefinition.TableName,
            FieldName: fk.ColumnName,
            TargetSchemaName: fk.ReferencedSchema,
            TargetTableName: fk.ReferencedTable,
            TargetFieldName: fk.ReferencedColumn ?? 'ID',
        }));

        const emitter = new SoftFKConfigEmitter();
        const merged = emitter.MergeSchemaConfig({}, entries);
        return JSON.stringify(merged);
    }

    /**
     * Normalize LLM-generated ForeignKey entries to match ForeignKeyDefinition exactly.
     *
     * LLMs occasionally output `Column` instead of `ColumnName` and omit `ReferencedColumn`.
     * Both field-name variants are accepted here so that minor prompt drift doesn't
     * cause SQL generation to embed literal "undefined" strings in constraint names.
     */
    private static normalizeForeignKeys(tableDefinition: TableDefinition): TableDefinition {
        if (!tableDefinition.ForeignKeys?.length) return tableDefinition;
        return {
            ...tableDefinition,
            ForeignKeys: tableDefinition.ForeignKeys.map(fk => {
                const raw = fk as unknown as Record<string, unknown>;
                return {
                    ...fk,
                    ColumnName: fk.ColumnName ?? (raw['Column'] as string | undefined) ?? fk.ColumnName,
                    ReferencedColumn: fk.ReferencedColumn ?? 'ID',
                };
            }),
        };
    }

    /**
     * Inject the standard MJ primary-key column (`ID`) so that CodeGen can
     * register the entity after the migration runs.
     *
     * WHY: the Schema Designer template correctly tells the LLM to omit `ID`
     * (CodeGen auto-adds it for __mj core entities). But for __mj_UDT user
     * tables, CodeGen's spGetPrimaryKeyForTable requires a physical PRIMARY KEY
     * constraint to register an entity. Without it CodeGen skips the table with
     * "No primary key found". __mj_CreatedAt/__mj_UpdatedAt are handled by
     * CodeGen's ensureCreatedAtUpdatedAtFieldsExist — it ALTERs the table to
     * add them once the entity is registered; they do NOT need to be here.
     */
    private static injectStandardMJColumns(tableDefinition: TableDefinition): TableDefinition {
        return {
            ...tableDefinition,
            AdditionalColumns: [
                ...(tableDefinition.AdditionalColumns ?? []),
                {
                    Name: 'ID',
                    Type: 'uuid' as const,
                    RawSqlType: 'UNIQUEIDENTIFIER',
                    IsNullable: false,
                    DefaultValue: 'NEWSEQUENTIALID()',
                    Description: 'Unique identifier for this record.',
                },
            ],
            PrimaryKeyColumns: ['ID'],
        };
    }

    /**
     * Delegate to SchemaEngine to produce CREATE TABLE SQL + affected-table metadata.
     * The FileName field in the returned MigrationOutput is discarded — RuntimeSchemaManager
     * generates its own filename (V{timestamp}__RSU_{tables}.sql) when writing to disk.
     */
    private static generateCreateMigration(tableDefinition: TableDefinition) {
        const engine = new SchemaEngine();
        // mjVersion only affects the discarded FileName; pass empty string.
        return engine.GenerateMigration(
            DatabaseDesignerPipelineExecutor.injectStandardMJColumns(tableDefinition),
            TARGET_PLATFORM,
            ''
        );
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
            AdditionalSchemaInfo: DatabaseDesignerPipelineExecutor.buildAdditionalSchemaInfo(tableDefinition),
            SkipGitCommit: options.SkipGitCommit ?? false,
            SkipRestart: options.SkipRestart ?? false,
        };

        const result = await RuntimeSchemaManager.Instance.RunPipeline(input);

        if (!result.Success) {
            return {
                Success: false,
                ErrorMessage: result.ErrorMessage ?? 'RSU pipeline failed',
                PipelineSteps: DatabaseDesignerPipelineExecutor.mapPipelineSteps(result.Steps ?? []),
            };
        }

        const steps = DatabaseDesignerPipelineExecutor.mapPipelineSteps(result.Steps ?? []);
        const warnings: string[] = [];

        // Refresh metadata so the newly created entity is immediately visible.
        // A refresh failure is non-fatal — the entity exists in the DB; it will
        // appear after the next server restart or explicit refresh.
        const md = new Metadata(); // global-provider-ok: MJAPI server-side, single-provider deployment
        try {
            await md.Refresh();
        } catch (refreshErr) {
            const msg = `Metadata refresh failed after successful pipeline: ${String(refreshErr)}. ` +
                `The entity was created but may not be visible until MJAPI restarts.`;
            LogError(`DatabaseDesignerPipelineExecutor: ${msg}`);
            warnings.push(msg);
        }

        // Try in-memory cache first (fast path after successful Refresh).
        const cachedInfo = md.Entities.find(
            e =>
                e.BaseTable.toLowerCase() === tableDefinition.TableName.toLowerCase() &&
                e.SchemaName?.toLowerCase() === tableDefinition.SchemaName.toLowerCase()
        );

        let entityID: string | undefined = cachedInfo?.ID;
        let entityName: string | undefined = cachedInfo?.Name;

        if (!entityID) {
            // Cache missed — Refresh may have failed or CodeGen registered the entity
            // after the cache snapshot. Fall back to a direct DB query so provenance
            // is always saved regardless of in-memory state.
            const rv = new RunView();
            const dbResult = await rv.RunView<{ ID: string; Name: string }>({
                EntityName: 'MJ: Entities',
                ExtraFilter: (
                    `BaseTable = '${escapeSqlLiteral(tableDefinition.TableName)}' ` +
                    `AND SchemaName = '${escapeSqlLiteral(tableDefinition.SchemaName)}'`
                ),
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
            }, contextUser);

            if (dbResult.Success && dbResult.Results.length > 0) {
                entityID = dbResult.Results[0].ID;
                entityName = dbResult.Results[0].Name;
                warnings.push(
                    `Entity found in DB but not in metadata cache — metadata may be stale until MJAPI restarts.`
                );
            }
        }

        // Persist provenance so the Modify and security layers can later
        // determine ownership and origin. Only skipped if the entity doesn't
        // exist in the DB yet (CodeGen hasn't run — extremely rare).
        if (entityID) {
            await DatabaseDesignerPipelineExecutor.saveProvenance(
                entityID,
                contextUser,
                options.Source ?? UDT_SETTINGS.SOURCE_DATABASE_DESIGNER
            );
        }

        return {
            Success: true,
            EntityID: entityID,
            EntityName: entityName ?? tableDefinition.EntityName,
            SchemaName: tableDefinition.SchemaName,
            TableName: tableDefinition.TableName,
            PipelineSteps: steps,
            Warnings: warnings.length > 0 ? warnings : undefined,
        };
    }

    /**
     * Write MJ: Entity Settings records that track who created the entity and
     * via which subsystem (DatabaseDesigner vs AgentManager).
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

        const md = new Metadata(); // global-provider-ok: MJAPI server-side, single-provider deployment
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
                setting.Comments = `Auto-set by Database Designer Agent at ${new Date().toISOString()}`;
                const saved = await setting.Save();
                if (!saved) {
                    LogError(
                        `DatabaseDesignerPipelineExecutor: failed to save setting '${entry.name}' for entity ${entityID}: ` +
                        `${setting.LatestResult?.CompleteMessage ?? 'unknown error'}`
                    );
                }
            } catch (err) {
                LogError(`DatabaseDesignerPipelineExecutor: error saving setting '${entry.name}': ${String(err)}`);
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
