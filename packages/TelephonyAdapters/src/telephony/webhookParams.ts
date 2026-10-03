/**
 * @fileoverview Flattens a carrier webhook body into the string map the signature verifiers expect.
 *
 * Webhook bodies come from the public internet, so their field names are attacker-controlled. Copying them
 * into an ordinary object lets a field named `__proto__`, `constructor` or `prototype` write through to the
 * object's prototype (remote property injection). The map built here has a `null` prototype and never accepts
 * those names, so a hostile body can only ever add plain data entries.
 *
 * @module @memberjunction/telephony-adapters
 */

/** Field names that reach an object's prototype machinery and are therefore never copied. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Coerces an Express body (urlencoded or JSON object) into a prototype-free `Record<string, string>`.
 * String values are kept as-is; numbers and booleans are stringified (Vonage JSON events carry them);
 * anything else (objects, arrays, null) is dropped, as are the forbidden keys.
 *
 * @param body The parsed request body.
 * @returns A map with a `null` prototype holding only the safe scalar fields.
 */
export function CoerceWebhookParams(body: unknown): Record<string, string> {
    const out = Object.create(null) as Record<string, string>;
    if (!body || typeof body !== 'object') {
        return out;
    }
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (FORBIDDEN_KEYS.has(key)) {
            continue;
        }
        if (typeof value === 'string') {
            out[key] = value;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            out[key] = String(value);
        }
    }
    return out;
}
