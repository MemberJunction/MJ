import { BaseEntity, EntityField } from '@memberjunction/core';

/**
 * The old and new record snapshots a save hands to `BuildRecordChangePayload`. `OldData` is
 * null for a create.
 */
export interface RecordChangeSnapshots {
    NewData: Record<string, unknown>;
    OldData: Record<string, unknown> | null;
}

/**
 * True when the field's stored value is not in the saving object: either the hydration source
 * omitted it ({@link EntityField.NotLoaded}), or it was written after being omitted, so its old
 * value is a construction artifact rather than the stored value.
 */
function lacksStoredValue(field: EntityField): boolean {
    return field.NotLoaded || field.GetState().WrittenAfterNotLoaded === true;
}

/**
 * The names of the entity's fields whose stored value the saving object does not hold. Empty
 * for a full-width object — the case for every unrestricted or system-user save of a record
 * that was loaded whole — which is what lets those saves skip the stored-row read.
 */
export function FieldsLackingStoredValue(entity: BaseEntity): Set<string> {
    const names = new Set<string>();
    for (const fieldInfo of entity.EntityInfo.Fields) {
        const field = entity.GetFieldByName(fieldInfo.Name);
        if (field && lacksStoredValue(field)) {
            names.add(fieldInfo.Name);
        }
    }
    return names;
}

/**
 * The snapshots for a create. A field the INSERT omits because the user may not supply it
 * (`CreateSuppressed`) is left out of the new-values snapshot: the value the object holds is one
 * the record never received, and the column's database default is not known until the insert
 * runs. The next change to the record snapshots the stored value.
 */
export function CreateSnapshots(entity: BaseEntity): RecordChangeSnapshots {
    const newData = entity.GetAll(false) as Record<string, unknown>;
    for (const field of entity.Fields) {
        if (field.CreateSuppressed) {
            delete newData[field.Name];
        }
    }
    return { NewData: newData, OldData: null };
}

/**
 * Widens an update's snapshots to the whole record using the stored row, in entity field order.
 *
 * - **New values**: the saving object's values, and the stored value for each field it never held.
 * - **Old values**: the saving object's old values, and the stored value for each field it never
 *   held — including one it then wrote blind, whose in-memory old value is not the stored one.
 *
 * A field the object never held has the same stored value on both sides, so it never appears as
 * a change: the diff still lists only what the save changed.
 */
export function WidenUpdateSnapshots(
    entity: BaseEntity,
    narrow: RecordChangeSnapshots,
    storedRow: Record<string, unknown>,
    lacking: ReadonlySet<string>,
): RecordChangeSnapshots {
    const newData: Record<string, unknown> = {};
    const oldData: Record<string, unknown> = {};
    const narrowOld = narrow.OldData ?? {};
    for (const fieldInfo of entity.EntityInfo.Fields) {
        const name = fieldInfo.Name;
        const stored = name in storedRow;
        if (name in narrow.NewData) newData[name] = narrow.NewData[name];
        else if (stored) newData[name] = storedRow[name];

        if (lacking.has(name) && stored) oldData[name] = storedRow[name];
        else if (name in narrowOld) oldData[name] = narrowOld[name];
    }
    return { NewData: newData, OldData: oldData };
}

/**
 * Widens a delete's record snapshot to the whole record using the stored row, in entity field
 * order: the deleting object's values, and the stored value for each field it never held. A
 * deleted record is restored from this snapshot, so a narrowed one would bring the record back
 * without the columns its deleter could not read.
 */
export function WidenDeleteSnapshot(
    entity: BaseEntity,
    narrow: Record<string, unknown>,
    storedRow: Record<string, unknown>,
    lacking: ReadonlySet<string>,
): Record<string, unknown> {
    return WidenUpdateSnapshots(entity, { NewData: narrow, OldData: narrow }, storedRow, lacking).OldData ?? narrow;
}
