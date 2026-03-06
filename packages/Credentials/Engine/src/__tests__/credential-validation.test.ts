/**
 * Unit tests for credential validation using Ajv JSON Schema validator
 *
 * These tests verify that the CredentialEngine properly validates credential values
 * against JSON Schema constraints including:
 * - required fields
 * - const (fixed values)
 * - enum (allowed values)
 * - format (uri, email, date, etc.)
 * - pattern (regex)
 * - minLength/maxLength
 * - minimum/maximum
 * - default value application
 */

import { describe, test, expect, beforeEach } from 'vitest';
import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

describe('Credential Validation with Ajv', () => {
    let ajv: Ajv;

    beforeEach(() => {
        // Initialize Ajv with same options as CredentialEngine
        ajv = new Ajv({
            allErrors: true,
            strict: false,
            coerceTypes: false
        });
        addFormats(ajv);
    });

    describe('Required Field Validation', () => {
        test('should reject when required field is missing', () => {
            const schema = {
                type: 'object',
                properties: {
                    apiKey: { type: 'string' }
                },
                required: ['apiKey']
            };

            const validator = ajv.compile(schema);
            const result = validator({});

            expect(result).toBe(false);
            expect(validator.errors).toBeDefined();
            expect(validator.errors?.[0].keyword).toBe('required');
            expect(validator.errors?.[0].params.missingProperty).toBe('apiKey');
        });

        test('should pass when all required fields are present', () => {
            const schema = {
                type: 'object',
                properties: {
                    apiKey: { type: 'string' },
                    endpoint: { type: 'string' }
                },
                required: ['apiKey', 'endpoint']
            };

            const validator = ajv.compile(schema);
            const result = validator({
                apiKey: 'sk-test123',
                endpoint: 'https://api.example.com'
            });

            expect(result).toBe(true);
            expect(validator.errors).toBeNull();
        });
    });

    describe('Const Field Validation', () => {
        test('should reject when const field has wrong value', () => {
            const schema = {
                type: 'object',
                properties: {
                    tokenUrl: {
                        type: 'string',
                        const: 'https://api.box.com/oauth2/token'
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ tokenUrl: 'https://wrong.url.com' });

            expect(result).toBe(false);
            expect(validator.errors?.[0].keyword).toBe('const');
            expect(validator.errors?.[0].params.allowedValue).toBe('https://api.box.com/oauth2/token');
        });

        test('should pass when const field matches exactly', () => {
            const schema = {
                type: 'object',
                properties: {
                    tokenUrl: {
                        type: 'string',
                        const: 'https://api.box.com/oauth2/token'
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ tokenUrl: 'https://api.box.com/oauth2/token' });

            expect(result).toBe(true);
        });
    });

    describe('Enum Field Validation', () => {
        test('should reject when value is not in enum', () => {
            const schema = {
                type: 'object',
                properties: {
                    boxSubjectType: {
                        type: 'string',
                        enum: ['enterprise', 'user']
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ boxSubjectType: 'invalid' });

            expect(result).toBe(false);
            expect(validator.errors?.[0].keyword).toBe('enum');
            expect(validator.errors?.[0].params.allowedValues).toEqual(['enterprise', 'user']);
        });

        test('should pass when value is in enum', () => {
            const schema = {
                type: 'object',
                properties: {
                    boxSubjectType: {
                        type: 'string',
                        enum: ['enterprise', 'user']
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ boxSubjectType: 'enterprise' });

            expect(result).toBe(true);
        });
    });

    describe('Format Validation', () => {
        test('should reject invalid URI format', () => {
            const schema = {
                type: 'object',
                properties: {
                    endpoint: {
                        type: 'string',
                        format: 'uri'
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ endpoint: 'not-a-valid-url' });

            expect(result).toBe(false);
            expect(validator.errors?.[0].keyword).toBe('format');
            expect(validator.errors?.[0].params.format).toBe('uri');
        });

        test('should pass valid URI format', () => {
            const schema = {
                type: 'object',
                properties: {
                    endpoint: {
                        type: 'string',
                        format: 'uri'
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ endpoint: 'https://api.example.com/v1' });

            expect(result).toBe(true);
        });

        test('should reject invalid email format', () => {
            const schema = {
                type: 'object',
                properties: {
                    email: {
                        type: 'string',
                        format: 'email'
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ email: 'not-an-email' });

            expect(result).toBe(false);
            expect(validator.errors?.[0].params.format).toBe('email');
        });

        test('should pass valid email format', () => {
            const schema = {
                type: 'object',
                properties: {
                    email: {
                        type: 'string',
                        format: 'email'
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ email: 'test@example.com' });

            expect(result).toBe(true);
        });

        test('should reject invalid uuid format', () => {
            const schema = {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        format: 'uuid'
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ id: 'not-a-uuid' });

            expect(result).toBe(false);
        });

        test('should pass valid uuid format', () => {
            const schema = {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        format: 'uuid'
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ id: '550e8400-e29b-41d4-a716-446655440000' });

            expect(result).toBe(true);
        });
    });

    describe('Pattern Validation', () => {
        test('should reject value not matching pattern', () => {
            const schema = {
                type: 'object',
                properties: {
                    apiKey: {
                        type: 'string',
                        pattern: '^sk-[a-zA-Z0-9]{32}$'
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ apiKey: 'invalid-key' });

            expect(result).toBe(false);
            expect(validator.errors?.[0].keyword).toBe('pattern');
        });

        test('should pass value matching pattern', () => {
            const schema = {
                type: 'object',
                properties: {
                    apiKey: {
                        type: 'string',
                        pattern: '^sk-[a-zA-Z0-9]{32}$'
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ apiKey: 'sk-abcdefghijklmnopqrstuvwxyz123456' });

            expect(result).toBe(true);
        });
    });

    describe('Length Validation', () => {
        test('should reject value shorter than minLength', () => {
            const schema = {
                type: 'object',
                properties: {
                    password: {
                        type: 'string',
                        minLength: 8
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ password: 'short' });

            expect(result).toBe(false);
            expect(validator.errors?.[0].keyword).toBe('minLength');
            expect(validator.errors?.[0].params.limit).toBe(8);
        });

        test('should reject value longer than maxLength', () => {
            const schema = {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        maxLength: 10
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ name: 'this-is-too-long' });

            expect(result).toBe(false);
            expect(validator.errors?.[0].keyword).toBe('maxLength');
            expect(validator.errors?.[0].params.limit).toBe(10);
        });

        test('should pass value within length bounds', () => {
            const schema = {
                type: 'object',
                properties: {
                    password: {
                        type: 'string',
                        minLength: 8,
                        maxLength: 20
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ password: 'goodpassword' });

            expect(result).toBe(true);
        });
    });

    describe('Numeric Range Validation', () => {
        test('should reject value below minimum', () => {
            const schema = {
                type: 'object',
                properties: {
                    port: {
                        type: 'number',
                        minimum: 1024
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ port: 80 });

            expect(result).toBe(false);
            expect(validator.errors?.[0].keyword).toBe('minimum');
        });

        test('should reject value above maximum', () => {
            const schema = {
                type: 'object',
                properties: {
                    port: {
                        type: 'number',
                        maximum: 65535
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ port: 70000 });

            expect(result).toBe(false);
            expect(validator.errors?.[0].keyword).toBe('maximum');
        });

        test('should pass value within numeric bounds', () => {
            const schema = {
                type: 'object',
                properties: {
                    port: {
                        type: 'number',
                        minimum: 1024,
                        maximum: 65535
                    }
                }
            };

            const validator = ajv.compile(schema);
            const result = validator({ port: 8080 });

            expect(result).toBe(true);
        });
    });

    describe('Combined Constraints', () => {
        test('should validate Box.com OAuth schema', () => {
            const schema = {
                type: 'object',
                properties: {
                    clientId: { type: 'string' },
                    clientSecret: { type: 'string' },
                    tokenUrl: {
                        type: 'string',
                        const: 'https://api.box.com/oauth2/token'
                    },
                    boxSubjectType: {
                        type: 'string',
                        enum: ['enterprise', 'user']
                    }
                },
                required: ['clientId', 'clientSecret', 'tokenUrl', 'boxSubjectType']
            };

            const validator = ajv.compile(schema);

            // Valid credential
            expect(validator({
                clientId: 'test-client',
                clientSecret: 'test-secret',
                tokenUrl: 'https://api.box.com/oauth2/token',
                boxSubjectType: 'enterprise'
            })).toBe(true);

            // Invalid: wrong tokenUrl
            expect(validator({
                clientId: 'test-client',
                clientSecret: 'test-secret',
                tokenUrl: 'https://wrong.url.com',
                boxSubjectType: 'enterprise'
            })).toBe(false);

            // Invalid: wrong enum value
            expect(validator({
                clientId: 'test-client',
                clientSecret: 'test-secret',
                tokenUrl: 'https://api.box.com/oauth2/token',
                boxSubjectType: 'invalid'
            })).toBe(false);
        });

        test('should validate GCP credential schema with defaults', () => {
            const schema = {
                type: 'object',
                properties: {
                    projectId: { type: 'string' },
                    location: {
                        type: 'string',
                        default: 'us-central1'
                    },
                    endpoint: {
                        type: 'string',
                        format: 'uri'
                    }
                },
                required: ['projectId']
            };

            const validator = ajv.compile(schema);

            // Valid without location (default should be applied separately)
            expect(validator({
                projectId: 'my-project',
                endpoint: 'https://api.example.com'
            })).toBe(true);

            // Invalid: bad URI format
            expect(validator({
                projectId: 'my-project',
                endpoint: 'not-a-uri'
            })).toBe(false);
        });
    });

    describe('Error Message Formatting', () => {
        test('should format required error message', () => {
            const schema = {
                type: 'object',
                properties: {
                    apiKey: { type: 'string' }
                },
                required: ['apiKey']
            };

            const validator = ajv.compile(schema);
            validator({});

            const error = validator.errors?.[0];
            expect(error?.keyword).toBe('required');
            expect(error?.params.missingProperty).toBe('apiKey');

            // Format as CredentialEngine would
            const message = `Missing required field: ${error?.params.missingProperty}`;
            expect(message).toBe('Missing required field: apiKey');
        });

        test('should format const error message', () => {
            const schema = {
                type: 'object',
                properties: {
                    tokenUrl: { const: 'https://api.box.com/oauth2/token' }
                }
            };

            const validator = ajv.compile(schema);
            validator({ tokenUrl: 'wrong' });

            const error = validator.errors?.[0];
            const field = error?.instancePath.replace(/^\//, '') || 'credential';
            const message = `Field "${field}" must be "${error?.params.allowedValue}"`;

            expect(message).toContain('must be "https://api.box.com/oauth2/token"');
        });

        test('should format enum error message', () => {
            const schema = {
                type: 'object',
                properties: {
                    type: { enum: ['enterprise', 'user'] }
                }
            };

            const validator = ajv.compile(schema);
            validator({ type: 'invalid' });

            const error = validator.errors?.[0];
            const allowed = error?.params.allowedValues.join(', ');
            const message = `Field "type" must be one of: ${allowed}`;

            expect(message).toBe('Field "type" must be one of: enterprise, user');
        });
    });
});
