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
import { UserCache } from '@memberjunction/generic-database-provider';
import { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseMessagingAdapter } from '../base/BaseMessagingAdapter.js';
import { IncomingMessage, FormattedResponse, MessagingAdapterSettings, AgentResponseMetadata } from '../base/types.js';

// ─── Mock external modules ──────────────────────────────────────────────────

vi.mock('@memberjunction/generic-database-provider', () => {
    // A FAITHFUL model of the real UserCache, footgun included. The real class extends
    // BaseSingleton, whose constructor RETURNS the already-stored shared instance — and then
    // the subclass field initializer (`_users = []`) runs against that returned instance. So
    // `new UserCache()` empties the process-wide cache and reads back nothing. The previous
    // mock returned a static user list from ANY instance, which is precisely why
    // `new UserCache()` passed this suite while failing on every real deployment
    // ("Fallback context user not found" for any valid email). Model the semantics honestly
    // and the suite guards the distinction.
    const store: { instance?: unknown } = {};
    class MockSingletonBase {
        constructor() {
            if (store.instance) return store.instance as MockSingletonBase; // BaseSingleton semantics
            store.instance = this;
        }
    }
    class MockUserCache extends MockSingletonBase {
        // Field initializer — runs on whatever super() returned, exactly like the real class.
        _users: Array<{ ID: string; Email: string; Name: string }> = [];
        get Users() { return this._users; }
        static get Instance(): MockUserCache {
            if (!store.instance) new MockUserCache();
            return store.instance as MockUserCache;
        }
    }
    // Warm the cache the way the server does at bootstrap, AFTER construction.
    MockUserCache.Instance._users = [
        { ID: 'u1', Email: 'alice@example.com', Name: 'Alice' },
        { ID: 'u2', Email: 'bob@example.com', Name: 'Bob' },
        { ID: 'fallback', Email: 'bot@company.com', Name: 'Service Account' },
    ];
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

/**
 * Helper: wrap an ExecuteAgentResult in the RunAgentInConversation return shape.
 */
function wrapInConversationResult(agentResult: Record<string, unknown>) {
    return {
        agentResult,
        conversationId: 'mock-convo-id',
        userMessageDetailId: 'mock-user-detail-id',
        agentResponseDetailId: 'mock-agent-detail-id',
        artifactInfo: undefined,
    };
}

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: vi.fn().mockImplementation(() => ({
        RunAgentInConversation: vi.fn().mockResolvedValue(
            wrapInConversationResult({
                success: true,
                payload: 'Test response from agent',
                agentRun: {
                    Steps: [{
                        OutputData: 'Agent step output text',
                        Status: 'Completed'
                    }]
                }
            })
        )
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
        responseText: string,
        _metadata?: AgentResponseMetadata
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

    public testBuildConversationMessages(history: IncomingMessage[], current: IncomingMessage) {
        return this.buildConversationMessages(history, current);
    }

    public testDetectDelegation(result: ExecuteAgentResult): string | null {
        return this.detectDelegation(result);
    }

    public testIsUserVisibleArtifact(artifactId: string): Promise<boolean> {
        return this.isUserVisibleArtifact(artifactId, this.fallbackContextUser!);
    }

    /** Records what the base class asked this platform to upload. */
    public Uploads: { mimeType?: string; fileName?: string; label?: string; data?: string }[] = [];
    protected async uploadMediaOutputs(_message: IncomingMessage, files: readonly { mimeType?: string; fileName?: string; label?: string; data?: string }[]): Promise<void> {
        this.Uploads.push(...files);
    }

    public get PlatformName(): string { return 'TestPlatform'; }

    /**
     * Modelled on Slack, whose Events API marks bot messages with `bot_id`. The base class
     * deliberately answers `false` — the question is platform-specific — so a test platform has
     * to state its own convention, exactly as SlackAdapter does.
     */
    protected isBotAuthored(message: IncomingMessage): boolean {
        const raw = message.RawEvent;
        return !!(raw && typeof raw === 'object' && (raw['bot_id'] || raw['subtype'] === 'bot_message'));
    }
}

/** A TestAdapter whose platform delivers a thread reply only to the addressed bot (Teams-like). */
class SingleBotTestAdapter extends TestAdapter {
    protected respondsToUnaddressedThreadReplies(): boolean { return true; }
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
        // Re-warm the shared cache each test the way server bootstrap does — the mock models the
        // real singleton, so a stray construction in one test would otherwise starve the rest.
        (UserCache.Instance as unknown as { _users: unknown[] })._users = [
            { ID: 'u1', Email: 'alice@example.com', Name: 'Alice' },
            { ID: 'u2', Email: 'bob@example.com', Name: 'Bob' },
            { ID: 'fallback', Email: 'bot@company.com', Name: 'Service Account' },
        ];
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

    describe('multi-bot deployment (one platform app per agent)', () => {
        // With one app per agent, an un-mentioned thread reply reaches EVERY bot in the channel,
        // and each answered — so a single reply produced N answers, one per installed agent.
        // Only a bot that is addressed, or already party to the thread, may answer.
        const BOT = 'BOT123';   // TestAdapter.MockBotUserId
        const OTHER_BOT = 'BOT999';

        beforeEach(async () => {
            adapter = new TestAdapter(defaultSettings);
            await adapter.Initialize();
        });

        it('stays out of a thread it was not addressed in and has not posted in', async () => {
            adapter.MockThreadHistory = [
                createMessage({ MessageID: 't1', SenderID: 'user-1', Text: 'starting a thread' }),
                createMessage({ MessageID: 't2', SenderID: OTHER_BOT, Text: "I'm Sage, here to help", RawEvent: { bot_id: 'B999' } }),
            ];
            const msg = createMessage({ MessageID: 'm9', ThreadID: 't1', Text: 'thanks!' });
            // Guard against a false pass: the message must be one the adapter WOULD answer.
            expect(adapter.testShouldRespond(msg)).toBe(true);
            await adapter.HandleMessage(msg);
            expect(adapter.FinalMessages.length + adapter.FinalUpdates.length).toBe(0);
            expect(adapter.TypeIndicatorShown).toBe(false); // no indicator before declining
        });

        // The Teams override: that platform delivers a thread reply only to the bot it is
        // addressed to, so the gate is unnecessary there and would suppress valid replies.
        it('does not apply the gate on a platform that routes replies to one bot', async () => {
            const single = new SingleBotTestAdapter(defaultSettings);
            await single.Initialize();
            single.MockThreadHistory = [
                createMessage({ MessageID: 't1', SenderID: 'user-1', Text: 'starting a thread' }),
                createMessage({ MessageID: 't2', SenderID: OTHER_BOT, Text: "I'm Sage", RawEvent: { bot_id: 'B999' } }),
            ];
            await single.HandleMessage(createMessage({ MessageID: 'm9', ThreadID: 't1', Text: 'thanks!' }));
            expect(single.FinalMessages.length + single.FinalUpdates.length).toBe(1);
        });

        it('answers an un-mentioned thread reply when it already posted in that thread', async () => {
            adapter.MockThreadHistory = [
                createMessage({ MessageID: 't1', SenderID: 'user-1', Text: 'starting a thread' }),
                createMessage({ MessageID: 't2', SenderID: BOT, Text: 'my earlier answer' }),
            ];
            await adapter.HandleMessage(createMessage({ MessageID: 'm9', ThreadID: 't1', Text: 'follow-up' }));
            expect(adapter.FinalMessages.length + adapter.FinalUpdates.length).toBeGreaterThan(0);
        });

        it('answers when explicitly addressed, even in a thread it never posted in', async () => {
            adapter.MockThreadHistory = [
                createMessage({ MessageID: 't1', SenderID: 'user-1', Text: 'someone else thread' }),
            ];
            await adapter.HandleMessage(
                createMessage({ MessageID: 'm9', ThreadID: 't1', Text: 'hey', IsBotMention: true })
            );
            expect(adapter.FinalMessages.length + adapter.FinalUpdates.length).toBeGreaterThan(0);
        });

        it('never gates a top-level mention (the gate is thread-scoped)', async () => {
            adapter.MockThreadHistory = [];
            await adapter.HandleMessage(createMessage({ MessageID: 'm9', ThreadID: null, IsBotMention: true }));
            expect(adapter.FinalMessages.length + adapter.FinalUpdates.length).toBeGreaterThan(0);
        });

        it("does not let another bot's reply steal thread affinity", async () => {
            // The other bot says "I'm Sage" — under the old rule the mention matcher read that as
            // a user asking for Sage, so this bot ran Sage instead of its own default agent.
            const history = [
                createMessage({ MessageID: 't1', SenderID: 'user-1', Text: 'a question with no agent named' }),
                createMessage({ MessageID: 't2', SenderID: OTHER_BOT, Text: "I'm Sage and I can help", RawEvent: { bot_id: 'B999' } }),
            ];
            const { agent } = await adapter.testResolveAgent(
                createMessage({ ThreadID: 't1', Text: 'follow-up', MentionedAgentNames: [] }), history);
            expect((agent as { Name?: string })?.Name).toBe('Default Agent');
        });

        it("excludes other bots' messages from the model's conversation context", () => {
            const history = [
                createMessage({ MessageID: 'h1', SenderID: 'user-1', Text: 'user says this' }),
                createMessage({ MessageID: 'h2', SenderID: BOT, Text: 'this bot said this' }),
                createMessage({ MessageID: 'h3', SenderID: OTHER_BOT, Text: "I'm Sage, a different agent", RawEvent: { bot_id: 'B999' } }),
            ];
            const msgs = adapter.testBuildConversationMessages(history, createMessage({ Text: 'current' }));
            const contents = msgs.map((m) => m.content);
            expect(contents).toContain('user says this');
            expect(contents).toContain('this bot said this');
            expect(contents.some((c) => c.includes('a different agent'))).toBe(false);
        });
    });

    describe('DisableDelegation', () => {
        // Delegation Strategy 3 scans the reply TEXT, so an orchestrator agent describing its own
        // routing role ("I'll have the Marketing Agent ...") hands the conversation away under
        // this bot's identity. A bot pinned to one agent must be undelegatable.
        const delegatingResult = {
            success: true,
            payload: { invokeAgent: 'Marketing Agent' },
            agentRun: { Message: "I'll have the Marketing Agent take this" },
        } as unknown as ExecuteAgentResult;

        it('delegates by default (unchanged behavior)', async () => {
            const a = new TestAdapter(defaultSettings);
            await a.Initialize();
            expect(a.testDetectDelegation(delegatingResult)).toBe('Marketing Agent');
        });

        it('never delegates when the setting is on', async () => {
            const a = new TestAdapter({ ...defaultSettings, DisableDelegation: true });
            await a.Initialize();
            expect(a.testDetectDelegation(delegatingResult)).toBeNull();
        });
    });

    describe('artifact link visibility', () => {
        // MJ marks an artifact System Only when the agent's ArtifactCreationMode says so. The
        // Explorer UI hides those; the link the bridge posts did not, so a run whose payload was
        // internal loop state offered "view the artifact" and opened raw JSON. Checked on the
        // artifact — a System-Only agent can still produce a user-facing FILE artifact.
        function mockArtifactVisibility(visibility: string | undefined, success = true) {
            vi.mocked(RunView).mockImplementation(() => {
                const callCount = { n: 0 };
                return {
                    RunView: vi.fn().mockImplementation((params: { EntityName?: string }) => {
                        if (params?.EntityName === 'MJ: Artifacts') {
                            return { Success: success, Results: visibility ? [{ ID: 'a-1', Visibility: visibility }] : [] };
                        }
                        callCount.n++;
                        return callCount.n === 1
                            ? { Success: true, Results: [{ ID: 'agent-guid-123', Name: 'Default Agent' }] }
                            : { Success: true, Results: [{ ID: 'agent-guid-123', Name: 'Default Agent' }] };
                    })
                } as unknown as RunView;
            });
        }

        it('does not link a System Only artifact', async () => {
            const a = new TestAdapter(defaultSettings);
            mockArtifactVisibility('System Only');
            await a.Initialize();
            expect(await a.testIsUserVisibleArtifact('a-1')).toBe(false);
        });

        it('links an ordinary artifact', async () => {
            const a = new TestAdapter(defaultSettings);
            mockArtifactVisibility('Always');
            await a.Initialize();
            expect(await a.testIsUserVisibleArtifact('a-1')).toBe(true);
        });

        it('fails open when the artifact cannot be read', async () => {
            const a = new TestAdapter(defaultSettings);
            mockArtifactVisibility(undefined, false);
            await a.Initialize();
            expect(await a.testIsUserVisibleArtifact('a-1')).toBe(true);
        });
    });

    describe('binary output delivery', () => {
        // MJ's document actions inline a whole generated file as a data: URI when no file storage
        // account is configured. It cannot be opened from a chat client, so the bytes are decoded
        // and uploaded as a real attachment instead of being rendered as unusable link text.
        const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const dataUri = (mime: string, text: string) => `data:${mime};base64,${Buffer.from(text).toString('base64')}`;

        beforeEach(async () => {
            await adapter.Initialize();
        });

        it('uploads a file an agent inlined as a data: URI', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: { Message: 'Your document is ready.' },
                    actionableCommands: [
                        { type: 'open:url', label: 'Download Document', url: dataUri(DOCX, 'the-docx-bytes') },
                    ],
                }))
            }) as ReturnType<typeof vi.fn>);

            await adapter.HandleMessage(createMessage({ IsDirectMessage: true }));

            expect(adapter.Uploads).toHaveLength(1);
            expect(adapter.Uploads[0].mimeType).toBe(DOCX);
            expect(Buffer.from(adapter.Uploads[0].data!, 'base64').toString()).toBe('the-docx-bytes');
            expect(adapter.Uploads[0].label).toBe('Download Document');
        });

        it('uploads a file from the run\'s fileOutputs (the canonical source)', async () => {
            // fileOutputs is what MJ turns into file artifacts and carries the real filename and
            // MIME type. Relying on the model to emit a data: URI instead meant a generated
            // document reached chat on one run and not the next.
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: { Message: 'Your PDF is ready.' },
                    fileOutputs: [
                        { fileName: 'MJ-Power.pdf', mimeType: 'application/pdf', fileData: Buffer.from('%PDF-1.7').toString('base64'), sizeBytes: 8 },
                    ],
                }))
            }) as ReturnType<typeof vi.fn>);

            await adapter.HandleMessage(createMessage({ IsDirectMessage: true }));

            expect(adapter.Uploads).toHaveLength(1);
            expect(adapter.Uploads[0].fileName).toBe('MJ-Power.pdf');
            expect(adapter.Uploads[0].mimeType).toBe('application/pdf');
            expect(Buffer.from(adapter.Uploads[0].data!, 'base64').toString()).toBe('%PDF-1.7');
        });

        it('uploads a file once when fileOutputs and an inlined data: URI carry it', async () => {
            // A document action puts the file in fileOutputs, and the model routinely repeats the
            // same base64 back as an open:url command. Un-deduped, Slack got the file twice and
            // both copies counted against the per-reply cap.
            const bytes = Buffer.from('%PDF-1.7').toString('base64');
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: { Message: 'Your PDF is ready.' },
                    fileOutputs: [
                        { fileName: 'MJ-Power.pdf', mimeType: 'application/pdf', fileData: bytes, sizeBytes: 8 },
                    ],
                    actionableCommands: [
                        { type: 'open:url', label: 'Download document', url: `data:application/pdf;base64,${bytes}` },
                    ],
                }))
            }) as ReturnType<typeof vi.fn>);

            await adapter.HandleMessage(createMessage({ IsDirectMessage: true }));

            expect(adapter.Uploads).toHaveLength(1);
            expect(adapter.Uploads[0].fileName).toBe('MJ-Power.pdf'); // the fileOutputs one wins
        });

        it('skips a fileOutput already saved to storage', async () => {
            // Those have a durable location; re-uploading their bytes to chat is not this path's job.
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: { Message: 'Saved to storage.' },
                    fileOutputs: [{ fileName: 'stored.pdf', mimeType: 'application/pdf', fileId: 'file-guid-1' }],
                }))
            }) as ReturnType<typeof vi.fn>);

            await adapter.HandleMessage(createMessage({ IsDirectMessage: true }));
            expect(adapter.Uploads).toHaveLength(0);
        });

        it('uploads generated media alongside inlined files', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: { Message: 'Here you go.' },
                    mediaOutputs: [{ modality: 'image', mimeType: 'image/png', data: 'aW1n' }],
                    actionableCommands: [
                        { type: 'open:url', label: 'Download Document', url: dataUri(DOCX, 'doc') },
                    ],
                }))
            }) as ReturnType<typeof vi.fn>);

            await adapter.HandleMessage(createMessage({ IsDirectMessage: true }));
            expect(adapter.Uploads.map((u) => u.mimeType)).toEqual(['image/png', DOCX]);
        });

        it('uploads nothing when a reply carries no binary output', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: { Message: 'Just text.' },
                    actionableCommands: [{ type: 'open:url', label: 'Docs', url: 'https://example.com' }],
                }))
            }) as ReturnType<typeof vi.fn>);

            await adapter.HandleMessage(createMessage({ IsDirectMessage: true }));
            expect(adapter.Uploads).toHaveLength(0);
        });
    });

    describe('UserCache singleton discipline (regression)', () => {
        // The bug: `new UserCache()` — the BaseSingleton constructor returns the SHARED instance,
        // then the subclass field initializer re-runs on it, emptying the process-wide cache. On
        // every real deployment Initialize() then failed with "Fallback context user not found"
        // for any valid email. The suite never caught it because the old mock returned a static
        // list from any instance; the mock above now models the real semantics, so these tests
        // (and the resolveContextUser suite) fail if either call site regresses to `new`.
        it('Initialize resolves the fallback user from a warmed cache and leaves it intact', async () => {
            await adapter.Initialize();
            expect(UserCache.Instance.Users.length).toBe(3);
        });

        it('sender resolution does not empty the shared cache', async () => {
            await adapter.Initialize();
            const user = await adapter.testResolveContextUser(createMessage({ SenderEmail: 'alice@example.com' }));
            expect(user.Email).toBe('alice@example.com');
            expect(UserCache.Instance.Users.length).toBe(3);
        });

        it('the mock itself reproduces the footgun (keeps these tests able to fail)', () => {
            // If someone "simplifies" the mock back to a static list, this fails — and with it
            // goes the suite's ability to catch a regression to `new UserCache()`.
            expect(UserCache.Instance.Users.length).toBe(3);
            const constructed = new (UserCache as unknown as new () => { Users: unknown[] })();
            expect(constructed.Users.length).toBe(0);          // construction wiped the shared instance
            expect(UserCache.Instance.Users.length).toBe(0);   // ...which IS the shared instance
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
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
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
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toBe('Human-readable message from agent');
        });

        it('should NOT append payload when agentRun.Message is already substantial', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: {
                        Message: 'Here is a detailed response about quantum computing that covers all the key concepts including superposition, entanglement, quantum gates, and decoherence. Quantum computers use qubits which can exist in superposition states unlike classical bits.',
                        FinalPayload: JSON.stringify({ summary: 'Quantum computing overview' }),
                        Steps: []
                    }
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            // Should use Message directly without appending short payload
            expect(sent?.PlainText).toBe('Here is a detailed response about quantum computing that covers all the key concepts including superposition, entanglement, quantum gates, and decoherence. Quantum computers use qubits which can exist in superposition states unlike classical bits.');
        });

        it('should show error message on agent failure', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: false,
                    agentRun: { ErrorMessage: 'Something went wrong', Steps: [] }
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain('Something went wrong');
        });

        it('should skip orchestration metadata in step outputs and use agentRun.Result', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: {
                        Result: 'Quantum computing is a paradigm that uses quantum bits.',
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
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain('Quantum computing');
            expect(sent?.PlainText).not.toContain('subAgentResult');
        });

        it('should show friendly fallback when agentRun.Result is JSON (artifact handles it)', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: {
                        Result: JSON.stringify({ summary: 'Quantum computing is a paradigm...' }),
                        Steps: []
                    }
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            // JSON Result should NOT be shown raw — friendly fallback instead
            expect(sent?.PlainText).toContain('MJ Explorer');
            expect(sent?.PlainText).not.toContain('"summary"');
        });

        it('should NOT render in-progress research state (plan/questions) as user content', async () => {
            // In-progress research state with only plan/questions and no findings
            // is internal agent state — not user-facing content. The adapter should
            // fall through to a generic response, not dump the research plan.
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
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
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            // Internal plan/questions should NOT appear in the output
            expect(sent?.PlainText).not.toContain('What is photonic computing');
            expect(sent?.PlainText).not.toContain('Research is in progress');
            expect(sent?.PlainText).not.toContain('"metadata"');
        });

        it('should NOT leak taskGraph JSON into response text', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
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
                }))
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
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
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
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain("I'll have the Marketing Agent write a blog for you.");
            expect(sent?.PlainText).not.toContain('actionResult');
            expect(sent?.PlainText).not.toContain('similarityScore');
            expect(sent?.PlainText).not.toContain('allMatches');
        });

        it('should show friendly fallback when Message is raw JSON (artifact handles rendering)', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            const jsonPayload = JSON.stringify({
                metadata: { status: 'draft', lastModifiedBy: 'Copywriter Agent' },
                content: { headline: 'Dinosaurs: Giants of the Past', body: 'Full blog content...' },
                seo: { primaryKeyword: 'dinosaurs' }
            });
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: { Message: jsonPayload, Steps: [] }
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            // Should NOT show raw JSON — should show friendly fallback
            expect(sent?.PlainText).not.toContain('"metadata"');
            expect(sent?.PlainText).not.toContain('"seo"');
            expect(sent?.PlainText).not.toContain('primaryKeyword');
            expect(sent?.PlainText).toContain('MJ Explorer');
        });

        it('should pass through plain text Message unchanged', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: { Message: 'Here is your blog post about dinosaurs.', Steps: [] }
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain('Here is your blog post about dinosaurs.');
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
                RunAgentInConversation: vi.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) {
                        // First call: Sage delegates to Marketing Agent
                        return Promise.resolve(wrapInConversationResult({
                            success: true,
                            payload: { invokeAgent: 'Marketing Agent', reasoning: 'Writing blog' },
                            agentRun: { Message: 'Delegating to Marketing Agent...', Steps: [] }
                        }));
                    }
                    // Second call: Marketing Agent produces the blog
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        payload: { title: 'My Blog', body: 'Full blog content here' },
                        agentRun: { Message: 'Here is your blog post.', Steps: [] }
                    }));
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
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    payload: { invokeAgent: 'Nonexistent Agent' },
                    agentRun: { Message: 'I will delegate.', Steps: [] }
                }))
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
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: false,
                    payload: { invokeAgent: 'Marketing Agent' },
                    agentRun: { ErrorMessage: 'Something went wrong', Steps: [] }
                }))
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
                RunAgentInConversation: vi.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) {
                        // Sage returns no in-memory payload but FinalPayload has invokeAgent
                        return Promise.resolve(wrapInConversationResult({
                            success: true,
                            payload: undefined,
                            agentRun: {
                                Message: 'Delegating to Marketing Agent...',
                                FinalStep: 'Success',
                                FinalPayload: JSON.stringify({ invokeAgent: 'Marketing Agent', reasoning: 'Blog writing' }),
                                Steps: []
                            }
                        }));
                    }
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        payload: 'Blog post content here',
                        agentRun: { Message: 'Here is your blog post', FinalStep: 'Success', Steps: [] }
                    }));
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
                RunAgentInConversation: vi.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) {
                        // Sage describes delegation in text but doesn't set payload.invokeAgent
                        return Promise.resolve(wrapInConversationResult({
                            success: true,
                            payload: { reasoning: 'Need blog expertise' },
                            agentRun: {
                                Message: "I'll have the Marketing Agent write a blog post for you.",
                                FinalStep: 'Success',
                                Steps: []
                            }
                        }));
                    }
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        payload: 'Great blog post about AI',
                        agentRun: { Message: 'Here is your blog post', FinalStep: 'Success', Steps: [] }
                    }));
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
                RunAgentInConversation: vi.fn().mockImplementation(() => {
                    callCount++;
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        payload: { reasoning: 'Just chatting' },
                        agentRun: {
                            Message: "I'll have the Imaginary Agent do this for you.",
                            FinalStep: 'Success',
                            Steps: []
                        }
                    }));
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
                RunAgentInConversation: vi.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount === 1) {
                        return Promise.resolve(wrapInConversationResult({
                            success: true,
                            payload: {},
                            agentRun: {
                                Message: 'Routing to Codesmith for this code task.',
                                FinalStep: 'Success',
                                Steps: []
                            }
                        }));
                    }
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        payload: 'function hello() {}',
                        agentRun: { Message: 'Code generated', FinalStep: 'Success', Steps: [] }
                    }));
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
                RunAgentInConversation: vi.fn().mockImplementation(() => {
                    callCount++;
                    // Every agent delegates to Marketing Agent (infinite loop)
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        payload: { invokeAgent: 'Marketing Agent' },
                        agentRun: { Message: `Delegation hop ${callCount}`, Steps: [] }
                    }));
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
