/**
 * @fileoverview Pure helpers for **structured perception notes** — the compact, typed context notes
 * a channel sends the model when its state changes.
 *
 * Perception used to be free-form text: each channel invented its own wording and its own idea of
 * when to speak, so a burst of edits became a burst of sentences the model had to read and ignore.
 * The contract now is:
 *
 * ```
 * [channel:<Key>#<instance>] <event> <json>
 * ```
 *
 * with the JSON carrying **what changed** (a delta against what the model was last told), not the
 * whole state. These helpers are the arithmetic behind that: a structural delta between two state
 * snapshots, and the one place the note is formatted.
 *
 * @module @memberjunction/realtime-runtime
 */

import type { JSONObject, JSONValue } from '@memberjunction/ai';
import { IsPlainObject } from '@memberjunction/global';

/**
 * The structural difference between two state snapshots.
 *
 * `Changed` is a nested *partial* of the new state — overlay it on the old state and you have the
 * new one (arrays and scalars are replaced whole, never patched element-wise: a patch language the
 * model would have to execute in its head is worse than re-reading a short array). `Removed` lists
 * the dotted paths that existed before and do not now.
 */
export interface StateDelta {
    /** The changed and added values, as a nested partial of the new state. */
    Changed: JSONObject;
    /** Dotted paths that were present before and are gone. */
    Removed: string[];
}

/** Deep equality for JSON values. */
function jsonEqual(a: JSONValue | undefined, b: JSONValue | undefined): boolean {
    if (a === b) {
        return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, index) => jsonEqual(item, b[index]));
    }
    if (IsPlainObject(a) && IsPlainObject(b)) {
        const aKeys = Object.keys(a);
        return aKeys.length === Object.keys(b).length && aKeys.every((k) => k in b && jsonEqual(a[k] as JSONValue, b[k] as JSONValue));
    }
    return false;
}

/**
 * Computes what changed between two state snapshots.
 *
 * @param previous The state the model was last told about.
 * @param next The state now.
 * @returns The delta, or `null` when nothing changed (so a burst that nets out to no change sends nothing).
 */
export function ComputeStateDelta(previous: JSONObject, next: JSONObject): StateDelta | null {
    const delta = diffObjects(previous, next, '');
    return Object.keys(delta.Changed).length === 0 && delta.Removed.length === 0 ? null : delta;
}

/** Recursive worker for {@link ComputeStateDelta}. */
function diffObjects(previous: JSONObject, next: JSONObject, prefix: string): StateDelta {
    const changed: JSONObject = {};
    const removed: string[] = [];
    for (const key of Object.keys(next)) {
        const path = prefix ? `${prefix}.${key}` : key;
        const before = previous[key];
        const after = next[key];
        if (!(key in previous)) {
            changed[key] = after;
        } else if (IsPlainObject(before) && IsPlainObject(after)) {
            const child = diffObjects(before as JSONObject, after as JSONObject, path);
            if (Object.keys(child.Changed).length > 0) {
                changed[key] = child.Changed;
            }
            removed.push(...child.Removed);
        } else if (!jsonEqual(before, after)) {
            changed[key] = after;
        }
    }
    for (const key of Object.keys(previous)) {
        if (!(key in next)) {
            removed.push(prefix ? `${prefix}.${key}` : key);
        }
    }
    return { Changed: changed, Removed: removed };
}

/**
 * Lists the dotted paths a delta touched, to a bounded depth — what a note falls back to when the
 * full delta would be too large to send. Paths to a changed *subtree* stop at `maxDepth`.
 *
 * @param delta The delta to summarize.
 * @param maxDepth How many path segments to keep (default 2).
 */
export function ListChangedPaths(delta: StateDelta, maxDepth: number = 2): string[] {
    const paths = new Set<string>();
    const walk = (node: JSONObject, prefix: string[]): void => {
        for (const [key, value] of Object.entries(node)) {
            const here = [...prefix, key];
            if (IsPlainObject(value) && here.length < maxDepth) {
                walk(value as JSONObject, here);
            } else {
                paths.add(here.join('.'));
            }
        }
    };
    walk(delta.Changed, []);
    for (const removed of delta.Removed) {
        paths.add(removed.split('.').slice(0, maxDepth).join('.'));
    }
    return [...paths];
}

/**
 * Formats the one-line structured note: `[channel:<Key>#<instance>] <event> <json>`.
 *
 * @param channelKey The channel's key.
 * @param instanceId The instance's id.
 * @param event The event name (`state_changed`, `opened`, `completed`, …).
 * @param payload The JSON payload (omit for an event with none).
 */
export function FormatChannelNote(channelKey: string, instanceId: string, event: string, payload?: JSONObject): string {
    const head = `[channel:${channelKey}#${instanceId}] ${event}`;
    return payload === undefined ? head : `${head} ${JSON.stringify(payload)}`;
}
