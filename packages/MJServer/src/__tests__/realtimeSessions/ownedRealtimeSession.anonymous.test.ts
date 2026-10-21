import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator,
        Mutation: noopDecorator,
        Query: noopDecorator,
        Subscription: noopDecorator,
        ObjectType: noopDecorator,
        InputType: noopDecorator,
        Field: noopDecorator,
        Arg: noopDecorator,
        Args: noopDecorator,
        Ctx: noopDecorator,
        PubSub: noopDecorator,
        Root: noopDecorator,
        Float: class {},
        Int: class {},
        ID: class {},
    };
});

let currentProvider: IMetadataProvider;
vi.mock('../../util.js', () => ({
    GetReadWriteProvider: () => currentProvider,
}));

const closeSessionMock = vi.fn(async () => true);
const heartbeatMock = vi.fn(async () => true);
vi.mock('../../agentSessions/index.js', () => ({
    SessionManager: class {
        CloseSession = closeSessionMock;
        Heartbeat = heartbeatMock;
    },
    SessionAuthorizationError: class extends Error {},
}));

vi.mock('@memberjunction/remote-browser-server', () => ({
    NormalizeInstanceKey: (k?: string) => k ?? 'default',
    RemoteBrowserEngine: {
        Instance: {
            GetSessionForAgentSession: vi.fn(() => undefined),
            RecoverDeadAgentSession: vi.fn(async () => null),
        },
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn(), Prompts: [], Agents: [], AgentTypes: [] } },
}));

vi.mock('@memberjunction/ai-prompts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/ai-prompts')>()),
    AIPromptRunner: class {},
}));

vi.mock('@memberjunction/ai-core-plus', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/ai-core-plus')>()),
    AIPromptParams: class {},
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { AppContext } from '../../types.js';
import {
    LoadOwnedRealtimeSession,
    RealtimeSessionNotFoundError,
    RealtimeSessionOwnershipError,
} from '../../realtimeSessions/ownedRealtimeSession.js';
import { AgentSessionResolver } from '../../resolvers/AgentSessionResolver.js';
import { RemoteBrowserActionResolver } from '../../resolvers/RemoteBrowserActionResolver.js';
import { RealtimeClientSessionResolver } from '../../resolvers/RealtimeClientSessionResolver.js';

const SESSION = '11111111-1111-4111-8111-111111111111';
const PRIOR_SESSION_1 = '11111111-1111-4111-8111-111111111112';
const PRIOR_SESSION_2 = '11111111-1111-4111-8111-111111111113';
const CONV = '22222222-2222-4222-8222-222222222222';
const ANON = 'AAAAAAAA-0000-4000-8000-000000000001';

const guest = (visitorId?: string, resourceId?: string): UserInfo =>
    ({
        ID: ANON,
        IsMagicLinkAnonymous: true,
        AnonymousVisitorID: visitorId,
        MagicLinkScope: resourceId ? { ResourceID: resourceId } : undefined,
    } as unknown as UserInfo);

function providerForAnonSession(externalId: string | null, sessionExists = true): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async (entity: string) =>
            entity === 'MJ: AI Agent Sessions'
                ? {
                      ID: SESSION,
                      UserID: ANON,
                      ConversationID: CONV,
                      Load: vi.fn(async () => sessionExists),
                  }
                : {
                      ID: CONV,
                      ExternalID: externalId,
                      Load: vi.fn(async () => externalId !== null),
                  },
        ),
    } as unknown as IMetadataProvider;
}

function appCtx(user: UserInfo): AppContext {
    return {
        userPayload: { email: 'anonymous@magic-link.local', sessionId: 'ws-1', userRecord: user },
        providers: [],
    } as unknown as AppContext;
}

describe('LoadOwnedRealtimeSession — anonymous visitors sharing the Anonymous UserID', () => {
    it('allows the anonymous visitor whose AnonymousVisitorID matches the session conversation ExternalID', async () => {
        await expect(
            LoadOwnedRealtimeSession(SESSION, guest('scope-A', 'shared-resource'), providerForAnonSession('scope-A')),
        ).resolves.toMatchObject({ ID: SESSION });
    });

    it('rejects a second anonymous visitor sharing the Anonymous UserID (and even the same MagicLinkScope.ResourceID)', async () => {
        await expect(
            LoadOwnedRealtimeSession(SESSION, guest('scope-B', 'shared-resource'), providerForAnonSession('scope-A')),
        ).rejects.toBeInstanceOf(RealtimeSessionOwnershipError);
    });

    it('rejects an anonymous visitor with no AnonymousVisitorID', async () => {
        await expect(
            LoadOwnedRealtimeSession(SESSION, guest(undefined, 'scope-A'), providerForAnonSession('scope-A')),
        ).rejects.toBeInstanceOf(RealtimeSessionOwnershipError);
    });
});

describe('AgentSessionResolver — CloseAgentSession and AgentSessionHeartbeat anonymous ownership', () => {
    beforeEach(() => {
        closeSessionMock.mockClear();
        heartbeatMock.mockClear();
    });

    it('allows CloseAgentSession and AgentSessionHeartbeat for the owning anonymous visitor', async () => {
        currentProvider = providerForAnonSession('visitor-A');
        const resolver = new AgentSessionResolver();

        await expect(resolver.CloseAgentSession(SESSION, appCtx(guest('visitor-A')))).resolves.toBe(true);
        await expect(resolver.AgentSessionHeartbeat(SESSION, appCtx(guest('visitor-A')))).resolves.toBe(true);
        expect(closeSessionMock).toHaveBeenCalledTimes(1);
        expect(heartbeatMock).toHaveBeenCalledTimes(1);
    });

    it('rejects CloseAgentSession and AgentSessionHeartbeat from another anonymous visitor sharing UserID', async () => {
        currentProvider = providerForAnonSession('visitor-A');
        const resolver = new AgentSessionResolver();

        await expect(resolver.CloseAgentSession(SESSION, appCtx(guest('visitor-B')))).rejects.toThrow(
            'Not authorized: you do not own this agent session',
        );
        await expect(resolver.AgentSessionHeartbeat(SESSION, appCtx(guest('visitor-B')))).rejects.toThrow(
            'Not authorized: you do not own this agent session',
        );
        expect(closeSessionMock).not.toHaveBeenCalled();
        expect(heartbeatMock).not.toHaveBeenCalled();
    });

    it('preserves the Agent session not found message when the session does not exist', async () => {
        currentProvider = providerForAnonSession('visitor-A', false);
        const resolver = new AgentSessionResolver();

        await expect(resolver.CloseAgentSession(SESSION, appCtx(guest('visitor-A')))).rejects.toThrow(
            `Agent session ${SESSION} not found`,
        );
    });
});

describe('RemoteBrowserActionResolver — loadOwnedSession anonymous ownership', () => {
    it('allows RemoteBrowserSnapshot for the owning anonymous visitor and rejects a second anonymous visitor sharing UserID', async () => {
        currentProvider = providerForAnonSession('visitor-A');
        const resolver = new RemoteBrowserActionResolver();

        await expect(resolver.RemoteBrowserSnapshot(SESSION, appCtx(guest('visitor-A')))).resolves.toEqual({});
        await expect(resolver.RemoteBrowserSnapshot(SESSION, appCtx(guest('visitor-B')))).rejects.toThrow(
            `Not authorized: remote-browser session ${SESSION} is not owned by you.`,
        );
    });

    it('preserves the Remote-browser session not found message when the session does not exist', async () => {
        currentProvider = providerForAnonSession('visitor-A', false);
        const resolver = new RemoteBrowserActionResolver();

        await expect(resolver.RemoteBrowserSnapshot(SESSION, appCtx(guest('visitor-A')))).rejects.toThrow(
            `Remote-browser session ${SESSION} not found.`,
        );
    });
});

describe('RealtimeClientSessionResolver — prior-session readers (loadPriorChannelStatesJson & collectOwnedPriorLegIDs)', () => {
    interface ChainEntry {
        UserID: string;
        ConversationID: string;
        ExternalID: string | null;
        LastSessionID?: string | null;
    }

    function makeChainProvider(
        chain: Record<string, ChainEntry>,
        channelRows: Array<{ Channel: string; Config: string | null }> = [],
    ): { provider: IMetadataProvider; runView: ReturnType<typeof vi.fn> } {
        const conversations = new Map<string, string | null>();
        for (const entry of Object.values(chain)) {
            conversations.set(entry.ConversationID, entry.ExternalID);
        }
        const runView = vi.fn(async () => ({ Success: true, Results: channelRows }));
        const provider = {
            GetEntityObject: vi.fn(async (name: string) => {
                if (name === 'MJ: AI Agent Sessions') {
                    const entity: Record<string, unknown> = {
                        Load: vi.fn(async (id: string) => {
                            const row = chain[id];
                            if (!row) return false;
                            entity.ID = id;
                            entity.UserID = row.UserID;
                            entity.ConversationID = row.ConversationID;
                            entity.LastSessionID = row.LastSessionID ?? null;
                            return true;
                        }),
                    };
                    return entity;
                }
                if (name === 'MJ: Conversations') {
                    const conv: Record<string, unknown> = {
                        Load: vi.fn(async (id: string) => {
                            if (!conversations.has(id)) return false;
                            conv.ID = id;
                            conv.ExternalID = conversations.get(id) ?? null;
                            return true;
                        }),
                    };
                    return conv;
                }
                throw new Error(`Unexpected entity ${name}`);
            }),
            RunView: runView,
        } as unknown as IMetadataProvider;
        return { provider, runView };
    }

    type InternalPriorReaders = {
        loadPriorChannelStatesJson: (
            lastSessionID: string | undefined,
            contextUser: UserInfo,
            provider: IMetadataProvider,
        ) => Promise<string | null>;
        collectOwnedPriorLegIDs: (
            headSessionID: string,
            contextUser: UserInfo,
            provider: IMetadataProvider,
        ) => Promise<string[]>;
    };

    it('loadPriorChannelStatesJson restores state for the owning anonymous visitor and refuses another anonymous visitor sharing UserID', async () => {
        const { provider, runView } = makeChainProvider(
            {
                [PRIOR_SESSION_1]: { UserID: ANON, ConversationID: CONV, ExternalID: 'visitor-A' },
            },
            [{ Channel: 'Whiteboard', Config: '{"items":[1]}' }],
        );
        const resolver = new RealtimeClientSessionResolver() as unknown as InternalPriorReaders;

        const denied = await resolver.loadPriorChannelStatesJson(PRIOR_SESSION_1, guest('visitor-B'), provider);
        expect(denied).toBeNull();
        expect(runView).not.toHaveBeenCalled();

        const allowed = await resolver.loadPriorChannelStatesJson(PRIOR_SESSION_1, guest('visitor-A'), provider);
        expect(allowed).toBe(JSON.stringify({ Whiteboard: '{"items":[1]}' }));
        expect(runView).toHaveBeenCalledTimes(1);
    });

    it('collectOwnedPriorLegIDs stops walking at a leg owned by another anonymous visitor sharing UserID', async () => {
        const { provider } = makeChainProvider({
            [PRIOR_SESSION_2]: {
                UserID: ANON,
                ConversationID: '22222222-2222-4222-8222-222222222223',
                ExternalID: 'visitor-A',
                LastSessionID: PRIOR_SESSION_1,
            },
            [PRIOR_SESSION_1]: {
                UserID: ANON,
                ConversationID: CONV,
                ExternalID: 'visitor-B',
            },
        });
        const resolver = new RealtimeClientSessionResolver() as unknown as InternalPriorReaders;

        const legsForB = await resolver.collectOwnedPriorLegIDs(PRIOR_SESSION_2, guest('visitor-B'), provider);
        expect(legsForB).toEqual([]);

        const legsForA = await resolver.collectOwnedPriorLegIDs(PRIOR_SESSION_2, guest('visitor-A'), provider);
        expect(legsForA).toEqual([PRIOR_SESSION_2]);
    });
});
