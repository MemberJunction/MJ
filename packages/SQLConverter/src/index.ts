/**
 * @deprecated Use `convertFile` (BatchConverter) for production conversion.
 * `ConversionPipeline` is retained for backward compat and LLM-fallback tests.
 * See `ConversionPipeline.ts` for migration guidance.
 */
export { ConversionPipeline } from './ConversionPipeline.js';
export { SQLFileSplitter } from './SQLFileSplitter.js';
export { SplitMigration, splitMigration, ExtractAffectedEntities, extractAffectedEntities } from './MigrationSplitter.js';
export type {
  MigrationSplitResult,
  MigrationRegionKind,
  RegionFinding,
  BoundaryMethod,
  FileRouting,
} from './MigrationSplitter.js';
export { ConvertMigration, convertMigration, ExtractKeptTSQL, extractKeptTSQL, RefreshViewWarnings, ViewsAreHandWritten, ExtractCatalogViews, IsMetadataSyncLog } from './MigrationConverter.js';
export { IncrementalBaker, StripVolatileHeaders, stripVolatileHeaders, BakeApplyError, SelectBakeableEntities, DiffFieldDefaults, FieldDefaultUpdatesSQL, SplitBakedFile, CaptureOnlyResumeCommand } from './IncrementalBaker.js';
export type {
  BakerWorkingDB,
  CapturedEntitySQL,
  IncrementalBakerOptions,
  BakeMigrationOptions,
  BakedFileRegions,
  BakedMigrationResult,
  BakeableEntityCandidate,
  EntityFieldDefault,
  FieldDefaultChange,
} from './IncrementalBaker.js';
export type {
  MigrationConversionResult,
  ConversionStatus,
  ConvertMigrationOptions,
  KeptTSQL,
  MJTranspileResult,
  TSQLToPGTranspiler,
  UnhandledStatement,
  CatalogViewExtraction,
} from './MigrationConverter.js';
export { SplitByStatement, splitByStatement, SummarizeStatements, summarizeStatements } from './MigrationStatementSplitter.js';
export type { StatementBatch, StatementKind } from './MigrationStatementSplitter.js';
export { DatabaseAuditRunner } from './DatabaseAuditor.js';
export { NoOpLLMFallback } from './LLMFallback.js';
export type {
  ConversionPipelineConfig,
  ConversionResult,
  StatementResult,
  AuditReport,
  DatabaseInventory,
  RowCountMismatch,
  ILLMFallback,
  IDatabaseVerifier,
  IDatabaseAuditor,
  SQLDialect,
} from './types.js';

// Rule-based conversion system
export {
  classifyBatch,
  subSplitCompoundBatch,
  getTSQLToPostgresRules,
  getRulesForDialects,
  RuleRegistry,
  PostgreSQLHeaderBuilder,
  getHeaderBuilder,
  registerHeaderBuilder,
  convertFile,
  GetPGCatalogViewDefinition,
  CollectTSQLBitColumns,
  MergeTableColumns,
  printReport,
  postProcess,
  convertIdentifiers,
  convertDateFunctions,
  convertCharIndex,
  convertStuff,
  convertStringConcat,
  convertIIF,
  convertTopToLimit,
  convertCastTypes,
  convertConvertFunction,
  removeNPrefix,
  removeCollate,
  convertCommonFunctions,
  createConversionContext,
  createConversionStats,
  createOutputGroups,
  CONVERSION_GAP_MARKERS,
  GAP_MARKER_UNPARSED,
  GAP_MARKER_BATCH_ERROR,
  GAP_MARKER_NEEDS_HAND_AUTHORING,
  GAP_MARKER_EXEC_SKIPPED,
  GAP_MARKER_MISSING_SAVES,
  CreateTableRule,
  ViewRule,
  ProcedureToFunctionRule,
  FunctionRule,
  TriggerRule,
  InsertRule,
  AlterTableRule,
  CreateIndexRule,
  GrantRule,
  ExtendedPropertyRule,
  resolveType,
  resolveInlineType,
  parseTypeString,
  MJ_OVERRIDES,
} from './rules/index.js';
export type {
  IConversionRule,
  ConversionContext,
  ConversionStats,
  OutputGroups,
  StatementType,
  BatchConverterConfig,
  BatchConverterResult,
  TableColumnRegistry,
  DialectCombination,
  DialectHeaderBuilder,
  ParsedType,
} from './rules/index.js';

// Post-conversion validation/fixup
export { DeduplicateEntityFieldSequences, deduplicateEntityFieldSequences } from './rules/SequenceDeduplicator.js';
export type { SequenceFix, DeduplicationResult } from './rules/SequenceDeduplicator.js';

// Parity reporting
export { GenerateParityReport, generateParityReport } from './rules/ParityReporter.js';
export type { ParityReport, ParityGap, MigrationFileInfo } from './rules/ParityReporter.js';
