/**
 * Constraint Validation Types
 *
 * This module defines the types for the component constraint validation system.
 * Constraints are rules that validate prop values at lint-time to catch errors early.
 *
 * Key Concepts:
 * - **Type Definitions**: Define the structure of complex objects (like TypeScript interfaces)
 * - **Constraints**: Define validation rules for prop values (like Zod schemas)
 * - **Validators**: TypeScript classes that implement constraint logic (separate from this metadata)
 *
 * Example:
 * ```typescript
 * // In component spec (metadata):
 * {
 *   "typeDefinitions": {
 *     "ColumnDef": { "properties": { "field": { "type": "string", "required": true } } }
 *   },
 *   "properties": [{
 *     "name": "fields",
 *     "type": "Array<string>",
 *     "constraints": [{
 *       "type": "subset-of-entity-fields",
 *       "dependsOn": "entityName"
 *     }]
 *   }]
 * }
 * ```
 */

/**
 * Validation constraint for component properties (declarative validation rules)
 */
export interface PropertyConstraint {
  /**
   * Constraint validator type (e.g., 'subset-of-entity-fields', 'sql-where-clause', 'required-when')
   */
  type: string;

  /**
   * Optional name of another prop this constraint depends on for context
   */
  dependsOn?: string;

  /**
   * Optional configuration object passed to the validator
   */
  config?: Record<string, any>;

  /**
   * Optional custom error message template with {placeholder} variables
   */
  errorTemplate?: string;

  /**
   * Optional description of what this constraint validates
   */
  description?: string;
}

/**
 * Custom type definition for complex objects (similar to TypeScript interfaces).
 * Enables lint-time validation of object literals passed as component props.
 */
export interface ComponentTypeDefinition {
  /**
   * Human-readable description of this type
   */
  description?: string;

  /**
   * Properties that make up this type (key = property name, value = property definition)
   */
  properties: Record<string, ComponentTypeProperty>;

  /**
   * For union/enum types, the allowed values (e.g., ["asc", "desc"])
   */
  allowedValues?: Array<string | number | boolean>;

  /**
   * Base type to extend from (enables type inheritance/extension)
   */
  extends?: string;
}

/**
 * Defines a single property within a ComponentTypeDefinition
 */
export interface ComponentTypeProperty {
  /**
   * Property type (primitives, objects, arrays, unions, functions, or custom type names)
   */
  type: string;

  /**
   * Whether this property is required (linter reports error if missing from object literal)
   */
  required: boolean;

  /**
   * Human-readable description of this property
   */
  description?: string;

  /**
   * For function types, the signature string (currently documentation-only, not validated)
   */
  signature?: string;

  /**
   * Default value if the property is omitted
   */
  defaultValue?: any;

  /**
   * For enum-like properties, the allowed values
   */
  allowedValues?: Array<string | number | boolean>;

  /**
   * Additional constraints on this property value (applied when validating object literals)
   */
  constraints?: PropertyConstraint[];
}

/**
 * Result of a constraint validation (validators return arrays of these to report violations)
 */
export interface ConstraintViolation {
  /**
   * Violation type (e.g., 'invalid-field', 'type-mismatch', 'missing-required-property')
   */
  type: string;

  /**
   * Severity level (critical = runtime error, high = likely issues, medium = questionable, low = style)
   */
  severity: 'critical' | 'high' | 'medium' | 'low';

  /**
   * Human-readable error message (should be specific and actionable)
   */
  message: string;

  /**
   * Location in source code (typically populated by linter, but validators can set for precision)
   */
  location?: {
    line?: number;
    column?: number;
  };

  /**
   * Suggested fix for the violation (concrete, actionable recommendation)
   */
  suggestion?: string;

  /**
   * Additional context metadata (property name, types, valid values, entity name, etc.)
   */
  metadata?: Record<string, any>;
}
