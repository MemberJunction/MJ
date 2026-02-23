// Rule system types and interfaces
export type {
  IConversionRule, ConversionContext, ConversionStats,
  OutputGroups, StatementType,
} from './types.js';
export {
  createConversionContext, createConversionStats, createOutputGroups,
} from './types.js';

// Statement classifier
export { classifyBatch } from './StatementClassifier.js';

// Sub-splitter for compound batches
export { subSplitCompoundBatch } from './SubSplitter.js';

// Expression helpers
export {
  convertIdentifiers, convertDateFunctions, convertCharIndex,
  convertStuff, convertStringConcat, convertIIF, convertTopToLimit,
  convertCastTypes, convertConvertFunction, removeNPrefix,
  removeCollate, convertCommonFunctions,
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

// Rule registry
export { getTSQLToPostgresRules, getRulesForDialects } from './TSQLToPostgresRules.js';

// Post-processor
export { postProcess } from './PostProcessor.js';

// Batch converter (main orchestrator)
export { convertFile, printReport } from './BatchConverter.js';
export type { BatchConverterConfig, BatchConverterResult } from './BatchConverter.js';
