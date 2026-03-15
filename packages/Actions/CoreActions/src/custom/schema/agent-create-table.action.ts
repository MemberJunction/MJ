/**
 * Agent-Driven Table Creation Action
 *
 * Wraps CreateDatabaseTableAction with natural-language input parsing.
 * Agents provide a structured description and this action converts it
 * to a UserTableDefinition for the UDT pipeline.
 *
 * Input parameters:
 *   - TableDescription (string): Structured table description
 *     Format: "Table: <name>\nDescription: <desc>\nColumns:\n- <name> (<type>[, maxlen]) [required] [default:'<val>']"
 *   - Preview (boolean, optional): Dry-run mode. Default: false.
 *
 * Output parameters:
 *   - SqlTableName, EntityName, MigrationSQL (from pipeline)
 */
import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import {
    UserTablePipeline,
    ValidateUserTableDefinition,
    type UserTableDefinition,
    type UserColumnDefinition,
    type SchemaFieldType,
} from "@memberjunction/schema-engine";

const VALID_TYPES = new Set<string>([
    'string', 'text', 'integer', 'bigint', 'decimal',
    'boolean', 'datetime', 'date', 'uuid', 'json', 'float', 'time',
]);

// ─── Parameter Helpers ──────────────────────────────────────────────

function getStringParam(params: RunActionParams, name: string): string | undefined {
    const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
    if (!param || param.Value === undefined || param.Value === null) return undefined;
    const value = String(param.Value).trim();
    return value.length > 0 ? value : undefined;
}

function getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
    const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
    if (!param || param.Value === undefined || param.Value === null) return defaultValue;
    const value = String(param.Value).trim().toLowerCase();
    if (value === "true" || value === "1" || value === "yes") return true;
    if (value === "false" || value === "0" || value === "no") return false;
    return defaultValue;
}

// ─── Text Parsing ───────────────────────────────────────────────────

/**
 * Parse a structured text description into a UserTableDefinition.
 *
 * Expected format:
 * ```
 * Table: Project Milestones
 * Description: Tracks project milestones and deadlines
 * Columns:
 * - Name (string, 200) required
 * - DueDate (date)
 * - Status (string, 50) required default:'Pending'
 * - Priority (integer)
 * - Notes (text)
 * ```
 */
function ParseTableDescription(input: string): UserTableDefinition | null {
    const lines = input.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let displayName = '';
    let description: string | undefined;
    const columns: UserColumnDefinition[] = [];
    let inColumns = false;

    for (const line of lines) {
        const lowerLine = line.toLowerCase();

        if (lowerLine.startsWith('table:')) {
            displayName = line.substring(6).trim();
            inColumns = false;
        } else if (lowerLine.startsWith('description:')) {
            description = line.substring(12).trim();
            inColumns = false;
        } else if (lowerLine.startsWith('columns:')) {
            inColumns = true;
        } else if (inColumns && line.startsWith('-')) {
            const col = ParseColumnLine(line.substring(1).trim());
            if (col) columns.push(col);
        }
    }

    if (!displayName || columns.length === 0) return null;

    return { DisplayName: displayName, Description: description, Columns: columns };
}

/**
 * Parse a single column line like:
 *   "Name (string, 200) required default:'Pending'"
 */
function ParseColumnLine(line: string): UserColumnDefinition | null {
    const match = line.match(/^(\w+)\s*\(([^)]+)\)\s*(.*)?$/);
    if (!match) {
        // Simple format: "Name type"
        const parts = line.split(/\s+/);
        if (parts.length >= 1) {
            const name = parts[0];
            const type = parts.length > 1 && VALID_TYPES.has(parts[1].toLowerCase())
                ? parts[1].toLowerCase()
                : 'string';
            return {
                Name: name,
                Type: type as SchemaFieldType,
                AllowEmpty: !line.toLowerCase().includes('required'),
            };
        }
        return null;
    }

    const name = match[1];
    const typeInfo = match[2].split(',').map(s => s.trim());
    const flags = match[3]?.toLowerCase() ?? '';

    const rawType = typeInfo[0].toLowerCase();
    const type: SchemaFieldType = VALID_TYPES.has(rawType) ? rawType as SchemaFieldType : 'string';
    const maxLength = typeInfo.length > 1 ? parseInt(typeInfo[1], 10) : undefined;

    let defaultValue: string | undefined;
    const defaultMatch = flags.match(/default:\s*'([^']+)'/);
    if (defaultMatch) {
        defaultValue = defaultMatch[1];
    }

    return {
        Name: name,
        Type: type,
        MaxLength: !isNaN(maxLength ?? NaN) ? maxLength : undefined,
        AllowEmpty: !flags.includes('required'),
        DefaultValue: defaultValue,
    };
}

// ─── Action ─────────────────────────────────────────────────────────

@RegisterClass(BaseAction, "__AgentCreateTable")
export class AgentCreateTableAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const tableDescription = getStringParam(params, 'tabledescription');
            if (!tableDescription) {
                return {
                    Success: false,
                    ResultCode: "MISSING_PARAMETER",
                    Message: "Parameter 'TableDescription' is required. Use format:\nTable: Name\nDescription: ...\nColumns:\n- ColName (type, maxlen) required",
                };
            }

            const isPreview = getBooleanParam(params, 'preview', false);

            const definition = ParseTableDescription(tableDescription);
            if (!definition) {
                return {
                    Success: false,
                    ResultCode: "PARSE_FAILED",
                    Message: "Could not parse table description. Use format:\nTable: Name\nDescription: ...\nColumns:\n- ColName (type, maxlen) required",
                };
            }

            const validation = ValidateUserTableDefinition(definition);
            if (!validation.Valid) {
                return {
                    Success: false,
                    ResultCode: "VALIDATION_FAILED",
                    Message: `Validation errors: ${validation.Errors.join('; ')}`,
                };
            }

            const pipeline = new UserTablePipeline(0);

            if (isPreview) {
                const preview = pipeline.Preview(definition);
                params.Params.push(
                    { Name: 'SqlTableName', Type: 'Output', Value: preview.SqlTableName },
                    { Name: 'EntityName', Type: 'Output', Value: preview.EntityName },
                    { Name: 'MigrationSQL', Type: 'Output', Value: preview.MigrationSQL },
                );

                return {
                    Success: preview.Valid,
                    ResultCode: preview.Valid ? "PREVIEW_SUCCESS" : "VALIDATION_FAILED",
                    Message: preview.Valid
                        ? JSON.stringify({ SqlTableName: preview.SqlTableName, EntityName: preview.EntityName })
                        : `Errors: ${preview.ValidationErrors.join('; ')}`,
                    Params: params.Params,
                };
            }

            const result = await pipeline.CreateTable(definition);

            params.Params.push(
                { Name: 'SqlTableName', Type: 'Output', Value: result.SqlTableName ?? '' },
                { Name: 'EntityName', Type: 'Output', Value: result.EntityName ?? '' },
            );

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
                Message: JSON.stringify({ SqlTableName: result.SqlTableName, EntityName: result.EntityName }),
                Params: params.Params,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return { Success: false, ResultCode: "UNEXPECTED_ERROR", Message: msg };
        }
    }
}
