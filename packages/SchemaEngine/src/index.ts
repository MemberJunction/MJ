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
export { DDLGenerator, GetDialect, ValidateIdentifier, EscapeSqlString, resolveSqlType } from './DDLGenerator.js';

/** @deprecated Use GetDialect() instead. */
export { GetDialect as GetPlatformProvider } from './DDLGenerator.js';

export { MigrationFileWriter, FormatTimestamp, SanitizeForFileName } from './MigrationFileWriter.js';
export { SchemaEvolution } from './SchemaEvolution.js';

// ─── Runtime Schema Manager ─────────────────────────────────────────
export { RuntimeSchemaManager, ValidateMigrationSQL, RSUError } from './RuntimeSchemaManager.js';
export type {
  RSUPipelineBatchResult,
  RSUPipelineInput,
  RSUPipelineResult,
  RSUPipelineStep,
  RSUPreviewResult,
  RSUStatus,
  SQLValidationResult,
} from './RuntimeSchemaManager.js';

// ─── Metrics & Observability ────────────────────────────────────────
export { RSUMetrics } from './RSUMetrics.js';
export type { PipelineRunMetric, RSUMetricsSummary } from './RSUMetrics.js';
