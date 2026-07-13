/**
 * @deprecated Use `convertFile` (BatchConverter) for production conversion.
 * `ConversionPipeline` is retained for backward compat and LLM-fallback tests.
 * See `ConversionPipeline.ts` for migration guidance.
 */
export { ConversionPipeline } from './ConversionPipeline.js';
export { SQLFileSplitter } from './SQLFileSplitter.js';
export { splitMigration, extractAffectedEntities } from './MigrationSplitter.js';
export type {
  MigrationSplitResult,
  MigrationRegionKind,
  RegionFinding,
  BoundaryMethod,
  FileRouting,
} from './MigrationSplitter.js';
export { convertMigration, extractKeptTSQL } from './MigrationConverter.js';
export { IncrementalBaker, stripVolatileHeaders } from './IncrementalBaker.js';
export type {
  BakerWorkingDB,
  CapturedEntitySQL,
  IncrementalBakerOptions,
  BakedMigrationResult,
} from './IncrementalBaker.js';
export type {
  MigrationConversionResult,
  ConversionStatus,
  ConvertMigrationOptions,
  KeptTSQL,
  MJTranspileResult,
  TSQLToPGTranspiler,
  UnhandledStatement,
} from './MigrationConverter.js';
export { splitByStatement, summarizeStatements } from './MigrationStatementSplitter.js';
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
  DialectCombination,
  DialectHeaderBuilder,
  ParsedType,
} from './rules/index.js';

// Post-conversion validation/fixup
export { deduplicateEntityFieldSequences } from './rules/SequenceDeduplicator.js';
export type { SequenceFix, DeduplicationResult } from './rules/SequenceDeduplicator.js';

// Parity reporting
export { generateParityReport } from './rules/ParityReporter.js';
export type { ParityReport, ParityGap, MigrationFileInfo } from './rules/ParityReporter.js';
