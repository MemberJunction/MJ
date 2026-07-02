/**
 * @fileoverview Generic value-mapping resolver. Resolves a declarative mapping config of reference
 * strings against a set of named sources. Genericized from the Flow Agent input-mapping mechanism so
 * the same engine can drive agent step mappings, Record Process input/output mappings, and any other
 * "map values from named sources" need — keeping the logic in one canonical, reusable place.
 *
 * Reference syntax (a mapping value that is a string):
 *  - `static:<literal>`           → the literal text after the colon
 *  - `<sourceName>.<path>`        → value at `path` within `sources[sourceName]` (source name matched
 *                                   case-insensitively; `path` supports dot + `arr[0]` indexing)
 *  - anything else                → returned verbatim (treated as a literal)
 *
 * Objects and arrays are resolved recursively, preserving shape.
 */

/**
 * Reads a value at a dot/bracket path from an object (e.g. `a.b`, `a.items[0].name`). Path
 * navigation is case-sensitive; returns `undefined` if any segment is missing.
 */
export function getValueAtPath(obj: unknown, path: string): unknown {
    if (!path) {
        return obj;
    }
    let current: unknown = obj;
    for (const part of path.split('.')) {
        if (!part) {
            continue;
        }
        const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);
        if (arrayMatch) {
            const name = arrayMatch[1];
            const index = parseInt(arrayMatch[2], 10);
            if (current && typeof current === 'object' && name in (current as Record<string, unknown>)) {
                const arr = (current as Record<string, unknown>)[name];
                current = Array.isArray(arr) && index >= 0 && index < arr.length ? arr[index] : undefined;
            } else {
                return undefined;
            }
        } else if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[part];
        } else {
            return undefined;
        }
        if (current === undefined) {
            return undefined;
        }
    }
    return current;
}

/**
 * Resolves a single mapping reference against the supplied named sources. See the module overview
 * for the reference syntax. Non-string refs are returned unchanged.
 */
export function resolveMappingRef(ref: unknown, sources: Record<string, unknown>): unknown {
    if (typeof ref !== 'string') {
        return ref;
    }
    const trimmed = ref.trim();
    if (trimmed.toLowerCase().startsWith('static:')) {
        return ref.substring(ref.indexOf(':') + 1);
    }
    // A bare reference that matches a source name returns the whole source value (useful for scalar
    // sources, e.g. `recordId`). Checked before the dotted-path form below.
    const wholeSourceKey = Object.keys(sources).find((k) => k.toLowerCase() === trimmed.toLowerCase());
    if (wholeSourceKey !== undefined) {
        return sources[wholeSourceKey];
    }
    const dot = trimmed.indexOf('.');
    if (dot > 0) {
        const sourceName = trimmed.substring(0, dot);
        const sourceKey = Object.keys(sources).find((k) => k.toLowerCase() === sourceName.toLowerCase());
        if (sourceKey !== undefined) {
            const path = ref.substring(ref.indexOf('.') + 1);
            return getValueAtPath(sources[sourceKey], path);
        }
    }
    return ref; // no recognized source prefix → treat as a literal
}

/**
 * Recursively resolves a mapping config (string / array / object) against named sources, returning a
 * structure of the same shape with every reference resolved.
 *
 * @param mapping - The mapping config (e.g. `{ name: 'record.Name', when: 'static:today' }`).
 * @param sources - Named sources to resolve references against (e.g. `{ record, context }`).
 */
export function resolveValueMapping<T = Record<string, unknown>>(mapping: unknown, sources: Record<string, unknown>): T {
    if (typeof mapping === 'string') {
        return resolveMappingRef(mapping, sources) as T;
    }
    if (Array.isArray(mapping)) {
        return mapping.map((item) => resolveValueMapping(item, sources)) as unknown as T;
    }
    if (mapping && typeof mapping === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(mapping)) {
            out[key] = resolveValueMapping(value, sources);
        }
        return out as T;
    }
    return mapping as T;
}
