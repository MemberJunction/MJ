/**
 * DBAutoDoc - AI-powered SQL Server database documentation generator
 * Main exports for programmatic use
 */

// Programmatic API (primary entry point for library usage)
export * from './api/index.js';

// Core types
export * from './types/index.js';

// Database layer
export * from './database/index.js';

// Prompts
export * from './prompts/index.js';

// State management
export * from './state/index.js';

// Analysis engine
export * from './core/index.js';
export * from './core/AnalysisOrchestrator.js';

// Generators
export * from './generators/index.js';

// Utilities
export * from './utils/index.js';

// @RegisterClass plugin classes — must be exported so the ClassFactory
// registration is backed by an importable public API (see
// .github/scripts/check-registerclass-exports.mjs).
export * from './drivers/MySQLDriver.js';
export * from './drivers/PostgreSQLDriver.js';
export * from './drivers/SQLServerDriver.js';
