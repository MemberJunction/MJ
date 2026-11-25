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
  /**
   * Build the header string for the given schema.
   *
   * @param schema - The target schema the converted file is written for.
   * @param body - The converted SQL that will follow the header. A builder uses it to emit only the
   *   prerequisites the body actually needs (for PostgreSQL, the extensions it calls into). Builders
   *   that need nothing from the body may ignore it.
   */
  BuildHeader(schema: string, body: string): string;
}

/**
 * A PostgreSQL extension and the functions that make a converted body depend on it.
 */
export interface PgExtensionRequirement {
  /** The extension name, as written in `CREATE EXTENSION`. */
  readonly Extension: string;
  /** Matches a call to any function the extension provides. */
  readonly Pattern: RegExp;
}

/**
 * The extensions a converted migration may need, and how to tell from its body.
 *
 * The conversion itself needs neither: MJ's PostgreSQL floor is 14, and `gen_random_uuid()` — the only
 * UUID generator the converter emits — has been built in since PostgreSQL 13. Managed hosts (Azure
 * HorizonDB, Azure Flexible Server, some RDS parameter groups) refuse a `CREATE EXTENSION` that is not
 * on their allowlist, so an unused one is a pure liability. Each is emitted only when the body calls
 * one of its functions.
 *
 * The patterns are deliberately broad. They scan the raw text, comments and string literals included,
 * because a call can sit inside dynamic SQL (`EXECUTE '... digest(...) ...'`). A false positive only
 * restores the old behaviour of emitting the extension; a false negative breaks the migration.
 */
export const PG_EXTENSION_REQUIREMENTS: readonly PgExtensionRequirement[] = Object.freeze([
  {
    Extension: 'pgcrypto',
    Pattern: /\b(?:digest|hmac|crypt|gen_salt|gen_random_bytes|encrypt|decrypt|encrypt_iv|decrypt_iv|armor|dearmor|pgp_[a-z0-9_]+)\s*\(/i,
  },
  {
    Extension: 'uuid-ossp',
    Pattern: /\b(?:uuid_generate_v[1345](?:mc)?|uuid_nil|uuid_ns_(?:dns|url|oid|x500))\s*\(/i,
  },
]);

/**
 * Names the PostgreSQL extensions a converted body calls into, in a stable order.
 *
 * @param body - Converted PostgreSQL SQL.
 * @returns The names from {@link PG_EXTENSION_REQUIREMENTS} whose functions the body calls.
 */
export function RequiredPgExtensions(body: string): string[] {
  return PG_EXTENSION_REQUIREMENTS.filter((req) => req.Pattern.test(body)).map((req) => req.Extension);
}

/**
 * Builds the `CREATE EXTENSION` block for a converted body: one statement per extension the body
 * needs, or a comment saying none is needed. Every PostgreSQL header the converter emits (the
 * rule-based pipeline and both split-and-regenerate headers) uses it, so the rule has one home.
 *
 * @param body - Converted PostgreSQL SQL that will follow the header.
 * @returns The extension lines, without a trailing newline.
 */
export function BuildPgExtensionStatements(body: string): string {
  const needed = RequiredPgExtensions(body);
  if (needed.length === 0) {
    return '-- None required: UUID defaults use the built-in gen_random_uuid() (PostgreSQL 13+).';
  }
  return needed.map((ext) => `CREATE EXTENSION IF NOT EXISTS "${ext}";`).join('\n');
}

/**
 * PostgreSQL header builder.
 *
 * Produces the standard MJ PostgreSQL header with:
 * - only the extensions the body calls into (see {@link PG_EXTENSION_REQUIREMENTS})
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

  BuildHeader(schema: string, body: string): string {
    return `-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
${BuildPgExtensionStatements(body)}

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
export function RegisterHeaderBuilder(builder: DialectHeaderBuilder): void {
  headerBuilders.set(builder.TargetDialect.toLowerCase(), builder);
}

/** @deprecated Use {@link RegisterHeaderBuilder}. */
export function registerHeaderBuilder(builder: DialectHeaderBuilder): void {
  return RegisterHeaderBuilder(builder);
}

/**
 * Get the header builder for a given target dialect.
 * Returns undefined if no builder is registered.
 */
export function GetHeaderBuilder(targetDialect: string): DialectHeaderBuilder | undefined {
  return headerBuilders.get(targetDialect.toLowerCase());
}

/** @deprecated Use {@link GetHeaderBuilder}. */
export function getHeaderBuilder(targetDialect: string): DialectHeaderBuilder | undefined {
  return GetHeaderBuilder(targetDialect);
}
