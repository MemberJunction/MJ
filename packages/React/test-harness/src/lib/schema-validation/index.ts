/**
 * Schema Validation Module
 *
 * This module provides comprehensive schema validation for interactive components,
 * including semantic validation of prop values against business rules and constraints.
 *
 * Key Components:
 * - **Semantic Validators**: Check business rules beyond type safety
 *   (e.g., field names exist on entities, SQL clauses are valid)
 * - **Validation Context**: Provides access to component spec, entities, queries
 * - **Validator Registry**: Plugin system for registering custom validators
 *
 * Usage:
 * ```typescript
 * import { SemanticValidator, ValidationContext } from './schema-validation';
 *
 * // Get a validator from the registry
 * const registry = SemanticValidatorRegistry.getInstance();
 * const validator = registry.get('subset-of-entity-fields');
 *
 * // Run validation
 * const violations = validator.validate(context, constraint);
 * ```
 */

export * from './semantic-validators';
