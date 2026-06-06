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
