/**
 * Unit tests for {@link RealtimeClientSessionService} — the server-agnostic preparer + tool relay
 * for the CLIENT-DIRECT realtime topology (Voice Co-Agent).
 *
 * All collaborators are injected via overridable seams on a test subclass: model resolution returns
 * a {@link MockRealtimeModel} (no provider SDK / DB), engine config is a no-op, and delegation is
 * stubbed. No network, no DB — fully deterministic.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    BaseRealtimeModel,
    ClientRealtimeSessionConfig,
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeToolCall
} from '@memberjunction/ai';
import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';

import {
    RealtimeClientSessionService,
    PrepareClientSessionInput,
    ExecuteRelayedToolInput,
    RealtimeModelResolution
} from '../realtime/realtime-client-session-service';
import { INVOKE_TARGET_AGENT_TOOL_NAME, DelegateToTargetRequest, DelegatedResult } from '../realtime/realtime-tool-broker';

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

    protected override async configureEngine(): Promise<void> { /* no DB */ }
    protected override async resolveRealtimeModel(): Promise<RealtimeModelResolution | null> {
        return this.ResolveModelResult;
    }
    protected override getCoAgentSystemPromptText(): string { return 'CO-AGENT PROMPT BODY'; }
    protected override resolveTargetAgent(targetAgentID: string): MJAIAgentEntityExtended | null {
        if (!targetAgentID) return null;
        return { ID: targetAgentID, Name: 'Sales Agent', Description: 'Closes deals.' } as unknown as MJAIAgentEntityExtended;
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
    return { ID: 'co-1', Name: 'Voice Co-Agent', InjectNotes: false, InjectExamples: false, ...overrides } as unknown as MJAIAgentEntityExtended;
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

    it('includes caller-supplied extra tools alongside invoke-target', async () => {
        const svc = new TestableService();
        const result = await svc.PrepareClientSession(makePrepInput({
            ExtraTools: [{ Name: 'ShowChart', Description: 'Render a chart', ParametersSchema: { type: 'object' } }]
        }), contextUser, provider);

        const names = (result.SessionParams!.Tools ?? []).map(t => t.Name);
        expect(names).toContain(INVOKE_TARGET_AGENT_TOOL_NAME);
        expect(names).toContain('ShowChart');
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
        expect(result.ErrorMessage).toContain('Voice Co-Agent could not be resolved');
    });

    it('returns a failure result (no throw) when the model rejects minting', async () => {
        const svc = new TestableService();
        vi.spyOn(svc.Model, 'CreateClientSession').mockRejectedValue(new Error('provider down'));
        const result = await svc.PrepareClientSession(makePrepInput(), contextUser, provider);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('provider down');
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
});
