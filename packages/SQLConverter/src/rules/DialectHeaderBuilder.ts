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
 *
 * EVERY line of the emitted header — comments included — must be schema-agnostic. The header is
 * built for whatever schema the caller names, so a literal like `__mj` in the prose is wrong for
 * every other target and misleading in the file it lands in. `DialectHeaderBuilder.test.ts` asserts
 * that `BuildHeader('custom')` contains no `__mj`; that is what caught the worked example this
 * file's CREATE SCHEMA note used to carry.
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
--
-- The schema name is emitted UNQUOTED, so PostgreSQL folds it to lowercase. That is deliberate and
-- self-consistent: everything downstream in a converted migration refers to it unquoted too, so
-- both definition and lookup land on the same folded name.
--
-- DOWNSTREAM NOTE for the build engineer: a PostgreSQL database that was populated by an EARLIER
-- converter — one that emitted a quoted, case-preserved name — already holds that mixed-case
-- schema: for a target named MySchema_Name, the quoted "MySchema_Name". Re-converting against
-- that database creates a SECOND, empty schema myschema_name rather than reusing the existing
-- one, because IF NOT EXISTS compares the folded name and finds no match. The repo's own committed
-- migrations-pg files are unaffected (the only quoted CREATE SCHEMAs there are the four pg_dump
-- baselines, which this path does not produce), so this is an open-app / downstream concern, not
-- one for this repo's Flyway history.
CREATE SCHEMA IF NOT EXISTS ${schema};
SET search_path TO ${schema}, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.

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
