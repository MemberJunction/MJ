/**
 * QueryGen package main entry point
 *
 * @memberjunction/query-gen
 *
 * AI-powered generation of domain-specific SQL query templates with
 * automatic testing, refinement, and metadata export.
 */

// Export core classes
export { EntityGrouper } from './core/EntityGrouper';
export { QuestionGenerator } from './core/QuestionGenerator';
export { QueryWriter } from './core/QueryWriter';
export { QueryTester } from './core/QueryTester';
export { QueryFixer } from './core/QueryFixer';
export { QueryRefiner } from './core/QueryRefiner';
export { MetadataExporter } from './core/MetadataExporter';
export { QueryDatabaseWriter } from './core/QueryDatabaseWriter';

// Export utility classes
export { SimilaritySearch } from './vectors/SimilaritySearch';

// Export types
export * from './data/schema';

// Export prompt names
export * from './prompts/PromptNames';

// Export configuration
export { QueryGenConfig, loadConfig } from './cli/config';

// Export utilities
export { extractErrorMessage, requireValue, getPropertyOrDefault } from './utils/error-handlers';
export {
  formatEntityMetadataForPrompt,
  formatEntityGroupForPrompt,
  findEntityById,
  getPrimaryKeyFields,
  getForeignKeyFields,
  hasRelationships,
  getRelationshipCount
} from './utils/entity-helpers';
