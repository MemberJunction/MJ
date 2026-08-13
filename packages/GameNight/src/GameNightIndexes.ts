/**
 * Pure index builders for the metadata engine.
 *
 * Separated from the engine so they can be tested with plain objects instead of a live provider — the
 * indexes are where the interesting logic is (key normalization, grouping), and that logic should not
 * require a database to exercise.
 */

/** The minimum shape an indexable record needs. */
export type HasID = { ID: string };

/**
 * Normalizes a key for map lookups.
 *
 * GUIDs in MJ arrive in mixed case depending on the path they took — a `uniqueidentifier` from SQL
 * Server, a hand-written literal in a migration, and a value round-tripped through GraphQL are not
 * guaranteed to agree on case. A `Map` keyed on the raw string would then miss lookups that ought to
 * hit, and the failure looks like "the record isn't cached" rather than "the key was capitalized
 * differently". See guides/UUID_COMPARISON_GUIDE.md.
 */
export function NormalizeKey(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
}

/** Indexes records by `ID` for O(1) lookup. Later duplicates win, which cannot happen on a PK. */
export function IndexByID<T extends HasID>(records: readonly T[]): Map<string, T> {
    const map = new Map<string, T>();
    for (const r of records) {
        map.set(NormalizeKey(r.ID), r);
    }
    return map;
}

/**
 * Groups records by an arbitrary string field, preserving input order within each group.
 *
 * Records whose key is null/empty are skipped rather than collected under a `''` bucket — an empty
 * group key is almost always missing data, and silently inventing a category for it makes the caller's
 * "give me the Party games" question return junk.
 */
export function GroupByField<T>(records: readonly T[], keyOf: (record: T) => string | null | undefined): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const r of records) {
        const key = NormalizeKey(keyOf(r));
        if (key.length === 0) {
            continue;
        }
        const existing = map.get(key);
        if (existing) {
            existing.push(r);
        } else {
            map.set(key, [r]);
        }
    }
    return map;
}

/**
 * Indexes records by a non-unique string field, keeping the FIRST match.
 *
 * First-wins rather than last-wins because these are convenience lookups over human-entered values
 * (a nickname), where a collision means the data is ambiguous. Keeping the first at least makes the
 * result stable across reloads instead of depending on row order.
 */
export function IndexByField<T>(records: readonly T[], keyOf: (record: T) => string | null | undefined): Map<string, T> {
    const map = new Map<string, T>();
    for (const r of records) {
        const key = NormalizeKey(keyOf(r));
        if (key.length === 0 || map.has(key)) {
            continue;
        }
        map.set(key, r);
    }
    return map;
}
