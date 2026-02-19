/**
 * GraphQL Type Name Generation Utilities
 *
 * This module provides utility functions for generating valid GraphQL type names
 * from database entity metadata. These utilities ensure type names are valid
 * according to GraphQL specifications and provide consistent naming across
 * different schemas.
 */

import { EntityInfo } from './entityInfo';

/**
 * The core schema name constant. This should match the mjCoreSchema config value.
 *
 */
export const MJ_CORE_SCHEMA = '__mj';

/**
 * Sanitizes a string to be a valid GraphQL name component, preserving original capitalization.
 * GraphQL names must match the pattern [_A-Za-z][_0-9A-Za-z]* and cannot start with double underscore
 *
 * @param input - The string to sanitize
 * @returns A valid GraphQL name component with special characters removed
 *
 * @example
 * ```typescript
 * // Input: Schema name with special characters
 * sanitizeGraphQLName("my-schema")
 * // Output: "myschema"
 * ```
 *
 * @example
 * ```typescript
 * // Input: Name starting with double underscore (reserved)
 * sanitizeGraphQLName("__mj_User")
 * // Output: "mjUser"
 * // (Removes __ prefix and underscores)
 * ```
 *
 * @example
 * ```typescript
 * // Input: Name starting with a digit
 * sanitizeGraphQLName("123Orders")
 * // Output: "_123Orders"
 * // (Prepends underscore since GraphQL names can't start with digits)
 * ```
 *
 * @example
 * ```typescript
 * // Input: Preserves capitalization
 * sanitizeGraphQLName("MyTable_Name")
 * // Output: "MyTableName"
 * // (Removes underscores but preserves case)
 * ```
 *
 * @example
 * ```typescript
 * // Input: Empty or invalid input
 * sanitizeGraphQLName("")
 * // Output: ""
 *
 * sanitizeGraphQLName("!!!###")
 * // Output: "_"
 * // (All chars removed, so prepends underscore)
 * ```
 */
export function sanitizeGraphQLName(input: string): string {
    if (!input || input.length === 0) {
        return '';
    }

    // Replace any non-alphanumeric characters (except underscore) with nothing to preserve capitalization
    let sanitized = input.replace(/[^A-Za-z0-9_]/g, '');

    // If the name starts with two underscores, remove them
    // (double underscore is reserved for GraphQL introspection)
    if (sanitized.startsWith('__')) {
        sanitized = sanitized.substring(2);
    }

    // Remove any remaining underscores
    sanitized = sanitized.replace(/_/g, '');

    // If the result starts with a digit or is empty, prepend an underscore
    if (sanitized.length === 0 || /^[0-9]/.test(sanitized)) {
        return '_' + sanitized;
    }

    return sanitized;
}

/**
 * Returns the schema-based prefix for programmatic identifiers (class names, GraphQL types).
 * This is the single source of truth for schema-to-prefix mapping, shared by both TypeScript
 * codegen and SQL (via GetClassNameSchemaPrefix function in the database).
 *
 * Special cases:
 * - `__mj` (core MJ schema) → `"MJ"`
 * - `MJ` (literal schema name) → `"MJCustom"` (prevents collision with core schema prefix)
 * - All others → sanitized schema name via {@link sanitizeGraphQLName}
 *
 * @param schemaName - The SQL schema name
 * @returns The clean prefix string to prepend to type/class names
 *
 * @example
 * ```typescript
 * getSchemaPrefix('__mj')   // "MJ"
 * getSchemaPrefix('MJ')     // "MJCustom"
 * getSchemaPrefix('sales')  // "sales"
 * ```
 */
export function getSchemaPrefix(schemaName: string): string {
    const trimmed = schemaName.trim().toLowerCase();

    // Core MJ schema: __mj -> 'MJ'
    if (trimmed === MJ_CORE_SCHEMA.trim().toLowerCase()) {
        return 'MJ';
    }

    // Guard: a schema literally named 'MJ' would collide with __mj's 'MJ' prefix
    if (trimmed === 'mj') {
        return 'MJCustom';
    }

    // Default: sanitize the schema name
    return sanitizeGraphQLName(schemaName);
}

/**
 * Generates the base GraphQL type name for an entity using SchemaBaseTable pattern.
 * Preserves original capitalization. Uses {@link getSchemaPrefix} for the schema prefix,
 * which aligns with the SQL GetClassNameSchemaPrefix function in vwEntities.
 * This ensures unique type names across different schemas.
 *
 * @param entity - The entity to generate the type name for
 * @returns The base GraphQL type name (without suffix like ViewByID, DynamicView, etc.)
 *
 * @example
 * ```typescript
 * // Entity in core schema
 * const entity = { SchemaName: '__mj', BaseTable: 'User' };
 * getGraphQLTypeNameBase(entity)
 * // Output: "MJUser"
 * ```
 *
 * @example
 * ```typescript
 * // Entity in custom schema
 * const entity = { SchemaName: 'sales', BaseTable: 'Invoice' };
 * getGraphQLTypeNameBase(entity)
 * // Output: "salesInvoice"
 * ```
 */
export function getGraphQLTypeNameBase(entity: EntityInfo): string {
    const schemaPrefix = getSchemaPrefix(entity.SchemaName);
    const sanitizedBaseTable = sanitizeGraphQLName(entity.BaseTable);
    return `${schemaPrefix}${sanitizedBaseTable}`;
}
