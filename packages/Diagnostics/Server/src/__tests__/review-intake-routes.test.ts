import * as crypto from 'node:crypto';
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
const REGISTRATION_ENTITY = 'MJ: Diagnostic Sender Registrations';
const INSTALL_ID = '6B1D7C70-2C1E-4A55-9C1E-7D2E0B9A1F01';

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
    public ip = '203.0.113.7';
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

async function signedHeaders(installId: string, key: DiagnosticKeyPair, body: string): Promise<Record<string, string>> {
    const signed = await SignSenderRequest({
        Method: 'POST',
        Path: BUNDLES_PATH,
        Audience: AUD,
        InstallID: installId,
        KeyID: key.keyId,
        PrivateKeyBase64: key.privateKeyBase64,
        Body: body,
    });
    return { authorization: signed.AuthorizationHeader, 'content-type': 'application/json' };
}

function createBody(installId: string, collectorKeyId: string): string {
    return JSON.stringify({
        installId,
        bundleId: `bundle-${crypto.randomUUID()}`,
        formatVersion: 1,
        mjVersion: '6.2.0',
        scrubLiterals: true,
        sizeBytes: 1000,
        plaintextSha256: 'a'.repeat(64),
        encryptedSha256: 'b'.repeat(64),
        keyId: collectorKeyId,
    });
}

type Row = Record<string, string | number | null>;

interface FakeData {
    Provider: IMetadataProvider;
    Registrations: Row[];
    RegistrationQueries: () => number;
}

/** Serves registration rows from memory and answers bundle counts with 0 after `countDelayMs`. */
function createFakeData(countDelayMs = 0): FakeData {
    const registrations: Row[] = [];
    let registrationQueries = 0;
    const fakeRunView = {
        RunView: async (params: { EntityName: string; ExtraFilter?: string; ResultType?: string }) => {
            if (params.ResultType === 'count_only') {
                await new Promise((resolve) => setTimeout(resolve, countDelayMs));
                return { Success: true, Results: [], TotalRowCount: 0, ErrorMessage: '' };
            }
            if (params.EntityName === REGISTRATION_ENTITY) registrationQueries++;
            const installId = /InstallID = '([^']*)'/.exec(params.ExtraFilter ?? '')?.[1]?.toLowerCase();
            const rows = registrations.filter((row) => String(row.InstallID).toLowerCase() === installId);
            return { Success: true, Results: rows, TotalRowCount: rows.length, ErrorMessage: '' };
        },
    };
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as unknown as RunView);
    return {
        Provider: { GetEntityObject: async () => ({}) } as unknown as IMetadataProvider,
        Registrations: registrations,
        RegistrationQueries: () => registrationQueries,
    };
}

describe('diagnostics intake routes (review fixes)', () => {
    let collectorKey: DiagnosticKeyPair;
    let handlers: Map<string, RouteHandler>;

    beforeEach(async () => {
        SetDiagnosticsApiRoute(apiRoute);
        collectorKey = await GenerateDiagnosticKeyPair('X25519', 'collector-key-1');
        const intake = DiagnosticIntakeService.Instance;
        intake.ResetForTests();
        intake.RegisterKeyPair(collectorKey);
        intake.Configure({ enabled: true });
        handlers = registerRoutes();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('per-IP failure limit', () => {
        it('runs the sender query once for 200 forged requests that name one unknown install', async () => {
            const data = createFakeData();
            DiagnosticIntakeService.Instance.Configure({ contextUser: systemUser, provider: data.Provider });
            const forger = await GenerateDiagnosticKeyPair('Ed25519', 'forged-key');
            const body = createBody(INSTALL_ID, collectorKey.keyId);

            const statuses: number[] = [];
            for (let i = 0; i < 200; i++) {
                statuses.push((await postBundles(handlers, await signedHeaders(INSTALL_ID, forger, body), body)).StatusCode);
            }

            expect(statuses.every((code) => code === 401 || code === 429)).toBe(true);
            expect(data.RegistrationQueries()).toBe(1);
        });

        it('stops running the sender query once the IP is over its failure budget', async () => {
            const data = createFakeData();
            DiagnosticIntakeService.Instance.Configure({ contextUser: systemUser, provider: data.Provider });
            const forger = await GenerateDiagnosticKeyPair('Ed25519', 'forged-key');

            const statuses: number[] = [];
            for (let i = 0; i < 200; i++) {
                const installId = crypto.randomUUID().toUpperCase();
                const body = createBody(installId, collectorKey.keyId);
                statuses.push((await postBundles(handlers, await signedHeaders(installId, forger, body), body)).StatusCode);
            }

            expect(statuses.slice(0, 60).every((code) => code === 401)).toBe(true);
            expect(statuses.slice(60).every((code) => code === 429)).toBe(true);
            expect(data.RegistrationQueries()).toBe(60);
        });
    });

    describe('daily quota', () => {
        it('accepts only one of five concurrent creates when MaxBundlesPerDay is 1', async () => {
            const data = createFakeData(25);
            DiagnosticIntakeService.Instance.Configure({ contextUser: systemUser, provider: data.Provider });
            const sender = await GenerateDiagnosticKeyPair('Ed25519', 'sender-key-1');
            data.Registrations.push({
                ID: crypto.randomUUID().toUpperCase(),
                InstallID: INSTALL_ID,
                Status: 'Active',
                KeyID: sender.keyId,
                PublicKeyBase64: sender.publicKeyBase64,
                MaxBundlesPerDay: 1,
            });

            const responses = await Promise.all(
                Array.from({ length: 5 }, async () => {
                    const body = createBody(INSTALL_ID, collectorKey.keyId);
                    return postBundles(handlers, await signedHeaders(INSTALL_ID, sender, body), body);
                })
            );

            const statuses = responses.map((res) => res.StatusCode).sort();
            expect(statuses).toEqual([201, 429, 429, 429, 429]);
        });
    });
});
