import { createHash } from 'node:crypto';

/**
 * Name of the per-record content-hash mirror column. Written on every integration
 * table alongside the other `__mj_integration_*` columns when present. Holds the
 * SHA-256 (hex) of the last-synced external field values.
 *
 * This is the change-detection lever for connectors that have NO usable watermark
 * (the source can't tell us "what changed since T"), e.g. YourMembership: every
 * sync re-fetches every record. Comparing the freshly-computed hash of an incoming
 * record against the stored hash lets the engine skip the per-record DB load and
 * write entirely for the unchanged majority — turning a 50k-record no-op re-sync
 * from 50k loads into ~0.
 *
 * Gated everywhere by EntityInfo field presence, so it is a no-op on tables that
 * predate the column (the engine still syncs correctly via the dirty-flag path).
 */
export const CONTENT_HASH_COLUMN = '__mj_integration_ContentHash';

/**
 * Deterministic content hash of a mapped-field record. Canonicalizes by SORTING keys
 * (so field-order variation between fetches never produces a spurious "changed"), then
 * SHA-256s the canonical JSON. `undefined` values are dropped (treated as absent) so a
 * field that is sometimes omitted and sometimes explicitly undefined hashes the same.
 *
 * Note: this hashes the MAPPED field values (what actually lands in MJ), not the raw
 * external payload — so a change in a source field we don't map won't (correctly) count
 * as a change for sync purposes.
 */
export function computeContentHash(fields: Record<string, unknown>): string {
    const canonical = canonicalize(fields);
    return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Reserved key under which captured (unmapped/overflow) source fields are folded into the
 * content-hash basis. Uses the `__mj_integration_*` reserved prefix so it can never collide
 * with a real MAPPED destination column.
 */
const OVERFLOW_HASH_KEY = '__mj_integration_overflow';

/**
 * LEGACY basis builder — folds captured (unmapped/overflow) source fields into the hash basis
 * under {@link OVERFLOW_HASH_KEY}. Retained for back-compat with external callers/tests, but
 * **the engine no longer uses it for change detection** (RSU-spec rule): the match/write hash
 * is MAPPED fields only ({@link computeContentHash}), so a newly-appearing custom column does
 * NOT break the row match and unchanged rows stay skip-cheap. Custom keys still surface — the
 * engine aggregates them in memory (`SyncResult.CustomKeyStats`) as promotion candidates with
 * sizing stats regardless of row writes; once PROMOTED to a real column the key becomes a
 * mapped field and participates in the hash natively (backfilled via the schema-change
 * watermark reset).
 *
 * Migration note: rows whose stored hash was computed WITH overflow folded in mismatch ONCE
 * against the mapped-only basis, rewrite, and converge — a one-time bounded rewrite wave for
 * overflow-carrying rows only (customs-free rows are byte-identical under both bases).
 */
export function contentHashBasis(
    mappedFields: Record<string, unknown>,
    unmappedFields?: Record<string, unknown> | null,
): Record<string, unknown> {
    if (!unmappedFields || Object.keys(unmappedFields).length === 0) {
        return mappedFields;
    }
    return { ...mappedFields, [OVERFLOW_HASH_KEY]: unmappedFields };
}

/**
 * LEGACY hash over MAPPED fields PLUS captured (overflow) fields. No longer used by the
 * engine's change detection — see {@link contentHashBasis} for the RSU-spec policy and the
 * one-time migration behavior. Kept exported for back-compat.
 */
export function computeContentHashWithOverflow(
    mappedFields: Record<string, unknown>,
    unmappedFields?: Record<string, unknown> | null,
): string {
    return computeContentHash(contentHashBasis(mappedFields, unmappedFields));
}

/**
 * Stable JSON serialization: object keys sorted recursively, arrays kept in order
 * (array order is semantically meaningful), `undefined` entries omitted. Dates and
 * other non-plain values fall back to their JSON form.
 */
function canonicalize(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'null'; // top-level undefined — shouldn't happen, but stay total
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(v => (v === undefined ? 'null' : canonicalize(v))).join(',')}]`;
    }
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
    const body = keys.map(k => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',');
    return `{${body}}`;
}
