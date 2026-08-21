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

/** How many CONTAINERS one payload may contribute — objects and arrays, not scalars. */
const MAX_NODES = 2_000;

/**
 * How many characters of string content one payload may contribute.
 *
 * The node cap alone did not stop a row becoming a memory dump, which is what it claimed to do: it
 * counts containers, so 100k flat scalar properties (1.3 MB) or a single 10 MB string sailed
 * through untouched. Strings are where the bytes actually are, so they are where the budget has to
 * be. Generous enough that ordinary payloads never notice, small enough that a row stays a row.
 */
const MAX_STRING_BUDGET = 256_000;

/**
 * Reduces a caller-supplied value to what is safe to persist.
 *
 * @param value the value to sanitize
 * @param rootPath what to call the root in reported paths (`'data'`, `'context'`, `'payload'`)
 */
export function SanitizeForPersistence(value: unknown, rootPath = 'value'): SanitizedValue {
    const dropped: string[] = [];
    let nodes = 0;
    let stringBudget = MAX_STRING_BUDGET;

    // Identity-based, and scoped to the CURRENT PATH rather than the whole walk: an object
    // legitimately referenced twice by siblings is not a cycle, and treating it as one drops real
    // data. Only an object that contains ITSELF, however deeply, is circular.
    const walk = (current: unknown, path: string, depth: number, ancestors: Set<object>): unknown => {
        if (current === null) return null;
        const kind = typeof current;

        if (kind === 'boolean') return current;
        if (kind === 'string') {
            // Dropped whole rather than truncated: half a value is a value nobody can trust, and a
            // silently shortened payload is worse to debug than an absent one the log names.
            const text = current as string;
            if (text.length > stringBudget) { dropped.push(path); return undefined; }
            stringBudget -= text.length;
            return text;
        }
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

        // THE PROTOTYPE CHECK COMES FIRST, and the order is the guarantee.
        //
        // It used to sit below `toJSON`, which meant a class was refused only if it did not define
        // one — and `toJSON() { return {...this} }` is a common convenience. So the class most
        // likely to hold credentials was unwrapped BY ITS OWN METHOD, silently, with nothing in
        // DroppedPaths to say so:
        //
        //     class SkipCtx { constructor() { this.apiKey = 'sk-SECRET' } toJSON() { return {...this} } }
        //     -> {"apiKey":"sk-SECRET"}, dropped: []
        //
        // That inverted the whole point. This module exists because the CALLER built the object and
        // may not have thought about persistence; deferring to a method on that object hands the
        // decision back to the party being guarded against. `Date` is handled above, which covers
        // the legitimate case that actually shows up; anything else with a `toJSON` — a value
        // object, a Buffer, a Decimal — is refused and REPORTED, so a caller who wants it persisted
        // converts it to plain data and can see exactly which path to fix.
        const prototype = Object.getPrototypeOf(object);
        if (prototype !== Object.prototype && prototype !== null && !Array.isArray(object)) {
            dropped.push(path);     // a class instance, a Map, a Set, a Socket — see above
            return undefined;
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

        // ENUMERATION CAN THROW, and reading a property can too — `Object.entries` invokes getters,
        // and a getter over a closed connection is exactly the shape this module is aimed at. An
        // unguarded read here reintroduces the crash the module exists to prevent, on all three of
        // its callers instead of the one that broke originally.
        //
        // Worth knowing and not obvious: sanitizing INVOKES getters, once per property. A context
        // holding lazily-opened resources can therefore open one by being written down. Refusing
        // class instances above removes most of that surface, since their getters are never reached.
        // `Object.keys`, deliberately, NOT `Object.entries`. Entries READS every value, so one
        // throwing getter takes the whole object down with it before any per-property guard can
        // run — the sibling that was perfectly serializable goes too, and the reported path names
        // the parent rather than the field that actually failed. Keys are inert; each value is then
        // read inside its own guard.
        let keys: string[];
        try {
            keys = Object.keys(object);
        } catch {
            dropped.push(path);     // an exotic proxy can refuse even this
            return undefined;
        }

        const result: Record<string, unknown> = {};
        for (const key of keys) {
            const childPath = path ? `${path}.${key}` : key;
            let kept: unknown;
            try {
                // The read itself is inside the guard: this is where a getter over a closed
                // connection throws, and it drops its own property rather than the object around it.
                kept = walk((object as Record<string, unknown>)[key], childPath, depth + 1, nextAncestors);
            } catch {
                dropped.push(childPath);
                continue;
            }
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
