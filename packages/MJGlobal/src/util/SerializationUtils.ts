/**
 * Low-level JSON-safety primitives.
 */

/**
 * Deep-clone `value` into a JSON-safe form: circular references are replaced with the string
 * `'[Circular]'` and BigInts are stringified. Functions / undefined are dropped exactly as
 * `JSON.stringify` would drop them. Returns `null` if the value isn't representable at all.
 *
 * Useful for capturing arbitrary third-party objects (e.g. an SDK response) into an audit blob
 * that must survive a later `JSON.stringify` without throwing on a circular reference.
 *
 * The return is typed `unknown` (not `any`) so callers must narrow before use; assigning the
 * result directly into a `Record<string, any>` blob is fine.
 */
export function ToJSONSafe(value: unknown): unknown {
    const seen = new WeakSet<object>();
    let json: string | undefined;
    try {
        json = JSON.stringify(value, (_key, val) => {
            if (typeof val === 'bigint') {
                return val.toString();
            }
            if (typeof val === 'object' && val !== null) {
                if (seen.has(val)) {
                    return '[Circular]';
                }
                seen.add(val);
            }
            return val;
        });
    } catch {
        return null;
    }
    if (json === undefined) {
        return null;
    }
    return JSON.parse(json) as unknown;
}
