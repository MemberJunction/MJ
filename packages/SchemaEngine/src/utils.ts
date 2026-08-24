/**
 * Shared utilities for SchemaEngine — identifier validation and SQL escaping.
 */

import { EscapeSQLString } from '@memberjunction/global';

/** Characters allowed in SQL identifiers (schema, table, column names). */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Validates that an identifier contains only safe characters. */
export function ValidateIdentifier(name: string, kind: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`Invalid ${kind} name "${name}": must match ${IDENTIFIER_RE.source}`);
  }
}

/**
 * Escapes single quotes in a string for use in SQL string literals.
 *
 * @deprecated Import `EscapeSQLString` from `@memberjunction/global` instead — it is the one
 * canonical escaper. This alias remains only so external callers do not break; it will be
 * removed in the next major. For identifiers use {@link ValidateIdentifier}, not this.
 */
export const EscapeSqlString = (value: string | null | undefined): string => EscapeSQLString(value);
