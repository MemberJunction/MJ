/**
 * Unit tests for {@link RealtimeClientSessionService} — the server-agnostic preparer + tool relay
 * for the CLIENT-DIRECT realtime topology (Realtime Co-Agent).
 *
 * All collaborators are injected via overridable seams on a test subclass: model resolution returns
 * a {@link MockRealtimeModel} (no provider SDK / DB), engine config is a no-op, and delegation is
 * stubbed. No network, no DB — fully deterministic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BaseRealtimeModel,
    ClientRealtimeSessionConfig,
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeToolCall
} from '@memberjunction/ai';
import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { MJAIAgentEntityExtended, MJAIModelEntityExtended, AppContextSnapshot } from '@memberjunction/ai-core-plus';

import {
    RealtimeClientSessionService,
    PrepareClientSessionInput,
    ExecuteRelayedToolInput,
    RealtimeModelResolution,
    CoAgentSystemPromptResolution
} from '../realtime/realtime-client-session-service';
import { INVOKE_TARGET_AGENT_TOOL_NAME, DelegateToTargetRequest, DelegatedResult, DelegatedRunArtifact, RealtimeColleague } from '../realtime/realtime-tool-broker';
import { BuildAppRealtimeOverridesJson, RealtimeCoAgentConfig } from '../realtime/realtime-coagent-config';

// Mock AgentRunner so the REAL delegateToTarget path (below) can be exercised without DB/SDK.
// `runAgentMock` is hoisted so the vi.mock factory can close over it.
const { runAgentMock } = vi.hoisted(() => ({ runAgentMock: vi.fn() }));
vi.mock('../AgentRunner', () => ({
    AgentRunner: class {
        constructor(_provider: unknown) { /* provider captured by real code; irrelevant to mock */ }
        RunAgent = runAgentMock;
    },
}));

// ════════════════════════════════════════════════════════════════════
// Mocks
// ════════════════════════════════════════════════════════════════════

class MockRealtimeSession implements IRealtimeSession {
    SendInput(): void { /* no-op */ }
    async RegisterTools(): Promise<void> { /* no-op */ }
    OnOutput(): void { /* no-op */ }
    OnTranscript(): void { /* no-op */ }
    OnToolCall(): void { /* no-op */ }
    async SendToolResult(): Promise<void> { /* no-op */ }
    OnInterruption(): void { /* no-op */ }
    OnUsage(): void { /* no-op */ }
    OnError(): void { /* no-op */ }
    async Close(): Promise<void> { /* no-op */ }
}

class MockRealtimeModel extends BaseRealtimeModel {
    public LastParams: RealtimeSessionParams | null = null;
    public ClientCalled = false;
    constructor() { super('mock-api-key'); }
    public override get SupportsClientDirect(): boolean { return true; }
    async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        this.LastParams = params;
        return new MockRealtimeSession();
    }
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        this.LastParams = params;
        this.ClientCalled = true;
        return {
            Provider: 'mock',
            Model: params.Model,
            EphemeralToken: 'ephemeral-123',
            ExpiresAt: '2099-01-01T00:00:00.000Z',
            SessionConfig: { instructions: params.SystemPrompt }
        };
    }
}

/**
 * Test subclass that stubs the DB/SDK-backed seams: engine config, model resolution, co-agent
 * prompt text, and the delegate (so {@link ExecuteRelayedTool} never touches AgentRunner/DB).
 */
class TestableService extends RealtimeClientSessionService {
    public Model = new MockRealtimeModel();
    public ResolveModelResult: RealtimeModelResolution | null = {
        Model: this.Model, ModelID: 'm1', VendorID: 'v1', APIName: 'mock-realtime'
    };
    public DelegateSpy = vi.fn(async (req: DelegateToTargetRequest): Promise<DelegatedResult> => ({
        CallID: req.CallID, Success: true, Output: 'delegated-ok'
    }));

    /** Observability-run creation result this stub returns (override per-test). null = creation failed. */
    public ObservabilityResult: { CoAgentRunID: string; PromptRunID?: string; CoAgentRunStepID?: string } | null = {
        CoAgentRunID: 'co-run-1', PromptRunID: 'prompt-run-1', CoAgentRunStepID: 'run-step-1'
    };
    public ObservabilitySpy = vi.fn();

    /** App cascade layer JSON this stub injects (override per-test). null = no app layer (default). */
    public AppOverridesJson: string | null = null;
    protected override async resolveAppRealtimeOverrides(): Promise<string | null> { return this.AppOverridesJson; }

    /** Public passthroughs so unit tests can exercise the protected prompt builders directly. */
    public ExposeAppContextSection(ctx?: AppContextSnapshot): string { return this.buildAppContextSection(ctx); }
    public ExposeColleagues(cfg: RealtimeCoAgentConfig | undefined, exclude?: string): RealtimeColleague[] {
        return this.buildColleaguesFromConfig(cfg, exclude);
    }

    protected override async configureEngine(): Promise<void> { /* no DB */ }
    protected override async resolveRealtimeModel(): Promise<RealtimeModelResolution | null> {
        return this.ResolveModelResult;
    }
    protected override getCoAgentSystemPromptText(): string { return 'CO-AGENT PROMPT BODY'; }
    protected override resolveCoAgentSystemPrompt(): CoAgentSystemPromptResolution {
        return { Text: 'CO-AGENT PROMPT BODY', PromptID: 'prompt-1' };
    }
    protected override async createCoAgentObservabilityRun(
        coAgent: MJAIAgentEntityExtended,
        promptID: string | null,
        modelID: string,
        vendorID: string,
        userID: string | undefined,
        agentSessionID: string
    ): Promise<{ CoAgentRunID: string; PromptRunID?: string; CoAgentRunStepID?: string } | null> {
        this.ObservabilitySpy({ coAgentID: coAgent.ID, promptID, modelID, vendorID, userID, agentSessionID });
        return this.ObservabilityResult;
    }
    /** id → display name map for resolveTargetAgent (default keeps 'target-1' as 'Sales Agent'). */
    public TargetAgentNames: Record<string, string> = { 'target-1': 'Sales Agent' };
    protected override resolveTargetAgent(targetAgentID: string): MJAIAgentEntityExtended | null {
        if (!targetAgentID) return null;
        const name = this.TargetAgentNames[targetAgentID] ?? targetAgentID;
        return {
            ID: targetAgentID,
            Name: name,
            Description: name === 'Sales Agent' ? 'Closes deals.' : `${name} agent.`,
        } as unknown as MJAIAgentEntityExtended;
    }
    /** Public passthrough to exercise the multi-target delegation routing decision directly. */
    public ExposeResolveDelegationTarget(requested: string | undefined, input: ExecuteRelayedToolInput) {
        return this.resolveDelegationTarget(requested, input);
    }
    protected override async delegateToTarget(
        _input: ExecuteRelayedToolInput,
        request: DelegateToTargetRequest
    ): Promise<DelegatedResult> {
        return this.DelegateSpy(request);
    }
}

const contextUser = { ID: 'user-1', Email: 'u@example.com' } as unknown as UserInfo;
const provider = {} as unknown as IMetadataProvider;

function makeCoAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    return { ID: 'co-1', Name: 'Realtime Co-Agent', InjectNotes: false, InjectExamples: false, ...overrides } as unknown as MJAIAgentEntityExtended;
}

function makePrepInput(overrides: Partial<PrepareClientSessionInput> = {}): PrepareClientSessionInput {
    return {
        CoAgent: makeCoAgent(),
        TargetAgentID: 'target-1',
        AgentSessionID: 'session-1',
        ConversationMessages: [{ role: 'user', content: 'Hello there' }],
        ...overrides
    };
}

// ════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════

describe('RealtimeClientSessionService.PrepareClientSession', () => {
    it('returns Success + ClientConfig with the stable invoke-target tool and a non-empty system prompt', async () => {
        const svc = new TestableService();
        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);

        expect(result.Success).toBe(true);
        expect(result.ClientConfig).toBeDefined();
        expect(result.ClientConfig!.EphemeralToken).toBe('ephemeral-123');
        expect(result.SessionParams).toBeDefined();

        // Stable, target-independent tool present.
        const tools = result.SessionParams!.Tools ?? [];
        expect(tools.some(t => t.Name === INVOKE_TARGET_AGENT_TOOL_NAME)).toBe(true);

        // Non-empty companion system prompt that includes framing + co-agent body + target identity.
        const prompt = result.SessionParams!.SystemPrompt;
        expect(prompt.length).toBeGreaterThan(0);
        expect(prompt).toContain(INVOKE_TARGET_AGENT_TOOL_NAME);
        expect(prompt).toContain('CO-AGENT PROMPT BODY');
        expect(prompt).toContain('Sales Agent');

        // The model was asked to mint the client session with these params.
        expect(svc.Model.ClientCalled).toBe(true);
        expect(svc.Model.LastParams!.Model).toBe('mock-realtime');
    });

    it('surfaces CoAgentRunID + PromptRunID + CoAgentRunStepID when observability run creation succeeds', async () => {
        const svc = new TestableService();
        const result = await svc.PrepareClientSession(makePrepInput({ UserID: 'voice-user' }), contextUser, provider);

        expect(result.Success).toBe(true);
        expect(result.CoAgentRunID).toBe('co-run-1');
        expect(result.PromptRunID).toBe('prompt-run-1');
        expect(result.CoAgentRunStepID).toBe('run-step-1');

        // Run creation was invoked with the resolved model + prompt + session linkage.
        expect(svc.ObservabilitySpy).toHaveBeenCalledTimes(1);
        expect(svc.ObservabilitySpy.mock.calls[0][0]).toMatchObject({
            modelID: 'm1', promptID: 'prompt-1', agentSessionID: 'session-1', userID: 'voice-user'
        });
    });

    it('still succeeds (omitting the ids) when observability run creation fails', async () => {
        const svc = new TestableService();
        svc.ObservabilityResult = null;
        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);

        expect(result.Success).toBe(true);
        expect(result.ClientConfig).toBeDefined();
        expect(result.CoAgentRunID).toBeUndefined();
        expect(result.PromptRunID).toBeUndefined();
        expect(result.CoAgentRunStepID).toBeUndefined();
    });

    it('includes caller-supplied extra tools alongside invoke-target', async () => {
        const svc = new TestableService();
        const result = await svc.PrepareClientSession(makePrepInput({
            ExtraTools: [{ Name: 'ShowChart', Description: 'Render a chart', ParametersSchema: { type: 'object' } }]
        }), contextUser, provider);

        const names = (result.SessionParams!.Tools ?? []).map(t => t.Name);
        expect(names).toContain(INVOKE_TARGET_AGENT_TOOL_NAME);
        expect(names).toContain('ShowChart');
    });

    it('merges extra tools AFTER invoke-target, preserving caller order (client UI tool sets)', async () => {
        const svc = new TestableService();
        const result = await svc.PrepareClientSession(makePrepInput({
            ExtraTools: [
                { Name: 'Whiteboard.AddNote', Description: 'Add a sticky note', ParametersSchema: { type: 'object' } },
                { Name: 'Whiteboard.Highlight', Description: 'Pulse a highlight', ParametersSchema: { type: 'object' } }
            ]
        }), contextUser, provider);

        const names = (result.SessionParams!.Tools ?? []).map(t => t.Name);
        expect(names).toEqual([INVOKE_TARGET_AGENT_TOOL_NAME, 'Whiteboard.AddNote', 'Whiteboard.Highlight']);
    });

    it('fails gracefully (no throw) when no Realtime model resolves', async () => {
        const svc = new TestableService();
        svc.ResolveModelResult = null;
        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);

        expect(result.Success).toBe(false);
        expect(result.ClientConfig).toBeUndefined();
        expect(result.ErrorMessage).toContain('No usable Realtime model');
    });

    it('fails gracefully when the resolved model does not support client-direct', async () => {
        const svc = new TestableService();
        const nonDirect = new MockRealtimeModel();
        vi.spyOn(nonDirect, 'SupportsClientDirect', 'get').mockReturnValue(false);
        svc.ResolveModelResult = { Model: nonDirect, ModelID: 'm1', VendorID: 'v1', APIName: 'mock-realtime' };

        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('does not support client-direct');
    });

    it('fails gracefully when the co-agent cannot be resolved', async () => {
        const svc = new TestableService();
        const result = await svc.PrepareClientSession(
            makePrepInput({ CoAgent: undefined, CoAgentID: undefined }),
            contextUser,
            provider
        );
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Realtime Co-Agent could not be resolved');
    });

    it('returns a failure result (no throw) when the model rejects minting', async () => {
        const svc = new TestableService();
        vi.spyOn(svc.Model, 'CreateClientSession').mockRejectedValue(new Error('provider down'));
        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('provider down');
    });

    it('surfaces the resolved ModelID + ModelName on success', async () => {
        const svc = new TestableService();
        svc.ResolveModelResult = {
            Model: svc.Model, ModelID: 'm1', VendorID: 'v1', APIName: 'mock-realtime', ModelName: 'Mock Realtime'
        };
        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);

        expect(result.Success).toBe(true);
        expect(result.ModelID).toBe('m1');
        expect(result.ModelName).toBe('Mock Realtime');
    });

    it('omits NarrationInstructionsTemplate when the narration prompt is not in metadata', async () => {
        const svc = new TestableService();
        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);

        expect(result.Success).toBe(true);
        // AIEngine is unconfigured in tests → the tolerant resolver yields null → undefined here.
        expect(result.NarrationInstructionsTemplate).toBeUndefined();
    });

    it('surfaces NarrationInstructionsTemplate when the narration prompt resolves', async () => {
        class NarrationService extends TestableService {
            protected override resolveNarrationInstructionsTemplate(): string | null {
                return 'Progress: "{{ progressMessage }}" — say one first-person sentence.';
            }
        }
        const result = await new NarrationService().PrepareClientSession(makePrepInput(), contextUser, provider);

        expect(result.Success).toBe(true);
        expect(result.NarrationInstructionsTemplate).toContain('{{ progressMessage }}');
    });
});

// ════════════════════════════════════════════════════════════════════
// Preferred-model resolution (explicit user choice — strict, no fallback)
// ════════════════════════════════════════════════════════════════════

function makeModelEntity(
    overrides: Partial<{ ID: string; Name: string; IsActive: boolean; AIModelType: string }> = {}
): MJAIModelEntityExtended {
    return {
        ID: 'pref-model-1', Name: 'GPT Realtime 2', IsActive: true, AIModelType: 'Realtime', ...overrides
    } as unknown as MJAIModelEntityExtended;
}

/**
 * Exercises the REAL {@link RealtimeClientSessionService.resolvePreferredRealtimeModel} path by
 * stubbing only the metadata/environment seams: model lookup, vendor selection, API-key lookup, and
 * driver instantiation. The default-resolution seam ({@link TestableService.ResolveModelResult})
 * still SUCCEEDS, so any preferred-model failure below also proves there is no silent fallback.
 */
class PreferredModelTestService extends TestableService {
    public ModelEntity: MJAIModelEntityExtended | null = makeModelEntity();
    public Vendor: { VendorID: string; DriverClass: string; APIName: string } | null = {
        VendorID: 'v-pref', DriverClass: 'MockRealtimeDriver', APIName: 'mock-realtime-preferred'
    };
    public ApiKey: string | undefined = 'key-123';

    protected override findModelByID(): MJAIModelEntityExtended | null { return this.ModelEntity; }
    protected override selectRealtimeVendor(): { VendorID: string; DriverClass: string; APIName: string } | null {
        return this.Vendor;
    }
    protected override getAPIKeyForDriver(): string | undefined { return this.ApiKey; }
    protected override createModelInstance(): BaseRealtimeModel | null { return this.Model; }
}

describe('RealtimeClientSessionService preferred-model resolution', () => {
    it('honors PreferredModelID: mints with the chosen model and surfaces its id + name', async () => {
        const svc = new PreferredModelTestService();
        const result = await svc.PrepareClientSession(
            makePrepInput({ PreferredModelID: 'pref-model-1' }), contextUser, provider
        );

        expect(result.Success).toBe(true);
        expect(result.ModelID).toBe('pref-model-1');
        expect(result.ModelName).toBe('GPT Realtime 2');
        // The provider session was minted with the PREFERRED model's vendor API name.
        expect(svc.Model.LastParams!.Model).toBe('mock-realtime-preferred');
    });

    it('fails (naming the id, no fallback) when the preferred model is not found', async () => {
        const svc = new PreferredModelTestService();
        svc.ModelEntity = null;
        const result = await svc.PrepareClientSession(
            makePrepInput({ PreferredModelID: 'missing-model' }), contextUser, provider
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('missing-model');
        expect(result.ErrorMessage).toContain('not found');
        // No silent fallback: the default seam would have succeeded.
        expect(svc.Model.ClientCalled).toBe(false);
    });

    it('fails when the preferred model is inactive', async () => {
        const svc = new PreferredModelTestService();
        svc.ModelEntity = makeModelEntity({ IsActive: false });
        const result = await svc.PrepareClientSession(
            makePrepInput({ PreferredModelID: 'pref-model-1' }), contextUser, provider
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('GPT Realtime 2');
        expect(result.ErrorMessage).toContain('not active');
    });

    it('fails when the preferred model is not a Realtime model', async () => {
        const svc = new PreferredModelTestService();
        svc.ModelEntity = makeModelEntity({ AIModelType: 'LLM' });
        const result = await svc.PrepareClientSession(
            makePrepInput({ PreferredModelID: 'pref-model-1' }), contextUser, provider
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('not a Realtime model');
        expect(result.ErrorMessage).toContain("'LLM'");
    });

    it('fails when the preferred model has no usable vendor/API key', async () => {
        const svc = new PreferredModelTestService();
        svc.Vendor = null;
        const result = await svc.PrepareClientSession(
            makePrepInput({ PreferredModelID: 'pref-model-1' }), contextUser, provider
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('GPT Realtime 2');
        expect(result.ErrorMessage).toContain('no active vendor');
    });

    it('does not consult the preferred path when PreferredModelID is absent (default behavior unchanged)', async () => {
        const svc = new PreferredModelTestService();
        svc.ModelEntity = null; // would fail the preferred path if it were consulted
        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);

        expect(result.Success).toBe(true); // default seam (ResolveModelResult) used
    });
});

describe('RealtimeClientSessionService.ExecuteRelayedTool', () => {
    function makeToolInput(overrides: Partial<ExecuteRelayedToolInput> = {}): ExecuteRelayedToolInput {
        const call: RealtimeToolCall = {
            CallID: 'c1',
            ToolName: INVOKE_TARGET_AGENT_TOOL_NAME,
            Arguments: JSON.stringify({ request: 'do the work' })
        };
        return { AgentSessionID: 'session-1', TargetAgentID: 'target-1', Call: call, ...overrides };
    }

    it('routes the invoke-target tool to the delegate and serializes the result', async () => {
        const svc = new TestableService();
        const result = await svc.ExecuteRelayedTool(makeToolInput(), contextUser, provider);

        expect(svc.DelegateSpy).toHaveBeenCalledTimes(1);
        const req = svc.DelegateSpy.mock.calls[0][0];
        expect(req.CallID).toBe('c1');
        expect(req.AbortSignal).toBeInstanceOf(AbortSignal);

        expect(result.Success).toBe(true);
        expect(JSON.parse(result.ResultJson)).toEqual({ success: true, output: 'delegated-ok' });
    });

    it('routes a non-target tool to the structured "not available" path', async () => {
        const svc = new TestableService();
        const otherCall: RealtimeToolCall = { CallID: 'c2', ToolName: 'ShowChart', Arguments: '{}' };
        const result = await svc.ExecuteRelayedTool(makeToolInput({ Call: otherCall }), contextUser, provider);

        expect(svc.DelegateSpy).not.toHaveBeenCalled();
        expect(result.Success).toBe(false);
        expect(JSON.parse(result.ResultJson)).toMatchObject({ success: false });
        expect(result.ResultJson).toContain('not available');
    });

    it('serializes a delegate failure as a structured error tool_response', async () => {
        const svc = new TestableService();
        svc.DelegateSpy.mockResolvedValueOnce({ CallID: 'c1', Success: false, Output: 'target failed' });
        const result = await svc.ExecuteRelayedTool(makeToolInput(), contextUser, provider);

        expect(result.Success).toBe(false);
        expect(JSON.parse(result.ResultJson)).toEqual({ success: false, output: 'target failed' });
    });

    it('surfaces the delegated run\'s Artifacts on the return (alongside the serialized JSON)', async () => {
        const svc = new TestableService();
        const artifacts: DelegatedRunArtifact[] = [{ ArtifactID: 'a-1', ArtifactVersionID: 'av-1', Name: 'Report' }];
        svc.DelegateSpy.mockResolvedValueOnce({ CallID: 'c1', Success: true, Output: 'done', RunID: 'run-9', Artifacts: artifacts });

        const result = await svc.ExecuteRelayedTool(makeToolInput(), contextUser, provider);

        // The transport layer (MJServer resolver) junction-links these into conversation history.
        expect(result.Artifacts).toEqual(artifacts);
        // And the SAME info is embedded in ResultJson for the client overlay.
        expect(JSON.parse(result.ResultJson).artifacts).toEqual([{ artifactId: 'a-1', artifactVersionId: 'av-1', name: 'Report' }]);
    });

    it('leaves Artifacts undefined when the delegation produced none', async () => {
        const svc = new TestableService();
        const result = await svc.ExecuteRelayedTool(makeToolInput(), contextUser, provider);
        expect(result.Artifacts).toBeUndefined();
    });
});

// ════════════════════════════════════════════════════════════════════
// In-flight delegation registry + cancel channel (CancelRealtimeSessionTool's engine)
// ════════════════════════════════════════════════════════════════════

describe('RealtimeClientSessionService.CancelInFlightDelegations', () => {
    function makeToolInput(callID: string, overrides: Partial<ExecuteRelayedToolInput> = {}): ExecuteRelayedToolInput {
        const call: RealtimeToolCall = {
            CallID: callID,
            ToolName: INVOKE_TARGET_AGENT_TOOL_NAME,
            Arguments: JSON.stringify({ request: 'do the work' })
        };
        return { AgentSessionID: 'session-1', TargetAgentID: 'target-1', Call: call, ...overrides };
    }

    /**
     * Service whose delegate HANGS until cancelled, resolving with a "cancelled" failure —
     * mimicking a real delegated run whose `cancellationToken` was pulled. Mirrors the REAL
     * `delegateToTarget`'s signal handling: it listens on BOTH the broker's per-call signal
     * (`request.AbortSignal`) and the registry-combined `input.AbortSignal` the service threads
     * into `ExecuteRelayedTool`'s effective input (the production path combines exactly these
     * two into the delegated run's `cancellationToken`).
     */
    class HangingDelegateService extends TestableService {
        protected override async delegateToTarget(
            input: ExecuteRelayedToolInput,
            request: DelegateToTargetRequest
        ): Promise<DelegatedResult> {
            return new Promise<DelegatedResult>((resolve) => {
                const finish = (): void => resolve({ CallID: request.CallID, Success: false, Output: 'cancelled' });
                if (request.AbortSignal.aborted || input.AbortSignal?.aborted) {
                    finish();
                    return;
                }
                request.AbortSignal.addEventListener('abort', finish, { once: true });
                input.AbortSignal?.addEventListener('abort', finish, { once: true });
            });
        }
    }

    function makeHangingService(): HangingDelegateService {
        return new HangingDelegateService();
    }

    it('aborts ONE in-flight delegation by (sessionId, callId) and returns 1', async () => {
        const svc = makeHangingService();
        const pending = svc.ExecuteRelayedTool(makeToolInput('c1'), contextUser, provider);

        const aborted = svc.CancelInFlightDelegations('session-1', 'c1');
        expect(aborted).toBe(1);

        const result = await pending;
        expect(result.Success).toBe(false);
        expect(JSON.parse(result.ResultJson)).toEqual({ success: false, output: 'cancelled' });
    });

    it('aborts ALL in-flight delegations for the session when callId is omitted', async () => {
        const svc = makeHangingService();
        const p1 = svc.ExecuteRelayedTool(makeToolInput('c1'), contextUser, provider);
        const p2 = svc.ExecuteRelayedTool(makeToolInput('c2'), contextUser, provider);

        const aborted = svc.CancelInFlightDelegations('session-1');
        expect(aborted).toBe(2);

        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1.Success).toBe(false);
        expect(r2.Success).toBe(false);
    });

    it('only aborts the targeted call — siblings keep running', async () => {
        const svc = makeHangingService();
        const p1 = svc.ExecuteRelayedTool(makeToolInput('c1'), contextUser, provider);
        const p2 = svc.ExecuteRelayedTool(makeToolInput('c2'), contextUser, provider);

        expect(svc.CancelInFlightDelegations('session-1', 'c1')).toBe(1);
        await p1;

        // c2 is still in flight — a follow-up cancel-all reaches exactly it.
        expect(svc.CancelInFlightDelegations('session-1')).toBe(1);
        await p2;
    });

    it('is tolerant: unknown session / unknown call id return 0 (never throws)', () => {
        const svc = makeHangingService();
        expect(svc.CancelInFlightDelegations('no-such-session')).toBe(0);
        expect(svc.CancelInFlightDelegations('no-such-session', 'c1')).toBe(0);
    });

    it('returns 0 after the delegation completed (registry entries are cleaned up)', async () => {
        const svc = new TestableService(); // default delegate resolves immediately
        await svc.ExecuteRelayedTool(makeToolInput('c1'), contextUser, provider);

        expect(svc.CancelInFlightDelegations('session-1', 'c1')).toBe(0);
        expect(svc.CancelInFlightDelegations('session-1')).toBe(0);
    });

    it('normalizes ids — an uppercased session/call id cancels the same registry entry', async () => {
        const svc = makeHangingService();
        const pending = svc.ExecuteRelayedTool(makeToolInput('call-abc'), contextUser, provider);

        expect(svc.CancelInFlightDelegations('SESSION-1', 'CALL-ABC')).toBe(1);
        const result = await pending;
        expect(result.Success).toBe(false);
    });

    it('scopes the registry per session — cancelling one session leaves another untouched', async () => {
        const svc = makeHangingService();
        const pA = svc.ExecuteRelayedTool(makeToolInput('c1', { AgentSessionID: 'session-A' }), contextUser, provider);
        const pB = svc.ExecuteRelayedTool(makeToolInput('c1', { AgentSessionID: 'session-B' }), contextUser, provider);

        expect(svc.CancelInFlightDelegations('session-A')).toBe(1);
        await pA;

        expect(svc.CancelInFlightDelegations('session-B')).toBe(1);
        await pB;
    });

    it('still combines a caller-supplied AbortSignal — either source cancels the delegate', async () => {
        const svc = makeHangingService();
        const callerController = new AbortController();
        const pending = svc.ExecuteRelayedTool(
            makeToolInput('c1', { AbortSignal: callerController.signal }),
            contextUser,
            provider
        );

        callerController.abort(); // the ORIGINAL barge-in style signal still works
        const result = await pending;
        expect(result.Success).toBe(false);
        expect(JSON.parse(result.ResultJson)).toEqual({ success: false, output: 'cancelled' });
    });
});

// ════════════════════════════════════════════════════════════════════
// Prior-transcript hydration (resume continuity)
// ════════════════════════════════════════════════════════════════════

describe('RealtimeClientSessionService.PrepareClientSession — PriorTranscript framing', () => {
    it('frames the prior transcript into the system prompt as a labeled prior-conversation section', async () => {
        const svc = new TestableService();
        const result = await svc.PrepareClientSession(
            makePrepInput({ PriorTranscript: 'User: hello\nAssistant: hi there' }),
            contextUser,
            provider
        );

        const prompt = result.SessionParams!.SystemPrompt;
        expect(prompt).toContain('Earlier in this conversation (a previous live session that you are now resuming)');
        expect(prompt).toContain('User: hello\nAssistant: hi there');
        // The framing sits BEFORE the current-conversation history block.
        expect(prompt.indexOf('Earlier in this conversation')).toBeLessThan(prompt.indexOf('Conversation so far:'));
    });

    it('omits the prior-conversation section when no PriorTranscript is supplied', async () => {
        const svc = new TestableService();
        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);
        expect(result.SessionParams!.SystemPrompt).not.toContain('Earlier in this conversation');
    });

    it('omits the section for an empty / whitespace-only PriorTranscript', async () => {
        const svc = new TestableService();
        const result = await svc.PrepareClientSession(makePrepInput({ PriorTranscript: '   \n  ' }), contextUser, provider);
        expect(result.SessionParams!.SystemPrompt).not.toContain('Earlier in this conversation');
    });
});

// ════════════════════════════════════════════════════════════════════
// FinalizeCoAgentRun
// ════════════════════════════════════════════════════════════════════

interface FakeRun {
    [key: string]: unknown;
    ID: string;
    Status: string;
    CompletedAt?: Date;
    Load: (id: string) => Promise<boolean>;
    Save: () => Promise<boolean>;
    LatestResult?: { CompleteMessage?: string };
}

function makeRun(overrides: Partial<FakeRun> = {}): FakeRun {
    return {
        ID: 'run-1',
        Status: 'Running',
        Load: vi.fn(async () => true),
        Save: vi.fn(async () => true),
        LatestResult: { CompleteMessage: '' },
        ...overrides,
    };
}

/** Provider whose GetEntityObject returns a fixed run per entity name. */
function makeRunProvider(byName: (entityName: string) => FakeRun): IMetadataProvider {
    return { GetEntityObject: vi.fn(async (name: string) => byName(name)) } as unknown as IMetadataProvider;
}

describe('RealtimeClientSessionService.AppendPromptRunMessage', () => {
    it('appends a turn to an empty Messages array', async () => {
        const promptRun = makeRun({ ID: 'pr-1', Messages: null });
        const svc = new RealtimeClientSessionService();

        const ok = await svc.AppendPromptRunMessage('pr-1', 'user', 'hello', false, contextUser, makeRunProvider(() => promptRun));

        expect(ok).toBe(true);
        expect(JSON.parse(promptRun.Messages as string)).toEqual([{ role: 'user', content: 'hello' }]);
    });

    it('appends to existing Messages, preserving prior turns', async () => {
        const promptRun = makeRun({ ID: 'pr-1', Messages: JSON.stringify([{ role: 'user', content: 'hi' }]) });
        const svc = new RealtimeClientSessionService();

        await svc.AppendPromptRunMessage('pr-1', 'assistant', 'hello back', false, contextUser, makeRunProvider(() => promptRun));

        expect(JSON.parse(promptRun.Messages as string)).toEqual([
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello back' },
        ]);
    });

    it('replacePrevious swaps the last same-role message (streaming correction)', async () => {
        const promptRun = makeRun({ ID: 'pr-1', Messages: JSON.stringify([
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'partial' },
        ]) });
        const svc = new RealtimeClientSessionService();

        await svc.AppendPromptRunMessage('pr-1', 'assistant', 'final full text', true, contextUser, makeRunProvider(() => promptRun));

        expect(JSON.parse(promptRun.Messages as string)).toEqual([
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'final full text' },
        ]);
    });

    it('replacePrevious appends when the last message is a different role', async () => {
        const promptRun = makeRun({ ID: 'pr-1', Messages: JSON.stringify([{ role: 'user', content: 'hi' }]) });
        const svc = new RealtimeClientSessionService();

        await svc.AppendPromptRunMessage('pr-1', 'assistant', 'reply', true, contextUser, makeRunProvider(() => promptRun));

        expect(JSON.parse(promptRun.Messages as string)).toEqual([
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'reply' },
        ]);
    });

    it('returns false (never throws) when the prompt run cannot be loaded', async () => {
        const promptRun = makeRun({ ID: 'missing', Load: vi.fn(async () => false) });
        const svc = new RealtimeClientSessionService();

        expect(await svc.AppendPromptRunMessage('missing', 'user', 'x', false, contextUser, makeRunProvider(() => promptRun))).toBe(false);
    });

    it('returns false when the save fails', async () => {
        const promptRun = makeRun({ ID: 'pr-1', Messages: null, Save: vi.fn(async () => false), LatestResult: { CompleteMessage: 'db down' } });
        const svc = new RealtimeClientSessionService();

        expect(await svc.AppendPromptRunMessage('pr-1', 'user', 'x', false, contextUser, makeRunProvider(() => promptRun))).toBe(false);
    });
});

describe('RealtimeClientSessionService — prompt-run write serialization (no clobber)', () => {
    /**
     * Models the production race: each GetEntityObject yields a FRESH entity whose Load copies from a shared
     * backing store and Save writes the whole row back. Without serialization, a concurrent usage save would
     * persist the stale Messages it loaded and wipe a freshly-appended turn (and vice-versa).
     */
    function makeStatefulRunProvider(store: { Messages: string | null; TokensPrompt: number; TokensCompletion: number; TokensUsed: number }): IMetadataProvider {
        return {
            GetEntityObject: vi.fn(async () => {
                const entity: Record<string, unknown> = {
                    Load: async () => {
                        entity.Messages = store.Messages;
                        entity.TokensPrompt = store.TokensPrompt;
                        entity.TokensCompletion = store.TokensCompletion;
                        entity.TokensUsed = store.TokensUsed;
                        return true;
                    },
                    Save: async () => {
                        store.Messages = entity.Messages as string | null;
                        store.TokensPrompt = entity.TokensPrompt as number;
                        store.TokensCompletion = entity.TokensCompletion as number;
                        store.TokensUsed = entity.TokensUsed as number;
                        return true;
                    },
                    LatestResult: { CompleteMessage: '' },
                };
                return entity;
            }),
        } as unknown as IMetadataProvider;
    }

    it('interleaved usage checkpoints and message appends preserve BOTH (neither clobbers the other)', async () => {
        const store = { Messages: null as string | null, TokensPrompt: 0, TokensCompletion: 0, TokensUsed: 0 };
        const provider = makeStatefulRunProvider(store);
        const svc = new RealtimeClientSessionService();

        // Fire many appends and usage checkpoints concurrently against the same run.
        const ops: Promise<boolean>[] = [];
        for (let i = 0; i < 8; i++) {
            ops.push(svc.AppendPromptRunMessage('pr-1', i % 2 === 0 ? 'user' : 'assistant', `turn ${i}`, false, contextUser, provider));
            ops.push(svc.AccumulatePromptRunUsage('pr-1', 100, 25, contextUser, provider));
        }
        await Promise.all(ops);

        // All 8 turns survived (usage saves didn't revert Messages) ...
        expect(JSON.parse(store.Messages as string)).toHaveLength(8);
        // ... and all 8 usage deltas accumulated (appends didn't revert tokens).
        expect(store.TokensPrompt).toBe(800);
        expect(store.TokensCompletion).toBe(200);
        expect(store.TokensUsed).toBe(1000);
    });
});

describe('RealtimeClientSessionService.FinalizeCoAgentRun', () => {
    it('completes both runs (Status, CompletedAt, Success) when they are still Running', async () => {
        const agentRun = makeRun({ ID: 'co-run-1' });
        const promptRun = makeRun({ ID: 'prompt-run-1' });
        const prov = makeRunProvider(name => (name === 'MJ: AI Agent Runs' ? agentRun : promptRun));
        const svc = new RealtimeClientSessionService();

        await svc.FinalizeCoAgentRun('co-run-1', 'prompt-run-1', contextUser, prov, true);

        expect(agentRun.Status).toBe('Completed');
        expect(agentRun.CompletedAt).toBeInstanceOf(Date);
        expect(agentRun.Success).toBe(true);
        expect(agentRun.Save).toHaveBeenCalledTimes(1);
        expect(promptRun.Status).toBe('Completed');
        expect(promptRun.CompletedAt).toBeInstanceOf(Date);
        expect(promptRun.Success).toBe(true);
        expect(promptRun.Save).toHaveBeenCalledTimes(1);
    });

    it('marks runs Failed when success=false', async () => {
        const agentRun = makeRun({ ID: 'co-run-1' });
        const prov = makeRunProvider(() => agentRun);
        const svc = new RealtimeClientSessionService();

        await svc.FinalizeCoAgentRun('co-run-1', null, contextUser, prov, false);

        expect(agentRun.Status).toBe('Failed');
        expect(agentRun.Success).toBe(false);
        expect(agentRun.Save).toHaveBeenCalledTimes(1);
    });

    it('completes the co-agent run step (Status, CompletedAt, Success) when its id is supplied', async () => {
        const agentRun = makeRun({ ID: 'co-run-1' });
        const promptRun = makeRun({ ID: 'prompt-run-1' });
        const runStep = makeRun({ ID: 'run-step-1' });
        const prov = makeRunProvider(name => {
            if (name === 'MJ: AI Agent Runs') return agentRun;
            if (name === 'MJ: AI Agent Run Steps') return runStep;
            return promptRun;
        });
        const svc = new RealtimeClientSessionService();

        await svc.FinalizeCoAgentRun('co-run-1', 'prompt-run-1', contextUser, prov, true, 'run-step-1');

        expect(runStep.Load).toHaveBeenCalledWith('run-step-1');
        expect(runStep.Status).toBe('Completed');
        expect(runStep.CompletedAt).toBeInstanceOf(Date);
        expect(runStep.Success).toBe(true);
        expect(runStep.ErrorMessage).toBeUndefined();
        expect(runStep.Save).toHaveBeenCalledTimes(1);
    });

    it('marks the run step Failed (Success false, ErrorMessage stamped) on an error close', async () => {
        const runStep = makeRun({ ID: 'run-step-1' });
        const prov = makeRunProvider(() => runStep);
        const svc = new RealtimeClientSessionService();

        await svc.FinalizeCoAgentRun(null, null, contextUser, prov, false, 'run-step-1');

        expect(runStep.Status).toBe('Failed');
        expect(runStep.Success).toBe(false);
        expect(runStep.ErrorMessage).toContain('error state');
        expect(runStep.Save).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for an already-finalized (non-Running) run step', async () => {
        const runStep = makeRun({ ID: 'run-step-1', Status: 'Completed' });
        const prov = makeRunProvider(() => runStep);
        const svc = new RealtimeClientSessionService();

        await svc.FinalizeCoAgentRun(null, null, contextUser, prov, true, 'run-step-1');

        expect(runStep.Save).not.toHaveBeenCalled();
    });

    it('tolerates a run-step finalize save failure (logged, never thrown)', async () => {
        const runStep = makeRun({ ID: 'run-step-1', Save: vi.fn(async () => false), LatestResult: { CompleteMessage: 'db down' } });
        const prov = makeRunProvider(() => runStep);
        const svc = new RealtimeClientSessionService();

        await expect(
            svc.FinalizeCoAgentRun(null, null, contextUser, prov, true, 'run-step-1')
        ).resolves.toBeUndefined();
    });

    it('is a no-op for an already-finalized (non-Running) run', async () => {
        const agentRun = makeRun({ ID: 'co-run-1', Status: 'Completed' });
        const prov = makeRunProvider(() => agentRun);
        const svc = new RealtimeClientSessionService();

        await svc.FinalizeCoAgentRun('co-run-1', null, contextUser, prov, true);

        expect(agentRun.Status).toBe('Completed');
        expect(agentRun.Save).not.toHaveBeenCalled();
    });

    it('is a no-op when a run cannot be loaded', async () => {
        const agentRun = makeRun({ ID: 'missing', Load: vi.fn(async () => false) });
        const prov = makeRunProvider(() => agentRun);
        const svc = new RealtimeClientSessionService();

        await svc.FinalizeCoAgentRun('missing', null, contextUser, prov, true);

        expect(agentRun.Save).not.toHaveBeenCalled();
    });

    it('skips all three when ids are null', async () => {
        const getEntity = vi.fn();
        const prov = { GetEntityObject: getEntity } as unknown as IMetadataProvider;
        const svc = new RealtimeClientSessionService();

        await svc.FinalizeCoAgentRun(null, null, contextUser, prov, true, null);

        expect(getEntity).not.toHaveBeenCalled();
    });

    it('tolerates a finalize save failure (logged, never thrown) and still finalizes the sibling run', async () => {
        const agentRun = makeRun({ ID: 'co-run-1', Save: vi.fn(async () => false), LatestResult: { CompleteMessage: 'db down' } });
        const promptRun = makeRun({ ID: 'prompt-run-1' });
        const prov = makeRunProvider(name => (name === 'MJ: AI Agent Runs' ? agentRun : promptRun));
        const svc = new RealtimeClientSessionService();

        await expect(
            svc.FinalizeCoAgentRun('co-run-1', 'prompt-run-1', contextUser, prov, true)
        ).resolves.toBeUndefined();

        // The agent-run save failed, but the prompt run was still finalized afterward.
        expect(promptRun.Status).toBe('Completed');
        expect(promptRun.Save).toHaveBeenCalledTimes(1);
    });
});

// ════════════════════════════════════════════════════════════════════
// createCoAgentObservabilityRun — REAL DB-seam path (fake provider):
// field stamping, best-effort containment, prompt-run skip/failure.
// ════════════════════════════════════════════════════════════════════

/** Exposes the protected observability-run creation seam against a fake provider. */
class ObservabilityTestService extends RealtimeClientSessionService {
    public CallCreateObservabilityRun(
        coAgent: MJAIAgentEntityExtended,
        promptID: string | null,
        modelID: string,
        vendorID: string,
        userID: string | undefined,
        agentSessionID: string,
        prov: IMetadataProvider,
        conversationID?: string,
    ): Promise<{ CoAgentRunID: string; PromptRunID?: string; CoAgentRunStepID?: string } | null> {
        return this.createCoAgentObservabilityRun(
            coAgent, promptID, modelID, vendorID, userID, agentSessionID, contextUser, prov, conversationID
        );
    }
}

interface FakeObsRun extends FakeRun {
    NewRecord: () => void;
}

function makeObsRun(id: string, overrides: Partial<FakeObsRun> = {}): FakeObsRun {
    return {
        ...makeRun({ ID: id }),
        NewRecord: vi.fn(),
        ...overrides,
    } as FakeObsRun;
}

/** Three-way provider routing for the agent run / prompt run / run step entities. */
function makeObsProvider(agentRun: FakeObsRun, promptRun: FakeObsRun, runStep: FakeObsRun): IMetadataProvider {
    return makeRunProvider(name => {
        if (name === 'MJ: AI Agent Runs') return agentRun;
        if (name === 'MJ: AI Agent Run Steps') return runStep;
        return promptRun;
    });
}

describe('RealtimeClientSessionService.createCoAgentObservabilityRun (real path)', () => {
    it('creates the co-agent AIAgentRun + linked AIPromptRun + single run step with full linkage stamping', async () => {
        const agentRun = makeObsRun('co-run-real');
        const promptRun = makeObsRun('prompt-run-real');
        const runStep = makeObsRun('run-step-real');
        const prov = makeObsProvider(agentRun, promptRun, runStep);
        const svc = new ObservabilityTestService();

        const result = await svc.CallCreateObservabilityRun(
            makeCoAgent(), 'prompt-77', 'model-77', 'vendor-77', 'voice-user', 'session-77', prov, 'conv-77'
        );

        expect(result).toEqual({ CoAgentRunID: 'co-run-real', PromptRunID: 'prompt-run-real', CoAgentRunStepID: 'run-step-real' });

        // Agent run stamping.
        expect(agentRun.NewRecord).toHaveBeenCalled();
        expect(agentRun.AgentID).toBe('co-1');
        expect(agentRun.Status).toBe('Running');
        expect(agentRun.StartedAt).toBeInstanceOf(Date);
        expect(agentRun.AgentSessionID).toBe('session-77');
        expect(agentRun.ConversationID).toBe('conv-77');
        expect(agentRun.UserID).toBe('voice-user');

        // Prompt run stamping + linkage back to the co-agent run AND the co-agent itself —
        // PromptID puts the run on the prompt's run history, AgentID on agent-scoped views.
        expect(promptRun.NewRecord).toHaveBeenCalled();
        expect(promptRun.PromptID).toBe('prompt-77');
        expect(promptRun.ModelID).toBe('model-77');
        expect(promptRun.VendorID).toBe('vendor-77');   // required — without it the save fails ("Vendor cannot be null")
        expect(promptRun.AgentID).toBe('co-1');
        expect(promptRun.Status).toBe('Running');
        expect(promptRun.RunType).toBe('Single');
        expect(promptRun.RunAt).toBeInstanceOf(Date);
        expect(promptRun.AgentRunID).toBe('co-run-real');

        // The single Timeline step: StepType Prompt targeting the system prompt + its prompt run.
        expect(runStep.NewRecord).toHaveBeenCalled();
        expect(runStep.AgentRunID).toBe('co-run-real');
        expect(runStep.StepNumber).toBe(1);
        expect(runStep.StepType).toBe('Prompt');
        expect(runStep.StepName).toBe('Realtime session system prompt');
        expect(runStep.TargetID).toBe('prompt-77');
        expect(runStep.TargetLogID).toBe('prompt-run-real');
        expect(runStep.Status).toBe('Running');
        expect(runStep.StartedAt).toBeInstanceOf(Date);
        expect(runStep.Save).toHaveBeenCalledTimes(1);
    });

    it('leaves ConversationID/UserID unset when not supplied', async () => {
        const agentRun = makeObsRun('co-run-real');
        const prov = makeRunProvider(() => agentRun);
        const svc = new ObservabilityTestService();

        await svc.CallCreateObservabilityRun(makeCoAgent(), null, 'model-1', 'vendor-1', undefined, 'session-1', prov);

        expect(agentRun.ConversationID).toBeUndefined();
        expect(agentRun.UserID).toBeUndefined();
    });

    it('returns null (no prompt run attempted) when the agent-run save fails — best-effort', async () => {
        const agentRun = makeObsRun('co-run-fail', { Save: vi.fn(async () => false), LatestResult: { CompleteMessage: 'fk violation' } });
        const getEntity = vi.fn(async () => agentRun);
        const prov = { GetEntityObject: getEntity } as unknown as IMetadataProvider;
        const svc = new ObservabilityTestService();

        const result = await svc.CallCreateObservabilityRun(makeCoAgent(), 'prompt-1', 'model-1', 'vendor-1', 'u1', 's1', prov);

        expect(result).toBeNull();
        expect(getEntity).toHaveBeenCalledTimes(1); // only the agent run was ever requested
    });

    it('skips the prompt run AND run step (ids undefined) when no co-agent prompt resolved', async () => {
        const agentRun = makeObsRun('co-run-real');
        const getEntity = vi.fn(async () => agentRun);
        const prov = { GetEntityObject: getEntity } as unknown as IMetadataProvider;
        const svc = new ObservabilityTestService();

        const result = await svc.CallCreateObservabilityRun(makeCoAgent(), null, 'model-1', 'vendor-1', 'u1', 's1', prov);

        expect(result).toEqual({ CoAgentRunID: 'co-run-real', PromptRunID: undefined, CoAgentRunStepID: undefined });
        expect(getEntity).toHaveBeenCalledTimes(1); // neither the prompt run nor the step was requested
    });

    it('still returns the CoAgentRunID — and creates the step WITHOUT a TargetLogID — when only the prompt-run save fails', async () => {
        const agentRun = makeObsRun('co-run-real');
        const promptRun = makeObsRun('prompt-run-fail', { Save: vi.fn(async () => false), LatestResult: { CompleteMessage: 'boom' } });
        const runStep = makeObsRun('run-step-real');
        const prov = makeObsProvider(agentRun, promptRun, runStep);
        const svc = new ObservabilityTestService();

        const result = await svc.CallCreateObservabilityRun(makeCoAgent(), 'prompt-1', 'model-1', 'vendor-1', 'u1', 's1', prov);

        expect(result).toEqual({ CoAgentRunID: 'co-run-real', PromptRunID: undefined, CoAgentRunStepID: 'run-step-real' });
        expect(runStep.TargetID).toBe('prompt-1');
        expect(runStep.TargetLogID).toBeNull();
    });

    it('omits only the CoAgentRunStepID (runs still returned) when the run-step save fails — best-effort', async () => {
        const agentRun = makeObsRun('co-run-real');
        const promptRun = makeObsRun('prompt-run-real');
        const runStep = makeObsRun('run-step-fail', { Save: vi.fn(async () => false), LatestResult: { CompleteMessage: 'step boom' } });
        const prov = makeObsProvider(agentRun, promptRun, runStep);
        const svc = new ObservabilityTestService();

        const result = await svc.CallCreateObservabilityRun(makeCoAgent(), 'prompt-1', 'model-1', 'vendor-1', 'u1', 's1', prov);

        expect(result).toEqual({ CoAgentRunID: 'co-run-real', PromptRunID: 'prompt-run-real', CoAgentRunStepID: undefined });
    });

    it('contains a THROWN run-step failure (runs still returned) — step creation never breaks the session', async () => {
        const agentRun = makeObsRun('co-run-real');
        const promptRun = makeObsRun('prompt-run-real');
        const getEntity = vi.fn(async (name: string) => {
            if (name === 'MJ: AI Agent Run Steps') {
                throw new Error('run step entity unavailable');
            }
            return name === 'MJ: AI Agent Runs' ? agentRun : promptRun;
        });
        const prov = { GetEntityObject: getEntity } as unknown as IMetadataProvider;
        const svc = new ObservabilityTestService();

        const result = await svc.CallCreateObservabilityRun(makeCoAgent(), 'prompt-1', 'model-1', 'vendor-1', 'u1', 's1', prov);

        expect(result).toEqual({ CoAgentRunID: 'co-run-real', PromptRunID: 'prompt-run-real', CoAgentRunStepID: undefined });
    });
});

// ════════════════════════════════════════════════════════════════════
// delegateToTarget — REAL path (AgentRunner mocked): progress streaming,
// AwaitingFeedback question + PausedRunID, and ResumeRunID resumption.
// ════════════════════════════════════════════════════════════════════

/**
 * Exposes the protected {@link RealtimeClientSessionService.delegateToTarget} and stubs only the
 * DB-backed seams (target resolution + parent-run load). The REAL delegateToTarget runs against the
 * module-mocked AgentRunner so we can assert exactly what it passes to RunAgent + how it maps results.
 */
class DelegateTestService extends RealtimeClientSessionService {
    /** What the stubbed DB seam returns when artifact creation is eligible. */
    public ArtifactsResult: DelegatedRunArtifact[] | undefined = undefined;
    /** Spy on the DB-backed artifact seam — called ONLY when the eligibility guards pass. */
    public ProcessArtifactsSpy = vi.fn();

    protected override resolveTargetAgent(targetAgentID: string): MJAIAgentEntityExtended | null {
        if (!targetAgentID) return null;
        return { ID: targetAgentID, Name: 'Query Builder', Description: 'Builds queries.' } as unknown as MJAIAgentEntityExtended;
    }
    protected override async loadParentRun(): Promise<null> {
        return null;
    }
    protected override async processRunArtifacts(): Promise<DelegatedRunArtifact[] | undefined> {
        this.ProcessArtifactsSpy();
        return this.ArtifactsResult;
    }
    public CallDelegate(
        input: ExecuteRelayedToolInput,
        request: DelegateToTargetRequest
    ): Promise<DelegatedResult> {
        // Reach the protected method for testing.
        return (this as unknown as {
            delegateToTarget: (i: ExecuteRelayedToolInput, r: DelegateToTargetRequest, u: UserInfo, p: IMetadataProvider) => Promise<DelegatedResult>;
        }).delegateToTarget(input, request, contextUser, provider);
    }
}

function makeDelegateInput(overrides: Partial<ExecuteRelayedToolInput> = {}): ExecuteRelayedToolInput {
    return {
        AgentSessionID: 'session-1',
        TargetAgentID: 'target-1',
        Call: { CallID: 'c1', ToolName: INVOKE_TARGET_AGENT_TOOL_NAME, Arguments: JSON.stringify({ request: 'build it' }) },
        ...overrides,
    };
}

function makeDelegateRequest(overrides: Partial<DelegateToTargetRequest> = {}): DelegateToTargetRequest {
    return { CallID: 'c1', Arguments: JSON.stringify({ request: 'build it' }), AbortSignal: new AbortController().signal, ...overrides };
}

describe('RealtimeClientSessionService.delegateToTarget (real path)', () => {
    beforeEach(() => {
        runAgentMock.mockReset();
    });

    it('threads OnProgress through to RunAgent', async () => {
        runAgentMock.mockResolvedValue({ success: true, agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' } });
        const onProgress = vi.fn();
        const svc = new DelegateTestService();

        await svc.CallDelegate(makeDelegateInput({ OnProgress: onProgress }), makeDelegateRequest());

        expect(runAgentMock).toHaveBeenCalledTimes(1);
        const passed = runAgentMock.mock.calls[0][0];
        expect(passed.onProgress).toBe(onProgress);
        // A fresh (non-resume) run does NOT set lastRunId / autoPopulateLastRunPayload.
        expect(passed.lastRunId).toBeUndefined();
        expect(passed.autoPopulateLastRunPayload).toBeUndefined();
    });

    it('returns the question + surfaces PausedRunID when the run is AwaitingFeedback', async () => {
        runAgentMock.mockResolvedValue({
            success: true,
            agentRun: { ID: 'paused-run-1', Status: 'AwaitingFeedback', Message: 'Should I include archived rows?' },
        });
        const svc = new DelegateTestService();

        const result = await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest());

        expect(result.Success).toBe(true);
        expect(result.PausedRunID).toBe('paused-run-1');
        expect(result.Output).toContain('Should I include archived rows?');
        // Phrased so the model relays it as a question, not a completed task.
        expect(result.Output.toLowerCase()).toContain('ask them');
    });

    it('passes lastRunId + autoPopulateLastRunPayload when ResumeRunID is set', async () => {
        runAgentMock.mockResolvedValue({ success: true, agentRun: { ID: 'paused-run-1', Status: 'Completed', Message: 'finished' } });
        const svc = new DelegateTestService();

        const result = await svc.CallDelegate(makeDelegateInput({ ResumeRunID: 'paused-run-1' }), makeDelegateRequest());

        const passed = runAgentMock.mock.calls[0][0];
        expect(passed.lastRunId).toBe('paused-run-1');
        expect(passed.autoPopulateLastRunPayload).toBe(true);
        // Resumed run that completed surfaces no PausedRunID.
        expect(result.PausedRunID).toBeUndefined();
        expect(result.Success).toBe(true);
    });

    it('maps a non-paused failure to Success:false with the error message', async () => {
        runAgentMock.mockResolvedValue({ success: false, agentRun: { ID: 'r1', Status: 'Failed', ErrorMessage: 'boom' } });
        const svc = new DelegateTestService();

        const result = await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest());

        expect(result.Success).toBe(false);
        expect(result.Output).toContain('boom');
        expect(result.PausedRunID).toBeUndefined();
    });

    it('creates + threads artifacts when the run completed with a payload', async () => {
        runAgentMock.mockResolvedValue({
            success: true,
            payload: { report: { title: 'Weather Report' } },
            agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' },
        });
        const svc = new DelegateTestService();
        svc.ArtifactsResult = [{ ArtifactID: 'a-1', ArtifactVersionID: 'av-1', Name: 'Weather Report' }];

        const result = await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest());

        expect(svc.ProcessArtifactsSpy).toHaveBeenCalledTimes(1);
        expect(result.Artifacts).toEqual([{ ArtifactID: 'a-1', ArtifactVersionID: 'av-1', Name: 'Weather Report' }]);
    });

    it('skips artifact creation when the run failed', async () => {
        runAgentMock.mockResolvedValue({
            success: false,
            payload: { partial: true },
            agentRun: { ID: 'r1', Status: 'Failed', ErrorMessage: 'boom' },
        });
        const svc = new DelegateTestService();

        const result = await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest());

        expect(svc.ProcessArtifactsSpy).not.toHaveBeenCalled();
        expect(result.Artifacts).toBeUndefined();
    });

    it('skips artifact creation when the run paused awaiting feedback', async () => {
        runAgentMock.mockResolvedValue({
            success: true,
            payload: { draft: true },
            agentRun: { ID: 'paused-1', Status: 'AwaitingFeedback', Message: 'Confirm?' },
        });
        const svc = new DelegateTestService();

        const result = await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest());

        expect(svc.ProcessArtifactsSpy).not.toHaveBeenCalled();
        expect(result.Artifacts).toBeUndefined();
    });

    it('skips artifact creation when the run returned no / empty payload', async () => {
        runAgentMock.mockResolvedValue({ success: true, payload: {}, agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' } });
        const svc = new DelegateTestService();

        const result = await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest());

        expect(svc.ProcessArtifactsSpy).not.toHaveBeenCalled();
        expect(result.Artifacts).toBeUndefined();
    });

    it('artifact-seam failures never fail the delegation (best-effort)', async () => {
        runAgentMock.mockResolvedValue({
            success: true,
            payload: { report: true },
            agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' },
        });
        class ThrowingService extends DelegateTestService {
            protected override async processRunArtifacts(): Promise<DelegatedRunArtifact[] | undefined> {
                throw new Error('artifact DB down');
            }
        }
        const svc = new ThrowingService();

        const result = await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest());

        expect(result.Success).toBe(true);
        expect(result.Artifacts).toBeUndefined();
        expect(result.Output).toContain('done');
    });

    it('ExecuteRelayedTool serializes artifacts end-to-end through the broker', async () => {
        runAgentMock.mockResolvedValue({
            success: true,
            payload: { report: true },
            agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' },
        });
        const svc = new DelegateTestService();
        svc.ArtifactsResult = [{ ArtifactID: 'a-9', ArtifactVersionID: 'av-9', Name: 'Q3 Summary' }];

        const result = await svc.ExecuteRelayedTool(makeDelegateInput(), contextUser, provider);

        const json = JSON.parse(result.ResultJson);
        expect(json.artifacts).toEqual([{ artifactId: 'a-9', artifactVersionId: 'av-9', name: 'Q3 Summary' }]);
        expect(json.runId).toBe('r1');
    });

    it('ExecuteRelayedTool surfaces PausedRunID end-to-end through the broker', async () => {
        runAgentMock.mockResolvedValue({
            success: true,
            agentRun: { ID: 'paused-run-9', Status: 'AwaitingFeedback', Message: 'Confirm the task graph?' },
        });
        const svc = new DelegateTestService();

        const result = await svc.ExecuteRelayedTool(makeDelegateInput(), contextUser, provider);

        expect(result.PausedRunID).toBe('paused-run-9');
        expect(result.Success).toBe(true);
        expect(JSON.parse(result.ResultJson).output).toContain('Confirm the task graph?');
    });

    it('fails cleanly (no RunAgent call) when no target agent resolves', async () => {
        const svc = new DelegateTestService();

        const result = await svc.CallDelegate(makeDelegateInput({ TargetAgentID: '' }), makeDelegateRequest());

        expect(result.Success).toBe(false);
        expect(result.Output).toContain('No target agent');
        expect(result.CallID).toBe('c1');
        expect(runAgentMock).not.toHaveBeenCalled();
    });

    it('contains a thrown RunAgent error as a "Delegation failed" result (never throws)', async () => {
        runAgentMock.mockRejectedValue(new Error('runner exploded'));
        const svc = new DelegateTestService();

        const result = await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest());

        expect(result.Success).toBe(false);
        expect(result.Output).toBe('Delegation failed: runner exploded');
        expect(result.PausedRunID).toBeUndefined();
    });

    it('parses the request text from { request } JSON arguments', async () => {
        runAgentMock.mockResolvedValue({ success: true, agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' } });
        const svc = new DelegateTestService();

        await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest({ Arguments: JSON.stringify({ request: 'build the report' }) }));

        expect(runAgentMock.mock.calls[0][0].conversationMessages).toEqual([{ role: 'user', content: 'build the report' }]);
    });

    it('falls back to the raw argument string when arguments are not JSON', async () => {
        runAgentMock.mockResolvedValue({ success: true, agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' } });
        const svc = new DelegateTestService();

        await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest({ Arguments: 'just do the thing' }));

        expect(runAgentMock.mock.calls[0][0].conversationMessages[0].content).toBe('just do the thing');
    });

    it('falls back to the raw string when the JSON has no string `request` member', async () => {
        runAgentMock.mockResolvedValue({ success: true, agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' } });
        const svc = new DelegateTestService();
        const raw = JSON.stringify({ request: 42 });

        await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest({ Arguments: raw }));

        expect(runAgentMock.mock.calls[0][0].conversationMessages[0].content).toBe(raw);
    });

    it('passes the broker signal through UNCHANGED when no caller signal exists (no extra controller)', async () => {
        runAgentMock.mockResolvedValue({ success: true, agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' } });
        const brokerSignal = new AbortController().signal;
        const svc = new DelegateTestService();

        await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest({ AbortSignal: brokerSignal }));

        expect(runAgentMock.mock.calls[0][0].cancellationToken).toBe(brokerSignal);
    });

    it('combines the caller barge-in signal with the broker signal — either aborts the run', async () => {
        let token: AbortSignal | undefined;
        runAgentMock.mockImplementation(async (params: { cancellationToken?: AbortSignal }) => {
            token = params.cancellationToken;
            return { success: true, agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' } };
        });
        const caller = new AbortController();
        const svc = new DelegateTestService();

        await svc.CallDelegate(makeDelegateInput({ AbortSignal: caller.signal }), makeDelegateRequest());

        expect(token).toBeInstanceOf(AbortSignal);
        expect(token!.aborted).toBe(false);
        caller.abort(); // caller-side barge-in flips the combined token
        expect(token!.aborted).toBe(true);
    });

    it('hands RunAgent an already-aborted token when the caller signal was pre-aborted', async () => {
        runAgentMock.mockResolvedValue({ success: true, agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' } });
        const caller = new AbortController();
        caller.abort();
        const svc = new DelegateTestService();

        await svc.CallDelegate(makeDelegateInput({ AbortSignal: caller.signal }), makeDelegateRequest());

        expect(runAgentMock.mock.calls[0][0].cancellationToken.aborted).toBe(true);
    });

    it('uses the fallback question when an AwaitingFeedback run carries no Message', async () => {
        runAgentMock.mockResolvedValue({
            success: true,
            agentRun: { ID: 'paused-1', Status: 'AwaitingFeedback', Message: '   ' },
        });
        const svc = new DelegateTestService();

        const result = await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest());

        expect(result.Success).toBe(true);
        expect(result.PausedRunID).toBe('paused-1');
        expect(result.Output).toContain('needs more information');
    });

    it('uses the default completion narration when a successful run carries no Message', async () => {
        runAgentMock.mockResolvedValue({ success: true, agentRun: { ID: 'r1', Status: 'Completed', Message: '' } });
        const svc = new DelegateTestService();

        const result = await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest());

        expect(result.Success).toBe(true);
        expect(result.Output).toContain('delegated work is complete');
    });

    it('uses the default failure narration (and still surfaces RunID) when a failed run has no ErrorMessage', async () => {
        runAgentMock.mockResolvedValue({ success: false, agentRun: { ID: 'r-fail', Status: 'Failed', ErrorMessage: '' } });
        const svc = new DelegateTestService();

        const result = await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest());

        expect(result.Success).toBe(false);
        expect(result.Output).toContain('could not be completed');
        expect(result.RunID).toBe('r-fail');
    });
});

// ════════════════════════════════════════════════════════════════════
// loadParentRun — REAL path: parent linkage threading + tolerant load failure.
// ════════════════════════════════════════════════════════════════════

/** Like DelegateTestService but keeps the REAL loadParentRun so we can exercise it. */
class ParentRunTestService extends RealtimeClientSessionService {
    protected override resolveTargetAgent(targetAgentID: string): MJAIAgentEntityExtended | null {
        if (!targetAgentID) return null;
        return { ID: targetAgentID, Name: 'Query Builder', Description: 'Builds queries.' } as unknown as MJAIAgentEntityExtended;
    }
    protected override async processRunArtifacts(): Promise<DelegatedRunArtifact[] | undefined> {
        return undefined;
    }
    public CallDelegate(
        input: ExecuteRelayedToolInput,
        request: DelegateToTargetRequest,
        prov: IMetadataProvider
    ): Promise<DelegatedResult> {
        return (this as unknown as {
            delegateToTarget: (i: ExecuteRelayedToolInput, r: DelegateToTargetRequest, u: UserInfo, p: IMetadataProvider) => Promise<DelegatedResult>;
        }).delegateToTarget(input, request, contextUser, prov);
    }
}

describe('RealtimeClientSessionService.loadParentRun (real path)', () => {
    beforeEach(() => {
        runAgentMock.mockReset();
        runAgentMock.mockResolvedValue({ success: true, agentRun: { ID: 'r1', Status: 'Completed', Message: 'done' } });
    });

    it('loads the parent run and threads it into RunAgent as parentRun', async () => {
        const parent = makeRun({ ID: 'co-run-1' });
        const prov = makeRunProvider(() => parent);
        const svc = new ParentRunTestService();

        await svc.CallDelegate(makeDelegateInput({ ParentRunID: 'co-run-1' }), makeDelegateRequest(), prov);

        expect(parent.Load).toHaveBeenCalledWith('co-run-1');
        expect(runAgentMock.mock.calls[0][0].parentRun).toBe(parent);
        expect(runAgentMock.mock.calls[0][0].agentSessionID).toBe('session-1');
    });

    it('proceeds WITHOUT parent linkage when the parent run cannot be loaded', async () => {
        const parent = makeRun({ ID: 'gone', Load: vi.fn(async () => false) });
        const prov = makeRunProvider(() => parent);
        const svc = new ParentRunTestService();

        const result = await svc.CallDelegate(makeDelegateInput({ ParentRunID: 'gone' }), makeDelegateRequest(), prov);

        expect(result.Success).toBe(true); // delegation still ran
        expect(runAgentMock.mock.calls[0][0].parentRun).toBeUndefined();
    });

    it('never touches the provider when no ParentRunID is supplied', async () => {
        const getEntity = vi.fn();
        const prov = { GetEntityObject: getEntity } as unknown as IMetadataProvider;
        const svc = new ParentRunTestService();

        await svc.CallDelegate(makeDelegateInput(), makeDelegateRequest(), prov);

        expect(getEntity).not.toHaveBeenCalled();
        expect(runAgentMock.mock.calls[0][0].parentRun).toBeUndefined();
    });
});

// ════════════════════════════════════════════════════════════════════
// App awareness (Move 1/3/4): app cascade layer, colleagues framing, app-context injection
// ════════════════════════════════════════════════════════════════════

describe('RealtimeClientSessionService — app awareness', () => {
    it('injects the app cascade layer so colleagues appear in the companion prompt (excluding the lead)', async () => {
        const svc = new TestableService();
        // App declares two relevant agents — one IS the lead (target-1, must be excluded) and one colleague.
        svc.AppOverridesJson = BuildAppRealtimeOverridesJson(
            { Disclosure: 'mention' },
            [
                { agentId: 'target-1', label: 'Sales Agent' }, // the lead — excluded from colleagues
                { agentId: 'colleague-1', label: 'Skip', disclosure: 'silent' },
            ],
        );
        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);

        const prompt = result.SessionParams!.SystemPrompt;
        expect(prompt).toContain('Your colleagues:');
        expect(prompt).toContain('"Skip"');
        expect(prompt).toContain('speak their result as your own'); // silent disclosure guidance for Skip
        // The lead (Sales Agent / target-1) is NOT listed as a colleague.
        expect(prompt).not.toContain('"Sales Agent":');
    });

    it('produces classic single-target framing (no colleagues clause) when the app declares none', async () => {
        const svc = new TestableService();
        svc.AppOverridesJson = null;
        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);
        expect(result.SessionParams!.SystemPrompt).not.toContain('Your colleagues:');
    });

    it('injects the app-context snapshot into the system prompt at mint', async () => {
        const svc = new TestableService();
        const appContext: AppContextSnapshot = {
            App: { Name: 'Knowledge Hub', Description: '' },
            ActiveNavItem: { Name: 'Analytics' },
            OtherNavItems: [],
            User: { Name: 'Amith', Roles: [] },
            View: { FreeText: 'reviewing the cluster chart' },
            Capabilities: { Tools: [{ Name: 'ExportCSV', Description: 'd', InputSchema: {} }] },
        };
        const result = await svc.PrepareClientSession(makePrepInput({ AppContext: appContext }), contextUser, provider);

        const prompt = result.SessionParams!.SystemPrompt;
        expect(prompt).toContain('CURRENT APP CONTEXT');
        expect(prompt).toContain('[app-context]');
        expect(prompt).toContain('Knowledge Hub');
        expect(prompt).toContain('available tools: ExportCSV');
    });

    it('omits the app-context section entirely when no snapshot is supplied', () => {
        const svc = new TestableService();
        expect(svc.ExposeAppContextSection(undefined)).toBe('');
    });

    it('maps allowedAgents to colleagues, excluding the lead and using label fallback', () => {
        const svc = new TestableService();
        const cfg: RealtimeCoAgentConfig = {
            realtime: {
                disclosure: 'mention',
                allowedAgents: [
                    { agentId: 'lead-1', label: 'Lead' },
                    { agentId: 'c1', label: 'Skip', disclosure: 'silent' },
                    { agentId: 'c2', label: 'Cleaner' },
                ],
            },
        };
        const colleagues = svc.ExposeColleagues(cfg, 'lead-1');
        expect(colleagues.map(c => c.name).sort()).toEqual(['Cleaner', 'Skip']);
        const skip = colleagues.find(c => c.name === 'Skip')!;
        expect(skip.disclosure).toBe('silent');       // per-target override
        const cleaner = colleagues.find(c => c.name === 'Cleaner')!;
        expect(cleaner.disclosure).toBe('mention');    // falls back to default
    });
});

// ════════════════════════════════════════════════════════════════════
// Multi-target delegation routing (Move 4)
// ════════════════════════════════════════════════════════════════════

describe('RealtimeClientSessionService.resolveDelegationTarget', () => {
    function inputWith(allowed?: { agentId: string; label?: string }[]): ExecuteRelayedToolInput {
        return {
            AgentSessionID: 'session-1',
            TargetAgentID: 'target-1',
            AllowedAgents: allowed,
            Call: { CallID: 'c1', ToolName: INVOKE_TARGET_AGENT_TOOL_NAME, Arguments: '{}' },
        };
    }

    it('routes to the lead when no colleague is named', () => {
        const svc = new TestableService();
        const r = svc.ExposeResolveDelegationTarget(undefined, inputWith());
        expect(r.Agent?.ID).toBe('target-1');
        expect(r.Agent?.Name).toBe('Sales Agent');
    });

    it('routes to a colleague named by label in the allowed union', () => {
        const svc = new TestableService();
        svc.TargetAgentNames = { 'target-1': 'Sales Agent', 'skip-1': 'Skip' };
        const r = svc.ExposeResolveDelegationTarget('Skip', inputWith([{ agentId: 'skip-1', label: 'Skip' }]));
        expect(r.Agent?.ID).toBe('skip-1');
    });

    it('routes to a colleague named by its resolved agent name', () => {
        const svc = new TestableService();
        svc.TargetAgentNames = { 'target-1': 'Sales Agent', 'qb-1': 'Query Builder' };
        const r = svc.ExposeResolveDelegationTarget('query builder', inputWith([{ agentId: 'qb-1' }]));
        expect(r.Agent?.ID).toBe('qb-1');
    });

    it('allows naming the lead agent itself', () => {
        const svc = new TestableService();
        const r = svc.ExposeResolveDelegationTarget('Sales Agent', inputWith([{ agentId: 'skip-1', label: 'Skip' }]));
        expect(r.Agent?.ID).toBe('target-1');
    });

    it('returns a structured error naming available colleagues for an unknown agent', () => {
        const svc = new TestableService();
        svc.TargetAgentNames = { 'target-1': 'Sales Agent', 'skip-1': 'Skip' };
        const r = svc.ExposeResolveDelegationTarget('Nobody', inputWith([{ agentId: 'skip-1', label: 'Skip' }]));
        expect(r.Agent).toBeUndefined();
        expect(r.Error).toContain('"Nobody"');
        expect(r.Error).toContain('Skip'); // available colleague listed for self-correction
    });

    it('errors clearly when no lead target is configured and none named', () => {
        const svc = new TestableService();
        const input: ExecuteRelayedToolInput = {
            AgentSessionID: 's', TargetAgentID: '', Call: { CallID: 'c', ToolName: INVOKE_TARGET_AGENT_TOOL_NAME, Arguments: '{}' },
        };
        const r = svc.ExposeResolveDelegationTarget(undefined, input);
        expect(r.Agent).toBeUndefined();
        expect(r.Error).toContain('No target agent is configured');
    });
});
