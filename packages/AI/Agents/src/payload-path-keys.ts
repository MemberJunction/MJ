/**
 * Path-style keys in an {@link AgentPayloadChangeRequest} bucket.
 *
 * A bucket key such as `"meta.title"`, `"dependencies[2].code"` or `"dependencies.[2].code"` names a
 * location inside the payload, not a top-level property. `PayloadManager.ApplyAgentChangeRequest`
 * resolves these keys against the payload before applying the change, so a tool or a model can write
 * one nested field without restating the objects and arrays around it.
 *
 * These helpers are pure: they parse a key, check it against a payload, and build the nested value
 * that the change-request merge already understands.
 *
 * @module payload-path-keys
 */

/** One step of a payload path: a property name, or an index into an array. */
export type PayloadPathSegment = string | number;

/** The result of checking a parsed path against a payload. */
export interface ResolvedPayloadPath {
    /** The path, with every step that lands on an array turned into a numeric index. */
    Segments: PayloadPathSegment[];
    /** True when a value is already present at the full path. */
    Exists: boolean;
    /** Why the path cannot be written, when it cannot. */
    Error?: string;
}

const PATH_TOKEN = /\[(\d+)\]|([^.[\]]+)/g;

/** True when a bucket key is written as a path (it contains `.` or `[`). */
export function IsPathKey(key: string): boolean {
    return key.includes('.') || key.includes('[');
}

/**
 * Splits a path key into segments. Bracketed numbers (`[2]`) become numeric indexes; every other
 * step stays a string, including a bare number such as the `2` in `"dependencies.2.code"`, which
 * {@link ResolvePayloadPath} turns into an index when it lands on an array.
 *
 * @returns The segments, or null when the key is malformed (for example `"a[b]"` or `"a[1"`).
 */
export function ParsePathKey(key: string): PayloadPathSegment[] | null {
    const segments: PayloadPathSegment[] = [];
    let leftover = key;
    for (const match of key.matchAll(PATH_TOKEN)) {
        segments.push(match[1] !== undefined ? Number(match[1]) : match[2]);
        leftover = leftover.replace(match[0], '');
    }
    const onlySeparatorsLeft = /^\.*$/.test(leftover);
    return segments.length > 0 && onlySeparatorsLeft ? segments : null;
}

/** Formats segments the way people write them: `dependencies[2].code`. */
export function FormatPayloadPath(segments: PayloadPathSegment[]): string {
    return segments.reduce<string>((text, segment) => {
        if (typeof segment === 'number') return `${text}[${segment}]`;
        return text ? `${text}.${segment}` : segment;
    }, '');
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function toArrayIndex(segment: PayloadPathSegment): number {
    if (typeof segment === 'number') return segment;
    return /^\d+$/.test(segment) ? Number(segment) : NaN;
}

/**
 * Walks `segments` through `root` and reports whether the path can be written.
 *
 * - On an array, a step must be an index below the length. The index equal to the length is
 *   accepted only as the last step (an append).
 * - On an object, a step is a property name; a missing property is fine and makes the rest of the
 *   path new.
 * - Once the path has left the payload, an index is an error: there is no array to index into.
 * - A step through a string, number or other non-container value is an error.
 */
export function ResolvePayloadPath(root: unknown, segments: PayloadPathSegment[]): ResolvedPayloadPath {
    const resolved: PayloadPathSegment[] = [];
    let node: unknown = root;
    let exists = true;
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const isLast = i === segments.length - 1;
        const here = FormatPayloadPath(resolved) || 'the payload root';
        if (Array.isArray(node)) {
            const index = toArrayIndex(segment);
            if (Number.isNaN(index)) {
                return { Segments: resolved, Exists: false, Error: `'${here}' is an array, so '${segment}' must be an index` };
            }
            if (index > node.length || (index === node.length && !isLast)) {
                return { Segments: resolved, Exists: false, Error: `index ${index} is out of range for '${here}' (${node.length} items)` };
            }
            resolved.push(index);
            exists = index < node.length;
            node = exists ? node[index] : undefined;
        } else if (isPlainRecord(node)) {
            if (typeof segment === 'number') {
                return { Segments: resolved, Exists: false, Error: `'${here}' is an object, not an array, so it has no index ${segment}` };
            }
            resolved.push(segment);
            exists = segment in node;
            node = exists ? node[segment] : undefined;
        } else if (node === undefined) {
            if (typeof segment === 'number') {
                return { Segments: resolved, Exists: false, Error: `'${here}' does not exist, so it has no index ${segment}` };
            }
            resolved.push(segment);
            exists = false;
        } else {
            return { Segments: resolved, Exists: false, Error: `'${here}' is ${node === null ? 'null' : `a ${typeof node}`}, so it has no '${segment}'` };
        }
    }
    return { Segments: resolved, Exists: exists };
}

/**
 * Builds the nested change-request value for a path: `["dependencies", 2, "code"]` with `"X"`
 * becomes `{ dependencies: [ , , { code: "X" } ] }`. The array is sparse; the change-request merge
 * leaves the elements in the holes untouched.
 */
export function BuildNestedValue(segments: PayloadPathSegment[], leaf: unknown): unknown {
    let value: unknown = leaf;
    for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        if (typeof segment === 'number') {
            const array: unknown[] = new Array(segment + 1);
            array[segment] = value;
            value = array;
        } else {
            value = { [segment]: value };
        }
    }
    return value;
}
