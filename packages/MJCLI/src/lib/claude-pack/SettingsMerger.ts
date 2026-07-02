/**
 * Deep-merge for `.claude/settings.json`.
 *
 * The pack ships a baseline `settings.json` with a top-level
 * `__mj_managed: { version, mjMajor?, keys: ["permissions.allow", "env.MJ_CLAUDE_PACK", ...] }`
 * block. `keys` lists the dotted JSON paths the pack owns.
 *
 * The merger:
 *   1. Deep-clones the user's existing settings as the starting point
 *   2. For each path in `__mj_managed.keys`, merges the pack's value into the
 *      user's:
 *        - Arrays  → union, deduped, user entries first then pack entries
 *        - Objects → recursive merge (per-key)
 *        - Primitives → pack wins (rare in practice — primitives shouldn't
 *          really be managed keys, but the rule keeps the merger total)
 *   3. Replaces `__mj_managed` wholesale with the pack's block (so version
 *      and mjMajor stamps update on every merge)
 *   4. Leaves every user key outside `__mj_managed.keys` completely alone
 *
 * @see plans/claude-install-pack.md §10.2
 */

import type { ManagedSettingsMeta } from './PackTypes.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SettingsMergeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SettingsMergeError';
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MergeSettingsOptions {
    /** User's existing settings.json contents. Use `{}` when the file is absent. */
    Existing: Record<string, unknown>;
    /** The pack baseline (rendered from settings.template.json). Must contain `__mj_managed.keys`. */
    Pack: Record<string, unknown>;
}

export interface MergeSettingsResult {
    /** The merged settings JSON, ready to write back. */
    Result: Record<string, unknown>;
    /**
     * True if the merged result differs from `Existing`. Lets the caller
     * skip an FS write when nothing changed.
     */
    Changed: boolean;
}

export function mergeSettings(opts: MergeSettingsOptions): MergeSettingsResult {
    const packMeta = readManagedMeta(opts.Pack);
    if (!packMeta) {
        throw new SettingsMergeError(
            'Pack settings.json has no __mj_managed.keys block — cannot determine what to merge.'
        );
    }

    const result = deepClone(opts.Existing);
    for (const dottedPath of packMeta.keys) {
        const packValue = getAtPath(opts.Pack, dottedPath);
        if (packValue === undefined) continue; // pack declares the key but didn't ship a value — skip
        const existingValue = getAtPath(result, dottedPath);
        const merged = mergeValues(existingValue, packValue);
        setAtPath(result, dottedPath, merged);
    }

    // Replace __mj_managed wholesale so version + mjMajor stamps refresh.
    // Casting through unknown is required because the index signature is `unknown`.
    result.__mj_managed = deepClone(opts.Pack.__mj_managed) as Record<string, unknown>;

    const changed = !shallowJsonEqual(result, opts.Existing);
    return { Result: result, Changed: changed };
}

/** Read the `__mj_managed` block out of a settings object, or null if absent. */
export function readManagedMeta(settings: Record<string, unknown>): ManagedSettingsMeta | null {
    const raw = settings.__mj_managed;
    if (!isPlainObject(raw)) return null;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.version !== 'string') return null;
    if (!Array.isArray(obj.keys)) return null;
    if (!obj.keys.every((k) => typeof k === 'string')) return null;
    return {
        version: obj.version,
        mjMajor: typeof obj.mjMajor === 'string' ? obj.mjMajor : undefined,
        keys: obj.keys as string[],
    };
}

// ---------------------------------------------------------------------------
// Merge primitives
// ---------------------------------------------------------------------------

function mergeValues(existing: unknown, pack: unknown): unknown {
    if (Array.isArray(pack) && Array.isArray(existing)) {
        return mergeArrays(existing, pack);
    }
    if (isPlainObject(pack) && isPlainObject(existing)) {
        return mergeObjects(existing, pack);
    }
    // Type mismatch or primitive — pack wins.
    return deepClone(pack);
}

/** Union user entries first, then pack entries; deduped by stable JSON encoding. */
function mergeArrays(existing: unknown[], pack: unknown[]): unknown[] {
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const item of [...existing, ...pack]) {
        const key = stableKey(item);
        if (!seen.has(key)) {
            seen.add(key);
            out.push(deepClone(item));
        }
    }
    return out;
}

function mergeObjects(
    existing: Record<string, unknown>,
    pack: Record<string, unknown>
): Record<string, unknown> {
    const out: Record<string, unknown> = deepClone(existing);
    for (const [key, value] of Object.entries(pack)) {
        out[key] = mergeValues(out[key], value);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function getAtPath(obj: Record<string, unknown>, dottedPath: string): unknown {
    const parts = dottedPath.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
        if (!isPlainObject(cur)) return undefined;
        cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
}

export function setAtPath(
    obj: Record<string, unknown>,
    dottedPath: string,
    value: unknown
): void {
    const parts = dottedPath.split('.');
    const last = parts.pop();
    if (last === undefined) return;
    let cur: Record<string, unknown> = obj;
    for (const p of parts) {
        const next = cur[p];
        if (!isPlainObject(next)) {
            cur[p] = {};
        }
        cur = cur[p] as Record<string, unknown>;
    }
    cur[last] = value;
}

// ---------------------------------------------------------------------------
// Misc utilities
// ---------------------------------------------------------------------------

export function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepClone<T>(value: T): T {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => deepClone(v)) as unknown as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = deepClone(v);
    }
    return out as unknown as T;
}

/**
 * Stable string key for an arbitrary JSON-ish value, used to dedupe array
 * entries. Sorts object keys so `{a:1,b:2}` and `{b:2,a:1}` produce the same
 * key.
 */
function stableKey(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableKey).join(',') + ']';
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b)
    );
    return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + stableKey(v)).join(',') + '}';
}

function shallowJsonEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}
