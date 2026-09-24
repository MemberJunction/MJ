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
    EntityName: string;
    TableName: string;
    SchemaName: string;
    Description: string;
    /** When true, tableName was auto-derived from entityName and will update automatically. */
    TableNameIsAuto: boolean;
}

// ─── Schema options ───────────────────────────────────────────────────────────

/** Schema option shown in the "Schema" dropdown on Step 1 of the wizard. */
export interface SchemaOption {
    /** SQL schema name (e.g. '__mj_UDT'). */
    Value: string;
    /** Human-readable display name (e.g. 'UDT — User-Defined Tables (default)'). */
    Label: string;
    /** True for the `__mj_UDT` schema — pre-selected in the wizard. */
    IsDefault: boolean;
    /**
     * When true, user must hold `Create in Custom Schema` authorization.
     * The engine gates this option based on the user's authorizations.
     */
    RequiresElevatedAuth: boolean;
}

// ─── Entity list models ───────────────────────────────────────────────────────

/**
 * Lightweight entity row shown in the Database Designer entity list.
 * Loaded by `DatabaseDesignerEngine.loadAccessibleEntities()`.
 */
export interface AccessibleEntity {
    entityId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    entityName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    tableName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    schemaName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Number of user-defined columns (excludes auto-managed ID / __mj_CreatedAt / __mj_UpdatedAt). */
    fieldCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    createdAt: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** True when the current user is the recorded MJ:UDT:Owner for this entity. */
    isOwner: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Display name of the owner (loaded lazily — may be absent initially). */
    ownerDisplayName?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Full entity detail loaded when the user opens a slide panel or enters the modify wizard. */
export interface AccessibleEntityDetail extends AccessibleEntity {
    description: string;
    Columns: ColumnSpec[];
    ForeignKeys: ForeignKeySpec[];
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
    id: WizardStep;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    label: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    isComplete: boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    isActive: boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

// ─── Field type options ───────────────────────────────────────────────────────

/** One entry in the field-type dropdown. */
export interface FieldTypeOption {
    Value: NonNullable<ColumnSpec['Type']>;
    Label: string;
    /** Short SQL preview shown in the review table. */
    SqlPreview: string;
    HasMaxLength: boolean;
    HasPrecisionScale: boolean;
}

/** Pre-defined field type options — one for each semantic type. */
export const FIELD_TYPE_OPTIONS: readonly FieldTypeOption[] = [
    { Value: 'string',   Label: 'String (NVARCHAR)',       SqlPreview: 'NVARCHAR(n)',          HasMaxLength: true,  HasPrecisionScale: false },
    { Value: 'text',     Label: 'Long Text (NVARCHAR MAX)', SqlPreview: 'NVARCHAR(MAX)',        HasMaxLength: false, HasPrecisionScale: false },
    { Value: 'integer',  Label: 'Integer (INT)',            SqlPreview: 'INT',                  HasMaxLength: false, HasPrecisionScale: false },
    { Value: 'bigint',   Label: 'Big Integer (BIGINT)',     SqlPreview: 'BIGINT',               HasMaxLength: false, HasPrecisionScale: false },
    { Value: 'decimal',  Label: 'Decimal',                  SqlPreview: 'DECIMAL(p,s)',         HasMaxLength: false, HasPrecisionScale: true  },
    { Value: 'boolean',  Label: 'Boolean (BIT)',            SqlPreview: 'BIT',                  HasMaxLength: false, HasPrecisionScale: false },
    { Value: 'datetime', Label: 'Date + Time',              SqlPreview: 'DATETIMEOFFSET',       HasMaxLength: false, HasPrecisionScale: false },
    { Value: 'date',     Label: 'Date Only',                SqlPreview: 'DATE',                 HasMaxLength: false, HasPrecisionScale: false },
    { Value: 'uuid',     Label: 'Unique ID (GUID)',         SqlPreview: 'UNIQUEIDENTIFIER',     HasMaxLength: false, HasPrecisionScale: false },
    { Value: 'json',     Label: 'JSON',                     SqlPreview: 'NVARCHAR(MAX) / JSON', HasMaxLength: false, HasPrecisionScale: false },
    { Value: 'float',    Label: 'Float',                    SqlPreview: 'FLOAT',                HasMaxLength: false, HasPrecisionScale: false },
    { Value: 'time',     Label: 'Time Only',                SqlPreview: 'TIME',                 HasMaxLength: false, HasPrecisionScale: false },
] as const;
