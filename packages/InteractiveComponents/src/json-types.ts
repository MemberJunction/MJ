/**
 * Recursive JSON value primitives and runtime type guards for MemberJunction
 * Interactive Component contracts.
 *
 * These types replace `any` and `Record<string, unknown>` across widget host
 * props, JSON Schema descriptors, host context metadata, and remote operation
 * input schemas.
 */

/**
 * Valid JSON primitive value.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Recursive JSON-serializable array.
 */
export type JsonArray = JsonValue[];

/**
 * Recursive JSON-serializable plain object.
 */
export interface JsonObject {
    [key: string]: JsonValue;
}

/**
 * Strict recursive JSON value union.
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * Immutable JSON object map used for host-provided read-only snapshots.
 */
export type ReadonlyJsonObject = Readonly<Record<string, JsonValue>>;

/**
 * Checks whether a runtime value is a non-null plain object (prototype is
 * `Object.prototype` or `null`, and not an array).
 */
export function IsPlainObject(value: unknown): value is object {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const proto: object | null = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Runtime type guard for {@link JsonPrimitive}.
 * Rejects non-finite numbers (`NaN`, `Infinity`, `-Infinity`) because JSON
 * cannot represent them faithfully.
 */
export function IsJsonPrimitive(value: unknown): value is JsonPrimitive {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    return false;
}

/**
 * Runtime type guard for {@link JsonObject}.
 * Optionally detects circular references using a `WeakSet` of visited objects.
 */
export function IsJsonObject(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): value is JsonObject {
    if (!IsPlainObject(value) || seen.has(value)) {
        return false;
    }
    seen.add(value);
    try {
        const values = Object.values(value);
        for (const entry of values) {
            if (!IsJsonValue(entry, seen)) {
                return false;
            }
        }
        return true;
    } finally {
        seen.delete(value);
    }
}

/**
 * Runtime type guard for {@link JsonArray}.
 */
export function IsJsonArray(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): value is JsonArray {
    if (!Array.isArray(value) || seen.has(value)) {
        return false;
    }
    seen.add(value);
    try {
        for (const item of value) {
            if (!IsJsonValue(item, seen)) {
                return false;
            }
        }
        return true;
    } finally {
        seen.delete(value);
    }
}

/**
 * Runtime type guard for {@link JsonValue}.
 */
export function IsJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): value is JsonValue {
    if (IsJsonPrimitive(value)) {
        return true;
    }
    if (Array.isArray(value)) {
        return IsJsonArray(value, seen);
    }
    if (IsPlainObject(value)) {
        return IsJsonObject(value, seen);
    }
    return false;
}

/**
 * Checks whether a runtime value is a non-empty, non-whitespace-only string.
 */
export function IsNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}
