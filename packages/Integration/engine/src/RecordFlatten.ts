/**
 * Generic nested-object flattening for discovery + sync record-intake.
 *
 * WHY (the framework bug this fixes — see memory project_connector_nested_pk_dupe):
 * a source that returns NESTED records — e.g. PropFuel's
 *   { checkin_question: { id, checkin_id, rating, … }, contact: {…}, question: {…}, campaign: {…} }
 * — folds in `discoverFromStream` as ONE object-valued column per top-level key. The soft-PK
 * picker then takes the object-valued column (`checkin_question`) as the PK, because each blob is
 * distinct. An object-valued PK is poison:
 *   1. Identity becomes per-OCCURRENCE/per-VERSION (the blob serialized, or a `${file}:${hash}`
 *      fallback) instead of per-LOGICAL-RECORD, so the same record across files/versions lands as
 *      multiple rows → DUPLICATES.
 *   2. The persisted column is an opaque JSON blob, not queryable scalar columns.
 *
 * Flattening BEFORE discovery makes the scalar `checkin_question_id` a column → the PK picker chooses
 * a real scalar key → identity is the logical id → no dupes, and the entity is flat + queryable. The
 * SAME flatten MUST run at sync record-intake so records match the discovered (flattened) schema.
 *
 * Behaviour:
 *  - Plain nested objects are flattened with `parent<sep>child` scalar keys (default sep `_`, so
 *    `checkin_question.id` → `checkin_question_id` — a valid MJ column name).
 *  - Arrays, Dates, and `null` are LEAF values (kept as-is) — arrays/Dates aren't column-flattenable;
 *    the write path serializes them as it already does.
 *  - Bounded by `maxDepth` (default 4); an object at the depth limit is kept as a leaf (blob) rather
 *    than recursed, so pathological deep nesting can't explode the column set.
 *  - A FLAT record passes through unchanged — so every existing flat-record connector is a NO-OP and
 *    sees zero behaviour change.
 *  - Key collisions (a pre-existing `a_b` colliding with a flattened `a.b`) keep the FIRST-seen value
 *    and are reported via `opts.onCollision` so the caller can surface it; silent overwrite is avoided.
 */
export interface FlattenOptions {
    /** Separator between parent and child key segments. Default `'_'`. */
    Separator?: string;
    /** Maximum nesting depth to flatten; objects deeper than this are kept as leaf blobs. Default 4. */
    MaxDepth?: number;
    /** Invoked when a flattened key collides with an existing key (first value wins). For diagnostics. */
    onCollision?: (key: string) => void;
}

const DEFAULT_SEPARATOR = '_';
const DEFAULT_MAX_DEPTH = 4;

/** A plain (non-array, non-Date) object — the only thing we recurse into. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && !(value instanceof Date);
}

/**
 * Returns true if `raw` contains at least one nested plain-object value — i.e. flattening would
 * change it. Cheap top-level check; lets callers skip the allocation for the flat-record common case.
 */
export function hasNestedObject(raw: Record<string, unknown>): boolean {
    for (const v of Object.values(raw)) {
        if (isPlainObject(v)) return true;
    }
    return false;
}

/**
 * Flatten a record's nested plain-objects into `parent<sep>child` scalar keys. Pure; returns a new
 * object. A record with no nested objects is returned shallow-copied + unchanged in shape.
 */
export function flattenRecord(
    raw: Record<string, unknown>,
    opts: FlattenOptions = {},
): Record<string, unknown> {
    const sep = opts.Separator ?? DEFAULT_SEPARATOR;
    const maxDepth = opts.MaxDepth ?? DEFAULT_MAX_DEPTH;
    const out: Record<string, unknown> = {};

    const put = (key: string, value: unknown): void => {
        if (Object.prototype.hasOwnProperty.call(out, key)) {
            opts.onCollision?.(key);
            return; // first value wins
        }
        out[key] = value;
    };

    const recurse = (obj: Record<string, unknown>, prefix: string, depth: number): void => {
        for (const [k, v] of Object.entries(obj)) {
            const key = prefix ? `${prefix}${sep}${k}` : k;
            if (isPlainObject(v) && depth < maxDepth) {
                recurse(v, key, depth + 1);
            } else {
                put(key, v);
            }
        }
    };

    recurse(raw, '', 0);
    return out;
}
