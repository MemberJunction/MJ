/**
 * Parses a boolean environment variable with support for common truthy values.
 *
 * Accepts the following as TRUE (case-insensitive):
 * - 'true', 'True', 'TRUE'
 * - '1'
 * - 'yes', 'Yes', 'YES'
 * - 'y', 'Y'
 * - 'on', 'On', 'ON'
 * - 't', 'T'
 *
 * All other values (including undefined, empty string, null) return FALSE.
 *
 * @param value - The environment variable value to parse
 * @returns true if the value matches a truthy pattern, false otherwise
 *
 * @example
 * ```typescript
 * import { parseBooleanEnv } from '@memberjunction/config';
 *
 * // All return true
 * parseBooleanEnv('true');
 * parseBooleanEnv('True');
 * parseBooleanEnv('TRUE');
 * parseBooleanEnv('1');
 * parseBooleanEnv('yes');
 * parseBooleanEnv('Y');
 * parseBooleanEnv('on');
 *
 * // All return false
 * parseBooleanEnv('false');
 * parseBooleanEnv('0');
 * parseBooleanEnv('no');
 * parseBooleanEnv(undefined);
 * parseBooleanEnv('');
 * ```
 */
export function parseBooleanEnv(value: string | undefined | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  const truthyValues = ['true', '1', 'yes', 'y', 'on', 't'];

  return truthyValues.includes(normalized);
}
