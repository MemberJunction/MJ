import { describe, it, expect } from 'vitest';
import type {
    EncryptionKeySourceConfig,
    EncryptedValueParts,
    KeyConfiguration,
    RotateKeyResult,
    RotateKeyParams,
    EnableFieldEncryptionResult,
    EnableFieldEncryptionParams
} from '../interfaces';

/**
 * These tests verify the shape of exported interfaces by creating conforming objects.
 * Since interfaces are erased at runtime, we validate them through structural conformance.
 */
describe('Encryption Interfaces', () => {
    describe('EncryptionKeySourceConfig', () => {
        it('should allow creating a minimal config', () => {
            const config: EncryptionKeySourceConfig = {};
            expect(config).toBeDefined();
        });

        it('should allow creating a config with lookupValue', () => {
            const config: EncryptionKeySourceConfig = {
                lookupValue: 'MJ_ENCRYPTION_KEY_PII'
            };
            expect(config.lookupValue).toBe('MJ_ENCRYPTION_KEY_PII');
        });

        it('should allow creating a config with additionalConfig', () => {
            const config: EncryptionKeySourceConfig = {
                lookupValue: 'key',
                additionalConfig: { vaultUrl: 'https://vault.example.com', timeout: 5000 }
            };
            expect(config.additionalConfig).toBeDefined();
            expect(config.additionalConfig!.vaultUrl).toBe('https://vault.example.com');
        });
    });

    describe('EncryptedValueParts', () => {
        it('should represent a GCM encrypted value with all parts', () => {
            const parts: EncryptedValueParts = {
                marker: '$ENC$',
                keyId: '550e8400-e29b-41d4-a716-446655440000',
                algorithm: 'AES-256-GCM',
                iv: 'base64iv',
                ciphertext: 'base64ciphertext',
                authTag: 'base64authtag'
            };
            expect(parts.marker).toBe('$ENC$');
            expect(parts.authTag).toBeDefined();
        });

        it('should represent a CBC encrypted value without authTag', () => {
            const parts: EncryptedValueParts = {
                marker: '$ENC$',
                keyId: '550e8400-e29b-41d4-a716-446655440000',
                algorithm: 'AES-256-CBC',
                iv: 'base64iv',
                ciphertext: 'base64ciphertext'
            };
            expect(parts.authTag).toBeUndefined();
        });
    });

    describe('KeyConfiguration', () => {
        it('should represent a complete key config', () => {
            const config: KeyConfiguration = {
                keyId: '550e8400-e29b-41d4-a716-446655440000',
                keyVersion: '1',
                marker: '$ENC$',
                algorithm: {
                    name: 'AES-256-GCM',
                    nodeCryptoName: 'aes-256-gcm',
                    keyLengthBits: 256,
                    ivLengthBytes: 12,
                    isAEAD: true
                },
                source: {
                    driverClass: 'EnvVarKeySource',
                    lookupValue: 'MJ_ENCRYPTION_KEY'
                }
            };
            expect(config.algorithm.keyLengthBits).toBe(256);
            expect(config.algorithm.isAEAD).toBe(true);
            expect(config.source.driverClass).toBe('EnvVarKeySource');
        });
    });

    describe('RotateKeyResult', () => {
        it('should represent a successful rotation', () => {
            const result: RotateKeyResult = {
                success: true,
                recordsProcessed: 150,
                fieldsProcessed: ['Users.SSN', 'Contacts.Email']
            };
            expect(result.success).toBe(true);
            expect(result.fieldsProcessed).toHaveLength(2);
            expect(result.error).toBeUndefined();
        });

        it('should represent a failed rotation', () => {
            const result: RotateKeyResult = {
                success: false,
                recordsProcessed: 50,
                fieldsProcessed: ['Users.SSN'],
                error: 'Key material not found'
            };
            expect(result.success).toBe(false);
            expect(result.error).toBe('Key material not found');
        });
    });

    describe('RotateKeyParams', () => {
        it('should represent rotation params with defaults', () => {
            const params: RotateKeyParams = {
                encryptionKeyId: '550e8400-e29b-41d4-a716-446655440000',
                newKeyLookupValue: 'MJ_ENCRYPTION_KEY_V2'
            };
            expect(params.batchSize).toBeUndefined();
        });

        it('should represent rotation params with custom batch size', () => {
            const params: RotateKeyParams = {
                encryptionKeyId: '550e8400-e29b-41d4-a716-446655440000',
                newKeyLookupValue: 'MJ_ENCRYPTION_KEY_V2',
                batchSize: 500
            };
            expect(params.batchSize).toBe(500);
        });
    });

    describe('EnableFieldEncryptionResult', () => {
        it('should represent a successful encryption result', () => {
            const result: EnableFieldEncryptionResult = {
                success: true,
                recordsEncrypted: 100,
                recordsSkipped: 5
            };
            expect(result.success).toBe(true);
            expect(result.recordsEncrypted).toBe(100);
        });

        it('should represent a failed encryption result', () => {
            const result: EnableFieldEncryptionResult = {
                success: false,
                recordsEncrypted: 0,
                recordsSkipped: 0,
                error: 'Key not found'
            };
            expect(result.success).toBe(false);
            expect(result.error).toBe('Key not found');
        });
    });

    describe('EnableFieldEncryptionParams', () => {
        it('should represent params with required fields', () => {
            const params: EnableFieldEncryptionParams = {
                entityFieldId: '550e8400-e29b-41d4-a716-446655440000'
            };
            expect(params.entityFieldId).toBeDefined();
            expect(params.batchSize).toBeUndefined();
        });

        it('should represent params with optional batch size', () => {
            const params: EnableFieldEncryptionParams = {
                entityFieldId: '550e8400-e29b-41d4-a716-446655440000',
                batchSize: 200
            };
            expect(params.batchSize).toBe(200);
        });
    });
});
