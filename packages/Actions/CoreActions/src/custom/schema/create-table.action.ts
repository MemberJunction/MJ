/**
 * Agent-Driven Schema Creation Action
 *
 * Wraps SchemaEngine + RuntimeSchemaManager for agent/workflow use.
 * Allows AI agents to create new database tables as first-class MJ entities
 * through a structured TableDefinition input.
 *
 * Safety rules enforced:
 * - __mj schema is always protected (cannot CREATE/ALTER/DROP)
 * - Rate limiting via RuntimeSchemaManager (one pipeline at a time)
 * - RSU must be enabled (ALLOW_RUNTIME_SCHEMA_UPDATE=1)
 * - SQL validation prevents DDL on protected schemas
 */

import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import {
    SchemaEngine,
    RuntimeSchemaManager,
    UserTablePipeline,
    ValidateUserTableDefinition,
    type TableDefinition,
    type DatabasePlatform,
    type SchemaFieldType,
    type RSUPipelineInput,
    type UserTableDefinition,
    type UserColumnDefinition,
} from "@memberjunction/schema-engine";

// ─── Parameter Extraction Helpers ────────────────────────────────────

function getStringParam(params: RunActionParams, name: string): string | undefined {
    const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
    if (!param || param.Value === undefined || param.Value === null) return undefined;
    const value = String(param.Value).trim();
    return value.length > 0 ? value : undefined;
}

function getObjectParam(params: RunActionParams, name: string): Record<string, unknown> | undefined {
    const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
    if (!param || param.Value === undefined || param.Value === null) return undefined;
    if (typeof param.Value === 'object' && !Array.isArray(param.Value)) {
        return param.Value as Record<string, unknown>;
    }
    // Try to parse JSON string
    if (typeof param.Value === 'string') {
        try {
            const parsed = JSON.parse(param.Value);
            if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch { /* not JSON */ }
    }
    return undefined;
}

function getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
    const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
    if (!param || param.Value === undefined || param.Value === null) return defaultValue;
    const value = String(param.Value).trim().toLowerCase();
    if (value === "true" || value === "1" || value === "yes") return true;
    if (value === "false" || value === "0" || value === "no") return false;
    return defaultValue;
}

// ─── Create Table Action (Structured Input) ──────────────────────────

/**
 * Action: Create Database Table
 *
 * Creates a new database table and registers it as a full MJ entity via
 * the Runtime Schema Update pipeline.
 *
 * Input parameters:
 *   - TableDefinition (object|JSON): A UserTableDefinition object with:
 *       DisplayName: string — e.g., "Project Milestones"
 *       Description?: string — table description
 *       Columns: Array<{ Name, Type, AllowEmpty?, MaxLength?, DefaultValue?, Description? }>
 *       ForeignKeys?: Array<{ ColumnName, ReferencedSchema, ReferencedTable, ReferencedColumn?, IsSoft? }>
 *       Platform?: 'sqlserver' | 'postgresql' (default: 'sqlserver')
 *   - SkipRestart (boolean, optional): Skip MJAPI restart. Default: false.
 *   - SkipGitCommit (boolean, optional): Skip git commit/push. Default: false.
 *   - Preview (boolean, optional): Dry-run mode — validate and return SQL without executing. Default: false.
 *
 * Output parameters:
 *   - SqlTableName: Full qualified table name (e.g., "custom.UD_ProjectMilestones")
 *   - EntityName: MJ entity name (e.g., "User: Project Milestones")
 *   - MigrationSQL: The generated SQL (always set, even in preview mode)
 *   - PipelineSteps: JSON array of pipeline step results (when executed)
 */
@RegisterClass(BaseAction, "__CreateDatabaseTable")
export class CreateDatabaseTableAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const tableDef = this.ExtractTableDefinition(params);
            if (!tableDef) {
                return {
                    Success: false,
                    ResultCode: "MISSING_PARAMETER",
                    Message: "Parameter 'TableDefinition' is required. Provide a UserTableDefinition object or JSON string.",
                };
            }

            const isPreview = getBooleanParam(params, 'preview', false);
            const skipRestart = getBooleanParam(params, 'skiprestart', false);
            const skipGitCommit = getBooleanParam(params, 'skipgitcommit', false);

            // Apply options
            tableDef.SkipRestart = skipRestart;
            tableDef.SkipGitCommit = skipGitCommit;

            const pipeline = new UserTablePipeline(0); // Action handles its own rate limiting via RSU mutex

            // Preview mode: validate and return SQL
            if (isPreview) {
                const preview = pipeline.Preview(tableDef);

                params.Params.push(
                    { Name: 'SqlTableName', Type: 'Output', Value: preview.SqlTableName },
                    { Name: 'EntityName', Type: 'Output', Value: preview.EntityName },
                    { Name: 'MigrationSQL', Type: 'Output', Value: preview.MigrationSQL },
                );

                if (!preview.Valid) {
                    return {
                        Success: false,
                        ResultCode: "VALIDATION_FAILED",
                        Message: `Validation errors: ${preview.ValidationErrors.join('; ')}`,
                        Params: params.Params,
                    };
                }

                return {
                    Success: true,
                    ResultCode: "PREVIEW_SUCCESS",
                    Message: JSON.stringify({
                        SqlTableName: preview.SqlTableName,
                        EntityName: preview.EntityName,
                        MigrationSQL: preview.MigrationSQL,
                    }),
                    Params: params.Params,
                };
            }

            // Execute the full pipeline
            const result = await pipeline.CreateTable(tableDef);

            // Set output parameters
            params.Params.push(
                { Name: 'SqlTableName', Type: 'Output', Value: result.SqlTableName ?? '' },
                { Name: 'EntityName', Type: 'Output', Value: result.EntityName ?? '' },
            );

            if (result.PipelineResult) {
                params.Params.push(
                    { Name: 'PipelineSteps', Type: 'Output', Value: JSON.stringify(result.PipelineResult.Steps) },
                );
                if (result.PipelineResult.MigrationFilePath) {
                    params.Params.push(
                        { Name: 'MigrationSQL', Type: 'Output', Value: result.PipelineResult.MigrationFilePath },
                    );
                }
            }

            if (result.ValidationErrors && result.ValidationErrors.length > 0) {
                return {
                    Success: false,
                    ResultCode: "VALIDATION_FAILED",
                    Message: `Validation errors: ${result.ValidationErrors.join('; ')}`,
                    Params: params.Params,
                };
            }

            if (!result.Success) {
                return {
                    Success: false,
                    ResultCode: "PIPELINE_FAILED",
                    Message: result.ErrorMessage ?? 'Pipeline failed',
                    Params: params.Params,
                };
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    SqlTableName: result.SqlTableName,
                    EntityName: result.EntityName,
                    APIRestarted: result.PipelineResult?.APIRestarted ?? false,
                    GitCommitSuccess: result.PipelineResult?.GitCommitSuccess ?? false,
                }),
                Params: params.Params,
            };

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                ResultCode: "UNEXPECTED_ERROR",
                Message: msg,
            };
        }
    }

    /**
     * Extract UserTableDefinition from action parameters.
     * Accepts either a structured object or a JSON string.
     */
    private ExtractTableDefinition(params: RunActionParams): UserTableDefinition | null {
        const rawObj = getObjectParam(params, 'tabledefinition');
        if (rawObj) {
            return this.ParseUserTableDefinition(rawObj);
        }

        // Try as JSON string
        const rawStr = getStringParam(params, 'tabledefinition');
        if (rawStr) {
            try {
                const parsed = JSON.parse(rawStr);
                return this.ParseUserTableDefinition(parsed);
            } catch {
                return null;
            }
        }

        return null;
    }

    /**
     * Parse and normalize a raw object into a UserTableDefinition.
     */
    private ParseUserTableDefinition(raw: Record<string, unknown>): UserTableDefinition {
        const columns: UserColumnDefinition[] = [];
        const rawCols = Array.isArray(raw['Columns']) ? raw['Columns'] : [];
        for (const col of rawCols) {
            if (typeof col === 'object' && col !== null) {
                const c = col as Record<string, unknown>;
                columns.push({
                    Name: String(c['Name'] ?? ''),
                    Type: (String(c['Type'] ?? 'string')) as SchemaFieldType,
                    AllowEmpty: c['AllowEmpty'] !== false,
                    MaxLength: typeof c['MaxLength'] === 'number' ? c['MaxLength'] : undefined,
                    Precision: typeof c['Precision'] === 'number' ? c['Precision'] : undefined,
                    Scale: typeof c['Scale'] === 'number' ? c['Scale'] : undefined,
                    DefaultValue: typeof c['DefaultValue'] === 'string' ? c['DefaultValue'] : undefined,
                    Description: typeof c['Description'] === 'string' ? c['Description'] : undefined,
                });
            }
        }

        return {
            DisplayName: String(raw['DisplayName'] ?? ''),
            Description: typeof raw['Description'] === 'string' ? raw['Description'] : undefined,
            Columns: columns,
            Platform: (raw['Platform'] === 'postgresql' ? 'postgresql' : 'sqlserver') as DatabasePlatform,
        };
    }
}

/**
 * Action: Preview Table Creation
 *
 * Convenience action that always runs in preview mode — validates the
 * table definition and returns the generated SQL without executing.
 *
 * Input parameters:
 *   - TableDefinition (object|JSON): Same as CreateDatabaseTable
 *
 * Output parameters:
 *   - SqlTableName, EntityName, MigrationSQL, ValidationErrors
 */
@RegisterClass(BaseAction, "__PreviewDatabaseTable")
export class PreviewDatabaseTableAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // Force preview mode
        const existingPreview = params.Params.find(p => p.Name.trim().toLowerCase() === 'preview');
        if (existingPreview) {
            existingPreview.Value = true;
        } else {
            params.Params.push({ Name: 'Preview', Type: 'Input', Value: true });
        }

        // Delegate to CreateDatabaseTableAction
        const action = new CreateDatabaseTableAction();
        return action.Run(params);
    }
}
