/**
 * Unit tests for TeamsAdapter.
 *
 * Tests Teams-specific behavior: activity mapping, bot mention detection,
 * mention stripping, typing indicator, streaming messages, final messages,
 * and Adaptive Card formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamsAdapter } from '../teams/TeamsAdapter.js';
import { MessagingAdapterSettings, IncomingMessage } from '../base/types.js';

// ─── Mock botbuilder ─────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
    const sendActivity = vi.fn().mockResolvedValue({ id: 'activity-id-1' });
    const updateActivity = vi.fn().mockResolvedValue({});
    const getConversationReference = vi.fn().mockReturnValue({ conversation: { id: 'conv-1' } });
    return { sendActivity, updateActivity, getConversationReference };
});

vi.mock('botbuilder', () => {
    return {
        TurnContext: {
            getConversationReference: mocks.getConversationReference
        },
        ActivityTypes: {
            Typing: 'typing',
            Message: 'message'
        },
        CloudAdapter: vi.fn(),
        ConfigurationBotFrameworkAuthentication: vi.fn(),
    };
});

// Mock external MJ dependencies
vi.mock('@memberjunction/core', async (importOriginal) => {
    const orig = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...orig, RunView: vi.fn(), LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@memberjunction/generic-database-provider', () => {
    // Models the real UserCache: BaseSingleton's constructor returns the shared instance, and
    // `Instance` is the only supported accessor (see BaseMessagingAdapter.test.ts for the full
    // note — `new UserCache()` wipes the shared cache and is why this mock must expose Instance).
    const users = [{ ID: 'fallback', Email: 'bot@company.com', Name: 'Service Account' }];
    const store: { instance?: MockUserCache } = {};
    class MockUserCache {
        _users = users;
        get Users() { return this._users; }
        static get Instance(): MockUserCache {
            if (!store.instance) store.instance = new MockUserCache();
            return store.instance;
        }
    }
    return { UserCache: MockUserCache };
});

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: vi.fn().mockImplementation(() => ({
        RunAgent: vi.fn().mockResolvedValue({ success: true, payload: 'ok', agentRun: { Steps: [] } })
    }))
}));

// ─── Test setup ──────────────────────────────────────────────────────────────

const defaultSettings: MessagingAdapterSettings = {
    DefaultAgentName: 'Sage',
    ContextUserEmail: 'bot@company.com',
    BotToken: '',
    MicrosoftAppId: 'ms-app-id-123',
    MicrosoftAppPassword: 'ms-app-password',
    MaxThreadMessages: 50,
    ShowTypingIndicator: true,
    StreamingUpdateIntervalMs: 1000,
};

function createMockTurnContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        activity: {
            id: 'activity-1',
            text: 'Hello Teams bot',
            from: { id: 'user-teams-1', name: 'Test User' },
            channelId: 'msteams',
            conversation: { id: 'conv-1', conversationType: 'personal' },
            timestamp: new Date().toISOString(),
            entities: [],
            ...overrides,
        },
        sendActivity: mocks.sendActivity,
        updateActivity: mocks.updateActivity,
    };
}

async function createInitializedAdapter(
    settings?: Partial<MessagingAdapterSettings>,
    agents: Array<{ ID: string; Name: string }> = [{ ID: 'agent-guid-123', Name: 'Default Agent' }]
): Promise<TeamsAdapter> {
    const { RunView } = await import('@memberjunction/core');
    vi.mocked(RunView).mockImplementation(() => ({
        RunView: vi.fn().mockResolvedValue({
            Success: true,
            Results: agents
        })
    }) as ReturnType<typeof vi.fn>);

    const adapter = new TeamsAdapter({ ...defaultSettings, ...settings });
    await adapter.Initialize();
    return adapter;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TeamsAdapter', () => {
    beforeEach(() => {
        mocks.sendActivity.mockReset().mockResolvedValue({ id: 'activity-id-1' });
        mocks.updateActivity.mockReset().mockResolvedValue({});
        mocks.getConversationReference.mockReset().mockReturnValue({ conversation: { id: 'conv-1' } });
    });

    describe('MapTeamsActivity', () => {
        let adapter: TeamsAdapter;

        beforeEach(async () => {
            adapter = await createInitializedAdapter();
        });

        it('should map a personal (DM) activity correctly', () => {
            const turnContext = createMockTurnContext();
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.MessageID).toBe('activity-1');
            expect(msg.Text).toBe('Hello Teams bot');
            expect(msg.SenderID).toBe('user-teams-1');
            expect(msg.SenderName).toBe('Test User');
            expect(msg.ChannelID).toBe('msteams');
            expect(msg.ThreadID).toBe('conv-1');
            expect(msg.IsDirectMessage).toBe(true);
            expect(msg.IsBotMention).toBe(false);
        });

        it('should map a channel activity correctly', () => {
            const turnContext = createMockTurnContext({
                conversation: { id: 'conv-channel', conversationType: 'channel' },
            });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.IsDirectMessage).toBe(false);
        });

        it('should map a group chat activity correctly', () => {
            const turnContext = createMockTurnContext({
                conversation: { id: 'conv-group', conversationType: 'groupChat' },
            });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.IsDirectMessage).toBe(false);
            expect(msg.ThreadID).toBe('conv-group');
        });

        // Regression: Teams used to leave MentionedAgentNames unset, so `resolveAgent` fell
        // straight through to the default agent and no other agent was reachable from Teams
        // at all. These assert the field is POPULATED — the routing decision itself is
        // BaseMessagingAdapter's and is covered there.
        it('should extract a mentioned agent name so Teams can route past the default', async () => {
            const multi = await createInitializedAdapter(undefined, [
                { ID: 'agent-guid-123', Name: 'Default Agent' },
                { ID: 'agent-guid-456', Name: 'Sage' },
            ]);
            const turnContext = createMockTurnContext({ text: '@Sage hi' });
            const msg = multi.MapTeamsActivity(turnContext as never);

            expect(msg.MentionedAgentNames).toEqual(['Sage']);
        });

        it('should extract no agent names when none is mentioned', () => {
            const turnContext = createMockTurnContext({ text: 'Hello Teams bot' });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.MentionedAgentNames).toEqual([]);
        });

        // The bot's own Teams mention arrives as `<at>Name</at>`. If that were matched as an
        // agent mention, every addressed message would "name" an agent and thread affinity
        // would key off the bot instead of the human's choice.
        it('should not treat the bot\'s own <at> mention as an agent mention', async () => {
            const multi = await createInitializedAdapter(undefined, [
                { ID: 'agent-guid-123', Name: 'Default Agent' },
                { ID: 'agent-guid-456', Name: 'Sage' },
            ]);
            const turnContext = createMockTurnContext({ text: '<at>Sage</at> what is the status' });
            const msg = multi.MapTeamsActivity(turnContext as never);

            expect(msg.MentionedAgentNames).toEqual([]);
        });

        it('should extract sender email when available', () => {
            const turnContext = createMockTurnContext({
                from: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
            });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.SenderEmail).toBe('alice@example.com');
        });

        it('should handle missing sender email gracefully', () => {
            const turnContext = createMockTurnContext({
                from: { id: 'user-1', name: 'Bob' },
            });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.SenderEmail).toBeUndefined();
        });

        it('should handle missing activity id', () => {
            const turnContext = createMockTurnContext({ id: undefined });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.MessageID).toBe('');
        });

        it('should handle missing text', () => {
            const turnContext = createMockTurnContext({ text: undefined });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.Text).toBe('');
        });

        it('should store conversation reference', () => {
            const turnContext = createMockTurnContext();
            adapter.MapTeamsActivity(turnContext as never);

            expect(mocks.getConversationReference).toHaveBeenCalled();
        });

        it('should set RawEvent with activity and turnContext', () => {
            const turnContext = createMockTurnContext();
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.RawEvent).toBeDefined();
            expect((msg.RawEvent as Record<string, unknown>)['turnContext']).toBe(turnContext);
        });

        it('should use current date when activity has no timestamp', () => {
            const before = Date.now();
            const turnContext = createMockTurnContext({ timestamp: undefined });
            const msg = adapter.MapTeamsActivity(turnContext as never);
            const after = Date.now();

            expect(msg.Timestamp.getTime()).toBeGreaterThanOrEqual(before);
            expect(msg.Timestamp.getTime()).toBeLessThanOrEqual(after);
        });
    });

    describe('hasBotMention (via MapTeamsActivity)', () => {
        let adapter: TeamsAdapter;

        beforeEach(async () => {
            adapter = await createInitializedAdapter();
        });

        it('should detect bot mention when bot ID matches entity', () => {
            const turnContext = createMockTurnContext({
                entities: [
                    {
                        type: 'mention',
                        mentioned: { id: 'ms-app-id-123', name: 'TestBot' }
                    }
                ]
            });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.IsBotMention).toBe(true);
        });

        it('should not detect mention when mentioned ID does not match bot', () => {
            const turnContext = createMockTurnContext({
                entities: [
                    {
                        type: 'mention',
                        mentioned: { id: 'other-user-id', name: 'OtherUser' }
                    }
                ]
            });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.IsBotMention).toBe(false);
        });

        it('should not detect mention when entity type is not mention', () => {
            const turnContext = createMockTurnContext({
                entities: [
                    { type: 'clientInfo', locale: 'en-US' }
                ]
            });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.IsBotMention).toBe(false);
        });

        it('should not detect mention when entities array is empty', () => {
            const turnContext = createMockTurnContext({ entities: [] });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.IsBotMention).toBe(false);
        });

        it('should not detect mention when entities is undefined', () => {
            const turnContext = createMockTurnContext({ entities: undefined });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.IsBotMention).toBe(false);
        });

        it('should detect bot mention among multiple entities', () => {
            const turnContext = createMockTurnContext({
                entities: [
                    { type: 'clientInfo', locale: 'en-US' },
                    { type: 'mention', mentioned: { id: 'other-user', name: 'User' } },
                    { type: 'mention', mentioned: { id: 'ms-app-id-123', name: 'Bot' } },
                ]
            });
            const msg = adapter.MapTeamsActivity(turnContext as never);

            expect(msg.IsBotMention).toBe(true);
        });
    });

    describe('stripBotMention (via HandleMessage text processing)', () => {
        let adapter: TeamsAdapter;

        beforeEach(async () => {
            adapter = await createInitializedAdapter();
        });

        it('should strip <at>BotName</at> from text', () => {
            // Access the protected method via a typed cast
            const result = (adapter as unknown as { stripBotMention(text: string): string }).stripBotMention(
                '<at>TestBot</at> what is the weather?'
            );
            expect(result).toBe('what is the weather?');
        });

        it('should handle multiple <at> mentions', () => {
            const result = (adapter as unknown as { stripBotMention(text: string): string }).stripBotMention(
                '<at>Bot1</at> hello <at>Bot2</at> world'
            );
            expect(result).toBe('hello  world');
        });

        it('should return original text when no mentions present', () => {
            const result = (adapter as unknown as { stripBotMention(text: string): string }).stripBotMention(
                'just a regular message'
            );
            expect(result).toBe('just a regular message');
        });

        it('should handle empty string', () => {
            const result = (adapter as unknown as { stripBotMention(text: string): string }).stripBotMention('');
            expect(result).toBe('');
        });
    });

    describe('showTypingIndicator', () => {
        it('should send a Typing activity', async () => {
            const adapter = await createInitializedAdapter();
            const turnContext = createMockTurnContext();
            const msg = adapter.MapTeamsActivity(turnContext as never);

            // Invoke HandleMessage which triggers typing indicator
            await adapter.HandleMessage(msg);

            const typingCall = mocks.sendActivity.mock.calls.find(
                (call: Record<string, unknown>[]) => (call[0] as Record<string, unknown>).type === 'typing'
            );
            expect(typingCall).toBeDefined();
        });

        it('should not send typing when disabled', async () => {
            const adapter = await createInitializedAdapter({ ShowTypingIndicator: false });
            const turnContext = createMockTurnContext();
            const msg = adapter.MapTeamsActivity(turnContext as never);

            await adapter.HandleMessage(msg);

            const typingCall = mocks.sendActivity.mock.calls.find(
                (call: Record<string, unknown>[]) => (call[0] as Record<string, unknown>).type === 'typing'
            );
            expect(typingCall).toBeUndefined();
        });
    });

    describe('sendOrUpdateStreamingMessage', () => {
        let adapter: TeamsAdapter;

        beforeEach(async () => {
            adapter = await createInitializedAdapter();
        });

        it('should send a new message when no existing message ID', async () => {
            const turnContext = createMockTurnContext();
            const msg: IncomingMessage = {
                MessageID: 'act-1',
                Text: 'hello',
                SenderID: 'user-1',
                SenderName: 'User',
                ChannelID: 'msteams',
                ThreadID: null,
                IsDirectMessage: true,
                IsBotMention: false,
                Timestamp: new Date(),
                RawEvent: { turnContext }
            };

            const sendOrUpdate = (adapter as unknown as {
                sendOrUpdateStreamingMessage(msg: IncomingMessage, content: string, existingId: string | null): Promise<string>
            }).sendOrUpdateStreamingMessage.bind(adapter);

            const result = await sendOrUpdate(msg, 'streaming content', null);

            expect(mocks.sendActivity).toHaveBeenCalledWith('streaming content ...');
            expect(result).toBe('activity-id-1');
        });

        it('should update existing message when message ID provided', async () => {
            const turnContext = createMockTurnContext();
            const msg: IncomingMessage = {
                MessageID: 'act-1',
                Text: 'hello',
                SenderID: 'user-1',
                SenderName: 'User',
                ChannelID: 'msteams',
                ThreadID: null,
                IsDirectMessage: true,
                IsBotMention: false,
                Timestamp: new Date(),
                RawEvent: { turnContext }
            };

            const sendOrUpdate = (adapter as unknown as {
                sendOrUpdateStreamingMessage(msg: IncomingMessage, content: string, existingId: string | null): Promise<string>
            }).sendOrUpdateStreamingMessage.bind(adapter);

            const result = await sendOrUpdate(msg, 'updated content', 'existing-msg-id');

            expect(mocks.updateActivity).toHaveBeenCalledWith(expect.objectContaining({
                id: 'existing-msg-id',
                text: 'updated content ...'
            }));
            expect(result).toBe('existing-msg-id');
        });
    });

    describe('sendFinalMessage', () => {
        it('should send message with Adaptive Card attachment', async () => {
            const adapter = await createInitializedAdapter();
            const turnContext = createMockTurnContext();
            const msg: IncomingMessage = {
                MessageID: 'act-1',
                Text: 'hello',
                SenderID: 'user-1',
                SenderName: 'User',
                ChannelID: 'msteams',
                ThreadID: null,
                IsDirectMessage: true,
                IsBotMention: false,
                Timestamp: new Date(),
                RawEvent: { turnContext }
            };

            const sendFinal = (adapter as unknown as {
                sendFinalMessage(msg: IncomingMessage, response: { PlainText: string; RichPayload: Record<string, unknown> }): Promise<void>
            }).sendFinalMessage.bind(adapter);

            await sendFinal(msg, {
                PlainText: 'Hello world',
                RichPayload: { type: 'AdaptiveCard', body: [] }
            });

            expect(mocks.sendActivity).toHaveBeenCalledWith(expect.objectContaining({
                type: 'message',
                attachments: [
                    {
                        contentType: 'application/vnd.microsoft.card.adaptive',
                        content: { type: 'AdaptiveCard', body: [] }
                    }
                ]
            }));
            // text should NOT be present — it causes duplicate content in Web Chat/Teams
            const sentActivity = mocks.sendActivity.mock.calls[0][0] as Record<string, unknown>;
            expect(sentActivity.text).toBeUndefined();
        });
    });

    describe('updateFinalMessage', () => {
        it('should update message with Adaptive Card attachment', async () => {
            const adapter = await createInitializedAdapter();
            const turnContext = createMockTurnContext();
            const msg: IncomingMessage = {
                MessageID: 'act-1',
                Text: 'hello',
                SenderID: 'user-1',
                SenderName: 'User',
                ChannelID: 'msteams',
                ThreadID: null,
                IsDirectMessage: true,
                IsBotMention: false,
                Timestamp: new Date(),
                RawEvent: { turnContext }
            };

            const updateFinal = (adapter as unknown as {
                updateFinalMessage(msg: IncomingMessage, msgId: string, response: { PlainText: string; RichPayload: Record<string, unknown> }): Promise<void>
            }).updateFinalMessage.bind(adapter);

            await updateFinal(msg, 'msg-to-update', {
                PlainText: 'Final response',
                RichPayload: { type: 'AdaptiveCard', body: [] }
            });

            expect(mocks.updateActivity).toHaveBeenCalledWith(expect.objectContaining({
                id: 'msg-to-update',
                type: 'message',
                attachments: [
                    {
                        contentType: 'application/vnd.microsoft.card.adaptive',
                        content: { type: 'AdaptiveCard', body: [] }
                    }
                ]
            }));
        });
    });

    describe('formatResponse', () => {
        it('should return PlainText and Adaptive Card RichPayload', async () => {
            const adapter = await createInitializedAdapter();
            const formatResp = (adapter as unknown as {
                formatResponse(result: unknown, agent: unknown, text: string): Promise<{ PlainText: string; RichPayload: Record<string, unknown> }>
            }).formatResponse.bind(adapter);

            const mockAgent = { Name: 'TestBot', LogoURL: null };
            const result = await formatResp(null, mockAgent, '# Hello\n\nThis is **bold**.');

            expect(result.PlainText).toBe('# Hello\n\nThis is **bold**.');
            expect(result.RichPayload).toHaveProperty('type', 'AdaptiveCard');
            expect(result.RichPayload).toHaveProperty('version', '1.4');
            expect(result.RichPayload).toHaveProperty('body');
            expect(Array.isArray(result.RichPayload.body)).toBe(true);
        });
    });

    describe('fetchThreadHistory', () => {
        it('should return empty array (not yet implemented)', async () => {
            const adapter = await createInitializedAdapter();
            const fetchHistory = (adapter as unknown as {
                fetchThreadHistory(channelId: string, threadId: string): Promise<IncomingMessage[]>
            }).fetchThreadHistory.bind(adapter);

            const result = await fetchHistory('channel-1', 'thread-1');
            expect(result).toEqual([]);
        });
    });

    describe('lookupUserEmail', () => {
        it('should return null (Graph API not yet implemented)', async () => {
            const adapter = await createInitializedAdapter();
            const lookup = (adapter as unknown as {
                lookupUserEmail(userId: string): Promise<string | null>
            }).lookupUserEmail.bind(adapter);

            const result = await lookup('user-teams-1');
            expect(result).toBeNull();
        });
    });

    describe('getBotUserId', () => {
        it('should return the MicrosoftAppId', async () => {
            const adapter = await createInitializedAdapter();
            const getBotId = (adapter as unknown as {
                getBotUserId(): string
            }).getBotUserId.bind(adapter);

            expect(getBotId()).toBe('ms-app-id-123');
        });

        it('should fall back to env variable when setting not provided', async () => {
            const origEnv = process.env.MICROSOFT_APP_ID;
            process.env.MICROSOFT_APP_ID = 'env-app-id';

            const adapter = await createInitializedAdapter({ MicrosoftAppId: undefined });
            const getBotId = (adapter as unknown as {
                getBotUserId(): string
            }).getBotUserId.bind(adapter);

            expect(getBotId()).toBe('env-app-id');
            process.env.MICROSOFT_APP_ID = origEnv;
        });
    });
});
