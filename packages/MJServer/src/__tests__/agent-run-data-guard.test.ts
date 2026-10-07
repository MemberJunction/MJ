/**
 * @fileoverview The guard that keeps a browser from setting an agent run's scope or agent-type params
 * through the agent-run resolvers' `data` argument (A12.15).
 *
 * Pins who keeps the reserved keys (the system user, an API-key integration) and who loses them (an
 * interactive user, and every widget-guest run even though it executes as the system user), that
 * everything else in `data` survives, that the input is never mutated, and that the resolver-facing
 * wrapper logs the removed keys and the user once — never the values — and hands back the exact
 * string when there is nothing to remove.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const hoisted = vi.hoisted(() => ({ logStatus: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogStatus: hoisted.logStatus,
}));

import {
    GuardClientAgentRunDataArg,
    IsTrustedAgentRunCaller,
    RESERVED_AGENT_RUN_DATA_KEYS,
    SanitizeClientAgentRunData,
    type ClientAgentRunCaller,
} from '../resolvers/agent-run-data-guard.js';
import { ElevateUserPayload } from '../realtimeWidget/widgetGuestElevation.js';
import type { UserPayload } from '../types.js';

const SCOPE_RECORD_ID = 'B1A2C3D4-0000-4000-8000-00000000A115';

/** What Explorer's conversation client sends (conversation-agent.service.ts) plus ordinary template data. */
const ORDINARY_DATA = {
    conversationId: 'conv-1',
    latestMessageId: 'detail-1',
    invocationReason: 'user-message',
    appContext: { AppName: 'Explorer' },
    clientTools: [{ Name: 'navigate' }],
    customerName: 'Ada',
};

/** Every reserved key, with values that would widen a run's scope or switch a capability on. */
const RESERVED_DATA = {
    PrimaryScopeEntityName: 'MJ: Companies',
    PrimaryScopeEntityID: 'E0000000-0000-4000-8000-000000000001',
    PrimaryScopeRecordID: SCOPE_RECORD_ID,
    SecondaryScopes: { TeamID: 'team-other' },
    __agentTypePromptParams: { enableTaskGraphs: true },
};

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

function fullData(): Record<string, unknown> {
    return { ...structuredClone(ORDINARY_DATA), ...structuredClone(RESERVED_DATA) };
}

beforeEach(() => {
    hoisted.logStatus.mockReset();
});

describe('SanitizeClientAgentRunData', () => {
    it('strips every reserved key from an interactive user and keeps everything else', () => {
        const result = SanitizeClientAgentRunData(fullData(), caller(INTERACTIVE));

        expect(result.Data).toEqual(ORDINARY_DATA);
        expect(result.StrippedKeys).toEqual([...RESERVED_AGENT_RUN_DATA_KEYS]);
    });

    it('lets the system user keep them', () => {
        const data = fullData();
        const result = SanitizeClientAgentRunData(data, caller(SYSTEM_KEY));

        expect(result.Data).toBe(data);
        expect(result.StrippedKeys).toEqual([]);
    });

    it('lets an API-key caller keep them', () => {
        const data = fullData();
        const result = SanitizeClientAgentRunData(data, caller(USER_API_KEY));

        expect(result.Data).toBe(data);
        expect(result.StrippedKeys).toEqual([]);
    });

    it('strips them from a widget-guest run even when the elevated principal is the system user', () => {
        const systemUser = { ID: 'system-user', Email: 'system@example.com' } as UserInfo;
        const elevated = ElevateUserPayload(WIDGET_GUEST, systemUser);
        expect(elevated.isSystemUser).toBe(true); // the premise: elevation alone would look trusted

        const result = SanitizeClientAgentRunData(fullData(), caller(elevated, true));

        expect(IsTrustedAgentRunCaller(caller(elevated, true))).toBe(false);
        expect(result.Data).toEqual(ORDINARY_DATA);
        expect(result.StrippedKeys).toEqual([...RESERVED_AGENT_RUN_DATA_KEYS]);
    });

    it('strips them from a widget-guest run on an API-key payload too', () => {
        const result = SanitizeClientAgentRunData(fullData(), caller(USER_API_KEY, true));

        expect(result.StrippedKeys).toEqual([...RESERVED_AGENT_RUN_DATA_KEYS]);
    });

    it('treats an explicit isSystemUser:false or an empty apiKeyId as untrusted', () => {
        expect(IsTrustedAgentRunCaller(caller(payload({ isSystemUser: false, apiKeyId: '' })))).toBe(false);
        expect(IsTrustedAgentRunCaller(caller(payload({ apiKey: 'not-the-system-key' })))).toBe(false);
    });

    it('does not mutate its input', () => {
        const data = Object.freeze(fullData());
        const before = structuredClone(data);

        const result = SanitizeClientAgentRunData(data, caller(INTERACTIVE));

        expect(data).toEqual(before);
        expect(result.Data).not.toBe(data);
    });

    it('returns the same content and strips nothing when there is nothing to strip', () => {
        const data = structuredClone(ORDINARY_DATA);

        const result = SanitizeClientAgentRunData(data, caller(INTERACTIVE));

        expect(result.Data).toBe(data);
        expect(result.Data).toEqual(ORDINARY_DATA);
        expect(result.StrippedKeys).toEqual([]);
    });

    it('removes only the reserved keys that are present, and only at the top level the framework reads', () => {
        const data = { PrimaryScopeRecordID: SCOPE_RECORD_ID, nested: { PrimaryScopeRecordID: SCOPE_RECORD_ID } };

        const result = SanitizeClientAgentRunData(data, caller(INTERACTIVE));

        expect(result.StrippedKeys).toEqual(['PrimaryScopeRecordID']);
        expect(result.Data).toEqual({ nested: { PrimaryScopeRecordID: SCOPE_RECORD_ID } });
    });
});

describe('GuardClientAgentRunDataArg', () => {
    it('returns the data without the reserved keys and logs the keys and the user once, never the values', () => {
        const raw = JSON.stringify(fullData());

        const guarded = GuardClientAgentRunDataArg(raw, caller(INTERACTIVE));

        expect(JSON.parse(guarded!)).toEqual(ORDINARY_DATA);
        expect(hoisted.logStatus).toHaveBeenCalledTimes(1);
        const line = String(hoisted.logStatus.mock.calls[0][0]);
        for (const key of RESERVED_AGENT_RUN_DATA_KEYS) {
            expect(line).toContain(key);
        }
        expect(line).toContain('browser.user@example.com');
        expect(line).not.toContain(SCOPE_RECORD_ID);
        expect(line).not.toContain('MJ: Companies');
        expect(line).not.toContain('enableTaskGraphs');
        expect(line).not.toContain('team-other');
    });

    it('names a widget-guest run in the log line', () => {
        GuardClientAgentRunDataArg(JSON.stringify({ PrimaryScopeRecordID: SCOPE_RECORD_ID }), caller(WIDGET_GUEST, true));

        expect(hoisted.logStatus).toHaveBeenCalledTimes(1);
        expect(String(hoisted.logStatus.mock.calls[0][0])).toContain('anonymous@magic-link.local (widget guest run)');
    });

    it('hands back the exact string and does not log when there is nothing to strip', () => {
        const raw = JSON.stringify(ORDINARY_DATA);

        expect(GuardClientAgentRunDataArg(raw, caller(INTERACTIVE))).toBe(raw);
        expect(hoisted.logStatus).not.toHaveBeenCalled();
    });

    it('hands back the exact string and does not log for a trusted caller', () => {
        const raw = JSON.stringify(fullData());

        expect(GuardClientAgentRunDataArg(raw, caller(SYSTEM_KEY))).toBe(raw);
        expect(GuardClientAgentRunDataArg(raw, caller(USER_API_KEY))).toBe(raw);
        expect(hoisted.logStatus).not.toHaveBeenCalled();
    });

    it('passes an absent, unreadable or non-object argument through untouched, so the run reports it as before', () => {
        expect(GuardClientAgentRunDataArg(undefined, caller(INTERACTIVE))).toBeUndefined();
        expect(GuardClientAgentRunDataArg('', caller(INTERACTIVE))).toBe('');
        expect(GuardClientAgentRunDataArg('{not json', caller(INTERACTIVE))).toBe('{not json');
        expect(GuardClientAgentRunDataArg('[1,2]', caller(INTERACTIVE))).toBe('[1,2]');
        expect(GuardClientAgentRunDataArg('null', caller(INTERACTIVE))).toBe('null');
        expect(hoisted.logStatus).not.toHaveBeenCalled();
    });
});
