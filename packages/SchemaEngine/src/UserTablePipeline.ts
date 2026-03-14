/**
 * UserTablePipeline — Enables users and agents to create "User Defined Tables"
 * that become first-class MJ entities with full CRUD, permissions, and CodeGen support.
 *
 * Naming conventions:
 *   - SQL Table: `custom.UD_{TableName}` (e.g., `custom.UD_ProjectMilestones`)
 *   - MJ Entity: `User: {DisplayName}` (e.g., `User: Project Milestones`)
 *
 * The pipeline:
 *   1. Validates the user-defined table definition
 *   2. Converts it to a generic TableDefinition
 *   3. Uses SchemaEngine to generate migration SQL
 *   4. Feeds the migration into RuntimeSchemaManager.RunPipeline()
 *
 * Rate limiting: max 1 table creation per minute (configurable via env var).
 */

import { SchemaEngine } from './SchemaEngine.js';
import { RuntimeSchemaManager, RSUError } from './RuntimeSchemaManager.js';
import type { RSUPipelineInput, RSUPipelineResult } from './RuntimeSchemaManager.js';
import type {
    TableDefinition,
    ColumnDefinition,
    SchemaFieldType,
    DatabasePlatform,
    ForeignKeyDefinition,
    ValidationResult,
} from './interfaces.js';

// ─── UDT Input Types ─────────────────────────────────────────────────

/**
 * User-friendly column definition for UDT creation.
 * Abstracts away SQL-specific details — users specify logical types.
 */
export interface UserColumnDefinition {
    /** Column display name (e.g., "Due Date", "Status"). Converted to PascalCase SQL name. */
    Name: string;

    /** Logical data type — maps to platform-specific SQL types via SchemaEngine. */
    Type: SchemaFieldType;

    /** Whether the column allows empty values. Default: true. */
    AllowEmpty?: boolean;

    /** Max length for string columns. Default: 255. */
    MaxLength?: number;

    /** Precision for decimal columns. Default: 18. */
    Precision?: number;

    /** Scale for decimal columns. Default: 2. */
    Scale?: number;

    /** Optional default value expression (e.g., "'Active'", "GETUTCDATE()"). */
    DefaultValue?: string;

    /** Human-readable description. */
    Description?: string;
}

/**
 * Input for creating a User Defined Table.
 */
export interface UserTableDefinition {
    /** Display name (e.g., "Project Milestones"). Used to derive SQL table name and entity name. */
    DisplayName: string;

    /** Human-readable description of the table's purpose. */
    Description?: string;

    /** Column definitions. */
    Columns: UserColumnDefinition[];

    /** Optional: foreign key references to existing entities. */
    ForeignKeys?: UserForeignKeyDefinition[];

    /** Target database platform. Default: 'sqlserver'. */
    Platform?: DatabasePlatform;

    /** If true, skip MJAPI restart. Default: false. */
    SkipRestart?: boolean;

    /** If true, skip git commit/push. Default: false. */
    SkipGitCommit?: boolean;
}

/**
 * User-friendly foreign key definition.
 */
export interface UserForeignKeyDefinition {
    /** Column name in this table that holds the foreign key. */
    ColumnName: string;

    /** Schema of the referenced table (e.g., "__mj", "custom"). */
    ReferencedSchema: string;

    /** Referenced table name. */
    ReferencedTable: string;

    /** Referenced column (usually "ID"). Default: "ID". */
    ReferencedColumn?: string;

    /** Whether this is a soft FK (metadata only) or hard DB constraint. Default: true (soft). */
    IsSoft?: boolean;
}

/**
 * Result of a UDT pipeline execution.
 */
export interface UserTablePipelineResult {
    /** Whether the pipeline completed successfully. */
    Success: boolean;

    /** The generated SQL table name (e.g., "custom.UD_ProjectMilestones"). */
    SqlTableName?: string;

    /** The MJ entity name (e.g., "User: Project Milestones"). */
    EntityName?: string;

    /** Full RSU pipeline result with step details. */
    PipelineResult?: RSUPipelineResult;

    /** Validation errors if the definition was invalid. */
    ValidationErrors?: string[];

    /** Error message if the pipeline failed. */
    ErrorMessage?: string;
}

// ─── UDT Validation ──────────────────────────────────────────────────

/** Maximum columns allowed per UDT. */
const MAX_COLUMNS_PER_TABLE = 50;

/** Reserved table name prefixes that users cannot use. */
const RESERVED_PREFIXES = ['__mj', 'sys', 'mj_'];

/** Reserved column names that conflict with MJ internals. */
const RESERVED_COLUMN_NAMES = new Set([
    'id', '__mj_createdat', '__mj_updatedat',
    '__mj_integration_syncstatus', '__mj_integration_lastsyncedat',
]);

/**
 * Validate a UserTableDefinition before pipeline execution.
 */
export function ValidateUserTableDefinition(def: UserTableDefinition): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // DisplayName validation
    if (!def.DisplayName || def.DisplayName.trim().length === 0) {
        errors.push('DisplayName is required');
    } else if (def.DisplayName.length > 100) {
        errors.push('DisplayName must be 100 characters or fewer');
    } else if (!/^[A-Za-z]/.test(def.DisplayName)) {
        errors.push('DisplayName must start with a letter');
    }

    // Check reserved prefixes
    const lowerName = (def.DisplayName ?? '').toLowerCase();
    for (const prefix of RESERVED_PREFIXES) {
        if (lowerName.startsWith(prefix)) {
            errors.push(`DisplayName cannot start with reserved prefix "${prefix}"`);
        }
    }

    // Columns validation
    if (!def.Columns || def.Columns.length === 0) {
        errors.push('At least one column is required');
    } else if (def.Columns.length > MAX_COLUMNS_PER_TABLE) {
        errors.push(`Maximum ${MAX_COLUMNS_PER_TABLE} columns allowed per table (got ${def.Columns.length})`);
    }

    // Check individual columns
    const columnNames = new Set<string>();
    for (const col of def.Columns ?? []) {
        if (!col.Name || col.Name.trim().length === 0) {
            errors.push('Column name cannot be empty');
            continue;
        }

        const sqlName = DisplayNameToSqlName(col.Name);
        const lowerCol = sqlName.toLowerCase();

        if (RESERVED_COLUMN_NAMES.has(lowerCol)) {
            errors.push(`Column name "${col.Name}" is reserved by MemberJunction`);
        }

        if (columnNames.has(lowerCol)) {
            errors.push(`Duplicate column name: "${col.Name}"`);
        }
        columnNames.add(lowerCol);

        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sqlName)) {
            errors.push(`Column name "${col.Name}" produces invalid SQL identifier "${sqlName}"`);
        }
    }

    // FK validation
    for (const fk of def.ForeignKeys ?? []) {
        if (!fk.ColumnName) {
            errors.push('ForeignKey ColumnName is required');
        }
        if (!fk.ReferencedTable) {
            errors.push('ForeignKey ReferencedTable is required');
        }
    }

    return { Valid: errors.length === 0, Errors: errors, Warnings: warnings };
}

// ─── Name Conversion Helpers ─────────────────────────────────────────

/**
 * Convert a display name to a SQL-safe PascalCase identifier.
 * "Project Milestones" → "ProjectMilestones"
 * "due date" → "DueDate"
 */
export function DisplayNameToSqlName(displayName: string): string {
    return displayName
        .split(/[\s_-]+/)
        .filter(w => w.length > 0)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

/**
 * Generate the SQL table name from a display name.
 * "Project Milestones" → "UD_ProjectMilestones"
 */
export function GenerateUDTTableName(displayName: string): string {
    return `UD_${DisplayNameToSqlName(displayName)}`;
}

/**
 * Generate the MJ entity name from a display name.
 * "Project Milestones" → "User: Project Milestones"
 */
export function GenerateUDTEntityName(displayName: string): string {
    return `User: ${displayName.trim()}`;
}

// ─── UserTablePipeline ───────────────────────────────────────────────

/**
 * Pipeline for creating User Defined Tables as first-class MJ entities.
 *
 * Usage:
 *   const pipeline = new UserTablePipeline();
 *   const result = await pipeline.CreateTable({
 *       DisplayName: 'Project Milestones',
 *       Description: 'Track project milestones and deadlines',
 *       Columns: [
 *           { Name: 'Name', Type: 'string', MaxLength: 200 },
 *           { Name: 'Due Date', Type: 'datetime', AllowEmpty: true },
 *           { Name: 'Status', Type: 'string', MaxLength: 50, DefaultValue: "'Pending'" },
 *       ],
 *   });
 */
export class UserTablePipeline {
    private readonly Engine = new SchemaEngine();
    private _lastCreateTime: number = 0;

    /** UDT schema name — all user tables go in the "custom" schema. */
    public static readonly UDT_SCHEMA = 'custom';

    /** Rate limit interval in milliseconds. Default: 60_000 (1 minute). */
    public readonly RateLimitMs: number;

    constructor(rateLimitMs?: number) {
        const envRate = process.env.RSU_UDT_RATE_LIMIT_MS;
        this.RateLimitMs = rateLimitMs ?? (envRate ? parseInt(envRate, 10) : 60_000);
    }

    /**
     * Create a User Defined Table and run it through the full RSU pipeline.
     *
     * @param def — User-friendly table definition
     * @returns Result including generated SQL names, entity name, and pipeline status
     */
    public async CreateTable(def: UserTableDefinition): Promise<UserTablePipelineResult> {
        // Step 1: Validate definition
        const validation = ValidateUserTableDefinition(def);
        if (!validation.Valid) {
            return {
                Success: false,
                ValidationErrors: validation.Errors,
                ErrorMessage: `Validation failed: ${validation.Errors.join('; ')}`,
            };
        }

        // Step 2: Rate limiting
        const now = Date.now();
        const elapsed = now - this._lastCreateTime;
        if (this._lastCreateTime > 0 && elapsed < this.RateLimitMs) {
            const waitSec = Math.ceil((this.RateLimitMs - elapsed) / 1000);
            return {
                Success: false,
                ErrorMessage: `Rate limited: please wait ${waitSec} more seconds before creating another table`,
            };
        }

        // Step 3: Convert to TableDefinition
        const platform = def.Platform ?? 'sqlserver';
        const tableName = GenerateUDTTableName(def.DisplayName);
        const entityName = GenerateUDTEntityName(def.DisplayName);
        const fullTableName = `${UserTablePipeline.UDT_SCHEMA}.${tableName}`;

        const tableDef = this.ConvertToTableDefinition(def, tableName, entityName, platform);

        // Step 4: Generate migration SQL via SchemaEngine
        const mjVersion = process.env.MJ_VERSION ?? '5.11.0';
        const migration = this.Engine.GenerateMigration(tableDef, platform, mjVersion, process.env.RSU_MIGRATIONS_PATH ?? 'migrations/v5', 'UDT');

        // Step 5: Build RSU pipeline input
        const rsuInput: RSUPipelineInput = {
            MigrationSQL: migration.SQL,
            Description: `User Defined Table: ${def.DisplayName}`,
            AffectedTables: [fullTableName],
            SkipGitCommit: def.SkipGitCommit,
            SkipRestart: def.SkipRestart,
        };

        // Step 6: Execute RSU pipeline
        const rsm = RuntimeSchemaManager.Instance;
        if (!rsm.IsEnabled) {
            return {
                Success: false,
                SqlTableName: fullTableName,
                EntityName: entityName,
                ErrorMessage: 'Runtime Schema Update is disabled. Set ALLOW_RUNTIME_SCHEMA_UPDATE=1 to enable.',
            };
        }

        const pipelineResult = await rsm.RunPipeline(rsuInput);

        // Update rate limit timestamp on success
        if (pipelineResult.Success) {
            this._lastCreateTime = Date.now();
        }

        return {
            Success: pipelineResult.Success,
            SqlTableName: fullTableName,
            EntityName: entityName,
            PipelineResult: pipelineResult,
            ErrorMessage: pipelineResult.ErrorMessage,
        };
    }

    /**
     * Preview what a UDT creation would produce without executing.
     */
    public Preview(def: UserTableDefinition): {
        Valid: boolean;
        ValidationErrors: string[];
        SqlTableName: string;
        EntityName: string;
        MigrationSQL: string;
    } {
        const validation = ValidateUserTableDefinition(def);
        const platform = def.Platform ?? 'sqlserver';
        const tableName = GenerateUDTTableName(def.DisplayName);
        const entityName = GenerateUDTEntityName(def.DisplayName);
        const fullTableName = `${UserTablePipeline.UDT_SCHEMA}.${tableName}`;

        if (!validation.Valid) {
            return {
                Valid: false,
                ValidationErrors: validation.Errors,
                SqlTableName: fullTableName,
                EntityName: entityName,
                MigrationSQL: '',
            };
        }

        const tableDef = this.ConvertToTableDefinition(def, tableName, entityName, platform);
        const mjVersion = process.env.MJ_VERSION ?? '5.11.0';
        const migration = this.Engine.GenerateMigration(tableDef, platform, mjVersion, process.env.RSU_MIGRATIONS_PATH ?? 'migrations/v5', 'UDT');

        return {
            Valid: true,
            ValidationErrors: [],
            SqlTableName: fullTableName,
            EntityName: entityName,
            MigrationSQL: migration.SQL,
        };
    }

    // ─── Internal Helpers ─────────────────────────────────────────────

    /**
     * Convert a UserTableDefinition to a generic TableDefinition for SchemaEngine.
     */
    private ConvertToTableDefinition(
        def: UserTableDefinition,
        tableName: string,
        entityName: string,
        platform: DatabasePlatform
    ): TableDefinition {
        const columns: ColumnDefinition[] = def.Columns.map(col => ({
            Name: DisplayNameToSqlName(col.Name),
            Type: col.Type,
            IsNullable: col.AllowEmpty !== false, // Default: nullable
            MaxLength: col.MaxLength,
            Precision: col.Precision,
            Scale: col.Scale,
            DefaultValue: col.DefaultValue,
            Description: col.Description ?? col.Name,
        }));

        const foreignKeys: ForeignKeyDefinition[] = (def.ForeignKeys ?? []).map(fk => ({
            ColumnName: DisplayNameToSqlName(fk.ColumnName),
            ReferencedSchema: fk.ReferencedSchema,
            ReferencedTable: fk.ReferencedTable,
            ReferencedColumn: fk.ReferencedColumn ?? 'ID',
            IsSoft: fk.IsSoft !== false, // Default: soft FK
        }));

        return {
            SchemaName: UserTablePipeline.UDT_SCHEMA,
            TableName: tableName,
            EntityName: entityName,
            Description: def.Description,
            Columns: columns,
            ForeignKeys: foreignKeys.length > 0 ? foreignKeys : undefined,
        };
    }
}
