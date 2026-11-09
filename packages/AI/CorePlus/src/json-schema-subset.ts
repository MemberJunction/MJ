/**
 * @fileoverview A small, dependency-free, **client-safe** JSON-Schema-subset validator.
 *
 * Used where a model-supplied JSON value must be checked against a schema a channel (or tool)
 * declared — most importantly the realtime channel dispatcher, which validates a verb call's
 * parameters *before* running it so a malformed call comes back as a structured error the model
 * can correct, rather than as a half-applied mutation or an opaque exception.
 *
 * Deliberately NOT a full draft-07 implementation and deliberately free of `ajv`: the browser
 * runtime and every embed bundle would pay for it, and the schemas channels write are small. It
 * enforces the keywords below and **ignores every other keyword** (forward-compatible — a schema
 * that uses `oneOf` or `pattern` simply isn't checked on that axis, it is never rejected).
 *
 * Supported keywords:
 * - `type` — `object | array | string | number | integer | boolean | null`, or an array of them.
 * - `enum` — allowed literal values (strict equality on primitives).
 * - `required`, `properties`, `additionalProperties: false` — objects.
 * - `items` — a single subschema applied to every array element.
 * - `minimum`, `maximum` — numbers.
 * - `minLength`, `maxLength` — strings.
 * - `minItems`, `maxItems` — arrays.
 *
 * The semantics for the first group mirror `ValidateJsonAgainstSchemaLite` in
 * `@memberjunction/core-entities-server`, which cannot be imported here (it is a server-only
 * package). The two are intentionally parallel; unifying them behind one shared package is a
 * follow-up that this module does not block.
 *
 * @module @memberjunction/ai-core-plus
 */

/** A parsed JSON Schema (subset) node. */
export type JsonSchemaSubset = Record<string, unknown>;

/** True for a plain JSON object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Maps a runtime value onto its JSON-Schema type name (`integer` is reported for whole numbers). */
function jsonTypeOf(value: unknown): string {
    if (value === null) {
        return 'null';
    }
    if (Array.isArray(value)) {
        return 'array';
    }
    switch (typeof value) {
        case 'string':
            return 'string';
        case 'number':
            return Number.isInteger(value) ? 'integer' : 'number';
        case 'boolean':
            return 'boolean';
        case 'object':
            return 'object';
        default:
            return typeof value;
    }
}

/** True when a runtime JSON type satisfies a schema type (`integer` is a subset of `number`). */
function typeSatisfies(actual: string, expected: string): boolean {
    return actual === expected || (expected === 'number' && actual === 'integer');
}

/**
 * Validates a parsed JSON value against a JSON-Schema-subset node.
 *
 * Never throws — a malformed schema node is skipped (its constraints simply are not enforced).
 *
 * @param value The parsed JSON value to validate.
 * @param schema The schema node.
 * @param path JSON-path-ish prefix used in messages; callers normally leave it at `$`.
 * @returns Human-readable violations, in document order; an empty array means valid.
 */
export function ValidateJsonAgainstSchemaSubset(value: unknown, schema: JsonSchemaSubset, path: string = '$'): string[] {
    const errors: string[] = [];
    if (!isPlainObject(schema)) {
        return errors;
    }
    checkType(value, schema, path, errors);
    checkEnum(value, schema, path, errors);
    if (typeof value === 'number') {
        checkNumberBounds(value, schema, path, errors);
    } else if (typeof value === 'string') {
        checkStringBounds(value, schema, path, errors);
    } else if (Array.isArray(value)) {
        checkArray(value, schema, path, errors);
    } else if (isPlainObject(value)) {
        checkObject(value, schema, path, errors);
    }
    return errors;
}

/** Enforces `type` (a string or a union array). */
function checkType(value: unknown, schema: JsonSchemaSubset, path: string, errors: string[]): void {
    const expected = schema['type'];
    if (expected === undefined) {
        return;
    }
    const names = (Array.isArray(expected) ? expected : [expected]).filter((t): t is string => typeof t === 'string');
    if (names.length === 0) {
        return; // malformed `type` keyword — skipped
    }
    const actual = jsonTypeOf(value);
    if (!names.some((t) => typeSatisfies(actual, t))) {
        errors.push(`${path}: expected type ${names.join(' | ')}, got ${actual}`);
    }
}

/** Enforces `enum` with strict primitive equality. */
function checkEnum(value: unknown, schema: JsonSchemaSubset, path: string, errors: string[]): void {
    const allowed = schema['enum'];
    if (!Array.isArray(allowed) || allowed.length === 0) {
        return;
    }
    if (!allowed.some((candidate) => candidate === value)) {
        errors.push(`${path}: value ${JSON.stringify(value)} is not one of the allowed values [${allowed.map((c) => JSON.stringify(c)).join(', ')}]`);
    }
}

/** Enforces `minimum` / `maximum`. */
function checkNumberBounds(value: number, schema: JsonSchemaSubset, path: string, errors: string[]): void {
    const min = schema['minimum'];
    const max = schema['maximum'];
    if (typeof min === 'number' && value < min) {
        errors.push(`${path}: ${value} is below the minimum of ${min}`);
    }
    if (typeof max === 'number' && value > max) {
        errors.push(`${path}: ${value} is above the maximum of ${max}`);
    }
}

/** Enforces `minLength` / `maxLength`. */
function checkStringBounds(value: string, schema: JsonSchemaSubset, path: string, errors: string[]): void {
    const min = schema['minLength'];
    const max = schema['maxLength'];
    if (typeof min === 'number' && value.length < min) {
        errors.push(`${path}: string is shorter than the minimum length of ${min}`);
    }
    if (typeof max === 'number' && value.length > max) {
        errors.push(`${path}: string is longer than the maximum length of ${max}`);
    }
}

/** Enforces `minItems` / `maxItems` and recurses into `items`. */
function checkArray(value: unknown[], schema: JsonSchemaSubset, path: string, errors: string[]): void {
    const min = schema['minItems'];
    const max = schema['maxItems'];
    if (typeof min === 'number' && value.length < min) {
        errors.push(`${path}: array has fewer than the minimum of ${min} item(s)`);
    }
    if (typeof max === 'number' && value.length > max) {
        errors.push(`${path}: array has more than the maximum of ${max} item(s)`);
    }
    const items = schema['items'];
    if (isPlainObject(items)) {
        value.forEach((element, index) => {
            errors.push(...ValidateJsonAgainstSchemaSubset(element, items, `${path}[${index}]`));
        });
    }
}

/** Enforces `required`, recurses into `properties`, and applies `additionalProperties: false`. */
function checkObject(value: Record<string, unknown>, schema: JsonSchemaSubset, path: string, errors: string[]): void {
    const required = schema['required'];
    if (Array.isArray(required)) {
        for (const name of required) {
            if (typeof name === 'string' && !(name in value)) {
                errors.push(`${path}: missing required property '${name}'`);
            }
        }
    }
    const properties = isPlainObject(schema['properties']) ? schema['properties'] : undefined;
    if (!properties) {
        return;
    }
    for (const key of Object.keys(properties)) {
        const child = properties[key];
        if (key in value && isPlainObject(child)) {
            errors.push(...ValidateJsonAgainstSchemaSubset(value[key], child, `${path}.${key}`));
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
