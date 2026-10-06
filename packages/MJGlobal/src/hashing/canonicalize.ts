/**
 * Stable JSON serialization: object keys sorted recursively, arrays kept in order
 * (array order is semantically meaningful), `undefined` entries omitted. Dates and
 * other non-plain values fall back to their JSON form.
 *
 * Lifted from @memberjunction/integration-engine to serve as the shared, pure,
 * dependency-free canonicalizer across Integration, BaseEntity, and Feature Pipelines.
 */
export function Canonicalize(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'null'; // top-level undefined — shouldn't happen, but stay total
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(v => (v === undefined ? 'null' : Canonicalize(v))).join(',')}]`;
    }
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
    const body = keys.map(k => `${JSON.stringify(k)}:${Canonicalize(obj[k])}`).join(',');
    return `{${body}}`;
}
