/**
 * @fileoverview Schema validation oracle implementation
 * @module @memberjunction/testing-engine
 */

import { IOracle } from './IOracle';
import { OracleInput, OracleConfig, OracleResult } from '../types';

/**
 * Schema Validator Oracle.
 *
 * Validates that actual output conforms to an expected JSON schema.
 * Uses JSON Schema draft-07 specification for validation.
 *
 * Configuration:
 * - schema: JSON Schema object defining expected structure
 * - strict: Whether to fail on additional properties (default: false)
 *
 * @example
 * ```typescript
 * const oracle = new SchemaValidatorOracle();
 * const result = await oracle.evaluate({
 *     actualOutput: { name: 'John', age: 30 },
 *     expectedOutput: {
 *         responseSchema: {
 *             type: 'object',
 *             required: ['name', 'age'],
 *             properties: {
 *                 name: { type: 'string' },
 *                 age: { type: 'number' }
 *             }
 *         }
 *     }
 * }, {});
 * ```
 */
export class SchemaValidatorOracle implements IOracle {
    readonly type = 'schema-validate';

    /**
     * Evaluate actual output against JSON schema.
     *
     * @param input - Oracle input with expected schema and actual output
     * @param config - Oracle configuration
     * @returns Oracle result with pass/fail and validation details
     */
    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            // Extract schema from expected outcomes
            const schema = (input.expectedOutput as any)?.responseSchema;
            if (!schema) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: 'No responseSchema provided in ExpectedOutcomes'
                };
            }

            // Validate actual output against schema
            const validationErrors = this.validateAgainstSchema(
                input.actualOutput,
                schema,
                config.strict as boolean
            );

            if (validationErrors.length === 0) {
                return {
                    oracleType: this.type,
                    passed: true,
                    score: 1.0,
                    message: 'Output matches expected schema'
                };
            } else {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: `Schema validation failed: ${validationErrors.join(', ')}`,
                    details: { validationErrors }
                };
            }

        } catch (error) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `Schema validation error: ${(error as Error).message}`
            };
        }
    }

    /**
     * Validate data against JSON schema.
     * @private
     */
    private validateAgainstSchema(
        data: unknown,
        schema: Record<string, unknown>,
        strict: boolean = false
    ): string[] {
        const errors: string[] = [];

        // Simple JSON Schema validation implementation
        // For production, consider using a library like ajv
        this.validateValue(data, schema, 'root', errors, strict);

        return errors;
    }

    /**
     * Validate a single value against schema.
     * @private
     */
    private validateValue(
        value: unknown,
        schema: Record<string, unknown>,
        path: string,
        errors: string[],
        strict: boolean
    ): void {
        // Check type
        const expectedType = schema.type as string;
        const actualType = this.getType(value);

        if (expectedType && actualType !== expectedType) {
            errors.push(`${path}: Expected type ${expectedType}, got ${actualType}`);
            return;
        }

        // Check required properties for objects
        if (actualType === 'object' && value !== null) {
            const obj = value as Record<string, unknown>;
            const required = schema.required as string[] || [];
            const properties = schema.properties as Record<string, Record<string, unknown>> || {};

            // Check required fields
            for (const requiredProp of required) {
                if (!(requiredProp in obj)) {
                    errors.push(`${path}: Missing required property '${requiredProp}'`);
                }
            }

            // Validate properties
            for (const [key, val] of Object.entries(obj)) {
                if (properties[key]) {
                    this.validateValue(val, properties[key], `${path}.${key}`, errors, strict);
                } else if (strict) {
                    errors.push(`${path}: Unexpected property '${key}'`);
                }
            }
        }

        // Check array items
        if (actualType === 'array' && schema.items) {
            const arr = value as unknown[];
            const itemSchema = schema.items as Record<string, unknown>;

            for (let i = 0; i < arr.length; i++) {
                this.validateValue(arr[i], itemSchema, `${path}[${i}]`, errors, strict);
            }
        }

        // Check enum values
        if (schema.enum) {
            const enumValues = schema.enum as unknown[];
            if (!enumValues.includes(value)) {
                errors.push(
                    `${path}: Value must be one of [${enumValues.join(', ')}], got '${value}'`
                );
            }
        }

        // Check string patterns
        if (actualType === 'string' && schema.pattern) {
            const pattern = new RegExp(schema.pattern as string);
            if (!pattern.test(value as string)) {
                errors.push(`${path}: String does not match pattern ${schema.pattern}`);
            }
        }

        // Check numeric constraints
        if (actualType === 'number') {
            const num = value as number;

            if (schema.minimum != null && num < (schema.minimum as number)) {
                errors.push(`${path}: Value ${num} is less than minimum ${schema.minimum}`);
            }

            if (schema.maximum != null && num > (schema.maximum as number)) {
                errors.push(`${path}: Value ${num} is greater than maximum ${schema.maximum}`);
            }
        }
    }

    /**
     * Get JSON Schema type for a value.
     * @private
     */
    private getType(value: unknown): string {
        if (value === null) {
            return 'null';
        }

        if (Array.isArray(value)) {
            return 'array';
        }

        const jsType = typeof value;

        if (jsType === 'boolean') {
            return 'boolean';
        }

        if (jsType === 'number') {
            return Number.isInteger(value) ? 'integer' : 'number';
        }

        if (jsType === 'string') {
            return 'string';
        }

        if (jsType === 'object') {
            return 'object';
        }

        return 'unknown';
    }
}
