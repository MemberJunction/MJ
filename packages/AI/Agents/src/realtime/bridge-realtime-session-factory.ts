/**
 * @fileoverview `CreateBridgeRealtimeSession` — the **provider-agnostic** server-side factory that turns an
 * agent reference into a live {@link IRealtimeSession} for a Realtime Bridge. Given an agent id (or name)
 * + a context user + a metadata provider, it:
 *   1. resolves the `MJ: AI Agents` entity from the {@link AIEngine} cache,
 *   2. instantiates the correct {@link BaseAgent} subclass via the `ClassFactory` (the same path
 *      `AgentRunner` uses), and
 *   3. calls {@link BaseAgent.StartBridgeRealtimeSession} to open the raw model session.
 *
 * This is the seam every bridge needs — `LiveKitAgentRoomCoordinator.SetSessionFactory`, and the
 * (forthcoming) Teams/Zoom harnesses, all bind THIS one function. It deliberately lives in
 * `@memberjunction/ai-agents` (which owns the agent + realtime-model lifecycle) and depends on NO bridge
 * package, so a bridge package never has to reach back into the agent runtime — the consumer binds the
 * factory at startup instead.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { IRealtimeSession, ChatMessage, BaseRealtimeModel, RealtimeVoiceOption, GetAIAPIKey } from '@memberjunction/ai';
import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseAgent } from '../base-agent';

/**
 * The context a bridge passes to {@link CreateBridgeRealtimeSession}. Structurally compatible with the
 * LiveKit coordinator's `RealtimeSessionStartContext` (and any future bridge's equivalent) so this factory
 * can be bound directly via `SetSessionFactory(...)` without the consumer adapting shapes.
 */
export interface BridgeRealtimeSessionContext {
    /** The agent to voice, by id (preferred). */
    AgentID?: string;
    /** The agent to voice, by name (fallback when no id). */
    AgentName?: string;
    /**
     * The TARGET agent the co-agent voices — the one the user is actually "calling". The Realtime
     * Co-Agent is a voice front-end that delegates to this agent via `invoke-target-agent`; without a
     * target it has nobody to speak for and stays idle. Flows to `params.data.targetAgentID`.
     */
    TargetAgentID?: string;
    /** The transport endpoint being joined (room/meeting/number) — informational here; not required. */
    RoomName?: string;
    /**
     * Optional per-session Realtime MODEL override (an `MJ: AI Models` Name or ID) — a dev choosing a
     * specific realtime model for THIS agent in the room. Wins over the co-agent config's modelPreference.
     */
    RealtimeModelID?: string;
    /**
     * Optional per-session VOICE override (a provider-native voice id, e.g. OpenAI `echo`/`shimmer`) — how
     * two agents in the same room are given distinct voices. Replaces the config's per-provider voice.
     */
    RealtimeVoice?: string;
    /** The user the session runs as (scopes memory + DB ops). */
    ContextUser?: UserInfo;
    /** The request-scoped metadata provider (multi-provider safe). Falls back to the global default. */
    MetadataProvider?: IMetadataProvider;
}

/**
 * Opens a raw {@link IRealtimeSession} for the agent named in `ctx`. Bind this onto a bridge's
 * session-factory seam (e.g. `LiveKitAgentRoomCoordinator.Instance.SetSessionFactory(CreateBridgeRealtimeSession)`).
 *
 * @param ctx The bridge session context (agent id/name + user + provider).
 * @returns The live realtime session to hand to `AIBridgeEngine.StartBridgeSession`.
 * @throws When the agent can't be resolved, has no DriverClass, the driver can't be instantiated, or no
 *   usable Realtime model is configured (surfaced from {@link BaseAgent.StartBridgeRealtimeSession}).
 */
export async function CreateBridgeRealtimeSession(ctx: BridgeRealtimeSessionContext): Promise<IRealtimeSession> {
    const provider = ctx.MetadataProvider ?? Metadata.Provider;
    await AIEngine.Instance.Config(false, ctx.ContextUser, provider);

    const agent = resolveAgentEntity(ctx);
    if (!agent) {
        throw new Error(
            `CreateBridgeRealtimeSession: no agent found for AgentID='${ctx.AgentID ?? ''}' / ` +
                `AgentName='${ctx.AgentName ?? ''}'. Ensure the agent exists and the engine is configured.`,
        );
    }

    // Instantiate the right BaseAgent subclass exactly as AgentRunner does (agent DriverClass, else its type's).
    const agentType = AIEngine.Instance.AgentTypes.find((t) => UUIDsEqual(t.ID, agent.TypeID));
    const driverClass = agent.DriverClass || agentType?.DriverClass;
    if (!driverClass) {
        throw new Error(`CreateBridgeRealtimeSession: agent '${agent.Name}' has no DriverClass (and its type none either).`);
    }

    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAgent>(BaseAgent, driverClass);
    if (!instance) {
        throw new Error(`CreateBridgeRealtimeSession: ClassFactory could not create a BaseAgent for DriverClass '${driverClass}'.`);
    }

    return instance.StartBridgeRealtimeSession({
        agent,
        contextUser: ctx.ContextUser,
        provider,
        // A fresh bridge session starts with no prior turns; memory context degrades gracefully to empty.
        conversationMessages: [] as ChatMessage[],
        // Realtime extras ride params.data: the TARGET agent the co-agent voices via `invoke-target-agent`
        // (without it the co-agent stays idle), plus optional per-session dev overrides for the model/voice
        // so two agents in the same room can sound distinct. Omitted keys are simply absent.
        data: buildRealtimeData(ctx),
    });
}

/**
 * Builds the `params.data` bag from the bridge context — the realtime extras BaseAgent reads at session
 * start. Returns `undefined` when nothing is set so the param stays cleanly absent.
 */
function buildRealtimeData(ctx: BridgeRealtimeSessionContext): Record<string, unknown> | undefined {
    const data: Record<string, unknown> = {};
    if (ctx.TargetAgentID) {
        data.targetAgentID = ctx.TargetAgentID;
    }
    if (ctx.RealtimeModelID && ctx.RealtimeModelID.trim().length > 0) {
        data.realtimeModelID = ctx.RealtimeModelID.trim();
    }
    if (ctx.RealtimeVoice && ctx.RealtimeVoice.trim().length > 0) {
        data.realtimeVoice = ctx.RealtimeVoice.trim();
    }
    return Object.keys(data).length > 0 ? data : undefined;
}

/** An active Realtime model paired with the voices its driver supports — for the dev model/voice picker. */
export interface RealtimeModelVoices {
    /** The `MJ: AI Models` row id. */
    ModelID: string;
    /** The model's display name. */
    ModelName: string;
    /** The provider-native voices the model's driver declares (empty when it declares none). */
    Voices: RealtimeVoiceOption[];
}

/**
 * Enumerates the active Realtime models with each driver's supported voices — the source for the dev
 * model/voice picker. Only models with an Active vendor + resolvable API key + ClassFactory driver are
 * returned (a model you can't actually run isn't worth offering). Voices come from the driver
 * ({@link BaseRealtimeModel.SupportedVoices}) — the near-term, driver-owned source of truth.
 *
 * @param contextUser The user the engine config runs as (server-side).
 * @param provider The request-scoped metadata provider (multi-provider safe).
 * @returns Active realtime models, each with its driver's voices.
 */
export async function GetRealtimeModelVoices(
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
): Promise<RealtimeModelVoices[]> {
    await AIEngine.Instance.Config(false, contextUser, provider);
    const isRealtime = (t: string | null | undefined): boolean =>
        typeof t === 'string' && t.trim().toLowerCase() === 'realtime';
    const models = AIEngine.Instance.Models
        .filter((m) => m.IsActive && isRealtime(m.AIModelType))
        .sort((a, b) => (b.PowerRank ?? 0) - (a.PowerRank ?? 0));

    const out: RealtimeModelVoices[] = [];
    for (const model of models) {
        const driverClass = resolveRealtimeDriverClass(model.ID);
        if (!driverClass) {
            continue; // no active vendor with a resolvable key — not runnable, so omit
        }
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeModel>(
            BaseRealtimeModel, driverClass, GetAIAPIKey(driverClass),
        );
        out.push({ ModelID: model.ID, ModelName: model.Name ?? '', Voices: instance?.SupportedVoices ?? [] });
    }
    return out;
}

/** The DriverClass of the highest-priority Active vendor (with a resolvable API key) for a model, or null. */
function resolveRealtimeDriverClass(modelID: string): string | null {
    const vendors = AIEngine.Instance.ModelVendors
        .filter((mv) => UUIDsEqual(mv.ModelID, modelID) && mv.Status === 'Active' && mv.DriverClass != null)
        .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));
    for (const v of vendors) {
        if (GetAIAPIKey(v.DriverClass!)) {
            return v.DriverClass!;
        }
    }
    return null;
}

/** Resolves the agent entity from the engine cache by id (preferred), then by case-insensitive name. */
function resolveAgentEntity(ctx: BridgeRealtimeSessionContext): MJAIAgentEntityExtended | undefined {
    const agents = AIEngine.Instance.Agents;
    if (ctx.AgentID) {
        const byId = agents.find((a) => UUIDsEqual(a.ID, ctx.AgentID as string));
        if (byId) {
            return byId;
        }
    }
    if (ctx.AgentName) {
        const wanted = ctx.AgentName.trim().toLowerCase();
        return agents.find((a) => a.Name?.trim().toLowerCase() === wanted);
    }
    return undefined;
}
