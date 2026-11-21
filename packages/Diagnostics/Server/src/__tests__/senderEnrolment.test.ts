import { describe, it, expect, afterEach, vi } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { InstanceConfigEngine, MJCredentialEntity } from '@memberjunction/core-entities';
import { CredentialEngine } from '@memberjunction/credentials';
import { GenerateDiagnosticKeyPair, VerifyEnrolProof } from '@memberjunction/diagnostics';
import { EnrolSender } from '../senderEnrolment.js';
import { DiagnosticsEnrolSenderServerOperation } from '../remoteOperations.js';

const COLLECTOR_URL = 'https://collector.example/api/';
const AUDIENCE = 'https://collector.example/api/diagnostics/intake/v1';
const ownerUser = { ID: 'user-owner-1', IsActive: true, Type: 'Owner', UserRoles: [] } as unknown as UserInfo;

interface EnrolBody {
    installId: string;
    registrationCode: string;
    keyId: string;
    publicKeyBase64: string;
    proof: string;
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

describe('EnrolSender', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('refuses Diagnostics.EnrolSender for a user without Diagnostics: Manage Intake', async () => {
        mockSettings({ 'Diagnostics.External.CollectorUrl': COLLECTOR_URL });
        const fetchStub = vi.fn(async () => new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetchStub);
        const plainUser = { ID: 'user-plain-1', IsActive: true, Type: 'User', UserRoles: [] } as unknown as UserInfo;

        const result = await new DiagnosticsEnrolSenderServerOperation().ExecuteServer({ RegistrationCode: 'CODE-123' }, { user: plainUser });

        expect(result.Success).toBe(false);
        expect(fetchStub).not.toHaveBeenCalled();
    });

    it('fails when the collector refuses the enrolment', async () => {
        mockSettings({ 'Diagnostics.External.CollectorUrl': COLLECTOR_URL });
        vi.stubGlobal('fetch', vi.fn(async () => new Response('bad code', { status: 401 })));
        const store = vi.spyOn(CredentialEngine.Instance, 'StoreCredential');

        await expect(EnrolSender({ RegistrationCode: 'WRONG', ContextUser: ownerUser })).rejects.toThrow(/HTTP 401/);
        expect(store).not.toHaveBeenCalled();
    });

    it('refuses an enrolment response that names another install or key', async () => {
        mockSettings({ 'Diagnostics.External.CollectorUrl': COLLECTOR_URL });
        const signing = await GenerateDiagnosticKeyPair('Ed25519', 'collector-signing');
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body)) as EnrolBody;
            const answer = { installId: body.installId, keyId: 'someone-else', collectorPublicKeyBase64: 'x', collectorSigningPublicKeyBase64: signing.publicKeyBase64 };
            return new Response(JSON.stringify(answer), { status: 200 });
        }));
        const store = vi.spyOn(CredentialEngine.Instance, 'StoreCredential');

        await expect(EnrolSender({ RegistrationCode: 'CODE-123', ContextUser: ownerUser })).rejects.toThrow(/different installation or key/);
        expect(store).not.toHaveBeenCalled();
    });

    it('fails clearly when the enrolment response is not JSON', async () => {
        mockSettings({ 'Diagnostics.External.CollectorUrl': COLLECTOR_URL });
        vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>proxy error</html>', { status: 200 })));

        await expect(EnrolSender({ RegistrationCode: 'CODE-123', ContextUser: ownerUser })).rejects.toThrow(/enrolment response is not JSON/);
    });

    it('does not follow a redirect from the collector', async () => {
        mockSettings({ 'Diagnostics.External.CollectorUrl': COLLECTOR_URL });
        const fetchStub = vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.redirect !== 'error') {
                return new Response('{}', { status: 200 });
            }
            throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') });
        });
        vi.stubGlobal('fetch', fetchStub);

        await expect(EnrolSender({ RegistrationCode: 'CODE-123', ContextUser: ownerUser })).rejects.toThrow(/redirect/i);
    });

    it('posts a valid proof, stores the sender key and pins the collector keys', async () => {
        const settings: Record<string, string> = { 'Diagnostics.External.CollectorUrl': COLLECTOR_URL };
        mockSettings(settings);
        const collectorX25519 = await GenerateDiagnosticKeyPair('X25519', 'collector-x25519');
        const collectorSigning = await GenerateDiagnosticKeyPair('Ed25519', 'collector-signing');
        const posted: { url: string; body: EnrolBody }[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body)) as EnrolBody;
            posted.push({ url, body });
            const answer = {
                installId: body.installId,
                keyId: body.keyId,
                collectorPublicKeyBase64: collectorX25519.publicKeyBase64,
                collectorSigningPublicKeyBase64: collectorSigning.publicKeyBase64,
            };
            return new Response(JSON.stringify(answer), { status: 200 });
        }));
        vi.spyOn(CredentialEngine.Instance, 'Config').mockResolvedValue(undefined);
        const store = vi
            .spyOn(CredentialEngine.Instance, 'StoreCredential')
            .mockResolvedValue({ ID: 'CRED-SENDER-1' } as unknown as MJCredentialEntity);

        const result = await EnrolSender({ RegistrationCode: 'CODE-123', ContextUser: ownerUser });

        expect(posted).toHaveLength(1);
        expect(posted[0].url).toBe(`${AUDIENCE}/enroll`);
        const body = posted[0].body;
        expect(body.installId).toBe(settings['Diagnostics.InstallID']);
        expect(body.keyId).toBe(result.KeyID);
        expect(result.KeyID).toMatch(new RegExp(`^${body.installId.slice(0, 8)}-\\d{6}-[0-9a-f]{4}$`));
        const proofOk = await VerifyEnrolProof({
            InstallID: body.installId,
            KeyID: body.keyId,
            RegistrationCode: 'CODE-123',
            Audience: AUDIENCE,
            PublicKeyBase64: body.publicKeyBase64,
            ProofBase64: body.proof,
        });
        expect(proofOk).toBe(true);

        const storedValues = store.mock.calls[0][2];
        expect(storedValues).toMatchObject({ keyId: body.keyId, publicKey: body.publicKeyBase64 });
        expect(storedValues.privateKey).toBeTruthy();
        expect(settings).toMatchObject({
            'Diagnostics.External.SenderCredentialID': 'CRED-SENDER-1',
            'Diagnostics.External.SenderKeyID': body.keyId,
            'Diagnostics.External.CollectorPublicKeyBase64': collectorX25519.publicKeyBase64,
            'Diagnostics.External.CollectorSigningPublicKeyBase64': collectorSigning.publicKeyBase64,
        });
    });
});
