/**
 * @fileoverview Main entry point for the MemberJunction CodeGen Library.
 *
 * This package provides comprehensive code generation capabilities for the MemberJunction platform,
 * including:
 *
 * **Configuration Management:**
 * - Configuration file parsing and validation
 * - Database connection management
 *
 * **Database Operations:**
 * - Schema introspection and metadata management
 * - SQL script generation (views, procedures, indexes)
 * - Database schema JSON export
 *
 * **Code Generation:**
 * - TypeScript entity classes with Zod validation
 * - Angular components and forms
 * - GraphQL resolvers and schemas
 * - Action subclasses for business logic
 *
 * **Utilities:**
 * - Status logging and error handling
 * - Command execution
 * - System integrity checks
 *
 * @example
 * ```typescript
 * import { RunCodeGenBase, initializeConfig } from '@memberjunction/codegen-lib';
 *
 * // Initialize configuration
 * const config = initializeConfig(process.cwd());
 *
 * // Run code generation
 * const codeGen = new RunCodeGenBase();
 * await codeGen.Run();
 * ```
 */

// Configuration exports
export { initializeConfig } from './Config/config'
export * from './Config/config'
export * from './Config/db-connection'

// Database exports
export * from './Database/dbSchema'
export * from './Database/manage-metadata'
export * from './Database/sql_codegen'
export * from './Database/sql'

// Code generation exports
export * from './Misc/entity_subclasses_codegen'
export * from './Misc/action_subclasses_codegen';
export * from './Misc/graphql_server_codegen'

// Angular exports
export * from './Angular/angular-codegen'
export * from './Angular/related-entity-components';
export * from './Angular/entity-data-grid-related-entity-component';
export * from './Angular/join-grid-related-entity-component';
export * from './Angular/timeline-related-entity-component';

// Utility exports
export * from './Misc/status_logging'
export * from './Misc/system_integrity';
export * from './Misc/runCommand'
export * from './Misc/util'

// Manifest generation
export * from './Manifest/GenerateClassRegistrationsManifest'

// Entity name scanning
export * from './EntityNameScanner/EntityNameScanner'
export * from './EntityNameScanner/MetadataNameScanner'
export * from './EntityNameScanner/HtmlEntityNameScanner'

// Main runner
export * from './runCodeGen'