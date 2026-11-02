import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { InstanceConfigEngine } from '@memberjunction/core-entities';
import { CredentialEngine, ResolvedCredential } from '@memberjunction/credentials';
import {
    BuildMjdiagArchive,
    EncryptDiagnosticBundle,
    GenerateDiagnosticKeyPair,
    DiagnosticBundleData,
    DiagnosticKeyPair,
    SignSenderRequest,
    SignEnrolProof,
    VerifyRecipientPublicKeySignature,
} from '@memberjunction/diagnostics';
import { DiagnosticIntakeService } from '../intakeService.js';
import { RateCounter } from '../intakeAuth.js';
import { DiagnosticsServerMiddleware } from '../middleware.js';
import { ConfigureIntakeFromSettings } from '../intakeStartup.js';
import { DiagnosticsSettings } from '../settings.js';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogWarning: vi.fn() };
});

type ExpressAppParam = Parameters<DiagnosticsServerMiddleware['ConfigureExpressApp']>[0];

const PUBLIC_BASE = 'https://collector.test/api';
const AUD = `${PUBLIC_BASE}/diagnostics/intake/v1`;
const BUNDLES_PATH = '/api/diagnostics/intake/v1/bundles';
const ENROLL_PATH = '/api/diagnostics/intake/v1/enroll';
const INSTALL_ID = '6B1D7C70-2C1E-4A55-9C1E-7D2E0B9A1F01';
const OTHER_INSTALL_ID = '6B1D7C70-2C1E-4A55-9C1E-7D2E0B9A1F02';

/** A route stand-in for the API route builder MJServer passes to the middleware. */
const apiRoute = (subpath: string, options?: { absolute?: boolean }): string =>
    options?.absolute ? `${PUBLIC_BASE}${subpath}` : `/api${subpath}`;

// ---------------------------------------------------------------------------------------------
// Fake Express request/response
// ---------------------------------------------------------------------------------------------

interface FakeResponse {
    /** The request this response answered, so a test can see whether its body was read. */
    Request?: FakeRequest;
    StatusCode: number;
    Body: Record<string, unknown> | undefined;
    Done: Promise<void>;
    status: (code: number) => FakeResponse;
    json: (body: Record<string, unknown>) => FakeResponse;
    send: () => FakeResponse;
    setHeader: () => void;
}

function createFakeResponse(): FakeResponse {
    let finish: () => void = () => undefined;
    const res: FakeResponse = {
        StatusCode: 200,
        Body: undefined,
        Done: new Promise<void>((resolve) => { finish = resolve; }),
        status: (code) => { res.StatusCode = code; return res; },
        json: (body) => { res.Body = body; finish(); return res; },
        send: () => { finish(); return res; },
        setHeader: () => undefined,
    };
    return res;
}

/** A request that streams its raw body and also carries it parsed as `body`. */
class FakeRequest extends EventEmitter {
    public headers: Record<string, string>;
    public params: Record<string, string>;
    public query: Record<string, string> = {};
    public method: string;
    public originalUrl: string;
    public path: string;
    public ip = '203.0.113.7';
    public body: Record<string, unknown> | undefined;
    public destroy = (): void => undefined;

    public constructor(method: string, path: string, headers: Record<string, string>, raw: Uint8Array, params: Record<string, string>) {
        super();
        this.method = method;
        this.originalUrl = path;
        this.path = path;
        this.headers = headers;
        this.params = params;
        this.body = parseJsonOrUndefined(raw);
        setImmediate(() => {
            if (raw.byteLength > 0) this.emit('data', Buffer.from(raw));
            this.emit('end');
        });
    }
}

function parseJsonOrUndefined(raw: Uint8Array): Record<string, unknown> | undefined {
    try {
        return JSON.parse(Buffer.from(raw).toString('utf8')) as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

type RouteHandler = (req: FakeRequest, res: FakeResponse) => void | Promise<void>;

/** Registers the middleware's routes on a recorder and returns the handlers by method and path. */
function registerRoutes(): Map<string, RouteHandler> {
    const handlers = new Map<string, RouteHandler>();
    const recorder = (method: string) => (path: string, handler: RouteHandler) => { handlers.set(`${method} ${path}`, handler); };
    const fake = { get: recorder('GET'), post: recorder('POST'), put: recorder('PUT') };
    new DiagnosticsServerMiddleware().ConfigureExpressApp(fake as unknown as ExpressAppParam, { ApiRoute: apiRoute });
    return handlers;
}

interface CallOptions {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    body?: Uint8Array | string;
}

async function callRoute(
    handlers: Map<string, RouteHandler>,
    method: string,
    routePath: string,
    requestPath: string,
    options: CallOptions = {}
): Promise<FakeResponse> {
    const handler = handlers.get(`${method} ${routePath}`);
    if (!handler) throw new Error(`No route ${method} ${routePath}`);
    const raw = typeof options.body === 'string' ? new TextEncoder().encode(options.body) : options.body ?? new Uint8Array();
    const req = new FakeRequest(method, requestPath, options.headers ?? {}, raw, options.params ?? {});
    const res = createFakeResponse();
    res.Request = req;
    await handler(req, res);
    await res.Done;
    return res;
}

// ---------------------------------------------------------------------------------------------
// Fake provider: entity rows saved to in-memory tables, RunView served from them
// ---------------------------------------------------------------------------------------------

type FieldValue = string | number | boolean | Date | null | undefined;
type Fields = Record<string, FieldValue>;

interface FakeRow {
    ID: string;
    LatestResult: { CompleteMessage: string };
    Save: () => Promise<boolean>;
    Load: (id: string) => Promise<boolean>;
    [field: string]: FieldValue | FakeRow['LatestResult'] | FakeRow['Save'] | FakeRow['Load'];
}

interface FakeStore {
    Provider: IMetadataProvider;
    Tables: Map<string, Map<string, Fields>>;
    Rows: (entity: string) => Fields[];
    Seed: (entity: string, fields: Fields & { ID: string }) => void;
    ReceivedCountOverride: number | null;
}

function fieldsOf(row: FakeRow): Fields {
    const out: Fields = {};
    for (const [key, value] of Object.entries(row)) {
        if (typeof value !== 'function' && key !== 'LatestResult') out[key] = value as FieldValue;
    }
    return out;
}

function createFakeStore(): FakeStore {
    const tables = new Map<string, Map<string, Fields>>();
    const table = (name: string): Map<string, Fields> => {
        if (!tables.has(name)) tables.set(name, new Map());
        return tables.get(name)!;
    };
    const createRow = (entity: string, initial: Fields = {}): FakeRow => {
        const row: FakeRow = {
            ID: '',
            LatestResult: { CompleteMessage: `${entity} save failed` },
            Save: async () => {
                if (!row.ID) row.ID = crypto.randomUUID().toUpperCase();
                table(entity).set(row.ID, fieldsOf(row));
                return true;
            },
            Load: async (id: string) => {
                const stored = table(entity).get(id);
                if (!stored) return false;
                Object.assign(row, stored);
                return true;
            },
        };
        Object.assign(row, initial);
        return row;
    };
    const store: FakeStore = {
        Provider: {
            GetEntityObject: async (entity: string) => createRow(entity),
            EntityByName: (entity: string) => ({ Name: entity }),
        } as unknown as IMetadataProvider,
        Tables: tables,
        Rows: (entity) => [...table(entity).values()],
        Seed: (entity, fields) => { table(entity).set(fields.ID, { ...fields }); },
        ReceivedCountOverride: null,
    };
    const fakeRunView = {
        RunView: async (params: { EntityName: string; ExtraFilter?: string; ResultType?: string }) => {
            const filter = params.ExtraFilter ?? '';
            const matches = store.Rows(params.EntityName).filter((r) => matchesFilter(r, filter));
            if (params.ResultType === 'count_only') {
                const count = store.ReceivedCountOverride ?? matches.length;
                return { Success: true, Results: [], TotalRowCount: count, ErrorMessage: '' };
            }
            const rows = matches.map((r) => createRow(params.EntityName, r));
            return { Success: true, Results: rows, TotalRowCount: rows.length, ErrorMessage: '' };
        },
    };
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as unknown as RunView);
    return store;
}

/** Matches a row when every `Field='value'` equality in the filter holds (case-insensitive). */
function matchesFilter(row: Fields, filter: string): boolean {
    const equalities = [...filter.matchAll(/(\w+)\s*=\s*'([^']*)'/g)];
    return equalities.every(([, field, value]) => String(row[field] ?? '').toLowerCase() === value.toLowerCase());
}

/** Makes `InstanceConfigEngine` return the given values; unlisted keys fall back to their defaults. */
function mockInstanceSettings(values: Record<string, string> = {}): void {
    const engine = InstanceConfigEngine.Instance;
    vi.spyOn(engine, 'Config').mockResolvedValue(undefined);
    vi.spyOn(engine, 'Get').mockImplementation((key: string) => values[key]);
}

const systemUser = { ID: 'system-user', Name: 'System', IsActive: true, Type: 'Owner', UserRoles: [] } as unknown as UserInfo;

// ---------------------------------------------------------------------------------------------
// Bundle fixtures
// ---------------------------------------------------------------------------------------------

async function createValidBundleZip(bundleId: string): Promise<Uint8Array> {
    const bundleData: DiagnosticBundleData = {
        environment: { mjVersion: '6.2.0', nodeVersion: process.version, osPlatform: process.platform, osArch: process.arch },
        repro: { breadcrumbs: [] },
        clientLogs: [],
        clientWaterfall: [],
        clientTelemetry: [],
        serverTraces: [],
        serverSql: [{ timestamp: '2026-11-02T12:00:00.000Z', sql: 'SELECT 1', durationMs: 1200, rowCount: 1, parameterTypes: [] }],
        serverLogs: [],
        findings: [],
    };
    return BuildMjdiagArchive(bundleData, { bundleId, captureReason: 'Manual', scrubberProfile: 'Standard' });
}

interface EncryptedFixture {
    BundleID: string;
    Zip: Uint8Array;
    Encrypted: Uint8Array;
    PlaintextSha256: string;
    EncryptedSha256: string;
}

async function encryptBundle(
    collectorKey: DiagnosticKeyPair,
    sender?: { KeyID: string; PrivateKeyBase64: string },
    bundleId = `bundle-${crypto.randomUUID()}`
): Promise<EncryptedFixture> {
    const zip = await createValidBundleZip(bundleId);
    const plaintextSha256 = crypto.createHash('sha256').update(zip).digest('hex');
    const encrypted = await EncryptDiagnosticBundle(zip, {
        recipientKeyId: collectorKey.keyId,
        recipientPublicKeyBase64: collectorKey.publicKeyBase64,
        senderEnvironmentId: INSTALL_ID,
        manifestSha256: plaintextSha256,
        ...(sender ? { senderKeyId: sender.KeyID, senderSigningPrivateKeyBase64: sender.PrivateKeyBase64 } : {}),
    });
    return {
        BundleID: bundleId,
        Zip: zip,
        Encrypted: encrypted,
        PlaintextSha256: plaintextSha256,
        EncryptedSha256: crypto.createHash('sha256').update(encrypted).digest('hex'),
    };
}

function createBody(fixture: EncryptedFixture, collectorKey: DiagnosticKeyPair, installId = INSTALL_ID): string {
    return JSON.stringify({
        installId,
        bundleId: fixture.BundleID,
        formatVersion: 1,
        mjVersion: '6.2.0',
        scrubLiterals: true,
        sizeBytes: fixture.Encrypted.byteLength,
        plaintextSha256: fixture.PlaintextSha256,
        encryptedSha256: fixture.EncryptedSha256,
        keyId: collectorKey.keyId,
        contact: 'ops@example.com',
    });
}


const PAYLOAD_ROUTE = '/api/diagnostics/intake/v1/bundles/:referenceId/payload';
const COMPLETE_ROUTE = '/api/diagnostics/intake/v1/bundles/:referenceId/complete';
const REGISTRATION_ENTITY = 'MJ: Diagnostic Sender Registrations';

interface SenderKeys {
    InstallID: string;
    Key: DiagnosticKeyPair;
}

interface SignOverrides {
    Now?: Date;
    Audience?: string;
    Nonce?: string;
    SignedBody?: string | Uint8Array;
    Key?: DiagnosticKeyPair;
}

/** Builds the headers of a signed intake request. */
async function signedHeaders(
    sender: SenderKeys,
    method: string,
    path: string,
    body: string | Uint8Array,
    overrides: SignOverrides = {}
): Promise<Record<string, string>> {
    const key = overrides.Key ?? sender.Key;
    const signed = await SignSenderRequest({
        Method: method,
        Path: path,
        Audience: overrides.Audience ?? AUD,
        InstallID: sender.InstallID,
        KeyID: sender.Key.keyId,
        PrivateKeyBase64: key.privateKeyBase64,
        Body: overrides.SignedBody ?? body,
        Now: overrides.Now,
        Nonce: overrides.Nonce,
    });
    return { authorization: signed.AuthorizationHeader, 'content-type': 'application/json' };
}

async function postCreate(
    handlers: Map<string, RouteHandler>,
    sender: SenderKeys,
    body: string,
    overrides: SignOverrides = {}
): Promise<FakeResponse> {
    const headers = await signedHeaders(sender, 'POST', BUNDLES_PATH, body, overrides);
    return callRoute(handlers, 'POST', BUNDLES_PATH, BUNDLES_PATH, { headers, body });
}

async function putPayload(handlers: Map<string, RouteHandler>, sender: SenderKeys, referenceId: string, bytes: Uint8Array): Promise<FakeResponse> {
    const path = `${BUNDLES_PATH}/${referenceId}/payload`;
    const headers = await signedHeaders(sender, 'PUT', path, bytes);
    return callRoute(handlers, 'PUT', PAYLOAD_ROUTE, path, { headers, body: bytes, params: { referenceId } });
}

async function postComplete(
    handlers: Map<string, RouteHandler>,
    sender: SenderKeys,
    referenceId: string,
    fixture: EncryptedFixture
): Promise<FakeResponse> {
    const path = `${BUNDLES_PATH}/${referenceId}/complete`;
    const body = JSON.stringify({ encryptedSha256: fixture.EncryptedSha256, plaintextSha256: fixture.PlaintextSha256 });
    const headers = await signedHeaders(sender, 'POST', path, body);
    return callRoute(handlers, 'POST', COMPLETE_ROUTE, path, { headers, body, params: { referenceId } });
}

async function newSender(installId = INSTALL_ID, keyId = 'sender-key-1'): Promise<SenderKeys> {
    return { InstallID: installId, Key: await GenerateDiagnosticKeyPair('Ed25519', keyId) };
}

function seedRegistration(store: FakeStore, sender: SenderKeys, fields: Fields = {}): string {
    const id = crypto.randomUUID().toUpperCase();
    store.Seed(REGISTRATION_ENTITY, {
        ID: id,
        InstallID: sender.InstallID,
        Name: 'Customer A',
        Status: 'Active',
        KeyAlgorithm: 'Ed25519',
        KeyID: sender.Key.keyId,
        PublicKeyBase64: sender.Key.publicKeyBase64,
        RegistrationCodeHash: null,
        RegistrationCodeExpiresAt: null,
        MaxBundlesPerDay: 20,
        LastSeenAt: null,
        ...fields,
    });
    return id;
}

/** Runs create, upload and complete in process, the way the local loopback does. */
async function runInProcessIntake(
    intake: DiagnosticIntakeService,
    fixture: EncryptedFixture,
    collectorKey: DiagnosticKeyPair,
    overrides: { plaintextSha256?: string } = {}
) {
    const initiated = intake.InitiateBundleIntake(JSON.parse(createBody(fixture, collectorKey)));
    const uploaded = await intake.UploadEncryptedPayload(initiated.referenceId, fixture.Encrypted);
    expect(uploaded.accepted).toBe(true);
    return intake.CompleteBundleIntake(initiated.referenceId, {
        encryptedSha256: fixture.EncryptedSha256,
        plaintextSha256: overrides.plaintextSha256 ?? fixture.PlaintextSha256,
    });
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe('diagnostics intake sender authentication', () => {
    let collectorKey: DiagnosticKeyPair;
    let handlers: Map<string, RouteHandler>;

    beforeEach(async () => {
        mockInstanceSettings();
        await new DiagnosticsServerMiddleware().Initialize({ ApiRoute: apiRoute });
        collectorKey = await GenerateDiagnosticKeyPair('X25519', 'collector-key-1');
        const intake = DiagnosticIntakeService.Instance;
        intake.ResetForTests();
        intake.RegisterKeyPair(collectorKey);
        intake.Configure({ enabled: true });
        handlers = registerRoutes();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.mocked(LogError).mockClear();
    });

    describe('old API-key behaviour', () => {
        it('rejects a create request that carries only a non-empty X-API-Key', async () => {
            const fixture = await encryptBundle(collectorKey);
            const res = await callRoute(handlers, 'POST', BUNDLES_PATH, BUNDLES_PATH, {
                headers: { 'x-api-key': 'anything-at-all', 'content-type': 'application/json' },
                body: createBody(fixture, collectorKey),
            });
            expect(res.StatusCode).toBe(401);
        });
    });

    describe('received bundle rows (F8)', () => {
        it('saves a Received MJ: Diagnostic Bundles row with the stored file on complete', async () => {
            const store = createFakeStore();
            const verified = new Map<string, Uint8Array>();
            const intake = DiagnosticIntakeService.Instance;
            intake.Configure({
                contextUser: systemUser,
                provider: store.Provider,
                storageBridge: {
                    VerifiedStorageProviderID: 'STORAGE-PROVIDER-1',
                    WriteQuarantineObject: async (ref) => `quarantine/${ref}`,
                    PromoteToVerifiedStorage: async (ref, _q, bytes) => { verified.set(ref, bytes); return `verified/${ref}.mjdiag`; },
                    DeleteQuarantineObject: async () => undefined,
                },
            });
            const fixture = await encryptBundle(collectorKey);
            const completed = await runInProcessIntake(intake, fixture, collectorKey);
            expect(completed.status).toBe('received');

            const rows = store.Rows('MJ: Diagnostic Bundles');
            expect(rows).toHaveLength(1);
            const row = rows[0];
            expect(row.Direction).toBe('Received');
            expect(row.Status).toBe('Ready');
            expect(row.SenderInstallID).toBe(INSTALL_ID);
            expect(row.SenderMJVersion).toBe('6.2.0');
            expect(row.ContactInfo).toBe('ops@example.com');
            expect(row.ExternalReferenceID).toBe(completed.referenceId);
            expect(row.SHA256).toBe(fixture.PlaintextSha256);
            expect(row.SizeBytes).toBe(fixture.Zip.byteLength);
            expect(row.ManifestJSON).toBeTruthy();
            expect(row.FindingsJSON).toBeTruthy();
            const files = store.Rows('MJ: Files');
            expect(files).toHaveLength(1);
            expect(files[0].ProviderID).toBe('STORAGE-PROVIDER-1');
            expect(files[0].ProviderKey).toBe(`verified/${completed.referenceId}.mjdiag`);
            expect(row.FileID).toBe(files[0].ID);
        });

        it('marks the row Failed when verification rejects the bundle', async () => {
            const store = createFakeStore();
            const intake = DiagnosticIntakeService.Instance;
            intake.Configure({ contextUser: systemUser, provider: store.Provider });
            const fixture = await encryptBundle(collectorKey);
            const completed = await runInProcessIntake(intake, fixture, collectorKey, { plaintextSha256: '0'.repeat(64) });
            expect(completed.status).toBe('rejected');
            const rows = store.Rows('MJ: Diagnostic Bundles');
            expect(rows).toHaveLength(1);
            expect(rows[0].Status).toBe('Failed');
            expect(rows[0].Direction).toBe('Received');
        });
    });

    describe('Diagnostics.Intake.DecryptOnIngest = false', () => {
        it('stores the encrypted payload without decrypting and leaves manifest and findings empty', async () => {
            const store = createFakeStore();
            const verified = new Map<string, Uint8Array>();
            const intake = DiagnosticIntakeService.Instance;
            intake.Configure({
                decryptOnIngest: false,
                contextUser: systemUser,
                provider: store.Provider,
                storageBridge: {
                    WriteQuarantineObject: async (ref) => `quarantine/${ref}`,
                    PromoteToVerifiedStorage: async (ref, _q, bytes) => { verified.set(ref, bytes); return `verified/${ref}`; },
                    DeleteQuarantineObject: async () => undefined,
                },
            });
            const fixture = await encryptBundle(collectorKey);
            const completed = await runInProcessIntake(intake, fixture, collectorKey);
            expect(completed.status).toBe('received');
            const record = intake.GetReceivedBundle(completed.referenceId);
            expect(record?.decryptedZipBytes).toBeUndefined();
            expect(record?.parsedBundleData).toBeUndefined();
            expect(Buffer.from(verified.get(completed.referenceId)!).equals(Buffer.from(fixture.Encrypted))).toBe(true);
            const row = store.Rows('MJ: Diagnostic Bundles')[0];
            expect(row.Status).toBe('Ready');
            expect(row.ManifestJSON ?? null).toBeNull();
            expect(row.FindingsJSON ?? null).toBeNull();
        });
    });

    describe('OnBundleReceived hook errors', () => {
        it('logs a hook that throws and still returns received to the sender', async () => {
            const intake = DiagnosticIntakeService.Instance;
            intake.Configure({
                onBundleReceivedHook: () => { throw new Error('hook exploded'); },
            });
            const fixture = await encryptBundle(collectorKey);
            const completed = await runInProcessIntake(intake, fixture, collectorKey);
            expect(completed.status).toBe('received');
            await new Promise((resolve) => setImmediate(resolve));
            const logged = vi.mocked(LogError).mock.calls.flat().map(String).join('\n');
            expect(logged).toContain('hook exploded');
        });
    });

    describe('intake key custody', () => {
        it('leaves intake disabled when the credential public key does not match its private key', async () => {
            const other = await GenerateDiagnosticKeyPair('X25519', 'collector-key-1');
            mockInstanceSettings({
                'Diagnostics.Intake.Enabled': 'true',
                'Diagnostics.Intake.KeyPairCredentialID': 'CRED-0001',
            });
            vi.spyOn(CredentialEngine.Instance, 'Config').mockResolvedValue(undefined);
            const resolved: ResolvedCredential = {
                credential: null,
                values: { keyId: collectorKey.keyId, publicKey: other.publicKeyBase64, privateKey: collectorKey.privateKeyBase64 },
                source: 'database',
                expirationStatus: 'valid',
            };
            vi.spyOn(CredentialEngine.Instance, 'GetCredential').mockResolvedValue(resolved);
            DiagnosticIntakeService.Instance.ResetForTests();
            await ConfigureIntakeFromSettings(DiagnosticsSettings.Current(), systemUser);
            expect(DiagnosticIntakeService.Instance.Enabled).toBe(false);
        });
    });

    describe('signed requests', () => {
        let sender: SenderKeys;
        let fixture: EncryptedFixture;

        beforeEach(async () => {
            sender = await newSender();
            DiagnosticIntakeService.Instance.RegisterSenderPublicKey(sender.InstallID, sender.Key.keyId, sender.Key.publicKeyBase64);
            fixture = await encryptBundle(collectorKey, { KeyID: sender.Key.keyId, PrivateKeyBase64: sender.Key.privateKeyBase64 });
        });

        it('accepts a valid assertion from a registered sender', async () => {
            const res = await postCreate(handlers, sender, createBody(fixture, collectorKey));
            expect(res.StatusCode).toBe(201);
            expect(res.Body?.referenceId).toEqual(expect.stringContaining('diagref_'));
            expect(res.Body?.uploadUrl).toBe(`${AUD}/bundles/${String(res.Body?.referenceId)}/payload`);
        });

        it('rejects a request with no Authorization header', async () => {
            const body = createBody(fixture, collectorKey);
            const res = await callRoute(handlers, 'POST', BUNDLES_PATH, BUNDLES_PATH, { headers: {}, body });
            expect(res.StatusCode).toBe(401);
        });

        it('rejects an unknown install', async () => {
            const stranger = await newSender(OTHER_INSTALL_ID);
            const res = await postCreate(handlers, stranger, createBody(fixture, collectorKey, OTHER_INSTALL_ID));
            expect(res.StatusCode).toBe(401);
        });

        it('rejects a bad signature', async () => {
            const impostor = await GenerateDiagnosticKeyPair('Ed25519', sender.Key.keyId);
            const res = await postCreate(handlers, sender, createBody(fixture, collectorKey), { Key: impostor });
            expect(res.StatusCode).toBe(401);
        });

        it('rejects an assertion older than the clock-skew window', async () => {
            const res = await postCreate(handlers, sender, createBody(fixture, collectorKey), { Now: new Date(Date.now() - 301_000) });
            expect(res.StatusCode).toBe(401);
        });

        it('rejects an assertion made for another collector', async () => {
            const res = await postCreate(handlers, sender, createBody(fixture, collectorKey), { Audience: 'https://other.test/api/diagnostics/intake/v1' });
            expect(res.StatusCode).toBe(401);
        });

        it('rejects a body that does not match the signed hash', async () => {
            const res = await postCreate(handlers, sender, createBody(fixture, collectorKey), { SignedBody: '{"other":true}' });
            expect(res.StatusCode).toBe(401);
        });

        it('rejects a replayed nonce', async () => {
            const body = createBody(fixture, collectorKey);
            const headers = await signedHeaders(sender, 'POST', BUNDLES_PATH, body);
            const first = await callRoute(handlers, 'POST', BUNDLES_PATH, BUNDLES_PATH, { headers, body });
            const second = await callRoute(handlers, 'POST', BUNDLES_PATH, BUNDLES_PATH, { headers, body });
            expect(first.StatusCode).toBe(201);
            expect(second.StatusCode).toBe(401);
        });

        it('rejects a body whose installId differs from the authenticated install', async () => {
            const res = await postCreate(handlers, sender, createBody(fixture, collectorKey, OTHER_INSTALL_ID));
            expect(res.StatusCode).toBe(400);
        });

        it('runs the whole signed flow and binds the envelope sender key', async () => {
            const created = await postCreate(handlers, sender, createBody(fixture, collectorKey));
            const referenceId = String(created.Body?.referenceId);
            expect((await putPayload(handlers, sender, referenceId, fixture.Encrypted)).StatusCode).toBe(200);
            const completed = await postComplete(handlers, sender, referenceId, fixture);
            expect(completed.StatusCode).toBe(200);
            expect(completed.Body?.status).toBe('received');
        });

        it('rejects payload and complete from a different install with 403', async () => {
            const other = await newSender(OTHER_INSTALL_ID, 'sender-key-2');
            DiagnosticIntakeService.Instance.RegisterSenderPublicKey(other.InstallID, other.Key.keyId, other.Key.publicKeyBase64);
            const created = await postCreate(handlers, sender, createBody(fixture, collectorKey));
            const referenceId = String(created.Body?.referenceId);
            expect((await putPayload(handlers, other, referenceId, fixture.Encrypted)).StatusCode).toBe(403);
            expect((await putPayload(handlers, sender, referenceId, fixture.Encrypted)).StatusCode).toBe(200);
            expect((await postComplete(handlers, other, referenceId, fixture)).StatusCode).toBe(403);
        });

        it('rejects an envelope signed with a key other than the authenticated key', async () => {
            const otherKey = await GenerateDiagnosticKeyPair('Ed25519', 'sender-key-other');
            const mismatched = await encryptBundle(collectorKey, { KeyID: otherKey.keyId, PrivateKeyBase64: otherKey.privateKeyBase64 });
            const created = await postCreate(handlers, sender, createBody(mismatched, collectorKey));
            const referenceId = String(created.Body?.referenceId);
            expect((await putPayload(handlers, sender, referenceId, mismatched.Encrypted)).StatusCode).toBe(200);
            const completed = await postComplete(handlers, sender, referenceId, mismatched);
            expect(completed.StatusCode).toBe(422);
            expect(completed.Body?.status).toBe('rejected');
        });
    });

    describe('database registrations', () => {
        let store: FakeStore;
        let sender: SenderKeys;
        let fixture: EncryptedFixture;

        beforeEach(async () => {
            store = createFakeStore();
            DiagnosticIntakeService.Instance.Configure({ contextUser: systemUser, provider: store.Provider });
            sender = await newSender();
            fixture = await encryptBundle(collectorKey, { KeyID: sender.Key.keyId, PrivateKeyBase64: sender.Key.privateKeyBase64 });
        });

        it('accepts an Active registration and updates LastSeenAt on complete', async () => {
            const id = seedRegistration(store, sender);
            const created = await postCreate(handlers, sender, createBody(fixture, collectorKey));
            expect(created.StatusCode).toBe(201);
            const referenceId = String(created.Body?.referenceId);
            await putPayload(handlers, sender, referenceId, fixture.Encrypted);
            const completed = await postComplete(handlers, sender, referenceId, fixture);
            expect(completed.StatusCode).toBe(200);
            expect(store.Tables.get(REGISTRATION_ENTITY)?.get(id)?.LastSeenAt).toBeInstanceOf(Date);
            expect(store.Rows('MJ: Diagnostic Bundles')[0].SenderInstallID).toBe(INSTALL_ID);
        });

        it('rejects a revoked install', async () => {
            seedRegistration(store, sender, { Status: 'Revoked', RevokedAt: new Date() });
            const res = await postCreate(handlers, sender, createBody(fixture, collectorKey));
            expect(res.StatusCode).toBe(401);
        });

        it('rejects a keyId that is not the registered key', async () => {
            seedRegistration(store, sender, { KeyID: 'rotated-key' });
            const res = await postCreate(handlers, sender, createBody(fixture, collectorKey));
            expect(res.StatusCode).toBe(401);
        });

        it('rejects a create request when the daily quota is used up', async () => {
            seedRegistration(store, sender, { MaxBundlesPerDay: 2 });
            store.ReceivedCountOverride = 2;
            const res = await postCreate(handlers, sender, createBody(fixture, collectorKey));
            expect(res.StatusCode).toBe(429);
        });
    });

    describe('enrolment', () => {
        let store: FakeStore;
        let signingKey: DiagnosticKeyPair;

        beforeEach(async () => {
            store = createFakeStore();
            signingKey = await GenerateDiagnosticKeyPair('Ed25519', 'collector-signing-1');
            const intake = DiagnosticIntakeService.Instance;
            intake.Configure({ contextUser: systemUser, provider: store.Provider });
            intake.RegisterSigningKeyPair(signingKey);
        });

        function seedPending(sender: SenderKeys, code: string, expiresAt: Date): string {
            return seedRegistration(store, sender, {
                Status: 'Pending',
                KeyID: null,
                PublicKeyBase64: null,
                RegistrationCodeHash: crypto.createHash('sha256').update(code).digest('hex'),
                RegistrationCodeExpiresAt: expiresAt,
            });
        }

        async function enrol(sender: SenderKeys, code: string, proofCode = code): Promise<FakeResponse> {
            const proof = await SignEnrolProof({
                InstallID: sender.InstallID,
                KeyID: sender.Key.keyId,
                RegistrationCode: proofCode,
                Audience: AUD,
                PrivateKeyBase64: sender.Key.privateKeyBase64,
            });
            const body = JSON.stringify({
                installId: sender.InstallID,
                registrationCode: code,
                keyId: sender.Key.keyId,
                publicKeyBase64: sender.Key.publicKeyBase64,
                proof,
            });
            return callRoute(handlers, 'POST', ENROLL_PATH, ENROLL_PATH, { headers: { 'content-type': 'application/json' }, body });
        }

        it('activates a pending registration and returns the collector keys', async () => {
            const sender = await newSender();
            const id = seedPending(sender, 'CODE-123', new Date(Date.now() + 60_000));
            const res = await enrol(sender, 'CODE-123');
            expect(res.StatusCode).toBe(200);
            expect(res.Body?.installId).toBe(INSTALL_ID);
            expect(res.Body?.keyId).toBe(sender.Key.keyId);
            expect(res.Body?.collectorSigningPublicKeyBase64).toBe(signingKey.publicKeyBase64);
            expect(res.Body?.collectorPublicKeyBase64).toBe(collectorKey.publicKeyBase64);
            const row = store.Tables.get(REGISTRATION_ENTITY)?.get(id);
            expect(row?.Status).toBe('Active');
            expect(row?.KeyID).toBe(sender.Key.keyId);
            expect(row?.PublicKeyBase64).toBe(sender.Key.publicKeyBase64);
            expect(row?.RegistrationCodeHash).toBeNull();
            expect(row?.RegistrationCodeExpiresAt).toBeNull();
            expect(row?.EnrolledAt).toBeInstanceOf(Date);

            const descriptor = await DiagnosticIntakeService.Instance.GetPublicKeyDescriptor();
            expect(await VerifyRecipientPublicKeySignature(descriptor.keyId, descriptor.publicKey, descriptor.signature ?? '', signingKey.publicKeyBase64)).toBe(true);

            const created = await postCreate(handlers, sender, createBody(await encryptBundle(collectorKey), collectorKey));
            expect(created.StatusCode).toBe(201);
        });

        it('rejects a wrong registration code', async () => {
            const sender = await newSender();
            const id = seedPending(sender, 'CODE-123', new Date(Date.now() + 60_000));
            const res = await enrol(sender, 'CODE-999');
            expect(res.StatusCode).toBe(401);
            expect(store.Tables.get(REGISTRATION_ENTITY)?.get(id)?.Status).toBe('Pending');
        });

        it('rejects an expired registration code', async () => {
            const sender = await newSender();
            seedPending(sender, 'CODE-123', new Date(Date.now() - 1_000));
            const res = await enrol(sender, 'CODE-123');
            expect(res.StatusCode).toBe(401);
        });

        it('rejects a proof that was not made with the enrolled key', async () => {
            const sender = await newSender();
            seedPending(sender, 'CODE-123', new Date(Date.now() + 60_000));
            const res = await enrol(sender, 'CODE-123', 'CODE-OTHER');
            expect(res.StatusCode).toBe(401);
        });
    });

    describe('fix round 1: reading and limits', () => {
        let sender: SenderKeys;
        let fixture: EncryptedFixture;

        beforeEach(async () => {
            sender = await newSender();
            DiagnosticIntakeService.Instance.RegisterSenderPublicKey(sender.InstallID, sender.Key.keyId, sender.Key.publicKeyBase64);
            fixture = await encryptBundle(collectorKey, { KeyID: sender.Key.keyId, PrivateKeyBase64: sender.Key.privateKeyBase64 });
        });

        it('rejects an unsigned payload upload before reading its body', async () => {
            const path = `${BUNDLES_PATH}/diagref_x/payload`;
            const res = await callRoute(handlers, 'PUT', PAYLOAD_ROUTE, path, {
                headers: {}, body: new Uint8Array(1024 * 1024), params: { referenceId: 'diagref_x' },
            });
            expect(res.StatusCode).toBe(401);
            expect(res.Request?.listenerCount('data')).toBe(0);
        });

        it('refuses a payload larger than the declared size', async () => {
            const created = await postCreate(handlers, sender, createBody(fixture, collectorKey));
            const referenceId = String(created.Body?.referenceId);
            const oversized = new Uint8Array(fixture.Encrypted.byteLength + 10);
            oversized.set(fixture.Encrypted);
            const res = await putPayload(handlers, sender, referenceId, oversized);
            expect(res.StatusCode).toBe(413);
        });

        it('limits failed attempts per IP but still accepts a signed request from that IP', async () => {
            const body = createBody(fixture, collectorKey);
            const statuses: number[] = [];
            for (let i = 0; i < 61; i++) {
                statuses.push((await callRoute(handlers, 'POST', BUNDLES_PATH, BUNDLES_PATH, { headers: {}, body })).StatusCode);
            }
            expect(statuses.slice(0, 60).every((code) => code === 401)).toBe(true);
            expect(statuses[60]).toBe(429);
            const signed = await postCreate(handlers, sender, body);
            expect(signed.StatusCode).toBe(201);
        });

        it('never IP-limits signed requests', async () => {
            const senders: SenderKeys[] = [];
            for (let i = 0; i < 4; i++) {
                const extra = await newSender(crypto.randomUUID().toUpperCase(), `sender-key-${i}`);
                DiagnosticIntakeService.Instance.RegisterSenderPublicKey(extra.InstallID, extra.Key.keyId, extra.Key.publicKeyBase64);
                senders.push(extra);
            }
            const statuses: number[] = [];
            for (let i = 0; i < 40; i++) {
                const who = senders[i % senders.length];
                statuses.push((await postCreate(handlers, who, createBody(fixture, collectorKey, who.InstallID))).StatusCode);
            }
            expect(statuses.filter((code) => code !== 201)).toEqual([]);
        });

        it('rejects a create request with an over-long mjVersion', async () => {
            const body = JSON.stringify({ ...JSON.parse(createBody(fixture, collectorKey)), mjVersion: 'x'.repeat(51) });
            const res = await postCreate(handlers, sender, body);
            expect(res.StatusCode).toBe(400);
        });
    });

    describe('fix round 1: quota, keys and decrypt mode', () => {
        let store: FakeStore;
        let sender: SenderKeys;
        let fixture: EncryptedFixture;

        beforeEach(async () => {
            store = createFakeStore();
            DiagnosticIntakeService.Instance.Configure({ contextUser: systemUser, provider: store.Provider });
            sender = await newSender();
            fixture = await encryptBundle(collectorKey, { KeyID: sender.Key.keyId, PrivateKeyBase64: sender.Key.privateKeyBase64 });
        });

        it('re-checks the daily quota at upload', async () => {
            seedRegistration(store, sender, { MaxBundlesPerDay: 1 });
            store.ReceivedCountOverride = 0;
            const created = await postCreate(handlers, sender, createBody(fixture, collectorKey));
            expect(created.StatusCode).toBe(201);
            store.ReceivedCountOverride = 1;
            const res = await putPayload(handlers, sender, String(created.Body?.referenceId), fixture.Encrypted);
            expect(res.StatusCode).toBe(429);
        });

        it('rejects an Active registration that has no key', async () => {
            seedRegistration(store, sender, { KeyID: null, PublicKeyBase64: null });
            const res = await postCreate(handlers, sender, createBody(fixture, collectorKey));
            expect(res.StatusCode).toBe(401);
        });

        it('binds the envelope sender key when DecryptOnIngest is false', async () => {
            seedRegistration(store, sender);
            DiagnosticIntakeService.Instance.Configure({ decryptOnIngest: false });
            const created = await postCreate(handlers, sender, createBody(fixture, collectorKey));
            const referenceId = String(created.Body?.referenceId);
            await putPayload(handlers, sender, referenceId, fixture.Encrypted);
            expect((await postComplete(handlers, sender, referenceId, fixture)).StatusCode).toBe(200);

            const otherKey = await GenerateDiagnosticKeyPair('Ed25519', sender.Key.keyId);
            const forged = await encryptBundle(collectorKey, { KeyID: sender.Key.keyId, PrivateKeyBase64: otherKey.privateKeyBase64 });
            const created2 = await postCreate(handlers, sender, createBody(forged, collectorKey));
            const ref2 = String(created2.Body?.referenceId);
            await putPayload(handlers, sender, ref2, forged.Encrypted);
            const rejected = await postComplete(handlers, sender, ref2, forged);
            expect(rejected.StatusCode).toBe(422);
            expect(rejected.Body?.reasonCode).toBe('INVALID_SENDER_SIGNATURE');
        });

        it('serves no public key without a signing key, and startup without one leaves intake disabled', async () => {
            const res = await callRoute(handlers, 'GET', '/api/diagnostics/intake/v1/public-key', '/api/diagnostics/intake/v1/public-key');
            expect(res.StatusCode).toBe(503);

            mockInstanceSettings({ 'Diagnostics.Intake.Enabled': 'true', 'Diagnostics.Intake.KeyPairCredentialID': 'CRED-0001' });
            vi.spyOn(CredentialEngine.Instance, 'Config').mockResolvedValue(undefined);
            const resolved: ResolvedCredential = {
                credential: null,
                values: { keyId: collectorKey.keyId, publicKey: collectorKey.publicKeyBase64, privateKey: collectorKey.privateKeyBase64 },
                source: 'database',
                expirationStatus: 'valid',
            };
            vi.spyOn(CredentialEngine.Instance, 'GetCredential').mockResolvedValue(resolved);
            DiagnosticIntakeService.Instance.ResetForTests();
            await ConfigureIntakeFromSettings(DiagnosticsSettings.Current(), systemUser);
            expect(DiagnosticIntakeService.Instance.Enabled).toBe(false);
        });
    });

    describe('fix round 2: rate counters', () => {
        it('stays bounded after many distinct keys', () => {
            const counter = new RateCounter(60_000, 5, 100);
            for (let i = 0; i < 1_000; i++) counter.Hit(`ip:2001:db8::${i}`);
            expect(counter.Size).toBeLessThanOrEqual(100);
        });

        it('drops expired windows when it sweeps', () => {
            const counter = new RateCounter(1_000, 5, 100);
            for (let i = 0; i < 50; i++) counter.Hit(`ip:${i}`, 0);
            counter.Sweep(5_000);
            expect(counter.Size).toBe(0);
        });
    });
});
