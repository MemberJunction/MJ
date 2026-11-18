/**
 * Guards against prototype pollution from model-written JSON.
 *
 * `JSON.parse` keeps a `"__proto__"` key as an ordinary own property. Code that later walks that
 * object with `key in target` / `target[key]` (a payload merge, a deep clone) follows the key into
 * `Object.prototype` and writes there, changing every object in the process. Model output can carry
 * text injected through user input, documents or tool results, so these keys are dropped wherever
 * agent JSON enters the system.
 */

/** Keys that reach an object's prototype chain instead of naming data. */
export const UNSAFE_OBJECT_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** True when a key would reach the prototype chain if used as a property name. */
export function IsUnsafeObjectKey(key: string): boolean {
    return UNSAFE_OBJECT_KEYS.has(key);
}

/**
 * Removes {@link UNSAFE_OBJECT_KEYS} from a JSON-like value, in place, at every depth.
 *
 * @returns The dotted paths of the keys removed, for warnings. Empty when nothing was removed.
 */
export function StripUnsafeObjectKeys(value: unknown, path: string[] = []): string[] {
    const removed: string[] = [];
    if (value === null || typeof value !== 'object') {
        return removed;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => removed.push(...StripUnsafeObjectKeys(item, [...path, String(index)])));
        return removed;
    }
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        if (IsUnsafeObjectKey(key)) {
            delete obj[key];
            removed.push([...path, key].join('.'));
        } else {
            removed.push(...StripUnsafeObjectKeys(obj[key], [...path, key]));
        }
    }
    return removed;
}
