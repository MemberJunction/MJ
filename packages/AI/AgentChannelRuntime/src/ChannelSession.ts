/**
 * Public entrypoint for the channel runtime. One `ChannelSession` per active
 * agent invocation; it loads metadata, merges config, resolves the engine via
 * `ClassFactory`, wires the transport, and hands off to `BaseChannelEngine.Run()`.
 *
 * Phase 1(c)(vi)–(vii): orchestration is implemented for the text-chat path
 * (and is generic enough to drive every channel in the discriminated union).
 * The cascaded / realtime / phone engines wire in subsequent sub-phases.
 *
 * See `plans/audio-agent-architecture.md` — "Channel Runtime, Engines, ... → 1. ChannelSession".
 */
import { randomUUID } from 'crypto';
import { LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentEntity,
    MJAIAgentChannelEntity,
    MJAIAgentChannelConfigEntity,
    MJAIAgentRunEntity,
    MJAIVoiceProfileEntity,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAgent } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import type { AgentChannelConfig, ChannelKind } from './types/channel-config';
import type { ChannelTranscriptListener, ChannelTaskGraphHandler } from './types/transcript-event';
import type { ITransportAdapter } from './transports/ITransportAdapter';
import { InterruptChannel } from './interrupt/InterruptChannel';
import {
    BaseChannelEngine,
    ChannelRunContext,
    ChannelStopReason,
} from './BaseChannelEngine';

/**
 * Construction options for a `ChannelSession`.
 *
 * `AgentID` and `ChannelName` reference rows in `AIAgent` and `AIAgentChannel`
 * respectively. `ConfigOverrides` is the caller's chance to tweak knobs without
 * editing metadata — merged on top of the channel + per-agent config rows.
 */
export interface ChannelSessionOptions {
    /** `AIAgent.ID` — which agent runs in this session. */
    AgentID: string;
    /** Matches an `AIAgentChannel.Name` — selects the engine and base config. */
    ChannelName: ChannelKind;
    /** Optional caller-side overrides merged on top of metadata configs. */
    ConfigOverrides?: Partial<AgentChannelConfig>;
    /** The wire — WebRTC, WebSocket, Twilio, etc. */
    Transport: ITransportAdapter;
    /** Multi-tenant context user. */
    ContextUser: UserInfo;
    /** Optional existing conversation this session belongs to. */
    ConversationID?: string;
    /** Optional external abort signal (mirrored into the `InterruptChannel`). */
    ExternalAbortSignal?: AbortSignal;
    /**
     * Optional transcript-event sink. When provided, the engine fires
     * structured events (user text, assistant text deltas, final agent
     * response with actionable commands, errors). MJServer's resolver passes
     * a callback that publishes to the `CHANNEL_TRANSCRIPT` pubsub so the
     * voice widget can render running transcripts and action chips. Absent
     * = transcript display disabled, no behavior change.
     */
    OnTranscript?: ChannelTranscriptListener;
    /**
     * Optional taskGraph executor. When provided, the engine detects
     * conversation-manager agents (Sage) emitting `payload.taskGraph` and
     * calls this to actually run the orchestrated sub-agents. The MJServer
     * resolver wires this to `TaskOrchestrator`. Without it, taskGraphs
     * are skipped — the engine speaks the parent agent's status message
     * and stops (correct fallback for surfaces that don't need
     * multi-agent orchestration).
     */
    OnTaskGraph?: ChannelTaskGraphHandler;
}

/**
 * Plain-JSON object map for deep-merging channel config JSON blobs.
 * Values are restricted to JSON shapes (string/number/boolean/null/object/array).
 */
type JsonObject = { [key: string]: JsonValue };
type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

/**
 * Deep-merge two plain JSON objects. `override` keys win over `base`.
 * Arrays are replaced (not concatenated) — same semantics as `lodash.merge`
 * with arrays of primitives, which is what config blobs use.
 *
 * Pure helper — no side effects, no mutation of inputs.
 */
function deepMergeJson(base: JsonObject, override: JsonObject): JsonObject {
    const out: JsonObject = { ...base };
    for (const key of Object.keys(override)) {
        const baseVal = base[key];
        const overrideVal = override[key];
        if (
            baseVal !== null &&
            typeof baseVal === 'object' &&
            !Array.isArray(baseVal) &&
            overrideVal !== null &&
            typeof overrideVal === 'object' &&
            !Array.isArray(overrideVal)
        ) {
            out[key] = deepMergeJson(baseVal as JsonObject, overrideVal as JsonObject);
        } else {
            out[key] = overrideVal;
        }
    }
    return out;
}

function parseJsonObject(raw: string | null | undefined, contextLabel: string): JsonObject {
    if (raw == null || raw.trim() === '') {
        return {};
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse ${contextLabel} JSON: ${msg}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${contextLabel} must be a JSON object; got ${typeof parsed}`);
    }
    return parsed as JsonObject;
}

/**
 * Merge channel defaults + per-agent override + caller-side override into a
 * single `AgentChannelConfig`, validating the discriminator against the
 * channel's `Name`.
 *
 * Pure function — exported for unit testing.
 */
export function MergeChannelConfig(
    defaults: string | null | undefined,
    perAgentOverride: string | null | undefined,
    callerOverride: Partial<AgentChannelConfig> | undefined,
    expectedKind: ChannelKind
): AgentChannelConfig {
    const defaultsObj = parseJsonObject(defaults, 'AIAgentChannel.DefaultConfigJSON');
    const perAgentObj = parseJsonObject(perAgentOverride, 'AIAgentChannelConfig.ConfigJSON');
    const callerObj: JsonObject = callerOverride
        ? (callerOverride as unknown as JsonObject)
        : {};

    const merged = deepMergeJson(deepMergeJson(defaultsObj, perAgentObj), callerObj);

    // Force the discriminator to match the channel row — this is the runtime's
    // source of truth. If a config blob has a stale Kind we override it rather
    // than failing the session.
    merged.Kind = expectedKind;

    // Sanity: ensure the resulting object is the right discriminator after merge.
    if (merged.Kind !== expectedKind) {
        throw new Error(
            `Merged channel config Kind='${String(merged.Kind)}' does not match channel '${expectedKind}'.`
        );
    }
    return merged as unknown as AgentChannelConfig;
}

export class ChannelSession {
    /** Unique session identifier; generated on construction. */
    public readonly SessionID: string;
    /** Frozen construction options. */
    public readonly Options: ChannelSessionOptions;

    private interrupt: InterruptChannel;
    private currentEngine: BaseChannelEngine | null = null;
    private currentAgentRun: MJAIAgentRunEntity | null = null;
    private isStopping = false;
    private externalAbortListener: (() => void) | null = null;

    constructor(options: ChannelSessionOptions) {
        this.Options = options;
        this.SessionID = randomUUID();
        this.interrupt = new InterruptChannel();

        if (options.ExternalAbortSignal) {
            const sig = options.ExternalAbortSignal;
            const listener = () => this.interrupt.Fire({ Kind: 'manual' });
            if (sig.aborted) {
                // Already aborted — fire immediately.
                this.interrupt.Fire({ Kind: 'manual' });
            } else {
                sig.addEventListener('abort', listener, { once: true });
                this.externalAbortListener = () => sig.removeEventListener('abort', listener);
            }
        }
    }

    /** The per-session barge-in / cancellation hub. */
    public get Interrupt(): InterruptChannel {
        return this.interrupt;
    }

    /**
     * The transport wired into this session. Exposed so external consumers
     * (e.g. MJServer GraphQL subscription resolvers draining
     * `TextInputAudioOutputTransport.OutboundAudioFrames`) can reach it
     * without the registry tracking transport instances separately.
     */
    public get Transport(): ITransportAdapter {
        return this.Options.Transport;
    }

    /**
     * Load metadata, merge config, resolve the engine via `ClassFactory`, wire
     * the transport, and run the per-channel turn loop.
     */
    public async Run(): Promise<void> {
        const md = new Metadata();
        const contextUser = this.Options.ContextUser;

        // 1. Load AIAgent
        const agent = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', contextUser);
        const agentLoaded = await agent.Load(this.Options.AgentID);
        if (!agentLoaded) {
            throw new Error(`AIAgent not found for ID='${this.Options.AgentID}'.`);
        }

        // 2. Load AIAgentChannel by Name
        const rv = new RunView();
        const channelLookup = await rv.RunView<MJAIAgentChannelEntity>(
            {
                EntityName: 'MJ: AI Agent Channels',
                ExtraFilter: `Name='${escapeSqlString(this.Options.ChannelName)}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser
        );
        if (!channelLookup.Success) {
            throw new Error(
                `Failed to load AIAgentChannel for Name='${this.Options.ChannelName}': ${channelLookup.ErrorMessage}`
            );
        }
        const channelRows = channelLookup.Results ?? [];
        if (channelRows.length === 0) {
            throw new Error(`AIAgentChannel not found for Name='${this.Options.ChannelName}'.`);
        }
        const channel = channelRows[0];

        // 3. Load AIAgentChannelConfig (per-agent join, optional)
        const configLookup = await rv.RunView<MJAIAgentChannelConfigEntity>(
            {
                EntityName: 'MJ: AI Agent Channel Configs',
                ExtraFilter: `AIAgentID='${escapeSqlString(agent.ID)}' AND AIAgentChannelID='${escapeSqlString(channel.ID)}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser
        );
        if (!configLookup.Success) {
            throw new Error(
                `Failed to load AIAgentChannelConfig for AgentID='${agent.ID}', ChannelID='${channel.ID}': ${configLookup.ErrorMessage}`
            );
        }
        const channelConfigRows = configLookup.Results ?? [];
        const channelConfigEntity: MJAIAgentChannelConfigEntity | undefined = channelConfigRows[0];

        // 4. Merge: channel defaults ⊕ per-agent override ⊕ caller override.
        const mergedConfig = MergeChannelConfig(
            channel.DefaultConfigJSON,
            channelConfigEntity?.ConfigJSON ?? null,
            this.Options.ConfigOverrides,
            this.Options.ChannelName
        );

        // 5. Optional voice profile.
        let voiceProfile: MJAIVoiceProfileEntity | undefined;
        if (channelConfigEntity?.AIVoiceProfileID) {
            const vp = await md.GetEntityObject<MJAIVoiceProfileEntity>(
                'MJ: AI Voice Profiles',
                contextUser
            );
            const vpLoaded = await vp.Load(channelConfigEntity.AIVoiceProfileID);
            if (!vpLoaded) {
                throw new Error(
                    `AIVoiceProfile not found for ID='${channelConfigEntity.AIVoiceProfileID}'.`
                );
            }
            voiceProfile = vp;
        }

        // Conversation lookup / auto-creation. The voice engine writes
        // ConversationDetail rows per turn (mirrors the MJ chat surface),
        // so a Conversation is REQUIRED — we either join one the caller
        // passed in, or create one for the session.
        //
        // Plan reference: `ChannelRunContext.conversation?: ConversationEntity`
        // was always optional in the spec, but `ConversationDetail.AIContentTypeID`
        // (added in Phase 1(a)(iii)) and `session.onTranscript(...) →
        // ConversationDetail rows` (Realtime engine, plan §2.3) both assume
        // a conversation exists. Single source of truth: per-session
        // conversation, owned by the user, named after the agent.
        let conversation: MJConversationEntity;
        if (this.Options.ConversationID) {
            const c = await md.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                contextUser
            );
            const cLoaded = await c.Load(this.Options.ConversationID);
            if (!cLoaded) {
                throw new Error(
                    `Conversation not found for ID='${this.Options.ConversationID}'.`
                );
            }
            conversation = c;
        } else {
            const c = await md.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                contextUser
            );
            c.NewRecord();
            c.Name = `Voice with ${agent.Name}`;
            c.UserID = contextUser.ID;
            c.Status = 'Available';
            const created = await c.Save();
            if (!created) {
                const reason = c.LatestResult?.CompleteMessage ?? 'unknown error';
                throw new Error(
                    `Failed to auto-create Conversation for voice session: ${reason}`
                );
            }
            conversation = c;
        }

        // 6. Create AIAgentRun row with channel binding.
        const agentRun = await md.GetEntityObject<MJAIAgentRunEntity>(
            'MJ: AI Agent Runs',
            contextUser
        );
        agentRun.NewRecord();
        agentRun.AgentID = agent.ID;
        agentRun.AIAgentChannelID = channel.ID;
        agentRun.ConversationID = conversation.ID;
        agentRun.Status = 'Running';
        agentRun.StartedAt = new Date();
        if (contextUser?.ID) {
            agentRun.UserID = contextUser.ID;
        }
        const runSaved = await agentRun.Save();
        if (!runSaved) {
            const reason = agentRun.LatestResult?.CompleteMessage ?? 'unknown error';
            throw new Error(`Failed to create AIAgentRun: ${reason}`);
        }
        this.currentAgentRun = agentRun;

        // 7. Resolve engine via ClassFactory using channel.DriverClass.
        const engine = MJGlobal.Instance.ClassFactory.CreateInstance<BaseChannelEngine>(
            BaseChannelEngine,
            channel.DriverClass
        );
        if (!engine) {
            await this.finalizeRunOnFailure(
                agentRun,
                `No BaseChannelEngine registered for DriverClass='${channel.DriverClass}'.`
            );
            throw new Error(
                `No BaseChannelEngine registered for DriverClass='${channel.DriverClass}'.`
            );
        }
        this.currentEngine = engine;

        // 8. Resolve the BaseAgent driver — MIRROR `AgentRunner.RunAgent`
        //    EXACTLY. Order matters: prefer `agent.DriverClass`, fall back to
        //    `agentType.DriverClass`, never pass `undefined`/`null` to
        //    `CreateInstance`.
        //
        //    Why never undefined: `ClassFactory.GetRegistration(BaseAgent, undefined)`
        //    matches EVERY BaseAgent subclass registration (`key === undefined ?
        //    true : keysMatch` — see `classFactory.ts:228`). It then returns
        //    the highest-priority match, which in this monorepo is the most
        //    recently registered subclass (e.g. `DatabaseDesignerSchemaDesigner`).
        //    That subclass overrides `validateSuccessNextStep` to access
        //    `payload.SchemaDesign` — which throws for non-DatabaseDesigner
        //    agents like Sage. Passing a non-null sentinel key (even one with
        //    no registration) makes the factory fall back to `new BaseAgent()`
        //    cleanly instead.
        const agentType = AIEngine.Instance.AgentTypes.find((at) =>
            UUIDsEqual(at.ID, agent.TypeID)
        );
        const agentDriverClass =
            agent.DriverClass || agentType?.DriverClass || 'BaseAgent';
        const agentInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAgent>(
            BaseAgent,
            agentDriverClass
        );
        if (!agentInstance) {
            await this.finalizeRunOnFailure(
                agentRun,
                `Failed to instantiate BaseAgent (DriverClass='${agentDriverClass ?? '<default>'}').`
            );
            throw new Error(
                `Failed to instantiate BaseAgent (DriverClass='${agentDriverClass ?? '<default>'}').`
            );
        }

        // 9. Open transport.
        await this.Options.Transport.Open();

        // 10. Build context, run engine, finalize.
        const ctx: ChannelRunContext = {
            SessionID: this.SessionID,
            Agent: agentInstance,
            AgentMetadata: agent,
            ChannelMetadata: channel,
            ChannelConfigEntity: channelConfigEntity,
            ChannelConfig: mergedConfig,
            VoiceProfile: voiceProfile,
            Transport: this.Options.Transport,
            Interrupt: this.interrupt,
            ContextUser: contextUser,
            AgentRun: agentRun,
            Conversation: conversation,
            OnTranscript: this.Options.OnTranscript,
            OnTaskGraph: this.Options.OnTaskGraph,
        };

        try {
            await engine.Run(ctx);
            await this.finalizeRunOnSuccess(agentRun);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await this.finalizeRunOnFailure(agentRun, msg);
            throw err;
        } finally {
            try {
                await this.Options.Transport.Close();
            } catch (closeErr) {
                LogError(
                    `ChannelSession[${this.SessionID}] transport.Close() failed`,
                    undefined,
                    closeErr
                );
            }
            this.detachExternalAbort();
        }
    }

    /**
     * Terminate the session, finalize the `AIAgentRun`, and tear down the transport.
     * Idempotent — subsequent calls are no-ops.
     */
    public async Stop(reason: ChannelStopReason = 'cancelled'): Promise<void> {
        if (this.isStopping) {
            return;
        }
        this.isStopping = true;

        // 1. Fire the interrupt so listeners wake up.
        this.interrupt.Fire({ Kind: 'manual' });

        // 2. Best-effort engine stop.
        if (this.currentEngine) {
            try {
                await this.currentEngine.Stop(reason);
            } catch (err) {
                LogError(
                    `ChannelSession[${this.SessionID}] engine.Stop() failed`,
                    undefined,
                    err
                );
            }
        }

        // 3. Tear down transport.
        try {
            await this.Options.Transport.Close();
        } catch (err) {
            LogError(
                `ChannelSession[${this.SessionID}] transport.Close() failed`,
                undefined,
                err
            );
        }

        // 4. Finalize the agent run if it's still in Running state.
        if (this.currentAgentRun && this.currentAgentRun.Status === 'Running') {
            const status = mapStopReasonToRunStatus(reason);
            this.currentAgentRun.Status = status;
            this.currentAgentRun.CompletedAt = new Date();
            this.currentAgentRun.Success = status === 'Completed';
            if (status !== 'Completed') {
                this.currentAgentRun.ErrorMessage = `Stopped: ${reason}`;
            }
            const saved = await this.currentAgentRun.Save();
            if (!saved) {
                LogError(
                    `ChannelSession[${this.SessionID}] failed to finalize AIAgentRun on Stop(): ${this.currentAgentRun.LatestResult?.CompleteMessage ?? 'unknown error'}`
                );
            }
        }

        this.detachExternalAbort();
    }

    private async finalizeRunOnSuccess(agentRun: MJAIAgentRunEntity): Promise<void> {
        agentRun.Status = 'Completed';
        agentRun.Success = true;
        agentRun.CompletedAt = new Date();
        const saved = await agentRun.Save();
        if (!saved) {
            LogError(
                `ChannelSession[${this.SessionID}] failed to finalize AIAgentRun on success: ${agentRun.LatestResult?.CompleteMessage ?? 'unknown error'}`
            );
        }
    }

    private async finalizeRunOnFailure(
        agentRun: MJAIAgentRunEntity,
        errorMessage: string
    ): Promise<void> {
        agentRun.Status = 'Failed';
        agentRun.Success = false;
        agentRun.ErrorMessage = errorMessage;
        agentRun.CompletedAt = new Date();
        const saved = await agentRun.Save();
        if (!saved) {
            LogError(
                `ChannelSession[${this.SessionID}] failed to finalize AIAgentRun on failure: ${agentRun.LatestResult?.CompleteMessage ?? 'unknown error'}`
            );
        }
    }

    private detachExternalAbort(): void {
        if (this.externalAbortListener) {
            this.externalAbortListener();
            this.externalAbortListener = null;
        }
    }
}

/**
 * Escape a string for safe embedding inside a single-quoted SQL literal.
 * Trivial — doubles single quotes. We're working with UUIDs and short channel
 * names here, but defending against pathological input is cheap.
 */
function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

function mapStopReasonToRunStatus(
    reason: ChannelStopReason
): 'Cancelled' | 'Failed' | 'Completed' {
    switch (reason) {
        case 'completed':
            return 'Completed';
        case 'error':
            return 'Failed';
        case 'cancelled':
        case 'user-disconnect':
        case 'timeout':
        default:
            return 'Cancelled';
    }
}

