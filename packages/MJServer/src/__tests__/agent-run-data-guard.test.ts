/**
 * @fileoverview Which agent-run resolver callers may set a run's scope or agent-type params through the `data`
 * argument (A12.15): the value the resolvers pass as `ExecuteAgentParams.TrustReservedRunData`.
 *
 * Pins who is trusted (the system user, an API key that holds the `agent:trusted` scope) and who is not (an
 * interactive user, a key without that scope, and every widget-guest run even though it executes as the system
 * user). What an untrusted run then loses is pinned where the rule is applied: `WithAgentRunDataTrustApplied` in
 * ai-core-plus and `BaseAgent.Execute` in ai-agents.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';

const hoisted = vi.hoisted(() => ({ authorize: vi.fn() }));

vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: () => ({ Authorize: hoisted.authorize }),
}));

import { IsTrustedAgentRunCaller, TRUSTED_RUN_DATA_SCOPE, type ClientAgentRunCaller } from '../resolvers/agent-run-data-guard.js';
import { ElevateUserPayload } from '../realtimeWidget/widgetGuestElevation.js';
import type { UserPayload } from '../types.js';

function payload(fields: Partial<UserPayload>): UserPayload {
    return { email: 'someone@example.com', userRecord: { ID: 'user-1' }, sessionId: 'session-1', ...fields };
}

const SYSTEM_USER = { ID: 'system-user', Email: 'system@example.com' } as UserInfo;

/** A browser session (JWT): neither the system user nor an API key. */
const INTERACTIVE = payload({ email: 'browser.user@example.com' });
/** The system API key (x-mj-api-key), as context.ts builds it. */
const SYSTEM_KEY = payload({ email: 'system@example.com', isSystemUser: true, apiKey: 'system-key' });
/** An `mj_sk_*` user API key an administrator granted `agent:trusted`, as context.ts builds it. */
const TRUSTED_KEY = payload({ email: 'integration@example.com', apiKeyId: 'key-1', apiKeyHash: 'hash-trusted' });
/** An `mj_sk_*` key a user minted for themselves: it may run agents, nothing more. */
const PLAIN_KEY = payload({ email: 'browser.user@example.com', apiKeyId: 'key-2', apiKeyHash: 'hash-plain' });
/** A key holding `full_access`, which does not include `agent:trusted`. */
const FULL_ACCESS_KEY = payload({ email: 'admin@example.com', apiKeyId: 'key-3', apiKeyHash: 'hash-full' });
/** A public web-widget guest. */
const WIDGET_GUEST = payload({ email: 'anonymous@magic-link.local' });

/** Each key's `MJ: API Key Scopes` rows, by scope path. */
const KEY_SCOPES: Record<string, string[]> = {
    'hash-trusted': ['agent:execute', 'agent:trusted'],
    'hash-plain': ['agent:execute'],
    'hash-full': ['full_access'],
};

/** APIKeyEngine.Authorize as the scope evaluator answers it: allowed only by a matching key rule. */
async function authorizeByKeyScopes(apiKeyHash: string, _app: string, scopePath: string) {
    return KEY_SCOPES[apiKeyHash]?.includes(scopePath)
        ? { Allowed: true, Reason: 'Key allows access', MatchedKeyRule: { ScopePath: scopePath }, EvaluatedRules: [] }
        : { Allowed: false, Reason: 'No matching key scope rules', EvaluatedRules: [] };
}

function caller(userPayload: UserPayload, isWidgetGuestRun = false): ClientAgentRunCaller {
    return { UserPayload: userPayload, IsWidgetGuestRun: isWidgetGuestRun, AgentID: 'agent-1' };
}

beforeEach(() => {
    hoisted.authorize.mockReset().mockImplementation(authorizeByKeyScopes);
    vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(SYSTEM_USER);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('IsTrustedAgentRunCaller', () => {
    it('names the agent:trusted scope', () => {
        expect(TRUSTED_RUN_DATA_SCOPE).toBe('agent:trusted');
    });

    it('trusts the system user', async () => {
        expect(await IsTrustedAgentRunCaller(caller(SYSTEM_KEY))).toBe(true);
    });

    it('trusts an API key that holds agent:trusted, checked for the agent being run', async () => {
        expect(await IsTrustedAgentRunCaller(caller(TRUSTED_KEY))).toBe(true);
        expect(hoisted.authorize).toHaveBeenCalledWith(
            'hash-trusted', 'MJAPI', 'agent:trusted', 'agent-1', SYSTEM_USER, expect.anything(), { skipLogging: true });
    });

    it('does not trust an API key without agent:trusted: it is treated like its user\'s browser session', async () => {
        expect(await IsTrustedAgentRunCaller(caller(PLAIN_KEY))).toBe(false);
        expect(await IsTrustedAgentRunCaller(caller(INTERACTIVE))).toBe(false);
    });

    it('does not trust a full_access key: the key must hold agent:trusted itself', async () => {
        expect(await IsTrustedAgentRunCaller(caller(FULL_ACCESS_KEY))).toBe(false);
    });

    it('does not count an allow that matched no key rule (enforcement off, or a no-scopes default of allow)', async () => {
        hoisted.authorize.mockResolvedValue({ Allowed: true, Reason: 'Enforcement disabled', EvaluatedRules: [] });

        expect(await IsTrustedAgentRunCaller(caller(PLAIN_KEY))).toBe(false);
    });

    it('fails closed when the scope check cannot run', async () => {
        hoisted.authorize.mockRejectedValue(new Error('engine not configured'));
        expect(await IsTrustedAgentRunCaller(caller(TRUSTED_KEY))).toBe(false);

        hoisted.authorize.mockImplementation(authorizeByKeyScopes);
        vi.mocked(UserCache.Instance.GetSystemUser).mockReturnValue(undefined as unknown as UserInfo);
        expect(await IsTrustedAgentRunCaller(caller(TRUSTED_KEY))).toBe(false);
    });

    it('does not trust an interactive (browser) user, and never asks the key engine', async () => {
        expect(await IsTrustedAgentRunCaller(caller(INTERACTIVE))).toBe(false);
        expect(hoisted.authorize).not.toHaveBeenCalled();
    });

    it('does not trust a widget-guest run even when the elevated principal is the system user', async () => {
        const elevated = ElevateUserPayload(WIDGET_GUEST, SYSTEM_USER);
        expect(elevated.isSystemUser).toBe(true); // the premise: elevation alone would look trusted

        expect(await IsTrustedAgentRunCaller(caller(elevated, true))).toBe(false);
    });

    it('does not trust a widget-guest run on a trusted key either', async () => {
        expect(await IsTrustedAgentRunCaller(caller(TRUSTED_KEY, true))).toBe(false);
    });

    it('treats an explicit isSystemUser:false, an empty key hash or a non-system api key as untrusted', async () => {
        expect(await IsTrustedAgentRunCaller(caller(payload({ isSystemUser: false, apiKeyId: 'key-1', apiKeyHash: '' })))).toBe(false);
        expect(await IsTrustedAgentRunCaller(caller(payload({ apiKey: 'not-the-system-key' })))).toBe(false);
    });
});
