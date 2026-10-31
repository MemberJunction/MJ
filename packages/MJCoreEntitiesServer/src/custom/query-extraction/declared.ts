import type { BaseEntity, RelatedRecordCollection } from "@memberjunction/core";
import type { MJQueryEntityEntity, MJQueryFieldEntity, MJQueryParameterEntity } from "@memberjunction/core-entities";
import { NormalizeUUID, UUIDsEqual } from "@memberjunction/global";

/**
 * The child rows a query save declares, as the keys extraction matches rows by.
 *
 * A row is *declared* when the save writes it from one of the query's declared collections
 * (`Parameters`, `Fields`, `Entities` on `MJQueryEntityExtended`): it is new, or it was edited.
 * Keys are lower-cased so they compare the way the database does.
 *
 * Extraction treats a declared row as the caller's decision and leaves it alone: it does not add a
 * row with the same key, update it, or delete it, even when the SQL no longer mentions it. That is
 * how a declared row "wins" over what extraction would have written for the same key in the same
 * save. Any later extraction (an extraction service, a refresh) that replaces the current one must
 * honour these sets the same way; the facts it would compute for a declared row can be reported, but
 * not written.
 */
export interface DeclaredQueryChildren {
    /** Declared parameter names. */
    ParameterNames: ReadonlySet<string>;
    /** Declared output field names. */
    FieldNames: ReadonlySet<string>;
    /** Declared entity links, keyed by {@link QueryEntityKey} (the entity ID). */
    EntityKeys: ReadonlySet<string>;
}

/** A declared set with nothing in it, for saves that declare no children. */
export const NO_DECLARED_QUERY_CHILDREN: DeclaredQueryChildren = {
    ParameterNames: new Set<string>(),
    FieldNames: new Set<string>(),
    EntityKeys: new Set<string>(),
};

/** The three declared collections of a query, as `MJQueryEntityExtended` exposes them. */
export interface DeclaredQueryCollections {
    Parameters: RelatedRecordCollection<MJQueryParameterEntity>;
    Fields: RelatedRecordCollection<MJQueryFieldEntity>;
    Entities: RelatedRecordCollection<MJQueryEntityEntity>;
}

/**
 * The key a Query Entity row is matched by: the entity it links. Extraction keeps at most one row
 * per entity (it updates the alternate base view on that row), so a declared row for an entity
 * stands for every link to it.
 */
export function QueryEntityKey(row: Pick<MJQueryEntityEntity, 'EntityID'>): string {
    return row.EntityID ? NormalizeUUID(row.EntityID) : '';
}

/** The key a parameter or field row is matched by: its name, trimmed and lower-cased. */
export function QueryChildNameKey(name: string | null | undefined): string {
    return (name ?? '').trim().toLowerCase();
}

/** True when the save will write this collection item: it is new, or it has unsaved edits. */
function isWrittenBySave(item: BaseEntity): boolean {
    return !item.IsSaved || item.Dirty;
}

/** The keys of the items a save writes from one collection. */
function writtenKeys<T extends BaseEntity>(items: readonly T[], key: (item: T) => string): Set<string> {
    const keys = new Set<string>();
    for (const item of items) {
        if (isWrittenBySave(item)) {
            keys.add(key(item));
        }
    }
    return keys;
}

/**
 * The child rows a save of the query declares, read from its declared collections before the save.
 *
 * @param collections - The query's declared collections.
 * @returns The declared keys; empty sets when the collections hold nothing to write.
 */
export function CollectDeclaredQueryChildren(collections: DeclaredQueryCollections): DeclaredQueryChildren {
    return {
        ParameterNames: writtenKeys<MJQueryParameterEntity>(collections.Parameters.Items, p => QueryChildNameKey(p.Name)),
        FieldNames: writtenKeys<MJQueryFieldEntity>(collections.Fields.Items, f => QueryChildNameKey(f.Name)),
        EntityKeys: writtenKeys<MJQueryEntityEntity>(collections.Entities.Items, QueryEntityKey),
    };
}

/** True when the declared set holds at least one row. */
export function HasDeclaredQueryChildren(declared: DeclaredQueryChildren): boolean {
    return declared.ParameterNames.size > 0 || declared.FieldNames.size > 0 || declared.EntityKeys.size > 0;
}

/** A stored row and its detection method, as conflict detection reads it. */
type DetectedRow = BaseEntity & { ID: string; DetectionMethod: string };

/**
 * The stored rows a declared collection item replaces: rows with the same key as a NEW item but a
 * different ID, that extraction (not a person) created. A row whose `DetectionMethod` is `Manual`
 * was authored and is never selected, so authored rows are never touched.
 *
 * @param newItems - The collection's unsaved items.
 * @param stored - The rows stored for the query, read from the database.
 * @param key - How rows are matched.
 * @returns The stored rows to delete in the same save, before the new items are inserted.
 */
export function FindReplacedRows<T extends DetectedRow>(newItems: readonly T[], stored: readonly T[], key: (row: T) => string): T[] {
    const newByKey = new Map<string, T>();
    for (const item of newItems) {
        newByKey.set(key(item), item);
    }
    return stored.filter(row => {
        const declared = newByKey.get(key(row));
        return declared !== undefined
            && !UUIDsEqual(row.ID, declared.ID)
            && row.DetectionMethod !== 'Manual';
    });
}

/**
 * Queues a stored row for deletion through the collection, so the delete runs inside the query's
 * graph save, before the collection's inserts (a collection's removals run first). The row is
 * removed from the collection when the collection already holds it; otherwise it is attached and
 * removed, which queues the same delete.
 *
 * @param collection - The declared collection.
 * @param row - The stored row to delete.
 */
export function QueueReplacedRowDeletion<T extends BaseEntity & { ID: string }>(collection: RelatedRecordCollection<T>, row: T): void {
    const held = collection.Items.find(item => item.IsSaved && UUIDsEqual(item.ID, row.ID));
    if (held) {
        collection.Remove(held);
        return;
    }
    collection.Add(row);
    collection.Remove(row);
}
