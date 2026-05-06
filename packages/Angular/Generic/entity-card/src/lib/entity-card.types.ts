import { EntityFieldInfo, EntityInfo, IMetadataProvider, Metadata } from '@memberjunction/core';

// ================================================================
// Card Variant
// ================================================================

/**
 * Visual variant controlling the card's size, layout, and level of detail.
 *
 * - `compact` — Tooltip-sized: title + 2-3 primary fields, no avatar. ~80px.
 * - `card` — Grid card: avatar + title + subtitle + up to 4 display fields + badge. ~160px.
 * - `detail` — Full panel: all available fields with labels, grouped by priority.
 */
export type EntityCardVariant = 'compact' | 'card' | 'detail';

// ================================================================
// Card Template (auto-generated or user-provided)
// ================================================================

/** The detected type of a display field, used for formatting. */
export type CardFieldType = 'number' | 'boolean' | 'text' | 'date';

/**
 * A single display field in the card body.
 */
export interface CardDisplayField {
    /** Entity field name (e.g., "Email") */
    Name: string;
    /** Human-readable label (e.g., "Email Address") */
    Label: string;
    /** Detected field type for value formatting */
    Type: CardFieldType;
    /** Whether this field has DefaultInView=true on the entity */
    IsDefaultInView: boolean;
    /** The field's Sequence from entity metadata */
    Sequence: number;
}

/**
 * Describes how a card should be laid out — which fields map to which
 * visual slots. Auto-generated from entity metadata when not provided.
 */
export interface CardTemplate {
    /**
     * Field names that form the card title, in display order.
     * Multiple IsNameField fields are combined (e.g., ["FirstName", "LastName"] → "Elizabeth Rodriguez").
     */
    TitleFields: string[];
    /** Optional subtitle field (status, type, category) */
    SubtitleField: string | null;
    /** Optional description/summary field */
    DescriptionField: string | null;
    /** Ordered display fields for the card body */
    DisplayFields: CardDisplayField[];
    /** Thumbnail field names in priority order (image URL or icon class) */
    ThumbnailFields: string[];
    /** Optional badge field (priority, severity, rating) */
    BadgeField: string | null;
    /** Map of field names to display labels */
    FieldLabels: Record<string, string>;
}

// ================================================================
// Events
// ================================================================

/**
 * Cancelable event payload. Set `Cancel = true` in the handler to
 * prevent the default action from executing.
 */
export interface CancelableCardEvent<T> {
    /** The data associated with the event */
    Data: T;
    /** Set to true to cancel the default action */
    Cancel: boolean;
}

/**
 * Payload for record interaction events.
 */
export interface CardRecordEvent {
    /** The entity name */
    EntityName: string;
    /** The raw record data */
    Record: Record<string, unknown>;
    /** The record's primary key value(s) */
    RecordID: string;
}

// ================================================================
// Template Generation Utilities
// ================================================================

/** Fields that should never appear in card display */
const INTERNAL_FIELD_PATTERNS = new Set([
    '__mj_createdat', '__mj_updatedat', 'createdat', 'updatedat',
    'createdby', 'updatedby', 'password', 'secret', 'token', 'hash',
]);

/** Keyword patterns for auto-detecting field roles */
const SUBTITLE_KEYWORDS = ['status', 'type', 'category', 'state', 'stage'];
const DESCRIPTION_KEYWORDS = ['description', 'desc', 'summary', 'notes', 'comments', 'bio', 'about'];
const THUMBNAIL_KEYWORDS = ['image', 'photo', 'picture', 'thumbnail', 'avatar', 'logo', 'icon'];
const BADGE_KEYWORDS = ['priority', 'severity', 'importance', 'rating', 'rank', 'level'];
const METRIC_KEYWORDS = ['amount', 'total', 'count', 'value', 'price', 'cost', 'quantity', 'qty', 'balance', 'revenue', 'score'];

/**
 * Auto-generate a CardTemplate from entity metadata.
 *
 * Priority logic:
 * 1. **Title**: All fields with `IsNameField=true`, sorted by Sequence. Falls back to
 *    heuristic name detection, then first string field.
 * 2. **Display fields**: `DefaultInView=true` fields sorted by Sequence (up to maxFields).
 *    Falls back to metric-keyword fields, then first N non-PK/FK fields.
 * 3. **Subtitle/Description/Thumbnail/Badge**: Detected via keyword matching on field names.
 *
 * @param entity - The entity metadata
 * @param maxDisplayFields - Maximum display fields for the card body (default 4)
 * @returns A fully populated CardTemplate
 */
export function GenerateCardTemplate(entity: EntityInfo, maxDisplayFields: number = 4): CardTemplate {
    const fields = entity.Fields;
    const titleFields = FindTitleFields(entity, fields);
    const titleFieldNames = new Set(titleFields.map(f => f.Name));

    // Build field labels map
    const fieldLabels: Record<string, string> = {};
    for (const f of fields) {
        fieldLabels[f.Name] = f.DisplayNameOrName;
    }

    return {
        TitleFields: titleFields.map(f => f.Name),
        SubtitleField: FindFieldByKeywords(fields, SUBTITLE_KEYWORDS, titleFieldNames),
        DescriptionField: FindFieldByKeywords(fields, DESCRIPTION_KEYWORDS, titleFieldNames),
        DisplayFields: FindDisplayFields(fields, titleFieldNames, maxDisplayFields),
        ThumbnailFields: FindThumbnailFields(fields),
        BadgeField: FindFieldByKeywords(fields, BADGE_KEYWORDS, titleFieldNames),
        FieldLabels: fieldLabels,
    };
}

/**
 * Generate a CardTemplate from an entity name string + sparse metadata keys.
 * This is the primary entry point for Knowledge Hub dashboards where we have
 * vector metadata (partial field set) rather than full entity records.
 *
 * Falls back gracefully when EntityInfo is not available (returns a template
 * based on the metadata keys alone).
 *
 * @param entityName - The entity name for metadata lookup
 * @param metadataKeys - The available field keys in the sparse metadata
 * @param maxDisplayFields - Maximum display fields
 */
export function GenerateCardTemplateFromMetadata(
    entityName: string,
    metadataKeys: string[],
    maxDisplayFields: number = 4,
    provider?: IMetadataProvider
): CardTemplate {
    let entity: EntityInfo | null = null;
    try {
        const md = (provider ?? Metadata.Provider) as unknown as IMetadataProvider;
        entity = md.Entities.find((e: EntityInfo) => e.Name === entityName) ?? null;
    } catch {
        // Metadata not available — use key-only fallback
    }

    if (entity) {
        const full = GenerateCardTemplate(entity, maxDisplayFields);
        // Filter to only fields present in the metadata
        const keySet = new Set(metadataKeys);
        return {
            ...full,
            TitleFields: full.TitleFields.filter(f => keySet.has(f)),
            DisplayFields: full.DisplayFields.filter(f => keySet.has(f.Name)),
            SubtitleField: full.SubtitleField && keySet.has(full.SubtitleField) ? full.SubtitleField : null,
            DescriptionField: full.DescriptionField && keySet.has(full.DescriptionField) ? full.DescriptionField : null,
            ThumbnailFields: full.ThumbnailFields.filter(f => keySet.has(f)),
            BadgeField: full.BadgeField && keySet.has(full.BadgeField) ? full.BadgeField : null,
        };
    }

    // Fallback: no entity metadata, use key heuristics
    return GenerateFallbackTemplate(metadataKeys, maxDisplayFields);
}

// ================================================================
// Internal Helpers
// ================================================================

function FindTitleFields(entity: EntityInfo, fields: EntityFieldInfo[]): EntityFieldInfo[] {
    // 1. All IsNameField fields, sorted by Sequence
    const nameFields = fields
        .filter(f => f.IsNameField)
        .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));
    if (nameFields.length > 0) return nameFields;

    // 2. entity.NameField (singular)
    if (entity.NameField) return [entity.NameField];

    // 3. Heuristic: field named "Name" or "Title"
    const heuristic = fields.find(f =>
        (f.Name.toLowerCase() === 'name' || f.Name.toLowerCase() === 'title') &&
        f.TSType === 'string' && !f.IsPrimaryKey
    );
    if (heuristic) return [heuristic];

    // 4. Field ending with "Name" that's a string
    const endsWithName = fields.find(f =>
        f.Name.toLowerCase().endsWith('name') && f.TSType === 'string' &&
        !f.IsPrimaryKey && !f.Name.toLowerCase().includes('file')
    );
    if (endsWithName) return [endsWithName];

    // 5. First string field
    const firstString = fields.find(f =>
        f.TSType === 'string' && !f.IsPrimaryKey && !f.Name.toLowerCase().includes('id')
    );
    if (firstString) return [firstString];

    return [];
}

function FindDisplayFields(
    fields: EntityFieldInfo[],
    excludeNames: Set<string>,
    maxFields: number
): CardDisplayField[] {
    const result: CardDisplayField[] = [];
    const isExcluded = (f: EntityFieldInfo) =>
        f.IsPrimaryKey || excludeNames.has(f.Name) ||
        INTERNAL_FIELD_PATTERNS.has(f.Name.toLowerCase()) ||
        f.Name.toLowerCase().endsWith('id') && f.RelatedEntityID != null; // FK fields

    // 1. DefaultInView fields first
    const defaultInView = fields
        .filter(f => f.DefaultInView && !isExcluded(f))
        .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));

    for (const f of defaultInView) {
        if (result.length >= maxFields) break;
        result.push(BuildCardField(f));
    }

    if (result.length >= 2) return result;

    // 2. Metric keyword fields
    const existing = new Set(result.map(r => r.Name));
    for (const f of fields) {
        if (result.length >= maxFields) break;
        if (existing.has(f.Name) || isExcluded(f)) continue;
        if (METRIC_KEYWORDS.some(kw => f.Name.toLowerCase().includes(kw))) {
            result.push(BuildCardField(f));
            existing.add(f.Name);
        }
    }

    if (result.length >= 2) return result;

    // 3. First N non-excluded fields by sequence
    for (const f of fields.sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999))) {
        if (result.length >= maxFields) break;
        if (existing.has(f.Name) || isExcluded(f)) continue;
        result.push(BuildCardField(f));
        existing.add(f.Name);
    }

    return result;
}

function FindFieldByKeywords(
    fields: EntityFieldInfo[],
    keywords: string[],
    excludeNames: Set<string>
): string | null {
    for (const keyword of keywords) {
        const field = fields.find(f =>
            f.Name.toLowerCase().includes(keyword) &&
            f.TSType === 'string' &&
            !f.IsPrimaryKey &&
            !excludeNames.has(f.Name)
        );
        if (field) return field.Name;
    }
    return null;
}

function FindThumbnailFields(fields: EntityFieldInfo[]): string[] {
    const result: string[] = [];
    for (const keyword of THUMBNAIL_KEYWORDS) {
        for (const f of fields) {
            if (f.Name.toLowerCase().includes(keyword) && f.TSType === 'string' && !result.includes(f.Name)) {
                result.push(f.Name);
            }
        }
    }
    return result;
}

function BuildCardField(field: EntityFieldInfo): CardDisplayField {
    return {
        Name: field.Name,
        Label: field.DisplayNameOrName,
        Type: DetectFieldType(field),
        IsDefaultInView: field.DefaultInView ?? false,
        Sequence: field.Sequence ?? 9999,
    };
}

function DetectFieldType(field: EntityFieldInfo): CardFieldType {
    if (field.TSType === 'boolean' || field.Type?.toLowerCase() === 'bit') return 'boolean';
    if (field.TSType === 'number') return 'number';
    if (field.TSType === 'Date' || field.Type?.toLowerCase().includes('date')) return 'date';
    return 'text';
}

/**
 * Fallback template generation when entity metadata is not available.
 * Uses field name heuristics on the raw metadata keys.
 */
function GenerateFallbackTemplate(keys: string[], maxFields: number): CardTemplate {
    const internal = new Set([
        'Entity', 'EntityIcon', 'RecordID', 'TemplateID',
        '__mj_UpdatedAt', '__mj_CreatedAt', 'ID',
    ]);
    const usable = keys.filter(k => !internal.has(k));

    // Title: 'Name' or first key
    const titleKey = usable.find(k => k.toLowerCase() === 'name')
        ?? usable.find(k => k.toLowerCase().endsWith('name'))
        ?? usable.find(k => k.toLowerCase() === 'title');
    const titleFields = titleKey ? [titleKey] : usable.length > 0 ? [usable[0]] : [];
    const titleSet = new Set(titleFields);

    const displayFields: CardDisplayField[] = usable
        .filter(k => !titleSet.has(k))
        .slice(0, maxFields)
        .map((k, i) => ({
            Name: k,
            Label: FormatKeyAsLabel(k),
            Type: 'text' as CardFieldType,
            IsDefaultInView: false,
            Sequence: i,
        }));

    const fieldLabels: Record<string, string> = {};
    for (const k of keys) {
        fieldLabels[k] = FormatKeyAsLabel(k);
    }

    return {
        TitleFields: titleFields,
        SubtitleField: null,
        DescriptionField: null,
        DisplayFields: displayFields,
        ThumbnailFields: [],
        BadgeField: null,
        FieldLabels: fieldLabels,
    };
}

/**
 * Convert a PascalCase or camelCase key to a human-readable label.
 * E.g., "FirstName" → "First Name", "contentTypeID" → "Content Type ID"
 */
export function FormatKeyAsLabel(key: string): string {
    return key
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/^./, c => c.toUpperCase());
}

/**
 * Combine multiple title field values into a single display string.
 * E.g., ["Elizabeth", "Rodriguez"] → "Elizabeth Rodriguez"
 */
export function CombineTitleFields(
    record: Record<string, unknown>,
    titleFields: string[]
): string {
    const parts = titleFields
        .map(f => record[f])
        .filter(v => v != null && String(v).trim() !== '')
        .map(v => String(v));
    return parts.length > 0 ? parts.join(' ') : 'Unknown';
}
