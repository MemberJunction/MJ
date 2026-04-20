/**
 * Unit tests for Credentials/Engine type definitions
 */

import { describe, it, expect } from 'vitest';
import type {
    CredentialResolutionOptions,
    ResolvedCredential,
    StoreCredentialOptions,
    CredentialValidationResult,
    CredentialAccessDetails,
    APIKeyCredentialValues,
    APIKeyWithEndpointCredentialValues,
    OAuth2ClientCredentialValues,
    BasicAuthCredentialValues,
    AzureServicePrincipalCredentialValues,
    AWSIAMCredentialValues,
    DatabaseConnectionCredentialValues,
    TwilioCredentialValues,
} from '../types';

describe('Credential Types', () => {
    describe('CredentialResolutionOptions', () => {
        it('should accept minimal options', () => {
            const options: CredentialResolutionOptions = {};
            expect(options.credentialId).toBeUndefined();
        });

        it('should accept full options', () => {
            const options: CredentialResolutionOptions = {
                credentialId: 'cred-1',
                credentialName: 'My Key',
                directValues: { apiKey: 'sk-123' },
                subsystem: 'AI',
            };
            expect(options.credentialId).toBe('cred-1');
            expect(options.credentialName).toBe('My Key');
            expect(options.directValues).toEqual({ apiKey: 'sk-123' });
            expect(options.subsystem).toBe('AI');
        });
    });

    describe('ResolvedCredential', () => {
        it('should accept a direct values resolution', () => {
            const resolved: ResolvedCredential = {
                credential: null,
                values: { apiKey: 'sk-test' },
                source: 'request',
            };
            expect(resolved.credential).toBeNull();
            expect(resolved.values.apiKey).toBe('sk-test');
            expect(resolved.source).toBe('request');
        });

        it('should accept a database source resolution', () => {
            const resolved: ResolvedCredential = {
                credential: null,
                values: { username: 'admin', password: 'secret' },
                source: 'database',
                expiresAt: new Date('2025-12-31'),
            };
            expect(resolved.source).toBe('database');
            expect(resolved.expiresAt).toBeInstanceOf(Date);
        });

        it('should accept typed credential values', () => {
            const resolved: ResolvedCredential<APIKeyCredentialValues> = {
                credential: null,
                values: { apiKey: 'sk-typed' },
                source: 'request',
            };
            expect(resolved.values.apiKey).toBe('sk-typed');
        });
    });

    describe('StoreCredentialOptions', () => {
        it('should accept empty options', () => {
            const options: StoreCredentialOptions = {};
            expect(options.isDefault).toBeUndefined();
        });

        it('should accept full options', () => {
            const options: StoreCredentialOptions = {
                isDefault: true,
                categoryId: 'cat-1',
                iconClass: 'fa-key',
                description: 'Test credential',
                expiresAt: new Date('2025-12-31'),
            };
            expect(options.isDefault).toBe(true);
            expect(options.categoryId).toBe('cat-1');
        });
    });

    describe('CredentialValidationResult', () => {
        it('should represent a valid result', () => {
            const result: CredentialValidationResult = {
                isValid: true,
                errors: [],
                warnings: [],
                validatedAt: new Date(),
            };
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should represent an invalid result with errors', () => {
            const result: CredentialValidationResult = {
                isValid: false,
                errors: ['Missing required field: apiKey'],
                warnings: ['Credential expires soon'],
                validatedAt: new Date(),
            };
            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.warnings).toHaveLength(1);
        });
    });

    describe('CredentialAccessDetails', () => {
        it('should represent a successful operation', () => {
            const details: CredentialAccessDetails = {
                operation: 'Decrypt',
                subsystem: 'AIEngine',
                success: true,
                durationMs: 42,
            };
            expect(details.operation).toBe('Decrypt');
            expect(details.success).toBe(true);
        });

        it('should represent a failed operation', () => {
            const details: CredentialAccessDetails = {
                operation: 'Validate',
                success: false,
                errorMessage: 'Schema mismatch',
            };
            expect(details.success).toBe(false);
            expect(details.errorMessage).toBe('Schema mismatch');
        });

        it('should accept all operation types', () => {
            const operations: CredentialAccessDetails['operation'][] = [
                'Decrypt', 'Create', 'Update', 'Delete', 'Validate'
            ];
            for (const op of operations) {
                const details: CredentialAccessDetails = { operation: op, success: true };
                expect(details.operation).toBe(op);
            }
        });
    });

    describe('Common Credential Value Interfaces', () => {
        it('should validate APIKeyCredentialValues', () => {
            const cred: APIKeyCredentialValues = { apiKey: 'sk-test' };
            expect(cred.apiKey).toBe('sk-test');
        });

        it('should validate APIKeyWithEndpointCredentialValues', () => {
            const cred: APIKeyWithEndpointCredentialValues = {
                apiKey: 'sk-test',
                endpoint: 'https://api.example.com',
            };
            expect(cred.apiKey).toBe('sk-test');
            expect(cred.endpoint).toBe('https://api.example.com');
        });

        it('should validate OAuth2ClientCredentialValues', () => {
            const cred: OAuth2ClientCredentialValues = {
                clientId: 'client-1',
                clientSecret: 'secret-1',
                tokenUrl: 'https://auth.example.com/token',
                scope: 'read write',
            };
            expect(cred.clientId).toBe('client-1');
        });

        it('should validate BasicAuthCredentialValues', () => {
            const cred: BasicAuthCredentialValues = {
                username: 'admin',
                password: 'secret',
            };
            expect(cred.username).toBe('admin');
        });

        it('should validate AzureServicePrincipalCredentialValues', () => {
            const cred: AzureServicePrincipalCredentialValues = {
                tenantId: 'tenant-1',
                clientId: 'client-1',
                clientSecret: 'secret-1',
            };
            expect(cred.tenantId).toBe('tenant-1');
        });

        it('should validate AWSIAMCredentialValues', () => {
            const cred: AWSIAMCredentialValues = {
                accessKeyId: 'AKIA123',
                secretAccessKey: 'secret',
                region: 'us-east-1',
            };
            expect(cred.region).toBe('us-east-1');
        });

        it('should validate DatabaseConnectionCredentialValues', () => {
            const cred: DatabaseConnectionCredentialValues = {
                host: 'localhost',
                database: 'mydb',
                username: 'root',
                password: 'password',
                port: 5432,
            };
            expect(cred.port).toBe(5432);
        });

        it('should validate TwilioCredentialValues', () => {
            const cred: TwilioCredentialValues = {
                accountSid: 'AC123',
                authToken: 'token123',
            };
            expect(cred.accountSid).toBe('AC123');
        });
    });
});
