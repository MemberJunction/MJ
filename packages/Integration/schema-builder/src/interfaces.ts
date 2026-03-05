/**
 * Integration Schema Builder — Shared Interfaces
 *
 * These interfaces define the contracts between the Schema Builder's components
 * and between connectors and the Schema Builder.
 */

// ─── Database Platform ──────────────────────────────────────────────

/** Supported database platforms for DDL generation. */
export type DatabasePlatform = 'sqlserver' | 'postgresql';

// ─── Source Schema (from engine — canonical definitions) ────────────
// Re-exported from @memberjunction/integration-engine where they are
// defined as part of the connector contract (BaseIntegrationConnector.IntrospectSchema).
import type {
    SourceSchemaInfo as _SourceSchemaInfo,
    SourceObjectInfo as _SourceObjectInfo,
    SourceFieldInfo as _SourceFieldInfo,
    SourceRelationshipInfo as _SourceRelationshipInfo,
} from '@memberjunction/integration-engine';

export type SourceSchemaInfo = _SourceSchemaInfo;
export type SourceObjectInfo = _SourceObjectInfo;
export type SourceFieldInfo = _SourceFieldInfo;
export type SourceRelationshipInfo = _SourceRelationshipInfo;

// ─── Target Configuration (user customizations) ────────────────────

/** User's customization of a target table to be created. */
export interface TargetTableConfig {
    /** Source object this table maps from. */
    SourceObjectName: string;
    /** Target database schema name (e.g., "hubspot", "ym"). */
    SchemaName: string;
    /** Target table name (e.g., "Deal", "Member"). */
    TableName: string;
    /** MJ entity display name (e.g., "HubSpot Deal", "YM Member"). */
    EntityName: string;
    /** Column configurations. */
    Columns: TargetColumnConfig[];
    /** Soft FK relationships to configure. */
    SoftForeignKeys: SoftFKEntry[];
}

/** User's customization of a single column. */
export interface TargetColumnConfig {
    /** Name of the field in the source object. */
    SourceFieldName: string;
    /** Column name in the target table. */
    TargetColumnName: string;
    /** SQL type for the target platform (populated by TypeMapper). */
    TargetSqlType: string;
    /** Whether the column allows NULLs. */
    IsNullable: boolean;
    /** Max length for string columns (null if not applicable). */
    MaxLength: number | null;
    /** Precision for numeric columns (null if not applicable). */
    Precision: number | null;
    /** Scale for numeric columns (null if not applicable). */
    Scale: number | null;
    /** Default value SQL expression (null if none). */
    DefaultValue: string | null;
}

// ─── Soft Foreign Keys ──────────────────────────────────────────────

/** A single soft FK entry for additionalSchemaInfo. */
export interface SoftFKEntry {
    /** Schema containing the table with the FK column. */
    SchemaName: string;
    /** Table containing the FK column. */
    TableName: string;
    /** Column name that references another table. */
    FieldName: string;
    /** Schema of the target (referenced) table. */
    TargetSchemaName: string;
    /** Target (referenced) table name. */
    TargetTableName: string;
    /** Target (referenced) field name (usually "ID"). */
    TargetFieldName: string;
}

// ─── Schema Evolution ───────────────────────────────────────────────

/** Describes the current state of an existing table in the target database. */
export interface ExistingTableInfo {
    SchemaName: string;
    TableName: string;
    Columns: ExistingColumnInfo[];
}

/** Describes an existing column in a target table. */
export interface ExistingColumnInfo {
    Name: string;
    SqlType: string;
    IsNullable: boolean;
    MaxLength: number | null;
    Precision: number | null;
    Scale: number | null;
}

/** Result of diffing source schema against existing table. */
export interface SchemaDiff {
    /** Columns that exist in source but not in target — need ALTER TABLE ADD. */
    AddedColumns: TargetColumnConfig[];
    /** Columns that exist in both but with different types — need ALTER TABLE ALTER. */
    ModifiedColumns: ColumnModification[];
    /** Columns that exist in target but not in source — deprecated (no physical drop). */
    RemovedColumns: string[];
}

/** Describes a column type/nullability change. */
export interface ColumnModification {
    ColumnName: string;
    OldType: string;
    NewType: string;
    OldNullable: boolean;
    NewNullable: boolean;
}

// ─── Type Mapping ───────────────────────────────────────────────────

/** Maps a generic source type to platform-specific SQL types. */
export interface TypeMappingEntry {
    /** Generic source type (e.g., "string", "integer"). */
    SourceType: string;
    /** SQL Server type template (e.g., "NVARCHAR(n)"). */
    SqlServerType: string;
    /** PostgreSQL type template (e.g., "VARCHAR(n)"). */
    PostgresType: string;
    /** MJ EntityField.Type value (informational — CodeGen discovers actual type). */
    MJFieldType: string;
}

// ─── Emitted Files ──────────────────────────────────────────────────

/** A single file produced by the Schema Builder. */
export interface EmittedFile {
    /** Relative path from repo root (e.g., "migrations/v2/V2026...sql"). */
    FilePath: string;
    /** Full file content. */
    Content: string;
    /** Human-readable description of what this file does. */
    Description: string;
}

/** Metadata for a migration file header comment. */
export interface MigrationMetadata {
    /** Source system name (e.g., "HubSpot", "YourMembership"). */
    SourceType: string;
    /** Source object being migrated (e.g., "Deal", "Member"). */
    ObjectName: string;
    /** Action description (e.g., "CreateSchema", "CreateDealTable"). */
    Action: string;
    /** Who/what generated this migration. */
    GeneratedBy: string;
    /** ISO timestamp of generation. */
    Timestamp: string;
}

// ─── Schema Builder Input/Output ────────────────────────────────────

/** Complete input to the SchemaBuilder orchestrator. */
export interface SchemaBuilderInput {
    /** Introspected source schema from connector. */
    SourceSchema: SourceSchemaInfo;
    /** User's customizations for target tables. */
    TargetConfigs: TargetTableConfig[];
    /** Target database platform. */
    Platform: DatabasePlatform;
    /** Current MJ version for migration naming. */
    MJVersion: string;
    /** Source system name (e.g., "HubSpot"). */
    SourceType: string;
    /** Path to existing additionalSchemaInfo JSON file. */
    AdditionalSchemaInfoPath: string;
    /** Path to migrations directory (e.g., "migrations/v2"). */
    MigrationsDir: string;
    /** Path to metadata directory (e.g., "metadata"). */
    MetadataDir: string;
    /** Current state of target tables (for evolution scenarios). Empty array for new tables. */
    ExistingTables: ExistingTableInfo[];
    /** EntitySettings for any __mj target entities (keyed by entity name). */
    EntitySettingsForTargets: Record<string, Array<{ Name: string; Value: string }>>;
}

/** Complete output of the SchemaBuilder orchestrator. */
export interface SchemaBuilderOutput {
    /** Migration SQL files to write. */
    MigrationFiles: EmittedFile[];
    /** Updated additionalSchemaInfo JSON content. */
    AdditionalSchemaInfoUpdate: EmittedFile | null;
    /** Metadata JSON files for mj-sync. */
    MetadataFiles: EmittedFile[];
    /** Warnings generated during processing (non-fatal). */
    Warnings: string[];
    /** Errors that prevented processing (fatal). */
    Errors: string[];
}

/** Result of an access control check. */
export interface AccessControlResult {
    Allowed: boolean;
    Reason: string;
}
