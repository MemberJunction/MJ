/**
 * Shared utilities for SchemaEngine — identifier validation and SQL escaping.
 */

/** Characters allowed in SQL identifiers (schema, table, column names). */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Validates that an identifier contains only safe characters. */
export function ValidateIdentifier(name: string, kind: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`Invalid ${kind} name "${name}": must match ${IDENTIFIER_RE.source}`);
  }
}

/** Escapes single quotes in a string for use in SQL string literals. */
export function EscapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
