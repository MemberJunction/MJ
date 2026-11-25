/**
 * @fileoverview Lightweight JSON-Schema-subset validator for validating
 * `MJ: Tour Steps.Configuration` against `MJ: Tour Step Types.ConfigSchema`.
 * @module @memberjunction/tours-server
 */

/** Parsed JSON Schema node. */
export type TourConfigJsonSchema = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function jsonTypeOf(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
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

function typeSatisfies(actual: string, expected: string): boolean {
    return actual === expected || (expected === 'number' && actual === 'integer');
}

function validateType(
    value: unknown,
    schema: TourConfigJsonSchema,
    path: string,
    errors: string[],
): void {
    const expected = schema['type'];
    if (expected === undefined) {
        return;
    }
    const expectedList = Array.isArray(expected) ? expected : [expected];
    const names = expectedList.filter((t): t is string => typeof t === 'string');
    if (names.length === 0) {
        return;
    }
    const actual = jsonTypeOf(value);
    if (!names.some((t) => typeSatisfies(actual, t))) {
        errors.push(`${path}: expected type ${names.join(' | ')}, got ${actual}`);
    }
}

function validateEnum(
    value: unknown,
    schema: TourConfigJsonSchema,
    path: string,
    errors: string[],
): void {
    const allowed = schema['enum'];
    if (!Array.isArray(allowed) || allowed.length === 0) {
        return;
    }
    if (!allowed.some((candidate) => candidate === value)) {
        const rendered = allowed.map((c) => JSON.stringify(c)).join(', ');
        errors.push(`${path}: value ${JSON.stringify(value)} is not one of [${rendered}]`);
    }
}

function validateNumericBounds(
    value: unknown,
    schema: TourConfigJsonSchema,
    path: string,
    errors: string[],
): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return;
    }
    const minimum = schema['minimum'];
    if (typeof minimum === 'number' && value < minimum) {
        errors.push(`${path}: value ${value} is less than minimum ${minimum}`);
    }
    const maximum = schema['maximum'];
    if (typeof maximum === 'number' && value > maximum) {
        errors.push(`${path}: value ${value} exceeds maximum ${maximum}`);
    }
}

function validateArrayConstraints(
    value: unknown[],
    schema: TourConfigJsonSchema,
    path: string,
    errors: string[],
): void {
    const minItems = schema['minItems'];
    if (typeof minItems === 'number' && value.length < minItems) {
        errors.push(`${path}: expected at least ${minItems} item(s), got ${value.length}`);
    }
    const maxItems = schema['maxItems'];
    if (typeof maxItems === 'number' && value.length > maxItems) {
        errors.push(`${path}: expected at most ${maxItems} item(s), got ${value.length}`);
    }
    const itemSchema = schema['items'];
    if (isPlainObject(itemSchema)) {
        for (let i = 0; i < value.length; i++) {
            errors.push(...ValidateJsonAgainstSchema(value[i], itemSchema, `${path}[${i}]`));
        }
    }
}

function validateObjectKeywords(
    value: Record<string, unknown>,
    schema: TourConfigJsonSchema,
    path: string,
    errors: string[],
): void {
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
                errors.push(
                    ...ValidateJsonAgainstSchema(
                        value[key],
                        properties[key] as TourConfigJsonSchema,
                        `${path}.${key}`,
                    ),
                );
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

/**
 * Validates a parsed JSON value against a JSON-Schema-subset node.
 * Returns human-readable error strings (empty array = valid).
 */
export function ValidateJsonAgainstSchema(
    value: unknown,
    schema: TourConfigJsonSchema,
    path: string = '$',
): string[] {
    const errors: string[] = [];
    if (!isPlainObject(schema)) {
        return errors;
    }

    validateType(value, schema, path, errors);
    validateEnum(value, schema, path, errors);
    validateNumericBounds(value, schema, path, errors);

    if (isPlainObject(value)) {
        validateObjectKeywords(value, schema, path, errors);
    }
    if (Array.isArray(value)) {
        validateArrayConstraints(value, schema, path, errors);
    }

    return errors;
}
