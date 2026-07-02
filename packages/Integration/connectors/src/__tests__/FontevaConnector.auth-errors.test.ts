import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FontevaConnector } from '../FontevaConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext, CreateRecordContext, GetRecordContext } from '@memberjunction/integration-engine';

// ─────────────────────────────────────────────────────────────────────────────
// Fonteva AUTH + ERROR-HANDLING no-creds unit tests.
//
// Fonteva COMPOSES on SalesforceConnector — auth (Salesforce OAuth2: JWT-Bearer /
// client-credentials → Bearer session token) and HTTP + error handling are inherited
// verbatim. These tests therefore drive the REAL inherited code paths through the
// Fonteva connector's public surface (DiscoverFields / FetchChanges / CreateRecord /
// GetRecord), spying on globalThis.fetch to:
//   • inject the no-creds fake token { access_token, instance_url, token_type, issued_at }
//   • inject canned API responses per HTTP status
//   • CAPTURE every request's url / method / headers / body (to assert Bearer header,
//     redaction, method, retry counts)
//
// Reference: fontevacontext.md §3 (auth), §7 (error codes), §10 (auth + error matrix).
// Out of scope (per task): payment-action reconciliation — that's an Action, not the
// connector. The connector never processes payments.
// ─────────────────────────────────────────────────────────────────────────────

const contextUser = {} as UserInfo;

// The no-creds secret material. These EXACT strings must never leak into logs / errors.
const CLIENT_ID = 'test-consumer-key-DO-NOT-LEAK';
const CLIENT_SECRET = 'super-secret-client-secret-DO-NOT-LEAK';
const FAKE_ACCESS_TOKEN = 'fake-salesforce-token-DO-NOT-LEAK';
const FAKE_INSTANCE_URL = 'https://example.my.salesforce.com';

/** JWT-bearer credential CompanyIntegration (default). */
function jwtCompanyIntegration(configOverrides?: Record<string, unknown>): MJCompanyIntegrationEntity {
    return {
        IntegrationID: 'fonteva-integration-id',
        Configuration: JSON.stringify({
            loginUrl: 'https://login.salesforce.com',
            clientId: CLIENT_ID,
            username: 'integration@example.com',
            privateKey: '-----BEGIN RSA PRIVATE KEY-----\nfake-key\n-----END RSA PRIVATE KEY-----',
            apiVersion: '61.0',
            ...configOverrides,
        }),
        CredentialID: null,
    } as unknown as MJCompanyIntegrationEntity;
}

/** client_credentials credential CompanyIntegration — carries the client_secret. */
function clientCredsCompanyIntegration(configOverrides?: Record<string, unknown>): MJCompanyIntegrationEntity {
    return {
        IntegrationID: 'fonteva-integration-id',
        Configuration: JSON.stringify({
            loginUrl: 'https://login.salesforce.com',
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            apiVersion: '61.0',
            ...configOverrides,
        }),
        CredentialID: null,
    } as unknown as MJCompanyIntegrationEntity;
}

/** The no-creds fake Salesforce OAuth token (fontevacontext.md §3). */
function fakeTokenResponse(instanceUrl = FAKE_INSTANCE_URL): Response {
    return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
            access_token: FAKE_ACCESS_TOKEN,
            instance_url: instanceUrl,
            token_type: 'Bearer',
            issued_at: '1780000000000',
        }),
        text: async () => '',
    } as unknown as Response;
}

/** A failed token-exchange response (non-2xx) — drives invalid_grant / invalid_client. */
function failedTokenResponse(status: number, errorBody: string): Response {
    return {
        ok: false,
        status,
        headers: new Headers(),
        json: async () => JSON.parse(errorBody) as unknown,
        text: async () => errorBody,
    } as unknown as Response;
}

function apiResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
    const h = new Headers(headers);
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: h,
        json: async () => body,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    } as unknown as Response;
}

// A describe response with the minimum SOQL audit fields, reused by FetchChanges tests.
const DESCRIBE_BODY = {
    fields: [
        { name: 'Id', label: 'Id', type: 'id', length: 18, precision: 0, scale: 0, nillable: false, createable: false, updateable: false, custom: false, calculated: false, externalId: false, defaultedOnCreate: false, defaultValue: null, inlineHelpText: null, referenceTo: [], relationshipName: null },
        { name: 'SystemModstamp', label: 'System Modstamp', type: 'datetime', length: 0, precision: 0, scale: 0, nillable: false, createable: false, updateable: false, custom: false, calculated: false, externalId: false, defaultedOnCreate: false, defaultValue: null, inlineHelpText: null, referenceTo: [], relationshipName: null },
    ],
};

/** Captured outbound request shape. */
interface Captured {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
    isToken: boolean;
}

function headerToRecord(init?: RequestInit): Record<string, string> {
    const out: Record<string, string> = {};
    const h = init?.headers;
    if (!h) return out;
    if (h instanceof Headers) {
        h.forEach((v, k) => { out[k.toLowerCase()] = v; });
    } else if (Array.isArray(h)) {
        for (const [k, v] of h) out[k.toLowerCase()] = v;
    } else {
        for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
    }
    return out;
}

describe('FontevaConnector — auth + error handling (no-creds, mocked)', () => {
    let connector: FontevaConnector;
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    let captured: Captured[];
    let consoleSink: string[];

    beforeEach(() => {
        connector = new FontevaConnector();
        captured = [];
        consoleSink = [];
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        // jwt.sign is stubbed so JWT-bearer auth doesn't need a real RSA key.
        vi.mock('jsonwebtoken', () => ({ default: { sign: () => 'mock-jwt-assertion' } }));
        // Capture all console output so we can prove secrets are never logged.
        for (const level of ['log', 'warn', 'error', 'info'] as const) {
            vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
                consoleSink.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
            });
        }
    });

    afterEach(() => { vi.restoreAllMocks(); });

    // ── helpers ──────────────────────────────────────────────────────────────

    /**
     * Routes the token exchange to a (configurable) token response and sequences the
     * remaining API responses, capturing every outbound request.
     */
    function route(opts: {
        token?: Response;
        apis: Array<{ body: unknown; status?: number; headers?: Record<string, string> }>;
    }) {
        let i = 0;
        fetchSpy.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            const isToken = url.includes('/services/oauth2/token');
            captured.push({
                url,
                method: init?.method ?? 'GET',
                headers: headerToRecord(init),
                body: init?.body,
                isToken,
            });
            if (isToken) return opts.token ?? fakeTokenResponse();
            const cfg = opts.apis[i] ?? opts.apis[opts.apis.length - 1];
            i++;
            return apiResponse(cfg.body, cfg.status ?? 200, cfg.headers);
        });
    }

    function nonTokenCalls(): Captured[] { return captured.filter(c => !c.isToken); }
    function tokenCalls(): Captured[] { return captured.filter(c => c.isToken); }
    function allText(): string { return [...consoleSink].join('\n'); }

    // A GetRecord context against the Assignment IO (resolves to itself in unit env —
    // engine cache unseeded, so ResolveBackingSObject passes the name through).
    function getCtx(objectName = 'OrderApi__Assignment__c', externalID = 'a01000000000001'): GetRecordContext {
        return { CompanyIntegration: jwtCompanyIntegration(), ObjectName: objectName, ExternalID: externalID, ContextUser: contextUser };
    }
    function fetchCtx(ci = jwtCompanyIntegration()): FetchContext {
        return { CompanyIntegration: ci, ObjectName: 'OrderApi__Assignment__c', WatermarkValue: null, BatchSize: 200, ContextUser: contextUser };
    }

    // ───────────────────────────────────────────────────────────────────────────
    // 1. AUTH (fontevacontext.md §3 / §10)
    // ───────────────────────────────────────────────────────────────────────────

    describe('Auth — token retrieval + Bearer header', () => {
        it('exchanges for the fake token and sets Authorization: Bearer <token> on the API request', async () => {
            route({ apis: [{ body: { Id: 'a01000000000001', Name: 'X', attributes: { type: 'OrderApi__Assignment__c' } } }] });

            const record = await connector.GetRecord(getCtx());

            expect(record).not.toBeNull();
            // Exactly one token exchange happened, and it was a POST to the SF token endpoint.
            const tokens = tokenCalls();
            expect(tokens.length).toBe(1);
            expect(tokens[0].method).toBe('POST');
            expect(tokens[0].url).toContain('/services/oauth2/token');
            // The subsequent API call carries the Bearer header built from the fake token.
            const api = nonTokenCalls();
            expect(api.length).toBe(1);
            expect(api[0].headers['authorization']).toBe(`Bearer ${FAKE_ACCESS_TOKEN}`);
            expect(api[0].headers['accept']).toBe('application/json');
            // And it targets the authenticated instance_url returned by the token response.
            expect(api[0].url.startsWith(FAKE_INSTANCE_URL)).toBe(true);
        });

        it('JWT-bearer uses the urn:...:jwt-bearer grant; instance_url drives the API origin', async () => {
            route({ apis: [{ body: { Id: 'a1', attributes: { type: 'OrderApi__Assignment__c' } } }] });
            await connector.GetRecord(getCtx());

            const tokenBody = String(tokenCalls()[0].body);
            expect(tokenBody).toContain('grant_type=');
            expect(decodeURIComponent(tokenBody)).toContain('urn:ietf:params:oauth:grant-type:jwt-bearer');
            expect(decodeURIComponent(tokenBody)).toContain('assertion=');
        });

        it('client_credentials flow posts grant_type=client_credentials with the client id', async () => {
            route({ apis: [{ body: { Id: 'a1', attributes: { type: 'OrderApi__Assignment__c' } } }] });
            const ctx = getCtx();
            ctx.CompanyIntegration = clientCredsCompanyIntegration();

            await connector.GetRecord(ctx);

            const tokenBody = String(tokenCalls()[0].body);
            expect(tokenBody).toContain('grant_type=client_credentials');
            expect(tokenBody).toContain(`client_id=${encodeURIComponent(CLIENT_ID)}`);
        });
    });

    describe('Auth — token caching', () => {
        it('reuses the cached token on a second operation — no second token exchange', async () => {
            route({ apis: [
                { body: { Id: 'a1', attributes: { type: 'OrderApi__Assignment__c' } } },
                { body: { Id: 'a2', attributes: { type: 'OrderApi__Assignment__c' } } },
            ] });

            await connector.GetRecord(getCtx('OrderApi__Assignment__c', 'a1'));
            await connector.GetRecord(getCtx('OrderApi__Assignment__c', 'a2'));

            // Two API calls, but only ONE token exchange (the second reused the cache).
            expect(nonTokenCalls().length).toBe(2);
            expect(tokenCalls().length).toBe(1);
        });
    });

    describe('Auth — expired token → re-auth (cache cleared on 401, refreshed next op)', () => {
        it('on a 401 the connector clears the cached token so the NEXT operation re-authenticates', async () => {
            // Op1: 401 on the API call → connector clears cachedAuth. Op2: succeeds and must re-auth.
            let apiCall = 0;
            fetchSpy.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
                const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
                const isToken = url.includes('/services/oauth2/token');
                captured.push({ url, method: init?.method ?? 'GET', headers: headerToRecord(init), body: init?.body, isToken });
                if (isToken) return fakeTokenResponse();
                apiCall++;
                if (apiCall === 1) return apiResponse([{ errorCode: 'INVALID_SESSION_ID', message: 'Session expired or invalid' }], 401);
                return apiResponse({ Id: 'a2', attributes: { type: 'OrderApi__Assignment__c' } }, 200);
            });

            // Op1 — the 401 surfaces (GetRecord doesn't 404-suppress a 401), and clears the cache.
            await connector.GetRecord(getCtx('OrderApi__Assignment__c', 'a1')).catch(() => undefined);
            const tokensAfterOp1 = tokenCalls().length;

            // Op2 — because the cache was cleared by the 401, a SECOND token exchange happens.
            const r2 = await connector.GetRecord(getCtx('OrderApi__Assignment__c', 'a2'));
            expect(r2).not.toBeNull();
            expect(tokenCalls().length).toBe(tokensAfterOp1 + 1);
        });
    });

    describe('Auth — invalid_grant / invalid_client fail clearly, no infinite retry', () => {
        it('invalid_grant during token exchange throws once with the HTTP status, never loops', async () => {
            route({
                token: failedTokenResponse(400, JSON.stringify({ error: 'invalid_grant', error_description: 'authentication failure' })),
                apis: [{ body: {} }],
            });

            await expect(connector.GetRecord(getCtx())).rejects.toThrow(/HTTP 400/);
            // EXACTLY one token-exchange attempt — token-exchange failure is not retried.
            expect(tokenCalls().length).toBe(1);
            // No API call was ever made (auth never succeeded).
            expect(nonTokenCalls().length).toBe(0);
        });

        it('invalid_client during token exchange throws once, no API call, no retry storm', async () => {
            route({
                token: failedTokenResponse(401, JSON.stringify({ error: 'invalid_client', error_description: 'invalid client credentials' })),
                apis: [{ body: {} }],
            });
            const ctx = getCtx();
            ctx.CompanyIntegration = clientCredsCompanyIntegration();

            await expect(connector.GetRecord(ctx)).rejects.toThrow(/HTTP 401/);
            expect(tokenCalls().length).toBe(1);
            expect(nonTokenCalls().length).toBe(0);
        });
    });

    describe('Auth — wrong login host / wrong instance_url surfaced', () => {
        it('a wrong login host (token endpoint unreachable) surfaces the network error, not a silent success', async () => {
            fetchSpy.mockImplementation(async (input: string | URL | Request) => {
                const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
                if (url.includes('/services/oauth2/token')) throw new Error('getaddrinfo ENOTFOUND wrong-login-host');
                return apiResponse({}, 200);
            });

            await expect(connector.GetRecord(getCtx())).rejects.toThrow(/ENOTFOUND|wrong-login-host/);
        });

        it('the API origin is taken from the token response instance_url (a wrong instance_url is surfaced as the request host)', async () => {
            const wrongInstance = 'https://wrong-instance.my.salesforce.com';
            route({ token: fakeTokenResponse(wrongInstance), apis: [{ body: { Id: 'a1', attributes: { type: 'OrderApi__Assignment__c' } } }] });

            await connector.GetRecord(getCtx());
            // The connector routes the request to whatever instance_url the token returned —
            // so a mis-issued instance_url is observable on the wire (not silently corrected).
            expect(nonTokenCalls()[0].url.startsWith(wrongInstance)).toBe(true);
        });
    });

    describe('Auth — secret redaction', () => {
        it('never logs the Authorization header, access token, client id or client secret (success path)', async () => {
            route({ apis: [{ body: { Id: 'a1', attributes: { type: 'OrderApi__Assignment__c' } } }] });
            const ctx = getCtx();
            ctx.CompanyIntegration = clientCredsCompanyIntegration();

            await connector.GetRecord(ctx);

            const logs = allText();
            expect(logs).not.toContain(FAKE_ACCESS_TOKEN);
            expect(logs).not.toContain(CLIENT_SECRET);
            expect(logs).not.toContain(CLIENT_ID);
            expect(logs).not.toMatch(/Bearer\s+fake-salesforce-token/);
        });

        it('never leaks the access token or client secret into a thrown error message (failure path)', async () => {
            // The API errors; the FDService path throws an Error whose message previews the body.
            route({ apis: [{ body: { errors: ['boom'] }, status: 500 }] });
            const ci = clientCredsCompanyIntegration({ UseFDServiceForRead: true });

            let thrown = '';
            try {
                await connector.FetchChanges(fetchCtx(ci));
            } catch (e) {
                thrown = e instanceof Error ? e.message : String(e);
            }
            expect(thrown).not.toBe('');
            expect(thrown).not.toContain(FAKE_ACCESS_TOKEN);
            expect(thrown).not.toContain(CLIENT_SECRET);
            expect(thrown).not.toContain(CLIENT_ID);
            // And the client_secret never appears in any captured console output either.
            expect(allText()).not.toContain(CLIENT_SECRET);
        });
    });

    // ───────────────────────────────────────────────────────────────────────────
    // 2. ERROR HANDLING (fontevacontext.md §7 / §10)
    //
    // The inherited base classifies status codes in MakeHTTPRequest, then read paths
    // run ValidateResponse (throws on non-2xx) and write paths run BuildCRUDError
    // (returns Success:false + StatusCode). Each test asserts the ACTUAL behavior —
    // gaps vs the spec are documented in the suite's final report, not faked.
    // ───────────────────────────────────────────────────────────────────────────

    describe('400 — bad request fails fast with a sanitized payload', () => {
        it('a 400 invalid-field on a write returns Success=false, StatusCode 400, no token/secret leak', async () => {
            route({ apis: [{ body: [{ errorCode: 'INVALID_FIELD', message: "No such column 'Bogus__c' on entity" }], status: 400 }] });

            const ctx: CreateRecordContext = {
                CompanyIntegration: clientCredsCompanyIntegration(),
                ObjectName: 'OrderApi__Assignment__c',
                Attributes: { Bogus__c: 1 },
                ContextUser: contextUser,
            };
            const result = await connector.CreateRecord(ctx);

            expect(result.Success).toBe(false);
            expect(result.StatusCode).toBe(400);
            expect(result.ErrorMessage).toContain('INVALID_FIELD');
            // Sanitized: the error carries the SF errorCode/message, never the credentials.
            expect(result.ErrorMessage ?? '').not.toContain(FAKE_ACCESS_TOKEN);
            expect(result.ErrorMessage ?? '').not.toContain(CLIENT_SECRET);
        });

        it('a 400 invalid-JSON on a read throws (fail fast), single attempt — no retry storm on 400', async () => {
            route({ apis: [{ body: [{ errorCode: 'JSON_PARSER_ERROR', message: 'Unexpected character' }], status: 400 }] });

            await expect(connector.GetRecord(getCtx())).rejects.toThrow(/HTTP 400/);
            // 400 (non-lock-row) is not retried: exactly one API call.
            expect(nonTokenCalls().length).toBe(1);
        });
    });

    describe('401 — expired token clears cache (refresh-then-retry on next op)', () => {
        it('a 401 on a read is surfaced (cache cleared), single API attempt within the call', async () => {
            route({ apis: [{ body: [{ errorCode: 'INVALID_SESSION_ID', message: 'Session expired or invalid' }], status: 401 }] });

            await expect(connector.GetRecord(getCtx())).rejects.toThrow(/HTTP 401/);
            // The base clears the cache on 401 but does NOT inline-retry within the same call
            // (documented gap) — so exactly one API attempt is observed here.
            expect(nonTokenCalls().length).toBe(1);
        });
    });

    describe('403 — FLS/object hidden surfaces a permission error, no blind retry', () => {
        it('a 403 on a write returns Success=false + StatusCode 403 (permission), single attempt', async () => {
            route({ apis: [{ body: [{ errorCode: 'INSUFFICIENT_ACCESS_OR_READONLY', message: 'insufficient access rights on object id' }], status: 403 }] });

            const ctx: CreateRecordContext = {
                CompanyIntegration: jwtCompanyIntegration(),
                ObjectName: 'OrderApi__Assignment__c',
                Attributes: { Name: 'x' },
                ContextUser: contextUser,
            };
            const result = await connector.CreateRecord(ctx);

            expect(result.Success).toBe(false);
            expect(result.StatusCode).toBe(403);
            expect(result.ErrorMessage).toContain('INSUFFICIENT_ACCESS_OR_READONLY');
            // No blind retry: 403 is terminal — exactly one API attempt.
            expect(nonTokenCalls().length).toBe(1);
        });

        it('a 403 on a read throws with the status, single attempt', async () => {
            route({ apis: [{ body: [{ errorCode: 'INSUFFICIENT_ACCESS', message: 'object hidden by FLS' }], status: 403 }] });

            await expect(connector.GetRecord(getCtx())).rejects.toThrow(/HTTP 403/);
            expect(nonTokenCalls().length).toBe(1);
        });
    });

    describe('405 — wrong method fails, does NOT retry', () => {
        it('a 405 on a read throws and is not retried (single attempt)', async () => {
            route({ apis: [{ body: [{ errorCode: 'METHOD_NOT_ALLOWED', message: 'HTTP method not allowed for this resource' }], status: 405 }] });

            await expect(connector.GetRecord(getCtx())).rejects.toThrow(/HTTP 405/);
            expect(nonTokenCalls().length).toBe(1);
        });
    });

    describe('406 — bad Accept; connector always sends Accept: application/json', () => {
        it('the connector ALWAYS sends Accept: application/json (so a 406 cannot arise from a wrong Accept)', async () => {
            route({ apis: [{ body: { Id: 'a1', attributes: { type: 'OrderApi__Assignment__c' } } }] });

            await connector.GetRecord(getCtx());
            // BuildHeaders hard-codes Accept: application/json on every request — there is no
            // code path that sends any other Accept, so a 406-bad-Accept is structurally avoided.
            expect(nonTokenCalls()[0].headers['accept']).toBe('application/json');
        });

        it('if the API returns 406 anyway, a read throws fast (single attempt, not retried)', async () => {
            route({ apis: [{ body: [{ errorCode: 'NOT_ACCEPTABLE', message: 'requested format not available' }], status: 406 }] });

            await expect(connector.GetRecord(getCtx())).rejects.toThrow(/HTTP 406/);
            expect(nonTokenCalls().length).toBe(1);
        });
    });

    describe('429 — Salesforce rate limit backs off and retries', () => {
        it('a 429 then 2xx is retried (≥2 attempts) and ultimately succeeds', async () => {
            vi.useFakeTimers();
            // Cap retries low + zero the backoff/throttle so the test runs fast under fake timers.
            const ci = jwtCompanyIntegration({ MaxRetries: 3, MinRequestIntervalMs: 0 });

            let apiCall = 0;
            fetchSpy.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
                const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
                const isToken = url.includes('/services/oauth2/token');
                captured.push({ url, method: init?.method ?? 'GET', headers: headerToRecord(init), body: init?.body, isToken });
                if (isToken) return fakeTokenResponse();
                apiCall++;
                if (apiCall === 1) return apiResponse([{ errorCode: 'REQUEST_LIMIT_EXCEEDED', message: 'rate limited' }], 429);
                return apiResponse({ Id: 'a1', attributes: { type: 'OrderApi__Assignment__c' } }, 200);
            });

            const ctx = getCtx();
            ctx.CompanyIntegration = ci;
            const promise = connector.GetRecord(ctx);
            // Drive the exponential-backoff sleep timers.
            await vi.runAllTimersAsync();
            const record = await promise;

            expect(record).not.toBeNull();
            // The 429 was retried: at least 2 API attempts were made.
            expect(nonTokenCalls().length).toBeGreaterThanOrEqual(2);
            vi.useRealTimers();
        });

        it('a persistent 429 across all attempts eventually throws "failed after N retries" (bounded, no infinite loop)', async () => {
            vi.useFakeTimers();
            const ci = jwtCompanyIntegration({ MaxRetries: 2, MinRequestIntervalMs: 0 });
            route({ apis: [{ body: [{ errorCode: 'REQUEST_LIMIT_EXCEEDED', message: 'rate limited' }], status: 429 }] });

            const ctx = getCtx();
            ctx.CompanyIntegration = ci;
            const promise = connector.GetRecord(ctx);
            const assertion = expect(promise).rejects.toThrow(/failed after 2 retries/);
            await vi.runAllTimersAsync();
            await assertion;

            // Bounded: maxRetries(2)+1 = 3 attempts, then it gives up — not an unbounded loop.
            expect(nonTokenCalls().length).toBe(3);
            vi.useRealTimers();
        });
    });

    describe('500 — Apex/server error', () => {
        it('a persistent 500 on a read is retried (bounded backoff) then surfaces the status', async () => {
            vi.useFakeTimers();
            const ci = jwtCompanyIntegration({ MaxRetries: 2, MinRequestIntervalMs: 0 });
            route({ apis: [{ body: [{ errorCode: 'APEX_ERROR', message: 'System.NullPointerException' }], status: 500 }] });

            const ctx = getCtx();
            ctx.CompanyIntegration = ci;
            const promise = connector.GetRecord(ctx);
            const assertion = expect(promise).rejects.toThrow(/HTTP 500/);
            await vi.runAllTimersAsync();
            await assertion;
            // FIXED (spec §7): 500 is now retry-if-safe. maxRetries(2)+1 = 3 attempts, then surfaces.
            expect(nonTokenCalls().length).toBe(3);
            vi.useRealTimers();
        });

        it('a 500 on a write returns Success=false + StatusCode 500', async () => {
            route({ apis: [{ body: [{ errorCode: 'APEX_ERROR', message: 'System.NullPointerException' }], status: 500 }] });

            const ctx: CreateRecordContext = {
                CompanyIntegration: jwtCompanyIntegration(),
                ObjectName: 'OrderApi__Assignment__c',
                Attributes: { Name: 'x' },
                ContextUser: contextUser,
            };
            const result = await connector.CreateRecord(ctx);
            expect(result.Success).toBe(false);
            expect(result.StatusCode).toBe(500);
        });
    });

    describe('503 — maintenance / temporarily offline', () => {
        it('a persistent 503 on a read is retried (bounded backoff) then surfaces the status', async () => {
            vi.useFakeTimers();
            const ci = jwtCompanyIntegration({ MaxRetries: 2, MinRequestIntervalMs: 0 });
            route({ apis: [{ body: [{ errorCode: 'SERVER_UNAVAILABLE', message: 'Server temporarily unavailable' }], status: 503 }] });

            const ctx = getCtx();
            ctx.CompanyIntegration = ci;
            const promise = connector.GetRecord(ctx);
            const assertion = expect(promise).rejects.toThrow(/HTTP 503/);
            await vi.runAllTimersAsync();
            await assertion;
            // FIXED (spec §7): 503 maintenance is now retry-with-backoff. 3 attempts, then surfaces.
            expect(nonTokenCalls().length).toBe(3);
            vi.useRealTimers();
        });
    });

    describe('network timeout / transport error', () => {
        it('a persistent transport error on a read is retried (bounded backoff) then propagates', async () => {
            vi.useFakeTimers();
            const ci = jwtCompanyIntegration({ MaxRetries: 2, MinRequestIntervalMs: 0 });
            let apiCall = 0;
            fetchSpy.mockImplementation(async (input: string | URL | Request) => {
                const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
                if (url.includes('/services/oauth2/token')) return fakeTokenResponse();
                apiCall++;
                throw new Error('The operation was aborted due to timeout');
            });

            const ctx = getCtx();
            ctx.CompanyIntegration = ci;
            const promise = connector.GetRecord(ctx);
            const assertion = expect(promise).rejects.toThrow(/aborted due to timeout/);
            await vi.runAllTimersAsync();
            await assertion;
            // FIXED: a transient transport throw (timeout/socket) is now caught + retried with backoff.
            // maxRetries(2)+1 = 3 attempts, then the error propagates.
            expect(apiCall).toBe(3);
            vi.useRealTimers();
        });

        it('TestConnection turns a transport error into a clean failure result (does not leak the token)', async () => {
            fetchSpy.mockImplementation(async (input: string | URL | Request) => {
                const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
                if (url.includes('/services/oauth2/token')) return fakeTokenResponse();
                throw new Error('socket hang up');
            });

            const result = await connector.TestConnection(jwtCompanyIntegration(), contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('socket hang up');
            expect(result.Message).not.toContain(FAKE_ACCESS_TOKEN);
        });
    });
});
