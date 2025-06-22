/**
 * CRUD Actions
 * 
 * This module exports generic Create, Read, Update, and Delete (CRUD) actions
 * that can work with any entity in the MemberJunction framework.
 * 
 * These actions provide a flexible foundation for data operations and can be
 * extended through child actions for entity-specific functionality.
 */

export * from './base-record-mutation.action';
export * from './create-record.action';
export * from './get-record.action';
export * from './update-record.action';
export * from './delete-record.action';