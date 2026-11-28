/**
 * @fileoverview Pluggable base token class for the Realtime Voice/Bridge Session seam (`s4`).
 *
 * Downstream packages can replace this helper globally via
 * `@RegisterClass(BaseAgentRealtimeHelper, 'Default')` or per-agent via
 * `AIAgent.Configuration.helperPlugins` (`seam: 'realtime'`).
 *
 * @module @memberjunction/ai-agents
 */

import type {
    BaseRealtimeModel,
    IRealtimeSession,
    RealtimeTranscript,
    RealtimeUsage,
} from '@memberjunction/ai';
import type {
    AgentConfiguration,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIPromptRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { PrepareClientSessionInput } from '../../realtime/realtime-client-session-service';
import type { RealtimeCoAgentConfig } from '../../realtime/realtime-coagent-config';
import type { RealtimePlatformCredentials } from '../../realtime/realtime-platform-credentials';
import type {
    DelegatedResult,
    DelegateToTargetRequest,
    RealtimeSessionResult,
    RealtimeSessionRunnerDeps,
    ToolExecutionResult,
} from '../../realtime/realtime-session-runner';
import type { RealtimeToolCall } from '@memberjunction/ai';
import type { AgentRunContext } from '../AgentRunContext';

/** Resolved realtime model, vendor driver, and metadata identifiers for a session-driven run. */
export interface AgentRealtimeModelResolution {
    model: BaseRealtimeModel;
    modelID: string;
    vendorID: string;
    modelVendorID?: string;
    apiName: string;
    driverClass?: string;
}

/**
 * Pluggable base token class for the `BaseAgent` realtime session, bridge transport,
 * transcript persistence, audio recording, and target-agent delegation seam.
 */
export class BaseAgentRealtimeHelper {
    public ExecuteRealtimeSession<R = unknown>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration
    ): Promise<ExecuteAgentResult<R>> {
        throw new Error('BaseAgentRealtimeHelper.ExecuteRealtimeSession must be implemented by a registered subclass.');
    }

    public StartBridgeRealtimeSession(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams
    ): Promise<IRealtimeSession> {
        throw new Error('BaseAgentRealtimeHelper.StartBridgeRealtimeSession must be implemented by a registered subclass.');
    }

    public BuildBridgePrepInput(_ctx: AgentRunContext, _params: ExecuteAgentParams): PrepareClientSessionInput {
        throw new Error('BaseAgentRealtimeHelper.BuildBridgePrepInput must be implemented by a registered subclass.');
    }

    public ResolveRealtimeModel(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _overrideModelID?: string
    ): Promise<AgentRealtimeModelResolution | null> {
        throw new Error('BaseAgentRealtimeHelper.ResolveRealtimeModel must be implemented by a registered subclass.');
    }

    public ResolveRealtimePlatformCredentials(
        _ctx: AgentRunContext,
        _modelIDs: string[],
        _params: ExecuteAgentParams
    ): Promise<RealtimePlatformCredentials> {
        throw new Error('BaseAgentRealtimeHelper.ResolveRealtimePlatformCredentials must be implemented by a registered subclass.');
    }

    public ResolveRealtimeEffectiveConfig(
        _ctx: AgentRunContext,
        _agent: MJAIAgentEntityExtended
    ): RealtimeCoAgentConfig {
        throw new Error('BaseAgentRealtimeHelper.ResolveRealtimeEffectiveConfig must be implemented by a registered subclass.');
    }

    public BuildRealtimeSessionDeps(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration,
        _modelResolution: {
            model: BaseRealtimeModel;
            apiName: string;
            driverClass?: string;
            modelID?: string;
            modelVendorID?: string;
        },
        _promptRun: MJAIPromptRunEntityExtended | null
    ): Promise<RealtimeSessionRunnerDeps> {
        throw new Error('BaseAgentRealtimeHelper.BuildRealtimeSessionDeps must be implemented by a registered subclass.');
    }

    public DelegateRealtimeToTarget(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration,
        _request: DelegateToTargetRequest
    ): Promise<DelegatedResult> {
        throw new Error('BaseAgentRealtimeHelper.DelegateRealtimeToTarget must be implemented by a registered subclass.');
    }

    public ResolveRealtimeTargetAgent(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams
    ): MJAIAgentEntityExtended | null {
        throw new Error('BaseAgentRealtimeHelper.ResolveRealtimeTargetAgent must be implemented by a registered subclass.');
    }

    public ParseDelegateRequestText(_ctx: AgentRunContext, _argumentsJson: string): string {
        throw new Error('BaseAgentRealtimeHelper.ParseDelegateRequestText must be implemented by a registered subclass.');
    }

    public ExecuteRealtimeTool(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _call: RealtimeToolCall
    ): Promise<ToolExecutionResult> {
        throw new Error('BaseAgentRealtimeHelper.ExecuteRealtimeTool must be implemented by a registered subclass.');
    }

    public PersistRealtimeTranscript(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _transcript: RealtimeTranscript
    ): Promise<string | null> {
        throw new Error('BaseAgentRealtimeHelper.PersistRealtimeTranscript must be implemented by a registered subclass.');
    }

    public FlushRealtimeTranscriptQueues(_ctx: AgentRunContext): Promise<void> {
        throw new Error('BaseAgentRealtimeHelper.FlushRealtimeTranscriptQueues must be implemented by a registered subclass.');
    }

    public FinalizeRealtimeRecording(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentRealtimeHelper.FinalizeRealtimeRecording must be implemented by a registered subclass.');
    }

    public CheckpointRealtimeUsage(
        _ctx: AgentRunContext,
        _promptRun: MJAIPromptRunEntityExtended | null,
        _usage: RealtimeUsage
    ): Promise<void> {
        throw new Error('BaseAgentRealtimeHelper.CheckpointRealtimeUsage must be implemented by a registered subclass.');
    }

    public FinalizeRealtimeRun<R = unknown>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _sessionResult: RealtimeSessionResult
    ): Promise<ExecuteAgentResult<R>> {
        throw new Error('BaseAgentRealtimeHelper.FinalizeRealtimeRun must be implemented by a registered subclass.');
    }
}
