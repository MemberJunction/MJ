/**
 * The platform-credential tiers shared by prompt runners and realtime voice sessions: PromptModel
 * bindings, then ModelVendor bindings, then Vendor bindings, then the vendor's default credential.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    ResolvePlatformAICredential,
    HasPlatformAICredential,
    FindVendorDefaultCredential,
    PlatformCredentialLogger,
} from '../PlatformCredentialResolver';

interface FakeCredential {
    ID: string;
    Name: string;
    IsActive: boolean;
    IsDefault?: boolean;
    CredentialTypeID?: string;
    Expired?: boolean;
    Throws?: boolean;
}

const h = vi.hoisted(() => {
    const state = {
        /** `${bindingType}:${targetId}` → credential ids, in binding priority order. */
        bindings: new Map<string, string[]>(),
        credentials: new Map<string, FakeCredential>(),
        vendors: new Map<string, { ID: string; CredentialTypeID: string | null }>(),
    };
    const getCredential = vi.fn(async (_name: string, options: { credentialId: string; subsystem: string }) => {
        const credential = state.credentials.get(options.credentialId);
        if (credential?.Throws) {
            throw new Error(`decrypt failed for ${options.credentialId}`);
        }
        return { values: { apiKey: `key-of-${options.credentialId}` } };
    });
    return { state, getCredential };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            GetCredentialBindingsForTarget: (type: string, id: string) =>
                (h.state.bindings.get(`${type}:${id}`) ?? []).map((CredentialID, i) => ({ CredentialID, Priority: i + 1 })),
            HasCredentialBindings: (type: string, id: string) => (h.state.bindings.get(`${type}:${id}`) ?? []).length > 0,
            get VendorsByID() {
                return h.state.vendors;
            },
        },
    },
}));

vi.mock('@memberjunction/credentials', () => ({
    CredentialEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            getCredentialById: (id: string) => h.state.credentials.get(id) ?? null,
            get Credentials() {
                return [...h.state.credentials.values()];
            },
            GetExpirationStatus: (c: FakeCredential) => ({
                status: c.Expired ? 'expired' : 'valid',
                usable: !c.Expired,
                expiresAt: c.Expired ? new Date(0) : null,
                daysUntilExpiration: null,
            }),
            getCredential: h.getCredential,
        },
    },
}));

function credential(id: string, extra: Partial<FakeCredential> = {}): void {
    h.state.credentials.set(id, { ID: id, Name: `name-${id}`, IsActive: true, ...extra });
}

function bind(type: 'PromptModel' | 'ModelVendor' | 'Vendor', target: string, ...credentialIDs: string[]): void {
    h.state.bindings.set(`${type}:${target}`, credentialIDs);
}

const valueOf = (id: string): string => JSON.stringify({ apiKey: `key-of-${id}` });

describe('ResolvePlatformAICredential', () => {
    beforeEach(() => {
        h.state.bindings.clear();
        h.state.credentials.clear();
        h.state.vendors.clear();
        h.getCredential.mockClear();
    });

    it('takes the most specific tier: PromptModel, then ModelVendor, then Vendor', async () => {
        credential('c-pm');
        credential('c-mv');
        credential('c-v');
        bind('PromptModel', 'pm1', 'c-pm');
        bind('ModelVendor', 'mv1', 'c-mv');
        bind('Vendor', 'v1', 'c-v');
        const request = { Subsystem: 'Test', PromptModelID: 'pm1', ModelVendorIDs: ['mv1'], VendorID: 'v1' };

        expect(await ResolvePlatformAICredential(request)).toBe(valueOf('c-pm'));
        expect(await ResolvePlatformAICredential({ ...request, PromptModelID: undefined })).toBe(valueOf('c-mv'));
        expect(await ResolvePlatformAICredential({ ...request, PromptModelID: undefined, ModelVendorIDs: [] })).toBe(valueOf('c-v'));
    });

    it('falls back to the vendor\'s default credential of its type', async () => {
        h.state.vendors.set('v1', { ID: 'v1', CredentialTypeID: 'type-api-key' });
        credential('c-other-type', { IsDefault: true, CredentialTypeID: 'type-other' });
        credential('c-default', { IsDefault: true, CredentialTypeID: 'type-api-key' });

        expect(await ResolvePlatformAICredential({ Subsystem: 'Test', VendorID: 'v1' })).toBe(valueOf('c-default'));
        expect(FindVendorDefaultCredential('v1')?.ID).toBe('c-default');
    });

    it('fails over past a missing, inactive or expired credential to the next binding', async () => {
        credential('c-inactive', { IsActive: false });
        credential('c-expired', { Expired: true });
        credential('c-good');
        bind('Vendor', 'v1', 'c-missing', 'c-inactive', 'c-expired', 'c-good');

        expect(await ResolvePlatformAICredential({ Subsystem: 'Test', VendorID: 'v1' })).toBe(valueOf('c-good'));
    });

    it('reports the last binding of a tier that fails to resolve, then moves to the next tier', async () => {
        credential('c-broken', { Throws: true });
        credential('c-vendor');
        bind('ModelVendor', 'mv1', 'c-broken');
        bind('Vendor', 'v1', 'c-vendor');
        const logger: PlatformCredentialLogger = { Status: vi.fn(), Failure: vi.fn() };

        const result = await ResolvePlatformAICredential({ Subsystem: 'Test', ModelVendorIDs: ['mv1'], VendorID: 'v1', Logger: logger });

        expect(result).toBe(valueOf('c-vendor'));
        expect(logger.Failure).toHaveBeenCalledTimes(1);
        expect(vi.mocked(logger.Failure).mock.calls[0][1]).toMatchObject({ credentialId: 'c-broken', source: 'AICredentialBinding(ModelVendor) priority 1' });
    });

    it('returns undefined when no tier applies, so the caller falls back to its legacy keys', async () => {
        h.state.vendors.set('v1', { ID: 'v1', CredentialTypeID: null });
        expect(await ResolvePlatformAICredential({ Subsystem: 'Test', ModelVendorIDs: ['mv1'], VendorID: 'v1' })).toBeUndefined();
        expect(h.getCredential).not.toHaveBeenCalled();
    });

    it('records the caller\'s subsystem on the credential read', async () => {
        credential('c-v');
        bind('Vendor', 'v1', 'c-v');
        await ResolvePlatformAICredential({ Subsystem: 'RealtimeSession', VendorID: 'v1' });
        expect(h.getCredential.mock.calls[0][1]).toMatchObject({ credentialId: 'c-v', subsystem: 'RealtimeSession' });
    });

    it('emits status lines only when verbose', async () => {
        credential('c-v');
        bind('Vendor', 'v1', 'c-v');
        const quiet: PlatformCredentialLogger = { Status: vi.fn(), Failure: vi.fn() };
        const verbose: PlatformCredentialLogger = { Status: vi.fn(), Failure: vi.fn() };

        await ResolvePlatformAICredential({ Subsystem: 'Test', VendorID: 'v1', Logger: quiet });
        await ResolvePlatformAICredential({ Subsystem: 'Test', VendorID: 'v1', Logger: verbose, Verbose: true });

        expect(quiet.Status).not.toHaveBeenCalled();
        expect(vi.mocked(verbose.Status).mock.calls.some(([m]) => m.includes('name-c-v'))).toBe(true);
        expect(vi.mocked(verbose.Status).mock.calls.some(([m]) => m.includes('key-of'))).toBe(false);
    });
});

describe('HasPlatformAICredential', () => {
    beforeEach(() => {
        h.state.bindings.clear();
        h.state.credentials.clear();
        h.state.vendors.clear();
        h.getCredential.mockClear();
    });

    it('answers from metadata for each tier without reading a credential', () => {
        expect(HasPlatformAICredential({ ModelVendorIDs: ['mv1'], VendorID: 'v1' })).toBe(false);
        bind('ModelVendor', 'mv1', 'c1');
        expect(HasPlatformAICredential({ ModelVendorIDs: ['mv1'] })).toBe(true);
        expect(HasPlatformAICredential({ VendorID: 'v1' })).toBe(false);
        h.state.vendors.set('v1', { ID: 'v1', CredentialTypeID: 'type-api-key' });
        credential('c-default', { IsDefault: true, CredentialTypeID: 'type-api-key' });
        expect(HasPlatformAICredential({ VendorID: 'v1' })).toBe(true);
        expect(h.getCredential).not.toHaveBeenCalled();
    });
});
