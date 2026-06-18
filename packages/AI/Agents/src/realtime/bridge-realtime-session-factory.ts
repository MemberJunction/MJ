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

import { IRealtimeSession, ChatMessage } from '@memberjunction/ai';
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
    /** The transport endpoint being joined (room/meeting/number) — informational here; not required. */
    RoomName?: string;
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
    });
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
