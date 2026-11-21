/**
 * Shared parameter-reading helpers for compliance rule drivers.
 * Supports both camelCase and PascalCase keys from JSON rule parameters.
 */

/** Returns the value of the first of the given keys that is present and not null in `params`. */
export function ReadParamValue<T>(
  params: Record<string, unknown>,
  ...keys: string[]
): T | undefined {
  for (const key of keys) {
    if (key in params && params[key] !== undefined && params[key] !== null) {
      return params[key] as T;
    }
  }
  return undefined;
}

/** Reads a boolean parameter, also accepting the strings `'true'` and `'false'`. */
export function ReadBooleanParam(
  params: Record<string, unknown>,
  ...keys: string[]
): boolean | undefined {
  const val = ReadParamValue<unknown>(params, ...keys);
  if (typeof val === 'boolean') {
    return val;
  }
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return undefined;
}

/** Reads a finite number parameter, also accepting numeric strings. */
export function ReadNumberParam(
  params: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  const val = ReadParamValue<unknown>(params, ...keys);
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  if (typeof val === 'string' && val.trim().length > 0) {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

/** Reads a string parameter, trimmed. */
export function ReadStringParam(
  params: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  const val = ReadParamValue<unknown>(params, ...keys);
  if (typeof val === 'string') {
    return val.trim();
  }
  return undefined;
}
