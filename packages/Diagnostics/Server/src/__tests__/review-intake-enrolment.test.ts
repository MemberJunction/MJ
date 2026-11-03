import { describe, it, expect, afterEach, vi } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { InstanceConfigEngine, MJCredentialEntity } from '@memberjunction/core-entities';
import { CredentialEngine } from '@memberjunction/credentials';
import { GenerateDiagnosticKeyPair } from '@memberjunction/diagnostics';
import { EnrolSender } from '../senderEnrolment.js';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogWarning: vi.fn() };
});

const COLLECTOR_URL = 'https://collector.example/api/';
const SIGNING_SETTING = 'Diagnostics.External.CollectorSigningPublicKeyBase64';
const ownerUser = { ID: 'user-owner-1', IsActive: true, Type: 'Owner', UserRoles: [] } as unknown as UserInfo;

interface EnrolBody {
    installId: string;
    keyId: string;
}

/** Makes `InstanceConfigEngine` read and write the given map. */
function mockSettings(values: Record<string, string>): void {
    const engine = InstanceConfigEngine.Instance;
    vi.spyOn(engine, 'Config').mockResolvedValue(undefined);
    vi.spyOn(engine, 'Get').mockImplementation((key: string) => values[key]);
    vi.spyOn(engine, 'Set').mockImplementation(async (key: string, value: string) => {
        values[key] = value;
        return true;
    });
}

/** Answers `POST /enroll` for the posted install and key with the given collector keys. */
function stubCollector(collectorPublicKeyBase64: string, collectorSigningPublicKeyBase64: string): void {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as EnrolBody;
        const answer = { installId: body.installId, keyId: body.keyId, collectorPublicKeyBase64, collectorSigningPublicKeyBase64 };
        return new Response(JSON.stringify(answer), { status: 200 });
    }));
}

describe('EnrolSender collector signing key', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('refuses a re-enrolment whose collector signing key differs from the pinned key', async () => {
        const pinned = await GenerateDiagnosticKeyPair('Ed25519', 'collector-signing-old');
        const other = await GenerateDiagnosticKeyPair('Ed25519', 'collector-signing-new');
        const settings: Record<string, string> = {
            'Diagnostics.External.CollectorUrl': COLLECTOR_URL,
            [SIGNING_SETTING]: pinned.publicKeyBase64,
        };
        mockSettings(settings);
        stubCollector('collector-x25519', other.publicKeyBase64);
        vi.spyOn(CredentialEngine.Instance, 'Config').mockResolvedValue(undefined);
        const store = vi
            .spyOn(CredentialEngine.Instance, 'StoreCredential')
            .mockResolvedValue({ ID: 'CRED-SENDER-2' } as unknown as MJCredentialEntity);

        await expect(EnrolSender({ RegistrationCode: 'CODE-123', ContextUser: ownerUser })).rejects.toThrow(SIGNING_SETTING);
        expect(store).not.toHaveBeenCalled();
        expect(settings[SIGNING_SETTING]).toBe(pinned.publicKeyBase64);
    });

    it('refuses an enrolment response without a collector signing key', async () => {
        mockSettings({ 'Diagnostics.External.CollectorUrl': COLLECTOR_URL });
        stubCollector('collector-x25519', '');
        vi.spyOn(CredentialEngine.Instance, 'Config').mockResolvedValue(undefined);
        const store = vi
            .spyOn(CredentialEngine.Instance, 'StoreCredential')
            .mockResolvedValue({ ID: 'CRED-SENDER-3' } as unknown as MJCredentialEntity);

        await expect(EnrolSender({ RegistrationCode: 'CODE-123', ContextUser: ownerUser })).rejects.toThrow(/no collector public keys/);
        expect(store).not.toHaveBeenCalled();
    });
});
