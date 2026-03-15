/**
 * BaseDDLPlatformProvider — abstract base class for platform-specific DDL generation.
 *
 * To add support for a new database platform (e.g., MySQL):
 *   1. Create a new file (e.g., MySqlDDLProvider.ts)
 *   2. Extend BaseDDLPlatformProvider
 *   3. Implement all abstract methods
 *   4. Decorate with @RegisterClass(BaseDDLPlatformProvider, 'mysql')
 *   5. Import the file so it registers at startup
 *
 * DDLGenerator discovers providers via MJ's ClassFactory — no code changes needed
 * in DDLGenerator itself when adding new platforms.
 */
import type { ColumnDefinition, ColumnModification } from '../interfaces.js';

export abstract class BaseDDLPlatformProvider {
  /** Quote an identifier for this platform (e.g., [name] or "name"). */
  abstract QuoteIdentifier(name: string): string;

  /** Generate CREATE SCHEMA IF NOT EXISTS. */
  abstract CreateSchema(schemaName: string): string;

  /** Generate the ADD column clause for ALTER TABLE. */
  abstract AddColumnClause(quotedColName: string, colBody: string): string;

  /**
   * Generate ALTER COLUMN clause(s) for type/nullability changes.
   * May return multiple statements (e.g., PostgreSQL needs separate TYPE and NULL changes).
   */
  abstract AlterColumnClause(quotedTable: string, quotedColName: string, mod: ColumnModification): string;

  /** Generate description metadata for a table (sp_addextendedproperty, COMMENT ON, etc.). */
  abstract DescribeTable(schemaName: string, tableName: string, description: string): string;

  /** Generate description metadata for a column. */
  abstract DescribeColumn(schemaName: string, tableName: string, columnName: string, description: string): string;

  /**
   * Resolve an abstract SchemaFieldType to a concrete SQL type string.
   * Handles platform-specific type names, max lengths, and precision.
   */
  abstract ResolveType(col: ColumnDefinition): string;

  /** Fallback type for unrecognized abstract types. */
  abstract FallbackType(): string;

  /**
   * Platform-specific reserved name prefixes (e.g., 'dbo', 'pg_').
   * Subclasses return only their platform's system prefixes.
   */
  abstract PlatformReservedPrefixes(): string[];

  /**
   * All reserved name prefixes — MJ common + platform-specific.
   * Used by validation to block user-defined names that would collide
   * with system schemas or MJ internals on either database platform.
   */
  ReservedNamePrefixes(): string[] {
    return [...COMMON_RESERVED_PREFIXES, ...this.PlatformReservedPrefixes()];
  }
}

/** Prefixes reserved by MJ on all platforms (both SQL Server and PostgreSQL via Skyway). */
const COMMON_RESERVED_PREFIXES = ['__mj', 'sys', 'mj_', 'information_schema'];
