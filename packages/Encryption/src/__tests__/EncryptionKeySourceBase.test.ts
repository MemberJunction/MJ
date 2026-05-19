import { describe, it, expect, vi } from 'vitest';
import { EncryptionKeySourceBase } from '../EncryptionKeySourceBase';
import { KeyValidationResult } from '../interfaces';

/**
 * Concrete test implementation of the abstract EncryptionKeySourceBase.
 */
class TestKeySource extends EncryptionKeySourceBase {
    /** Track whether GetKey was called during validation (for opacity tests) */
    public getKeyCalls: Array<{ lookupValue: string; keyVersion?: string }> = [];

    get SourceName(): string {
        return 'Test Source';
    }

    ValidateConfiguration(): boolean {
        return this._config.lookupValue !== undefined;
    }

    async GetKey(lookupValue: string, keyVersion?: string): Promise<Buffer> {
        this.getKeyCalls.push({ lookupValue, keyVersion });
        if (!lookupValue) {
            throw new Error('Lookup value required');
        }
        return Buffer.from('test-key-material');
    }

    async KeyExists(lookupValue: string): Promise<boolean> {
        return lookupValue === 'existing_key';
    }

    async ValidateKeyAccessibility(
        lookupValue: string,
        keyVersion?: string,
        expectedKeyLengthBytes?: number
    ): Promise<KeyValidationResult> {
        if (!lookupValue) {
            return { IsAccessible: false, Error: 'Lookup value required' };
        }
        if (lookupValue === 'missing_key') {
            return { IsAccessible: false, Error: 'Key not found in test source' };
        }
        if (expectedKeyLengthBytes !== undefined && expectedKeyLengthBytes !== 17) {
            // 'test-key-material' is 17 bytes
            return {
                IsAccessible: false,
                Error: `Key is 17 bytes but expected ${expectedKeyLengthBytes} bytes`
            };
        }
        return { IsAccessible: true };
    }
}

/**
 * A spy subclass that exposes key material to verify the base class pattern
 * does NOT allow callers to access key bytes through ValidateKeyAccessibility.
 */
class SpyKeySource extends EncryptionKeySourceBase {
    private _secretKey = Buffer.from('super-secret-key-do-not-leak');
    public validationCalled = false;

    get SourceName(): string { return 'Spy Source'; }
    ValidateConfiguration(): boolean { return true; }

    async GetKey(_lookupValue: string): Promise<Buffer> {
        return this._secretKey;
    }

    async KeyExists(_lookupValue: string): Promise<boolean> {
        return true;
    }

    async ValidateKeyAccessibility(
        _lookupValue: string,
        _keyVersion?: string,
        _expectedKeyLengthBytes?: number
    ): Promise<KeyValidationResult> {
        this.validationCalled = true;
        // Internally we access _secretKey, but the result ONLY has IsAccessible/Error
        // — no key bytes leak through the interface
        return { IsAccessible: true };
    }
}

describe('EncryptionKeySourceBase', () => {
    describe('constructor', () => {
        it('should initialize with provided config', () => {
            const config = { lookupValue: 'MY_KEY' };
            const source = new TestKeySource(config);
            expect(source.ValidateConfiguration()).toBe(true);
        });

        it('should initialize with empty config when none provided', () => {
            const source = new TestKeySource();
            // lookupValue will be undefined so ValidateConfiguration returns false
            expect(source.ValidateConfiguration()).toBe(false);
        });

        it('should initialize with undefined config', () => {
            const source = new TestKeySource(undefined);
            expect(source.ValidateConfiguration()).toBe(false);
        });

        it('should accept additionalConfig in config', () => {
            const config = {
                lookupValue: 'key',
                additionalConfig: { vaultUrl: 'https://vault.example.com' }
            };
            const source = new TestKeySource(config);
            expect(source.ValidateConfiguration()).toBe(true);
        });
    });

    describe('SourceName', () => {
        it('should return the source name from the concrete class', () => {
            const source = new TestKeySource();
            expect(source.SourceName).toBe('Test Source');
        });
    });

    describe('Initialize', () => {
        it('should resolve without error (default no-op implementation)', async () => {
            const source = new TestKeySource();
            await expect(source.Initialize()).resolves.toBeUndefined();
        });
    });

    describe('Dispose', () => {
        it('should resolve without error (default no-op implementation)', async () => {
            const source = new TestKeySource();
            await expect(source.Dispose()).resolves.toBeUndefined();
        });
    });

    describe('GetKey', () => {
        it('should return key material for valid lookup', async () => {
            const source = new TestKeySource();
            const key = await source.GetKey('my_key');
            expect(key).toBeInstanceOf(Buffer);
            expect(key.length).toBeGreaterThan(0);
        });

        it('should throw for empty lookup value', async () => {
            const source = new TestKeySource();
            await expect(source.GetKey('')).rejects.toThrow('Lookup value required');
        });
    });

    describe('KeyExists', () => {
        it('should return true for an existing key', async () => {
            const source = new TestKeySource();
            expect(await source.KeyExists('existing_key')).toBe(true);
        });

        it('should return false for a non-existing key', async () => {
            const source = new TestKeySource();
            expect(await source.KeyExists('nonexistent')).toBe(false);
        });
    });

    describe('ValidateKeyAccessibility', () => {
        it('should return IsAccessible true for a valid key', async () => {
            const source = new TestKeySource();
            const result = await source.ValidateKeyAccessibility('existing_key');
            expect(result.IsAccessible).toBe(true);
            expect(result.Error).toBeUndefined();
        });

        it('should return IsAccessible false with error for empty lookup', async () => {
            const source = new TestKeySource();
            const result = await source.ValidateKeyAccessibility('');
            expect(result.IsAccessible).toBe(false);
            expect(result.Error).toBeDefined();
            expect(result.Error).toContain('Lookup value required');
        });

        it('should return IsAccessible false for missing key', async () => {
            const source = new TestKeySource();
            const result = await source.ValidateKeyAccessibility('missing_key');
            expect(result.IsAccessible).toBe(false);
            expect(result.Error).toContain('not found');
        });

        it('should validate key length when expectedKeyLengthBytes is provided', async () => {
            const source = new TestKeySource();
            // 'test-key-material' is 17 bytes, so 32 should fail
            const result = await source.ValidateKeyAccessibility('existing_key', undefined, 32);
            expect(result.IsAccessible).toBe(false);
            expect(result.Error).toContain('17 bytes');
            expect(result.Error).toContain('32 bytes');
        });

        it('should pass when expectedKeyLengthBytes matches', async () => {
            const source = new TestKeySource();
            const result = await source.ValidateKeyAccessibility('existing_key', undefined, 17);
            expect(result.IsAccessible).toBe(true);
        });

        it('should accept optional keyVersion parameter', async () => {
            const source = new TestKeySource();
            const result = await source.ValidateKeyAccessibility('existing_key', '2', 17);
            expect(result.IsAccessible).toBe(true);
        });
    });

    describe('Key Material Opacity', () => {
        it('should never return key material through ValidateKeyAccessibility', async () => {
            const source = new SpyKeySource();
            const result = await source.ValidateKeyAccessibility('my_key', '1', 28);

            // The result interface only has IsAccessible and Error — no key bytes
            expect(result.IsAccessible).toBe(true);
            expect(Object.keys(result)).not.toContain('keyMaterial');
            expect(Object.keys(result)).not.toContain('key');
            expect(Object.keys(result)).not.toContain('value');
            expect(Object.keys(result)).not.toContain('bytes');
            expect(Object.keys(result)).not.toContain('buffer');
            expect(Object.keys(result)).not.toContain('data');

            // Only expected properties exist
            const keys = Object.keys(result);
            expect(keys.every(k => k === 'IsAccessible' || k === 'Error')).toBe(true);
        });

        it('should not expose key material even on validation failure', async () => {
            const source = new TestKeySource();
            const result = await source.ValidateKeyAccessibility('missing_key');

            expect(result.IsAccessible).toBe(false);
            // Error message should contain remediation info, NOT key bytes
            expect(result.Error).not.toContain('test-key-material');
            const keys = Object.keys(result);
            expect(keys.every(k => k === 'IsAccessible' || k === 'Error')).toBe(true);
        });

        it('ValidateKeyAccessibility should not call GetKey on the subclass', async () => {
            // The concrete TestKeySource has its own validation logic
            // that doesn't need to call GetKey — that's the correct pattern
            const source = new TestKeySource();
            source.getKeyCalls = [];
            await source.ValidateKeyAccessibility('existing_key', undefined, 17);
            // TestKeySource.ValidateKeyAccessibility doesn't call GetKey
            expect(source.getKeyCalls.length).toBe(0);
        });

        it('GetKey returns Buffer but ValidateKeyAccessibility returns only boolean+string', async () => {
            const source = new TestKeySource();
            // GetKey returns a Buffer (key material)
            const keyBuffer = await source.GetKey('existing_key');
            expect(keyBuffer).toBeInstanceOf(Buffer);
            expect(keyBuffer.length).toBeGreaterThan(0);

            // ValidateKeyAccessibility returns only IsAccessible/Error — no Buffer
            const validation = await source.ValidateKeyAccessibility('existing_key', undefined, 17);
            expect(validation).not.toBeInstanceOf(Buffer);
            expect(typeof validation.IsAccessible).toBe('boolean');
            expect(validation.Error === undefined || typeof validation.Error === 'string').toBe(true);
        });
    });
});
