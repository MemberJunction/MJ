import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

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

vi.mock('@memberjunction/remote-browser-server', () => ({
    NormalizeInstanceKey: (key?: string) => key,
    RemoteBrowserEngine: { Instance: {} },
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

// The resolver reads its conversation-browser settings from the server config; off, as by default.
vi.mock('../config.js', () => ({ configInfo: { realtime: { conversationBrowser: { enabled: false } } } }));

import { RemoteBrowserActionResolver, type OwnedBrowserScope } from '../resolvers/RemoteBrowserActionResolver.js';

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
                ? { ID: SESSION, UserID: ANON, ConversationID: CONVERSATION, Load: vi.fn(async () => sessionFound) }
                : { ExternalID: externalId, Load: vi.fn(async (id: string) => id === CONVERSATION) },
        ),
    } as unknown as IMetadataProvider;
}

class TestableRemoteBrowserResolver extends RemoteBrowserActionResolver {
    public async LoadOwned(
        agentSessionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<OwnedBrowserScope> {
        return this.loadOwnedSession(agentSessionID, contextUser, provider);
    }
}

describe('RemoteBrowserActionResolver.loadOwnedSession anonymous visitor ownership', () => {
    it('allows the matching anonymous visitor and refuses a second anonymous visitor', async () => {
        const resolver = new TestableRemoteBrowserResolver();
        const provider = makeProvider(true, 'visitor-1');

        const loaded = await resolver.LoadOwned(SESSION, guest('visitor-1'), provider);
        expect(loaded.ID).toBe(SESSION);

        await expect(resolver.LoadOwned(SESSION, guest('visitor-2'), provider)).rejects.toThrow(
            `Not authorized: remote-browser session ${SESSION} is not owned by you.`,
        );
    });

    it('throws the expected not-found message when the session does not exist', async () => {
        const resolver = new TestableRemoteBrowserResolver();
        const provider = makeProvider(false);

        await expect(resolver.LoadOwned(SESSION, guest('visitor-1'), provider)).rejects.toThrow(
            `Remote-browser session ${SESSION} not found.`,
        );
    });
});
