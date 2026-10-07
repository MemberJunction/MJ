/**
 * @fileoverview Which agent-run resolver callers may set a run's scope or agent-type params through the `data`
 * argument (A12.15): the value the resolvers pass as `ExecuteAgentParams.TrustReservedRunData`.
 *
 * Pins who is trusted (the system user, an API-key integration) and who is not (an interactive user, and every
 * widget-guest run even though it executes as the system user). What an untrusted run then loses is pinned where
 * the rule is applied: `WithAgentRunDataTrustApplied` in ai-core-plus and `BaseAgent.Execute` in ai-agents.
 */
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { IsTrustedAgentRunCaller, type ClientAgentRunCaller } from '../resolvers/agent-run-data-guard.js';
import { ElevateUserPayload } from '../realtimeWidget/widgetGuestElevation.js';
import type { UserPayload } from '../types.js';

function payload(fields: Partial<UserPayload>): UserPayload {
    return { email: 'someone@example.com', userRecord: { ID: 'user-1' }, sessionId: 'session-1', ...fields };
}

/** A browser session (JWT): neither the system user nor an API key. */
const INTERACTIVE = payload({ email: 'browser.user@example.com' });
/** The system API key (x-mj-api-key), as context.ts builds it. */
const SYSTEM_KEY = payload({ email: 'system@example.com', isSystemUser: true, apiKey: 'system-key' });
/** An `mj_sk_*` user API key, as context.ts builds it. */
const USER_API_KEY = payload({ email: 'integration@example.com', apiKeyId: 'key-1', apiKeyHash: 'hash-1' });
/** A public web-widget guest. */
const WIDGET_GUEST = payload({ email: 'anonymous@magic-link.local' });

function caller(userPayload: UserPayload, isWidgetGuestRun = false): ClientAgentRunCaller {
    return { UserPayload: userPayload, IsWidgetGuestRun: isWidgetGuestRun };
}

describe('IsTrustedAgentRunCaller', () => {
    it('trusts the system user', () => {
        expect(IsTrustedAgentRunCaller(caller(SYSTEM_KEY))).toBe(true);
    });

    it('trusts an API-key integration', () => {
        expect(IsTrustedAgentRunCaller(caller(USER_API_KEY))).toBe(true);
    });

    it('does not trust an interactive (browser) user', () => {
        expect(IsTrustedAgentRunCaller(caller(INTERACTIVE))).toBe(false);
    });

    it('does not trust a widget-guest run even when the elevated principal is the system user', () => {
        const systemUser = { ID: 'system-user', Email: 'system@example.com' } as UserInfo;
        const elevated = ElevateUserPayload(WIDGET_GUEST, systemUser);
        expect(elevated.isSystemUser).toBe(true); // the premise: elevation alone would look trusted

        expect(IsTrustedAgentRunCaller(caller(elevated, true))).toBe(false);
    });

    it('does not trust a widget-guest run on an API-key payload either', () => {
        expect(IsTrustedAgentRunCaller(caller(USER_API_KEY, true))).toBe(false);
    });

    it('treats an explicit isSystemUser:false, an empty apiKeyId or a non-system api key as untrusted', () => {
        expect(IsTrustedAgentRunCaller(caller(payload({ isSystemUser: false, apiKeyId: '' })))).toBe(false);
        expect(IsTrustedAgentRunCaller(caller(payload({ apiKey: 'not-the-system-key' })))).toBe(false);
    });
});
