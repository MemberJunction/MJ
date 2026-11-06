/**
 * A key whose source doesn't hold it on this install (an app's own key the install wasn't given)
 * surfaces as a typed EncryptionKeyUnavailableError, reported once per key, not as a decrypt fault.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared singleton store used by both BaseSingleton and FakeEncryptionEngineBase
const singletonStore: Record<string, unknown> = {};

// Mock all external MJ dependencies
vi.mock('@memberjunction/global', () => {
    const ENCRYPTION_MARKER = '$ENC$';
    const ENCRYPTED_SENTINEL = '[!ENCRYPTED$]';

    // Minimal BaseSingleton that EncryptionEngine extends
    class BaseSingleton<T> {
        protected static getInstance<T>(this: new () => T): T {
            const key = this.name;
            if (!singletonStore[key]) {
                singletonStore[key] = new this();
            }
            return singletonStore[key] as T;
        }
    }

    return {
        ENCRYPTION_MARKER,
        ENCRYPTED_SENTINEL,
        BaseSingleton,
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
    LogWarning: vi.fn(),
    UserInfo: class {},
    RegisterForStartup: () => (target: Function) => target
}));

vi.mock('@memberjunction/core-entities', () => {
    // Standalone fake that EncryptionEngine accesses via .Instance
    class FakeEncryptionEngineBase {
        static _singleton: FakeEncryptionEngineBase | null = null;
        _loaded = false;

        static get Instance(): FakeEncryptionEngineBase {
            if (!FakeEncryptionEngineBase._singleton) {
                FakeEncryptionEngineBase._singleton = new FakeEncryptionEngineBase();
            }
            return FakeEncryptionEngineBase._singleton;
        }

        get Loaded() { return this._loaded; }

        async Config() {
            this._loaded = true;
        }

        async RefreshAllItems() {}

        GetKeyConfiguration(_keyId: string): Record<string, unknown> | undefined {
            return undefined; // Default - tests will override
        }

        // Delegated property stubs
        get EncryptionKeys() { return []; }
        get ActiveEncryptionKeys() { return []; }
        get EncryptionAlgorithms() { return []; }
        get ActiveEncryptionAlgorithms() { return []; }
        get EncryptionKeySources() { return []; }
        get ActiveEncryptionKeySources() { return []; }
        GetKeyByID() { return undefined; }
        GetKeyByName() { return undefined; }
        GetAlgorithmByID() { return undefined; }
        GetAlgorithmByName() { return undefined; }
        GetKeySourceByID() { return undefined; }
        GetKeySourceByDriverClass() { return undefined; }
        ValidateKey() { return { isValid: true }; }
        GetKeyMarker() { return '$ENC$'; }
    }

    return {
        EncryptionEngineBase: FakeEncryptionEngineBase,
        MJEncryptionKeyEntity: class {},
        MJEncryptionAlgorithmEntity: class {},
        MJEncryptionKeySourceEntity: class {}
    };
});

import { EncryptionEngine } from '../EncryptionEngine';
import { EncryptionKeyUnavailableError, IsEncryptionKeyUnavailable, ReportEncryptionKeyUnavailable } from '../EncryptionKeyUnavailableError';
import { EncryptionEngineBase } from '@memberjunction/core-entities';
import { LogWarning } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

const KEY_ID = '11111111-2222-3333-4444-555555555555';
const VALUE = `$ENC$${KEY_ID}$AES-256-GCM$aXY=$Y2lwaGVy$dGFn`;

/** A key source whose key is missing (KeyExists false) or present but failing (KeyExists true). */
function fakeSource(keyExists: boolean) {
    return {
        SourceName: 'Environment Variable',
        Initialize: async () => {},
        ValidateConfiguration: () => true,
        GetKey: vi.fn(async () => {
            throw new Error('Environment variable "MORECHEESE_SHARED_KEY" is not set.');
        }),
        KeyExists: vi.fn(async () => keyExists),
    };
}

/** Points the key at `source`. Sources are cached per driver class, so each test names its own. */
function useKey(source: ReturnType<typeof fakeSource>, driverClass: string) {
    const base = (EncryptionEngineBase as unknown as { Instance: { GetKeyConfiguration: (id: string) => unknown } }).Instance;
    base.GetKeyConfiguration = () => ({
        key: { ID: KEY_ID, Name: 'More Cheese Shared Key', Status: 'Active', IsActive: true, KeyVersion: '1', Marker: '$ENC$', KeyLookupValue: 'MORECHEESE_SHARED_KEY' },
        algorithm: { Name: 'AES-256-GCM', IsActive: true, NodeCryptoName: 'aes-256-gcm', KeyLengthBits: 256, IVLengthBytes: 12, IsAEAD: true },
        source: { Name: 'Environment Variable', IsActive: true, DriverClass: driverClass },
    });
    vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockReturnValue(source as never);
}

describe('a key this install does not have', () => {
    beforeEach(() => {
        EncryptionEngine.Instance.ClearCaches();
        vi.clearAllMocks();
    });

    it('throws EncryptionKeyUnavailableError naming the key and where it is looked for', async () => {
        useKey(fakeSource(false), 'MissingKeySource');
        const err = await EncryptionEngine.Instance.Decrypt(VALUE).catch((e: unknown) => e);
        expect(IsEncryptionKeyUnavailable(err)).toBe(true);
        expect(err).toMatchObject({ KeyID: KEY_ID, KeyName: 'More Cheese Shared Key', LookupValue: 'MORECHEESE_SHARED_KEY' });
    });

    it('keeps the original error when the key is there but could not be read', async () => {
        useKey(fakeSource(true), 'FailingKeySource');
        const err = await EncryptionEngine.Instance.Decrypt(VALUE).catch((e: unknown) => e);
        expect(IsEncryptionKeyUnavailable(err)).toBe(false);
        expect(String(err)).toContain('is not set');
    });
});

describe('ReportEncryptionKeyUnavailable', () => {
    it('warns once per key, naming where to provide it', () => {
        const err = new EncryptionKeyUnavailableError('AAAAAAAA-0000-0000-0000-000000000001', 'App Key', 'Environment Variable', 'APP_KEY');
        ReportEncryptionKeyUnavailable(err);
        ReportEncryptionKeyUnavailable(err);
        ReportEncryptionKeyUnavailable(new EncryptionKeyUnavailableError('aaaaaaaa-0000-0000-0000-000000000001', 'App Key', 'Environment Variable', 'APP_KEY'));
        expect(LogWarning).toHaveBeenCalledTimes(1);
        expect(vi.mocked(LogWarning).mock.calls[0][0]).toContain('"APP_KEY"');
    });

    it('recognises the error by its code, not its class', () => {
        expect(IsEncryptionKeyUnavailable(Object.assign(new Error('x'), { Code: 'ENCRYPTION_KEY_UNAVAILABLE' }))).toBe(true);
        expect(IsEncryptionKeyUnavailable(new Error('x'))).toBe(false);
    });
});
