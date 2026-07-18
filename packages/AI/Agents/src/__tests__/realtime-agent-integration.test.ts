/**
 * Tests for the P2b-ii integration of the Realtime (session-driven) path into {@link BaseAgent}.
 *
 * These exercise the dep-builder seams in isolation (no full `Execute()` drive, which requires
 * engines / permissions / DB) via a test subclass that overrides the model-resolution seam to
 * return a {@link MockRealtimeModel}. They confirm:
 *   - `isSessionDrivenAgentType` routes only session-driven types into the realtime branch.
 *   - `buildRealtimeSessionDeps` constructs a fully-wired {@link RealtimeSessionRunnerDeps}.
 *   - the `DelegateToTarget` dep reaches the `delegateRealtimeToTarget` path (and fails cleanly
 *     when no target agent is configured — without touching a live DB).
 *
 * The end-to-end realtime `Execute()` path (engine init → AgentRun creation → session run →
 * finalize) is integration-verified later in P7 against a real provider/driver.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    BaseRealtimeModel,
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
    RealtimeToolDefinition
} from '@memberjunction/ai';
import { ExecuteAgentParams, AgentConfiguration, MJAIAgentEntityExtended, MJAIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';
import { IMetadataProvider } from '@memberjunction/core';
import { BaseAgentType } from '../agent-types/base-agent-type';
import { BaseAgent } from '../base-agent';
import { INVOKE_TARGET_AGENT_TOOL_NAME, DelegateToTargetRequest } from '../realtime/realtime-session-runner';
import { RealtimeRecordingController } from '../realtime/realtime-recording-capture';

// ════════════════════════════════════════════════════════════════════
// Mocks
// ════════════════════════════════════════════════════════════════════

class MockRealtimeSession implements IRealtimeSession {
    SendInput(): void { /* no-op */ }
    async RegisterTools(): Promise<void> { /* no-op */ }
    OnOutput(): void { /* no-op */ }
    OnTranscript(): void { /* no-op */ }
    OnToolCall(): void { /* no-op */ }
    OnInterruption(): void { /* no-op */ }
    OnUsage(): void { /* no-op */ }
    OnError(): void { /* no-op */ }
    async SendToolResult(): Promise<void> { /* no-op */ }
    async Close(): Promise<void> { /* no-op */ }
}

class MockRealtimeModel extends BaseRealtimeModel {
    public LastParams: RealtimeSessionParams | null = null;
    constructor() { super('mock-api-key'); }
    async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        this.LastParams = params;
        return new MockRealtimeSession();
    }
}

/** Minimal session-driven agent-type stand-in (duck-typed marker only). */
class SessionDrivenType {
    public get IsSessionDriven(): boolean { return true; }
}

/**
 * Test subclass exposing the protected/private realtime seams and stubbing model resolution.
 */
class TestableRealtimeAgent extends BaseAgent {
    public ResolvedModel = new MockRealtimeModel();

    // Override the model-resolution seam to avoid DB/metadata + provider SDKs.
    protected override async resolveRealtimeModel() {
        return { model: this.ResolvedModel, modelID: 'model-id', vendorID: 'vendor-id', apiName: 'mock-realtime' };
    }

    // Expose protected/private members for focused unit testing.
    public callIsSessionDriven(t: BaseAgentType): boolean {
        return this.isSessionDrivenAgentType(t);
    }
    public callBuildDeps(params: ExecuteAgentParams, config: AgentConfiguration, promptRun: MJAIPromptRunEntityExtended | null) {
        return this.buildRealtimeSessionDeps(
            params,
            config,
            { model: this.ResolvedModel, apiName: 'mock-realtime' },
            promptRun
        );
    }
    public callResolveModel(params: ExecuteAgentParams) {
        return this.resolveRealtimeModel(params);
    }
    /** Drives the private create-on-start/update-on-complete persistence lifecycle for focused testing. */
    public callPersist(params: ExecuteAgentParams, t: RealtimeTranscript): Promise<string | null> {
        return (this as unknown as {
            persistRealtimeTranscript(p: ExecuteAgentParams, tr: RealtimeTranscript): Promise<string | null>;
        }).persistRealtimeTranscript(params, t);
    }
    /** Injects (or clears) the active recording controller so the media-field stamping path can be exercised. */
    public setRecording(controller: RealtimeRecordingController | null): void {
        (this as unknown as { realtimeRecording: RealtimeRecordingController | null }).realtimeRecording = controller;
    }
}

/** Minimal capturing stand-in for an `MJ: Conversation Details` row. */
class MockConversationDetail {
    public ID = '';
    public ConversationID = '';
    public Role: 'AI' | 'Error' | 'User' = 'User';
    public Message = '';
    public Status: 'Complete' | 'Error' | 'In-Progress' = 'In-Progress';
    public UserID: string | null = null;
    public AgentSessionID: string | null = null;
    public TurnEndedAt: Date | null = null;
    public UtteranceStartMs: number | null = null;
    public UtteranceEndMs: number | null = null;
    public MediaType: string | null = null;
    public LatestResult = { CompleteMessage: '' };
    public NewRecord(): void { this.ID = 'detail-1'; }
    public async Save(): Promise<boolean> { return true; }
    /** Same shared instance models "the existing row", so Load just confirms + keeps prior fields. */
    public async Load(id: string): Promise<boolean> { this.ID = id; return true; }
}

/** A provider whose `GetEntityObject` always returns the SAME detail instance (models one row across interim→final). */
function makeDetailProvider(detail: MockConversationDetail): IMetadataProvider {
    return {
        GetEntityObject: async () => detail,
        EntityByName: () => undefined
    } as unknown as IMetadataProvider;
}

/**
 * A multi-row store: `GetEntityObject` returns a FRESH entity each call (as the real metadata provider
 * does), new records get distinct auto-incrementing ids on Save, and Load rehydrates a stored row's
 * fields (incl. Status) — everything the status-disambiguated persist path needs to be exercised across
 * multiple turns and multiple rows.
 */
class MockDetailStore {
    public rows = new Map<string, { Status: string; Message: string; Role: string }>();
    private seq = 0;
    public nextId(): string { return `detail-${++this.seq}`; }
    public newEntity(): StoreBackedDetail { return new StoreBackedDetail(this); }
    public provider(): IMetadataProvider {
        return { GetEntityObject: async () => this.newEntity(), EntityByName: () => undefined } as unknown as IMetadataProvider;
    }
}

class StoreBackedDetail {
    public ID = '';
    public ConversationID = '';
    public Role: 'AI' | 'Error' | 'User' = 'User';
    public Message = '';
    public Status: 'Complete' | 'Error' | 'In-Progress' = 'In-Progress';
    public UserID: string | null = null;
    public AgentSessionID: string | null = null;
    public TurnEndedAt: Date | null = null;
    public UtteranceStartMs: number | null = null;
    public UtteranceEndMs: number | null = null;
    public MediaType: string | null = null;
    public LatestResult = { CompleteMessage: '' };
    private isNew = false;
    constructor(private store: MockDetailStore) {}
    public NewRecord(): void { this.isNew = true; this.ID = ''; }
    public async Save(): Promise<boolean> {
        if (this.isNew && !this.ID) { this.ID = this.store.nextId(); this.isNew = false; }
        this.store.rows.set(this.ID, { Status: this.Status, Message: this.Message, Role: this.Role });
        return true;
    }
    public async Load(id: string): Promise<boolean> {
        const row = this.store.rows.get(id);
        if (!row) return false;
        this.ID = id;
        this.Status = row.Status as StoreBackedDetail['Status'];
        this.Message = row.Message;
        this.Role = row.Role as StoreBackedDetail['Role'];
        return true;
    }
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    return { ID: 'agent-1', Name: 'Realtime Co-Agent', InjectNotes: false, InjectExamples: false, ...overrides } as unknown as MJAIAgentEntityExtended;
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: makeAgent(),
        conversationMessages: [{ role: 'user', content: 'Hello' }],
        contextUser: { ID: 'user-1', Email: 'u@example.com' } as ExecuteAgentParams['contextUser'],
        ...overrides
    } as ExecuteAgentParams;
}

// ════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════

describe('BaseAgent realtime (session-driven) integration', () => {
    describe('isSessionDrivenAgentType', () => {
        it('returns true for a type exposing IsSessionDriven === true', () => {
            const agent = new TestableRealtimeAgent();
            expect(agent.callIsSessionDriven(new SessionDrivenType() as unknown as BaseAgentType)).toBe(true);
        });

        it('returns false for a plain (loop/flow) agent type with no IsSessionDriven member', () => {
            const agent = new TestableRealtimeAgent();
            const loopLike = { someOther: true } as unknown as BaseAgentType;
            expect(agent.callIsSessionDriven(loopLike)).toBe(false);
        });

        it('returns false when IsSessionDriven is explicitly false', () => {
            const agent = new TestableRealtimeAgent();
            const flowLike = { IsSessionDriven: false } as unknown as BaseAgentType;
            expect(agent.callIsSessionDriven(flowLike)).toBe(false);
        });
    });

    describe('resolveRealtimeModel seam', () => {
        it('is overridable and returns the injected mock model', async () => {
            const agent = new TestableRealtimeAgent();
            const resolved = await agent.callResolveModel(makeParams());
            expect(resolved).not.toBeNull();
            expect(resolved!.model).toBe(agent.ResolvedModel);
            expect(resolved!.apiName).toBe('mock-realtime');
        });
    });

    describe('buildRealtimeSessionDeps', () => {
        it('constructs fully-wired deps with the resolved model and the always-present tool', async () => {
            const agent = new TestableRealtimeAgent();
            const config: AgentConfiguration = { success: true };
            const deps = await agent.callBuildDeps(makeParams(), config, null);

            expect(deps.Model).toBe(agent.ResolvedModel);
            expect(deps.SessionParams.Model).toBe('mock-realtime');
            // Identity framing speaks first-person AS the TARGET (here the fallback, since makeParams sets no
            // target) — NOT as the co-agent. This guards the convergence: the prompt must never identify as
            // the co-agent ("Realtime Co-Agent"). See plans/realtime/realtime-core-host-convergence.md.
            expect(deps.SessionParams.SystemPrompt).toContain('the configured target agent');
            expect(deps.SessionParams.SystemPrompt).not.toContain('voice for the agent "Realtime Co-Agent"');
            expect(deps.SessionParams.SystemPrompt).toContain(INVOKE_TARGET_AGENT_TOOL_NAME);
            // All collaborators are wired as callable closures.
            expect(typeof deps.DelegateToTarget).toBe('function');
            expect(typeof deps.ExecuteTool).toBe('function');
            expect(typeof deps.PersistTranscript).toBe('function');
            expect(typeof deps.CheckpointUsage).toBe('function');
        });

        it('DelegateToTarget reaches the delegation path and fails cleanly when no target is configured', async () => {
            const agent = new TestableRealtimeAgent();
            const config: AgentConfiguration = { success: true };
            // No params.data.targetAgentID → resolveRealtimeTargetAgent returns null before touching AIEngine.
            const deps = await agent.callBuildDeps(makeParams(), config, null);

            const request: DelegateToTargetRequest = {
                CallID: 'call-1',
                Arguments: JSON.stringify({ request: 'do the thing' }),
                AbortSignal: new AbortController().signal
            };
            const result = await deps.DelegateToTarget(request);

            expect(result.CallID).toBe('call-1');
            expect(result.Success).toBe(false);
            expect(result.Output).toContain('No target agent');
        });

        it('CheckpointUsage is a safe no-op when there is no prompt run', async () => {
            const agent = new TestableRealtimeAgent();
            const config: AgentConfiguration = { success: true };
            const deps = await agent.callBuildDeps(makeParams(), config, null);
            const usage: RealtimeUsage = { InputTokens: 10, OutputTokens: 5 };
            await expect(deps.CheckpointUsage(usage)).resolves.toBeUndefined();
        });
    });

    describe('persistRealtimeTranscript lifecycle', () => {
        function setup() {
            const agent = new TestableRealtimeAgent();
            const detail = new MockConversationDetail();
            const params = makeParams({
                provider: makeDetailProvider(detail),
                data: { conversationId: 'conv-1' },
                agentSessionID: 'sess-1'
            } as Partial<ExecuteAgentParams>);
            return { agent, detail, params };
        }

        it('creates an In-Progress row on the first interim delta (user turn stamps UserID)', async () => {
            const { agent, detail, params } = setup();
            const created = await agent.callPersist(params, { Role: 'user', Text: 'hel', IsFinal: false });
            expect(created).toBe('detail-1'); // a distinct new turn → returns the id
            expect(detail.Status).toBe('In-Progress');
            expect(detail.Role).toBe('User');
            expect(detail.Message).toBe('hel');
            expect(detail.UserID).toBe('user-1');
            expect(detail.AgentSessionID).toBe('sess-1');
            expect(detail.TurnEndedAt).toBeNull(); // not ended yet
        });

        it('updates the in-flight row to Complete with TurnEndedAt on final (no double count)', async () => {
            const { agent, detail, params } = setup();
            await agent.callPersist(params, { Role: 'user', Text: 'hel', IsFinal: false });
            const onFinal = await agent.callPersist(params, { Role: 'user', Text: 'hello there', IsFinal: true });
            expect(onFinal).toBeNull(); // updating an existing row is NOT a new turn
            expect(detail.Status).toBe('Complete');
            expect(detail.Message).toBe('hello there');
            expect(detail.TurnEndedAt).toBeInstanceOf(Date);
        });

        it('C8 streamed captions (Grok): repeated growing finals collapse into ONE row; the next turn is a NEW row', async () => {
            // Grok streams input transcription: repeated input_audio_transcription.completed, each the
            // full growing text. The driver stamps the 2nd+ ReplacesPrevious=true (the first is a normal
            // final). All must land in ONE ConversationDetail; the next user turn (a fresh non-replacing
            // final) must be a DISTINCT row.
            const agent = new TestableRealtimeAgent();
            const store = new MockDetailStore();
            const params = makeParams({ provider: store.provider(), data: { conversationId: 'conv-1' }, agentSessionID: 'sess-1' } as Partial<ExecuteAgentParams>);
            const c1 = await agent.callPersist(params, { Role: 'user', Text: 'set', IsFinal: true, ReplacesPrevious: false });
            expect(c1).toBe('detail-1'); // first caption of the turn → a real new turn
            const c2 = await agent.callPersist(params, { Role: 'user', Text: 'set a', IsFinal: true, ReplacesPrevious: true });
            expect(c2).toBeNull(); // replaces the turn's row in place
            const c3 = await agent.callPersist(params, { Role: 'user', Text: 'set a timer', IsFinal: true, ReplacesPrevious: true });
            expect(c3).toBeNull();
            expect(store.rows.size).toBe(1);
            expect(store.rows.get('detail-1')!.Message).toBe('set a timer');
            // A new user turn: its first (non-replacing) final must NOT overwrite turn 1 — it's a new row.
            const next = await agent.callPersist(params, { Role: 'user', Text: 'cancel', IsFinal: true, ReplacesPrevious: false });
            expect(next).toBe('detail-2');
            expect(store.rows.size).toBe(2);
            expect(store.rows.get('detail-1')!.Message).toBe('set a timer'); // turn 1 preserved (not clobbered)
        });

        it('C8 interim→final (OpenAI): one row per turn, and the next turn is a distinct row', async () => {
            const agent = new TestableRealtimeAgent();
            const store = new MockDetailStore();
            const params = makeParams({ provider: store.provider(), data: { conversationId: 'conv-1' }, agentSessionID: 'sess-1' } as Partial<ExecuteAgentParams>);
            expect(await agent.callPersist(params, { Role: 'user', Text: 'hel', IsFinal: false })).toBe('detail-1'); // interim → In-Progress row
            expect(await agent.callPersist(params, { Role: 'user', Text: 'hello', IsFinal: true })).toBeNull();     // final reuses + clears key
            expect(store.rows.size).toBe(1);
            expect(store.rows.get('detail-1')).toMatchObject({ Status: 'Complete', Message: 'hello' });
            // Next turn's interim must start a FRESH row (the key was cleared by the non-replacing final):
            expect(await agent.callPersist(params, { Role: 'user', Text: 'next', IsFinal: false })).toBe('detail-2');
            expect(store.rows.size).toBe(2);
        });

        it('C8 correction (ElevenLabs): a ReplacesPrevious correction updates the SAME row; a later normal final is a new turn', async () => {
            const agent = new TestableRealtimeAgent();
            const store = new MockDetailStore();
            const params = makeParams({ provider: store.provider(), data: { conversationId: 'conv-1' }, agentSessionID: 'sess-1' } as Partial<ExecuteAgentParams>);
            const first = await agent.callPersist(params, { Role: 'assistant', Text: 'The answer is 42', IsFinal: true, ReplacesPrevious: false });
            expect(first).toBe('detail-1');
            const corrected = await agent.callPersist(params, { Role: 'assistant', Text: 'The answer is 43', IsFinal: true, ReplacesPrevious: true });
            expect(corrected).toBeNull();
            expect(store.rows.size).toBe(1);
            expect(store.rows.get('detail-1')!.Message).toBe('The answer is 43');
            const nextTurn = await agent.callPersist(params, { Role: 'assistant', Text: 'Anything else?', IsFinal: true, ReplacesPrevious: false });
            expect(nextTurn).toBe('detail-2');
            expect(store.rows.size).toBe(2);
        });

        it('C8 assistant delta→done: interim then final collapse into ONE row', async () => {
            const agent = new TestableRealtimeAgent();
            const store = new MockDetailStore();
            const params = makeParams({ provider: store.provider(), data: { conversationId: 'conv-1' }, agentSessionID: 'sess-1' } as Partial<ExecuteAgentParams>);
            expect(await agent.callPersist(params, { Role: 'assistant', Text: 'The', IsFinal: false })).toBe('detail-1');
            expect(await agent.callPersist(params, { Role: 'assistant', Text: 'The answer', IsFinal: true })).toBeNull();
            expect(store.rows.size).toBe(1);
            expect(store.rows.get('detail-1')).toMatchObject({ Status: 'Complete', Message: 'The answer' });
        });

        it('creates and finalizes in one step when no interim was seen; assistant turns set no UserID', async () => {
            const { agent, detail, params } = setup();
            const created = await agent.callPersist(params, { Role: 'assistant', Text: 'hi, how can I help?', IsFinal: true });
            expect(created).toBe('detail-1'); // first time this turn is seen → counts
            expect(detail.Role).toBe('AI');
            expect(detail.Status).toBe('Complete');
            expect(detail.UserID).toBeNull(); // an AI turn has no human speaker
        });

        it('ignores empty text and turns with no conversation id', async () => {
            const { agent, params } = setup();
            expect(await agent.callPersist(params, { Role: 'user', Text: '   ', IsFinal: true })).toBeNull();
            const noConvo = makeParams({ provider: makeDetailProvider(new MockConversationDetail()) } as Partial<ExecuteAgentParams>);
            expect(await agent.callPersist(noConvo, { Role: 'user', Text: 'hi', IsFinal: true })).toBeNull();
        });

        it('stamps media-relative utterance offsets + MediaType when recording is active', async () => {
            const { agent, detail, params } = setup();
            let clock = 1000;
            const controller = new RealtimeRecordingController({ Now: () => clock });
            controller.Start(); // t0 at clock=1000
            agent.setRecording(controller);

            clock = 1300; // 300ms into the recording
            await agent.callPersist(params, { Role: 'user', Text: 'q', IsFinal: false });
            expect(detail.MediaType).toBe('Audio');
            expect(detail.UtteranceStartMs).toBe(300);

            clock = 2100; // 1100ms in
            await agent.callPersist(params, { Role: 'user', Text: 'question', IsFinal: true });
            expect(detail.UtteranceEndMs).toBe(1100);
        });
    });
});
