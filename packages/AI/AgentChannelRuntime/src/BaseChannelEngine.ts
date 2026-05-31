/**
 * Abstract base for per-channel engines. Concrete engines (`TextChatChannelEngine`,
 * `CascadedChannelEngine`, `RealtimeChannelEngine`, `PhoneChannelEngine`,
 * `VideoRealtimeChannelEngine`) land in Phase 1(c)+.
 *
 * Engines are resolved via `MJGlobal.ClassFactory` using
 * `AIAgentChannel.DriverClass` — same pattern as `BaseLLM` providers.
 *
 * See `plans/audio-agent-architecture.md` section 3.3.
 */
import type { BaseAgent } from '@memberjunction/ai-agents';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJAIAgentEntity,
    MJAIAgentRunEntity,
    MJAIAgentChannelEntity,
    MJAIAgentChannelConfigEntity,
    MJAIVoiceProfileEntity,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import type { AgentChannelConfig } from './types/channel-config';
import type { ChannelTranscriptListener, ChannelTaskGraphHandler } from './types/transcript-event';
import type { ITransportAdapter } from './transports/ITransportAdapter';
import type { InterruptChannel } from './interrupt/InterruptChannel';

/**
 * Why an engine stopped. Set by the runtime when calling `Stop()`.
 */
export type ChannelStopReason =
    | 'completed'
    | 'user-disconnect'
    | 'cancelled'
    | 'error'
    | 'timeout';

/**
 * Runtime context handed to `BaseChannelEngine.Run()`.
 *
 * All entity references use the real generated MJ-prefixed classes from
 * `@memberjunction/core-entities`.
 */
export interface ChannelRunContext {
    /**
     * The channel-session ID. MUST be threaded into `ExecuteAgentParams.sessionID`
     * by any engine that calls `BaseAgent.Execute()` — that's how server-side
     * `ClientToolRequestManager` routes client-tool requests back to the
     * correct widget subscriber (see `ClientToolRequestResolver`).
     */
    SessionID: string;
    /**
     * The instantiated agent (driver) that will be invoked per turn.
     *
     * Phase 1(c)(vi)–(vii) note: `ChannelSession.Run()` resolves this via
     * `MJGlobal.ClassFactory.CreateInstance<BaseAgent>(...)` using the agent's
     * `DriverClass`. The cascaded engine in Phase 1(c)(v) will be the first
     * caller that actually exercises this field.
     */
    Agent: BaseAgent;
    /** The agent metadata row. */
    AgentMetadata: MJAIAgentEntity;
    /**
     * The channel metadata row — engines need this for `DriverClass`,
     * `ConfigJSONSchemaName`, and to correlate runs back to the channel.
     */
    ChannelMetadata: MJAIAgentChannelEntity;
    /**
     * The per-agent channel-config row (the join between AIAgent and
     * AIAgentChannel). Optional because callers may invoke a channel without
     * a stored per-agent override row — defaults still apply from
     * `ChannelMetadata.DefaultConfigJSON`.
     */
    ChannelConfigEntity?: MJAIAgentChannelConfigEntity;
    /** Strong-typed merged channel config (after defaults + per-agent + caller overrides). */
    ChannelConfig: AgentChannelConfig;
    /** Resolved voice profile, if the channel uses one. */
    VoiceProfile?: MJAIVoiceProfileEntity;
    /** Transport delivering frames into the engine and accepting frames out. */
    Transport: ITransportAdapter;
    /** Per-session barge-in / cancellation hub. */
    Interrupt: InterruptChannel;
    /** Multi-tenant context user. */
    ContextUser: UserInfo;
    /** The `AIAgentRun` row, already created with `AIAgentChannelID` set. */
    AgentRun: MJAIAgentRunEntity;
    /** Optional conversation this run belongs to. */
    Conversation?: MJConversationEntity;
    /**
     * Optional transcript-event sink. Engines call this on user text finals,
     * assistant-text deltas (per chunk emitted by the streaming JSON parser),
     * the post-execution `agent-response` event carrying actionable commands,
     * and per-turn errors. When undefined, transcript emission is disabled.
     */
    OnTranscript?: ChannelTranscriptListener;
    /**
     * Optional taskGraph executor. Engines detect a conversation-manager
     * agent (e.g. Sage) emitting `payload.taskGraph` and invoke this to
     * actually run the orchestrated sub-agents. Without this set, the
     * engine speaks the agent's status message and stops.
     */
    OnTaskGraph?: ChannelTaskGraphHandler;
}

/**
 * Abstract per-channel engine. Implementations own the turn loop for their
 * channel kind and drive the transport + agent + (optionally) speech providers.
 */
export abstract class BaseChannelEngine {
    /** Run the channel until completion or external stop. */
    public abstract Run(ctx: ChannelRunContext): Promise<void>;

    /** Stop the channel; idempotent. */
    public abstract Stop(reason: ChannelStopReason): Promise<void>;
}
