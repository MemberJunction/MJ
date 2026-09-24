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
export { EmbeddingService } from './vectors/EmbeddingService';

// Export types
export * from './data/schema';

// Export prompt names
export * from './prompts/PromptNames';

// Export configuration
export { QueryGenConfig, LoadConfig, loadConfig } from './cli/config';

// Export CLI commands
export { GenerateCommand, generateCommand } from './cli/commands/generate';
export { ValidateCommand, validateCommand } from './cli/commands/validate';
export { ExportCommand, exportCommand } from './cli/commands/export';

// Export utilities
export { ExtractErrorMessage, extractErrorMessage, RequireValue, requireValue, GetPropertyOrDefault, getPropertyOrDefault } from './utils/error-handlers';
export {
  FormatEntityMetadataForPrompt, formatEntityMetadataForPrompt,
  FormatEntityGroupForPrompt, formatEntityGroupForPrompt,
  FindEntityById, findEntityById,
  GetPrimaryKeyFields, getPrimaryKeyFields,
  GetForeignKeyFields, getForeignKeyFields,
  HasRelationships, hasRelationships,
  GetRelationshipCount, getRelationshipCount
} from './utils/entity-helpers';
