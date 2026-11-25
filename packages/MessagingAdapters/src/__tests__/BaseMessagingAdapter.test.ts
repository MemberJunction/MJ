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
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { BaseMessagingAdapter, ResolveAgentResult } from '../base/BaseMessagingAdapter.js';
import { IncomingMessage, FormattedResponse, MessagingAdapterSettings, AgentResponseMetadata } from '../base/types.js';

// ─── Mock external modules ──────────────────────────────────────────────────

// Keep the real AIAgentPermissionHelper (2x2 RBAC, ancestor CanRun, IsDirectlyDiscoverable)
// and back AIEngineBase.Instance with an in-memory catalog so tests exercise real permission math.
const aiEngineState = vi.hoisted(() => ({
    agents: [] as Array<Record<string, unknown>>,
    permissions: [] as Array<Record<string, unknown>>,
    configCalls: [] as Array<{ forceRefresh?: boolean; user?: unknown }>,
}));

vi.mock('@memberjunction/ai-engine-base', async (importOriginal) => {
    const orig = await importOriginal<typeof import('@memberjunction/ai-engine-base')>();
    const mockInstance = {
        Config: vi.fn(async (forceRefresh?: boolean, user?: unknown) => {
            aiEngineState.configCalls.push({ forceRefresh, user });
        }),
        get Agents() { return aiEngineState.agents; },
        get AgentPermissions() { return aiEngineState.permissions; },
    };
    const MockPermissionHelper = {
        IsDirectlyDiscoverable: orig.AIAgentPermissionHelper.IsDirectlyDiscoverable.bind(orig.AIAgentPermissionHelper),
        ComputeEffectivePermissionsSync: orig.AIAgentPermissionHelper.ComputeEffectivePermissionsSync.bind(orig.AIAgentPermissionHelper),
        GetEffectivePermissions: vi.fn(async (agentId: string, user: UserInfo) => {
            const agent = aiEngineState.agents.find(
                a => String(a['ID'] ?? '').toLowerCase() === agentId.toLowerCase()
            );
            if (!agent) {
                return { canView: false, canRun: false, canEdit: false, canDelete: false, isOwner: false };
            }
            return orig.AIAgentPermissionHelper.ComputeEffectivePermissionsSync(
                agent as never,
                aiEngineState.agents as never,
                aiEngineState.permissions as never,
                user
            );
        }),
        HasPermission: vi.fn(async (agentId: string, user: UserInfo, perm: 'view' | 'run' | 'edit' | 'delete') => {
            const eff = await MockPermissionHelper.GetEffectivePermissions(agentId, user);
            if (perm === 'view') return eff.canView;
            if (perm === 'run') return eff.canRun;
            if (perm === 'edit') return eff.canEdit;
            if (perm === 'delete') return eff.canDelete;
            return false;
        }),
    };
    return {
        ...orig,
        AIAgentPermissionHelper: MockPermissionHelper,
        AIEngineBase: {
            get Instance() { return mockInstance; },
        },
    };
});

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
    AgentRunner: vi.fn(() => ({
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
        ),
        FollowHandoffs: vi.fn().mockResolvedValue([]),
    })),
    ResolveHandoffTarget: vi.fn(async (input: {
        AgentName: string;
        SourceAgentID: string;
        HandoffChain: ReadonlyArray<string>;
        Agents: ReadonlyArray<{ ID: string; Name?: string | null; Status?: string | null; ParentID?: string | null; ExposeAsAction?: boolean | null }>;
    }) => {
        const requested = (input.AgentName ?? '').trim().toLowerCase();
        const target = input.Agents.find(
            a => a.Name != null && a.Name.trim().toLowerCase() === requested && (a.Status == null || a.Status === 'Active')
        );
        if (!target) {
            return { Refusal: { Reason: 'NotFound', Message: `Agent '${input.AgentName}' not found or not active.` }, Candidates: [] };
        }
        if (target.ID === input.SourceAgentID) {
            return { Refusal: { Reason: 'Self', Message: `You cannot hand off the conversation to yourself (${target.Name}).` }, Candidates: [] };
        }
        if (target.ParentID || target.ExposeAsAction) {
            return { Refusal: { Reason: 'NotDiscoverable', Message: `${target.Name} can't be reached directly via Handoff.` }, Candidates: [] };
        }
        if (input.HandoffChain.includes(target.ID)) {
            return { Refusal: { Reason: 'AlreadyInThisTurn', Message: `${target.Name} has already participated in this turn.` }, Candidates: [] };
        }
        if (input.HandoffChain.length + 1 > 3) {
            return { Refusal: { Reason: 'HopLimit', Message: `Maximum handoff depth (3 hops) reached.` }, Candidates: [] };
        }
        return { Target: target, Candidates: [] };
    }),
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

    public testResolveContextUser(msg: IncomingMessage): Promise<UserInfo | null> {
        return this.resolveContextUser(msg);
    }

    public testMatchAgentMentions(text: string): string[] {
        return this.matchAgentMentions(text);
    }

    public async testResolveAgent(
        msg: IncomingMessage,
        threadHistory: IncomingMessage[] = [],
        user?: UserInfo,
        rememberedAgentId?: string
    ): Promise<ResolveAgentResult> {
        // Use specified user or fallbackContextUser for testing; Initialize() must be called first
        return this.resolveAgent(msg, user ?? this.fallbackContextUser!, threadHistory, rememberedAgentId);
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

/** A TestAdapter modeled on Teams: loads history from MJ: Conversation Details and rolls over DMs/group chats. */
class DBHistoryTestAdapter extends SingleBotTestAdapter {
    protected override UsesMJConversationHistory(): boolean { return true; }
    protected override IsRollingConversation(message: IncomingMessage): boolean {
        const convType = (message.RawEvent?.['conversationType'] as string | undefined);
        return convType ? convType !== 'channel' : true;
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
        SenderEmail: 'alice@example.com',
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

    const defaultTestAgents = [
        { ID: 'agent-guid-123', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, BaseAgentID: null, OwnerUserID: null },
        { ID: 'sage-id', Name: 'Sage', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, BaseAgentID: null, OwnerUserID: null },
        { ID: 'research-id', Name: 'Research Bot', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, BaseAgentID: null, OwnerUserID: null },
        { ID: 'marketing-id', Name: 'Marketing Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, BaseAgentID: null, OwnerUserID: null },
        { ID: 'codesmith-id', Name: 'Codesmith', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, BaseAgentID: null, OwnerUserID: null },
    ];

    beforeEach(() => {
        // Re-warm the shared cache each test the way server bootstrap does — the mock models the
        // real singleton, so a stray construction in one test would otherwise starve the rest.
        (UserCache.Instance as unknown as { _users: unknown[] })._users = [
            { ID: 'u1', Email: 'alice@example.com', Name: 'Alice', IsActive: true, UserRoles: [{ RoleID: 'role-member' }] },
            { ID: 'u2', Email: 'bob@example.com', Name: 'Bob', IsActive: true, UserRoles: [{ RoleID: 'role-admin' }] },
            { ID: 'u3', Email: 'inactive@example.com', Name: 'Inactive User', IsActive: false, UserRoles: [{ RoleID: 'role-member' }] },
            { ID: 'fallback', Email: 'bot@company.com', Name: 'Service Account', IsActive: true, UserRoles: [{ RoleID: 'role-admin' }] },
        ];
        aiEngineState.agents = defaultTestAgents.map(a => ({ ...a }));
        aiEngineState.permissions = [];
        aiEngineState.configCalls = [];
        vi.mocked(AIEngineBase.Instance.Config).mockClear();

        adapter = new TestAdapter(defaultSettings);
        // Mock RunView for agent lookup: first call = loadDefaultAgent, second = loadAvailableAgents
        const callCount = { n: 0 };
        const mockRunView = {
            RunView: vi.fn().mockImplementation(() => {
                callCount.n++;
                if (callCount.n === 1) {
                    // loadDefaultAgent
                    return { Success: true, Results: [defaultTestAgents[0]] };
                }
                // loadAvailableAgents
                return {
                    Success: true,
                    Results: defaultTestAgents.map(a => ({ ...a })),
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
            expect(user?.Email).toBe('alice@example.com');
        });

        it('should look up email via platform API when SenderEmail is not set', async () => {
            adapter.MockLookupEmails.set('user-bob', 'bob@example.com');
            const msg = createMessage({ SenderID: 'user-bob', SenderEmail: undefined });
            const user = await adapter.testResolveContextUser(msg);
            expect(user?.Email).toBe('bob@example.com');
        });

        it('should return null (fail closed) by default when email lookup fails', async () => {
            const msg = createMessage({ SenderID: 'unknown-user', SenderEmail: undefined });
            const user = await adapter.testResolveContextUser(msg);
            expect(user).toBeNull();
        });

        it('should return null (fail closed) by default when email not in MJ UserCache', async () => {
            const msg = createMessage({ SenderEmail: 'nonexistent@nowhere.com' });
            const user = await adapter.testResolveContextUser(msg);
            expect(user).toBeNull();
        });

        it('should return null (fail closed) when matched MJ user is inactive', async () => {
            const msg = createMessage({ SenderEmail: 'inactive@example.com' });
            const user = await adapter.testResolveContextUser(msg);
            expect(user).toBeNull();
        });

        it('should fall back to service account when AllowFallbackUser is explicitly true', async () => {
            const openAdapter = new TestAdapter({ ...defaultSettings, AllowFallbackUser: true });
            await openAdapter.Initialize();
            const unknownEmailUser = await openAdapter.testResolveContextUser(
                createMessage({ SenderEmail: 'guest@external.org' })
            );
            const missingEmailUser = await openAdapter.testResolveContextUser(
                createMessage({ SenderID: 'unknown-user', SenderEmail: undefined })
            );
            expect(unknownEmailUser?.Email).toBe('bot@company.com');
            expect(missingEmailUser?.Email).toBe('bot@company.com');
        });

        it('should be case-insensitive for email matching', async () => {
            const msg = createMessage({ SenderEmail: 'ALICE@EXAMPLE.COM' });
            const user = await adapter.testResolveContextUser(msg);
            expect(user?.Email).toBe('alice@example.com');
        });

        it('should refuse unmapped senders in HandleMessage without running any agent or showing typing', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            const runSpy = vi.fn();
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: runSpy,
                FollowHandoffs: vi.fn().mockResolvedValue([]),
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({
                IsDirectMessage: true,
                SenderID: 'external-guest-1',
                SenderEmail: 'guest@external.org',
            });
            await adapter.HandleMessage(msg);

            expect(runSpy).not.toHaveBeenCalled();
            expect(adapter.TypeIndicatorShown).toBe(false);
            expect(adapter.FinalMessages).toHaveLength(1);
            expect(adapter.FinalMessages[0].PlainText).toContain('MemberJunction user');
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
            expect(UserCache.Instance.Users.length).toBe(4);
        });

        it('sender resolution does not empty the shared cache', async () => {
            await adapter.Initialize();
            const user = await adapter.testResolveContextUser(createMessage({ SenderEmail: 'alice@example.com' }));
            expect(user?.Email).toBe('alice@example.com');
            expect(UserCache.Instance.Users.length).toBe(4);
        });

        it('the mock itself reproduces the footgun (keeps these tests able to fail)', () => {
            // If someone "simplifies" the mock back to a static list, this fails — and with it
            // goes the suite's ability to catch a regression to `new UserCache()`.
            expect(UserCache.Instance.Users.length).toBe(4);
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

        it('should skip orchestration metadata in step outputs and use a string agentRun.FinalPayload', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: {
                        // A string payload is stored JSON-encoded ("..."), which looksLikeJSON does not skip
                        FinalPayload: JSON.stringify('Quantum computing is a paradigm that uses quantum bits.'),
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

        it('should fall back to a string agentRun.Result on an older row with no FinalPayload', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: {
                        Result: JSON.stringify('Quantum computing is a paradigm that uses quantum bits.'),
                        Steps: []
                    }
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain('Quantum computing');
        });

        it('should prefer agentRun.FinalPayload over agentRun.Result when a row has both', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: {
                        FinalPayload: JSON.stringify('payload text'),
                        Result: JSON.stringify('result text'),
                        Steps: []
                    }
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            expect(sent?.PlainText).toContain('payload text');
            expect(sent?.PlainText).not.toContain('result text');
        });

        it('should show friendly fallback when the run payload is JSON (artifact handles it)', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockResolvedValue(wrapInConversationResult({
                    success: true,
                    agentRun: {
                        FinalPayload: JSON.stringify({ summary: 'Quantum computing is a paradigm...' }),
                        Steps: []
                    }
                }))
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);
            const sent = adapter.FinalMessages[0] ?? adapter.FinalUpdates[0]?.response;
            // A JSON payload should NOT be shown raw — friendly fallback instead
            expect(sent?.PlainText).toContain('MJ Explorer');
            expect(sent?.PlainText).not.toContain('"summary"');
        });

        it('should show friendly fallback when an older row has only a JSON agentRun.Result', async () => {
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

        it('should cap delegation at MAX_HANDOFF_HOPS', async () => {
            const { AgentRunner, ResolveHandoffTarget } = await import('@memberjunction/ai-agents');
            vi.mocked(ResolveHandoffTarget).mockClear();

            const targetsByCall = ['Sage', 'Research Bot', 'Marketing Agent', 'Codesmith'];
            let callCount = 0;
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockImplementation(() => {
                    const nextTarget = targetsByCall[callCount] ?? 'Codesmith';
                    callCount++;
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        payload: { invokeAgent: nextTarget },
                        agentRun: { Message: `Delegation hop ${callCount}`, Steps: [] }
                    }));
                })
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);

            // Initial run (Default Agent) + MAX_HANDOFF_HOPS (3) target runs = 4 runs total
            expect(callCount).toBe(4);
            expect(ResolveHandoffTarget).toHaveBeenCalledTimes(3);
            expect(vi.mocked(ResolveHandoffTarget).mock.calls.map(c => c[0].HandoffChain)).toEqual([
                [],
                ['agent-guid-123'],
                ['agent-guid-123', 'sage-id'],
            ]);
        });

        it('should resolve fallback delegation targets via ResolveHandoffTarget and refuse sub-agents or action-only agents', async () => {
            const { AgentRunner, ResolveHandoffTarget } = await import('@memberjunction/ai-agents');
            vi.mocked(ResolveHandoffTarget).mockClear();

            // First call: Sage delegates via payload.invokeAgent to Codesmith, which ResolveHandoffTarget refuses as NotDiscoverable
            vi.mocked(ResolveHandoffTarget).mockResolvedValueOnce({
                Refusal: {
                    Reason: 'NotDiscoverable',
                    Message: "Codesmith can't be reached directly via Handoff.",
                },
                Candidates: [],
            });

            let runCalls = 0;
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockImplementation(() => {
                    runCalls++;
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        payload: { invokeAgent: 'Codesmith' },
                        agentRun: { Message: 'Attempting to delegate to Codesmith.', Steps: [] },
                    }));
                }),
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);

            expect(ResolveHandoffTarget).toHaveBeenCalledTimes(1);
            expect(ResolveHandoffTarget).toHaveBeenCalledWith(
                expect.objectContaining({
                    AgentName: 'Codesmith',
                    SourceAgentID: 'agent-guid-123',
                    HandoffChain: [],
                })
            );
            // Target run must not execute when ResolveHandoffTarget refuses
            expect(runCalls).toBe(1);
            const allMessages = [
                ...adapter.FinalMessages,
                ...adapter.FinalUpdates.map(u => u.response),
            ];
            expect(allMessages.some(m => m.PlainText.includes('Attempting to delegate to Codesmith.'))).toBe(true);
        });

        it('should follow first-class result.handoff via AgentRunner.FollowHandoffs with OnHopStart and OnHopEnd hooks', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            let capturedParams: Record<string, unknown> | undefined;
            const followHandoffsMock = vi.fn().mockImplementation(async (input: {
                hooks?: {
                    OnHopStart?: (hopInfo: Record<string, unknown>, source: Record<string, unknown>) => Promise<{
                        onProgress?: (p: { message: string }) => void;
                        onStreaming?: (c: { content: string }) => void;
                    } | void>;
                    OnHopEnd?: (hopInfo: Record<string, unknown>, outcome: Record<string, unknown>) => Promise<void>;
                };
                sourceResult: ExecuteAgentResult;
                sourceConversationDetailId: string;
            }) => {
                const targetAgent = { ID: 'marketing-id', Name: 'Marketing Agent' } as unknown as MJAIAgentEntityExtended;
                const hopInfo = {
                    hopIndex: 0,
                    sourceAgent: { ID: 'agent-guid-123', Name: 'Default Agent' },
                    sourceConversationDetailId: input.sourceConversationDetailId,
                    targetAgent,
                    targetConversationDetailId: 'target-detail-1',
                    preset: { ID: 'preset-1', Name: 'Quick', DisplayName: 'Quick Draft' },
                    presetSource: 'AgentDefault',
                    handoff: input.sourceResult.handoff,
                };
                const callbacks = await input.hooks?.OnHopStart?.(hopInfo, {
                    agentResult: input.sourceResult,
                    conversationDetailId: input.sourceConversationDetailId,
                });
                callbacks?.onStreaming?.({ content: 'Streaming draft...' });

                const outcome = {
                    hopIndex: 0,
                    targetAgent,
                    targetConversationDetailId: 'target-detail-1',
                    preset: hopInfo.preset,
                    presetSource: 'AgentDefault',
                    agentResult: {
                        success: true,
                        agentRun: { Message: 'Final marketing copy delivered.', Steps: [] },
                    } as unknown as ExecuteAgentResult,
                };
                await input.hooks?.OnHopEnd?.(hopInfo, outcome);
                return [outcome];
            });

            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockImplementation((params: Record<string, unknown>) => {
                    capturedParams = params;
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        handoff: {
                            targetAgentId: 'marketing-id',
                            targetAgentName: 'Marketing Agent',
                            reason: 'User asked for marketing copy',
                            handoffChain: ['agent-guid-123'],
                            runStepId: 'step-handoff-1',
                        },
                        agentRun: {
                            Message: 'Bringing in Marketing Agent.',
                            FinalStep: 'Handoff',
                            Steps: [],
                        },
                    }));
                }),
                FollowHandoffs: followHandoffsMock,
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await adapter.HandleMessage(msg);

            expect(capturedParams?.handoffChain).toEqual([]);
            expect(followHandoffsMock).toHaveBeenCalledTimes(1);
            const allTexts = [
                ...adapter.FinalMessages.map(m => m.PlainText),
                ...adapter.FinalUpdates.map(u => u.response.PlainText),
            ];
            expect(allTexts.some(t => t.includes('Default Agent transferred you to **Marketing Agent** (Quick Draft)'))).toBe(true);
            expect(allTexts.some(t => t.includes('Final marketing copy delivered.'))).toBe(true);
        });

        it('should not leak source internal working turns into FollowHandoffs conversationMessages', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            let followHandoffsMessages: Array<{ role: string; content: string }> | undefined;
            const followHandoffsMock = vi.fn().mockImplementation(async (input: {
                params: { conversationMessages?: Array<{ role: string; content: string }> };
            }) => {
                followHandoffsMessages = input.params.conversationMessages;
                return [];
            });

            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockImplementation((params: {
                    conversationMessages: Array<{ role: string; content: string }>;
                }) => {
                    // Simulate BaseAgent mutating params.conversationMessages in-place with internal retry/working turns
                    params.conversationMessages.push({
                        role: 'user',
                        content: 'Retrying due to: refused target',
                    });
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        handoff: {
                            targetAgentId: 'marketing-id',
                            targetAgentName: 'Marketing Agent',
                            handoffChain: ['agent-guid-123'],
                        },
                        agentRun: {
                            Message: 'Bringing in Marketing Agent.',
                            FinalStep: 'Handoff',
                            Steps: [],
                        },
                    }));
                }),
                FollowHandoffs: followHandoffsMock,
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true, Text: 'Hello agent' });
            await adapter.HandleMessage(msg);

            expect(followHandoffsMock).toHaveBeenCalledTimes(1);
            expect(followHandoffsMessages).toEqual([
                { role: 'user', content: 'Hello agent' },
            ]);
        });

        it('should omit handoffChain and skip FollowHandoffs when DisableDelegation is true', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            const pinnedAdapter = new TestAdapter({
                ...defaultSettings,
                DisableDelegation: true,
            });
            await pinnedAdapter.Initialize();

            let capturedParams: Record<string, unknown> | undefined;
            const followHandoffsMock = vi.fn().mockResolvedValue([]);
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockImplementation((params: Record<string, unknown>) => {
                    capturedParams = params;
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        handoff: {
                            targetAgentId: 'marketing-id',
                            targetAgentName: 'Marketing Agent',
                            handoffChain: ['agent-guid-123'],
                        },
                        agentRun: {
                            Message: 'Pinned agent direct response.',
                            Steps: [],
                        },
                    }));
                }),
                FollowHandoffs: followHandoffsMock,
            }) as ReturnType<typeof vi.fn>);

            const msg = createMessage({ IsDirectMessage: true });
            await pinnedAdapter.HandleMessage(msg);

            expect(capturedParams?.handoffChain).toBeUndefined();
            expect(followHandoffsMock).not.toHaveBeenCalled();
            const allTexts = [
                ...pinnedAdapter.FinalMessages.map(m => m.PlainText),
                ...pinnedAdapter.FinalUpdates.map(u => u.response.PlainText),
            ];
            expect(allTexts.some(t => t.includes('Pinned agent direct response.'))).toBe(true);
        });
    });

    describe('same-thread serialization', () => {
        beforeEach(async () => {
            await adapter.Initialize();
        });

        it('serializes three concurrent messages on one thread and reuses a single ConversationID', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            const observedConversationIds: Array<string | undefined> = [];
            const executionOrder: string[] = [];
            let activeInFlight = 0;
            let maxConcurrent = 0;
            let createdConversations = 0;

            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockImplementation(
                    async (_params: Record<string, unknown>, options: { conversationId?: string; userMessage?: string }) => {
                        activeInFlight++;
                        maxConcurrent = Math.max(maxConcurrent, activeInFlight);
                        executionOrder.push(options.userMessage ?? '');
                        observedConversationIds.push(options.conversationId);

                        await new Promise(resolve => setTimeout(resolve, 15));

                        const resolvedConvoId = options.conversationId ?? `convo-created-${++createdConversations}`;
                        activeInFlight--;
                        return {
                            agentResult: {
                                success: true,
                                agentRun: { Message: `Reply to: ${options.userMessage}`, Steps: [] },
                            },
                            conversationId: resolvedConvoId,
                            userMessageDetailId: `user-detail-${executionOrder.length}`,
                            agentResponseDetailId: `agent-detail-${executionOrder.length}`,
                            artifactInfo: undefined,
                        };
                    }
                ),
                FollowHandoffs: vi.fn().mockResolvedValue([]),
            }) as ReturnType<typeof vi.fn>);

            const msg1 = createMessage({
                MessageID: 'thread-root-1',
                ThreadID: null,
                ChannelID: 'C-THREAD',
                IsBotMention: true,
                Text: '<@BOT123> Hey',
            });
            const msg2 = createMessage({
                MessageID: 'reply-2',
                ThreadID: 'thread-root-1',
                ChannelID: 'C-THREAD',
                IsBotMention: true,
                Text: '<@BOT123> Check Q3 pipeline',
            });
            const msg3 = createMessage({
                MessageID: 'reply-3',
                ThreadID: 'thread-root-1',
                ChannelID: 'C-THREAD',
                IsBotMention: true,
                Text: '<@BOT123> Only for EMEA',
            });

            await Promise.all([
                adapter.HandleMessage(msg1),
                adapter.HandleMessage(msg2),
                adapter.HandleMessage(msg3),
            ]);

            expect(maxConcurrent).toBe(1);
            expect(executionOrder).toEqual(['Hey', 'Check Q3 pipeline', 'Only for EMEA']);
            expect(createdConversations).toBe(1);
            expect(observedConversationIds).toEqual([
                undefined,
                'convo-created-1',
                'convo-created-1',
            ]);
        });
    });

    describe('agent permission, discoverability, and AllowedAgentIDs enforcement (#6717)', () => {
        const alice = { ID: 'u1', Email: 'alice@example.com', Name: 'Alice', IsActive: true, UserRoles: [{ RoleID: 'role-member' }] } as unknown as UserInfo;
        const bob = { ID: 'u2', Email: 'bob@example.com', Name: 'Bob', IsActive: true, UserRoles: [{ RoleID: 'role-admin' }] } as unknown as UserInfo;

        function seedCatalog(
            agents: Array<Record<string, unknown>>,
            permissions: Array<Record<string, unknown>> = [],
            defaultAgentRow?: Record<string, unknown>
        ): void {
            aiEngineState.agents = agents;
            aiEngineState.permissions = permissions;
            const callCount = { n: 0 };
            vi.mocked(RunView).mockImplementation(() => ({
                RunView: vi.fn().mockImplementation(() => {
                    callCount.n++;
                    if (callCount.n === 1) {
                        return { Success: true, Results: [defaultAgentRow ?? agents[0]] };
                    }
                    return { Success: true, Results: agents };
                }),
            }) as unknown as RunView);
        }

        it('warms AIEngineBase as the service account during Initialize', async () => {
            await adapter.Initialize();
            expect(aiEngineState.configCalls.length).toBeGreaterThanOrEqual(1);
            expect((aiEngineState.configCalls[0].user as { Email?: string })?.Email).toBe('bot@company.com');
        });

        it('excludes sub-agents, child agents, and Required prototype templates from AvailableAgentNames and refuses direct mentions', async () => {
            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'sub-id', Name: 'Internal Sub', Status: 'Active', InvocationMode: 'Sub-Agent', ParentID: null },
                { ID: 'child-id', Name: 'Child Helper', Status: 'Active', InvocationMode: 'Top-Level', ParentID: 'default-id' },
                { ID: 'proto-id', Name: 'Template Proto', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, InstantiationMode: 'Required' },
            ];
            seedCatalog(catalog);

            const secAdapter = new TestAdapter(defaultSettings);
            await secAdapter.Initialize();

            expect(secAdapter.AvailableAgentNames).toEqual(['Default Agent']);

            const subRes = await secAdapter.testResolveAgent(
                createMessage({ Text: '@Internal Sub run', MentionedAgentNames: ['Internal Sub'] }),
                [],
                alice
            );
            expect(subRes.agent).toBeNull();
            expect(subRes.refusalMessage).toContain('cannot be invoked directly');

            const childRes = await secAdapter.testResolveAgent(
                createMessage({ Text: '@Child Helper run', MentionedAgentNames: ['Child Helper'] }),
                [],
                alice
            );
            expect(childRes.agent).toBeNull();
            expect(childRes.refusalMessage).toContain('cannot be invoked directly');

            const protoRes = await secAdapter.testResolveAgent(
                createMessage({ Text: '@Template Proto run', MentionedAgentNames: ['Template Proto'] }),
                [],
                alice
            );
            expect(protoRes.agent).toBeNull();
            expect(protoRes.refusalMessage).toContain('cannot be invoked directly');
        });

        it('throws at Initialize when DefaultAgentName is a Sub-Agent or outside AllowedAgentIDs', async () => {
            const subDefault = { ID: 'sub-id', Name: 'Sub Default', Status: 'Active', InvocationMode: 'Sub-Agent', ParentID: null };
            seedCatalog([subDefault], [], subDefault);
            const badSubAdapter = new TestAdapter({ ...defaultSettings, DefaultAgentName: 'Sub Default' });
            await expect(badSubAdapter.Initialize()).rejects.toThrow(/not directly discoverable/i);

            const topDefault = { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null };
            seedCatalog([topDefault], [], topDefault);
            const badAllowAdapter = new TestAdapter({ ...defaultSettings, AllowedAgentIDs: ['other-id'] });
            await expect(badAllowAdapter.Initialize()).rejects.toThrow(/not in AllowedAgentIDs/i);
        });

        it('enforces AllowedAgentIDs across AvailableAgentNames, @mention, ExecuteAgentParams.data, and fallback delegation', async () => {
            const { AgentRunner, ResolveHandoffTarget } = await import('@memberjunction/ai-agents');
            vi.mocked(ResolveHandoffTarget).mockClear();

            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, Description: 'Default' },
                { ID: 'sage-id', Name: 'Sage', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, Description: 'Sage' },
                { ID: 'billing-id', Name: 'Billing Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, Description: 'Billing' },
            ];
            seedCatalog(catalog);

            const scopedAdapter = new TestAdapter({
                ...defaultSettings,
                AllowedAgentIDs: ['DEFAULT-ID', 'SAGE-ID'], // mixed case to prove UUID-insensitive matching
            });
            await scopedAdapter.Initialize();

            expect(scopedAdapter.AvailableAgentNames).toEqual(['Default Agent', 'Sage']);

            // Explicit mention of disallowed agent is refused
            const blocked = await scopedAdapter.testResolveAgent(
                createMessage({ Text: '@Billing Agent invoice', MentionedAgentNames: ['Billing Agent'] }),
                [],
                alice
            );
            expect(blocked.agent).toBeNull();
            expect(blocked.refusalMessage).toContain('not available in this app');

            // Allowed agent succeeds and propagates ALL_AVAILABLE_AGENTS + HostAllowedIDs
            let capturedParams: Record<string, unknown> | undefined;
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockImplementation((params: Record<string, unknown>) => {
                    capturedParams = params;
                    return Promise.resolve(wrapInConversationResult({
                        success: true,
                        payload: { invokeAgent: 'Billing Agent' },
                        agentRun: { Message: 'Handing off to Billing Agent.', Steps: [] },
                    }));
                }),
                FollowHandoffs: vi.fn().mockResolvedValue([]),
            }) as ReturnType<typeof vi.fn>);

            await scopedAdapter.HandleMessage(createMessage({ IsDirectMessage: true, SenderEmail: 'alice@example.com' }));

            expect((capturedParams?.data as { ALL_AVAILABLE_AGENTS?: Array<{ ID: string }> })?.ALL_AVAILABLE_AGENTS?.map(a => a.ID)).toEqual([
                'default-id',
                'sage-id',
            ]);
            expect(ResolveHandoffTarget).toHaveBeenCalledWith(
                expect.objectContaining({
                    AgentName: 'Billing Agent',
                    HostAllowedIDs: ['DEFAULT-ID', 'SAGE-ID'],
                })
            );
        });

        it('refuses @mention when user has CanView but lacks CanRun without falling back to default', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            const runSpy = vi.fn();
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: runSpy,
                FollowHandoffs: vi.fn().mockResolvedValue([]),
            }) as ReturnType<typeof vi.fn>);

            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'payroll-id', Name: 'Payroll Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
            ];
            const perms = [
                { AgentID: 'payroll-id', RoleID: 'role-member', CanView: true, CanRun: false, CanEdit: false, CanDelete: false },
                { AgentID: 'payroll-id', RoleID: 'role-admin', CanView: true, CanRun: true, CanEdit: false, CanDelete: false },
            ];
            seedCatalog(catalog, perms);

            const secAdapter = new TestAdapter(defaultSettings);
            await secAdapter.Initialize();

            // Alice (member: CanView=true, CanRun=false) is refused
            await secAdapter.HandleMessage(createMessage({
                IsDirectMessage: true,
                SenderEmail: 'alice@example.com',
                Text: '@Payroll Agent run payroll',
                MentionedAgentNames: ['Payroll Agent'],
            }));
            expect(runSpy).not.toHaveBeenCalled();
            expect(secAdapter.TypeIndicatorShown).toBe(false);
            expect(secAdapter.FinalMessages[0].PlainText).toContain("don't have permission to run");
            expect(secAdapter.FinalMessages[0].PlainText).toContain('Payroll Agent');

            // Bob (admin: CanRun=true) succeeds
            const bobRes = await secAdapter.testResolveAgent(
                createMessage({ Text: '@Payroll Agent run payroll', MentionedAgentNames: ['Payroll Agent'] }),
                [],
                bob
            );
            expect(bobRes.agent?.Name).toBe('Payroll Agent');
        });

        it('hides agents user cannot view from NotFound help notes and ignores implicit prose matches', async () => {
            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'public-id', Name: 'Public Helper', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'secret-id', Name: 'Secret Audit', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
            ];
            const perms = [
                // Only admin can view/run Secret Audit
                { AgentID: 'secret-id', RoleID: 'role-admin', CanView: true, CanRun: true, CanEdit: false, CanDelete: false },
            ];
            seedCatalog(catalog, perms);

            const secAdapter = new TestAdapter(defaultSettings);
            await secAdapter.Initialize();

            // Explicit @Secret Audit, prefix @sec, bare, anywhere, and forged form_submit by Alice:
            // ALL are indistinguishable from no match (no note, never leaks Secret Audit).
            const explicitRes = await secAdapter.testResolveAgent(
                createMessage({ Text: '@Secret Audit report', MentionedAgentNames: ['Secret Audit'] }),
                [],
                alice
            );
            expect(explicitRes.agent?.Name).toBe('Default Agent');
            expect(explicitRes.multiAgentNote).toBeNull();

            // Implicit prose match (no '@') by Alice: silently ignored without a "couldn't find" side-channel note
            const proseRes = await secAdapter.testResolveAgent(
                createMessage({ Text: 'we need a secret audit done', MentionedAgentNames: ['Secret Audit'] }),
                [],
                alice
            );
            expect(proseRes.agent?.Name).toBe('Default Agent');
            expect(proseRes.multiAgentNote).toBeNull();

            // Genuinely nonexistent agent passed programmatically lists only viewable+runnable agents (never Secret Audit)
            const unknownRes = await secAdapter.testResolveAgent(
                createMessage({ Text: 'hello', MentionedAgentNames: ['NonexistentBot'] }),
                [],
                alice
            );
            expect(unknownRes.agent?.Name).toBe('Default Agent');
            expect(unknownRes.multiAgentNote).toContain("couldn't find");
            expect(unknownRes.multiAgentNote).toContain('Public Helper');
            expect(unknownRes.multiAgentNote).not.toContain('Secret Audit');
        });

        it('never leaks hidden agent names across all 4 matcher passes, multi-mention notes, ambiguity counts, or forged form submits', async () => {
            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'pub-id', Name: 'Public Helper', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'zebra-vis-id', Name: 'Zebra Public', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'zebra-hid-id', Name: 'Zebra Payroll Audit', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'onyx-hid-id', Name: 'Onyx Secret Vault', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
            ];
            const perms = [
                { AgentID: 'zebra-hid-id', RoleID: 'role-admin', CanView: true, CanRun: true, CanEdit: false, CanDelete: false },
                { AgentID: 'onyx-hid-id', RoleID: 'role-admin', CanView: true, CanRun: true, CanEdit: false, CanDelete: false },
            ];
            seedCatalog(catalog, perms);

            const secAdapter = new TestAdapter(defaultSettings);
            await secAdapter.Initialize();

            // Pass 1 (exact @Full Name), Pass 2 (prefix @onyx), Pass 3 (bare start), Pass 4 (anywhere):
            // Simulate MapTeamsActivity/MapSlackEvent pre-populating MentionedAgentNames with unfiltered matchAgentMentions.
            for (const text of [
                '@Onyx Secret Vault hi',
                '@onyx hi',
                'Onyx Secret Vault hi',
                'please run onyx secret vault now',
                '@nosuchthing hi',
            ]) {
                const preMatched = secAdapter.testMatchAgentMentions(text);
                const res = await secAdapter.testResolveAgent(
                    createMessage({ Text: text, MentionedAgentNames: preMatched }),
                    [],
                    alice
                );
                expect(res.agent?.Name).toBe('Default Agent');
                expect(res.multiAgentNote).toBeNull();
            }

            // Multi-mention (@pub @onyx and @onyx @pub): never prints hidden agent name in "Other mentioned agents"
            for (const text of ['@pub @onyx help', '@onyx @pub help']) {
                const preMatched = secAdapter.testMatchAgentMentions(text);
                const res = await secAdapter.testResolveAgent(
                    createMessage({ Text: text, MentionedAgentNames: preMatched }),
                    [],
                    alice
                );
                expect(res.agent?.Name).toBe('Public Helper');
                expect(res.multiAgentNote).toBeNull();
            }

            // Prefix ambiguity: hidden "Zebra Payroll Audit" must NOT break "@zeb" for visible "Zebra Public"
            const ambigPreMatched = secAdapter.testMatchAgentMentions('@zeb help');
            expect(ambigPreMatched).toEqual([]); // unfiltered matcher saw both Zebra agents as ambiguous
            const ambigRes = await secAdapter.testResolveAgent(
                createMessage({ Text: '@zeb help', MentionedAgentNames: ambigPreMatched }),
                [],
                alice
            );
            expect(ambigRes.agent?.Name).toBe('Zebra Public');
            expect(ambigRes.multiAgentNote).toBeNull();

            // Forged Teams form_submit carrying a hidden mj_agent name: indistinguishable from no match
            const formRes = await secAdapter.testResolveAgent(
                createMessage({
                    Text: '@{"_mode":"form","action":"formSubmit","fields":[]}',
                    MentionedAgentNames: ['Onyx Secret Vault'],
                    RawEvent: { type: 'form_submit' },
                }),
                [],
                alice
            );
            expect(formRes.agent?.Name).toBe('Default Agent');
            expect(formRes.multiAgentNote).toBeNull();

            // Programmatic multi-mention (where resolveAgent does NOT re-match text):
            // resolveMentionedAgent itself must omit hidden agents from "Other mentioned agents (...)".
            const programmaticMulti = await secAdapter.testResolveAgent(
                createMessage({
                    Text: 'run this command',
                    MentionedAgentNames: ['Public Helper', 'Onyx Secret Vault'],
                    RawEvent: { type: 'slash_command' },
                }),
                [],
                alice
            );
            expect(programmaticMulti.agent?.Name).toBe('Public Helper');
            expect(programmaticMulti.multiAgentNote).toBeNull();
        });

        it('does not confirm hidden agent existence when a user replies in a thread they started with a hidden full name or prefix', async () => {
            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'onyx-hid-id', Name: 'Onyx Secret Vault', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
            ];
            const perms = [
                { AgentID: 'onyx-hid-id', RoleID: 'role-admin', CanView: true, CanRun: true, CanEdit: false, CanDelete: false },
            ];
            seedCatalog(catalog, perms);

            const secAdapter = new TestAdapter(defaultSettings);
            await secAdapter.Initialize();

            // Thread started by Alice with hidden full name, hidden prefix, and nonexistent name:
            // replying in each thread must yield the exact same outcome (Default Agent, no refusal, no note)
            // both with no rememberedAgentId (e.g. after restart) and with rememberedAgentId = 'default-id'.
            for (const rootText of ['@Onyx Secret Vault hi', '@onyx hi', '@nosuchthing hi']) {
                const history: IncomingMessage[] = [
                    createMessage({
                        MessageID: 'root-1',
                        ThreadID: 'thread-probe',
                        SenderID: 'alice-platform-id',
                        SenderEmail: alice.Email,
                        Text: rootText,
                        MentionedAgentNames: undefined,
                    }),
                    createMessage({
                        MessageID: 'bot-1',
                        ThreadID: 'thread-probe',
                        SenderID: 'BOT123',
                        Text: 'Hello!',
                    }),
                ];

                const replyNoRemembered = await secAdapter.testResolveAgent(
                    createMessage({ ThreadID: 'thread-probe', Text: 'follow up', MentionedAgentNames: [] }),
                    history,
                    alice
                );
                expect(replyNoRemembered.agent?.Name).toBe('Default Agent');
                expect(replyNoRemembered.refusalMessage).toBeUndefined();
                expect(replyNoRemembered.multiAgentNote).toBeNull();

                const replyWithDefaultRemembered = await secAdapter.testResolveAgent(
                    createMessage({ ThreadID: 'thread-probe', Text: 'follow up', MentionedAgentNames: [] }),
                    history,
                    alice,
                    'default-id'
                );
                expect(replyWithDefaultRemembered.agent?.Name).toBe('Default Agent');
                expect(replyWithDefaultRemembered.refusalMessage).toBeUndefined();
                expect(replyWithDefaultRemembered.multiAgentNote).toBeNull();
            }
        });

        it('uses live AIEngineBase agent status in fallback handleDelegation so agents deactivated after Initialize are refused', async () => {
            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'target-id', Name: 'Target Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
            ];
            seedCatalog(catalog, []);

            const { AgentRunner, ResolveHandoffTarget } = await import('@memberjunction/ai-agents');
            const origResolve = vi.mocked(ResolveHandoffTarget).getMockImplementation();
            const seenTargetStatuses: Array<string | undefined> = [];
            vi.mocked(ResolveHandoffTarget).mockImplementation(async (params: { AgentName?: string; Agents?: Array<{ Name?: string; Status?: string }> }) => {
                const target = (params.Agents ?? []).find(a => a.Name === params.AgentName);
                seenTargetStatuses.push(target?.Status);
                if (!target || target.Status !== 'Active') {
                    return { Target: null, Refusal: { Reason: 'NotFound', Message: 'Target agent is inactive' } };
                }
                return { Target: target as never };
            });

            const executedAgents: string[] = [];
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockImplementation(async (params: { agent: { Name: string } }) => {
                    executedAgents.push(params.agent.Name);
                    return {
                        agentResult: {
                            success: true,
                            payload: params.agent.Name === 'Default Agent' ? { invokeAgent: 'Target Agent' } : {},
                            agentRun: { Message: 'Done.', Steps: [] },
                        },
                        conversationId: 'deleg-convo-1',
                        userMessageDetailId: 'u-1',
                        agentResponseDetailId: 'a-1',
                        artifactInfo: undefined,
                    };
                }),
                FollowHandoffs: vi.fn().mockResolvedValue([]),
            }) as ReturnType<typeof vi.fn>);

            try {
                const delegAdapter = new TestAdapter(defaultSettings);
                await delegAdapter.Initialize();

                // Deactivate Target Agent in live AIEngineBase cache AFTER Initialize()
                aiEngineState.agents[1]['Status'] = 'Disabled';

                await delegAdapter.HandleMessage(createMessage({
                    IsDirectMessage: true,
                    SenderEmail: alice.Email,
                    Text: 'delegate please',
                }));

                // ResolveHandoffTarget must receive the live 'Disabled' status, NOT the stale 'Active' snapshot
                expect(seenTargetStatuses).toEqual(['Disabled']);
                expect(executedAgents).toEqual(['Default Agent']);
            } finally {
                if (origResolve) {
                    vi.mocked(ResolveHandoffTarget).mockImplementation(origResolve);
                }
            }
        });

        it('refuses agents deactivated after Initialize() and fails closed when GetEffectivePermissions throws', async () => {
            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'live-id', Name: 'Live Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
            ];
            seedCatalog(catalog, []);

            const secAdapter = new TestAdapter(defaultSettings);
            await secAdapter.Initialize();

            // Confirm Live Agent works while Active
            const before = await secAdapter.testResolveAgent(
                createMessage({ Text: '@Live Agent hi', MentionedAgentNames: ['Live Agent'] }),
                [],
                alice
            );
            expect(before.agent?.Name).toBe('Live Agent');

            // Deactivate Live Agent in live AIEngineBase cache AFTER Initialize()
            aiEngineState.agents[1]['Status'] = 'Disabled';

            const afterMention = await secAdapter.testResolveAgent(
                createMessage({ Text: '@Live Agent hi', MentionedAgentNames: ['Live Agent'] }),
                [],
                alice
            );
            expect(afterMention.agent?.Name).toBe('Default Agent');
            expect(afterMention.multiAgentNote).toBeNull();

            // Restore Active, then simulate GetEffectivePermissions throwing -> must fail closed (NotFound, never Allowed)
            aiEngineState.agents[1]['Status'] = 'Active';
            const { AIAgentPermissionHelper } = await import('@memberjunction/ai-engine-base');
            const origImpl = vi.mocked(AIAgentPermissionHelper.GetEffectivePermissions).getMockImplementation();
            vi.mocked(AIAgentPermissionHelper.GetEffectivePermissions).mockRejectedValueOnce(new Error('DB transient failure'));
            try {
                const verdict = await (secAdapter as unknown as {
                    evaluateAgentAccess(agent: unknown, user: unknown): Promise<string>;
                }).evaluateAgentAccess(aiEngineState.agents[1], alice);
                expect(verdict).toBe('NotFound');
            } finally {
                if (origImpl) {
                    vi.mocked(AIAgentPermissionHelper.GetEffectivePermissions).mockImplementation(origImpl);
                }
            }
        });

        it('narrows ALL_AVAILABLE_AGENTS in ExecuteAgentParams.data to agents the calling user can view and run', async () => {
            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Description: 'Public default', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'secret-id', Name: 'Secret Agent', Description: 'Admin-only secret description', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
            ];
            const perms = [
                { AgentID: 'secret-id', RoleID: 'role-admin', CanView: true, CanRun: true, CanEdit: false, CanDelete: false },
            ];
            seedCatalog(catalog, perms);

            const { AgentRunner } = await import('@memberjunction/ai-agents');
            const capturedData: Array<Record<string, unknown> | undefined> = [];
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockImplementation(async (params: { data?: Record<string, unknown> }) => {
                    capturedData.push(params.data);
                    return {
                        agentResult: { success: true, agentRun: { Message: 'Ok.', Steps: [] } },
                        conversationId: 'convo-narrow-1',
                        userMessageDetailId: 'u-1',
                        agentResponseDetailId: 'a-1',
                        artifactInfo: undefined,
                    };
                }),
                FollowHandoffs: vi.fn().mockResolvedValue([]),
            }) as ReturnType<typeof vi.fn>);

            const scopedAdapter = new TestAdapter({
                ...defaultSettings,
                AllowedAgentIDs: ['default-id', 'secret-id'],
            });
            await scopedAdapter.Initialize();

            await scopedAdapter.HandleMessage(createMessage({
                IsDirectMessage: true,
                SenderEmail: alice.Email,
                Text: 'hello',
            }));

            expect(capturedData).toHaveLength(1);
            const available = capturedData[0]?.['ALL_AVAILABLE_AGENTS'] as Array<{ ID: string; Name: string }>;
            expect(available.map(a => a.ID)).toEqual(['default-id']);
            expect(JSON.stringify(available)).not.toContain('Secret Agent');
        });

        it('enforces permissions on thread affinity when another user replies to an admin thread', async () => {
            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
                { ID: 'finance-id', Name: 'Finance Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
            ];
            const perms = [
                { AgentID: 'finance-id', RoleID: 'role-admin', CanView: true, CanRun: true, CanEdit: false, CanDelete: false },
            ];
            seedCatalog(catalog, perms);

            const secAdapter = new TestAdapter(defaultSettings);
            await secAdapter.Initialize();

            const threadHistory: IncomingMessage[] = [
                createMessage({
                    MessageID: 't1',
                    SenderID: 'bob-platform-id',
                    SenderEmail: 'bob@example.com',
                    Text: '@Finance Agent pull Q4 numbers',
                    MentionedAgentNames: ['Finance Agent'],
                }),
                createMessage({
                    MessageID: 't2',
                    SenderID: 'BOT123',
                    Text: 'Here are the Q4 numbers.',
                }),
            ];

            // Bob (admin) continues thread with Finance Agent (both via history and rememberedAgentId)
            const bobReply = await secAdapter.testResolveAgent(
                createMessage({ ThreadID: 't1', Text: 'break down by region', MentionedAgentNames: [] }),
                threadHistory,
                bob,
                'finance-id'
            );
            expect(bobReply.agent?.Name).toBe('Finance Agent');

            // Alice (cannot view/run Finance Agent) replying in a thread actually served by Finance Agent
            // (rememberedAgentId='finance-id') is refused without naming Finance Agent.
            const aliceReply = await secAdapter.testResolveAgent(
                createMessage({ ThreadID: 't1', Text: 'show me too', MentionedAgentNames: [] }),
                threadHistory,
                alice,
                'finance-id'
            );
            expect(aliceReply.agent).toBeNull();
            expect(aliceReply.refusalMessage).toContain("don't have permission");
            expect(aliceReply.refusalMessage).not.toContain('Finance Agent');
        });

        it('refuses when user lacks CanRun on the default agent itself', async () => {
            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
            ];
            const perms = [
                { AgentID: 'default-id', RoleID: 'role-admin', CanView: true, CanRun: true, CanEdit: false, CanDelete: false },
            ];
            seedCatalog(catalog, perms);

            const secAdapter = new TestAdapter(defaultSettings);
            await secAdapter.Initialize();

            const aliceRes = await secAdapter.testResolveAgent(
                createMessage({ Text: 'hello', MentionedAgentNames: [] }),
                [],
                alice
            );
            expect(aliceRes.agent).toBeNull();
            expect(aliceRes.refusalMessage).toContain("don't have permission");
        });

        it('enforces derived-agent privacy (2x2 RBAC: derived with 0 ACL rows is owner-only)', async () => {
            const catalog = [
                { ID: 'default-id', Name: 'Default Agent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, BaseAgentID: null },
                { ID: 'derived-id', Name: 'Bob Personal Bot', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, BaseAgentID: 'default-id', OwnerUserID: 'u2' },
            ];
            seedCatalog(catalog, []);

            const secAdapter = new TestAdapter(defaultSettings);
            await secAdapter.Initialize();

            // Bob (OwnerUserID === 'u2') can run his personal derived agent
            const bobRes = await secAdapter.testResolveAgent(
                createMessage({ Text: '@Bob Personal Bot hi', MentionedAgentNames: ['Bob Personal Bot'] }),
                [],
                bob
            );
            expect(bobRes.agent?.Name).toBe('Bob Personal Bot');

            // Alice cannot view or run Bob's private derived agent
            const aliceRes = await secAdapter.testResolveAgent(
                createMessage({ Text: '@Bob Personal Bot hi', MentionedAgentNames: ['Bob Personal Bot'] }),
                [],
                alice
            );
            expect(aliceRes.agent?.Name).toBe('Default Agent');
            expect(aliceRes.multiAgentNote).toBeNull();
        });

        it('stays silent when multi-bot thread gate declines an unmapped sender in another bot thread', async () => {
            await adapter.Initialize();
            adapter.MockThreadHistory = [
                createMessage({ MessageID: 't1', SenderID: 'user-1', Text: 'starting a thread' }),
                createMessage({ MessageID: 't2', SenderID: 'BOT999', Text: 'other bot reply', RawEvent: { bot_id: 'B999' } }),
            ];
            await adapter.HandleMessage(createMessage({
                MessageID: 'm9',
                ThreadID: 't1',
                SenderID: 'external-guest',
                SenderEmail: 'guest@external.org',
                Text: 'follow-up',
            }));
            expect(adapter.FinalMessages).toHaveLength(0);
            expect(adapter.TypeIndicatorShown).toBe(false);
        });
    });

    describe('Teams multi-turn DB history, /new command, and idle rollover', () => {
        const alice = { ID: 'u1', Email: 'alice@example.com', Name: 'Alice', IsActive: true, UserRoles: [{ RoleID: 'role-member' }] } as unknown as UserInfo;
        const bob = { ID: 'u2', Email: 'bob@example.com', Name: 'Bob', IsActive: true, UserRoles: [{ RoleID: 'role-admin' }] } as unknown as UserInfo;

        it('loads prior turns chronologically from MJ: Conversation Details as contextUser and preserves agent affinity', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            const observedMessages: Array<Array<{ role: string; content: string }>> = [];
            const observedAgents: string[] = [];
            const observedConvoIds: Array<string | undefined> = [];
            const detailRunViewCalls: Array<{ params: Record<string, unknown>; user: UserInfo }> = [];

            let initCall = 0;
            vi.mocked(RunView).mockImplementation(() => ({
                RunView: vi.fn().mockImplementation((params: Record<string, unknown>, user: UserInfo) => {
                    if (params.EntityName === 'MJ: Conversation Details') {
                        detailRunViewCalls.push({ params, user });
                        // Returned newest-first (OrderBy: __mj_CreatedAt DESC)
                        return {
                            Success: true,
                            Results: [
                                { ID: 'd2', Role: 'AI', Message: 'Q3 revenue was $4.2M.', AgentID: 'research-id' },
                                { ID: 'd1', Role: 'User', Message: '@Research Bot check Q3 revenue', AgentID: null },
                            ],
                        };
                    }
                    initCall++;
                    if (initCall === 1) {
                        return { Success: true, Results: [defaultTestAgents[0]] };
                    }
                    return { Success: true, Results: defaultTestAgents.map(a => ({ ...a })) };
                }),
            }) as unknown as RunView);

            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockImplementation(
                    async (params: { agent: { Name: string }; conversationMessages: Array<{ role: string; content: string }> }, opts: { conversationId?: string }) => {
                        observedAgents.push(params.agent.Name);
                        observedMessages.push([...params.conversationMessages]);
                        observedConvoIds.push(opts.conversationId);
                        return {
                            agentResult: { success: true, agentRun: { Message: 'Done.', Steps: [] } },
                            conversationId: opts.conversationId ?? 'teams-convo-1',
                            userMessageDetailId: 'u-det',
                            agentResponseDetailId: 'a-det',
                            artifactInfo: undefined,
                        };
                    }
                ),
                FollowHandoffs: vi.fn().mockResolvedValue([]),
            }) as ReturnType<typeof vi.fn>);

            const dbAdapter = new DBHistoryTestAdapter(defaultSettings);
            await dbAdapter.Initialize();

            // Turn 1: mention Research Bot
            await dbAdapter.HandleMessage(createMessage({
                MessageID: 't-1',
                ThreadID: 'conv-dm-1',
                IsDirectMessage: true,
                SenderEmail: 'alice@example.com',
                Text: '@Research Bot check Q3 revenue',
                MentionedAgentNames: ['Research Bot'],
            }));

            // Turn 2: follow-up with NO @mention and empty platform threadHistory
            await dbAdapter.HandleMessage(createMessage({
                MessageID: 't-2',
                ThreadID: 'conv-dm-1',
                IsDirectMessage: true,
                SenderEmail: 'alice@example.com',
                Text: 'Now break it down by region',
                MentionedAgentNames: [],
            }));

            expect(observedConvoIds).toEqual([undefined, 'teams-convo-1']);
            expect(observedAgents).toEqual(['Research Bot', 'Research Bot']);
            expect(observedMessages[1]).toEqual([
                { role: 'user', content: '@Research Bot check Q3 revenue' },
                { role: 'assistant', content: 'Q3 revenue was $4.2M.' },
                { role: 'user', content: 'Now break it down by region' },
            ]);
            // Must query MJ: Conversation Details as the calling user (Alice), never fallback
            expect(detailRunViewCalls).toHaveLength(1);
            expect(detailRunViewCalls[0].user.Email).toBe('alice@example.com');
            expect(String(detailRunViewCalls[0].params.ExtraFilter)).toContain("ConversationID='teams-convo-1'");
        });

        it('enforces permissions on remembered DB conversation agent when an unauthorized user replies', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            const runSpy = vi.fn().mockResolvedValue({
                agentResult: { success: true, agentRun: { Message: 'Admin report.', Steps: [] } },
                conversationId: 'group-convo-1',
                userMessageDetailId: 'u-det',
                agentResponseDetailId: 'a-det',
                artifactInfo: undefined,
            });
            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: runSpy,
                FollowHandoffs: vi.fn().mockResolvedValue([]),
            }) as ReturnType<typeof vi.fn>);

            // Restrict Research Bot to Bob's admin role only
            aiEngineState.permissions = [
                { AgentID: 'research-id', RoleID: 'role-admin', CanView: true, CanRun: true, CanEdit: false, CanDelete: false },
            ];

            let initCall = 0;
            vi.mocked(RunView).mockImplementation(() => ({
                RunView: vi.fn().mockImplementation((params: Record<string, unknown>) => {
                    if (params.EntityName === 'MJ: Conversation Details') {
                        return { Success: true, Results: [] };
                    }
                    initCall++;
                    if (initCall === 1) return { Success: true, Results: [defaultTestAgents[0]] };
                    return { Success: true, Results: defaultTestAgents.map(a => ({ ...a })) };
                }),
            }) as unknown as RunView);

            const dbAdapter = new DBHistoryTestAdapter(defaultSettings);
            await dbAdapter.Initialize();

            // Bob starts group chat with Research Bot
            await dbAdapter.HandleMessage(createMessage({
                MessageID: 'g-1',
                ThreadID: 'group-chat-1',
                IsBotMention: true,
                SenderEmail: bob.Email,
                Text: '@Research Bot pull sensitive metrics',
                MentionedAgentNames: ['Research Bot'],
            }));
            expect(runSpy).toHaveBeenCalledTimes(1);

            // Alice (lacks CanView/CanRun on Research Bot) follows up without @mention -> refused without leaking name
            await dbAdapter.HandleMessage(createMessage({
                MessageID: 'g-2',
                ThreadID: 'group-chat-1',
                IsBotMention: true,
                SenderEmail: alice.Email,
                Text: 'show me more',
                MentionedAgentNames: [],
            }));
            expect(runSpy).toHaveBeenCalledTimes(1);
            const lastMsg = dbAdapter.FinalMessages[dbAdapter.FinalMessages.length - 1];
            expect(lastMsg.PlainText).toContain("don't have permission");
            expect(lastMsg.PlainText).not.toContain('Research Bot');
        });

        it('handles bare /new and /new <prompt> by resetting the MJ Conversation and clearing prior history', async () => {
            const { AgentRunner } = await import('@memberjunction/ai-agents');
            const observedConvoIds: Array<string | undefined> = [];
            const observedMessages: Array<Array<{ role: string; content: string }>> = [];
            const observedAgents: string[] = [];
            let createdCount = 0;

            vi.mocked(AgentRunner).mockImplementation(() => ({
                RunAgentInConversation: vi.fn().mockImplementation(
                    async (params: { agent: { Name: string }; conversationMessages: Array<{ role: string; content: string }> }, opts: { conversationId?: string }) => {
                        observedConvoIds.push(opts.conversationId);
                        observedMessages.push([...params.conversationMessages]);
                        observedAgents.push(params.agent.Name);
                        return {
                            agentResult: { success: true, agentRun: { Message: 'Reply.', Steps: [] } },
                            conversationId: opts.conversationId ?? `convo-${++createdCount}`,
                            userMessageDetailId: 'u-det',
                            agentResponseDetailId: 'a-det',
                            artifactInfo: undefined,
                        };
                    }
                ),
                FollowHandoffs: vi.fn().mockResolvedValue([]),
            }) as ReturnType<typeof vi.fn>);

            const dbAdapter = new DBHistoryTestAdapter(defaultSettings);
            await dbAdapter.Initialize();

            // Turn 1: creates convo-1 with Research Bot
            await dbAdapter.HandleMessage(createMessage({
                MessageID: 'm-1',
                ThreadID: 'dm-reset',
                IsDirectMessage: true,
                Text: '@Research Bot first topic',
                MentionedAgentNames: ['Research Bot'],
            }));
            expect(observedConvoIds).toEqual([undefined]);

            // Turn 2: bare /new resets without invoking AgentRunner
            await dbAdapter.HandleMessage(createMessage({
                MessageID: 'm-2',
                ThreadID: 'dm-reset',
                IsDirectMessage: true,
                Text: '<@BOT123> /new',
            }));
            expect(observedConvoIds).toHaveLength(1);
            expect(dbAdapter.FinalMessages.some(m => m.PlainText.includes('Started a fresh conversation'))).toBe(true);

            // Turn 3: next message starts convo-2 and resets back to Default Agent
            await dbAdapter.HandleMessage(createMessage({
                MessageID: 'm-3',
                ThreadID: 'dm-reset',
                IsDirectMessage: true,
                Text: 'fresh question',
            }));
            expect(observedConvoIds).toEqual([undefined, undefined]);
            expect(observedAgents).toEqual(['Research Bot', 'Default Agent']);

            // Turn 4: `/new <prompt>` immediately resets convo-2 and runs prompt in convo-3
            await dbAdapter.HandleMessage(createMessage({
                MessageID: 'm-4',
                ThreadID: 'dm-reset',
                IsDirectMessage: true,
                Text: '/new @Sage start third topic',
            }));
            expect(observedConvoIds).toEqual([undefined, undefined, undefined]);
            expect(observedAgents).toEqual(['Research Bot', 'Default Agent', 'Sage']);
            expect(observedMessages[2]).toEqual([{ role: 'user', content: '@Sage start third topic' }]);
        });

        it('rolls over rolling conversations after ConversationIdleTimeoutMs of inactivity while sliding on active turns', async () => {
            vi.useFakeTimers();
            try {
                vi.setSystemTime(new Date('2026-11-24T12:00:00.000Z'));

                const { AgentRunner } = await import('@memberjunction/ai-agents');
                const observedConvoIds: Array<string | undefined> = [];
                let createdCount = 0;

                vi.mocked(AgentRunner).mockImplementation(() => ({
                    RunAgentInConversation: vi.fn().mockImplementation(
                        async (_params: Record<string, unknown>, opts: { conversationId?: string }) => {
                            observedConvoIds.push(opts.conversationId);
                            return {
                                agentResult: { success: true, agentRun: { Message: 'Ok.', Steps: [] } },
                                conversationId: opts.conversationId ?? `idle-convo-${++createdCount}`,
                                userMessageDetailId: 'u-det',
                                agentResponseDetailId: 'a-det',
                                artifactInfo: undefined,
                            };
                        }
                    ),
                    FollowHandoffs: vi.fn().mockResolvedValue([]),
                }) as ReturnType<typeof vi.fn>);

                const idleAdapter = new DBHistoryTestAdapter({
                    ...defaultSettings,
                    ConversationIdleTimeoutMs: 30 * 60 * 1000, // 30 minutes
                });
                await idleAdapter.Initialize();

                // T=0: creates idle-convo-1
                await idleAdapter.HandleMessage(createMessage({ MessageID: 'i-1', ThreadID: 'dm-idle', IsDirectMessage: true, Text: 'turn 1' }));

                // T=20m (< 30m): reuses idle-convo-1 and slides lastActivityAt to T=20m
                vi.advanceTimersByTime(20 * 60 * 1000);
                await idleAdapter.HandleMessage(createMessage({ MessageID: 'i-2', ThreadID: 'dm-idle', IsDirectMessage: true, Text: 'turn 2' }));

                // T=40m (20m since T=20m, still < 30m): still reuses idle-convo-1!
                vi.advanceTimersByTime(20 * 60 * 1000);
                await idleAdapter.HandleMessage(createMessage({ MessageID: 'i-3', ThreadID: 'dm-idle', IsDirectMessage: true, Text: 'turn 3' }));

                // T=71m (31m since T=40m, > 30m): rolls over to a brand-new conversation (undefined -> idle-convo-2)
                vi.advanceTimersByTime(31 * 60 * 1000);
                await idleAdapter.HandleMessage(createMessage({ MessageID: 'i-4', ThreadID: 'dm-idle', IsDirectMessage: true, Text: 'turn 4' }));

                expect(observedConvoIds).toEqual([undefined, 'idle-convo-1', 'idle-convo-1', undefined]);
            } finally {
                vi.useRealTimers();
            }
        });

        it('does not prematurely evict a rolling conversation whose ConversationIdleTimeoutMs exceeds 24 hours', async () => {
            vi.useFakeTimers();
            try {
                vi.setSystemTime(new Date('2026-11-24T12:00:00.000Z'));

                const { AgentRunner } = await import('@memberjunction/ai-agents');
                const observedConvoIds: Array<string | undefined> = [];
                let createdCount = 0;

                vi.mocked(AgentRunner).mockImplementation(() => ({
                    RunAgentInConversation: vi.fn().mockImplementation(
                        async (_params: Record<string, unknown>, opts: { conversationId?: string }) => {
                            observedConvoIds.push(opts.conversationId);
                            return {
                                agentResult: { success: true, agentRun: { Message: 'Ok.', Steps: [] } },
                                conversationId: opts.conversationId ?? `long-convo-${++createdCount}`,
                                userMessageDetailId: 'u-det',
                                agentResponseDetailId: 'a-det',
                                artifactInfo: undefined,
                            };
                        }
                    ),
                    FollowHandoffs: vi.fn().mockResolvedValue([]),
                }) as ReturnType<typeof vi.fn>);

                const longAdapter = new DBHistoryTestAdapter({
                    ...defaultSettings,
                    ConversationIdleTimeoutMs: 48 * 60 * 60 * 1000, // 48 hours
                });
                await longAdapter.Initialize();

                // T=0: creates long-convo-1 for thread A
                await longAdapter.HandleMessage(createMessage({ MessageID: 'l-1', ThreadID: 'dm-long-a', IsDirectMessage: true, Text: 'turn 1' }));

                // T=30h (> 24h default TTL, < 48h configured timeout): another thread triggers evictExpiredThreadEntries()
                vi.advanceTimersByTime(30 * 60 * 60 * 1000);
                await longAdapter.HandleMessage(createMessage({ MessageID: 'l-b1', ThreadID: 'dm-long-b', IsDirectMessage: true, Text: 'other chat' }));

                // Thread A must still reuse long-convo-1 (not evicted at 24h)
                await longAdapter.HandleMessage(createMessage({ MessageID: 'l-2', ThreadID: 'dm-long-a', IsDirectMessage: true, Text: 'turn 2' }));

                expect(observedConvoIds).toEqual([undefined, undefined, 'long-convo-1']);
            } finally {
                vi.useRealTimers();
            }
        });
    });
});
