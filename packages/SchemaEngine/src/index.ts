/**
 * @memberjunction/schema-engine — Public API
 *
 * Generic, platform-aware DDL generation for any MJ consumer.
 * Import from this package for all schema/DDL operations.
 */

// ─── Interfaces & Types ─────────────────────────────────────────────
export type {
    DatabasePlatform,
    SchemaFieldType,
    TableDefinition,
    ColumnDefinition,
    ForeignKeyDefinition,
    ExistingTableInfo,
    ExistingColumnInfo,
    SchemaDiff,
    ColumnModification,
    SchemaEvolutionInput,
    TypeMappingEntry,
    MigrationOutput,
    MigrationMetadata,
    EmittedFile,
    ValidationResult,
} from './interfaces.js';

// ─── Core Classes ────────────────────────────────────────────────────
export { SchemaEngine } from './SchemaEngine.js';
export { SchemaValidator } from './SchemaValidator.js';
export { DDLGenerator, GetPlatformProvider, ValidateIdentifier, EscapeSqlString, resolveSqlType } from './DDLGenerator.js';

// ─── DDL Platform Providers ─────────────────────────────────────────
export { BaseDDLPlatformProvider } from './ddl/BaseDDLPlatformProvider.js';
export { SqlServerDDLProvider } from './ddl/SqlServerDDLProvider.js';
export { PostgresDDLProvider } from './ddl/PostgresDDLProvider.js';
export { MigrationFileWriter, FormatTimestamp, SanitizeForFileName } from './MigrationFileWriter.js';
export { SchemaEvolution } from './SchemaEvolution.js';

// ─── Runtime Schema Manager ─────────────────────────────────────────
export { RuntimeSchemaManager, ValidateMigrationSQL, RSUError } from './RuntimeSchemaManager.js';
export type {
    RSUPipelineInput,
    RSUPipelineResult,
    RSUPipelineStep,
    RSUPreviewResult,
    RSUStatus,
    SQLValidationResult,
} from './RuntimeSchemaManager.js';

// ─── User Defined Tables (UDT) Pipeline ─────────────────────────────
export {
    UserTablePipeline,
    ValidateUserTableDefinition,
    DisplayNameToSqlName,
    GenerateUDTTableName,
    GenerateUDTEntityName,
} from './UserTablePipeline.js';
export type {
    UserTableDefinition,
    UserColumnDefinition,
    UserForeignKeyDefinition,
    UserTablePipelineResult,
} from './UserTablePipeline.js';

// ─── Metrics & Observability ────────────────────────────────────────
export { RSUMetrics } from './RSUMetrics.js';
export type { PipelineRunMetric, RSUMetricsSummary } from './RSUMetrics.js';
