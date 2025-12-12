/**
 * Semantic Validators Module
 *
 * This module provides the infrastructure for semantic validation of component props.
 * Semantic validators check business rules and constraints beyond basic type checking,
 * such as verifying field names exist on entities or SQL clauses reference valid columns.
 *
 * Validators use MemberJunction's @RegisterClass decorator for automatic discovery.
 * Each validator is registered with SemanticValidator and its constraint type as the key.
 *
 * Key exports:
 * - SemanticValidator: Abstract base class for all semantic validators
 * - ValidationContext: Context passed to validators
 * - Entity/Query metadata types
 * - Concrete validator implementations (auto-registered via @RegisterClass)
 */

export * from './semantic-validator';
export * from './semantic-validator-registry';
export * from './validation-context';
export * from './subset-of-entity-fields-validator';
export * from './sql-where-clause-validator';
export * from './required-when-validator';
