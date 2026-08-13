/**
 * @fileoverview Reducing caller-supplied values to what is safe to write to a database row.
 *
 * **Why this exists as its own module.** Three writes take an object the CALLER built and stringify
 * it into a row: an agent run's `Data` and `StartingPayload`, and a task graph's invocation
 * envelope. All three take it from `ExecuteAgentParams`, whose own documentation says the value may
 * be a CLASS INSTANCE holding "external service credentials or connection information" — Skip's
 * `SkipAgentContext` is the named example.
 *
 * That combination fails two ways, and the second is worse than the first:
 *
 * 1. **It throws.** `JSON.stringify` on anything holding a socket, a pool or a provider dies with
 *    `Converting circular structure to JSON`. On the task-graph path this killed agent runs at
 *    submit time, before a single step executed.
 * 2. **It leaks.** When serialization happens to SUCCEED, whatever the object held — credentials,
 *    endpoints, tokens — is now in a row that outlives the run and is readable by anything with
 *    access to it.
 *
 * The first is loud and gets fixed. The second is silent and does not.
 *
 * **What survives**: JSON data — primitives, arrays, plain objects, `Date` as ISO, and anything
 * exposing `toJSON()`. That is deliberately the same set `JSON.stringify` would keep, minus the
 * ways it explodes. Callers persist these values so a human or a condition can read them later;
 * neither can do anything with a live handle.
 *
 * **What does not, and why dropping beats unwrapping**: class instances, functions, `Map`/`Set`,
 * sockets, streams, anything circular, anything past the depth or node cap. Walking a socket's own
 * enumerable properties instead would "work" — and would persist its internals, which is the leak
 * this exists to prevent.
 *
 * **Every drop is reported by path.** A value that silently vanished is the defect one layer down:
 * a condition reading absent-data and taking a branch nobody can explain, or a debugging session
 * spent looking for a field the writer quietly discarded.
 *
 * @module @memberjunction/ai-core-plus
 */

/** What one sanitization pass kept, and the paths of everything it refused. */
export type SanitizedValue = {
    /** The persistable projection, or `undefined` when nothing survived. */
    Value: unknown;
    /** Dot/bracket paths of every dropped value, for the caller to log. */
    DroppedPaths: string[];
};

/** How deep the walk goes before it stops trusting the shape. */
const MAX_DEPTH = 8;

/** How many values one payload may contribute, so a row cannot become a memory dump. */
const MAX_NODES = 2_000;

/**
 * Reduces a caller-supplied value to what is safe to persist.
 *
 * @param value the value to sanitize
 * @param rootPath what to call the root in reported paths (`'data'`, `'context'`, `'payload'`)
 */
export function SanitizeForPersistence(value: unknown, rootPath = 'value'): SanitizedValue {
    const dropped: string[] = [];
    let nodes = 0;

    // Identity-based, and scoped to the CURRENT PATH rather than the whole walk: an object
    // legitimately referenced twice by siblings is not a cycle, and treating it as one drops real
    // data. Only an object that contains ITSELF, however deeply, is circular.
    const walk = (current: unknown, path: string, depth: number, ancestors: Set<object>): unknown => {
        if (current === null) return null;
        const kind = typeof current;

        if (kind === 'string' || kind === 'boolean') return current;
        if (kind === 'number') {
            // NaN and Infinity serialize to null, which reads as a present, empty value — a
            // confident wrong answer rather than a missing one.
            if (!Number.isFinite(current as number)) { dropped.push(path); return undefined; }
            return current;
        }
        if (kind === 'undefined') return undefined;              // absent, not dropped
        if (kind !== 'object') { dropped.push(path); return undefined; }   // function, symbol, bigint

        if (++nodes > MAX_NODES) { dropped.push(path); return undefined; }
        if (depth > MAX_DEPTH) { dropped.push(path); return undefined; }

        const object = current as object;
        if (ancestors.has(object)) { dropped.push(path); return undefined; }
        if (object instanceof Date) return object.toISOString();

        const toJSON = (object as { toJSON?: unknown }).toJSON;
        if (typeof toJSON === 'function') {
            // The object saying what it is worth persisting. Same courtesy JSON.stringify extends.
            return walk((toJSON as () => unknown).call(object), path, depth + 1, ancestors);
        }

        const nextAncestors = new Set(ancestors).add(object);
        if (Array.isArray(object)) {
            return object.map((entry, index) => {
                const kept = walk(entry, `${path}[${index}]`, depth + 1, nextAncestors);
                // A hole becomes null rather than shifting every later index — position carries
                // meaning, and a shifted array is a wrong answer that looks like a right one.
                return kept === undefined ? null : kept;
            });
        }

        const prototype = Object.getPrototypeOf(object);
        if (prototype !== Object.prototype && prototype !== null) {
            dropped.push(path);     // a class instance, a Map, a Set, a Socket — refused, see header
            return undefined;
        }

        const result: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(object)) {
            const kept = walk(entry, path ? `${path}.${key}` : key, depth + 1, nextAncestors);
            if (kept !== undefined) result[key] = kept;
        }
        return result;
    };

    return { Value: walk(value, rootPath, 0, new Set()), DroppedPaths: dropped };
}

/**
 * `JSON.stringify` for a caller-supplied value, with the hazards removed.
 *
 * Returns `null` when nothing survived, so a caller can leave a column NULL rather than writing
 * `"{}"` — which claims the writer had an empty object, not that it had nothing to write.
 */
export function StringifyForPersistence(value: unknown, rootPath = 'value'): { JSON: string | null; DroppedPaths: string[] } {
    const sanitized = SanitizeForPersistence(value, rootPath);
    return {
        JSON: sanitized.Value === undefined ? null : JSON.stringify(sanitized.Value),
        DroppedPaths: sanitized.DroppedPaths,
    };
}
