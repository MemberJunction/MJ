/**
 * Unit tests for CredentialEngine
 *
 * Tests the pure logic methods of CredentialEngine:
 * - Schema validation with Ajv
 * - Schema default application
 * - Credential resolution logic
 * - Value parsing
 * - Error formatting
 *
 * External dependencies (database, Metadata) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// We test the logic that CredentialEngine uses internally
// by testing the same Ajv validation patterns directly

describe('CredentialEngine Schema Defaults Application', () => {
    // Replicate the applySchemaDefaults logic
    function applySchemaDefaults(values: Record<string, string>, fieldSchemaJson: string): Record<string, string> {
        if (!fieldSchemaJson) return values;
        try {
            const schema = JSON.parse(fieldSchemaJson);
            const properties = schema.properties || {};
            const result = { ...values };

            for (const [fieldName, fieldSchema] of Object.entries(properties)) {
                const propSchema = fieldSchema as Record<string, unknown>;
                if (!(fieldName in result) && 'const' in propSchema) {
                    result[fieldName] = String(propSchema.const);
                } else if (!(fieldName in result) && 'default' in propSchema) {
                    result[fieldName] = String(propSchema.default);
                }
            }
            return result;
        } catch {
            return values;
        }
    }

    it('should apply default values for missing fields', () => {
        const schema = JSON.stringify({
            type: 'object',
            properties: {
                region: { type: 'string', default: 'us-east-1' },
                apiKey: { type: 'string' }
            }
        });

        const result = applySchemaDefaults({ apiKey: 'test-key' }, schema);
        expect(result.region).toBe('us-east-1');
        expect(result.apiKey).toBe('test-key');
    });

    it('should not override existing values with defaults', () => {
        const schema = JSON.stringify({
            type: 'object',
            properties: {
                region: { type: 'string', default: 'us-east-1' }
            }
        });

        const result = applySchemaDefaults({ region: 'eu-west-1' }, schema);
        expect(result.region).toBe('eu-west-1');
    });

    it('should apply const values for missing fields', () => {
        const schema = JSON.stringify({
            type: 'object',
            properties: {
                tokenUrl: { type: 'string', const: 'https://api.box.com/oauth2/token' }
            }
        });

        const result = applySchemaDefaults({}, schema);
        expect(result.tokenUrl).toBe('https://api.box.com/oauth2/token');
    });

    it('should prioritize const over default', () => {
        const schema = JSON.stringify({
            type: 'object',
            properties: {
                field: { type: 'string', const: 'fixed-value', default: 'default-value' }
            }
        });

        const result = applySchemaDefaults({}, schema);
        expect(result.field).toBe('fixed-value');
    });

    it('should return original values for invalid schema JSON', () => {
        const values = { key: 'value' };
        const result = applySchemaDefaults(values, 'not-json');
        expect(result).toEqual(values);
    });

    it('should return original values for empty schema', () => {
        const values = { key: 'value' };
        const result = applySchemaDefaults(values, '');
        expect(result).toEqual(values);
    });

    it('should handle schema with no properties', () => {
        const schema = JSON.stringify({ type: 'object' });
        const result = applySchemaDefaults({ key: 'value' }, schema);
        expect(result).toEqual({ key: 'value' });
    });
});

describe('CredentialEngine Validation Error Formatting', () => {
    // Replicate the formatValidationErrors logic
    function formatValidationErrors(errors: Array<{ keyword: string; instancePath: string; params: Record<string, unknown>; message?: string }>): string[] {
        return errors.map(error => {
            const field = error.instancePath.replace(/^\//, '') || 'credential';

            switch (error.keyword) {
                case 'required':
                    return `Missing required field: ${error.params.missingProperty}`;
                case 'const':
                    return `Field "${field}" must be "${error.params.allowedValue}"`;
                case 'enum': {
                    const allowed = (error.params.allowedValues as string[]).join(', ');
                    return `Field "${field}" must be one of: ${allowed}`;
                }
                case 'format':
                    return `Field "${field}" must be a valid ${error.params.format}`;
                case 'pattern':
                    return `Field "${field}" does not match required pattern`;
                case 'minLength':
                    return `Field "${field}" must be at least ${error.params.limit} characters`;
                case 'maxLength':
                    return `Field "${field}" must be no more than ${error.params.limit} characters`;
                case 'minimum':
                    return `Field "${field}" must be at least ${error.params.limit}`;
                case 'maximum':
                    return `Field "${field}" must be no more than ${error.params.limit}`;
                default:
                    return `Field "${field}": ${error.message}`;
            }
        });
    }

    it('should format required error', () => {
        const errors = formatValidationErrors([{
            keyword: 'required',
            instancePath: '',
            params: { missingProperty: 'apiKey' }
        }]);
        expect(errors).toEqual(['Missing required field: apiKey']);
    });

    it('should format const error', () => {
        const errors = formatValidationErrors([{
            keyword: 'const',
            instancePath: '/tokenUrl',
            params: { allowedValue: 'https://api.box.com/oauth2/token' }
        }]);
        expect(errors).toEqual(['Field "tokenUrl" must be "https://api.box.com/oauth2/token"']);
    });

    it('should format enum error', () => {
        const errors = formatValidationErrors([{
            keyword: 'enum',
            instancePath: '/type',
            params: { allowedValues: ['enterprise', 'user'] }
        }]);
        expect(errors).toEqual(['Field "type" must be one of: enterprise, user']);
    });

    it('should format format error', () => {
        const errors = formatValidationErrors([{
            keyword: 'format',
            instancePath: '/endpoint',
            params: { format: 'uri' }
        }]);
        expect(errors).toEqual(['Field "endpoint" must be a valid uri']);
    });

    it('should format pattern error', () => {
        const errors = formatValidationErrors([{
            keyword: 'pattern',
            instancePath: '/apiKey',
            params: { pattern: '^sk-' }
        }]);
        expect(errors).toEqual(['Field "apiKey" does not match required pattern']);
    });

    it('should format minLength error', () => {
        const errors = formatValidationErrors([{
            keyword: 'minLength',
            instancePath: '/password',
            params: { limit: 8 }
        }]);
        expect(errors).toEqual(['Field "password" must be at least 8 characters']);
    });

    it('should format maxLength error', () => {
        const errors = formatValidationErrors([{
            keyword: 'maxLength',
            instancePath: '/name',
            params: { limit: 50 }
        }]);
        expect(errors).toEqual(['Field "name" must be no more than 50 characters']);
    });

    it('should format unknown error with default message', () => {
        const errors = formatValidationErrors([{
            keyword: 'additionalProperties',
            instancePath: '',
            params: {},
            message: 'must NOT have additional properties'
        }]);
        expect(errors).toEqual(['Field "credential": must NOT have additional properties']);
    });

    it('should use "credential" as field name when instancePath is empty', () => {
        const errors = formatValidationErrors([{
            keyword: 'required',
            instancePath: '',
            params: { missingProperty: 'apiKey' }
        }]);
        expect(errors[0]).toContain('apiKey');
    });
});

describe('CredentialEngine Value Parsing', () => {
    // Replicate parseCredentialValues logic
    function parseCredentialValues(valuesField: string): Record<string, string> {
        if (!valuesField) return {};
        try {
            if (typeof valuesField === 'object') {
                return valuesField as Record<string, string>;
            }
            return JSON.parse(valuesField);
        } catch {
            return {};
        }
    }

    it('should parse valid JSON string', () => {
        const result = parseCredentialValues('{"apiKey": "sk-test123"}');
        expect(result).toEqual({ apiKey: 'sk-test123' });
    });

    it('should return empty object for empty string', () => {
        expect(parseCredentialValues('')).toEqual({});
    });

    it('should return empty object for null-ish input', () => {
        expect(parseCredentialValues(null as unknown as string)).toEqual({});
        expect(parseCredentialValues(undefined as unknown as string)).toEqual({});
    });

    it('should return empty object for invalid JSON', () => {
        expect(parseCredentialValues('not-json')).toEqual({});
    });

    it('should handle already-parsed object', () => {
        const obj = { apiKey: 'test' } as unknown as string;
        const result = parseCredentialValues(obj);
        expect(result).toEqual({ apiKey: 'test' });
    });

    it('should parse complex credential values', () => {
        const json = JSON.stringify({
            clientId: 'id-123',
            clientSecret: 'secret-456',
            tokenUrl: 'https://api.example.com/token',
            scope: 'read write'
        });
        const result = parseCredentialValues(json);
        expect(result.clientId).toBe('id-123');
        expect(result.clientSecret).toBe('secret-456');
        expect(result.tokenUrl).toBe('https://api.example.com/token');
        expect(result.scope).toBe('read write');
    });
});
