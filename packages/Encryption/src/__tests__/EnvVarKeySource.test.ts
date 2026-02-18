import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @memberjunction/global before importing the module
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target
}));

import { EnvVarKeySource } from '../providers/EnvVarKeySource';

describe('EnvVarKeySource', () => {
    let source: EnvVarKeySource;
    const originalEnv = process.env;

    beforeEach(() => {
        source = new EnvVarKeySource();
        // Create a copy of the environment
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('SourceName', () => {
        it('should return "Environment Variable"', () => {
            expect(source.SourceName).toBe('Environment Variable');
        });
    });

    describe('ValidateConfiguration', () => {
        it('should always return true', () => {
            expect(source.ValidateConfiguration()).toBe(true);
        });

        it('should return true regardless of config provided', () => {
            const sourceWithConfig = new EnvVarKeySource({ lookupValue: 'test' });
            expect(sourceWithConfig.ValidateConfiguration()).toBe(true);
        });
    });

    describe('KeyExists', () => {
        it('should return true when environment variable exists', async () => {
            process.env.MJ_TEST_KEY = 'some-value';
            expect(await source.KeyExists('MJ_TEST_KEY')).toBe(true);
        });

        it('should return false when environment variable does not exist', async () => {
            delete process.env.NONEXISTENT_VAR;
            expect(await source.KeyExists('NONEXISTENT_VAR')).toBe(false);
        });

        it('should return false for empty string lookup', async () => {
            expect(await source.KeyExists('')).toBe(false);
        });

        it('should return false for null lookup', async () => {
            expect(await source.KeyExists(null as unknown as string)).toBe(false);
        });

        it('should return false for undefined lookup', async () => {
            expect(await source.KeyExists(undefined as unknown as string)).toBe(false);
        });

        it('should return false for invalid env var name with hyphens', async () => {
            expect(await source.KeyExists('invalid-name')).toBe(false);
        });

        it('should return false for env var name starting with a number', async () => {
            expect(await source.KeyExists('1INVALID')).toBe(false);
        });

        it('should return false for names exceeding max length', async () => {
            const longName = 'A'.repeat(257);
            expect(await source.KeyExists(longName)).toBe(false);
        });

        it('should accept names starting with underscore', async () => {
            process.env._UNDERSCORE_KEY = 'val';
            expect(await source.KeyExists('_UNDERSCORE_KEY')).toBe(true);
        });
    });

    describe('GetKey', () => {
        it('should return decoded buffer for valid base64 env var', async () => {
            // Generate a proper 32-byte key
            const keyBytes = Buffer.alloc(32, 0xAB);
            const base64Key = keyBytes.toString('base64');
            process.env.MJ_ENCRYPTION_KEY = base64Key;

            const result = await source.GetKey('MJ_ENCRYPTION_KEY');
            expect(result).toBeInstanceOf(Buffer);
            expect(result.length).toBe(32);
            expect(result).toEqual(keyBytes);
        });

        it('should throw for missing environment variable', async () => {
            delete process.env.MISSING_KEY;
            await expect(source.GetKey('MISSING_KEY')).rejects.toThrow(
                'Encryption key not found in environment variable'
            );
        });

        it('should throw for empty env var value', async () => {
            process.env.EMPTY_KEY = '';
            await expect(source.GetKey('EMPTY_KEY')).rejects.toThrow(
                'is empty'
            );
        });

        it('should throw for whitespace-only env var value', async () => {
            process.env.WHITESPACE_KEY = '   ';
            await expect(source.GetKey('WHITESPACE_KEY')).rejects.toThrow(
                'is empty'
            );
        });

        it('should throw for null lookup value', async () => {
            await expect(source.GetKey(null as unknown as string)).rejects.toThrow(
                'Invalid lookup value'
            );
        });

        it('should throw for empty string lookup value', async () => {
            await expect(source.GetKey('')).rejects.toThrow(
                'Invalid lookup value'
            );
        });

        it('should throw for invalid env var name format', async () => {
            await expect(source.GetKey('invalid-name')).rejects.toThrow(
                'Invalid environment variable name'
            );
        });

        it('should throw for env var name starting with a number', async () => {
            await expect(source.GetKey('123ABC')).rejects.toThrow(
                'Invalid environment variable name'
            );
        });

        describe('versioned keys', () => {
            it('should use base name for version 1', async () => {
                const keyBytes = Buffer.alloc(32, 0xCD);
                process.env.MJ_KEY = keyBytes.toString('base64');

                const result = await source.GetKey('MJ_KEY', '1');
                expect(result).toEqual(keyBytes);
            });

            it('should use base name when no version provided', async () => {
                const keyBytes = Buffer.alloc(32, 0xEF);
                process.env.MJ_KEY = keyBytes.toString('base64');

                const result = await source.GetKey('MJ_KEY');
                expect(result).toEqual(keyBytes);
            });

            it('should append _V{version} for versions other than 1', async () => {
                const keyBytes = Buffer.alloc(32, 0x11);
                process.env.MJ_KEY_V2 = keyBytes.toString('base64');

                const result = await source.GetKey('MJ_KEY', '2');
                expect(result).toEqual(keyBytes);
            });

            it('should append _V3 for version 3', async () => {
                const keyBytes = Buffer.alloc(32, 0x22);
                process.env.MJ_KEY_V3 = keyBytes.toString('base64');

                const result = await source.GetKey('MJ_KEY', '3');
                expect(result).toEqual(keyBytes);
            });

            it('should throw when versioned env var does not exist', async () => {
                process.env.MJ_KEY = Buffer.alloc(32).toString('base64');
                delete process.env.MJ_KEY_V5;

                await expect(source.GetKey('MJ_KEY', '5')).rejects.toThrow(
                    'Encryption key not found in environment variable: "MJ_KEY_V5"'
                );
            });
        });

        describe('base64 validation', () => {
            it('should accept valid base64', async () => {
                const keyBytes = Buffer.alloc(16, 0xAA);
                process.env.VALID_B64 = keyBytes.toString('base64');
                const result = await source.GetKey('VALID_B64');
                expect(result.length).toBe(16);
            });

            it('should accept base64 with padding', async () => {
                // 3 bytes encodes to 4 base64 chars with padding
                const keyBytes = Buffer.from([0x01, 0x02, 0x03]);
                process.env.PADDED_KEY = keyBytes.toString('base64');
                const result = await source.GetKey('PADDED_KEY');
                expect(result).toEqual(keyBytes);
            });
        });
    });
});
