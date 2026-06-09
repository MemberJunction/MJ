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
import { BaseAgentType } from '../agent-types/base-agent-type';
import { BaseAgent } from '../base-agent';
import { INVOKE_TARGET_AGENT_TOOL_NAME, DelegateToTargetRequest } from '../realtime/realtime-session-runner';

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
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    return { ID: 'agent-1', Name: 'Voice Co-Agent', InjectNotes: false, InjectExamples: false, ...overrides } as unknown as MJAIAgentEntityExtended;
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
            // Companion / "voice for the target" framing is in the system prompt.
            expect(deps.SessionParams.SystemPrompt).toContain('Voice Co-Agent');
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
});
