/**
 * @module @memberjunction/database-designer-core
 * @description Core module for the Database Designer Agent system.
 *
 * Exports:
 *  - Shared payload interfaces and constants (`interfaces`)
 *  - Shared RSU pipeline service (`pipeline-executor`)
 *  - Loop + code-based agent driver classes (registered via @RegisterClass)
 */

export * from './interfaces.js';
export * from './pipeline-executor.js';
export * from './database-schema-validation.service.js';

// Agent driver classes — importing registers them with the MJ ClassFactory.
// BaseDatabaseDesignerCodeAgent is also exported for consumers who want to
// build additional code-based Database Designer sub-agents.
export * from './agents/base-database-designer-code-agent.js';
export * from './agents/database-designer-agent.js';
export * from './agents/database-schema-validator.js';
export * from './agents/database-schema-builder.js';
export * from './agents/database-schema-designer.js';
