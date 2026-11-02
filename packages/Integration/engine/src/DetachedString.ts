/**
 * Returns a copy of `value` that shares no memory with the string it was taken from.
 *
 * V8 stores a regex capture or substring as a pointer into its source string, so keeping the part
 * keeps the whole source. For a value a connector parsed out of response text, the source is the
 * whole page. Values kept after their batch is processed go through this.
 *
 * A value that is not a string is returned as is: only a string can point into a page.
 */
export function DetachString<T>(value: T): T {
    if (typeof value !== 'string') return value;
    // JSON.stringify always builds a new string, so the parsed copy cannot point into `value`.
    return JSON.parse(JSON.stringify(value)) as T;
}
