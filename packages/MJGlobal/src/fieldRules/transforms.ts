/**
 * Field-value transform pipeline types.
 *
 * This package is the canonical home for these types. The MemberJunction integration field-mapping
 * engine and the rules-based bulk-update processor both consume them — author once, reuse everywhere.
 */

/** Supported transform types for field value transformation */
export type TransformType =
    | 'direct'
    | 'regex'
    | 'split'
    | 'combine'
    | 'lookup'
    | 'format'
    | 'coerce'
    | 'substring'
    | 'custom'
    | 'jsonpath'
    | 'xpath';

/** What to do when a transform step encounters an error */
export type TransformOnError = 'Skip' | 'Null' | 'Fail';

/** A single step in a field value transformation pipeline */
export interface TransformStep {
    /** The type of transform to apply */
    Type: TransformType;
    /** Configuration for the transform step */
    Config: TransformConfig;
    /** Error handling strategy for this step. Defaults to 'Null' (grace — null the field, keep going). */
    OnError?: TransformOnError;
}

/** Configuration for extracting value(s) from JSON via a JSONPath expression. */
export interface JsonPathConfig {
    /** JSONPath expression, e.g. `$.store.book[0].title` or `$..author`. */
    Path: string;
    /** Return only the first match (default). When false, returns the full array of matches. */
    First?: boolean;
}

/** Configuration for extracting value(s) from XML via an XPath expression. */
export interface XPathConfig {
    /** XPath expression, e.g. `/catalog/book[1]/title/text()` or `//author`. */
    Path: string;
    /** Return only the first match (default). When false, returns the full array of matches. */
    First?: boolean;
}

/** Union of all transform configuration types */
export type TransformConfig =
    | DirectConfig
    | RegexConfig
    | SplitConfig
    | CombineConfig
    | LookupConfig
    | FormatConfig
    | JsonPathConfig
    | XPathConfig
    | CoerceConfig
    | SubstringConfig
    | CustomConfig;

/** Configuration for direct pass-through (no transformation) */
export interface DirectConfig {
    /** Optional default value if source is null/undefined */
    DefaultValue?: unknown;
}

/** Configuration for regex-based string transformation */
export interface RegexConfig {
    /** Regular expression pattern to match */
    Pattern: string;
    /** Replacement string (supports $1, $2, etc. for capture groups) */
    Replacement: string;
    /** Regex flags (e.g., 'gi' for global, case-insensitive) */
    Flags?: string;
}

/** Configuration for splitting a string value and extracting a portion */
export interface SplitConfig {
    /** Delimiter to split on */
    Delimiter: string;
    /** Zero-based index of the part to extract */
    Index: number;
}

/** Configuration for combining multiple source field values */
export interface CombineConfig {
    /** Names of source fields to combine */
    SourceFields: string[];
    /** Separator to place between combined values */
    Separator: string;
}

/** Configuration for value lookup/mapping (in-memory translation table — not an entity lookup) */
export interface LookupConfig {
    /** Map of source values to destination values. Keys are matched case-insensitively */
    Map: Record<string, unknown>;
    /** Value to use when the source value is not found in the map */
    Default?: unknown;
}

/** Configuration for date/number formatting */
export interface FormatConfig {
    /** The target format string. For dates: ISO8601 locale format specifiers */
    FormatString: string;
    /** The type of formatting to apply */
    FormatType: 'date' | 'number' | 'string';
}

/** Configuration for type coercion */
export interface CoerceConfig {
    /** Target type to coerce the value into */
    TargetType: 'string' | 'number' | 'boolean' | 'date';
}

/** Configuration for extracting a substring */
export interface SubstringConfig {
    /** Start index (zero-based) */
    Start: number;
    /** Number of characters to extract. If omitted, extracts to end */
    Length?: number;
}

/** Configuration for custom JavaScript expression evaluation */
export interface CustomConfig {
    /** JavaScript expression to evaluate. The source value is available as 'value' and all fields as 'fields' */
    Expression: string;
}

/** Result of running a transform step or pipeline. */
export interface TransformStepResult {
    /** The resulting value (undefined when Skipped). */
    Value: unknown;
    /** True when an OnError='Skip' step asked to drop the field entirely. */
    Skipped: boolean;
}
