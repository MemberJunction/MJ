/**
 * Shared DDL utilities — used by both DDLGenerator and platform providers.
 * Lives here to avoid circular imports between DDLGenerator ↔ providers.
 *
 * Providers are free to use these helpers or ignore them entirely —
 * they're conveniences, not part of the provider contract.
 */
import type { ColumnDefinition } from '../interfaces.js';

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

/**
 * Apply MaxLength to a string-type base (e.g., "NVARCHAR" → "NVARCHAR(200)").
 * If MaxLength exceeds maxBeforeOverflow, returns overflowType instead.
 * Defaults to (255) when no MaxLength is specified.
 *
 * Providers can call this or implement their own length logic.
 */
export function ApplyStringLength(
  base: string,
  col: ColumnDefinition,
  maxBeforeOverflow?: number,
  overflowType?: string,
): string {
  if (col.MaxLength != null && col.MaxLength > 0) {
    if (maxBeforeOverflow != null && col.MaxLength > maxBeforeOverflow) {
      return overflowType ?? base;
    }
    return `${base}(${col.MaxLength})`;
  }
  return `${base}(255)`;
}

/**
 * Apply Precision and Scale to a decimal-type base (e.g., "DECIMAL" → "DECIMAL(18,2)").
 * Defaults to (18,2) when not specified.
 *
 * Providers can call this or implement their own precision logic.
 */
export function ApplyDecimalPrecision(base: string, col: ColumnDefinition): string {
  return `${base}(${col.Precision ?? 18},${col.Scale ?? 2})`;
}
