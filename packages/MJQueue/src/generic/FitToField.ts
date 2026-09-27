import type { BaseEntity } from '@memberjunction/core';

/**
 * Truncates a string to the MaxLength of one of the record's fields, read from entity metadata — never from a
 * literal, so widening the column later needs no code change. A value that fits, a field with no length limit
 * (MaxLength <= 0, e.g. nvarchar(max)) or a field the entity does not have is returned unchanged.
 */
export function FitToField(record: BaseEntity, fieldName: string, value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    const wanted = fieldName.trim().toLowerCase();
    const field = record.EntityInfo.Fields.find((f) => f.Name.trim().toLowerCase() === wanted);
    const maxLength = field?.MaxLength ?? 0;
    return maxLength > 0 && value.length > maxLength ? value.slice(0, maxLength) : value;
}
