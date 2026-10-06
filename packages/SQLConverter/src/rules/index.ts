// Rule system types and interfaces
export type {
  IConversionRule, ConversionContext, ConversionStats,
  OutputGroups, StatementType,
} from './types.js';
export {
  CreateConversionContext, createConversionContext, CreateConversionStats, createConversionStats, CreateOutputGroups, createOutputGroups, CONVERSION_GAP_MARKERS, GAP_MARKER_UNPARSED, GAP_MARKER_BATCH_ERROR,
} from './types.js';

// Statement classifier
export { ClassifyBatch, classifyBatch } from './StatementClassifier.js';

// Sub-splitter for compound batches
export { SubSplitCompoundBatch, subSplitCompoundBatch } from './SubSplitter.js';

// Expression helpers
export {
  ConvertIdentifiers, convertIdentifiers, ConvertDateFunctions, convertDateFunctions, ConvertCharIndex, convertCharIndex,
  ConvertStuff, convertStuff, ConvertStringConcat, convertStringConcat, ConvertIIF, convertIIF, ConvertTopToLimit, convertTopToLimit,
  ConvertCastTypes, convertCastTypes, ConvertConvertFunction, convertConvertFunction, RemoveNPrefix, removeNPrefix,
  RemoveCollate, removeCollate, ConvertCommonFunctions, convertCommonFunctions, TransformCodeOnly, transformCodeOnly,
} from './ExpressionHelpers.js';

// Individual conversion rules
export { CreateTableRule } from './CreateTableRule.js';
export { CatalogViewRule } from './CatalogViewRule.js';
export { ViewRule } from './ViewRule.js';
export { ProcedureToFunctionRule } from './ProcedureToFunctionRule.js';
export { FunctionRule } from './FunctionRule.js';
export { TriggerRule } from './TriggerRule.js';
export { InsertRule } from './InsertRule.js';
export { AlterTableRule } from './AlterTableRule.js';
export { CreateIndexRule } from './CreateIndexRule.js';
export { GrantRule } from './GrantRule.js';
export { ExtendedPropertyRule } from './ExtendedPropertyRule.js';
export { ConditionalDDLRule } from './ConditionalDDLRule.js';
export { ExecBlockRule } from './ExecBlockRule.js';
export { DeclareDmlBlockRule } from './DeclareDmlBlockRule.js';

// Rule registry (central + T-SQL -> Postgres convenience)
export { RuleRegistry } from './RuleRegistry.js';
export type { DialectCombination } from './RuleRegistry.js';
export { GetTSQLToPostgresRules, getTSQLToPostgresRules, GetRulesForDialects, getRulesForDialects } from './TSQLToPostgresRules.js';

// Dialect header builders
export { PostgreSQLHeaderBuilder, GetHeaderBuilder, getHeaderBuilder, RegisterHeaderBuilder, registerHeaderBuilder } from './DialectHeaderBuilder.js';
export type { DialectHeaderBuilder } from './DialectHeaderBuilder.js';

// Centralized type resolution
export { ResolveType, resolveType, ResolveInlineType, resolveInlineType, ParseTypeString, parseTypeString, MJ_OVERRIDES } from './TypeResolver.js';
export type { ParsedType } from './TypeResolver.js';

// Post-processor
export { PostProcess, postProcess } from './PostProcessor.js';

// Batch converter (main orchestrator)
export { ConvertFile, convertFile, PrintReport, printReport } from './BatchConverter.js';
export type { BatchConverterConfig, BatchConverterResult } from './BatchConverter.js';

// EntityField sequence deduplicator (post-conversion fixup for UQ_EntityField_EntityID_Sequence)
export { DeduplicateEntityFieldSequences, deduplicateEntityFieldSequences } from './SequenceDeduplicator.js';
