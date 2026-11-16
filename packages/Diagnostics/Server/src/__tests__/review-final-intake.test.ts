import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { DiagnosticKeyPair, GenerateDiagnosticKeyPair, SignSenderRequest } from '@memberjunction/diagnostics';
import { DiagnosticIntakeService } from '../intakeService.js';
import { RegisterIntakeRoutes } from '../intakeRoutes.js';
import { SetDiagnosticsApiRoute } from '../apiRoute.js';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogWarning: vi.fn() };
});

type ExpressAppParam = Parameters<typeof RegisterIntakeRoutes>[0];

const PUBLIC_BASE = 'https://collector.test/api';
const AUD = `${PUBLIC_BASE}/diagnostics/intake/v1`;
const BUNDLES_PATH = '/api/diagnostics/intake/v1/bundles';
const ENROL_PATH = '/api/diagnostics/intake/v1/enroll';
const INSTALL_ID = '6B1D7C70-2C1E-4A55-9C1E-7D2E0B9A1F02';
const DB_ERROR = 'Connection pool exhausted on sql-prod-7';

const apiRoute = (subpath: string, options?: { absolute?: boolean }): string =>
    options?.absolute ? `${PUBLIC_BASE}${subpath}` : `/api${subpath}`;

const systemUser = { ID: 'system-user', Name: 'System', IsActive: true, Type: 'Owner', UserRoles: [] } as unknown as UserInfo;

interface FakeResponse {
    StatusCode: number;
    Body: Record<string, unknown> | undefined;
    Done: Promise<void>;
    headersSent: boolean;
    status: (code: number) => FakeResponse;
    json: (body: Record<string, unknown>) => FakeResponse;
}

function createFakeResponse(): FakeResponse {
    let finish: () => void = () => undefined;
    const res: FakeResponse = {
        StatusCode: 200,
        Body: undefined,
        headersSent: false,
        Done: new Promise<void>((resolve) => { finish = resolve; }),
        status: (code) => { res.StatusCode = code; return res; },
        json: (body) => { res.Body = body; res.headersSent = true; finish(); return res; },
    };
    return res;
}

/** A request that streams its raw body on the next tick. */
class FakeRequest extends EventEmitter {
    public params: Record<string, string> = {};
    public ip = '203.0.113.9';
    public url: string;
    public destroy = (): void => undefined;

    public constructor(public method: string, public originalUrl: string, public headers: Record<string, string>, raw: Uint8Array) {
        super();
        this.url = originalUrl;
        setImmediate(() => {
            if (raw.byteLength > 0) this.emit('data', Buffer.from(raw));
            this.emit('end');
        });
    }
}

type RouteHandler = (req: FakeRequest, res: FakeResponse) => void;

function registerRoutes(): Map<string, RouteHandler> {
    const handlers = new Map<string, RouteHandler>();
    const recorder = (method: string) => (path: string, handler: RouteHandler) => { handlers.set(`${method} ${path}`, handler); };
    const app = { get: recorder('GET'), post: recorder('POST'), put: recorder('PUT') };
    RegisterIntakeRoutes(app as unknown as ExpressAppParam, apiRoute);
    return handlers;
}

async function postBundles(handlers: Map<string, RouteHandler>, headers: Record<string, string>, body: string): Promise<FakeResponse> {
    const handler = handlers.get(`POST ${BUNDLES_PATH}`);
    if (!handler) throw new Error('No create route');
    const res = createFakeResponse();
    handler(new FakeRequest('POST', BUNDLES_PATH, headers, new TextEncoder().encode(body)), res);
    await res.Done;
    return res;
}

async function postEnrol(handlers: Map<string, RouteHandler>, body: string): Promise<FakeResponse> {
    const handler = handlers.get(`POST ${ENROL_PATH}`);
    if (!handler) throw new Error('No enrol route');
    const res = createFakeResponse();
    handler(new FakeRequest('POST', ENROL_PATH, { 'content-type': 'application/json' }, new TextEncoder().encode(body)), res);
    await res.Done;
    return res;
}

async function signedHeaders(key: DiagnosticKeyPair, body: string): Promise<Record<string, string>> {
    const signed = await SignSenderRequest({
        Method: 'POST',
        Path: BUNDLES_PATH,
        Audience: AUD,
        InstallID: INSTALL_ID,
        KeyID: key.keyId,
        PrivateKeyBase64: key.privateKeyBase64,
        Body: body,
    });
    return { authorization: signed.AuthorizationHeader, 'content-type': 'application/json' };
}

/** Makes every registration lookup fail as a database fault would. */
function failRegistrationLookups(): IMetadataProvider {
    const fakeRunView = {
        RunView: async () => ({ Success: false, Results: [], TotalRowCount: 0, ErrorMessage: DB_ERROR }),
    };
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as unknown as RunView);
    return { GetEntityObject: async () => ({}) } as unknown as IMetadataProvider;
}

describe('diagnostics intake routes: failed registration lookup', () => {
    let handlers: Map<string, RouteHandler>;
    let senderKey: DiagnosticKeyPair;

    beforeEach(async () => {
        SetDiagnosticsApiRoute(apiRoute);
        const collectorKey = await GenerateDiagnosticKeyPair('X25519', 'collector-key-1');
        senderKey = await GenerateDiagnosticKeyPair('Ed25519', 'sender-key-1');
        const intake = DiagnosticIntakeService.Instance;
        intake.ResetForTests();
        intake.RegisterKeyPair(collectorKey);
        intake.RegisterSigningKeyPair(await GenerateDiagnosticKeyPair('Ed25519', 'collector-signing-1'));
        intake.Configure({ enabled: true, contextUser: systemUser, provider: failRegistrationLookups() });
        handlers = registerRoutes();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('answers 503 with a generic body and no internal detail', async () => {
        const body = JSON.stringify({ installId: INSTALL_ID });
        const res = await postBundles(handlers, await signedHeaders(senderKey, body), body);

        expect(res.StatusCode).toBe(503);
        expect(JSON.stringify(res.Body)).not.toContain(DB_ERROR);
        expect(JSON.stringify(res.Body)).not.toContain('lookup');
    });

    it('does not count the failure against the IP', async () => {
        const body = JSON.stringify({ installId: INSTALL_ID });
        const statuses: number[] = [];
        for (let i = 0; i < 80; i++) {
            statuses.push((await postBundles(handlers, await signedHeaders(senderKey, body), body)).StatusCode);
        }

        expect(statuses.every((code) => code === 503)).toBe(true);
        expect(DiagnosticIntakeService.Instance.IpFailureLimitReached('ip:203.0.113.9')).toBe(false);
    });

    it('answers 503 to an enrolment whose registration lookup fails, without counting it against the IP', async () => {
        const body = JSON.stringify({
            installId: INSTALL_ID,
            registrationCode: 'CODE-123',
            keyId: senderKey.keyId,
            publicKeyBase64: senderKey.publicKeyBase64,
            proof: 'proof',
        });
        const statuses: number[] = [];
        for (let i = 0; i < 80; i++) {
            const res = await postEnrol(handlers, body);
            expect(JSON.stringify(res.Body)).not.toContain(DB_ERROR);
            statuses.push(res.StatusCode);
        }

        expect(statuses.every((code) => code === 503)).toBe(true);
        expect(DiagnosticIntakeService.Instance.IpFailureLimitReached('ip:203.0.113.9')).toBe(false);
    });
});
