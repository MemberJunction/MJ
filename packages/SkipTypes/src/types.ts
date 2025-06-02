/**
 * @fileoverview Legacy types file - now re-exports from organized modules
 * 
 * This file has been refactored to re-export types from more focused, smaller modules.
 * The types are now organized across the following files:
 * 
 * - api-types.ts: Core API request/response types
 * - conversation-types.ts: Conversation and messaging types  
 * - response-types.ts: Specific response types
 * - entity-metadata-types.ts: Entity and schema types
 * - query-types.ts: Query-related types
 * - agent-types.ts: AI agent and learning cycle types
 * - artifact-types.ts: Artifact-related types
 * - report-types.ts: Report and HTML-specific types
 * - auth-types.ts: Authentication types
 * 
 * This organization makes the codebase more maintainable while preserving 
 * backward compatibility for existing imports.
 * 
 * @author MemberJunction
 * @since 2.0.0
 * @deprecated Import from specific module files instead for better tree-shaking
 */

// Re-export all types for backward compatibility
export * from './api-types';
export * from './conversation-types';
export * from './response-types';
export * from './entity-metadata-types';
export * from './query-types';
export * from './agent-types';
export * from './artifact-types';
export * from './report-types';
export * from './auth-types';
export * from './html-report-types';