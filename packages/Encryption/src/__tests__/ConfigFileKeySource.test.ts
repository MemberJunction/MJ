import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target
}));

vi.mock('cosmiconfig', () => ({
    cosmiconfigSync: vi.fn()
}));

import { ConfigFileKeySource } from '../providers/ConfigFileKeySource';
import { cosmiconfigSync } from 'cosmiconfig';

describe('ConfigFileKeySource', () => {
    let source: ConfigFileKeySource;

    beforeEach(() => {
        vi.clearAllMocks();
        source = new ConfigFileKeySource();
    });

    describe('SourceName', () => {
        it('should return "Configuration File"', () => {
            expect(source.SourceName).toBe('Configuration File');
        });
    });

    describe('ValidateConfiguration', () => {
        it('should return false before Initialize is called', () => {
            expect(source.ValidateConfiguration()).toBe(false);
        });

        it('should return true after successful Initialize with encryptionKeys', async () => {
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                search: () => ({
                    config: {
                        encryptionKeys: {
                            pii_master: 'K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols='
                        }
                    },
                    filepath: '/app/mj.config.cjs'
                })
            });

            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(true);
        });

        it('should return false when config file has no encryptionKeys', async () => {
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                search: () => ({
                    config: { someOtherKey: true },
                    filepath: '/app/mj.config.cjs'
                })
            });

            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(false);
        });

        it('should return false when no config file found', async () => {
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                search: () => null
            });

            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(false);
        });
    });

    describe('Initialize', () => {
        it('should load encryptionKeys from config file', async () => {
            const mockKeys = {
                pii_master: 'dGVzdC1rZXktbWF0ZXJpYWw=',
                financial_data: 'YW5vdGhlci1rZXk='
            };

            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                search: () => ({
                    config: { encryptionKeys: mockKeys },
                    filepath: '/app/mj.config.cjs'
                })
            });

            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(true);
        });

        it('should warn and not crash when cosmiconfig throws', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
                throw new Error('Module not found');
            });

            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to load configuration')
            );
        });

        it('should throw internally (logged as warn) when encryptionKeys has non-string values', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                search: () => ({
                    config: {
                        encryptionKeys: {
                            bad_key: 12345
                        }
                    },
                    filepath: '/app/mj.config.cjs'
                })
            });

            await source.Initialize();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to load configuration')
            );
        });

        it('should throw internally (logged as warn) when encryptionKeys is not an object', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                search: () => ({
                    config: {
                        encryptionKeys: 'not-an-object'
                    },
                    filepath: '/app/mj.config.cjs'
                })
            });

            await source.Initialize();
            // The source catches the error and warns
            expect(warnSpy).toHaveBeenCalled();
        });
    });

    describe('KeyExists', () => {
        beforeEach(async () => {
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                search: () => ({
                    config: {
                        encryptionKeys: {
                            pii_master: 'dGVzdC1rZXktbWF0ZXJpYWw=',
                            api_secrets: 'YW5vdGhlci1rZXk='
                        }
                    },
                    filepath: '/app/mj.config.cjs'
                })
            });
            await source.Initialize();
        });

        it('should return true for existing key', async () => {
            expect(await source.KeyExists('pii_master')).toBe(true);
        });

        it('should return false for non-existing key', async () => {
            expect(await source.KeyExists('nonexistent')).toBe(false);
        });

        it('should return false for empty string', async () => {
            expect(await source.KeyExists('')).toBe(false);
        });

        it('should return false for null', async () => {
            expect(await source.KeyExists(null as unknown as string)).toBe(false);
        });

        it('should return false for undefined', async () => {
            expect(await source.KeyExists(undefined as unknown as string)).toBe(false);
        });

        it('should return false for invalid key name starting with number', async () => {
            expect(await source.KeyExists('1badname')).toBe(false);
        });

        it('should return false when config is not loaded', async () => {
            const uninitializedSource = new ConfigFileKeySource();
            expect(await uninitializedSource.KeyExists('pii_master')).toBe(false);
        });

        it('should accept key names with hyphens', async () => {
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                search: () => ({
                    config: {
                        encryptionKeys: {
                            'my-key': 'dGVzdA=='
                        }
                    },
                    filepath: '/app/mj.config.cjs'
                })
            });
            const s = new ConfigFileKeySource();
            await s.Initialize();
            expect(await s.KeyExists('my-key')).toBe(true);
        });
    });

    describe('GetKey', () => {
        const validBase64Key = Buffer.alloc(32, 0xAB).toString('base64');

        beforeEach(async () => {
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                search: () => ({
                    config: {
                        encryptionKeys: {
                            pii_master: validBase64Key,
                            pii_master_v2: Buffer.alloc(32, 0xCD).toString('base64'),
                            empty_key: '',
                            whitespace_key: '   '
                        }
                    },
                    filepath: '/app/mj.config.cjs'
                })
            });
            await source.Initialize();
        });

        it('should return decoded key bytes for valid key', async () => {
            const key = await source.GetKey('pii_master');
            expect(key).toBeInstanceOf(Buffer);
            expect(key.length).toBe(32);
            expect(key).toEqual(Buffer.alloc(32, 0xAB));
        });

        it('should throw when config not loaded', async () => {
            const uninitSource = new ConfigFileKeySource();
            await expect(uninitSource.GetKey('pii_master')).rejects.toThrow(
                'Configuration file not loaded'
            );
        });

        it('should throw for empty lookup value', async () => {
            await expect(source.GetKey('')).rejects.toThrow(
                'Invalid lookup value'
            );
        });

        it('should throw for null lookup value', async () => {
            await expect(source.GetKey(null as unknown as string)).rejects.toThrow(
                'Invalid lookup value'
            );
        });

        it('should throw for invalid key name format', async () => {
            await expect(source.GetKey('1invalid')).rejects.toThrow(
                'Invalid key name'
            );
        });

        it('should throw for non-existing key name', async () => {
            await expect(source.GetKey('nonexistent_key')).rejects.toThrow(
                'not found in configuration file'
            );
        });

        it('should throw for empty key value', async () => {
            await expect(source.GetKey('empty_key')).rejects.toThrow(
                'is empty'
            );
        });

        it('should throw for whitespace-only key value', async () => {
            await expect(source.GetKey('whitespace_key')).rejects.toThrow(
                'is empty'
            );
        });

        describe('versioned keys', () => {
            it('should use base name for version 1', async () => {
                const key = await source.GetKey('pii_master', '1');
                expect(key).toEqual(Buffer.alloc(32, 0xAB));
            });

            it('should use base name when version is undefined', async () => {
                const key = await source.GetKey('pii_master');
                expect(key).toEqual(Buffer.alloc(32, 0xAB));
            });

            it('should append _v{version} for version 2', async () => {
                const key = await source.GetKey('pii_master', '2');
                expect(key).toEqual(Buffer.alloc(32, 0xCD));
            });

            it('should throw for nonexistent version', async () => {
                await expect(source.GetKey('pii_master', '99')).rejects.toThrow(
                    'not found in configuration file'
                );
            });
        });

        describe('key name validation', () => {
            it('should accept names starting with underscore', async () => {
                (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                    search: () => ({
                        config: {
                            encryptionKeys: {
                                _my_key: validBase64Key
                            }
                        },
                        filepath: '/app/mj.config.cjs'
                    })
                });
                const s = new ConfigFileKeySource();
                await s.Initialize();
                const key = await s.GetKey('_my_key');
                expect(key.length).toBe(32);
            });

            it('should reject names exceeding 256 characters', async () => {
                const longName = 'a'.repeat(257);
                await expect(source.GetKey(longName)).rejects.toThrow(
                    'Invalid key name'
                );
            });

            it('should accept names with hyphens', async () => {
                (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                    search: () => ({
                        config: {
                            encryptionKeys: {
                                'my-key-name': validBase64Key
                            }
                        },
                        filepath: '/app/mj.config.cjs'
                    })
                });
                const s = new ConfigFileKeySource();
                await s.Initialize();
                const key = await s.GetKey('my-key-name');
                expect(key.length).toBe(32);
            });
        });
    });

    describe('Dispose', () => {
        it('should clear loaded config', async () => {
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                search: () => ({
                    config: {
                        encryptionKeys: {
                            test: Buffer.alloc(32).toString('base64')
                        }
                    },
                    filepath: '/app/mj.config.cjs'
                })
            });
            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(true);

            await source.Dispose();
            expect(source.ValidateConfiguration()).toBe(false);
        });

        it('should make GetKey throw after Dispose', async () => {
            (cosmiconfigSync as ReturnType<typeof vi.fn>).mockReturnValue({
                search: () => ({
                    config: {
                        encryptionKeys: {
                            test: Buffer.alloc(32).toString('base64')
                        }
                    },
                    filepath: '/app/mj.config.cjs'
                })
            });
            await source.Initialize();
            await source.Dispose();

            await expect(source.GetKey('test')).rejects.toThrow(
                'Configuration file not loaded'
            );
        });
    });
});
