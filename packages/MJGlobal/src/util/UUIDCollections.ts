/**
 * @fileoverview UUID-keyed collections and set-based helpers for MemberJunction
 *
 * `UUIDsEqual` compares two IDs, so code that matches one list of records against another list of
 * IDs tends to be written as a nested scan — for every item, `.some(id => UUIDsEqual(...))` over the
 * other list. That is O(n x m), and every mismatched comparison lowercases both strings.
 *
 * The collections here normalize on every insert and every lookup (via {@link NormalizeUUID}), so
 * they can be used exactly like a native `Set` / `Map` without anyone having to remember to
 * normalize both sides. The helpers cover the four operations those nested scans actually perform:
 * keep matches, drop matches, count per ID, and look up by ID.
 *
 * Normalization follows `NormalizeUUID` exactly, including its handling of `null` / `undefined`
 * (both normalize to `''`).
 *
 * @module @memberjunction/global/UUIDCollections
 */
import { NormalizeUUID } from './UUIDUtils';

/** A UUID as it arrives from data: possibly upper-case, padded, or missing. */
export type UUIDInput = string | null | undefined;

/** Reads the UUID used to match an item. */
export type UUIDSelector<T> = (item: T) => UUIDInput;

/**
 * A `Set` of UUIDs that matches case- and whitespace-insensitively. Every ID is normalized on
 * insert and on lookup, so `Has('A1B2…')` finds an ID added as `'a1b2…'`. Iterates normalized IDs.
 *
 * @example
 * const selected = new UUIDSet(selectedIds);
 * const picked = rows.filter(r => selected.Has(r.ID));
 */
export class UUIDSet implements Iterable<string> {
    private readonly ids = new Set<string>();

    constructor(ids?: Iterable<UUIDInput>) {
        if (ids) {
            for (const id of ids) this.ids.add(NormalizeUUID(id));
        }
    }

    /** Adds an ID. Returns this set, for chaining. */
    public Add(id: UUIDInput): this {
        this.ids.add(NormalizeUUID(id));
        return this;
    }

    /** True when the ID is in the set, ignoring case and surrounding whitespace. */
    public Has(id: UUIDInput): boolean {
        return this.ids.has(NormalizeUUID(id));
    }

    /** Removes an ID. Returns true when it was present. */
    public Delete(id: UUIDInput): boolean {
        return this.ids.delete(NormalizeUUID(id));
    }

    public Clear(): void {
        this.ids.clear();
    }

    /** Number of distinct IDs (case variants of one ID count once). */
    public get Size(): number {
        return this.ids.size;
    }

    public [Symbol.iterator](): Iterator<string> {
        return this.ids.values();
    }
}

/**
 * A `Map` keyed by UUID that matches case- and whitespace-insensitively. Every key is normalized
 * on insert and on lookup, so a value stored under `'a1b2…'` is found with `Get('A1B2…')`.
 * Iterates `[normalizedKey, value]` pairs.
 *
 * @example
 * const roleNames = new UUIDMap(roles.map(r => [r.ID, r.Name]));
 * const name = roleNames.Get(permission.RoleID);
 */
export class UUIDMap<V> implements Iterable<[string, V]> {
    private readonly entries = new Map<string, V>();

    constructor(entries?: Iterable<readonly [UUIDInput, V]>) {
        if (entries) {
            for (const [id, value] of entries) this.entries.set(NormalizeUUID(id), value);
        }
    }

    /** The value stored for the ID, or undefined. */
    public Get(id: UUIDInput): V | undefined {
        return this.entries.get(NormalizeUUID(id));
    }

    /** Stores a value for the ID, replacing any value stored under a case variant of it. */
    public Set(id: UUIDInput, value: V): this {
        this.entries.set(NormalizeUUID(id), value);
        return this;
    }

    public Has(id: UUIDInput): boolean {
        return this.entries.has(NormalizeUUID(id));
    }

    public Delete(id: UUIDInput): boolean {
        return this.entries.delete(NormalizeUUID(id));
    }

    public Clear(): void {
        this.entries.clear();
    }

    public get Size(): number {
        return this.entries.size;
    }

    /** Normalized keys. */
    public Keys(): IterableIterator<string> {
        return this.entries.keys();
    }

    public Values(): IterableIterator<V> {
        return this.entries.values();
    }

    public [Symbol.iterator](): Iterator<[string, V]> {
        return this.entries.entries();
    }
}

/**
 * The default selector: an item's `ID`. The overloads guarantee callers that omit `getId` pass items
 * with an `ID`; this narrows instead of casting, so anything else reads as "no ID" rather than crashing.
 */
function readID(item: unknown): UUIDInput {
    if (typeof item !== 'object' || item === null || !('ID' in item)) return undefined;
    const id = item.ID;
    return typeof id === 'string' ? id : undefined;
}

function asUUIDSet(ids: Iterable<UUIDInput> | UUIDSet): UUIDSet {
    return ids instanceof UUIDSet ? ids : new UUIDSet(ids);
}

/**
 * The items whose ID appears in `ids`, in `items` order. Linear: builds one {@link UUIDSet}
 * (or reuses the one passed) instead of scanning `ids` once per item.
 *
 * @example
 * const moved = FilterByUUIDs(this.Dashboards, droppedIds);
 * const pending = FilterByUUIDs(artifacts, loadedIds, a => a.artifactId);
 */
export function FilterByUUIDs<T extends { ID: UUIDInput }>(items: readonly T[], ids: Iterable<UUIDInput> | UUIDSet): T[];
export function FilterByUUIDs<T>(items: readonly T[], ids: Iterable<UUIDInput> | UUIDSet, getId: UUIDSelector<T>): T[];
export function FilterByUUIDs<T>(items: readonly T[], ids: Iterable<UUIDInput> | UUIDSet, getId?: UUIDSelector<T>): T[] {
    const wanted = asUUIDSet(ids);
    const idOf = getId ?? readID;
    return items.filter((item) => wanted.Has(idOf(item)));
}

/**
 * The items whose ID does NOT appear in `ids`, in `items` order. The complement of
 * {@link FilterByUUIDs}, with the same linear cost.
 *
 * @example
 * const withoutPermission = ExcludeByUUIDs(roles, existingPermissions.map(p => p.RoleID));
 */
export function ExcludeByUUIDs<T extends { ID: UUIDInput }>(items: readonly T[], ids: Iterable<UUIDInput> | UUIDSet): T[];
export function ExcludeByUUIDs<T>(items: readonly T[], ids: Iterable<UUIDInput> | UUIDSet, getId: UUIDSelector<T>): T[];
export function ExcludeByUUIDs<T>(items: readonly T[], ids: Iterable<UUIDInput> | UUIDSet, getId?: UUIDSelector<T>): T[] {
    const unwanted = asUUIDSet(ids);
    const idOf = getId ?? readID;
    return items.filter((item) => !unwanted.Has(idOf(item)));
}

/**
 * How many items share each ID. Look a count up with `.Get(id) ?? 0`; any casing works.
 *
 * @example
 * const perEntity = CountByUUID(relationships, r => r.RelatedEntityID);
 * const shared = (perEntity.Get(rel.RelatedEntityID) ?? 0) > 1;
 */
export function CountByUUID<T extends { ID: UUIDInput }>(items: Iterable<T>): UUIDMap<number>;
export function CountByUUID<T>(items: Iterable<T>, getId: UUIDSelector<T>): UUIDMap<number>;
export function CountByUUID<T>(items: Iterable<T>, getId?: UUIDSelector<T>): UUIDMap<number> {
    const idOf = getId ?? readID;
    const counts = new UUIDMap<number>();
    for (const item of items) {
        const id = idOf(item);
        counts.Set(id, (counts.Get(id) ?? 0) + 1);
    }
    return counts;
}

/**
 * The items keyed by ID, for repeated lookups. When two items share an ID, the FIRST one wins —
 * the same answer `items.find(x => UUIDsEqual(x.ID, id))` would give.
 *
 * @example
 * const usersByID = IndexByUUID(this.users);
 * const owner = usersByID.Get(record.OwnerID);
 */
export function IndexByUUID<T extends { ID: UUIDInput }>(items: Iterable<T>): UUIDMap<T>;
export function IndexByUUID<T>(items: Iterable<T>, getId: UUIDSelector<T>): UUIDMap<T>;
export function IndexByUUID<T>(items: Iterable<T>, getId?: UUIDSelector<T>): UUIDMap<T> {
    const idOf = getId ?? readID;
    const index = new UUIDMap<T>();
    for (const item of items) {
        const id = idOf(item);
        if (!index.Has(id)) index.Set(id, item);
    }
    return index;
}
