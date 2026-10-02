/**
 * Error handling utilities
 *
 * Standardized error handling functions following MJ patterns
 */

/**
 * Extract error message from unknown error type
 * Uses MJ's extractErrorMessage pattern
 */
export function ExtractErrorMessage(error: unknown, context: string): string {
  if (error instanceof Error) {
    return `${context}: ${error.message}`;
  }
  if (typeof error === 'string') {
    return `${context}: ${error}`;
  }
  return `${context}: Unknown error occurred`;
}

/** @deprecated Use {@link ExtractErrorMessage}. */
export function extractErrorMessage(error: unknown, context: string): string {
  return ExtractErrorMessage(error, context);
}

/**
 * Validate required value is not null/undefined
 */
export function RequireValue<T>(value: T | null | undefined, fieldName: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Required value '${fieldName}' is missing`);
  }
  return value;
}

/** @deprecated Use {@link RequireValue}. */
export function requireValue<T>(value: T | null | undefined, fieldName: string): T {
  return RequireValue(value, fieldName);
}

/**
 * Get property with fallback value
 */
export function GetPropertyOrDefault<T>(
  obj: Record<string, unknown>,
  key: string,
  defaultValue: T
): T {
  const value = obj[key];
  return value !== undefined ? (value as T) : defaultValue;
}

/** @deprecated Use {@link GetPropertyOrDefault}. */
export function getPropertyOrDefault<T>(
  obj: Record<string, unknown>,
  key: string,
  defaultValue: T
): T {
  return GetPropertyOrDefault(obj, key, defaultValue);
}
