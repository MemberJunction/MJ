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

const closeSessionMock = vi.fn(async () => true);
const heartbeatMock = vi.fn(async () => true);
vi.mock('../../agentSessions/index.js', () => ({
    SessionManager: class {
        CloseSession = closeSessionMock;
        Heartbeat = heartbeatMock;
    },
}));

let currentProvider: unknown;
vi.mock('../../util.js', () => ({
    GetReadWriteProvider: () => currentProvider,
}));

vi.mock('@memberjunction/remote-browser-server', () => ({
    NormalizeInstanceKey: (key?: string) => key,
    RemoteBrowserEngine: {
        Instance: {
            ExecuteActionForAgentSession: vi.fn(),
        },
    },
}));

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Config: vi.fn(), Prompts: [] } } }));
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

// Fixture UUIDs are assembled at runtime so the brief itself carries no record id.
const uuid = (a: string, b: string) => [a.repeat(8), b.repeat(4), '4' + b.repeat(3), '8' + b.repeat(3), b.repeat(12)].join('-');
const ANON = uuid('A', '0');
const NAMED = uuid('B', '0');
const SESSION = uuid('1', '1');
const CONVERSATION = uuid('2', '2');

const guest = (visitorId?: string, sharedResourceId = 'shared-resource') =>
    ({
        ID: ANON,
        IsMagicLinkAnonymous: true,
        AnonymousVisitorID: visitorId,
        MagicLinkScope: { ResourceID: sharedResourceId },
    }) as unknown as UserInfo;

const namedUser = (id = NAMED) => ({ ID: id, IsMagicLinkAnonymous: false }) as unknown as UserInfo;

function provider(opts: {
    sessionLoaded?: boolean;
    sessionUserID?: string;
    conversationID?: string | null;
    conversationLoaded?: boolean;
    externalID?: string | null;
} = {}): IMetadataProvider {
    const sessionLoaded = opts.sessionLoaded ?? true;
    const sessionUserID = opts.sessionUserID ?? ANON;
    const conversationID = opts.conversationID === undefined ? CONVERSATION : opts.conversationID;
    const conversationLoaded = opts.conversationLoaded ?? true;
    const externalID = opts.externalID === undefined ? 'scope-visitor-1' : opts.externalID;
    return {
        GetEntityObject: vi.fn(async (entity: string) =>
            entity === 'MJ: AI Agent Sessions'
                ? {
                      ID: SESSION,
                      UserID: sessionUserID,
                      ConversationID: conversationID,
                      Load: vi.fn(async () => sessionLoaded),
                  }
                : {
                      ID: conversationID,
                      ExternalID: externalID,
                      Load: vi.fn(async () => conversationLoaded),
                  },
        ),
    } as unknown as IMetadataProvider;
}

describe('LoadOwnedRealtimeSession with two anonymous visitors', () => {
    it('allows the visitor whose AnonymousVisitorID matches the conversation ExternalID', async () => {
        await expect(LoadOwnedRealtimeSession(SESSION, guest('scope-visitor-1'), provider())).resolves.toBeDefined();
    });

    it('refuses a second anonymous visitor (same Anonymous user id and shared resource, different AnonymousVisitorID) and logs the reason', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(LoadOwnedRealtimeSession(SESSION, guest('scope-visitor-2'), provider())).rejects.toBeInstanceOf(
            RealtimeSessionOwnershipError,
        );
        const logged = errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
        expect(logged).toContain('scope_mismatch');
        expect(logged).toContain(ANON);
        expect(logged).toContain(SESSION);
        errSpy.mockRestore();
    });

    it('refuses an anonymous visitor with no AnonymousVisitorID', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(LoadOwnedRealtimeSession(SESSION, guest(undefined), provider())).rejects.toBeInstanceOf(
            RealtimeSessionOwnershipError,
        );
        const logged = errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
        expect(logged).toContain('scope_missing');
        errSpy.mockRestore();
    });

    it('refuses an anonymous visitor when the session has no conversation or no ExternalID, while allowing a named user with no conversation', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(
            LoadOwnedRealtimeSession(SESSION, guest('scope-visitor-1'), provider({ conversationID: null })),
        ).rejects.toBeInstanceOf(RealtimeSessionOwnershipError);
        await expect(
            LoadOwnedRealtimeSession(SESSION, guest('scope-visitor-1'), provider({ externalID: null })),
        ).rejects.toBeInstanceOf(RealtimeSessionOwnershipError);
        await expect(
            LoadOwnedRealtimeSession(SESSION, namedUser(), provider({ sessionUserID: NAMED, conversationID: null })),
        ).resolves.toBeDefined();
        errSpy.mockRestore();
    });

    it('throws RealtimeSessionNotFoundError when the session does not exist', async () => {
        await expect(
            LoadOwnedRealtimeSession(SESSION, guest('scope-visitor-1'), provider({ sessionLoaded: false })),
        ).rejects.toBeInstanceOf(RealtimeSessionNotFoundError);
    });
});

describe('AgentSessionResolver write gates with anonymous visitors', () => {
    beforeEach(() => {
        closeSessionMock.mockClear();
        heartbeatMock.mockClear();
    });

    function makeAgentSessionResolver(caller: UserInfo): AgentSessionResolver {
        const r = new AgentSessionResolver();
        (r as unknown as { GetUserFromPayload: () => UserInfo }).GetUserFromPayload = () => caller;
        return r;
    }

    const ctx = { userPayload: { email: 'anon@x', userRecord: {} }, providers: [] } as unknown as AppContext;

    it('CloseAgentSession and AgentSessionHeartbeat refuse another anonymous visitor and never call SessionManager', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        currentProvider = provider({ externalID: 'scope-visitor-1' });
        const resolver = makeAgentSessionResolver(guest('scope-visitor-2'));

        await expect(resolver.CloseAgentSession(SESSION, ctx)).rejects.toThrow(
            'Not authorized: you do not own this agent session',
        );
        await expect(resolver.AgentSessionHeartbeat(SESSION, ctx)).rejects.toThrow(
            'Not authorized: you do not own this agent session',
        );
        expect(closeSessionMock).not.toHaveBeenCalled();
        expect(heartbeatMock).not.toHaveBeenCalled();
        errSpy.mockRestore();
    });

    it('CloseAgentSession and AgentSessionHeartbeat allow the owning anonymous visitor', async () => {
        currentProvider = provider({ externalID: 'scope-visitor-1' });
        const resolver = makeAgentSessionResolver(guest('scope-visitor-1'));

        await expect(resolver.CloseAgentSession(SESSION, ctx)).resolves.toBe(true);
        await expect(resolver.AgentSessionHeartbeat(SESSION, ctx)).resolves.toBe(true);
        expect(closeSessionMock).toHaveBeenCalledOnce();
        expect(heartbeatMock).toHaveBeenCalledOnce();
    });

    it('CloseAgentSession and AgentSessionHeartbeat preserve the not-found message when the session is missing', async () => {
        currentProvider = provider({ sessionLoaded: false });
        const resolver = makeAgentSessionResolver(guest('scope-visitor-1'));

        await expect(resolver.CloseAgentSession(SESSION, ctx)).rejects.toThrow(`Agent session ${SESSION} not found`);
        await expect(resolver.AgentSessionHeartbeat(SESSION, ctx)).rejects.toThrow(`Agent session ${SESSION} not found`);
    });
});

describe('RemoteBrowserActionResolver write gate with anonymous visitors', () => {
    class TestRemoteBrowserResolver extends RemoteBrowserActionResolver {
        public ExposeLoadOwnedSession(
            agentSessionID: string,
            contextUser: UserInfo,
            prov: IMetadataProvider,
        ): Promise<unknown> {
            return this.loadOwnedSession(agentSessionID, contextUser, prov);
        }
    }

    it('refuses another anonymous visitor with the remote-browser ownership error and preserves the not-found message', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const resolver = new TestRemoteBrowserResolver();

        await expect(
            resolver.ExposeLoadOwnedSession(SESSION, guest('scope-visitor-2'), provider({ externalID: 'scope-visitor-1' })),
        ).rejects.toThrow(`Not authorized: remote-browser session ${SESSION} is not owned by you.`);

        await expect(
            resolver.ExposeLoadOwnedSession(SESSION, guest('scope-visitor-1'), provider({ sessionLoaded: false })),
        ).rejects.toThrow(`Remote-browser session ${SESSION} not found.`);

        await expect(
            resolver.ExposeLoadOwnedSession(SESSION, guest('scope-visitor-1'), provider({ externalID: 'scope-visitor-1' })),
        ).resolves.toBeDefined();
        errSpy.mockRestore();
    });
});
