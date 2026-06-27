/**
 * @module database-designer.types
 * @description Shared client-side type contracts for the Database Designer Angular UI.
 *
 * These types mirror server-side interfaces from `@memberjunction/database-designer-core`
 * and `@memberjunction/schema-engine` but live in the Angular package to avoid pulling
 * in server-only dependencies (AI agents, SchemaEngine DDL, etc.) into the browser bundle.
 *
 * When server-side interfaces change, update these in parallel.
 */

// ─── Column & Table Definition ────────────────────────────────────────────────

/**
 * Client-side column specification for the Database Designer wizard.
 * Mirrors `ColumnDefinition` from `@memberjunction/schema-engine`.
 */
export interface ColumnSpec {
    /** Physical column name. Must be a valid SQL identifier. */
    Name: string;
    /**
     * Semantic type — used when `RawSqlType` is omitted.
     * Wizard maps this to the appropriate SQL Server type.
     */
    Type?: 'string' | 'integer' | 'bigint' | 'float' | 'decimal' | 'date' | 'datetime' | 'boolean' | 'uuid' | 'text' | 'json' | 'time';
    /** Explicit SQL type string, overrides `Type` (e.g. 'NVARCHAR(200)', 'DECIMAL(18,2)'). */
    RawSqlType?: string;
    /** Max length — used only when Type is 'string'. */
    MaxLength?: number;
    /** Precision — used only when Type is 'decimal'. */
    Precision?: number;
    /** Scale — used only when Type is 'decimal'. */
    Scale?: number;
    IsNullable: boolean;
    /** SQL default expression (e.g. `'Active'`, `GETUTCDATE()`). */
    DefaultValue?: string;
    Description?: string;
}

/** Client-side foreign key specification. Mirrors `ForeignKeyDefinition` from schema-engine. */
export interface ForeignKeySpec {
    ColumnName: string;
    ReferencedSchema: string;
    ReferencedTable: string;
    ReferencedColumn: string;
    /** When true, MJ treats this as a soft FK (no DB-level constraint — metadata only). */
    IsSoft: boolean;
}

/**
 * Client-side table specification sent to Database Designer actions.
 * Serialized as the `TableDefinition` action parameter.
 * Mirrors `TableDefinition` from `@memberjunction/schema-engine`.
 */
export interface EntityTableSpec {
    SchemaName: string;
    TableName: string;
    EntityName: string;
    Description?: string;
    Columns: ColumnSpec[];
    ForeignKeys?: ForeignKeySpec[];
}

// ─── Wizard step models ───────────────────────────────────────────────────────

/**
 * Form value produced by Step 1 (Basics) of the entity create wizard.
 * Kept in a dedicated type so downstream steps can type-check their inputs.
 */
export interface BasicsStepValue {
    entityName: string;
    tableName: string;
    schemaName: string;
    description: string;
    /** When true, tableName was auto-derived from entityName and will update automatically. */
    tableNameIsAuto: boolean;
}

// ─── Schema options ───────────────────────────────────────────────────────────

/** Schema option shown in the "Schema" dropdown on Step 1 of the wizard. */
export interface SchemaOption {
    /** SQL schema name (e.g. '__mj_UDT'). */
    value: string;
    /** Human-readable display name (e.g. 'UDT — User-Defined Tables (default)'). */
    label: string;
    /** True for the `__mj_UDT` schema — pre-selected in the wizard. */
    isDefault: boolean;
    /**
     * When true, user must hold `Create in Custom Schema` authorization.
     * The engine gates this option based on the user's authorizations.
     */
    requiresElevatedAuth: boolean;
}

// ─── Entity list models ───────────────────────────────────────────────────────

/**
 * Lightweight entity row shown in the Database Designer entity list.
 * Loaded by `DatabaseDesignerEngine.loadAccessibleEntities()`.
 */
export interface AccessibleEntity {
    entityId: string;
    entityName: string;
    tableName: string;
    schemaName: string;
    /** Number of user-defined columns (excludes auto-managed ID / __mj_CreatedAt / __mj_UpdatedAt). */
    fieldCount: number;
    createdAt: Date;
    /** True when the current user is the recorded MJ:UDT:Owner for this entity. */
    isOwner: boolean;
    /** Display name of the owner (loaded lazily — may be absent initially). */
    ownerDisplayName?: string;
}

/** Full entity detail loaded when the user opens a slide panel or enters the modify wizard. */
export interface AccessibleEntityDetail extends AccessibleEntity {
    description: string;
    columns: ColumnSpec[];
    foreignKeys: ForeignKeySpec[];
}

// ─── Action results ───────────────────────────────────────────────────────────

/** Validation outcome returned by `DatabaseDesignerService.validateEntitySchema()`. */
export interface ClientValidationResult {
    Valid: boolean;
    Errors: string[];
    Warnings: string[];
}

/** Result returned by `DatabaseDesignerService.createEntity()` and `modifyEntity()`. */
export interface EntityPipelineResult {
    Success: boolean;
    EntityID?: string;
    EntityName?: string;
    SchemaName?: string;
    TableName?: string;
    /** Step-by-step pipeline trace from the server-side RuntimeSchemaManager. */
    PipelineSteps?: PipelineStepSummary[];
    ErrorMessage?: string;
    Warnings?: string[];
}

/** Lightweight pipeline step summary forwarded from the server. */
export interface PipelineStepSummary {
    Name: string;
    Status: 'success' | 'failed' | 'skipped';
    DurationMs: number;
    Message?: string;
}

/** Result returned by `DatabaseDesignerService.describeEntity()`. */
export interface EntityDescribeResult {
    Success: boolean;
    EntityName?: string;
    SchemaName?: string;
    TableName?: string;
    Description?: string;
    Fields?: Array<{ Name: string; Type: string; IsNullable: boolean; Description?: string }>;
    ErrorMessage?: string;
}

// ─── Wizard step models ───────────────────────────────────────────────────────

/** Named step identifiers for the create wizard. */
export type WizardStep = 'basics' | 'fields' | 'relationships' | 'review';

/** Step definition passed to `WizardStepIndicatorComponent`. */
export interface WizardStepDef {
    id: WizardStep;
    label: string;
    isComplete: boolean;
    isActive: boolean;
}

// ─── Field type options ───────────────────────────────────────────────────────

/** One entry in the field-type dropdown. */
export interface FieldTypeOption {
    value: NonNullable<ColumnSpec['Type']>;
    label: string;
    /** Short SQL preview shown in the review table. */
    sqlPreview: string;
    hasMaxLength: boolean;
    hasPrecisionScale: boolean;
}

/** Pre-defined field type options — one for each semantic type. */
export const FIELD_TYPE_OPTIONS: readonly FieldTypeOption[] = [
    { value: 'string',   label: 'String (NVARCHAR)',       sqlPreview: 'NVARCHAR(n)',          hasMaxLength: true,  hasPrecisionScale: false },
    { value: 'text',     label: 'Long Text (NVARCHAR MAX)', sqlPreview: 'NVARCHAR(MAX)',        hasMaxLength: false, hasPrecisionScale: false },
    { value: 'integer',  label: 'Integer (INT)',            sqlPreview: 'INT',                  hasMaxLength: false, hasPrecisionScale: false },
    { value: 'bigint',   label: 'Big Integer (BIGINT)',     sqlPreview: 'BIGINT',               hasMaxLength: false, hasPrecisionScale: false },
    { value: 'decimal',  label: 'Decimal',                  sqlPreview: 'DECIMAL(p,s)',         hasMaxLength: false, hasPrecisionScale: true  },
    { value: 'boolean',  label: 'Boolean (BIT)',            sqlPreview: 'BIT',                  hasMaxLength: false, hasPrecisionScale: false },
    { value: 'datetime', label: 'Date + Time',              sqlPreview: 'DATETIMEOFFSET',       hasMaxLength: false, hasPrecisionScale: false },
    { value: 'date',     label: 'Date Only',                sqlPreview: 'DATE',                 hasMaxLength: false, hasPrecisionScale: false },
    { value: 'uuid',     label: 'Unique ID (GUID)',         sqlPreview: 'UNIQUEIDENTIFIER',     hasMaxLength: false, hasPrecisionScale: false },
    { value: 'json',     label: 'JSON',                     sqlPreview: 'NVARCHAR(MAX) / JSON', hasMaxLength: false, hasPrecisionScale: false },
    { value: 'float',    label: 'Float',                    sqlPreview: 'FLOAT',                hasMaxLength: false, hasPrecisionScale: false },
    { value: 'time',     label: 'Time Only',                sqlPreview: 'TIME',                 hasMaxLength: false, hasPrecisionScale: false },
] as const;
