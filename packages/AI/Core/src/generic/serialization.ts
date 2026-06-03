/**
 * JSON-safety helpers for capturing raw provider responses.
 *
 * Provider SDK response objects are generally parsed-from-JSON and safe, but some carry
 * non-enumerable accessor methods, BigInt usage counters, or (rarely) circular references.
 * {@link toJSONSafe} produces a plain, structurally-cloned value that is guaranteed to survive a
 * downstream `JSON.stringify` — important because the AI prompt-run pipeline stringifies
 * `ChatResult.modelSpecificResponseDetails`, and a circular reference there would throw and abort
 * the run save.
 */

/**
 * Deep-clone `value` into a JSON-safe form: circular references are replaced with the string
 * `'[Circular]'` and BigInts are stringified. Functions / undefined are dropped exactly as
 * `JSON.stringify` would drop them. Returns `null` if the value isn't representable at all.
 *
 * The return is typed `unknown` (not `any`) so callers must narrow before use; for capturing a
 * raw response into a `Record<string, any>` audit blob, assigning the result directly is fine.
 */
export function toJSONSafe(value: unknown): unknown {
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
