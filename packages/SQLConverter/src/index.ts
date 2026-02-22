export { ConversionPipeline } from './ConversionPipeline.js';
export { SQLFileSplitter } from './SQLFileSplitter.js';
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
} from './rules/index.js';
export type {
  IConversionRule,
  ConversionContext,
  ConversionStats,
  OutputGroups,
  StatementType,
  BatchConverterConfig,
  BatchConverterResult,
} from './rules/index.js';
