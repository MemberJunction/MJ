/**
 * The widget's guest voice mint against a stand-in GraphQL provider: what it asks the server for, and the
 * client config it builds, a relay session's transport and relay URL included.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { executeGQL } = vi.hoisted(() => ({ executeGQL: vi.fn() }));
vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: { Instance: { ExecuteGQL: (query: string, variables: Record<string, unknown>) => executeGQL(query, variables) } },
}));

import { CreateGuestVoiceMint } from '../voice/guest-voice-mint.js';
import type { WidgetSession } from '../types.js';

const TICKET = '2b3c4d5e-1111-4222-8333-944455556666';
const RELAY_URL = `wss://mjapi.example.test/realtime/relay/${TICKET}`;
const UNSUPPORTED = 'Cannot query field "Transport" on type "StartRealtimeClientSessionResult".';

const SESSION: WidgetSession = {
    token: 'guest-token',
    expiresAtMs: Date.now() + 60_000,
    widgetId: 'widget-1',
    applicationId: 'app-1',
    pinnedAgentId: 'agent-1',
    modality: 'Voice',
    sessionId: 'session-1',
    rememberReturningVisitors: false,
    enabledChannels: [],
};

/** What the server returns for one mint, over a direct session's defaults. */
function minted(overrides: Record<string, unknown> = {}): { StartRealtimeClientSession: Record<string, unknown> } {
    return {
        StartRealtimeClientSession: {
            AgentSessionId: 'agent-session-1',
            Provider: 'openai',
            Model: 'gpt-realtime',
            EphemeralToken: 'ek_1',
            ExpiresAt: '2030-01-01T00:00:00Z',
            SessionConfigJson: '{"instructions":"hi"}',
            ...overrides,
        },
    };
}

/** The queries the mint sent, in order. */
const queries = (): string[] => executeGQL.mock.calls.map((call: unknown[]) => String(call[0]));

describe('CreateGuestVoiceMint', () => {
    beforeEach(() => {
        executeGQL.mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("mints for the widget's pinned agent and asks for the transport and the relay URL", async () => {
        executeGQL.mockResolvedValue(minted({ Transport: null, RelayUrl: null }));
        const result = await CreateGuestVoiceMint(SESSION)([]);

        expect(executeGQL.mock.calls[0][1]).toEqual({ targetAgentId: 'agent-1', clientToolsJson: undefined, showsAgentVideo: false });
        expect(queries()[0]).toMatch(/\n\s+Transport\n\s+RelayUrl\n/);
        expect(result).toEqual({
            provider: 'openai',
            agentSessionId: 'agent-session-1',
            sessionConfig: { Provider: 'openai', Model: 'gpt-realtime', EphemeralToken: 'ek_1', ExpiresAt: '2030-01-01T00:00:00Z', SessionConfig: { instructions: 'hi' } },
        });
    });

    it("hands a relay session's transport and relay URL to the client as minted", async () => {
        executeGQL.mockResolvedValue(minted({ Provider: 'gemini-enterprise', EphemeralToken: '', Transport: 'relay', RelayUrl: RELAY_URL }));
        const { sessionConfig } = await CreateGuestVoiceMint(SESSION)([]);
        expect(sessionConfig).toMatchObject({ Provider: 'gemini-enterprise', EphemeralToken: '', Transport: 'relay', RelayUrl: RELAY_URL });
    });

    it('leaves out a transport it does not know', async () => {
        executeGQL.mockResolvedValue(minted({ Transport: 'bridged' }));
        const { sessionConfig } = await CreateGuestVoiceMint(SESSION)([]);
        expect('Transport' in sessionConfig).toBe(false);
    });

    it('mints without the transport fields against a server that predates them, says so once, and remembers', async () => {
        executeGQL.mockImplementation(async (query: string) => {
            if (query.includes('RelayUrl')) {
                throw new Error(UNSUPPORTED);
            }
            return minted();
        });
        const mint = CreateGuestVoiceMint(SESSION);
        const first = await mint([]);
        const second = await mint([]);

        expect(first.sessionConfig.EphemeralToken).toBe('ek_1');
        expect(second.sessionConfig.EphemeralToken).toBe('ek_1');
        expect(queries().map((query) => query.includes('RelayUrl'))).toEqual([true, false, false]);
        expect(queries()[1]).not.toMatch(/\n\s+Transport\n/);
        expect(vi.mocked(console.warn).mock.calls).toHaveLength(1);
    });

    it('tells the server the widget shows no agent video, so it asks the model for no avatar', async () => {
        executeGQL.mockResolvedValue(minted());
        await CreateGuestVoiceMint(SESSION)([]);
        expect(queries()[0]).toContain('$showsAgentVideo: Boolean');
        expect(queries()[0]).toContain('showsAgentVideo: $showsAgentVideo');
        expect(executeGQL.mock.calls[0][1]).toMatchObject({ showsAgentVideo: false });
    });

    it('mints without showsAgentVideo against a server that predates it, keeping the transport fields, says so once, and remembers', async () => {
        executeGQL.mockImplementation(async (query: string) => {
            if (query.includes('showsAgentVideo')) {
                throw new Error('Unknown argument "showsAgentVideo" on field "Mutation.StartRealtimeClientSession".');
            }
            return minted();
        });
        const mint = CreateGuestVoiceMint(SESSION);
        const first = await mint([]);
        await mint([]);

        expect(first.sessionConfig.EphemeralToken).toBe('ek_1');
        expect(queries().map((query) => query.includes('showsAgentVideo'))).toEqual([true, false, false]);
        expect(queries().every((query) => query.includes('RelayUrl'))).toBe(true);
        expect('showsAgentVideo' in (executeGQL.mock.calls[1][1] as Record<string, unknown>)).toBe(false);
        expect(vi.mocked(console.warn).mock.calls).toHaveLength(1);
    });

    it('drops both, one at a time, against a server that predates both', async () => {
        executeGQL.mockImplementation(async (query: string) => {
            if (query.includes('showsAgentVideo')) {
                throw new Error('Unknown argument "showsAgentVideo" on field "Mutation.StartRealtimeClientSession".');
            }
            if (query.includes('RelayUrl')) {
                throw new Error(UNSUPPORTED);
            }
            return minted();
        });
        const result = await CreateGuestVoiceMint(SESSION)([]);
        expect(result.sessionConfig.EphemeralToken).toBe('ek_1');
        expect(executeGQL).toHaveBeenCalledTimes(3);
        expect(queries()[2]).not.toContain('showsAgentVideo');
        expect(queries()[2]).not.toContain('RelayUrl');
    });

    it('surfaces any other failure, one that merely mentions a transport included, without retrying', async () => {
        executeGQL.mockRejectedValue(new Error('Transport error: the connection to MJAPI was reset'));
        await expect(CreateGuestVoiceMint(SESSION)([])).rejects.toThrow('Transport error');
        expect(executeGQL).toHaveBeenCalledTimes(1);
    });
});
