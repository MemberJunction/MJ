import { DatabasePlatform } from './platformSQL';

/**
 * Stored as JSON in the PlatformVariants column on Query, UserView,
 * and RowLevelSecurityFilter entities. Maps platform keys to variant
 * data for each SQL field that has platform-specific alternatives.
 *
 * Example:
 * ```json
 * {
 *   "SQL": { "postgresql": "SELECT * FROM \"Users\" WHERE \"IsActive\" = true" },
 *   "CacheValidationSQL": { "postgresql": "SELECT MAX(\"__mj_UpdatedAt\") ..." },
 *   "_meta": { "translatedBy": "llm", "sourceDialect": "sqlserver" }
 * }
 * ```
 */
export interface PlatformVariantsJSON {
    /** Platform variants for the main SQL field (Queries) */
    SQL?: PlatformVariantEntry;
    /** Platform variants for WhereClause (UserViews) */
    WhereClause?: PlatformVariantEntry;
    /** Platform variants for CacheValidationSQL (Queries) */
    CacheValidationSQL?: PlatformVariantEntry;
    /** Platform variants for OrderBy (UserViews) */
    OrderBy?: PlatformVariantEntry;
    /** Platform variants for FilterText (RowLevelSecurityFilter) */
    FilterText?: PlatformVariantEntry;
    /** Metadata about the translation process */
    _meta?: PlatformVariantMeta;
}

/**
 * A single field's platform-specific variants. Each key is a DatabasePlatform value.
 */
export interface PlatformVariantEntry {
    sqlserver?: string;
    postgresql?: string;
}

/**
 * Metadata about how the platform variants were produced.
 */
export interface PlatformVariantMeta {
    /** ISO timestamp of when the translation was performed */
    translatedAt?: string;
    /** How the translation was produced */
    translatedBy?: 'manual' | 'llm';
    /** The source dialect the SQL was originally written in */
    sourceDialect?: DatabasePlatform;
    /** The LLM model used for translation, if applicable */
    llmModel?: string;
    /** Whether the translation has been verified by a human */
    verified?: boolean;
}

/**
 * Parses a PlatformVariants JSON string into a typed object.
 * Returns null if the input is null, undefined, or empty.
 * Returns null (and logs nothing) if parsing fails — callers should fall back to the base SQL.
 */
export function ParsePlatformVariants(json: string | null | undefined): PlatformVariantsJSON | null {
    if (!json) return null;
    try {
        return JSON.parse(json) as PlatformVariantsJSON;
    } catch {
        return null;
    }
}

/**
 * Resolves a specific SQL field from PlatformVariants for the given platform.
 * Returns the platform-specific variant if available, or null to signal fallback to base field.
 *
 * @param variants - The parsed PlatformVariantsJSON (can be null)
 * @param fieldName - The field key in the PlatformVariantsJSON (e.g., 'SQL', 'FilterText')
 * @param platform - The active database platform
 * @returns The platform-specific SQL string, or null if no variant exists
 */
export function ResolvePlatformVariant(
    variants: PlatformVariantsJSON | null,
    fieldName: keyof Omit<PlatformVariantsJSON, '_meta'>,
    platform: DatabasePlatform
): string | null {
    if (!variants) return null;
    const entry = variants[fieldName];
    if (!entry) return null;
    const value = entry[platform];
    return value != null && value.length > 0 ? value : null;
}
