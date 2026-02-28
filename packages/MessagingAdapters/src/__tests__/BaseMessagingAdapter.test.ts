/**
 * Unit tests for BaseMessagingAdapter.
 *
 * Tests the core orchestration logic: shouldRespond, resolveContextUser,
 * resolveAgent, buildConversationMessages, and extractResponseText.
 *
 * All external dependencies (UserCache, RunView, AgentRunner) are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserInfo, RunView } from '@memberjunction/core';
import { BaseMessagingAdapter } from '../base/BaseMessagingAdapter.js';
import { IncomingMessage, FormattedResponse, MessagingAdapterSettings } from '../base/types.js';

// ─── Mock external modules ──────────────────────────────────────────────────

vi.mock('@memberjunction/sqlserver-dataprovider', () => {
    const users = [
        { ID: 'u1', Email: 'alice@example.com', Name: 'Alice' },
        { ID: 'u2', Email: 'bob@example.com', Name: 'Bob' },
        { ID: 'fallback', Email: 'bot@company.com', Name: 'Service Account' },
    ];

    class MockUserCache {
        get Users() { return users; }
        static get Instance() { return new MockUserCache(); }
        static get Users() { return users; }
    }

    return { UserCache: MockUserCache };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const orig = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...orig,
        RunView: vi.fn(),
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: vi.fn().mockImplementation(() => ({
        RunAgent: vi.fn().mockResolvedValue({
            success: true,
            payload: 'Test response from agent',
            agentRun: {
                Steps: [{
                    OutputData: 'Agent step output text',
                    Status: 'Completed'
                }]
            }
        })
    }))
}));

// ─── Concrete test adapter ──────────────────────────────────────────────────

class TestAdapter extends BaseMessagingAdapter {
    public OnInitializeCalled = false;
    public TypeIndicatorShown = false;
    public SentMessages: { content: string; messageId: string | null }[] = [];
    public FinalMessages: FormattedResponse[] = [];
    public FinalUpdates: { messageId: string; response: FormattedResponse }[] = [];
    public MockBotUserId = 'BOT123';
    public MockLookupEmails: Map<string, string> = new Map();
    public MockThreadHistory: IncomingMessage[] = [];
    public StreamingMessageCounter = 0;

    protected async onInitialize(): Promise<void> {
        this.OnInitializeCalled = true;
    }

    protected async showTypingIndicator(_message: IncomingMessage): Promise<void> {
        this.TypeIndicatorShown = true;
    }

    protected async fetchThreadHistory(_channelId: string, _threadId: string): Promise<IncomingMessage[]> {
        return this.MockThreadHistory;
    }

    protected async sendOrUpdateStreamingMessage(
        _originalMessage: IncomingMessage,
        currentContent: string,
        existingMessageId: string | null
    ): Promise<string> {
        this.StreamingMessageCounter++;
        const msgId = existingMessageId ?? `stream-msg-${this.StreamingMessageCounter}`;
        this.SentMessages.push({ content: currentContent, messageId: existingMessageId });
        return msgId;
    }

    protected async sendFinalMessage(_originalMessage: IncomingMessage, response: FormattedResponse): Promise<void> {
        this.FinalMessages.push(response);
    }

    protected async updateFinalMessage(
        _originalMessage: IncomingMessage,
        messageId: string,
        response: FormattedResponse
    ): Promise<void> {
        this.FinalUpdates.push({ messageId, response });
    }

    protected async formatResponse(markdownText: string): Promise<FormattedResponse> {
        return {
            PlainText: markdownText,
            RichPayload: { formatted: true, text: markdownText }
        };
    }

    protected getBotUserId(): string {
        return this.MockBotUserId;
    }

    protected stripBotMention(text: string): string {
        return text.replace(new RegExp(`<@${this.MockBotUserId}>`, 'g'), '').trim();
    }

    protected async lookupUserEmail(platformUserId: string): Promise<string | null> {
        return this.MockLookupEmails.get(platformUserId) ?? null;
    }

    // Expose protected methods for testing
    public testShouldRespond(msg: IncomingMessage): boolean {
        return this.shouldRespond(msg);
    }

    public testResolveContextUser(msg: IncomingMessage): Promise<UserInfo> {
        return this.resolveContextUser(msg);
    }

    public testResolveAgent(msg: IncomingMessage): Promise<{ agent: unknown; multiAgentNote: string | null }> {
        return this.resolveAgent(msg);
    }
}

// ─── Test helpers ────────────────────────────────────────────────────────────

const defaultSettings: MessagingAdapterSettings = {
    AgentID: 'agent-guid-123',
    ContextUserEmail: 'bot@company.com',
    BotToken: 'xoxb-test-token',
    MaxThreadMessages: 50,
    ShowTypingIndicator: true,
    StreamingUpdateIntervalMs: 1000,
};

function createMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
    return {
        MessageID: 'msg-1',
        Text: 'Hello agent',
        SenderID: 'user-1',
        SenderName: 'Test User',
        ChannelID: 'channel-1',
        ThreadID: null,
        IsDirectMessage: false,
        IsBotMention: false,
        Timestamp: new Date(),
        RawEvent: {},
        ...overrides,
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BaseMessagingAdapter', () => {
    let adapter: TestAdapter;

    beforeEach(() => {
        adapter = new TestAdapter(defaultSettings);
        // Mock RunView for agent lookup
        const mockRunView = {
            RunView: vi.fn().mockResolvedValue({
                Success: true,
                Results: [{ ID: 'agent-guid-123', Name: 'Default Agent' }]
            })
        };
        vi.mocked(RunView).mockImplementation(() => mockRunView as unknown as RunView);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('shouldRespond', () => {
        it('should respond to direct messages', () => {
            const msg = createMessage({ IsDirectMessage: true, IsBotMention: false });
            expect(adapter.testShouldRespond(msg)).toBe(true);
        });

        it('should respond to bot @mentions', () => {
            const msg = createMessage({ IsDirectMessage: false, IsBotMention: true });
            expect(adapter.testShouldRespond(msg)).toBe(true);
        });

        it('should not respond to regular channel messages', () => {
            const msg = createMessage({ IsDirectMessage: false, IsBotMention: false });
            expect(adapter.testShouldRespond(msg)).toBe(false);
        });

        it('should respond when both DM and mention', () => {
            const msg = createMessage({ IsDirectMessage: true, IsBotMention: true });
            expect(adapter.testShouldRespond(msg)).toBe(true);
        });
    });

    describe('resolveContextUser', () => {
        beforeEach(async () => {
            // Initialize adapter so FallbackContextUser is populated
            await adapter.Initialize();
        });

        it('should resolve user by SenderEmail', async () => {
            const msg = createMessage({ SenderEmail: 'alice@example.com' });
            const user = await adapter.testResolveContextUser(msg);
            expect(user.Email).toBe('alice@example.com');
        });

        it('should look up email via platform API when SenderEmail is not set', async () => {
            adapter.MockLookupEmails.set('user-bob', 'bob@example.com');
            const msg = createMessage({ SenderID: 'user-bob', SenderEmail: undefined });
            const user = await adapter.testResolveContextUser(msg);
            expect(user.Email).toBe('bob@example.com');
        });

        it('should fall back to service account when email lookup fails', async () => {
            const msg = createMessage({ SenderID: 'unknown-user', SenderEmail: undefined });
            const user = await adapter.testResolveContextUser(msg);
            expect(user.Email).toBe('bot@company.com');
        });

        it('should fall back to service account when email not in MJ UserCache', async () => {
            const msg = createMessage({ SenderEmail: 'nonexistent@nowhere.com' });
            const user = await adapter.testResolveContextUser(msg);
            expect(user.Email).toBe('bot@company.com');
        });

        it('should be case-insensitive for email matching', async () => {
            const msg = createMessage({ SenderEmail: 'ALICE@EXAMPLE.COM' });
            const user = await adapter.testResolveContextUser(msg);
            expect(user.Email).toBe('alice@example.com');
        });
    });

    describe('resolveAgent', () => {
        it('should return default agent when no agents are mentioned', async () => {
            const msg = createMessage({ MentionedAgentNames: [] });
            const result = await adapter.testResolveAgent(msg);
            expect(result.multiAgentNote).toBeNull();
        });

        it('should return default agent when MentionedAgentNames is undefined', async () => {
            const msg = createMessage({ MentionedAgentNames: undefined });
            const result = await adapter.testResolveAgent(msg);
            expect(result.multiAgentNote).toBeNull();
        });

        it('should look up first mentioned agent by name', async () => {
            const mockRunView = {
                RunView: vi.fn().mockResolvedValue({
                    Success: true,
                    Results: [{ ID: 'named-agent-id', Name: 'Research Bot' }]
                })
            };
            vi.mocked(RunView).mockImplementation(() => mockRunView as unknown as RunView);

            const msg = createMessage({ MentionedAgentNames: ['Research Bot'] });
            const result = await adapter.testResolveAgent(msg);
            expect(result.agent).toEqual({ ID: 'named-agent-id', Name: 'Research Bot' });
            expect(result.multiAgentNote).toBeNull();
        });

        it('should return multi-agent note when multiple agents mentioned', async () => {
            const mockRunView = {
                RunView: vi.fn().mockResolvedValue({
                    Success: true,
                    Results: [{ ID: 'first-agent-id', Name: 'First Bot' }]
                })
            };
            vi.mocked(RunView).mockImplementation(() => mockRunView as unknown as RunView);

            const msg = createMessage({ MentionedAgentNames: ['First Bot', 'Second Bot', 'Third Bot'] });
            const result = await adapter.testResolveAgent(msg);
            expect(result.agent).toEqual({ ID: 'first-agent-id', Name: 'First Bot' });
            expect(result.multiAgentNote).toContain('First Bot');
            expect(result.multiAgentNote).toContain('Second Bot');
            expect(result.multiAgentNote).toContain('Third Bot');
            expect(result.multiAgentNote).toContain('Only one agent');
        });

        it('should fall back to default agent when named agent not found', async () => {
            const callCount = { n: 0 };
            const mockRunView = {
                RunView: vi.fn().mockImplementation(() => {
                    callCount.n++;
                    if (callCount.n === 1) {
                        // First call: agent name lookup — not found
                        return { Success: true, Results: [] };
                    }
                    // Second call: default agent
                    return { Success: true, Results: [{ ID: 'default-id', Name: 'Default' }] };
                })
            };
            vi.mocked(RunView).mockImplementation(() => mockRunView as unknown as RunView);

            const msg = createMessage({ MentionedAgentNames: ['NonexistentBot'] });
            const result = await adapter.testResolveAgent(msg);
            // Should fall back to default agent
            expect(result.multiAgentNote).toBeNull();
        });
    });

    describe('HandleMessage', () => {
        beforeEach(async () => {
            await adapter.Initialize();
        });

        it('should not respond to messages that do not trigger the bot', async () => {
            const msg = createMessage({ IsDirectMessage: false, IsBotMention: false });
            await adapter.HandleMessage(msg);
            expect(adapter.FinalMessages).toHaveLength(0);
            expect(adapter.TypeIndicatorShown).toBe(false);
        });

        it('should show typing indicator for DMs', async () => {
            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            expect(adapter.TypeIndicatorShown).toBe(true);
        });

        it('should not show typing indicator when disabled', async () => {
            const noTypingAdapter = new TestAdapter({ ...defaultSettings, ShowTypingIndicator: false });
            await noTypingAdapter.Initialize();
            const msg = createMessage({ IsDirectMessage: true });
            await noTypingAdapter.HandleMessage(msg);
            expect(noTypingAdapter.TypeIndicatorShown).toBe(false);
        });

        it('should send a final message for a simple DM', async () => {
            const msg = createMessage({ IsDirectMessage: true, Text: 'Hello!' });
            await adapter.HandleMessage(msg);
            // Agent was called, final message was sent
            expect(adapter.FinalMessages.length + adapter.FinalUpdates.length).toBeGreaterThan(0);
        });
    });

    describe('Initialize', () => {
        it('should call onInitialize', async () => {
            await adapter.Initialize();
            expect(adapter.OnInitializeCalled).toBe(true);
        });
    });
});
