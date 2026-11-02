import * as crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { InstanceConfigEngine, MJDiagnosticBundleEntity } from '@memberjunction/core-entities';
import { CredentialEngine, ResolvedCredential } from '@memberjunction/credentials';
import {
    BuildCanonicalRequestString,
    DecryptDiagnosticBundle,
    GenerateDiagnosticKeyPair,
    ParseSenderAuthorizationHeader,
    SignRecipientPublicKey,
    DiagnosticKeyPair,
    DiagnosticBundleData,
} from '@memberjunction/diagnostics';

vi.mock('../bundleStore.js', () => ({
    CreateLocalBundleRow: vi.fn(async () => ({ ID: crypto.randomUUID(), Name: 'Test bundle' }) as unknown as MJDiagnosticBundleEntity),
    LoadBundleRow: vi.fn(async (id: string) => ({ ID: id }) as unknown as MJDiagnosticBundleEntity),
    MarkBundleReady: vi.fn(async () => undefined),
    MarkBundleFailed: vi.fn(async () => undefined),
    MarkBundleSending: vi.fn(async () => undefined),
    MarkBundleSent: vi.fn(async () => undefined),
}));

import { DiagnosticsBuildBundleServerOperation, DiagnosticsSendBundleServerOperation } from '../remoteOperations.js';
import { DiagnosticSessionManager } from '../sessionManager.js';
import { DiagnosticIntakeService } from '../intakeService.js';
import { SetDiagnosticsApiRoute } from '../apiRoute.js';

const COLLECTOR_URL = 'https://collector.example/api';
const INTAKE = `${COLLECTOR_URL}/diagnostics/intake/v1`;
const INSTALL_ID = '6f1c2a90-0d3e-4c55-9b7a-1e2f3a4b5c6d';
const SENDER_KEY_ID = '6f1c2a90-202611-ab12';

const ownerUser = { ID: 'user-owner-1', IsActive: true, Type: 'Owner', UserRoles: [] } as unknown as UserInfo;

interface RecordedRequest {
    Method: string;
    Url: string;
    Headers: Record<string, string>;
    Body: Uint8Array;
}

interface FakeCollectorOptions {
    SignWith?: DiagnosticKeyPair;
    UploadUrl?: string;
    /** Answers `POST /bundles` with a 307 to this URL. */
    RedirectBundlesTo?: string;
}

/** A collector stand-in that answers the intake routes and records every request. */
class FakeCollector {
    public readonly Requests: RecordedRequest[] = [];
    public Recipient!: DiagnosticKeyPair;
    public Signing!: DiagnosticKeyPair;
    private keySignature = '';
    private options: FakeCollectorOptions = {};

    public async Init(options: FakeCollectorOptions = {}): Promise<this> {
        this.options = options;
        this.Recipient = await GenerateDiagnosticKeyPair('X25519', 'collector-x25519');
        this.Signing = await GenerateDiagnosticKeyPair('Ed25519', 'collector-signing');
        const signer = options.SignWith ?? this.Signing;
        this.keySignature = await SignRecipientPublicKey(this.Recipient.keyId, this.Recipient.publicKeyBase64, signer.privateKeyBase64);
        return this;
    }

    public Fetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        this.Requests.push({ Method: method, Url: url, Headers: (init?.headers ?? {}) as Record<string, string>, Body: toBytes(init?.body) });
        const resp = this.answer(method, url);
        const location = resp.headers.get('Location');
        if (resp.status >= 300 && resp.status < 400 && location) {
            return this.followLikeFetch(location, init);
        }
        return resp;
    };

    /** Mirrors `fetch` redirect modes: `error` throws, `follow` (the default) re-sends to the new URL. */
    private async followLikeFetch(location: string, init?: RequestInit): Promise<Response> {
        if (init?.redirect === 'error') {
            throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') });
        }
        return this.Fetch(location, init);
    }

    private answer(method: string, url: string): Response {
        if (method === 'POST' && url === `${INTAKE}/bundles` && this.options.RedirectBundlesTo) {
            return new Response(null, { status: 307, headers: { Location: this.options.RedirectBundlesTo } });
        }
        if (method === 'GET' && url === `${INTAKE}/public-key`) {
            return json({ keyId: this.Recipient.keyId, publicKey: this.Recipient.publicKeyBase64, signature: this.keySignature });
        }
        if (method === 'POST' && url === `${INTAKE}/bundles`) {
            return json({ referenceId: 'diagref_1', uploadUrl: this.options.UploadUrl ?? '/api/diagnostics/intake/v1/bundles/diagref_1/payload' });
        }
        if (method === 'PUT' && url === `${INTAKE}/bundles/diagref_1/payload`) {
            return json({ accepted: true });
        }
        if (method === 'POST' && url === `${INTAKE}/bundles/diagref_1/complete`) {
            return json({ referenceId: 'diagref_1', status: 'received' });
        }
        return new Response('not found', { status: 404 });
    }
}

function toBytes(body: RequestInit['body'] | undefined): Uint8Array {
    if (!body) return new Uint8Array();
    if (typeof body === 'string') return new TextEncoder().encode(body);
    if (body instanceof Uint8Array) return body;
    throw new Error('unexpected body type in test');
}

function json(value: object): Response {
    return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

function mockSenderCredential(sender: DiagnosticKeyPair): void {
    vi.spyOn(CredentialEngine.Instance, 'Config').mockResolvedValue(undefined);
    const resolved: ResolvedCredential = {
        credential: null,
        values: { keyId: sender.keyId, publicKey: sender.publicKeyBase64, privateKey: sender.privateKeyBase64 },
        source: 'database',
        expirationStatus: 'valid',
    };
    vi.spyOn(CredentialEngine.Instance, 'GetCredential').mockResolvedValue(resolved);
}

function enrolledSettings(collector: FakeCollector): Record<string, string> {
    return {
        'Diagnostics.External.Enabled': 'true',
        'Diagnostics.External.CollectorUrl': COLLECTOR_URL,
        'Diagnostics.InstallID': INSTALL_ID,
        'Diagnostics.External.SenderCredentialID': 'CRED-SENDER-1',
        'Diagnostics.External.SenderKeyID': SENDER_KEY_ID,
        'Diagnostics.External.CollectorPublicKeyBase64': collector.Recipient.publicKeyBase64,
        'Diagnostics.External.CollectorSigningPublicKeyBase64': collector.Signing.publicKeyBase64,
    };
}

async function buildAndSend(destination: 'CustomerCollector' | 'MJC' = 'CustomerCollector') {
    const ctx = { user: ownerUser };
    const built = await new DiagnosticsBuildBundleServerOperation().ExecuteServer({}, ctx);
    expect(built.Success).toBe(true);
    return new DiagnosticsSendBundleServerOperation().ExecuteServer({ BundleID: built.Output!.BundleID, Destination: destination }, ctx);
}

function verifySignedRequest(req: RecordedRequest, sender: DiagnosticKeyPair): boolean {
    const assertion = ParseSenderAuthorizationHeader(req.Headers['Authorization']);
    if (!assertion || assertion.KeyID !== SENDER_KEY_ID || assertion.InstallID !== INSTALL_ID || assertion.Audience !== INTAKE) {
        return false;
    }
    const canonical = BuildCanonicalRequestString({
        Method: req.Method,
        Path: new URL(req.Url).pathname,
        Audience: assertion.Audience,
        InstallID: assertion.InstallID,
        Timestamp: assertion.Timestamp,
        Nonce: assertion.Nonce,
        BodySha256Hex: crypto.createHash('sha256').update(req.Body).digest('hex'),
    });
    const publicKey = crypto.createPublicKey({ key: Buffer.from(sender.publicKeyBase64, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(canonical, 'utf8'), publicKey, Buffer.from(assertion.SignatureBase64, 'base64'));
}

describe('Diagnostics.SendBundle sender authentication', () => {
    let sender: DiagnosticKeyPair;

    beforeEach(async () => {
        SetDiagnosticsApiRoute((subpath: string) => subpath);
        DiagnosticIntakeService.Instance.ResetForTests();
        sender = await GenerateDiagnosticKeyPair('Ed25519', SENDER_KEY_ID);
        const archive = new Uint8Array(crypto.randomBytes(256));
        vi.spyOn(DiagnosticSessionManager.Instance, 'AssembleBundleDataFromChunks').mockResolvedValue({
            bundleData: { findings: [] } as unknown as DiagnosticBundleData,
            archiveBytes: archive,
            sha256: crypto.createHash('sha256').update(archive).digest('hex'),
            manifest: {},
            scrubReport: { credentialsScrubbedCount: 0, sqlLiteralsNormalizedCount: 0, customPatternsAppliedCount: 0 },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('refuses to send when the installation is not enrolled', async () => {
        mockSettings({ 'Diagnostics.External.Enabled': 'true', 'Diagnostics.External.CollectorUrl': COLLECTOR_URL });
        const fetchStub = vi.fn(async () => new Response('', { status: 500 }));
        vi.stubGlobal('fetch', fetchStub);

        const sent = await buildAndSend();

        expect(sent.Success).toBe(false);
        expect(sent.ErrorMessage).toMatch(/not enrolled/);
        expect(fetchStub).not.toHaveBeenCalled();
    });

    it('signs every collector request and the envelope with the stored sender key', async () => {
        const collector = await new FakeCollector().Init();
        mockSettings(enrolledSettings(collector));
        mockSenderCredential(sender);
        vi.stubGlobal('fetch', collector.Fetch);

        const sent = await buildAndSend();

        expect(sent.Success).toBe(true);
        expect(sent.Output?.ExternalReferenceID).toBe('diagref_1');
        expect(collector.Requests.map((r) => r.Method)).toEqual(['GET', 'POST', 'PUT', 'POST']);
        expect(collector.Requests.every((r) => verifySignedRequest(r, sender))).toBe(true);
        expect(collector.Requests.some((r) => 'X-API-Key' in r.Headers)).toBe(false);

        const envelope = collector.Requests[2].Body;
        const decrypted = await DecryptDiagnosticBundle(envelope, {
            PrivateKeysByKeyId: { [collector.Recipient.keyId]: collector.Recipient.privateKeyBase64 },
            SenderPublicKeysByKeyId: { [SENDER_KEY_ID]: sender.publicKeyBase64 },
            RequireSenderSignature: true,
        });
        expect(decrypted.senderVerified).toBe(true);
    });

    it('refuses a collector public key that the pinned signing key did not sign', async () => {
        const impostor = await GenerateDiagnosticKeyPair('Ed25519', 'impostor');
        const collector = await new FakeCollector().Init({ SignWith: impostor });
        mockSettings(enrolledSettings(collector));
        mockSenderCredential(sender);
        vi.stubGlobal('fetch', collector.Fetch);

        const sent = await buildAndSend();

        expect(sent.Success).toBe(false);
        expect(sent.ErrorMessage).toMatch(/signature verification/);
        expect(collector.Requests.map((r) => r.Method)).toEqual(['GET']);
    });

    it('refuses an upload URL on another origin', async () => {
        const collector = await new FakeCollector().Init({ UploadUrl: 'https://attacker.example/steal' });
        mockSettings(enrolledSettings(collector));
        mockSenderCredential(sender);
        vi.stubGlobal('fetch', collector.Fetch);

        const sent = await buildAndSend();

        expect(sent.Success).toBe(false);
        expect(sent.ErrorMessage).toMatch(/another origin/);
        expect(collector.Requests.some((r) => r.Url.startsWith('https://attacker.example'))).toBe(false);
    });

    it('does not follow a collector redirect to another host', async () => {
        const collector = await new FakeCollector().Init({ RedirectBundlesTo: 'http://169.254.169.254/latest' });
        mockSettings(enrolledSettings(collector));
        mockSenderCredential(sender);
        vi.stubGlobal('fetch', collector.Fetch);

        const sent = await buildAndSend();

        expect(sent.Success).toBe(false);
        expect(sent.ErrorMessage).toMatch(/redirect/i);
        expect(collector.Requests.some((r) => r.Url.startsWith('http://169.254.169.254'))).toBe(false);
    });

    it('signs the four collector requests with four distinct nonces', async () => {
        const collector = await new FakeCollector().Init();
        mockSettings(enrolledSettings(collector));
        mockSenderCredential(sender);
        vi.stubGlobal('fetch', collector.Fetch);

        await buildAndSend();

        const nonces = collector.Requests.map((r) => ParseSenderAuthorizationHeader(r.Headers['Authorization'])?.Nonce);
        expect(nonces).toHaveLength(4);
        expect(new Set(nonces).size).toBe(4);
    });

    it('refuses a collector URL that is not https', async () => {
        const collector = await new FakeCollector().Init();
        mockSettings({ ...enrolledSettings(collector), 'Diagnostics.External.CollectorUrl': 'http://collector.example/api' });
        mockSenderCredential(sender);
        const fetchStub = vi.fn(collector.Fetch);
        vi.stubGlobal('fetch', fetchStub);

        const sent = await buildAndSend();

        expect(sent.Success).toBe(false);
        expect(sent.ErrorMessage).toMatch(/https/);
        expect(fetchStub).not.toHaveBeenCalled();
    });

    it('sends to a rotated collector key that the pinned signer signed and logs a warning', async () => {
        const collector = await new FakeCollector().Init();
        const enrolledKey = await GenerateDiagnosticKeyPair('X25519', 'collector-x25519-old');
        mockSettings({ ...enrolledSettings(collector), 'Diagnostics.External.CollectorPublicKeyBase64': enrolledKey.publicKeyBase64 });
        mockSenderCredential(sender);
        vi.stubGlobal('fetch', collector.Fetch);
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

        const sent = await buildAndSend();

        expect(sent.Success).toBe(true);
        expect(logged.mock.calls.some((c) => c.join(' ').includes('rotat'))).toBe(true);
    });

    it('says the intake key did not load when local intake is enabled but not usable', async () => {
        mockSettings({ 'Diagnostics.Intake.Enabled': 'true' });
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));

        const sent = await buildAndSend('MJC');

        expect(sent.Success).toBe(false);
        expect(sent.ErrorMessage).toMatch(/not usable|did not load/);
    });

    it('fails with a clear message when no collector is set and local intake is disabled', async () => {
        mockSettings({});
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));

        const sent = await buildAndSend('MJC');

        expect(sent.Success).toBe(false);
        expect(sent.ErrorMessage).toMatch(/Diagnostics\.Intake\.Enabled/);
        expect(DiagnosticIntakeService.Instance.Enabled).toBe(false);
    });
});
