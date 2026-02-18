import { describe, it, expect, vi } from 'vitest';
import { EncryptionKeySourceBase } from '../EncryptionKeySourceBase';

/**
 * Concrete test implementation of the abstract EncryptionKeySourceBase.
 */
class TestKeySource extends EncryptionKeySourceBase {
    get SourceName(): string {
        return 'Test Source';
    }

    ValidateConfiguration(): boolean {
        return this._config.lookupValue !== undefined;
    }

    async GetKey(lookupValue: string, _keyVersion?: string): Promise<Buffer> {
        if (!lookupValue) {
            throw new Error('Lookup value required');
        }
        return Buffer.from('test-key-material');
    }

    async KeyExists(lookupValue: string): Promise<boolean> {
        return lookupValue === 'existing_key';
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
});
