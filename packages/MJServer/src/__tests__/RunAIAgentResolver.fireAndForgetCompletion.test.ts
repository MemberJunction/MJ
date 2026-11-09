/**
 * @fileoverview A fire-and-forget run always ends with one completion on the caller's socket.
 *
 * The widget and Explorer return as soon as the mutation acks, then wait for a `complete` status message. When the
 * run fails (the agent cannot be validated, the run throws, or the agent's reply row cannot be saved), that message
 * must still arrive, exactly once, with the reason, addressed to the owner the caller's socket is authenticated as.
 * For a widget guest that is the guest, not the system user its run is elevated to. Without it the client waits for
 * its idle timeout and then reconciles the run as a success.
 *
 * The liveness pulse of the same run is addressed to the same owner.
 */
import 'reflect-metadata'; // must precede any type-graphql decorator evaluation
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PubSubEngine } from 'type-graphql';

vi.mock('type-graphql', () => {
    const decoratorFactory = (..._args: unknown[]) => (..._decorated: unknown[]) => undefined;
    const exportNames = [
        'Resolver', 'Query', 'Mutation', 'Subscription', 'Arg', 'Args', 'ArgsType', 'Ctx', 'Root',
        'Info', 'Field', 'FieldResolver', 'ObjectType', 'InputType', 'InterfaceType', 'Authorized',
        'UseMiddleware', 'Extensions', 'Directive', 'ID', 'Int', 'Float', 'GraphQLISODateTime',
        'GraphQLTimestamp', 'registerEnumType', 'createMethodDecorator', 'createParamDecorator',
        'buildSchema', 'buildSchemaSync', 'PubSub',
    ];
    return Object.fromEntries(exportNames.map((name) => [name, decoratorFactory]));
});

const hoisted = vi.hoisted(() => ({
    runAgentInConversation: vi.fn(),
    agents: new Map<string, { ID: string; Name: string; Status: string }>(),
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: async () => undefined,
            GetAgentByID: (id: string) => hoisted.agents.get(id),
            CanUserRunAgent: async () => true,
        },
    },
    GetAttachmentService: () => ({}),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgentInConversation(...args: unknown[]) {
            return hoisted.runAgentInConversation(...args);
        }
    },
    ArtifactToolManager: class {},
}));

import { UserInfo } from '@memberjunction/core';
import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import { StatusUpdateOwnerID } from '../generic/PushStatusResolver.js';
import { DEFAULT_PULSE_INTERVAL_MS, HEARTBEAT_MESSAGE_TYPE } from '../generic/FireAndForgetHeartbeat.js';
import type { AppContext, UserPayload } from '../types.js';

const ANONYMOUS_USER_ID = 'AAAAAAAA-0000-4000-8000-0000000000A0';
const SYSTEM_USER_ID = 'BBBBBBBB-0000-4000-8000-0000000000B0';
const SESSION = 'session-1';

/** A public-widget guest: the shared Anonymous user, told apart by its scope identity. */
function widgetGuest(): UserInfo {
    const guest = new UserInfo(null, { ID: ANONYMOUS_USER_ID, Email: 'anonymous@magic-link.local' });
    guest.IsMagicLinkAnonymous = true;
    guest.AnonymousVisitorID = 'sid-guest-1';
    return guest;
}

/** The payload a widget guest's run executes under: elevated to the system user, standing in for the guest. */
function elevatedGuestPayload(): UserPayload {
    return {
        sessionId: SESSION,
        email: 'system@example.com',
        userRecord: new UserInfo(null, { ID: SYSTEM_USER_ID, Email: 'system@example.com' }),
        ElevatedFrom: widgetGuest(),
    };
}

interface PublishedEnvelope {
    sessionId: string;
    ownerUserId: string;
    message: { resolver: string; type: string; data: Record<string, unknown> };
}

function makePubSub(): { pubSub: PubSubEngine; published: () => PublishedEnvelope[] } {
    const publish = vi.fn().mockResolvedValue(undefined);
    const pubSub: PubSubEngine = { publish, subscribe: vi.fn(), unsubscribe: vi.fn(), asyncIterator: vi.fn() };
    const published = (): PublishedEnvelope[] =>
        publish.mock.calls.map((call) => {
            const payload = call[1] as { sessionId: string; ownerUserId: string; message: string };
            return { sessionId: payload.sessionId, ownerUserId: payload.ownerUserId, message: JSON.parse(payload.message) };
        });
    return { pubSub, published };
}

function completions(envelopes: PublishedEnvelope[]): PublishedEnvelope[] {
    return envelopes.filter((e) => e.message.type === 'StreamingContent' && e.message.data.type === 'complete');
}

/** Starts the public RunAIAgent mutation in fire-and-forget mode for `agentId`, answering into `reply-1`. */
async function startFireAndForget(pubSub: PubSubEngine, userPayload: UserPayload, agentId = 'agent-1') {
    const ctx = { userPayload, providers: [], dataSource: {} } as AppContext;
    return new RunAIAgentResolver().RunAIAgent(
        agentId, ctx, '[{"role":"user","content":"hi"}]', SESSION, pubSub,
        undefined, undefined, undefined, undefined, undefined, undefined,
        'reply-1', // conversationDetailId
        undefined, undefined, undefined, undefined,
        true, // fireAndForget
    );
}

/** Lets the background run settle, then gives any late (double) publish a chance to land. */
async function settle(published: () => PublishedEnvelope[]): Promise<void> {
    await vi.waitFor(() => expect(completions(published()).length).toBeGreaterThan(0), { timeout: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeEach(() => {
    hoisted.agents.clear();
    hoisted.agents.set('agent-1', { ID: 'agent-1', Name: 'Research', Status: 'Active' });
    hoisted.runAgentInConversation.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('RunAIAgent fire-and-forget — the failure completion', () => {
    it("publishes one failed completion with the reason when the agent's reply cannot be saved, to the guest's socket", async () => {
        const reason = "The agent's reply could not be saved: Message exceeds the maximum length";
        hoisted.runAgentInConversation.mockRejectedValue(new Error(reason));
        const { pubSub, published } = makePubSub();
        const userPayload = elevatedGuestPayload();

        const ack = await startFireAndForget(pubSub, userPayload);
        expect(ack.success).toBe(true); // the ack only says the run started

        await settle(published);
        const done = completions(published());
        expect(done).toHaveLength(1);
        expect(done[0].message.data).toMatchObject({
            type: 'complete',
            success: false,
            errorMessage: reason,
            conversationDetailId: 'reply-1',
        });
        expect(done[0].sessionId).toBe(SESSION);
        // The guest's owner key, never the system user the run was elevated to.
        expect(done[0].ownerUserId).toBe(StatusUpdateOwnerID(userPayload));
        expect(done[0].ownerUserId).toBe(`${ANONYMOUS_USER_ID.toLowerCase()}|sid-guest-1`);
    });

    it('publishes one failed completion when the run fails before the agent starts (agent not runnable)', async () => {
        const { pubSub, published } = makePubSub();

        await startFireAndForget(pubSub, elevatedGuestPayload(), 'missing-agent');

        await settle(published);
        const done = completions(published());
        expect(done).toHaveLength(1);
        expect(done[0].message.data).toMatchObject({
            success: false,
            errorMessage: 'AI Agent with ID missing-agent not found',
            conversationDetailId: 'reply-1',
        });
        expect(hoisted.runAgentInConversation).not.toHaveBeenCalled();
    });

    it('publishes only the run\'s own completion when the run returns a failed result (no second completion)', async () => {
        const run = { ID: 'run-1', ConversationDetailID: 'reply-1', ErrorMessage: 'model refused', Steps: [] };
        hoisted.runAgentInConversation.mockResolvedValue({
            agentResult: { success: false, agentRun: run },
            agentResponseDetailId: 'reply-1',
            conversationId: 'conv-1',
        });
        const { pubSub, published } = makePubSub();

        await startFireAndForget(pubSub, elevatedGuestPayload());

        await settle(published);
        const done = completions(published());
        expect(done).toHaveLength(1);
        expect(done[0].message.data).toMatchObject({ agentRunId: 'run-1', success: false, errorMessage: 'model refused' });
    });
});

describe("RunAIAgent fire-and-forget — the liveness pulse", () => {
    it("addresses heartbeats to the guest's owner key, not to the elevated system user", async () => {
        vi.useFakeTimers();
        hoisted.runAgentInConversation.mockReturnValue(new Promise(() => undefined)); // the run is still going
        const { pubSub, published } = makePubSub();
        const userPayload = elevatedGuestPayload();

        await startFireAndForget(pubSub, userPayload);
        await vi.advanceTimersByTimeAsync(DEFAULT_PULSE_INTERVAL_MS);

        const heartbeats = published().filter((e) => e.message.type === HEARTBEAT_MESSAGE_TYPE);
        expect(heartbeats.length).toBeGreaterThan(0);
        for (const heartbeat of heartbeats) {
            expect(heartbeat.ownerUserId).toBe(StatusUpdateOwnerID(userPayload));
            expect(heartbeat.ownerUserId).not.toBe(SYSTEM_USER_ID);
        }
    });
});
