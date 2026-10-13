/**
 * EncryptionStartupValidator phase 2: a key an entity field encrypts with must be accessible (saves
 * through that field fail without it), while a key no field uses only decrypts values encrypted
 * elsewhere (an app's own key, given only to some installs) and is reported as a warning.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { engine, logWarning } = vi.hoisted(() => ({
    engine: {
        Config: vi.fn(),
        ActiveEncryptionKeys: [{}] as unknown[],
        ValidateAllKeys: vi.fn(),
    },
    logWarning: vi.fn(),
}));

vi.mock('@memberjunction/core', () => ({
    LogStatusEx: vi.fn(),
    LogWarning: logWarning,
    Metadata: class {},
    RegisterForStartup: () => (target: Function) => target,
}));
vi.mock('@memberjunction/global', () => ({
    BaseSingleton: class {
        protected static getInstance<T>(this: new () => T): T {
            return new this();
        }
    },
}));
vi.mock('../EncryptionEngine', () => ({ EncryptionEngine: { Instance: engine } }));

import { EncryptionStartupValidator } from '../EncryptionStartupValidator';
import type { IMetadataProvider } from '@memberjunction/core';

const FIELD_KEY = 'AAAAAAAA-0000-0000-0000-000000000001';
const APP_KEY = 'BBBBBBBB-0000-0000-0000-000000000002';

/** Metadata where one entity field encrypts with FIELD_KEY (lower-cased, as IDs can arrive). */
const provider = {
    Entities: [{ Name: 'MJ: Credentials', Fields: [{ Name: 'Values', Encrypt: true, EncryptionKeyID: FIELD_KEY.toLowerCase() }] }],
} as unknown as IMetadataProvider;

const ok = (KeyId: string) => ({ KeyName: KeyId, KeyId, SourceType: 'EnvVarKeySource', LookupValue: 'X', IsAccessible: true });
const missing = (KeyId: string, LookupValue: string) => ({
    KeyName: `Key ${LookupValue}`, KeyId, SourceType: 'EnvVarKeySource', LookupValue, IsAccessible: false, IsConfigured: false,
    Error: `Environment variable "${LookupValue}" is not set.`,
});

describe('EncryptionStartupValidator — keys no field uses', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('fails startup loudly when a key a field encrypts with is missing', async () => {
        engine.ValidateAllKeys.mockResolvedValue([missing(FIELD_KEY, 'MJ_BASE_ENCRYPTION_KEY'), ok(APP_KEY)]);
        await expect(EncryptionStartupValidator.Instance.HandleStartup(undefined, provider)).rejects.toThrow(/validation failed/);
        expect(vi.mocked(console.error).mock.calls[0][0]).toContain('MJ_BASE_ENCRYPTION_KEY');
    });

    it('only warns, once, when a key no field uses is not configured on this install', async () => {
        engine.ValidateAllKeys.mockResolvedValue([ok(FIELD_KEY), missing(APP_KEY, 'MORECHEESE_SHARED_KEY')]);
        await expect(EncryptionStartupValidator.Instance.HandleStartup(undefined, provider)).resolves.toBeUndefined();
        expect(console.error).not.toHaveBeenCalled();
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toMatch(/not configured on this install.*"MORECHEESE_SHARED_KEY"/);
    });

    it('warns with the source\'s own error when a key no field uses is configured but unusable', async () => {
        const broken = { ...missing(APP_KEY, 'APP_KEY_2'), IsConfigured: true, Error: 'Key length mismatch: expected 32 bytes' };
        engine.ValidateAllKeys.mockResolvedValue([ok(FIELD_KEY), broken]);
        await expect(EncryptionStartupValidator.Instance.HandleStartup(undefined, provider)).resolves.toBeUndefined();
        expect(logWarning.mock.calls[0][0]).toContain('Key length mismatch');
    });

    it('passes quietly when every key is accessible', async () => {
        engine.ValidateAllKeys.mockResolvedValue([ok(FIELD_KEY), ok(APP_KEY)]);
        await expect(EncryptionStartupValidator.Instance.HandleStartup(undefined, provider)).resolves.toBeUndefined();
        expect(logWarning).not.toHaveBeenCalled();
        expect(console.error).not.toHaveBeenCalled();
    });
});
