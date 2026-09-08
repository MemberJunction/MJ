/**
 * Tests for the API key scope-authorization layer (auth/APIKeyScopeAuth.ts).
 *
 * Covers every decision branch of CheckAPIKeyScope / CheckAPIKeyScopeAndLog /
 * RequireScope: the "not an API key request" bypass, key/application lookup
 * failures, the application-active ceiling, evaluator allow/deny passthrough,
 * throwOnDenied behavior, audit logging, and adversarial inputs (scope-string
 * passthrough, filter-injection surfaces, case/prefix tricks) in the style of
 * multiTenancy.security.test.ts.
 *
 * Mocking is at the package boundary: @memberjunction/core's RunView (the two
 * metadata lookups) and @memberjunction/api-keys' engine (the scope evaluator +
 * usage logger). The production module under test runs unmodified.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunViewParams, UserInfo } from '@memberjunction/core';
import type { AuthorizationRequest, AuthorizationResult } from '@memberjunction/api-keys';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockRunView, mockEvaluateAccess, mockLogSuccess, mockLogDenied } = vi.hoisted(() => ({
    mockRunView: vi.fn(),
    mockEvaluateAccess: vi.fn(),
    mockLogSuccess: vi.fn(),
    mockLogDenied: vi.fn(),
}));

vi.mock('@memberjunction/core', () => ({
    RunView: class MockRunView {
        public async RunView(params: RunViewParams, contextUser?: UserInfo): Promise<unknown> {
            return mockRunView(params, contextUser);
        }
    },
}));

vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: () => ({
        GetScopeEvaluator: () => ({ EvaluateAccess: mockEvaluateAccess }),
        GetUsageLogger: () => ({ LogSuccess: mockLogSuccess, LogDenied: mockLogDenied }),
    }),
}));

vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('type-graphql', () => ({
    AuthorizationError: class AuthorizationError extends Error {
        constructor(message?: string) {
            super(message);
            this.name = 'AuthorizationError';
        }
    },
}));

import { AuthorizationError } from 'type-graphql';
import {
    CheckAPIKeyScope,
    CheckAPIKeyScopeAndLog,
    RequireScope,
    RequireViewRun,
    RequireAgentExecute,
} from '../auth/APIKeyScopeAuth.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const KEY_ID = 'key-0001';
const KEY_USER_ID = 'key-owner-user-42';
const APP_ID = 'app-mjapi-id';

function makeUser(): UserInfo {
    return { ID: 'ctx-user-1', Name: 'Context User', Email: 'ctx@example.com' } as unknown as UserInfo;
}

interface KeyRow { ID: string; UserID: string }
interface AppRow { ID: string; Name: string; IsActive: boolean }
interface LookupResult<T> { Success: boolean; Results: T[] }

/** Per-test lookup tables the mocked RunView serves, keyed by EntityName. */
let keyLookup: LookupResult<KeyRow>;
let appLookup: LookupResult<AppRow>;
/** Every RunView invocation, captured for filter-content assertions. */
let capturedRunViewParams: RunViewParams[];

function makeAuthResult(overrides: Partial<AuthorizationResult> = {}): AuthorizationResult {
    return {
        Allowed: true,
        Reason: 'Matched allow rule',
        EvaluatedRules: [],
        ...overrides,
    };
}

const USAGE_DETAILS = { endpoint: '/graphql', method: 'POST' };

beforeEach(() => {
    vi.clearAllMocks();
    capturedRunViewParams = [];
    keyLookup = { Success: true, Results: [{ ID: KEY_ID, UserID: KEY_USER_ID }] };
    appLookup = { Success: true, Results: [{ ID: APP_ID, Name: 'MJAPI', IsActive: true }] };

    mockRunView.mockImplementation((params: RunViewParams) => {
        capturedRunViewParams.push(params);
        if (params.EntityName === 'MJ: API Keys') return Promise.resolve(keyLookup);
        if (params.EntityName === 'MJ: API Applications') return Promise.resolve(appLookup);
        return Promise.resolve({ Success: false, Results: [] });
    });
    mockEvaluateAccess.mockResolvedValue(makeAuthResult());
    mockLogSuccess.mockResolvedValue('log-success-1');
    mockLogDenied.mockResolvedValue('log-denied-1');
});

// ─── CheckAPIKeyScope ───────────────────────────────────────────────────────

describe('CheckAPIKeyScope', () => {
    describe('no-API-key bypass', () => {
        it('allows without checking when apiKeyId is undefined (JWT-authenticated request)', async () => {
            const result = await CheckAPIKeyScope(undefined, 'view:run', makeUser());

            expect(result).toEqual({ Allowed: true, Checked: false, Reason: 'Not authenticated via API key' });
            expect(mockRunView).not.toHaveBeenCalled();
            expect(mockEvaluateAccess).not.toHaveBeenCalled();
        });

        it('treats an empty-string apiKeyId as "not an API key request" (falsy check, not presence check)', async () => {
            // Case/prefix trick: '' is falsy so it takes the bypass. An empty ID can
            // never resolve to a key row, so this is equivalent to the JWT path —
            // pinned here so a refactor to `!== undefined` gets a conscious review.
            const result = await CheckAPIKeyScope('', 'view:run', makeUser());

            expect(result.Checked).toBe(false);
            expect(result.Allowed).toBe(true);
            expect(mockRunView).not.toHaveBeenCalled();
        });
    });

    describe('API key lookup', () => {
        it('throws AuthorizationError "API key not found" when the lookup query fails', async () => {
            keyLookup = { Success: false, Results: [] };

            await expect(CheckAPIKeyScope(KEY_ID, 'view:run', makeUser()))
                .rejects.toThrow('API key not found');
            expect(mockEvaluateAccess).not.toHaveBeenCalled();
        });

        it('throws AuthorizationError when the key ID matches no row', async () => {
            keyLookup = { Success: true, Results: [] };

            await expect(CheckAPIKeyScope(KEY_ID, 'view:run', makeUser()))
                .rejects.toBeInstanceOf(AuthorizationError);
        });

        it('returns a denied result instead of throwing when throwOnDenied is false', async () => {
            keyLookup = { Success: true, Results: [] };

            const result = await CheckAPIKeyScope(KEY_ID, 'view:run', makeUser(), { throwOnDenied: false });

            expect(result).toEqual({ Allowed: false, Checked: true, Reason: 'API key not found' });
        });

        it('KNOWN GAP: the apiKeyId is interpolated verbatim into the RunView ExtraFilter', async () => {
            // The apiKeyId originates server-side (context.userPayload.apiKeyId, set only
            // after key validation), so the trust boundary is upstream — but this layer
            // performs no escaping of its own. Pinned so that if the call site ever
            // starts accepting client-supplied IDs, this assertion is the reminder.
            const hostile = "abc' OR '1'='1";
            keyLookup = { Success: true, Results: [] };

            await CheckAPIKeyScope(hostile, 'view:run', makeUser(), { throwOnDenied: false });

            expect(capturedRunViewParams[0].EntityName).toBe('MJ: API Keys');
            expect(capturedRunViewParams[0].ExtraFilter).toBe(`ID='abc' OR '1'='1'`);
        });
    });

    describe('application lookup and active ceiling', () => {
        it('denies with "Unknown application" when the application name matches no row', async () => {
            appLookup = { Success: true, Results: [] };

            await expect(CheckAPIKeyScope(KEY_ID, 'view:run', makeUser()))
                .rejects.toThrow('Unknown application: MJAPI');
        });

        it('names the custom application in the unknown-application denial', async () => {
            appLookup = { Success: false, Results: [] };

            const result = await CheckAPIKeyScope(KEY_ID, 'view:run', makeUser(), {
                applicationName: 'MCPServer',
                throwOnDenied: false,
            });

            expect(result.Allowed).toBe(false);
            expect(result.Reason).toBe('Unknown application: MCPServer');
        });

        it('denies when the application is inactive — BEFORE consulting the scope evaluator', async () => {
            appLookup = { Success: true, Results: [{ ID: APP_ID, Name: 'MJAPI', IsActive: false }] };

            await expect(CheckAPIKeyScope(KEY_ID, 'view:run', makeUser()))
                .rejects.toThrow('Application is not active: MJAPI');
            expect(mockEvaluateAccess).not.toHaveBeenCalled();
        });

        it('returns the inactive-application denial without throwing when throwOnDenied is false', async () => {
            appLookup = { Success: true, Results: [{ ID: APP_ID, Name: 'MJAPI', IsActive: false }] };

            const result = await CheckAPIKeyScope(KEY_ID, 'view:run', makeUser(), { throwOnDenied: false });

            expect(result).toEqual({ Allowed: false, Checked: true, Reason: 'Application is not active: MJAPI' });
        });

        it('KNOWN GAP: the applicationName option is interpolated verbatim into the application filter', async () => {
            appLookup = { Success: true, Results: [] };
            const hostile = "MJAPI' OR Name<>'";

            await CheckAPIKeyScope(KEY_ID, 'view:run', makeUser(), {
                applicationName: hostile,
                throwOnDenied: false,
            });

            expect(capturedRunViewParams[1].EntityName).toBe('MJ: API Applications');
            expect(capturedRunViewParams[1].ExtraFilter).toBe(`Name='MJAPI' OR Name<>''`);
        });
    });

    describe('scope evaluation', () => {
        it('builds the AuthorizationRequest from the KEY row (UserId comes from the key, not the context user)', async () => {
            await CheckAPIKeyScope(KEY_ID, 'view:run', makeUser(), { resource: 'Users' });

            expect(mockEvaluateAccess).toHaveBeenCalledTimes(1);
            const [request, ctxUser] = mockEvaluateAccess.mock.calls[0] as [AuthorizationRequest, UserInfo];
            expect(request).toEqual({
                APIKeyId: KEY_ID,
                UserId: KEY_USER_ID, // the key's owner — NOT ctx-user-1
                ApplicationId: APP_ID,
                ScopePath: 'view:run',
                Resource: 'Users',
            });
            expect(ctxUser.ID).toBe('ctx-user-1');
        });

        it('defaults the resource to "*" when not provided', async () => {
            await CheckAPIKeyScope(KEY_ID, 'agent:execute', makeUser());

            const [request] = mockEvaluateAccess.mock.calls[0] as [AuthorizationRequest];
            expect(request.Resource).toBe('*');
        });

        it('passes the scope path through VERBATIM — no case normalization or prefix expansion at this layer', async () => {
            // Case/prefix confusion belongs to the evaluator. This layer must not
            // "helpfully" lowercase or trim, or two spellings would silently map to
            // different audit trails than what the evaluator actually judged.
            await CheckAPIKeyScope(KEY_ID, '  View:RUN ', makeUser());
            await CheckAPIKeyScope(KEY_ID, 'view:runner', makeUser());

            const first = mockEvaluateAccess.mock.calls[0][0] as AuthorizationRequest;
            const second = mockEvaluateAccess.mock.calls[1][0] as AuthorizationRequest;
            expect(first.ScopePath).toBe('  View:RUN ');
            expect(second.ScopePath).toBe('view:runner');
        });

        it('returns the evaluator allow decision with Reason and EvaluatedRules passed through', async () => {
            const rules: AuthorizationResult['EvaluatedRules'] = [{
                Level: 'key',
                Rule: {
                    Id: 'r1', ScopeId: 's1', ScopePath: 'view:run', Pattern: '*',
                    PatternType: 'Include', IsDeny: false, Priority: 1, RowFilterID: null,
                },
                Matched: true,
                PatternMatched: '*',
                Result: 'Allowed',
            }];
            mockEvaluateAccess.mockResolvedValue(makeAuthResult({ Reason: 'rule r1', EvaluatedRules: rules }));

            const result = await CheckAPIKeyScope(KEY_ID, 'view:run', makeUser());

            expect(result).toEqual({ Allowed: true, Reason: 'rule r1', Checked: true, EvaluatedRules: rules });
        });

        it('throws on evaluator deny, naming the bare scope when resource is the default "*"', async () => {
            mockEvaluateAccess.mockResolvedValue(makeAuthResult({ Allowed: false, Reason: 'No matching scope' }));

            await expect(CheckAPIKeyScope(KEY_ID, 'view:run', makeUser()))
                .rejects.toThrow('API key does not have permission for scope: view:run. No matching scope');
        });

        it('includes the resource in the denial message when a resource was requested', async () => {
            mockEvaluateAccess.mockResolvedValue(makeAuthResult({ Allowed: false, Reason: 'Denied by exclude rule' }));

            await expect(CheckAPIKeyScope(KEY_ID, 'view:run', makeUser(), { resource: 'Users' }))
                .rejects.toThrow('API key does not have permission for scope: view:run (Users). Denied by exclude rule');
        });

        it('does not leak "undefined" into the denial message when the evaluator gives no reason', async () => {
            mockEvaluateAccess.mockResolvedValue(makeAuthResult({ Allowed: false, Reason: undefined }));

            const failure = await CheckAPIKeyScope(KEY_ID, 'view:run', makeUser()).catch((e: Error) => e);

            expect(failure).toBeInstanceOf(AuthorizationError);
            expect((failure as Error).message).not.toContain('undefined');
        });

        it('returns the deny (default-deny preserved) instead of throwing when throwOnDenied is false', async () => {
            mockEvaluateAccess.mockResolvedValue(makeAuthResult({ Allowed: false, Reason: 'default deny' }));

            const result = await CheckAPIKeyScope(KEY_ID, 'view:run', makeUser(), { throwOnDenied: false });

            expect(result.Allowed).toBe(false);
            expect(result.Checked).toBe(true);
            expect(result.Reason).toBe('default deny');
        });
    });
});

// ─── CheckAPIKeyScopeAndLog ─────────────────────────────────────────────────

describe('CheckAPIKeyScopeAndLog', () => {
    it('allows without checking or logging when apiKeyId is undefined', async () => {
        const result = await CheckAPIKeyScopeAndLog(undefined, 'view:run', makeUser(), USAGE_DETAILS);

        expect(result.Checked).toBe(false);
        expect(result.Allowed).toBe(true);
        expect(mockLogSuccess).not.toHaveBeenCalled();
        expect(mockLogDenied).not.toHaveBeenCalled();
    });

    it('KNOWN GAP: denies "API key not found" WITHOUT writing a usage-log row', async () => {
        // A probe with a bogus key ID leaves no trail in the usage log — only the
        // evaluator-reached denials are logged. Pinned as documentation of the
        // audit-coverage boundary.
        keyLookup = { Success: true, Results: [] };

        const result = await CheckAPIKeyScopeAndLog(KEY_ID, 'view:run', makeUser(), USAGE_DETAILS, { throwOnDenied: false });

        expect(result).toEqual({ Allowed: false, Checked: true, Reason: 'API key not found' });
        expect(mockLogDenied).not.toHaveBeenCalled();
    });

    it('denies unknown applications without logging', async () => {
        appLookup = { Success: true, Results: [] };

        await expect(CheckAPIKeyScopeAndLog(KEY_ID, 'view:run', makeUser(), USAGE_DETAILS))
            .rejects.toThrow('Unknown application: MJAPI');
        expect(mockLogDenied).not.toHaveBeenCalled();
    });

    it('SECURITY DIVERGENCE: unlike CheckAPIKeyScope, the logging variant does NOT enforce the application-active ceiling', async () => {
        // CheckAPIKeyScope denies when app.IsActive is false; CheckAPIKeyScopeAndLog has
        // no IsActive branch, so a request through a deactivated application still reaches
        // the evaluator and can be ALLOWED. Deactivating an application therefore does not
        // cut off callers routed through this function. Pinned so a fix flips this test.
        appLookup = { Success: true, Results: [{ ID: APP_ID, Name: 'MJAPI', IsActive: false }] };

        const result = await CheckAPIKeyScopeAndLog(KEY_ID, 'view:run', makeUser(), USAGE_DETAILS);

        expect(result.Allowed).toBe(true);
        expect(mockEvaluateAccess).toHaveBeenCalledTimes(1);
    });

    it('logs an allowed request via LogSuccess with default status 200 and returns the LogId', async () => {
        const rules: AuthorizationResult['EvaluatedRules'] = [];
        mockEvaluateAccess.mockResolvedValue(makeAuthResult({ EvaluatedRules: rules }));

        const result = await CheckAPIKeyScopeAndLog(KEY_ID, 'view:run', makeUser(), {
            endpoint: '/graphql',
            method: 'POST',
            operationName: 'RunViewOp',
            ipAddress: '10.0.0.9',
            userAgent: 'vitest',
            responseTimeMs: 12,
        }, { resource: 'Users' });

        expect(result.Allowed).toBe(true);
        expect(result.LogId).toBe('log-success-1');
        expect(mockLogDenied).not.toHaveBeenCalled();
        expect(mockLogSuccess).toHaveBeenCalledTimes(1);
        const args = mockLogSuccess.mock.calls[0];
        expect(args[0]).toBe(KEY_ID);
        expect(args[1]).toBe(APP_ID);
        expect(args[2]).toBe('/graphql');
        expect(args[3]).toBe('RunViewOp');
        expect(args[4]).toBe('POST');
        expect(args[5]).toBe(200); // default success status
        expect(args[6]).toBe(12);
        expect(args[7]).toBe('Users');
        expect(args[8]).toBe(rules);
        expect(args[9]).toBe('10.0.0.9');
        expect(args[10]).toBe('vitest');
    });

    it('honors an explicit statusCode override in the usage details', async () => {
        await CheckAPIKeyScopeAndLog(KEY_ID, 'view:run', makeUser(), { ...USAGE_DETAILS, statusCode: 207 });

        expect(mockLogSuccess.mock.calls[0][5]).toBe(207);
    });

    it('normalizes missing optional usage fields to null in the log call', async () => {
        await CheckAPIKeyScopeAndLog(KEY_ID, 'view:run', makeUser(), USAGE_DETAILS);

        const args = mockLogSuccess.mock.calls[0];
        expect(args[3]).toBeNull(); // operationName
        expect(args[6]).toBeNull(); // responseTimeMs
        expect(args[9]).toBeNull(); // ipAddress
        expect(args[10]).toBeNull(); // userAgent
    });

    it('logs a denial via LogDenied (status 403, with the reason) BEFORE throwing', async () => {
        mockEvaluateAccess.mockResolvedValue(makeAuthResult({ Allowed: false, Reason: 'exceeds ceiling' }));

        await expect(CheckAPIKeyScopeAndLog(KEY_ID, 'view:run', makeUser(), USAGE_DETAILS, { resource: 'Users' }))
            .rejects.toThrow('API key does not have permission for scope: view:run (Users). exceeds ceiling');

        // The audit row must exist even though the caller sees an exception.
        expect(mockLogDenied).toHaveBeenCalledTimes(1);
        expect(mockLogSuccess).not.toHaveBeenCalled();
        const args = mockLogDenied.mock.calls[0];
        expect(args[5]).toBe(403); // default denied status
        expect(args[9]).toBe('exceeds ceiling'); // DeniedReason
    });

    it('returns the denial with its LogId when throwOnDenied is false', async () => {
        mockEvaluateAccess.mockResolvedValue(makeAuthResult({ Allowed: false, Reason: 'nope' }));

        const result = await CheckAPIKeyScopeAndLog(KEY_ID, 'view:run', makeUser(), USAGE_DETAILS, { throwOnDenied: false });

        expect(result.Allowed).toBe(false);
        expect(result.LogId).toBe('log-denied-1');
    });

    it('leaves LogId undefined when the usage logger returns null', async () => {
        mockLogSuccess.mockResolvedValue(null);

        const result = await CheckAPIKeyScopeAndLog(KEY_ID, 'view:run', makeUser(), USAGE_DETAILS);

        expect(result.Allowed).toBe(true);
        expect(result.LogId).toBeUndefined();
    });
});

// ─── RequireScope + prebuilt checkers ───────────────────────────────────────

describe('RequireScope', () => {
    function makeCtx(apiKeyId?: string): { userPayload: { apiKeyId?: string; userRecord: UserInfo } } {
        return { userPayload: { apiKeyId, userRecord: makeUser() } };
    }

    it('resolves without touching the engine for non-API-key contexts', async () => {
        const requireScope = RequireScope('view:run');

        await expect(requireScope(makeCtx(undefined))).resolves.toBeUndefined();
        expect(mockRunView).not.toHaveBeenCalled();
    });

    it('forwards the per-call resource to the evaluator', async () => {
        const requireScope = RequireScope('view:run');

        await requireScope(makeCtx(KEY_ID), 'Accounts');

        const [request] = mockEvaluateAccess.mock.calls[0] as [AuthorizationRequest];
        expect(request.ScopePath).toBe('view:run');
        expect(request.Resource).toBe('Accounts');
    });

    it('throws AuthorizationError through the returned checker on deny', async () => {
        mockEvaluateAccess.mockResolvedValue(makeAuthResult({ Allowed: false, Reason: 'denied' }));
        const requireScope = RequireScope('agent:execute');

        await expect(requireScope(makeCtx(KEY_ID))).rejects.toBeInstanceOf(AuthorizationError);
    });

    it('prebuilt checkers carry their canonical scope paths', async () => {
        await RequireViewRun(makeCtx(KEY_ID));
        await RequireAgentExecute(makeCtx(KEY_ID));

        const scopes = mockEvaluateAccess.mock.calls.map(call => (call[0] as AuthorizationRequest).ScopePath);
        expect(scopes).toEqual(['view:run', 'agent:execute']);
    });
});
