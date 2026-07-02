/**
 * @fileoverview Lightweight JSON-Schema-subset validator used by server-side entity
 * subclasses to validate configuration JSON against a published schema (e.g.
 * `AIAgent.TypeConfiguration` against `AIAgentType.ConfigSchema`).
 *
 * Deliberately NOT a full draft-07 implementation and deliberately dependency-free (no `ajv`):
 * type/required/properties/enum/items/additionalProperties checks are enough for the
 * configuration shapes MJ publishes, and unknown keywords are IGNORED (forward-compatible —
 * a schema using a keyword this validator doesn't know simply isn't enforced on that axis).
 *
 * Supported keywords:
 * - `type` — `"object" | "array" | "string" | "number" | "integer" | "boolean" | "null"`,
 *   or an array of those (union).
 * - `properties` — per-key subschemas, recursed.
 * - `required` — array of required property names (applies to objects).
 * - `enum` — allowed literal values (strict equality on primitives).
 * - `items` — single subschema applied to every array element.
 * - `additionalProperties` — `false` rejects keys not listed in `properties`; any other value
 *   (including a subschema) is ignored.
 *
 * @module @memberjunction/core-entities-server
 */

/** A parsed JSON Schema (subset) node. */
export type JsonSchemaLite = Record<string, unknown>;

/** True for a plain JSON object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Maps a runtime value onto its JSON-Schema type name. */
function jsonTypeOf(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    switch (typeof value) {
        case 'string': return 'string';
        case 'number': return Number.isInteger(value) ? 'integer' : 'number';
        case 'boolean': return 'boolean';
        case 'object': return 'object';
        default: return typeof value;
    }
}

/** True when a runtime JSON type name satisfies a schema type name (`integer` ⊂ `number`). */
function typeSatisfies(actual: string, expected: string): boolean {
    return actual === expected || (expected === 'number' && actual === 'integer');
}

/**
 * Validates a parsed JSON value against a JSON-Schema-subset node, returning human-readable
 * error strings (empty array = valid). Never throws — a malformed schema node is skipped
 * (its constraints simply aren't enforced).
 *
 * @param value The parsed JSON value to validate.
 * @param schema The parsed schema node.
 * @param path JSON-path-ish location prefix used in error messages (defaults to `$`).
 * @returns The list of violations (empty when valid).
 */
export function ValidateJsonAgainstSchemaLite(value: unknown, schema: JsonSchemaLite, path: string = '$'): string[] {
    const errors: string[] = [];
    if (!isPlainObject(schema)) {
        return errors;
    }

    validateType(value, schema, path, errors);
    validateEnum(value, schema, path, errors);

    if (isPlainObject(value)) {
        validateObjectKeywords(value, schema, path, errors);
    }
    if (Array.isArray(value) && isPlainObject(schema['items'])) {
        value.forEach((element, index) => {
            errors.push(...ValidateJsonAgainstSchemaLite(element, schema['items'] as JsonSchemaLite, `${path}[${index}]`));
        });
    }
    return errors;
}

/** Enforces the `type` keyword (string or union array). */
function validateType(value: unknown, schema: JsonSchemaLite, path: string, errors: string[]): void {
    const expected = schema['type'];
    if (expected === undefined) {
        return;
    }
    const expectedList = Array.isArray(expected) ? expected : [expected];
    const names = expectedList.filter((t): t is string => typeof t === 'string');
    if (names.length === 0) {
        return; // malformed type keyword — skipped
    }
    const actual = jsonTypeOf(value);
    if (!names.some((t) => typeSatisfies(actual, t))) {
        errors.push(`${path}: expected type ${names.join(' | ')}, got ${actual}`);
    }
}

/** Enforces the `enum` keyword (strict primitive equality). */
function validateEnum(value: unknown, schema: JsonSchemaLite, path: string, errors: string[]): void {
    const allowed = schema['enum'];
    if (!Array.isArray(allowed) || allowed.length === 0) {
        return;
    }
    if (!allowed.some((candidate) => candidate === value)) {
        const rendered = allowed.map((c) => JSON.stringify(c)).join(', ');
        errors.push(`${path}: value ${JSON.stringify(value)} is not one of the allowed values [${rendered}]`);
    }
}

/** Enforces `required`, `properties` recursion, and `additionalProperties: false` on objects. */
function validateObjectKeywords(value: Record<string, unknown>, schema: JsonSchemaLite, path: string, errors: string[]): void {
    const required = schema['required'];
    if (Array.isArray(required)) {
        for (const name of required) {
            if (typeof name === 'string' && !(name in value)) {
                errors.push(`${path}: missing required property '${name}'`);
            }
        }
    }

    const properties = isPlainObject(schema['properties']) ? schema['properties'] : undefined;
    if (properties) {
        for (const key of Object.keys(properties)) {
            if (key in value && isPlainObject(properties[key])) {
                errors.push(...ValidateJsonAgainstSchemaLite(value[key], properties[key] as JsonSchemaLite, `${path}.${key}`));
            }
        }
        if (schema['additionalProperties'] === false) {
            for (const key of Object.keys(value)) {
                if (!(key in properties)) {
                    errors.push(`${path}: unexpected property '${key}' (additionalProperties is false)`);
                }
            }
        }
    }
}
