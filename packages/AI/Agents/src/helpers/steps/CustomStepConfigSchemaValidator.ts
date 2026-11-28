/**
 * @fileoverview Lightweight, dependency-free JSON-Schema-subset validator for validating
 * `BaseAgentNextStep.customStepData` against `AIAgentStepType.ConfigSchema` before executing
 * a custom step handler (`R2-12`).
 *
 * Supported draft-07 subset keywords:
 * - `type` (`"object" | "array" | "string" | "number" | "integer" | "boolean" | "null"` or union)
 * - `properties`, `required`, `additionalProperties: false`
 * - `enum`
 * - `items`, `minItems`, `maxItems`
 * - `minLength`, `maxLength`
 * - `minimum`, `maximum`
 *
 * @module @memberjunction/ai-agents
 */

/** Parsed JSON Schema node. */
export type CustomStepConfigSchemaNode = Record<string, unknown>;

/** Structured result returned by {@link ValidateCustomStepDataAgainstConfigSchema}. */
export interface CustomStepConfigSchemaValidationResult {
    Valid: boolean;
    Errors: string[];
    SchemaError?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function jsonTypeOf(value: unknown): string {
    if (value === undefined) return 'undefined';
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

function validateNode(value: unknown, schema: CustomStepConfigSchemaNode, path: string, errors: string[]): void {
    if (!isPlainObject(schema)) {
        return;
    }

    const expectedType = schema['type'];
    if (expectedType !== undefined) {
        const typeList = (Array.isArray(expectedType) ? expectedType : [expectedType]).filter(
            (t): t is string => typeof t === 'string'
        );
        if (typeList.length > 0) {
            const actual = jsonTypeOf(value);
            if (!typeList.some((t) => typeSatisfies(actual, t))) {
                errors.push(`${path}: expected type ${typeList.join(' | ')}, got ${actual}`);
                return;
            }
        }
    }

    const allowedEnum = schema['enum'];
    if (Array.isArray(allowedEnum) && allowedEnum.length > 0) {
        if (!allowedEnum.some((candidate) => candidate === value)) {
            const rendered = allowedEnum.map((c) => JSON.stringify(c)).join(', ');
            errors.push(`${path}: value ${JSON.stringify(value)} is not one of the allowed values [${rendered}]`);
        }
    }

    if (typeof value === 'string') {
        if (typeof schema['minLength'] === 'number' && value.length < schema['minLength']) {
            errors.push(`${path}: string length ${value.length} is less than minLength ${schema['minLength']}`);
        }
        if (typeof schema['maxLength'] === 'number' && value.length > schema['maxLength']) {
            errors.push(`${path}: string length ${value.length} exceeds maxLength ${schema['maxLength']}`);
        }
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        if (typeof schema['minimum'] === 'number' && value < schema['minimum']) {
            errors.push(`${path}: value ${value} is less than minimum ${schema['minimum']}`);
        }
        if (typeof schema['maximum'] === 'number' && value > schema['maximum']) {
            errors.push(`${path}: value ${value} exceeds maximum ${schema['maximum']}`);
        }
    }

    if (isPlainObject(value)) {
        const required = schema['required'];
        if (Array.isArray(required)) {
            for (const name of required) {
                if (typeof name === 'string' && (!(name in value) || value[name] === undefined)) {
                    errors.push(`${path}: missing required property '${name}'`);
                }
            }
        }

        const properties = isPlainObject(schema['properties']) ? schema['properties'] : undefined;
        if (properties) {
            for (const key of Object.keys(properties)) {
                if (key in value && value[key] !== undefined && isPlainObject(properties[key])) {
                    validateNode(value[key], properties[key] as CustomStepConfigSchemaNode, `${path}.${key}`, errors);
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

    if (Array.isArray(value)) {
        if (typeof schema['minItems'] === 'number' && value.length < schema['minItems']) {
            errors.push(`${path}: array length ${value.length} is less than minItems ${schema['minItems']}`);
        }
        if (typeof schema['maxItems'] === 'number' && value.length > schema['maxItems']) {
            errors.push(`${path}: array length ${value.length} exceeds maxItems ${schema['maxItems']}`);
        }
        if (isPlainObject(schema['items'])) {
            value.forEach((element, index) => {
                validateNode(element, schema['items'] as CustomStepConfigSchemaNode, `${path}[${index}]`, errors);
            });
        }
    }
}

/**
 * Validates `customStepData` against an `AIAgentStepType.ConfigSchema` JSON Schema string.
 * Empty/null schemas are treated as unrestricted (`Valid: true`).
 * Malformed `ConfigSchema` JSON fails closed (`Valid: false` with `SchemaError`).
 */
export function ValidateCustomStepDataAgainstConfigSchema(
    configSchemaJson: string | null | undefined,
    customStepData: unknown
): CustomStepConfigSchemaValidationResult {
    if (!configSchemaJson || configSchemaJson.trim().length === 0) {
        return { Valid: true, Errors: [] };
    }

    let parsedSchema: unknown;
    try {
        parsedSchema = JSON.parse(configSchemaJson);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const schemaError = `Invalid ConfigSchema JSON: ${msg}`;
        return { Valid: false, Errors: [schemaError], SchemaError: schemaError };
    }

    if (!isPlainObject(parsedSchema)) {
        const schemaError = 'Invalid ConfigSchema JSON: root schema must be a JSON object.';
        return { Valid: false, Errors: [schemaError], SchemaError: schemaError };
    }

    const errors: string[] = [];
    validateNode(customStepData, parsedSchema, '$', errors);
    return { Valid: errors.length === 0, Errors: errors };
}
