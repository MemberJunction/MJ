/**
 * @module @memberjunction/entity-designer-core
 * @description Core module for the Entity Designer Agent system.
 *
 * Exports:
 *  - Shared payload interfaces and constants (`interfaces`)
 *  - Shared RSU pipeline service (`pipeline-executor`)
 *  - Loop + code-based agent driver classes (registered via @RegisterClass)
 */

export * from './interfaces.js';
export * from './pipeline-executor.js';

// Agent driver classes — importing registers them with the MJ ClassFactory.
// BaseEntityDesignerCodeAgent is also exported for consumers who want to
// build additional code-based Entity Designer sub-agents.
export * from './agents/base-entity-designer-code-agent.js';
export * from './agents/entity-designer-agent.js';
export * from './agents/entity-schema-validator.js';
export * from './agents/entity-schema-builder.js';
export * from './agents/entity-schema-designer.js';
