/**
 * Centralized metadata keyword constants for MemberJunction MetadataSync package.
 *
 * These keywords are special prefixes used in metadata JSON files to reference external
 * content, perform lookups, access environment variables, and establish hierarchical relationships.
 *
 * @module metadata-keywords
 *
 * @example
 * // Using @file: to reference external content
 * {
 *   "Prompt": "@file:greeting.prompt.md"
 * }
 *
 * @example
 * // Using @lookup: to find an entity by field value
 * {
 *   "CategoryID": "@lookup:AI Prompt Categories.Name=Examples"
 * }
 *
 * @example
 * // Using @parent: to reference parent entity fields
 * {
 *   "PromptID": "@parent:ID"
 * }
 */

/**
 * Metadata keyword constants.
 * These are the special @ prefixes recognized by MetadataSync for field value processing.
 */
export const METADATA_KEYWORDS = {
  /**
   * @file: - Loads content from an external file
   *
   * Reads the contents of a file (relative to the JSON metadata file) and uses it as the field value.
   * Supports text files, markdown, JSON, and other formats.
   *
   * @example
   * "@file:greeting.prompt.md"
   * "@file:./shared/common-prompt.md"
   * "@file:../templates/standard-header.md"
   */
  FILE: '@file:',

  /**
   * @lookup: - Looks up an entity record by field value(s)
   *
   * Finds an entity record matching the specified criteria and uses its ID.
   * Supports single-field and multi-field lookups, with optional auto-creation.
   *
   * @example
   * "@lookup:AI Prompt Types.Name=Chat"
   * "@lookup:Users.Email=john@example.com&Department=Sales"
   * "@lookup:Categories.Name=Examples?create"
   * "@lookup:Categories.Name=Examples?create&Description=Example prompts"
   */
  LOOKUP: '@lookup:',

  /**
   * @parent: - References a field from the parent entity
   *
   * In nested/related entity structures, accesses a field value from the immediate parent record.
   * Only valid when processing nested entities that have a parent context.
   *
   * @example
   * "@parent:ID"
   * "@parent:Name"
   * "@parent:CategoryID"
   */
  PARENT: '@parent:',

  /**
   * @root: - References a field from the root entity
   *
   * In nested/related entity structures, accesses a field value from the top-level root record.
   * Only valid when processing nested entities that have a root context.
   *
   * @example
   * "@root:ID"
   * "@root:Name"
   */
  ROOT: '@root:',

  /**
   * @env: - Reads an environment variable
   *
   * Gets the value of an environment variable at runtime.
   * Useful for configuration values that differ between environments.
   *
   * @example
   * "@env:VARIABLE_NAME"
   * "@env:NODE_ENV"
   */
  ENV: '@env:',

  /**
   * @url: - Fetches content from a URL
   *
   * Downloads content from a remote URL and uses it as the field value.
   * Supports HTTP/HTTPS URLs and file:// URLs.
   *
   * @example
   * "@url:https://example.com/prompts/greeting.md"
   * "@url:https://raw.githubusercontent.com/company/prompts/main/customer.md"
   */
  URL: '@url:',

  /**
   * @template: - Loads a template JSON file
   *
   * Loads a JSON template file and uses its contents, replacing any template variables.
   * Useful for standardizing common configurations across multiple records.
   *
   * @example
   * "@template:templates/standard-ai-models.json"
   */
  TEMPLATE: '@template:',

  /**
   * @include or @include.* - Includes content from another file
   *
   * Special directive (not a field value) that merges content from external files.
   * Can be used in both objects and arrays. Supports spread and property modes.
   *
   * @example
   * { "@include": "common-fields.json" }
   * [ "@include:items.json" ]
   * { "@include.models": { "file": "models.json", "mode": "property" } }
   */
  INCLUDE: '@include',
} as const;

/**
 * Type representing all metadata keyword values.
 */
export type MetadataKeyword = typeof METADATA_KEYWORDS[keyof typeof METADATA_KEYWORDS];

/**
 * Type representing metadata keyword types (without the colon for keywords that have it).
 */
export type MetadataKeywordType = 'file' | 'lookup' | 'parent' | 'root' | 'env' | 'url' | 'template' | 'include';

/**
 * Array of all metadata keyword prefixes for iteration.
 * This array maintains the order of keywords for consistent processing.
 */
export const METADATA_KEYWORD_PREFIXES: ReadonlyArray<string> = Object.values(METADATA_KEYWORDS);

/**
 * Checks if a value is a string that starts with any recognized metadata keyword.
 *
 * This is a type-safe check that handles non-string values gracefully.
 * Returns false for null, undefined, objects, numbers, etc.
 *
 * @param value - The value to check (can be any type)
 * @returns true if value is a string starting with a metadata keyword, false otherwise
 *
 * @example
 * isMetadataKeyword('@file:template.md')  // true
 * isMetadataKeyword('@lookup:Users.Email=test@example.com')  // true
 * isMetadataKeyword('@parent:ID')  // true
 * isMetadataKeyword('regular string')  // false
 * isMetadataKeyword(123)  // false
 * isMetadataKeyword(null)  // false
 * isMetadataKeyword('@unknown:value')  // false
 */
export function isMetadataKeyword(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  return METADATA_KEYWORD_PREFIXES.some(prefix => value.startsWith(prefix));
}

/**
 * Determines which metadata keyword type a string value uses.
 *
 * Examines the prefix of a string and returns the corresponding keyword type.
 * Returns null if the value doesn't use any recognized metadata keyword.
 *
 * @param value - The string value to analyze
 * @returns The keyword type ('file', 'lookup', etc.) or null if no keyword is found
 *
 * @example
 * getMetadataKeywordType('@file:template.md')  // 'file'
 * getMetadataKeywordType('@lookup:Users.Name=John')  // 'lookup'
 * getMetadataKeywordType('@parent:ID')  // 'parent'
 * getMetadataKeywordType('@include')  // 'include'
 * getMetadataKeywordType('regular string')  // null
 * getMetadataKeywordType('@unknown:value')  // null
 */
export function getMetadataKeywordType(value: string): MetadataKeywordType | null {
  if (typeof value !== 'string') {
    return null;
  }

  // Special handling for @include which doesn't require a colon
  if (value === METADATA_KEYWORDS.INCLUDE || value.startsWith(`${METADATA_KEYWORDS.INCLUDE}.`)) {
    return 'include';
  }

  // Check all other keywords
  for (const [key, prefix] of Object.entries(METADATA_KEYWORDS)) {
    if (key === 'INCLUDE') continue; // Already handled above

    if (value.startsWith(prefix)) {
      return key.toLowerCase() as MetadataKeywordType;
    }
  }

  return null;
}

/**
 * Type-safe check for metadata keywords that handles any value type.
 *
 * This is an alias for isMetadataKeyword() provided for semantic clarity
 * when you want to explicitly check if a value has a metadata keyword.
 *
 * @param value - Any value to check
 * @returns true if value is a string with a metadata keyword, false otherwise
 *
 * @example
 * const fieldValue = record.Get('SomeField');
 * if (hasMetadataKeyword(fieldValue)) {
 *   // fieldValue is guaranteed to be a string with a metadata keyword
 *   const type = getMetadataKeywordType(fieldValue);
 * }
 */
export function hasMetadataKeyword(value: unknown): value is string {
  return isMetadataKeyword(value);
}

/**
 * Checks if a string starts with @ but is NOT a metadata keyword.
 *
 * This is useful for filtering out @ strings that are not metadata keywords,
 * such as npm package names (@mui/material, @angular/core) or email addresses.
 *
 * @param value - The value to check
 * @returns true if value starts with @ but is not a metadata keyword
 *
 * @example
 * isNonKeywordAtSymbol('@mui/material')  // true
 * isNonKeywordAtSymbol('@angular/core')  // true
 * isNonKeywordAtSymbol('@file:template.md')  // false
 * isNonKeywordAtSymbol('regular string')  // false
 */
export function isNonKeywordAtSymbol(value: unknown): boolean {
  return typeof value === 'string' &&
         value.startsWith('@') &&
         !isMetadataKeyword(value);
}

/**
 * Extracts the value portion after a metadata keyword prefix.
 *
 * Removes the keyword prefix from a string and returns the remaining value.
 * Returns null if the string doesn't use a metadata keyword.
 *
 * @param value - The string containing a metadata keyword
 * @returns The value after the keyword prefix, or null if no keyword found
 *
 * @example
 * extractKeywordValue('@file:template.md')  // 'template.md'
 * extractKeywordValue('@lookup:Users.Email=test@example.com')  // 'Users.Email=test@example.com'
 * extractKeywordValue('@parent:ID')  // 'ID'
 * extractKeywordValue('regular string')  // null
 */
export function extractKeywordValue(value: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const keywordType = getMetadataKeywordType(value);
  if (!keywordType) {
    return null;
  }

  // Special handling for @include
  if (keywordType === 'include') {
    if (value === METADATA_KEYWORDS.INCLUDE) {
      return '';  // Just '@include' with no suffix
    }
    if (value.startsWith(`${METADATA_KEYWORDS.INCLUDE}.`)) {
      return value.substring(METADATA_KEYWORDS.INCLUDE.length + 1);  // Remove '@include.'
    }
    return null;
  }

  // For all other keywords, find the matching prefix and remove it
  for (const prefix of METADATA_KEYWORD_PREFIXES) {
    if (value.startsWith(prefix)) {
      return value.substring(prefix.length);
    }
  }

  return null;
}

/**
 * List of metadata keywords that require a parent context to function.
 * These keywords cannot be used at the top level of metadata - they only work
 * in nested/related entities where a parent record exists.
 */
export const CONTEXT_DEPENDENT_KEYWORDS = [
  METADATA_KEYWORDS.PARENT,
  METADATA_KEYWORDS.ROOT,
] as const;

/**
 * List of metadata keywords that reference external resources.
 * These keywords load content from files, URLs, or other external sources.
 */
export const EXTERNAL_REFERENCE_KEYWORDS = [
  METADATA_KEYWORDS.FILE,
  METADATA_KEYWORDS.URL,
  METADATA_KEYWORDS.TEMPLATE,
] as const;

/**
 * List of metadata keywords that perform database lookups.
 */
export const LOOKUP_KEYWORDS = [
  METADATA_KEYWORDS.LOOKUP,
] as const;

/**
 * List of metadata keywords that access runtime configuration.
 */
export const RUNTIME_KEYWORDS = [
  METADATA_KEYWORDS.ENV,
] as const;

/**
 * Checks if a keyword requires a parent/root context.
 *
 * @param keyword - The keyword to check
 * @returns true if the keyword requires context (parent or root)
 *
 * @example
 * isContextDependentKeyword('@parent:')  // true
 * isContextDependentKeyword('@root:')  // true
 * isContextDependentKeyword('@file:')  // false
 */
export function isContextDependentKeyword(keyword: string): boolean {
  return CONTEXT_DEPENDENT_KEYWORDS.some(k => keyword.startsWith(k));
}

/**
 * Checks if a keyword references an external resource.
 *
 * @param keyword - The keyword to check
 * @returns true if the keyword loads external content
 *
 * @example
 * isExternalReferenceKeyword('@file:')  // true
 * isExternalReferenceKeyword('@url:')  // true
 * isExternalReferenceKeyword('@lookup:')  // false
 */
export function isExternalReferenceKeyword(keyword: string): boolean {
  return EXTERNAL_REFERENCE_KEYWORDS.some(k => keyword.startsWith(k));
}

/**
 * Creates a metadata keyword reference string.
 *
 * Helper function to construct properly formatted keyword references.
 * This ensures consistent formatting across the codebase.
 *
 * @param type - The keyword type
 * @param value - The value after the keyword
 * @returns Formatted keyword reference string
 *
 * @example
 * createKeywordReference('file', 'template.md')  // '@file:template.md'
 * createKeywordReference('lookup', 'Users.Email=test@example.com')  // '@lookup:Users.Email=test@example.com'
 * createKeywordReference('parent', 'ID')  // '@parent:ID'
 */
export function createKeywordReference(type: MetadataKeywordType, value: string): string {
  const keyword = METADATA_KEYWORDS[type.toUpperCase() as keyof typeof METADATA_KEYWORDS];

  if (!keyword) {
    throw new Error(`Unknown metadata keyword type: ${type}`);
  }

  // Special handling for @include
  if (type === 'include') {
    return value ? `${keyword}.${value}` : keyword;
  }

  return `${keyword}${value}`;
}
