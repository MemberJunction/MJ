/**
 * @memberjunction/schema-engine — Shared Interfaces
 *
 * Generic, platform-agnostic types for DDL generation.
 * Any MJ consumer (integrations, AI agents, developers) can use these
 * to describe tables and let SchemaEngine produce platform-correct SQL.
 */

// ─── Database Platform ──────────────────────────────────────────────

/** Supported database platforms for DDL generation. */
export type DatabasePlatform = 'sqlserver' | 'postgresql';

// ─── Generic Column Types ───────────────────────────────────────────

/**
 * Abstract field types understood by SchemaEngine.
 * TypeMapper converts these to platform-specific SQL types.
 */
export type SchemaFieldType =
    | 'string' | 'text' | 'integer' | 'bigint' | 'decimal'
    | 'boolean' | 'datetime' | 'date' | 'uuid' | 'json'
    | 'float' | 'time';

// ─── Table Definition (generic input) ──────────────────────────────

/**
 * Platform-agnostic table definition — the universal input for DDL generation.
 * Any consumer provides this; SchemaEngine produces platform-correct SQL.
 */
export interface TableDefinition {
    /** Target database schema (e.g., "custom", "hubspot", "dbo"). */
    SchemaName: string;

    /** SQL table name (e.g., "UD_ProjectMilestones", "HubSpotContacts"). */
    TableName: string;

    /** MJ entity display name (e.g., "User: Project Milestones"). */
    EntityName: string;

    /** Human-readable description for the table. */
    Description?: string;

    /** Column definitions (in order). */
    Columns: ColumnDefinition[];

    /**
     * Column names that form the soft primary key (UNIQUE constraint only).
     * No DB-level PK is created — the unique constraint serves as the natural key.
     */
    SoftPrimaryKeys?: string[];

    /** Foreign key relationships (soft or hard). */
    ForeignKeys?: ForeignKeyDefinition[];

    /**
     * Additional columns injected by the consumer (e.g., integration sync columns).
     * SchemaEngine appends these after the user-defined Columns.
     */
    AdditionalColumns?: ColumnDefinition[];
}

/** Definition of a single column. */
export interface ColumnDefinition {
    /** Column name. */
    Name: string;

    /**
     * Abstract type — TypeMapper converts to platform SQL type.
     * Alternatively, pass a raw SQL type string via RawSqlType.
     */
    Type: SchemaFieldType;

    /**
     * Optional: override with a raw platform-specific SQL type
     * (e.g., "NVARCHAR(200)", "INT"). When set, Type is ignored.
     */
    RawSqlType?: string;

    /** Whether the column accepts NULL. */
    IsNullable: boolean;

    /** Max length for string types (ignored for non-string types). */
    MaxLength?: number;

    /** Precision for decimal types. */
    Precision?: number;

    /** Scale for decimal types. */
    Scale?: number;

    /** SQL expression for default value (e.g., "'Active'", "GETUTCDATE()"). */
    DefaultValue?: string;

    /** Human-readable description (sp_addextendedproperty in SQL Server, COMMENT ON in Postgres). */
    Description?: string;
}

/** A foreign key relationship definition. */
export interface ForeignKeyDefinition {
    /** Column in this table that holds the FK value. */
    ColumnName: string;

    /** Referenced schema. */
    ReferencedSchema: string;

    /** Referenced table name. */
    ReferencedTable: string;

    /** Referenced column name (typically "ID"). */
    ReferencedColumn: string;

    /**
     * Whether this is a soft FK (metadata-only, no DB constraint)
     * or a hard FK (real REFERENCES constraint).
     */
    IsSoft: boolean;
}

// ─── Schema Evolution ───────────────────────────────────────────────

/** Current state of an existing table in the target database. */
export interface ExistingTableInfo {
    SchemaName: string;
    TableName: string;
    Columns: ExistingColumnInfo[];
}

/** Current state of a single column. */
export interface ExistingColumnInfo {
    Name: string;
    SqlType: string;
    IsNullable: boolean;
    MaxLength: number | null;
    Precision: number | null;
    Scale: number | null;
}

/** Result of comparing desired vs existing table state. */
export interface SchemaDiff {
    /** Columns in desired that are not in existing — need ALTER TABLE ADD. */
    AddedColumns: ColumnDefinition[];
    /** Columns in both with different types/nullability — need ALTER TABLE ALTER. */
    ModifiedColumns: ColumnModification[];
    /** Columns in existing that are not in desired — deprecated (no physical drop). */
    RemovedColumns: string[];
}

/** A single column type/nullability change. */
export interface ColumnModification {
    ColumnName: string;
    OldType: string;
    NewType: string;
    OldNullable: boolean;
    NewNullable: boolean;
}

/** Input for schema evolution: desired state + existing state. */
export interface SchemaEvolutionInput {
    /** The desired table definition. */
    Desired: TableDefinition;
    /** Current state of the table in the database. */
    ExistingTable: ExistingTableInfo;
}

// ─── Type Mapping ───────────────────────────────────────────────────

/** Maps a generic abstract type to platform-specific SQL types. */
export interface TypeMappingEntry {
    /** Abstract type (e.g., "string", "integer"). */
    SourceType: string;
    /** SQL Server type template (e.g., "NVARCHAR"). */
    SqlServerType: string;
    /** PostgreSQL type template (e.g., "VARCHAR"). */
    PostgresType: string;
    /** MJ EntityField.Type value (informational — CodeGen discovers actual type). */
    MJFieldType: string;
}

// ─── Migration Output ───────────────────────────────────────────────

/** Output from SchemaEngine.GenerateMigration(). */
export interface MigrationOutput {
    /** The generated SQL (CREATE TABLE, ALTER TABLE, CREATE SCHEMA, etc.). */
    SQL: string;

    /** Suggested migration file name in Flyway format (relative to repo root). */
    FileName: string;

    /** Fully-qualified table names affected (e.g., ["hubspot.Contacts"]). */
    AffectedTables: string[];

    /** Short human-readable summary for commit messages. */
    Summary: string;
}

/** Metadata embedded in the migration file header comment. */
export interface MigrationMetadata {
    /** Consumer name (e.g., "Integration", "Agent", "Custom"). */
    SourceType: string;
    /** Object being created/modified (e.g., table name). */
    ObjectName: string;
    /** Action description (e.g., "CreateTable", "AlterTable"). */
    Action: string;
    /** Who or what generated this migration. */
    GeneratedBy: string;
    /** ISO timestamp of generation. */
    Timestamp: string;
}

/** A file produced by SchemaEngine (e.g., migration SQL). */
export interface EmittedFile {
    /** Relative path from repo root. */
    FilePath: string;
    /** Full file content. */
    Content: string;
    /** Human-readable description. */
    Description: string;
}

// ─── Validation ─────────────────────────────────────────────────────

/** Result of validating a TableDefinition. */
export interface ValidationResult {
    Valid: boolean;
    Errors: string[];
    Warnings: string[];
}
