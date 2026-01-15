import mergeWith from 'lodash.mergewith';

/**
 * Configuration merge options
 */
export interface MergeOptions {
  /**
   * If true, arrays are concatenated instead of replaced.
   * Default: false (arrays replace)
   */
  concatenateArrays?: boolean;

  /**
   * If true, null values in override config will replace default values.
   * If false, null values are ignored and defaults are preserved.
   * Default: false
   */
  allowNullOverrides?: boolean;
}

/**
 * Deep merges user configuration into default configuration.
 *
 * Merge Rules:
 * 1. Primitives (string, number, boolean): User value replaces default
 * 2. Objects: Recursively merge properties
 * 3. Arrays: Replace entirely (unless concatenateArrays option is true)
 * 4. Null/Undefined: Preserved based on allowNullOverrides option
 * 5. Special _append suffix: Concatenates arrays (e.g., excludeSchemas_append)
 *
 * @param defaults - Default configuration object
 * @param overrides - User override configuration object
 * @param options - Merge behavior options
 * @returns Merged configuration object
 */
export function mergeConfigs<T extends Record<string, any>>(
  defaults: T,
  overrides: Partial<T> | undefined,
  options: MergeOptions = {}
): T {
  const { concatenateArrays = false, allowNullOverrides = false } = options;

  if (!overrides || typeof overrides !== 'object') {
    return defaults;
  }

  // Process _append suffixed keys first
  const processedOverrides = processAppendKeys(overrides, defaults);

  return mergeWith(
    {},
    defaults,
    processedOverrides,
    (defaultValue: any, overrideValue: any, key: string) => {
      return customMergeStrategy(defaultValue, overrideValue, key, {
        concatenateArrays,
        allowNullOverrides
      });
    }
  );
}

/**
 * Processes keys with _append suffix to concatenate arrays
 */
function processAppendKeys(
  overrides: Record<string, any>,
  defaults: Record<string, any>
): Record<string, any> {
  const processed = { ...overrides };

  for (const key in overrides) {
    if (key.endsWith('_append')) {
      const baseKey = key.slice(0, -7); // Remove '_append' suffix
      const defaultValue = defaults[baseKey];
      const appendValue = overrides[key];

      if (Array.isArray(defaultValue) && Array.isArray(appendValue)) {
        processed[baseKey] = [...defaultValue, ...appendValue];
        delete processed[key]; // Remove the _append key
      } else {
        console.warn(
          `Warning: ${key} expects both default and override to be arrays. ` +
          `Default type: ${typeof defaultValue}, Override type: ${typeof appendValue}`
        );
      }
    }
  }

  return processed;
}

/**
 * Custom merge strategy for lodash.mergeWith
 */
function customMergeStrategy(
  defaultValue: any,
  overrideValue: any,
  key: string,
  options: MergeOptions
): any {
  const { concatenateArrays, allowNullOverrides } = options;

  // Handle null/undefined overrides
  if (overrideValue === null || overrideValue === undefined) {
    return allowNullOverrides ? overrideValue : defaultValue;
  }

  // Arrays: Replace or concatenate based on option
  if (Array.isArray(defaultValue) && Array.isArray(overrideValue)) {
    return concatenateArrays ? [...defaultValue, ...overrideValue] : overrideValue;
  }

  // Objects: Let lodash continue recursive merge (return undefined)
  if (isPlainObject(defaultValue) && isPlainObject(overrideValue)) {
    return undefined; // Continue default merge behavior
  }

  // Primitives: Override replaces default
  return overrideValue;
}

/**
 * Checks if value is a plain object (not array, not class instance)
 */
function isPlainObject(value: any): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Validates merged configuration against expected structure.
 * Logs warnings for unexpected keys that might indicate typos.
 *
 * @param config - Merged configuration object
 * @param allowedKeys - Set of allowed top-level keys
 */
export function validateConfigStructure(
  config: Record<string, any>,
  allowedKeys: Set<string>
): void {
  const configKeys = Object.keys(config);
  const unexpectedKeys = configKeys.filter(key => !allowedKeys.has(key));

  if (unexpectedKeys.length > 0) {
    console.warn(
      `Warning: Unexpected configuration keys found: ${unexpectedKeys.join(', ')}. ` +
      `These may be typos or deprecated settings.`
    );
  }
}
