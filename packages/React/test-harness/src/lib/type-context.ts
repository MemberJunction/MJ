/**
 * Type Context - Variable type tracking for component linting
 *
 * This module provides infrastructure for tracking variable types throughout
 * component code. It integrates with entity metadata and query specs to provide
 * type information for data-driven type checking.
 */

import { EntityInfo, EntityFieldInfo, UserInfo, Metadata } from '@memberjunction/core';
import { ComponentSpec, ComponentQueryDataRequirement } from '@memberjunction/interactive-component-types';

/**
 * Represents type information for a value
 */
export interface TypeInfo {
  /** Base type: string, number, boolean, array, object, entity-row, query-row, function, unknown */
  type: string;
  /** For entity-row types, the entity name */
  entityName?: string;
  /** For query-row types, the query name */
  queryName?: string;
  /** Known fields/properties and their types */
  fields?: Map<string, FieldTypeInfo>;
  /** For array types, the element type */
  arrayElementType?: TypeInfo;
  /** For object/dictionary types, the value type (e.g., Object.values() returns array of this) */
  objectValueType?: TypeInfo;
  /** Whether the value can be null/undefined */
  nullable?: boolean;
  /** Whether this type came from metadata (vs inferred) */
  fromMetadata?: boolean;
  /** For constant literals, the actual value (e.g., '' for empty string, '2024-01-01' for date literal) */
  literalValue?: string | number | boolean | null;
}

/**
 * Type information for a specific field
 */
export interface FieldTypeInfo {
  /** The JavaScript type */
  type: string;
  /** Whether this came from entity/query metadata */
  fromMetadata: boolean;
  /** Original SQL type if from database */
  sqlType?: string;
  /** Whether the field is nullable */
  nullable?: boolean;
}

/**
 * Information about a query parameter
 */
export interface ParameterTypeInfo {
  name: string;
  type: string;
  isRequired: boolean;
  sqlType?: string;
}

/**
 * Maps SQL Server types to JavaScript types
 */
export function mapSQLTypeToJSType(sqlType: string): string {
  const type = sqlType.toLowerCase();

  // If already a JavaScript type, return it directly
  // This handles cases where query metadata provides JS types instead of SQL types
  if (['string', 'number', 'boolean'].includes(type)) {
    return type;
  }

  // Numeric types
  if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney'].includes(type)) {
    return 'number';
  }

  // String types
  if (['char', 'varchar', 'text', 'nchar', 'nvarchar', 'ntext', 'xml'].includes(type)) {
    return 'string';
  }

  // Boolean types
  if (['bit'].includes(type)) {
    return 'boolean';
  }

  // Date/time types - represented as strings in JS (ISO format)
  if (['date', 'time', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset'].includes(type)) {
    return 'string'; // Dates come as ISO strings from the API
  }

  // Binary types
  if (['binary', 'varbinary', 'image'].includes(type)) {
    return 'string'; // Base64 encoded
  }

  // GUID
  if (['uniqueidentifier'].includes(type)) {
    return 'string';
  }

  return 'unknown';
}

/**
 * TypeContext - Tracks variable types throughout component code
 *
 * Provides scoped variable type tracking with support for:
 * - Entity field types from metadata
 * - Query result types from spec
 * - RunView/RunQuery result structure
 * - Variable assignment tracking
 */
export class TypeContext {
  private variableTypes: Map<string, TypeInfo> = new Map();
  private scopeStack: string[] = [];
  private entityFieldCache: Map<string, Map<string, FieldTypeInfo>> = new Map();
  private queryFieldCache: Map<string, Map<string, FieldTypeInfo>> = new Map();
  private queryParamCache: Map<string, ParameterTypeInfo[]> = new Map();

  constructor(private componentSpec?: ComponentSpec) {
    // Initialize query caches from component spec
    if (componentSpec?.dataRequirements?.queries) {
      for (const query of componentSpec.dataRequirements.queries) {
        this.cacheQueryMetadata(query);
      }
    }
  }

  /**
   * Cache query field and parameter metadata from spec
   */
  private cacheQueryMetadata(query: ComponentQueryDataRequirement): void {
    const queryKey = `${query.categoryPath}/${query.name}`;

    // Cache parameters - note: ComponentQueryParameterValue has name, value, testValue
    // For type info, we check for extended properties that test fixtures may include
    if (query.parameters) {
      const params: ParameterTypeInfo[] = query.parameters.map(p => {
        // Extended parameter info may be present in test fixtures
        const extendedParam = p as any;
        return {
          name: p.name,
          // Type may be in extended format or inferred from testValue
          type: extendedParam.type
            ? mapSQLTypeToJSType(extendedParam.type)
            : this.inferTypeFromValue(p.testValue || p.value),
          isRequired: extendedParam.isRequired ?? (p.value === '@runtime'),
          sqlType: extendedParam.type
        };
      });
      this.queryParamCache.set(queryKey, params);
    }

    // Cache fields if available (extended format for test fixtures)
    if ((query as any).fields) {
      const fields = new Map<string, FieldTypeInfo>();
      for (const field of (query as any).fields) {
        fields.set(field.name, {
          type: mapSQLTypeToJSType(field.type || 'nvarchar'),
          fromMetadata: true,
          sqlType: field.type,
          nullable: field.nullable
        });
      }
      this.queryFieldCache.set(queryKey, fields);
    }
  }

  /**
   * Infer JavaScript type from a value
   */
  private inferTypeFromValue(value: any): string {
    if (value === undefined || value === null) return 'unknown';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'unknown';
  }

  /**
   * Load entity field types from metadata (async version)
   */
  async loadEntityFieldTypes(entityName: string, contextUser?: UserInfo): Promise<Map<string, FieldTypeInfo>> {
    return this.getEntityFieldTypesSync(entityName);
  }

  /**
   * Get entity field types from metadata (synchronous - uses pre-loaded metadata)
   */
  getEntityFieldTypesSync(entityName: string): Map<string, FieldTypeInfo> {
    // Check cache first
    if (this.entityFieldCache.has(entityName)) {
      return this.entityFieldCache.get(entityName)!;
    }

    const fields = new Map<string, FieldTypeInfo>();

    try {
      const md = new Metadata();
      const entity = md.Entities.find(e => e.Name === entityName);

      if (entity) {
        for (const field of entity.Fields) {
          fields.set(field.Name, {
            type: mapSQLTypeToJSType(field.Type),
            fromMetadata: true,
            sqlType: field.Type,
            nullable: field.AllowsNull
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to load entity metadata for ${entityName}:`, error);
    }

    // Cache the result
    this.entityFieldCache.set(entityName, fields);
    return fields;
  }

  /**
   * Get query field types from spec
   */
  getQueryFieldTypes(queryName: string, categoryPath?: string): Map<string, FieldTypeInfo> | undefined {
    const queryKey = categoryPath ? `${categoryPath}/${queryName}` : queryName;
    return this.queryFieldCache.get(queryKey);
  }

  /**
   * Get query parameter types from spec
   */
  getQueryParameters(queryName: string, categoryPath?: string): ParameterTypeInfo[] | undefined {
    const queryKey = categoryPath ? `${categoryPath}/${queryName}` : queryName;
    return this.queryParamCache.get(queryKey);
  }

  /**
   * Enter a new scope (function, block, etc.)
   */
  enterScope(scopeName: string): void {
    this.scopeStack.push(scopeName);
  }

  /**
   * Exit the current scope
   */
  exitScope(): void {
    // For static analysis, we keep variables around even after exiting scope
    // This allows the linter to check them during subsequent traversals
    // We just pop the scope stack to update the "current" scope
    this.scopeStack.pop();

    // Note: Variables are NOT deleted. They remain in the typeContext with their
    // fully-qualified scoped names (e.g., "fillMissingMonths:result").
    // The getVariableType() method will still find them by searching parent scopes.
  }

  /**
   * Get the current scope prefix for variable names
   */
  private getCurrentScopePrefix(): string {
    return this.scopeStack.length > 0 ? `${this.scopeStack.join('/')}:` : '';
  }

  /**
   * Get the fully scoped name for a variable
   */
  private getScopedName(name: string): string {
    return `${this.getCurrentScopePrefix()}${name}`;
  }

  /**
   * Set a variable's type in the current scope
   */
  setVariableType(name: string, type: TypeInfo): void {
    const scopedName = this.getScopedName(name);
    this.variableTypes.set(scopedName, type);
  }

  /**
   * Get a variable's type, searching from current scope up to global
   */
  getVariableType(name: string): TypeInfo | undefined {
    // First check current scope
    const scopedName = this.getScopedName(name);
    if (this.variableTypes.has(scopedName)) {
      return this.variableTypes.get(scopedName);
    }

    // Then check parent scopes
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const prefix = this.scopeStack.slice(0, i + 1).join('/') + ':';
      const key = `${prefix}${name}`;
      if (this.variableTypes.has(key)) {
        return this.variableTypes.get(key);
      }
    }

    // Check global scope (no prefix)
    if (this.variableTypes.has(name)) {
      return this.variableTypes.get(name);
    }

    // Fallback: If scope stack is empty (e.g., during violation-checking phase),
    // search all variables for any that end with ":name" (scoped variables)
    // This handles the case where variables were defined in nested scopes during
    // the analysis phase, but we're now checking them without proper scope context
    if (this.scopeStack.length === 0) {
      for (const [key, value] of this.variableTypes.entries()) {
        if (key.endsWith(`:${name}`)) {
          return value;
        }
      }
    }

    return undefined;
  }

  /**
   * Check if a variable exists in any accessible scope
   */
  hasVariable(name: string): boolean {
    return this.getVariableType(name) !== undefined;
  }

  /**
   * Get all variables in the current scope
   */
  getCurrentScopeVariables(): Map<string, TypeInfo> {
    const prefix = this.getCurrentScopePrefix();
    const result = new Map<string, TypeInfo>();

    for (const [key, type] of this.variableTypes) {
      if (key.startsWith(prefix)) {
        const name = key.slice(prefix.length);
        result.set(name, type);
      }
    }

    return result;
  }

  /**
   * Create TypeInfo for a RunView result
   */
  createRunViewResultType(entityName: string, entityFields?: Map<string, FieldTypeInfo>): TypeInfo {
    const resultFields = new Map<string, FieldTypeInfo>([
      ['Success', { type: 'boolean', fromMetadata: true }],
      ['Results', { type: 'array', fromMetadata: true }],
      ['UserViewRunID', { type: 'string', fromMetadata: true }],
      ['RowCount', { type: 'number', fromMetadata: true }],
      ['TotalRowCount', { type: 'number', fromMetadata: true }],
      ['ExecutionTime', { type: 'number', fromMetadata: true }],
      ['ErrorMessage', { type: 'string', fromMetadata: true, nullable: true }]
    ]);

    return {
      type: 'object',
      fields: resultFields,
      fromMetadata: true
    };
  }

  /**
   * Create TypeInfo for a RunQuery result
   */
  createRunQueryResultType(queryName: string, queryFields?: Map<string, FieldTypeInfo>): TypeInfo {
    const resultFields = new Map<string, FieldTypeInfo>([
      ['QueryID', { type: 'string', fromMetadata: true }],
      ['QueryName', { type: 'string', fromMetadata: true }],
      ['Success', { type: 'boolean', fromMetadata: true }],
      ['Results', { type: 'array', fromMetadata: true }],
      ['RowCount', { type: 'number', fromMetadata: true }],
      ['TotalRowCount', { type: 'number', fromMetadata: true }],
      ['ExecutionTime', { type: 'number', fromMetadata: true }],
      ['ErrorMessage', { type: 'string', fromMetadata: true, nullable: true }],
      ['AppliedParameters', { type: 'object', fromMetadata: true }],
      ['CacheHit', { type: 'boolean', fromMetadata: true }],
      ['CacheKey', { type: 'string', fromMetadata: true, nullable: true }],
      ['CacheTTLRemaining', { type: 'number', fromMetadata: true, nullable: true }]
    ]);

    return {
      type: 'object',
      fields: resultFields,
      fromMetadata: true
    };
  }

  /**
   * Create TypeInfo for an entity row
   */
  createEntityRowType(entityName: string, fields: Map<string, FieldTypeInfo>): TypeInfo {
    return {
      type: 'entity-row',
      entityName,
      fields,
      fromMetadata: true
    };
  }

  /**
   * Create TypeInfo for a query result row
   */
  createQueryRowType(queryName: string, fields: Map<string, FieldTypeInfo>): TypeInfo {
    return {
      type: 'query-row',
      queryName,
      fields,
      fromMetadata: true
    };
  }

  /**
   * Clear all variable types (reset context)
   */
  clear(): void {
    this.variableTypes.clear();
    this.scopeStack = [];
  }

  /**
   * Get debug information about current state
   */
  getDebugInfo(): { scopes: string[], variables: [string, TypeInfo][] } {
    return {
      scopes: [...this.scopeStack],
      variables: [...this.variableTypes.entries()]
    };
  }
}

/**
 * Standard type definitions for common patterns
 */
export const StandardTypes = {
  string: { type: 'string' } as TypeInfo,
  number: { type: 'number' } as TypeInfo,
  boolean: { type: 'boolean' } as TypeInfo,
  unknown: { type: 'unknown' } as TypeInfo,
  null: { type: 'null' } as TypeInfo,
  undefined: { type: 'undefined' } as TypeInfo,
  function: { type: 'function' } as TypeInfo,

  /** Array of unknown elements */
  array: { type: 'array', arrayElementType: { type: 'unknown' } } as TypeInfo,

  /** Generic object */
  object: { type: 'object' } as TypeInfo,
};

/**
 * Helper to check if two types are compatible
 */
export function areTypesCompatible(expected: TypeInfo, actual: TypeInfo): boolean {
  // Unknown types are always compatible (we can't prove they're wrong)
  if (expected.type === 'unknown' || actual.type === 'unknown') {
    return true;
  }

  // Direct type match
  if (expected.type === actual.type) {
    return true;
  }

  // Null is compatible with nullable types
  if (actual.type === 'null' && expected.nullable) {
    return true;
  }

  // Entity-row and query-row are objects
  if (expected.type === 'object' && (actual.type === 'entity-row' || actual.type === 'query-row')) {
    return true;
  }

  return false;
}

/**
 * Get a human-readable description of a type
 */
export function describeType(type: TypeInfo): string {
  if (type.entityName) {
    return `${type.entityName} row`;
  }
  if (type.queryName) {
    return `${type.queryName} result row`;
  }
  if (type.type === 'array' && type.arrayElementType) {
    return `array of ${describeType(type.arrayElementType)}`;
  }
  return type.type;
}
