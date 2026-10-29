import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { AppContext } from '../types.js';

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator,
        Mutation: noopDecorator,
        Arg: noopDecorator,
        Ctx: noopDecorator,
        ObjectType: noopDecorator,
        Field: noopDecorator,
    };
});

vi.mock('../generic/ResolverBase.js', () => ({
    ResolverBase: class {
        protected GetUserFromPayload(payload?: { userRecord?: UserInfo }): UserInfo | undefined {
            return payload?.userRecord;
        }
    },
}));

const closeSessionMock = vi.fn(async () => true);
const heartbeatMock = vi.fn(async () => true);

vi.mock('../agentSessions/index.js', () => ({
    SessionManager: class {
        CloseSession = closeSessionMock;
        Heartbeat = heartbeatMock;
    },
    SessionAuthorizationError: class extends Error {},
}));

import { AgentSessionResolver } from '../resolvers/AgentSessionResolver.js';

const uuid = (a: string, b: string) =>
    [a.repeat(8), b.repeat(4), '4' + b.repeat(3), '8' + b.repeat(3), b.repeat(12)].join('-');
const ANON = uuid('A', '0');
const SESSION = uuid('1', '1');
const CONVERSATION = uuid('2', '2');

const guest = (visitorId: string) =>
    ({
        ID: ANON,
        IsMagicLinkAnonymous: true,
        // An unscoped multi-use invite: redemptions are told apart by mj_sid (a resource scope would be shared).
        AnonymousVisitorID: visitorId,
    }) as unknown as UserInfo;

function makeProvider(sessionFound = true, externalId = 'visitor-1'): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async (entityName: string) =>
            entityName === 'MJ: AI Agent Sessions'
                ? { UserID: ANON, ConversationID: CONVERSATION, Load: vi.fn(async () => sessionFound) }
                : { ExternalID: externalId, Load: vi.fn(async () => true) },
        ),
    } as unknown as IMetadataProvider;
}

function makeCtx(user: UserInfo, provider: IMetadataProvider): AppContext {
    return {
        userPayload: { email: 'anonymous@magic-link.local', sessionId: 's', userRecord: user },
        providers: [{ provider, type: 'Read-Write' }],
    } as unknown as AppContext;
}

describe('AgentSessionResolver anonymous visitor ownership', () => {
    beforeEach(() => {
        closeSessionMock.mockClear();
        heartbeatMock.mockClear();
    });

    it('CloseAgentSession allows the matching anonymous visitor and refuses a second anonymous visitor', async () => {
        const resolver = new AgentSessionResolver();
        const provider = makeProvider(true, 'visitor-1');

        await expect(resolver.CloseAgentSession(SESSION, makeCtx(guest('visitor-1'), provider))).resolves.toBe(true);
        expect(closeSessionMock).toHaveBeenCalledOnce();

        await expect(resolver.CloseAgentSession(SESSION, makeCtx(guest('visitor-2'), provider))).rejects.toThrow(
            'Not authorized: you do not own this agent session',
        );
        expect(closeSessionMock).toHaveBeenCalledOnce();
    });

    it('AgentSessionHeartbeat allows the matching anonymous visitor and refuses a second anonymous visitor', async () => {
        const resolver = new AgentSessionResolver();
        const provider = makeProvider(true, 'visitor-1');

        await expect(resolver.AgentSessionHeartbeat(SESSION, makeCtx(guest('visitor-1'), provider))).resolves.toBe(true);
        expect(heartbeatMock).toHaveBeenCalledOnce();

        await expect(resolver.AgentSessionHeartbeat(SESSION, makeCtx(guest('visitor-2'), provider))).rejects.toThrow(
            'Not authorized: you do not own this agent session',
        );
        expect(heartbeatMock).toHaveBeenCalledOnce();
    });

    it('throws the expected not-found message when the session does not exist', async () => {
        const resolver = new AgentSessionResolver();
        const provider = makeProvider(false);

        await expect(resolver.CloseAgentSession(SESSION, makeCtx(guest('visitor-1'), provider))).rejects.toThrow(
            `Agent session ${SESSION} not found`,
        );
        await expect(resolver.AgentSessionHeartbeat(SESSION, makeCtx(guest('visitor-1'), provider))).rejects.toThrow(
            `Agent session ${SESSION} not found`,
        );
    });
});

describe('CloseAgentSession close reason (MJ#6013)', () => {
    beforeEach(() => closeSessionMock.mockClear());

    it('passes a client-reportable reason through, so a start that failed is recorded as an Error', async () => {
        const resolver = new AgentSessionResolver();
        const provider = makeProvider(true, 'visitor-1');
        await expect(resolver.CloseAgentSession(SESSION, makeCtx(guest('visitor-1'), provider), 'Error')).resolves.toBe(true);
        expect(closeSessionMock).toHaveBeenCalledWith(SESSION, expect.anything(), provider, 'Error');
    });

    it('defaults to Explicit when the client sends no reason (older clients)', async () => {
        const resolver = new AgentSessionResolver();
        const provider = makeProvider(true, 'visitor-1');
        await expect(resolver.CloseAgentSession(SESSION, makeCtx(guest('visitor-1'), provider))).resolves.toBe(true);
        expect(closeSessionMock).toHaveBeenCalledWith(SESSION, expect.anything(), provider, 'Explicit');
    });

    it('a client may not stamp TimeLimit or Idle (the janitor decides those)', async () => {
        const resolver = new AgentSessionResolver();
        const provider = makeProvider(true, 'visitor-1');
        const ctx = makeCtx(guest('visitor-1'), provider);
        await expect(resolver.CloseAgentSession(SESSION, ctx, 'TimeLimit')).rejects.toThrow(/Unsupported close reason/);
        await expect(resolver.CloseAgentSession(SESSION, ctx, 'Idle')).rejects.toThrow(/Unsupported close reason/);
        expect(closeSessionMock).not.toHaveBeenCalled();
    });

    it('refuses a reason only the server may stamp', async () => {
        const resolver = new AgentSessionResolver();
        const provider = makeProvider(true, 'visitor-1');
        await expect(resolver.CloseAgentSession(SESSION, makeCtx(guest('visitor-1'), provider), 'Janitor')).rejects.toThrow(/close reason/i);
        expect(closeSessionMock).not.toHaveBeenCalled();
    });
});
