/**
 * @fileoverview Flattens a carrier webhook body into the string map the signature verifiers expect.
 *
 * Webhook bodies come from the public internet, so their field names are attacker-controlled. Assigning them
 * with `out[key] = value` lets a field named `__proto__` reach the prototype (remote property injection).
 * This module never assigns a request-supplied name: it filters the entries and builds the map with
 * `Object.fromEntries`, which defines each field as an own data property (it never runs the `__proto__`
 * setter). The prototype-reaching names are dropped as well, so they cannot even appear as own keys.
 *
 * @module @memberjunction/telephony-adapters
 */

/** Field names that reach an object's prototype machinery and are therefore never copied. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Coerces an Express body (urlencoded or JSON object) into a `Record<string, string>`.
 * String values are kept as-is; numbers and booleans are stringified (Vonage JSON events carry them);
 * anything else (objects, arrays, null) is dropped, as are the forbidden keys.
 *
 * @param body The parsed request body.
 * @returns A map holding only the safe scalar fields, each an own data property.
 */
export function CoerceWebhookParams(body: unknown): Record<string, string> {
    if (!body || typeof body !== 'object') {
        return {};
    }
    const safeEntries: [string, string][] = [];
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        const text = toParamString(value);
        if (text !== undefined && !FORBIDDEN_KEYS.has(key)) {
            safeEntries.push([key, text]);
        }
    }
    return Object.fromEntries(safeEntries);
}

/** The string form of a scalar webhook value, or `undefined` for anything that is not a scalar. */
function toParamString(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return undefined;
}
