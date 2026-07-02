/**
 * Curated form-relevant view of an entity's metadata.
 *
 * Used in three places:
 *   - The `GetEntitySchemaForForm` action, which serves this shape to the
 *     Form Builder agent so the LLM has tight, LLM-friendly field info
 *     (FKs resolved, value lists annotated, audit/internal fields stripped).
 *   - The Component Studio field-binding inspector, which lists these
 *     fields in its right-panel sidebar.
 *   - The Component Studio fixture-record live preview, which generates
 *     type-appropriate sample values per field for the in-progress form.
 *
 * The shape is deliberately tighter than `EntityInfo`/`EntityFieldInfo`:
 * audit fields are out, FK references are resolved to `{entity, displayField}`,
 * value-list fields are normalised to `allowedValues: string[]`, and the
 * type union is narrowed to six LLM-friendly buckets rather than raw SQL
 * type strings.
 */
import type { EntityInfo, EntityFieldInfo, IMetadataProvider } from '@memberjunction/core';

/** Foreign-key target info, resolved at curation time. */
export interface CuratedFormFieldFK {
    /** Display name of the related entity, e.g. "Accounts". */
    entity: string;
    /** The name-field on the related entity, e.g. "Name". May be absent if the related entity has no NameField. */
    displayField?: string;
}

/** Normalised type bucket for a form field. */
export type CuratedFormFieldType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'datetime'
    | 'enum'
    | 'foreign-key';

/** A single field in the curated schema. */
export interface CuratedFormField {
    /** Database column name, e.g. "AccountID". */
    name: string;
    /** Human-readable label if different from `name`. */
    displayName?: string;
    /** Field description from extended properties / EntityField.Description. */
    description?: string;
    /** Normalised type bucket. */
    type: CuratedFormFieldType;
    /** True iff a user must supply a value when creating a new record. */
    required: boolean;
    /** True iff the field is part of the primary key. */
    isPrimaryKey: boolean;
    /** Maximum string length when `type === 'string'`. */
    maxLength?: number;
    /** Allowed values when `type === 'enum'`. */
    allowedValues?: string[];
    /** FK target when `type === 'foreign-key'`. */
    references?: CuratedFormFieldFK;
    /** Display order from `EntityField.Sequence`. */
    sequence: number;
}

/** Curated entity-level schema for form authoring / rendering. */
export interface CuratedFormSchema {
    /** Fully-qualified entity name, e.g. "MJ: Applications". */
    entityName: string;
    /** Human-readable label, e.g. "Application". */
    displayName: string;
    /** Entity description if available. */
    description?: string;
    /** Name of the field that serves as the record's display label. */
    nameField?: string;
    /** Curated fields, in display order. */
    fields: CuratedFormField[];
}

/**
 * Build the curated schema for an entity.
 *
 * Strips fields the form layer shouldn't surface:
 *   - `__mj_*` audit columns (CreatedAt / UpdatedAt).
 *   - Computed columns (`IsVirtual && IsComputed`) — read-only at the DB level.
 *   - Pure view-only columns (`IsVirtual && !IsComputed`) — not writable.
 *
 * Primary-key fields are kept but flagged with `isPrimaryKey`. The form
 * layer uses these for display only; persistence flows through
 * `FormHostProps.primaryKey`.
 *
 * Returns `null` if the entity is not registered with the provider.
 */
export function buildCuratedFormSchema(
    entityName: string,
    provider: IMetadataProvider,
): CuratedFormSchema | null {
    const entity = provider.EntityByName(entityName);
    if (!entity) {
        return null;
    }
    return curateFromEntityInfo(entity, provider);
}

/**
 * Same as {@link buildCuratedFormSchema} but takes an already-resolved
 * `EntityInfo`. Useful when callers already hold the EntityInfo (e.g.
 * inside `InteractiveFormComponent.rebuildFormHostProps`) and want to
 * skip the second lookup.
 */
export function curateFromEntityInfo(
    entity: EntityInfo,
    provider: IMetadataProvider,
): CuratedFormSchema {
    const fields = entity.Fields
        .filter(shouldIncludeField)
        .map(f => curateField(f, provider))
        .sort((a, b) => a.sequence - b.sequence);

    return {
        entityName: entity.Name,
        displayName: entity.DisplayName ?? entity.Name,
        description: entity.Description ?? undefined,
        nameField: entity.NameField?.Name,
        fields,
    };
}

/** Pre-filter: drop audit and non-writable columns. */
function shouldIncludeField(field: EntityFieldInfo): boolean {
    if (field.Name?.startsWith('__mj_')) {
        return false;
    }
    if (field.IsVirtual) {
        return false;
    }
    return true;
}

function curateField(field: EntityFieldInfo, provider: IMetadataProvider): CuratedFormField {
    const type = inferType(field);
    const required = isRequired(field);

    const out: CuratedFormField = {
        name: field.Name,
        displayName: field.DisplayName && field.DisplayName !== field.Name ? field.DisplayName : undefined,
        description: field.Description ?? undefined,
        type,
        required,
        isPrimaryKey: !!field.IsPrimaryKey,
        sequence: field.Sequence ?? 0,
    };

    if (type === 'string') {
        const max = field.MaxLength;
        if (max && max > 0) {
            out.maxLength = max;
        }
    }

    if (type === 'enum') {
        out.allowedValues = field.EntityFieldValues?.map(v => v.Value).filter(Boolean) ?? [];
    }

    if (type === 'foreign-key') {
        out.references = resolveForeignKey(field, provider);
    }

    return out;
}

/**
 * Map an `EntityFieldInfo` to one of six normalised buckets. Order of checks
 * matters: foreign-key trumps the raw TSType (an FK can be stored as
 * uniqueidentifier and would otherwise look like 'string'), and enum trumps
 * the raw type when the field has a value list.
 */
function inferType(field: EntityFieldInfo): CuratedFormFieldType {
    if (field.RelatedEntity) {
        return 'foreign-key';
    }
    if (field.ValueListType && field.ValueListType !== 'None' &&
        field.EntityFieldValues && field.EntityFieldValues.length > 0) {
        return 'enum';
    }
    switch (field.TSType) {
        case 'number':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'Date':
            return 'datetime';
        default:
            return 'string';
    }
}

/**
 * A field is "required" for form purposes when the user must supply a value
 * to create the record. PKs are excluded (auto-assigned) and so are fields
 * with database defaults (the DB will fill them).
 */
function isRequired(field: EntityFieldInfo): boolean {
    if (field.IsPrimaryKey) {
        return false;
    }
    if (field.DefaultValue && field.DefaultValue.length > 0) {
        return false;
    }
    return !field.AllowsNull;
}

function resolveForeignKey(field: EntityFieldInfo, provider: IMetadataProvider): CuratedFormFieldFK {
    const targetName = field.RelatedEntity;
    const target = provider.EntityByName(targetName);
    return {
        entity: targetName,
        displayField: target?.NameField?.Name,
    };
}
