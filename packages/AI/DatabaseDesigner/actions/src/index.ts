/**
 * @module @memberjunction/database-designer-actions
 * @description Database Designer action classes for use by AI agents,
 * workflow engines, and low-code builders.
 *
 * Importing this module registers all action driver classes with the MJ
 * ClassFactory so they are discoverable at runtime.
 */

export * from './actions/base-database-designer.action.js';
export * from './actions/create-entity.action.js';
export * from './actions/modify-entity.action.js';
export * from './actions/list-entities.action.js';
export * from './actions/describe-entity.action.js';
export * from './actions/validate-entity-schema.action.js';
