/**
 * Validation Context
 *
 * Provides all the information a semantic validator needs to perform validation.
 * This context is passed to validators by the linter rule and includes:
 * - AST node and path information for location tracking
 * - Component spec for type lookups
 * - Sibling props for dependency resolution
 * - Entity/query metadata from data requirements
 * - Helper methods for common validation tasks
 */

import * as t from '@babel/types';
import { NodePath } from '@babel/traverse';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { TypeInferenceEngine } from '../../type-inference-engine';
import { ExtractedValue } from '../../prop-value-extractor';

/**
 * Context object passed to semantic validators
 *
 * Contains all information needed to validate a prop value against semantic constraints.
 */
export interface ValidationContext {
  // ============================================================================
  // AST Information
  // ============================================================================

  /**
   * The AST node being validated
   *
   * This is typically the JSXAttribute node, but validators can traverse
   * to child nodes for more specific location information.
   */
  Node: t.Node;

  /**
   * Babel traversal path for the node
   *
   * Provides access to parent nodes, scope information, and AST manipulation.
   * Validators should not modify the AST - this is read-only validation.
   */
  Path: NodePath<any>;

  // ============================================================================
  // Component Context
  // ============================================================================

  /**
   * Name of the component being validated
   *
   * Example: "DataGrid", "EntityDataGrid", "SimpleChart"
   */
  ComponentName: string;

  /**
   * Full component specification
   *
   * Provides access to:
   * - Type definitions (for custom type validation)
   * - Data requirements (entities, queries)
   * - Other properties (for cross-property validation)
   * - Dependency specs (for validating nested components)
   */
  ComponentSpec: ComponentSpec;

  // ============================================================================
  // Property Context
  // ============================================================================

  /**
   * Name of the property being validated
   *
   * Example: "fields", "columns", "entityName", "extraFilter"
   */
  propertyName: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Extracted value of the property
   *
   * This is the result of PropValueExtractor.extract() and can be:
   * - Primitive: string, number, boolean, null
   * - Array: Array of extracted values
   * - Object: Record<string, ExtractedValue>
   * - DynamicValue: { _type: 'identifier' | 'expression', name?, description? }
   *
   * If the value is a DynamicValue, validators should typically skip validation
   * and return an empty violations array (the linter will warn the user).
   */
  propertyValue: ExtractedValue;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Map of sibling props on the same JSX element
   *
   * Key is prop name, value is extracted value.
   * Used for constraints with `dependsOn` to access related prop values.
   *
   * Example:
   * ```typescript
   * // <EntityDataGrid entityName="Members" fields={['FirstName', 'LastName']} />
   * siblingProps.get('entityName') // => "Members"
   * siblingProps.get('fields') // => ['FirstName', 'LastName']
   * ```
   */
  siblingProps: Map<string, ExtractedValue>;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  // ============================================================================
  // Data Requirements Context
  // ============================================================================

  /**
   * Map of entity name to entity metadata
   *
   * Populated from componentSpec.dataRequirements.entities
   * Used by validators that check field names, entity references, etc.
   *
   * Example:
   * ```typescript
   * const memberEntity = entities.get('Members');
   * const fields = memberEntity.fields; // Array of EntityFieldInfo
   * ```
   */
  Entities: Map<string, EntityMetadata>;

  /**
   * Map of query name to query metadata
   *
   * Populated from componentSpec.dataRequirements.queries
   * Used by validators that check query references and parameters.
   *
   * Example:
   * ```typescript
   * const query = queries.get('Sales by Region');
   * const params = query.parameters; // Array of QueryParameter
   * ```
   */
  Queries: Map<string, QueryMetadata>;

  // ============================================================================
  // Validation Utilities
  // ============================================================================

  /**
   * Type inference engine for checking expression types
   *
   * Used for advanced type checking beyond what PropValueExtractor provides.
   * Can infer types of variables, function calls, etc.
   */
  TypeEngine: TypeInferenceEngine;

  /**
   * SQL dialect for WHERE clause parsing and validation.
   *
   * Used by the SqlWhereClauseValidator to parse SQL with the correct syntax
   * for the target database platform (SQL Server, PostgreSQL, etc.).
   * If not provided, the validator falls back to SQL Server dialect.
   */
  Dialect?: SQLParserDialect;

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get field metadata for an entity
   *
   * @param entityName - Name of the entity
   * @returns Array of field info, or empty array if entity not found
   *
   * @example
   * ```typescript
   * const fields = context.getEntityFields('Members');
   * const fieldNames = fields.map(f => f.name);
   * ```
   */
  getEntityFields(entityName: string): EntityFieldInfo[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Get the data type of a specific field on an entity
   *
   * @param entityName - Name of the entity
   * @param fieldName - Name of the field
   * @returns Data type string (e.g., 'string', 'number', 'date'), or null if not found
   *
   * @example
   * ```typescript
   * const fieldType = context.getEntityFieldType('Members', 'JoinDate');
   * // => 'date'
   * ```
   */
  getEntityFieldType(entityName: string, fieldName: string): string | null;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Find field names similar to the given field name (for suggestions)
   *
   * Uses fuzzy matching (Levenshtein distance or similar) to find close matches.
   * Useful for "Did you mean?" error messages.
   *
   * @param fieldName - The field name to find matches for
   * @param entityName - Name of the entity to search in
   * @param maxResults - Maximum number of suggestions (default: 3)
   * @returns Array of similar field names, sorted by similarity
   *
   * @example
   * ```typescript
   * const suggestions = context.findSimilarFieldNames('FristName', 'Members', 3);
   * // => ['FirstName', 'FirstNameNormalized', 'FirstNameMasked']
   * ```
   */
  findSimilarFieldNames(fieldName: string, entityName: string, maxResults?: number): string[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Get parameter metadata for a query
   *
   * @param queryName - Name of the query
   * @returns Array of parameter info, or empty array if query not found
   *
   * @example
   * ```typescript
   * const params = context.getQueryParameters('Sales by Region');
   * const requiredParams = params.filter(p => p.required);
   * ```
   */
  getQueryParameters(queryName: string): QueryParameter[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Check if a query exists in the component's data requirements
   *
   * @param queryName - Name of the query to check
   * @param categoryPath - Optional category path for disambiguation
   * @returns True if the query exists
   *
   * @example
   * ```typescript
   * if (!context.hasQuery('Sales Report', '/Reports/Sales')) {
   *   // Query not found
   * }
   * ```
   */
  hasQuery(queryName: string, categoryPath?: string): boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Check if an entity exists in the component's data requirements
   *
   * @param entityName - Name of the entity to check
   * @returns True if the entity exists
   *
   * @example
   * ```typescript
   * if (!context.hasEntity('Members')) {
   *   // Entity not found
   * }
   * ```
   */
  hasEntity(entityName: string): boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

/**
 * Entity metadata extracted from data requirements
 */
export interface EntityMetadata {
  /**
   * Entity name
   */
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Entity description (if available)
   */
  description?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined

  /**
   * Array of field metadata for this entity
   */
  fields: EntityFieldInfo[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Primary key field name(s)
   */
  PrimaryKeys?: string[];
}

/**
 * Field metadata for an entity
 */
export interface EntityFieldInfo {
  /**
   * Field name
   */
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Data type (e.g., 'string', 'number', 'date', 'boolean')
   */
  type: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * SQL data type (e.g., 'nvarchar', 'int', 'datetime', 'bit')
   */
  SqlType?: string;

  /**
   * Whether this field is required (NOT NULL)
   */
  Required?: boolean;

  /**
   * Field description (if available)
   */
  description?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined

  /**
   * Whether this is a primary key field
   */
  isPrimaryKey?: boolean;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined

  /**
   * If this is a foreign key, the related entity name
   */
  RelatedEntity?: string;

  /**
   * Maximum length for string fields
   */
  MaxLength?: number;
}

/**
 * Query metadata extracted from data requirements
 */
export interface QueryMetadata {
  /**
   * Query name
   */
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Query description (if available)
   */
  description?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined

  /**
   * Category path for disambiguation
   */
  CategoryPath?: string;

  /**
   * Array of parameter metadata for this query
   */
  Parameters: QueryParameter[];

  /**
   * Expected result fields (if specified)
   */
  ResultFields?: Array<{ name: string; type: string }>;
}

/**
 * Parameter metadata for a query
 */
export interface QueryParameter {
  /**
   * Parameter name
   */
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * Parameter data type
   */
  type: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

  /**
   * SQL data type
   */
  SqlType?: string;

  /**
   * Whether this parameter is required
   */
  Required?: boolean;

  /**
   * Default value if not provided
   */
  DefaultValue?: any;

  /**
   * Example/test value for documentation
   */
  TestValue?: any;

  /**
   * Parameter description (if available)
   */
  description?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}
