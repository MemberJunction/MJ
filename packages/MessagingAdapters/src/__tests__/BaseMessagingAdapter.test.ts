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
import { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
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

    protected async showTypingIndicator(_message: IncomingMessage, _agent?: MJAIAgentEntityExtended): Promise<void> {
        this.TypeIndicatorShown = true;
    }

    protected async fetchThreadHistory(_channelId: string, _threadId: string): Promise<IncomingMessage[]> {
        return this.MockThreadHistory;
    }

    protected async sendOrUpdateStreamingMessage(
        _originalMessage: IncomingMessage,
        currentContent: string,
        existingMessageId: string | null,
        _agent?: MJAIAgentEntityExtended
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

    protected async formatResponse(
        _result: ExecuteAgentResult | null,
        _agent: MJAIAgentEntityExtended,
        responseText: string
    ): Promise<FormattedResponse> {
        return {
            PlainText: responseText,
            RichPayload: { formatted: true, text: responseText }
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

    public async testResolveAgent(msg: IncomingMessage, threadHistory: IncomingMessage[] = []): Promise<{ agent: unknown; multiAgentNote: string | null }> {
        // Use fallbackContextUser for testing; Initialize() must be called first
        return this.resolveAgent(msg, this.fallbackContextUser!, threadHistory);
    }
}

// ─── Test helpers ────────────────────────────────────────────────────────────

const defaultSettings: MessagingAdapterSettings = {
    DefaultAgentName: 'Sage',
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
        // Mock RunView for agent lookup: first call = loadDefaultAgent, second = loadAvailableAgents
        const callCount = { n: 0 };
        const mockRunView = {
            RunView: vi.fn().mockImplementation(() => {
                callCount.n++;
                if (callCount.n === 1) {
                    // loadDefaultAgent
                    return { Success: true, Results: [{ ID: 'agent-guid-123', Name: 'Default Agent' }] };
                }
                // loadAvailableAgents
                return {
                    Success: true,
                    Results: [
                        { ID: 'agent-guid-123', Name: 'Default Agent' },
                        { ID: 'sage-id', Name: 'Sage' },
                        { ID: 'research-id', Name: 'Research Bot' },
                        { ID: 'marketing-id', Name: 'Marketing Agent' },
                        { ID: 'codesmith-id', Name: 'Codesmith' }
                    ]
                };
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
        beforeEach(async () => {
            await adapter.Initialize();
        });

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

        it('should look up first mentioned agent by name from cached agents', async () => {
            // 'Research Bot' is already in availableAgents from the mock setup
            const msg = createMessage({ MentionedAgentNames: ['Research Bot'] });
            const result = await adapter.testResolveAgent(msg);
            expect((result.agent as Record<string, unknown>).Name).toBe('Research Bot');
            expect(result.multiAgentNote).toBeNull();
        });

        it('should return multi-agent note when multiple agents mentioned', async () => {
            const msg = createMessage({ MentionedAgentNames: ['Sage', 'Research Bot', 'Default Agent'] });
            const result = await adapter.testResolveAgent(msg);
            expect((result.agent as Record<string, unknown>).Name).toBe('Sage');
            expect(result.multiAgentNote).toContain('Sage');
            expect(result.multiAgentNote).toContain('Research Bot');
            expect(result.multiAgentNote).toContain('Only one agent');
        });

        it('should fall back to default agent when named agent not found', async () => {
            const msg = createMessage({ MentionedAgentNames: ['NonexistentBot'] });
            const result = await adapter.testResolveAgent(msg);
            // Should fall back to default agent and show help message
            expect(result.multiAgentNote).toContain('couldn\'t find');
            expect(result.multiAgentNote).toContain('NonexistentBot');
        });

        it('should use thread affinity when no agent mentioned in current message', async () => {
            // Simulate a thread where the first message mentioned 'Research Bot'
            const threadHistory: IncomingMessage[] = [
                createMessage({
                    MessageID: 'thread-start',
                    Text: '<@BOT123> @Research Bot how do joins work?',
                    SenderID: 'user-1',
                    MentionedAgentNames: ['Research Bot'],
                }),
                createMessage({
                    MessageID: 'bot-reply',
                    Text: 'Here is how joins work...',
                    SenderID: 'BOT123', // Bot's own message
                }),
            ];
            // Current message has no @mention
            const msg = createMessage({ MentionedAgentNames: [], ThreadID: 'thread-start' });
            const result = await adapter.testResolveAgent(msg, threadHistory);
            expect((result.agent as Record<string, unknown>).Name).toBe('Research Bot');
            expect(result.multiAgentNote).toBeNull();
        });

        it('should prefer explicit mention over thread affinity', async () => {
            const threadHistory: IncomingMessage[] = [
                createMessage({
                    MessageID: 'thread-start',
                    Text: '@Research Bot question',
                    SenderID: 'user-1',
                    MentionedAgentNames: ['Research Bot'],
                }),
            ];
            // Current message explicitly mentions a different agent
            const msg = createMessage({ MentionedAgentNames: ['Sage'], ThreadID: 'thread-start' });
            const result = await adapter.testResolveAgent(msg, threadHistory);
            expect((result.agent as Record<string, unknown>).Name).toBe('Sage');
        });

        it('should fall back to default when thread has no agent mentions', async () => {
            const threadHistory: IncomingMessage[] = [
                createMessage({
                    MessageID: 'thread-start',
                    Text: 'Just a regular DM',
                    SenderID: 'user-1',
                }),
            ];
            const msg = createMessage({ MentionedAgentNames: [] });
            const result = await adapter.testResolveAgent(msg, threadHistory);
            // Should use default agent (first result from loadDefaultAgent mock)
            expect((result.agent as Record<string, unknown>).Name).toBe('Default Agent');
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

    describe('response extraction (via HandleMessage)', () => {
        beforeEach(async () => {
            await adapter.Initialize();
        });

        it('should use agentRun.Message as top priority extraction (matches Explorer/AICLI)', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    payload: 'payload fallback',
                    agentRun: {
                        Message: 'Human-readable message from agent',
                        Result: JSON.stringify({ summary: 'Some result' }),
                        Steps: [{
                            OutputData: JSON.stringify({ nextStep: { message: 'Step output message' } }),
                            Status: 'Completed'
                        }]
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toBe('Human-readable message from agent');
        });

        it('should append payload content when agentRun.Message is a short delegation note', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Message: "I'll have Codesmith handle this calculation.",
                        FinalPayload: JSON.stringify({
                            summary: 'The first 20 prime numbers are: 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71. These are the natural numbers greater than 1 that have no positive divisors other than 1 and themselves.',
                        }),
                        Steps: []
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            // Should include BOTH the delegation note and the actual content
            expect(sent?.PlainText).toContain("I'll have Codesmith handle this calculation.");
            expect(sent?.PlainText).toContain('first 20 prime numbers');
        });

        it('should NOT append payload when agentRun.Message is already substantial', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Message: 'Here is a detailed response about quantum computing that covers all the key concepts including superposition, entanglement, quantum gates, and decoherence. Quantum computers use qubits which can exist in superposition states unlike classical bits.',
                        FinalPayload: JSON.stringify({ summary: 'Quantum computing overview' }),
                        Steps: []
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            // Should use Message directly without appending short payload
            expect(sent?.PlainText).toBe('Here is a detailed response about quantum computing that covers all the key concepts including superposition, entanglement, quantum gates, and decoherence. Quantum computers use qubits which can exist in superposition states unlike classical bits.');
        });

        it('should skip empty agentRun.Message and fall through to step outputs', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Message: '   ',
                        Steps: [{
                            OutputData: 'Fallback step text',
                            Status: 'Completed'
                        }]
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toBe('Fallback step text');
        });

        it('should extract nextStep.message from structured JSON', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Steps: [{
                            OutputData: JSON.stringify({ nextStep: { message: 'Hello from Sage!' } }),
                            Status: 'Completed'
                        }]
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toBe('Hello from Sage!');
        });

        it('should extract top-level message field from JSON', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Steps: [{
                            OutputData: JSON.stringify({ message: 'Top-level message' }),
                            Status: 'Completed'
                        }]
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toBe('Top-level message');
        });

        it('should extract output field from JSON', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Steps: [{
                            OutputData: JSON.stringify({ output: 'Output field text' }),
                            Status: 'Completed'
                        }]
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toBe('Output field text');
        });

        it('should extract result field from JSON', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Steps: [{
                            OutputData: JSON.stringify({ result: 'Result field text' }),
                            Status: 'Completed'
                        }]
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toBe('Result field text');
        });

        it('should use plain text when OutputData is not JSON', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Steps: [{
                            OutputData: 'Just plain text response',
                            Status: 'Completed'
                        }]
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toBe('Just plain text response');
        });

        it('should fall back to payload string when no step output', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    payload: 'Payload fallback text',
                    agentRun: { Steps: [] }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toBe('Payload fallback text');
        });

        it('should stringify JSON fallback when no recognized fields', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Steps: [{
                            OutputData: JSON.stringify({ unknownField: 'data', count: 42 }),
                            Status: 'Completed'
                        }]
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain('unknownField');
            expect(sent?.PlainText).toContain('42');
        });

        it('should show error message on agent failure', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: false,
                    agentRun: { ErrorMessage: 'Something went wrong', Steps: [] }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain('Something went wrong');
        });

        it('should skip orchestration metadata in step outputs and use agentRun.Result', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Result: JSON.stringify({ summary: 'Quantum computing is a paradigm...' }),
                        Steps: [{
                            OutputData: JSON.stringify({
                                subAgentResult: { success: true, finalStep: 'Chat' },
                                shouldTerminate: false,
                                nextStep: 'retry',
                                payloadChangeResult: { applied: { additions: 2 } }
                            }),
                            Status: 'Completed'
                        }]
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain('Quantum computing');
            expect(sent?.PlainText).not.toContain('subAgentResult');
        });

        it('should compose text from structured research payload with findings', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        FinalPayload: JSON.stringify({
                            title: 'Research Report',
                            summary: 'Key findings about AI',
                            extractedFindings: [
                                { heading: 'Finding 1', content: 'Details about finding one' },
                                { heading: 'Finding 2', content: 'Details about finding two' }
                            ],
                            sources: [
                                { title: 'Wikipedia', url: 'https://en.wikipedia.org' }
                            ]
                        }),
                        Steps: [{
                            OutputData: JSON.stringify({
                                subAgentResult: { success: true },
                                shouldTerminate: false,
                                nextStep: 'retry'
                            }),
                            Status: 'Completed'
                        }]
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain('Research Report');
            expect(sent?.PlainText).toContain('Key findings about AI');
            expect(sent?.PlainText).toContain('Finding 1');
            expect(sent?.PlainText).toContain('Wikipedia');
        });

        it('should compose readable text from Research Agent state payload', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Steps: [{
                            OutputData: JSON.stringify({
                                metadata: {
                                    researchGoal: 'Research photonic computing',
                                    status: 'in_progress',
                                    iterationCount: 1
                                },
                                plan: {
                                    initialPlan: 'Perform a comprehensive web search on photonic computing.',
                                    researchQuestions: [
                                        'What is photonic computing?',
                                        'What are the main technical challenges?'
                                    ]
                                },
                                iterations: [],
                                comparisons: [],
                                contradictions: []
                            }),
                            Status: 'Completed'
                        }]
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain('Research photonic computing');
            expect(sent?.PlainText).toContain('comprehensive web search');
            expect(sent?.PlainText).toContain('What is photonic computing');
            expect(sent?.PlainText).not.toContain('"metadata"');
        });

        it('should extract Codesmith-style payload with code and results', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Message: "I'll have Codesmith calculate this for you.",
                        FinalPayload: JSON.stringify({
                            task: 'Calculate the first 20 prime numbers',
                            code: 'const primes = []; let n = 2; while (primes.length < 20) { if (isPrime(n)) primes.push(n); n++; } output = primes;',
                            results: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71],
                            iterations: 1,
                            errors: []
                        }),
                        Steps: []
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            // Should include delegation note + Codesmith results
            expect(sent?.PlainText).toContain("I'll have Codesmith calculate this for you.");
            expect(sent?.PlainText).toContain('Calculate the first 20 prime numbers');
            expect(sent?.PlainText).toContain('71');
        });

        it('should NOT leak taskGraph JSON into response text', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Message: "I'll have the Marketing Agent write the blog for you.",
                        FinalPayload: JSON.stringify({
                            taskGraph: {
                                workflowName: 'Write Blog',
                                tasks: [{ name: 'Write Blog', agentName: 'Marketing Agent' }]
                            }
                        }),
                        Steps: []
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain("I'll have the Marketing Agent write the blog for you.");
            expect(sent?.PlainText).not.toContain('taskGraph');
            expect(sent?.PlainText).not.toContain('workflowName');
        });

        it('should NOT leak actionResult JSON into response text', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    agentRun: {
                        Message: "I'll have the Marketing Agent write a blog for you.",
                        FinalPayload: JSON.stringify({
                            actionResult: {
                                success: true,
                                resultCode: 'SUCCESS',
                                message: JSON.stringify({
                                    message: 'Found 5 accessible agents',
                                    allMatches: [{ agentName: 'Marketing Agent', similarityScore: 0.73 }]
                                })
                            }
                        }),
                        Steps: []
                    }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain("I'll have the Marketing Agent write a blog for you.");
            expect(sent?.PlainText).not.toContain('actionResult');
            expect(sent?.PlainText).not.toContain('similarityScore');
            expect(sent?.PlainText).not.toContain('allMatches');
        });

        it('should extract summary field from payload object', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    payload: { summary: 'Here is the executive summary' },
                    agentRun: { Steps: [] }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain('executive summary');
        });
    });

    describe('delegation follow-through', () => {
        beforeEach(async () => {
            await adapter.Initialize();
        });

        it('should auto-execute target agent when payload.invokeAgent is set', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            let callCount = 0;
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) {
                        // First call: Sage delegates to Marketing Agent
                        return Promise.resolve({
                            success: true,
                            payload: { invokeAgent: 'Marketing Agent', reasoning: 'Writing blog' },
                            agentRun: { Message: 'Delegating to Marketing Agent...', Steps: [] }
                        });
                    }
                    // Second call: Marketing Agent produces the blog
                    return Promise.resolve({
                        success: true,
                        payload: { title: 'My Blog', body: 'Full blog content here' },
                        agentRun: { Message: 'Here is your blog post.', Steps: [] }
                    });
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);

            // Collect all output from both sendFinalMessage and updateFinalMessage
            const allMessages = [
                ...adapter.FinalMessages,
                ...adapter.FinalUpdates.map(u => u.response)
            ];
            // Should have at least 2 responses: delegation note + target agent result
            expect(allMessages.length).toBeGreaterThanOrEqual(2);

            // First should be Sage's delegation note
            const allTexts = allMessages.map(m => m.PlainText);
            expect(allTexts.some(t => t.includes('Delegating to Marketing Agent'))).toBe(true);

            // Second should be Marketing Agent's result
            expect(allTexts.some(t => t.includes('blog post'))).toBe(true);
        });

        it('should fall back to source result when delegation target is not found', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: true,
                    payload: { invokeAgent: 'Nonexistent Agent' },
                    agentRun: { Message: 'I will delegate.', Steps: [] }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);

            const allMessages = [
                ...adapter.FinalMessages,
                ...adapter.FinalUpdates.map(u => u.response)
            ];
            expect(allMessages.length).toBeGreaterThanOrEqual(1);
            expect(allMessages.some(m => m.PlainText.includes('I will delegate'))).toBe(true);
        });

        it('should not follow delegation for failed results', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockResolvedValue({
                    success: false,
                    payload: { invokeAgent: 'Marketing Agent' },
                    agentRun: { ErrorMessage: 'Something went wrong', Steps: [] }
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);

            const allMessages = [
                ...adapter.FinalMessages,
                ...adapter.FinalUpdates.map(u => u.response)
            ];
            expect(allMessages.some(m => m.PlainText.includes('went wrong') || m.PlainText.includes('error'))).toBe(true);
        });

        it('should detect delegation from FinalPayload when in-memory payload is empty', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            let callCount = 0;
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) {
                        // Sage returns no in-memory payload but FinalPayload has invokeAgent
                        return Promise.resolve({
                            success: true,
                            payload: undefined,
                            agentRun: {
                                Message: 'Delegating to Marketing Agent...',
                                FinalStep: 'Success',
                                FinalPayload: JSON.stringify({ invokeAgent: 'Marketing Agent', reasoning: 'Blog writing' }),
                                Steps: []
                            }
                        });
                    }
                    return Promise.resolve({
                        success: true,
                        payload: 'Blog post content here',
                        agentRun: { Message: 'Here is your blog post', FinalStep: 'Success', Steps: [] }
                    });
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            // Should have delegated: 2 agent runs
            expect(callCount).toBe(2);
        });

        it('should detect delegation from message text when payload lacks invokeAgent', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            let callCount = 0;
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) {
                        // Sage describes delegation in text but doesn't set payload.invokeAgent
                        return Promise.resolve({
                            success: true,
                            payload: { reasoning: 'Need blog expertise' },
                            agentRun: {
                                Message: "I'll have the Marketing Agent write a blog post for you.",
                                FinalStep: 'Success',
                                Steps: []
                            }
                        });
                    }
                    return Promise.resolve({
                        success: true,
                        payload: 'Great blog post about AI',
                        agentRun: { Message: 'Here is your blog post', FinalStep: 'Success', Steps: [] }
                    });
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            // Should have delegated: 2 agent runs (Sage + Marketing Agent)
            expect(callCount).toBe(2);
        });

        it('should NOT detect delegation from message text for unknown agent names', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            let callCount = 0;
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockImplementation(() => {
                    callCount++;
                    return Promise.resolve({
                        success: true,
                        payload: { reasoning: 'Just chatting' },
                        agentRun: {
                            Message: "I'll have the Imaginary Agent do this for you.",
                            FinalStep: 'Success',
                            Steps: []
                        }
                    });
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            // Should NOT delegate — "Imaginary Agent" is not in availableAgents
            expect(callCount).toBe(1);
        });

        it('should detect "routing to" delegation phrase', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            let callCount = 0;
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) {
                        return Promise.resolve({
                            success: true,
                            payload: {},
                            agentRun: {
                                Message: 'Routing to Codesmith for this code task.',
                                FinalStep: 'Success',
                                Steps: []
                            }
                        });
                    }
                    return Promise.resolve({
                        success: true,
                        payload: 'function hello() {}',
                        agentRun: { Message: 'Code generated', FinalStep: 'Success', Steps: [] }
                    });
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            expect(callCount).toBe(2);
        });

        it('should cap delegation at MAX_DELEGATION_HOPS', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            let callCount = 0;
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgent: vi.fn().mockImplementation(() => {
                    callCount++;
                    // Every agent delegates to Marketing Agent (infinite loop)
                    return Promise.resolve({
                        success: true,
                        payload: { invokeAgent: 'Marketing Agent' },
                        agentRun: { Message: `Delegation hop ${callCount}`, Steps: [] }
                    });
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);

            // Should stop after MAX_DELEGATION_HOPS (3) + 1 initial run = 4 total
            // But each delegation sends a note, so there should be messages
            expect(callCount).toBeLessThanOrEqual(5);
        });
    });
});
