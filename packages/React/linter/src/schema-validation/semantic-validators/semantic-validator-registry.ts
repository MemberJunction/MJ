/**
 * Semantic Validator Registry
 *
 * Centralized registry for semantic validators that provides a plugin system
 * for registering and retrieving validators by their constraint type.
 *
 * This registry uses the singleton pattern to ensure validators are only
 * registered once across the application.
 *
 * Usage:
 * ```typescript
 * // Get the singleton instance
 * const registry = SemanticValidatorRegistry.getInstance();
 *
 * // Register a custom validator
 * registry.register(new MyCustomValidator());
 *
 * // Retrieve a validator by type
 * const validator = registry.get('subset-of-entity-fields');
 * ```
 *
 * Built-in validators are automatically registered on first access:
 * - subset-of-entity-fields
 * - sql-where-clause
 * - required-when
 */

import { SemanticValidator } from './semantic-validator';
import { SubsetOfEntityFieldsValidator } from './subset-of-entity-fields-validator';
import { SqlWhereClauseValidator } from './sql-where-clause-validator';
import { RequiredWhenValidator } from './required-when-validator';

/**
 * Registry for semantic validators
 *
 * Provides plugin system for validation constraints with singleton pattern
 * to ensure validators are only instantiated once.
 */
export class SemanticValidatorRegistry {
  private static instance: SemanticValidatorRegistry;
  private validators: Map<string, SemanticValidator>;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.validators = new Map();
    this.registerBuiltInValidators();
  }

  /**
   * Get the singleton instance of the registry
   *
   * @returns The singleton registry instance
   */
  static getInstance(): SemanticValidatorRegistry {
    if (!SemanticValidatorRegistry.instance) {
      SemanticValidatorRegistry.instance = new SemanticValidatorRegistry();
    }
    return SemanticValidatorRegistry.instance;
  }

  /**
   * Register built-in semantic validators
   *
   * Called automatically during construction.
   * Registers the core validators that ship with the linter.
   */
  private registerBuiltInValidators(): void {
    this.register(new SubsetOfEntityFieldsValidator());
    this.register(new SqlWhereClauseValidator());
    this.register(new RequiredWhenValidator());
  }

  /**
   * Register a semantic validator
   *
   * Validators are keyed by the constraint type they handle.
   * If a validator for the same type already exists, it will be overridden.
   *
   * @param validator - Validator instance to register
   *
   * @example
   * ```typescript
   * const registry = SemanticValidatorRegistry.getInstance();
   * registry.register(new MyCustomValidator());
   * ```
   */
  register(validator: SemanticValidator): void {
    // Get the constraint type from the validator's @RegisterClass decorator
    // For now, we extract it from the class name by convention
    // In the future, this could be read from metadata
    const type = this.getValidatorType(validator);
    this.validators.set(type, validator);
  }

  /**
   * Get validator type from validator instance
   *
   * Extracts the constraint type by checking the @RegisterClass metadata.
   * Falls back to deriving from class name if metadata is not available.
   *
   * @param validator - Validator instance
   * @returns Constraint type string
   */
  private getValidatorType(validator: SemanticValidator): string {
    // Type is stored in MJGlobal.Instance.ClassFactory during @RegisterClass
    // For built-in validators, we know the types:
    if (validator instanceof SubsetOfEntityFieldsValidator) {
      return 'subset-of-entity-fields';
    }
    if (validator instanceof SqlWhereClauseValidator) {
      return 'sql-where-clause';
    }
    if (validator instanceof RequiredWhenValidator) {
      return 'required-when';
    }

    // Fallback: derive from class name (e.g., SubsetOfEntityFieldsValidator -> subset-of-entity-fields)
    const className = validator.constructor.name;
    return className
      .replace(/Validator$/, '') // Remove "Validator" suffix
      .replace(/([A-Z])/g, (match, p1, offset) => (offset > 0 ? '-' : '') + p1.toLowerCase())
      .replace(/^-/, ''); // Remove leading dash if present
  }

  /**
   * Get a validator by constraint type
   *
   * @param type - Constraint type (e.g., 'subset-of-entity-fields')
   * @returns Validator instance, or undefined if not registered
   *
   * @example
   * ```typescript
   * const validator = registry.get('subset-of-entity-fields');
   * if (validator) {
   *   const violations = validator.validate(context, constraint);
   * }
   * ```
   */
  get(type: string): SemanticValidator | undefined {
    return this.validators.get(type);
  }

  /**
   * Get all registered validators
   *
   * @returns Map of constraint type to validator instance
   *
   * @example
   * ```typescript
   * const allValidators = registry.getAll();
   * for (const [type, validator] of allValidators) {
   *   console.log(`${type}: ${validator.getDescription()}`);
   * }
   * ```
   */
  getAll(): Map<string, SemanticValidator> {
    return new Map(this.validators);
  }

  /**
   * Check if a validator is registered for a constraint type
   *
   * @param type - Constraint type to check
   * @returns True if a validator is registered
   */
  has(type: string): boolean {
    return this.validators.has(type);
  }

  /**
   * Get list of all registered constraint types
   *
   * @returns Array of constraint type strings
   */
  getTypes(): string[] {
    return Array.from(this.validators.keys());
  }
}
