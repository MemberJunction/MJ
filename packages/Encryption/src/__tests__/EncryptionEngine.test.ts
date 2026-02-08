import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';

// Mock all external MJ dependencies
vi.mock('@memberjunction/global', () => {
    const ENCRYPTION_MARKER = '$ENC$';
    const ENCRYPTED_SENTINEL = '[!ENCRYPTED$]';
    return {
        ENCRYPTION_MARKER,
        ENCRYPTED_SENTINEL,
        IsValueEncrypted: (value: string | null | undefined, marker?: string): boolean => {
            if (!value || typeof value !== 'string') return false;
            if (value === ENCRYPTED_SENTINEL) return true;
            return value.startsWith(marker || ENCRYPTION_MARKER);
        },
        RegisterClass: () => (target: Function) => target,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    CreateInstance: vi.fn()
                }
            }
        }
    };
});

vi.mock('@memberjunction/core', () => ({
    IMetadataProvider: {},
    LogError: vi.fn(),
    UserInfo: class {},
    BaseEngine: class {
        static getInstance<T>(): T {
            return (BaseEngine as Record<string, unknown>)._instance as T;
        }
        static _instance: unknown;
        _loaded = false;
        get Loaded() { return this._loaded; }
        async Load() { this._loaded = true; }
        async RefreshAllItems() {}
    },
    RegisterForStartup: () => (target: Function) => target
}));

vi.mock('@memberjunction/core-entities', () => {
    class FakeEncryptionEngineBase {
        static _singleton: FakeEncryptionEngineBase | null = null;
        _loaded = false;

        static getInstance<T>(): T {
            if (!FakeEncryptionEngineBase._singleton) {
                FakeEncryptionEngineBase._singleton = new FakeEncryptionEngineBase();
            }
            return FakeEncryptionEngineBase._singleton as T;
        }

        get Loaded() { return this._loaded; }

        async Config() {
            this._loaded = true;
        }

        async Load() {
            this._loaded = true;
        }

        async RefreshAllItems() {}

        // Mock GetKeyConfiguration to return a valid configuration
        GetKeyConfiguration(keyId: string): {
            key: Record<string, unknown>;
            algorithm: Record<string, unknown>;
            source: Record<string, unknown>;
        } | undefined {
            return undefined; // Default - tests will override
        }
    }

    return {
        EncryptionEngineBase: FakeEncryptionEngineBase
    };
});

import { EncryptionEngine } from '../EncryptionEngine';
import { MJGlobal } from '@memberjunction/global';

describe('EncryptionEngine', () => {
    let engine: EncryptionEngine;

    beforeEach(() => {
        engine = EncryptionEngine.Instance;
        engine.ClearCaches();
    });

    describe('Instance', () => {
        it('should return a singleton instance', () => {
            const instance1 = EncryptionEngine.Instance;
            const instance2 = EncryptionEngine.Instance;
            expect(instance1).toBe(instance2);
        });

        it('should be an instance of EncryptionEngine', () => {
            expect(EncryptionEngine.Instance).toBeInstanceOf(EncryptionEngine);
        });
    });

    describe('IsEncrypted', () => {
        it('should return true for value starting with $ENC$', () => {
            expect(engine.IsEncrypted('$ENC$key-id$AES-256-GCM$iv$ciphertext$tag')).toBe(true);
        });

        it('should return false for plain text', () => {
            expect(engine.IsEncrypted('hello world')).toBe(false);
        });

        it('should return false for null', () => {
            expect(engine.IsEncrypted(null)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(engine.IsEncrypted(undefined)).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(engine.IsEncrypted('')).toBe(false);
        });

        it('should return false for number', () => {
            expect(engine.IsEncrypted(42)).toBe(false);
        });

        it('should return true for encrypted sentinel', () => {
            expect(engine.IsEncrypted('[!ENCRYPTED$]')).toBe(true);
        });

        it('should check custom marker when provided', () => {
            expect(engine.IsEncrypted('$CUSTOM$data', '$CUSTOM$')).toBe(true);
            expect(engine.IsEncrypted('$ENC$data', '$CUSTOM$')).toBe(false);
        });
    });

    describe('ParseEncryptedValue', () => {
        it('should parse a valid encrypted value with auth tag (GCM)', () => {
            const value = '$ENC$550e8400-e29b-41d4-a716-446655440000$AES-256-GCM$aXZkYXRh$Y2lwaGVydGV4dA==$YXV0aHRhZw==';
            const parts = engine.ParseEncryptedValue(value);

            expect(parts.marker).toBe('$ENC$');
            expect(parts.keyId).toBe('550e8400-e29b-41d4-a716-446655440000');
            expect(parts.algorithm).toBe('AES-256-GCM');
            expect(parts.iv).toBe('aXZkYXRh');
            expect(parts.ciphertext).toBe('Y2lwaGVydGV4dA==');
            expect(parts.authTag).toBe('YXV0aHRhZw==');
        });

        it('should parse a valid encrypted value without auth tag (CBC)', () => {
            const value = '$ENC$550e8400-e29b-41d4-a716-446655440000$AES-256-CBC$aXZkYXRh$Y2lwaGVydGV4dA==';
            const parts = engine.ParseEncryptedValue(value);

            expect(parts.marker).toBe('$ENC$');
            expect(parts.keyId).toBe('550e8400-e29b-41d4-a716-446655440000');
            expect(parts.algorithm).toBe('AES-256-CBC');
            expect(parts.iv).toBe('aXZkYXRh');
            expect(parts.ciphertext).toBe('Y2lwaGVydGV4dA==');
            expect(parts.authTag).toBeUndefined();
        });

        it('should throw for null input', () => {
            expect(() => engine.ParseEncryptedValue(null as unknown as string)).toThrow(
                'Cannot parse encrypted value'
            );
        });

        it('should throw for empty string', () => {
            expect(() => engine.ParseEncryptedValue('')).toThrow(
                'Cannot parse encrypted value'
            );
        });

        it('should throw for non-string input', () => {
            expect(() => engine.ParseEncryptedValue(123 as unknown as string)).toThrow(
                'Cannot parse encrypted value'
            );
        });

        it('should throw for too few parts', () => {
            expect(() => engine.ParseEncryptedValue('$ENC$key$alg')).toThrow(
                'Invalid encrypted value format'
            );
        });

        it('should throw for invalid marker', () => {
            expect(() => engine.ParseEncryptedValue(
                '$BAD$550e8400-e29b-41d4-a716-446655440000$AES-256-GCM$iv$ct'
            )).toThrow('Invalid encryption marker');
        });

        it('should throw for invalid key ID (not a UUID)', () => {
            expect(() => engine.ParseEncryptedValue(
                '$ENC$not-a-uuid$AES-256-GCM$iv$ct'
            )).toThrow('Invalid key ID');
        });

        it('should throw for completely random string', () => {
            expect(() => engine.ParseEncryptedValue('random-text')).toThrow();
        });
    });

    describe('Encrypt', () => {
        it('should return null as-is', async () => {
            const result = await engine.Encrypt(null as unknown as string, 'any-key-id');
            expect(result).toBeNull();
        });

        it('should return undefined as-is', async () => {
            const result = await engine.Encrypt(undefined as unknown as string, 'any-key-id');
            expect(result).toBeUndefined();
        });

        it('should throw for invalid key ID (empty)', async () => {
            await expect(engine.Encrypt('plaintext', '')).rejects.toThrow(
                'Invalid encryption key ID'
            );
        });

        it('should throw for invalid key ID (not a UUID)', async () => {
            await expect(engine.Encrypt('plaintext', 'not-a-uuid')).rejects.toThrow(
                'Invalid encryption key ID'
            );
        });

        it('should throw for null key ID', async () => {
            await expect(engine.Encrypt('plaintext', null as unknown as string)).rejects.toThrow(
                'Invalid encryption key ID'
            );
        });
    });

    describe('Decrypt', () => {
        it('should return non-encrypted value as-is', async () => {
            const result = await engine.Decrypt('plain text');
            expect(result).toBe('plain text');
        });

        it('should return empty string as-is', async () => {
            const result = await engine.Decrypt('');
            expect(result).toBe('');
        });
    });

    describe('ClearCaches', () => {
        it('should not throw', () => {
            expect(() => engine.ClearCaches()).not.toThrow();
        });

        it('should be callable multiple times', () => {
            engine.ClearCaches();
            engine.ClearCaches();
            // No error means success
        });
    });

    describe('EncryptWithLookup', () => {
        it('should return null as-is', async () => {
            const result = await engine.EncryptWithLookup(
                null as unknown as string,
                'key-id',
                'lookup'
            );
            expect(result).toBeNull();
        });

        it('should return undefined as-is', async () => {
            const result = await engine.EncryptWithLookup(
                undefined as unknown as string,
                'key-id',
                'lookup'
            );
            expect(result).toBeUndefined();
        });
    });

    describe('ValidateKeyMaterial', () => {
        it('should throw for empty lookup value', async () => {
            await expect(engine.ValidateKeyMaterial('', 'key-id')).rejects.toThrow(
                'Invalid lookup value'
            );
        });

        it('should throw for null lookup value', async () => {
            await expect(engine.ValidateKeyMaterial(
                null as unknown as string,
                'key-id'
            )).rejects.toThrow('Invalid lookup value');
        });

        it('should throw for non-string lookup value', async () => {
            await expect(engine.ValidateKeyMaterial(
                123 as unknown as string,
                'key-id'
            )).rejects.toThrow('Invalid lookup value');
        });
    });
});

describe('EncryptionEngine - end-to-end encrypt/decrypt', () => {
    /**
     * This test suite exercises the actual crypto operations (performEncryption/performDecryption)
     * by setting up the engine with a mock key source and key configuration.
     */
    it('should successfully encrypt and decrypt with AES-256-GCM', async () => {
        const keyMaterial = crypto.randomBytes(32);
        const keyId = '550e8400-e29b-41d4-a716-446655440000';

        const engine = EncryptionEngine.Instance;

        // Mock the internal methods via prototype
        const buildKeyConfigSpy = vi.spyOn(engine as Record<string, Function>, 'buildKeyConfiguration' as string).mockReturnValue({
            keyId,
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
                lookupValue: 'TEST_KEY'
            }
        });

        const getKeyMaterialSpy = vi.spyOn(engine as Record<string, Function>, 'getKeyMaterial' as string).mockResolvedValue(keyMaterial);

        const ensureConfiguredSpy = vi.spyOn(engine as Record<string, Function>, 'ensureConfigured' as string).mockResolvedValue(undefined);

        // Encrypt
        const plaintext = 'Hello, MemberJunction!';
        const encrypted = await engine.Encrypt(plaintext, keyId);

        // Verify encrypted format
        expect(encrypted).toMatch(/^\$ENC\$/);
        expect(encrypted).toContain(keyId);
        expect(encrypted).toContain('AES-256-GCM');

        // Decrypt
        const decrypted = await engine.Decrypt(encrypted);
        expect(decrypted).toBe(plaintext);

        // Cleanup
        buildKeyConfigSpy.mockRestore();
        getKeyMaterialSpy.mockRestore();
        ensureConfiguredSpy.mockRestore();
    });

    it('should successfully encrypt and decrypt with AES-256-CBC', async () => {
        const keyMaterial = crypto.randomBytes(32);
        const keyId = '660e8400-e29b-41d4-a716-446655440000';

        const engine = EncryptionEngine.Instance;

        vi.spyOn(engine as Record<string, Function>, 'buildKeyConfiguration' as string).mockReturnValue({
            keyId,
            keyVersion: '1',
            marker: '$ENC$',
            algorithm: {
                name: 'AES-256-CBC',
                nodeCryptoName: 'aes-256-cbc',
                keyLengthBits: 256,
                ivLengthBytes: 16,
                isAEAD: false
            },
            source: {
                driverClass: 'EnvVarKeySource',
                lookupValue: 'TEST_KEY'
            }
        });

        vi.spyOn(engine as Record<string, Function>, 'getKeyMaterial' as string).mockResolvedValue(keyMaterial);
        vi.spyOn(engine as Record<string, Function>, 'ensureConfigured' as string).mockResolvedValue(undefined);

        const plaintext = 'Sensitive data for CBC test';
        const encrypted = await engine.Encrypt(plaintext, keyId);

        expect(encrypted).toMatch(/^\$ENC\$/);
        expect(encrypted).toContain('AES-256-CBC');

        const decrypted = await engine.Decrypt(encrypted);
        expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', async () => {
        const keyMaterial = crypto.randomBytes(32);
        const keyId = '550e8400-e29b-41d4-a716-446655440000';

        const engine = EncryptionEngine.Instance;

        vi.spyOn(engine as Record<string, Function>, 'buildKeyConfiguration' as string).mockReturnValue({
            keyId,
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
                lookupValue: 'TEST_KEY'
            }
        });

        vi.spyOn(engine as Record<string, Function>, 'getKeyMaterial' as string).mockResolvedValue(keyMaterial);
        vi.spyOn(engine as Record<string, Function>, 'ensureConfigured' as string).mockResolvedValue(undefined);

        const plaintext = 'Same data encrypted twice';
        const encrypted1 = await engine.Encrypt(plaintext, keyId);
        const encrypted2 = await engine.Encrypt(plaintext, keyId);

        // Should be different due to random IV
        expect(encrypted1).not.toBe(encrypted2);

        // But both should decrypt to the same value
        const decrypted1 = await engine.Decrypt(encrypted1);
        const decrypted2 = await engine.Decrypt(encrypted2);
        expect(decrypted1).toBe(plaintext);
        expect(decrypted2).toBe(plaintext);
    });

    it('should fail to decrypt with wrong key', async () => {
        const keyMaterial = crypto.randomBytes(32);
        const wrongKeyMaterial = crypto.randomBytes(32);
        const keyId = '550e8400-e29b-41d4-a716-446655440000';

        const engine = EncryptionEngine.Instance;

        vi.spyOn(engine as Record<string, Function>, 'buildKeyConfiguration' as string).mockReturnValue({
            keyId,
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
                lookupValue: 'TEST_KEY'
            }
        });

        const getKeyMock = vi.spyOn(engine as Record<string, Function>, 'getKeyMaterial' as string);
        vi.spyOn(engine as Record<string, Function>, 'ensureConfigured' as string).mockResolvedValue(undefined);

        // Encrypt with correct key
        getKeyMock.mockResolvedValue(keyMaterial);
        const encrypted = await engine.Encrypt('secret data', keyId);

        // Try to decrypt with wrong key
        getKeyMock.mockResolvedValue(wrongKeyMaterial);
        await expect(engine.Decrypt(encrypted)).rejects.toThrow('Decryption failed');
    });

    it('should handle empty string plaintext', async () => {
        const keyMaterial = crypto.randomBytes(32);
        const keyId = '550e8400-e29b-41d4-a716-446655440000';

        const engine = EncryptionEngine.Instance;

        vi.spyOn(engine as Record<string, Function>, 'buildKeyConfiguration' as string).mockReturnValue({
            keyId,
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
                lookupValue: 'TEST_KEY'
            }
        });

        vi.spyOn(engine as Record<string, Function>, 'getKeyMaterial' as string).mockResolvedValue(keyMaterial);
        vi.spyOn(engine as Record<string, Function>, 'ensureConfigured' as string).mockResolvedValue(undefined);

        const encrypted = await engine.Encrypt('', keyId);
        expect(encrypted).toMatch(/^\$ENC\$/);

        const decrypted = await engine.Decrypt(encrypted);
        expect(decrypted).toBe('');
    });

    it('should handle Buffer input for plaintext', async () => {
        const keyMaterial = crypto.randomBytes(32);
        const keyId = '550e8400-e29b-41d4-a716-446655440000';

        const engine = EncryptionEngine.Instance;

        vi.spyOn(engine as Record<string, Function>, 'buildKeyConfiguration' as string).mockReturnValue({
            keyId,
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
                lookupValue: 'TEST_KEY'
            }
        });

        vi.spyOn(engine as Record<string, Function>, 'getKeyMaterial' as string).mockResolvedValue(keyMaterial);
        vi.spyOn(engine as Record<string, Function>, 'ensureConfigured' as string).mockResolvedValue(undefined);

        const plaintext = Buffer.from('Buffer input test', 'utf8');
        const encrypted = await engine.Encrypt(plaintext, keyId);
        expect(encrypted).toMatch(/^\$ENC\$/);

        const decrypted = await engine.Decrypt(encrypted);
        expect(decrypted).toBe('Buffer input test');
    });

    it('should handle unicode plaintext', async () => {
        const keyMaterial = crypto.randomBytes(32);
        const keyId = '550e8400-e29b-41d4-a716-446655440000';

        const engine = EncryptionEngine.Instance;

        vi.spyOn(engine as Record<string, Function>, 'buildKeyConfiguration' as string).mockReturnValue({
            keyId,
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
                lookupValue: 'TEST_KEY'
            }
        });

        vi.spyOn(engine as Record<string, Function>, 'getKeyMaterial' as string).mockResolvedValue(keyMaterial);
        vi.spyOn(engine as Record<string, Function>, 'ensureConfigured' as string).mockResolvedValue(undefined);

        const plaintext = 'Hello World! Special chars: @#$%^& and accents: cafe\u0301';
        const encrypted = await engine.Encrypt(plaintext, keyId);
        const decrypted = await engine.Decrypt(encrypted);
        expect(decrypted).toBe(plaintext);
    });
});
