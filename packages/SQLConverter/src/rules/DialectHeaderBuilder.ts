/**
 * Pluggable header builder for SQL conversion output.
 *
 * Different target dialects need different file headers (e.g., PostgreSQL needs
 * CREATE EXTENSION and implicit cast setup, MySQL needs SET statements, etc.).
 * Implementations provide a dialect-specific header given a target schema name.
 */

/**
 * Interface for dialect-specific output file headers.
 */
export interface DialectHeaderBuilder {
  /** Target dialect identifier (e.g., 'postgres', 'mysql') */
  readonly TargetDialect: string;
  /** Build the header string for the given schema */
  BuildHeader(schema: string): string;
}

/**
 * PostgreSQL header builder.
 *
 * Produces the standard MJ PostgreSQL header with:
 * - pgcrypto and uuid-ossp extensions
 * - Schema creation and search_path
 * - Standard conforming strings
 * - Implicit integer->boolean cast (for BIT column compatibility)
 */
export class PostgreSQLHeaderBuilder implements DialectHeaderBuilder {
  readonly TargetDialect = 'postgres';

  BuildHeader(schema: string): string {
    return `-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS ${schema};
SET search_path TO ${schema}, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER -> BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only int->bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;

`;
  }
}

/**
 * Registry of header builders keyed by target dialect.
 */
const headerBuilders = new Map<string, DialectHeaderBuilder>();

/** Register the built-in PostgreSQL header builder */
headerBuilders.set('postgres', new PostgreSQLHeaderBuilder());

/**
 * Register a custom header builder for a target dialect.
 */
export function registerHeaderBuilder(builder: DialectHeaderBuilder): void {
  headerBuilders.set(builder.TargetDialect.toLowerCase(), builder);
}

/**
 * Get the header builder for a given target dialect.
 * Returns undefined if no builder is registered.
 */
export function getHeaderBuilder(targetDialect: string): DialectHeaderBuilder | undefined {
  return headerBuilders.get(targetDialect.toLowerCase());
}
