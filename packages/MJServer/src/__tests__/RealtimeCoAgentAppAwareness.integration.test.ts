/**
 * @fileoverview HEADLESS INTEGRATION test — the Realtime Co-Agent "app awareness" stack composed
 * end-to-end across packages: the app config cascade (`@memberjunction/ai-agents`
 * realtime-coagent-config), the `AppContextSnapshot` mint-time injection
 * (`@memberjunction/ai-core-plus`), the colleagues framing, and the multi-target delegation routing
 * — all driven through the REAL {@link RealtimeClientSessionService} (only DB/SDK seams stubbed).
 *
 * This is the integration counterpart to the per-package unit tests: it proves the Move 1/3/4 layers
 * actually compose (an app's AgentSettings → cascade → effective config → system prompt + allowed
 * union → delegation), with no provider socket and no DB. Voice itself is not exercised (that is the
 * live-verification step), but everything up to "what the model is told and which agent a delegation
 * runs" is.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    BaseRealtimeModel,
    ClientRealtimeSessionConfig,
    IRealtimeSession,
    RealtimeSessionParams,
} from '@memberjunction/ai';
import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { MJAIAgentEntityExtended, AppContextSnapshot, ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import {
    RealtimeClientSessionService,
    PrepareClientSessionInput,
    ExecuteRelayedToolInput,
    RealtimeModelResolution,
    CoAgentSystemPromptResolution,
} from '@memberjunction/ai-agents';
import {
    BuildAppRealtimeOverridesJson,
    INVOKE_TARGET_AGENT_TOOL_NAME,
    DelegateToTargetRequest,
} from '@memberjunction/ai-agents';

class StubSession implements IRealtimeSession {
    SendInput(): void {}
    async RegisterTools(): Promise<void> {}
    OnOutput(): void {}
    OnTranscript(): void {}
    OnToolCall(): void {}
    async SendToolResult(): Promise<void> {}
    OnInterruption(): void {}
    OnUsage(): void {}
    OnError(): void {}
    async Close(): Promise<void> {}
}

class StubModel extends BaseRealtimeModel {
    constructor() { super('k'); }
    public override get SupportsClientDirect(): boolean { return true; }
    async StartSession(): Promise<IRealtimeSession> { return new StubSession(); }
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        return {
            Provider: 'stub', Model: params.Model, EphemeralToken: 't', ExpiresAt: '2099-01-01T00:00:00Z',
            SessionConfig: { instructions: params.SystemPrompt },
        };
    }
}

/** Real service with only the DB/SDK seams stubbed; cascade + prompt + delegation routing stay REAL. */
class IntegrationService extends RealtimeClientSessionService {
    private model = new StubModel();
    public AppOverridesJson: string | null = null;
    /** Captures which agent a delegation actually ran (the routing outcome under test). */
    public RanAgent: MJAIAgentEntityExtended | null = null;
    public TargetNames: Record<string, string> = { 'lead-1': 'Sage' };

    protected override async configureEngine(): Promise<void> {}
    protected override async resolveRealtimeModel(): Promise<RealtimeModelResolution | null> {
        return { Model: this.model, ModelID: 'm', VendorID: 'v', APIName: 'stub-realtime' };
    }
    protected override getCoAgentSystemPromptText(): string { return 'CO-AGENT BODY'; }
    protected override resolveCoAgentSystemPrompt(): CoAgentSystemPromptResolution {
        return { Text: 'CO-AGENT BODY', PromptID: 'p1' };
    }
    protected override async createCoAgentObservabilityRun(): Promise<{ CoAgentRunID: string } | null> {
        return { CoAgentRunID: 'run-1' };
    }
    protected override resolveTargetAgent(id: string): MJAIAgentEntityExtended | null {
        if (!id) return null;
        const name = this.TargetNames[id] ?? id;
        return { ID: id, Name: name, Description: `${name} agent.` } as unknown as MJAIAgentEntityExtended;
    }
    protected override async resolveAppRealtimeOverrides(): Promise<string | null> { return this.AppOverridesJson; }
    // Capture the routed target without running a real agent.
    protected override async runDelegatedAgent(
        _input: ExecuteRelayedToolInput,
        _request: DelegateToTargetRequest,
        target: MJAIAgentEntityExtended,
    ): Promise<ExecuteAgentResult> {
        this.RanAgent = target;
        return { success: true, payload: null, agentRun: { Status: 'Completed' } } as unknown as ExecuteAgentResult;
    }
    protected override async createDelegatedRunArtifacts(): Promise<undefined> { return undefined; }
}

const user = { ID: 'u1' } as unknown as UserInfo;
const provider = {} as unknown as IMetadataProvider;

function coAgent(): MJAIAgentEntityExtended {
    return { ID: 'co-1', Name: 'Realtime Co-Agent', InjectNotes: false, InjectExamples: false } as unknown as MJAIAgentEntityExtended;
}
function input(over: Partial<PrepareClientSessionInput> = {}): PrepareClientSessionInput {
    return { CoAgent: coAgent(), TargetAgentID: 'lead-1', AgentSessionID: 's1', ConversationMessages: [], ...over };
}

describe('Realtime Co-Agent app awareness — integration', () => {
    it('composes app AgentSettings → cascade → prompt (app-context + colleagues) + allowed union', async () => {
        const svc = new IntegrationService();
        svc.TargetNames = { 'lead-1': 'Sage', 'skip-1': 'Skip' };
        svc.AppOverridesJson = BuildAppRealtimeOverridesJson(
            { Disclosure: 'mention', Persona: { Tone: 'warm', SpeakingStyle: 'concise' } },
            [{ agentId: 'skip-1', label: 'Skip', disclosure: 'silent' }],
        );
        const appContext: AppContextSnapshot = {
            App: { Name: 'Knowledge Hub', Description: '' },
            ActiveNavItem: { Name: 'Analytics' },
            OtherNavItems: [],
            User: { Name: 'Amith', Roles: [] },
            View: { FreeText: 'looking at the cluster chart' },
            Capabilities: { Agents: [{ AgentID: 'skip-1', Name: 'Skip' }] },
        };

        const result = await svc.PrepareClientSession(input({ AppContext: appContext }), user, provider);
        expect(result.Success).toBe(true);

        const prompt = result.SessionParams!.SystemPrompt;
        // Identity (lead) + colleague (from app RelevantAgents) + per-target disclosure guidance.
        expect(prompt).toContain('voice for the agent "Sage"');
        expect(prompt).toContain('Your colleagues:');
        expect(prompt).toContain('"Skip"');
        expect(prompt).toContain('speak their result as your own'); // Skip's silent disclosure
        // Persona (app override) folded in.
        expect(prompt).toContain('Voice & manner');
        // App-context snapshot injected at mint.
        expect(prompt).toContain('CURRENT APP CONTEXT');
        expect(prompt).toContain('Knowledge Hub');

        // Effective config carries the union-accumulated allowed agents (surfaced to the resolver to persist).
        expect(result.EffectiveConfig?.realtime?.allowedAgents?.map(a => a.agentId)).toContain('skip-1');
        expect(result.EffectiveConfig?.realtime?.disclosure).toBe('mention');
    });

    it('routes a relayed invoke-target-agent call to a named colleague in the allowed union', async () => {
        const svc = new IntegrationService();
        svc.TargetNames = { 'lead-1': 'Sage', 'skip-1': 'Skip' };
        const relay: ExecuteRelayedToolInput = {
            AgentSessionID: 's1',
            TargetAgentID: 'lead-1',
            AllowedAgents: [{ agentId: 'skip-1', label: 'Skip' }],
            Call: {
                CallID: 'c1',
                ToolName: INVOKE_TARGET_AGENT_TOOL_NAME,
                Arguments: JSON.stringify({ agent: 'Skip', request: 'analyze this' }),
            },
        };
        const out = await svc.ExecuteRelayedTool(relay, user, provider);
        expect(JSON.parse(out.ResultJson).success).toBe(true);
        expect(svc.RanAgent?.ID).toBe('skip-1'); // routed to the named colleague, not the lead
    });

    it('routes to the lead when no colleague is named', async () => {
        const svc = new IntegrationService();
        const relay: ExecuteRelayedToolInput = {
            AgentSessionID: 's1',
            TargetAgentID: 'lead-1',
            AllowedAgents: [{ agentId: 'skip-1', label: 'Skip' }],
            Call: { CallID: 'c1', ToolName: INVOKE_TARGET_AGENT_TOOL_NAME, Arguments: JSON.stringify({ request: 'do it' }) },
        };
        await svc.ExecuteRelayedTool(relay, user, provider);
        expect(svc.RanAgent?.ID).toBe('lead-1');
    });

    it('returns a structured not-available error for an unknown colleague', async () => {
        const svc = new IntegrationService();
        const relay: ExecuteRelayedToolInput = {
            AgentSessionID: 's1',
            TargetAgentID: 'lead-1',
            AllowedAgents: [{ agentId: 'skip-1', label: 'Skip' }],
            Call: { CallID: 'c1', ToolName: INVOKE_TARGET_AGENT_TOOL_NAME, Arguments: JSON.stringify({ agent: 'Ghost', request: 'x' }) },
        };
        const out = await svc.ExecuteRelayedTool(relay, user, provider);
        const parsed = JSON.parse(out.ResultJson);
        expect(parsed.success).toBe(false);
        // A not-available colleague is a structured delegation outcome ({success:false, output}),
        // not a thrown error — the model narrates `output` to self-correct.
        expect(parsed.output).toContain('Ghost');
        expect(svc.RanAgent).toBeNull(); // nothing ran
    });
});
