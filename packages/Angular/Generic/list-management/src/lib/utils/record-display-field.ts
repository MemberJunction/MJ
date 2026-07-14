/**
 * Shared helper for choosing which field to display (and search on) when
 * showing an entity's records in list-membership UIs — the Add Records
 * dialogs and the List form's Items grid.
 *
 * Resolution order:
 *   1. The entity's NameField, when one is defined (display the value alone).
 *   2. Otherwise the first field that is not a primary key, not a foreign
 *      key, and not an MJ system column (`__mj_*`) — displayed as
 *      "<ID> — <value>" so the record stays identifiable.
 *   3. Otherwise the first non-primary-key field, whatever it is.
 *   4. Entities with only primary-key fields return null — callers display
 *      the record ID alone.
 */
import { EntityFieldInfo, EntityInfo } from '@memberjunction/core';

/** The display-field choice for an entity's records in list UIs. */
export interface RecordDisplayFieldInfo {
    /** The field whose value should be shown; null when only the ID is displayable. */
    Field: EntityFieldInfo | null;
    /** True when Field is the entity's real NameField (display value alone, no ID prefix). */
    IsNameField: boolean;
}

/** SQL types safe to use in a `LIKE '%…%'` search filter. */
const TEXT_SEARCHABLE_TYPES = new Set(['nvarchar', 'varchar', 'nchar', 'char', 'text', 'ntext']);

/**
 * Picks the field to display for an entity's records per the resolution
 * order documented at the top of this file.
 */
export function GetRecordDisplayField(entityInfo: EntityInfo): RecordDisplayFieldInfo {
    if (entityInfo.NameField) {
        return { Field: entityInfo.NameField, IsNameField: true };
    }

    const preferred = entityInfo.Fields.find(
        (f) => !f.IsPrimaryKey && !f.RelatedEntityID && !f.Name.startsWith('__mj_'),
    );
    if (preferred) {
        return { Field: preferred, IsNameField: false };
    }

    const anyNonPk = entityInfo.Fields.find((f) => !f.IsPrimaryKey) ?? null;
    return { Field: anyNonPk, IsNameField: false };
}

/** True when the field's SQL type supports a LIKE-based contains search. */
export function IsTextSearchableField(field: EntityFieldInfo | null): boolean {
    if (!field) return false;
    const normalized = (field.Type || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    return TEXT_SEARCHABLE_TYPES.has(normalized);
}

/**
 * Formats a record's display label from its ID and the chosen display
 * field's value: NameField → the value alone; fallback field →
 * "<id> — <value>"; no field / empty value → the id.
 */
export function FormatRecordDisplayValue(
    recordId: string,
    fieldValue: unknown,
    displayField: RecordDisplayFieldInfo,
): string {
    const value = fieldValue == null ? '' : String(fieldValue).trim();
    if (displayField.IsNameField) {
        return value || recordId;
    }
    return value ? `${recordId} — ${value}` : recordId;
}
