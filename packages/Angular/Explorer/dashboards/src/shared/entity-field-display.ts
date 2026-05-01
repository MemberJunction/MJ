import { Metadata, EntityFieldInfo, EntityInfo, IMetadataProvider } from '@memberjunction/core';

/**
 * A single field entry prepared for display in cards, tooltips, and detail panels.
 */
export interface DisplayFieldEntry {
    /** The raw field name from metadata (e.g., "FirstName") */
    Key: string;
    /** The human-readable display name (e.g., "First Name") */
    DisplayName: string;
    /** The field value */
    Value: unknown;
    /** Whether this field is marked DefaultInView on the entity */
    IsDefaultInView: boolean;
    /** Whether this is the entity's name field */
    IsNameField: boolean;
    /** The field's display sequence from entity metadata */
    Sequence: number;
}

/** Fields that should never appear in display cards/panels */
const INTERNAL_METADATA_KEYS = new Set([
    'Entity', 'EntityIcon', 'RecordID', 'TemplateID',
    '__mj_UpdatedAt', '__mj_CreatedAt', 'Name',
]);

/**
 * Sorts and prioritizes metadata fields for display using MJ entity field metadata.
 *
 * Priority order:
 * 1. IsNameField fields first (the record's display name)
 * 2. DefaultInView fields next, sorted by Sequence
 * 3. All other fields, sorted by Sequence
 *
 * Internal/system fields (Entity, EntityIcon, RecordID, TemplateID, timestamps) are excluded.
 * Empty/null values are excluded.
 *
 * @param entityName - The entity name (e.g., "Members") for metadata lookup
 * @param metadata - The raw metadata object (Record<string, unknown>) from vector DB or similar
 * @returns Sorted array of DisplayFieldEntry objects ready for rendering
 */
export function PrioritizeFieldsForDisplay(
    entityName: string,
    metadata: Record<string, unknown>,
    provider?: IMetadataProvider
): DisplayFieldEntry[] {
    const entityInfo = FindEntityInfo(entityName, provider);
    const fieldMap = BuildFieldMap(entityInfo);

    const entries: DisplayFieldEntry[] = [];
    for (const [key, value] of Object.entries(metadata)) {
        if (INTERNAL_METADATA_KEYS.has(key)) continue;
        if (value == null || String(value).trim() === '') continue;

        const fieldInfo = fieldMap.get(key);
        entries.push({
            Key: key,
            DisplayName: fieldInfo?.DisplayNameOrName ?? FormatFieldName(key),
            Value: value,
            IsDefaultInView: fieldInfo?.DefaultInView ?? false,
            IsNameField: fieldInfo?.IsNameField ?? false,
            Sequence: fieldInfo?.Sequence ?? 9999,
        });
    }

    return entries.sort(CompareFields);
}

/**
 * Returns only the DefaultInView fields (the "important" fields for compact cards).
 * Falls back to first 4 fields if no DefaultInView fields exist.
 */
export function GetPrimaryDisplayFields(
    entityName: string,
    metadata: Record<string, unknown>,
    maxFields: number = 4,
    provider?: IMetadataProvider
): DisplayFieldEntry[] {
    const all = PrioritizeFieldsForDisplay(entityName, metadata, provider);
    const defaultInView = all.filter(f => f.IsDefaultInView);
    if (defaultInView.length > 0) {
        return defaultInView.slice(0, maxFields);
    }
    // Fallback: return first N non-name fields
    return all.filter(f => !f.IsNameField).slice(0, maxFields);
}

/**
 * Returns the record's display name from metadata using IsNameField.
 * Falls back to the 'Name' key or first non-empty string value.
 */
export function GetRecordDisplayName(
    entityName: string,
    metadata: Record<string, unknown>,
    provider?: IMetadataProvider
): string {
    const entityInfo = FindEntityInfo(entityName, provider);
    if (entityInfo) {
        const nameField = entityInfo.Fields.find(f => f.IsNameField);
        if (nameField && metadata[nameField.Name] != null) {
            return String(metadata[nameField.Name]);
        }
    }
    // Fallbacks
    if (metadata['Name'] != null) return String(metadata['Name']);
    // Return first non-empty string value
    for (const value of Object.values(metadata)) {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
    }
    return 'Unknown';
}

// ─── Internal Helpers ─────────────────────────────────────────────────────

function FindEntityInfo(entityName: string, provider?: IMetadataProvider): EntityInfo | null {
    try {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        return md.EntityByName(entityName) ?? null;
    } catch {
        return null;
    }
}

function BuildFieldMap(entityInfo: EntityInfo | null): Map<string, EntityFieldInfo> {
    const map = new Map<string, EntityFieldInfo>();
    if (!entityInfo) return map;
    for (const field of entityInfo.Fields) {
        map.set(field.Name, field);
    }
    return map;
}

function CompareFields(a: DisplayFieldEntry, b: DisplayFieldEntry): number {
    // 1. Name fields first
    if (a.IsNameField !== b.IsNameField) return a.IsNameField ? -1 : 1;
    // 2. DefaultInView fields before non-default
    if (a.IsDefaultInView !== b.IsDefaultInView) return a.IsDefaultInView ? -1 : 1;
    // 3. Sort by Sequence within each group
    return a.Sequence - b.Sequence;
}

/**
 * Convert a PascalCase or camelCase field name to a human-readable display name.
 * E.g., "FirstName" -> "First Name", "contentTypeID" -> "Content Type ID"
 */
function FormatFieldName(key: string): string {
    return key
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/^./, c => c.toUpperCase());
}
