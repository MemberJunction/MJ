/**
 * @fileoverview The ONE implementation of two decisions every realtime host must make identically:
 *
 * 1. **Which co-agent voices a target agent** ({@link ResolveRealtimeCoAgentID}) — the metadata-driven
 *    resolution chain. The browser (client-direct) resolver and every server-bridged host (LiveKit, the
 *    telephony services) call this, so a phone call is voiced by the same co-agent, with the same persona
 *    and config cascade, as a call placed from the browser.
 * 2. **Which colleague agents the caller may reach** ({@link FilterAllowedAgentsByCanRun}) — a session's
 *    delegation set narrowed to the agents the run-as user has `CanRun` on.
 *
 * It lives in `@memberjunction/ai-agents` (which both `@memberjunction/server` and
 * `@memberjunction/telephony-adapters` already depend on) so neither has to re-implement it.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { IMetadataProvider, LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIAgentPermissionHelper, AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { RealtimeAllowedAgent } from './realtime-coagent-config';

/**
 * The seeded name of the internal orchestration agent that fronts a target agent in realtime sessions. This is
 * the GLOBAL DEFAULT co-agent — the final step of the resolution chain. Deployments override it per agent
 * (`AIAgent.DefaultCoAgentID`), per agent type (an `AIAgentCoAgent` row with `TargetAgentTypeID` + `IsDefault`),
 * or per call (the explicit co-agent argument) without touching this seed.
 */
export const REALTIME_CO_AGENT_NAME = 'Realtime Co-Agent';

/**
 * DEPRECATED legacy seed name of {@link REALTIME_CO_AGENT_NAME}, from before the rename from "Voice Co-Agent".
 * Deployments that have not re-synced the agent seed still carry it, so the global step falls back to it.
 */
export const LEGACY_REALTIME_CO_AGENT_NAME = 'Voice Co-Agent';

/** The seeded name of the Realtime agent TYPE. Every co-agent candidate must be an Active agent of this type. */
export const REALTIME_AGENT_TYPE_NAME = 'Realtime';

/**
 * Resolves the co-agent (the Realtime-type agent that voices the target agent) via the metadata-driven
 * **co-agent resolution chain** — first match wins:
 *
 * 1. **Explicit** — `explicitCoAgentID`. A per-call override; an invalid candidate **throws** (the caller asked
 *    for something specific, so there is no silent fallback).
 * 2. **Per-agent persona** — the target agent's `DefaultCoAgentID`. An invalid reference logs and **falls
 *    through** (stale metadata must degrade, never break live calls).
 * 3. **Per-type default** — an Active `AIAgentCoAgent` row of Type `'CoAgent'` whose `TargetAgentTypeID` is the
 *    target's type (`IsDefault` first, then lowest `Sequence`). Same tolerant semantics as step 2.
 * 4. **Global default** — the seeded {@link REALTIME_CO_AGENT_NAME} agent (with a deprecated fallback to
 *    {@link LEGACY_REALTIME_CO_AGENT_NAME}). Throws when absent: realtime is unconfigured in this deployment.
 *
 * Every candidate from steps 1–3 must exist, be `Active`, and be of the {@link REALTIME_AGENT_TYPE_NAME} type.
 *
 * @param targetAgentID The agent the co-agent will voice (drives steps 2–3).
 * @param explicitCoAgentID The explicit co-agent choice, when supplied (step 1).
 * @param contextUser The user the metadata reads run as.
 * @param provider The request-scoped metadata provider.
 * @returns The resolved co-agent's id (canonical casing from the metadata cache).
 * @throws When an explicit candidate is invalid, or no co-agent is configured at all.
 */
export async function ResolveRealtimeCoAgentID(
    targetAgentID: string | undefined,
    explicitCoAgentID: string | undefined,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<string> {
    await AIEngine.Instance.Config(false, contextUser, provider);

    if (explicitCoAgentID) {
        const { agent, problem } = FindValidCoAgent(explicitCoAgentID);
        if (!agent) {
            throw new Error(`Invalid coAgentId '${explicitCoAgentID}': ${problem}`);
        }
        return agent.ID;
    }

    const targetAgent = targetAgentID ? (AIEngine.Instance.Agents ?? []).find((a) => UUIDsEqual(a.ID, targetAgentID)) : undefined;

    const fromAgent = ResolveMetadataDefault(targetAgent?.DefaultCoAgentID, `agent '${targetAgent?.Name}' (DefaultCoAgentID)`);
    if (fromAgent) {
        return fromAgent;
    }

    const agentType = targetAgent?.TypeID ? (AIEngine.Instance.AgentTypes ?? []).find((t) => UUIDsEqual(t.ID, targetAgent.TypeID)) : undefined;
    const typeDefault = agentType ? await FindTypeDefaultCoAgentID(agentType.ID, contextUser, provider) : undefined;
    const fromType = ResolveMetadataDefault(typeDefault, `agent type '${agentType?.Name}' (AIAgentCoAgent type-default row)`);
    if (fromType) {
        return fromType;
    }

    return ResolveGlobalCoAgentID();
}

/**
 * Narrows a session's colleague union (`allowedAgents`) to the agents the CALLER may run.
 *
 * The lead target is gated at session start, but the union it travels with is not — a model-named colleague
 * resolves straight to a delegated run. Once a run's user is elevated (a scoped anonymous caller, an
 * unattended telephony run-as user) the run's own `CanRun` check sees that principal, so this is the one place
 * the caller's own authority is applied to a colleague. It therefore runs for EVERY host.
 *
 * **Which user each host passes** (so nobody "fixes" the telephony case later — it is correct as written):
 * the principal is whoever the session runs as, i.e. the one whose authority the colleagues may use.
 * - browser: the signed-in user;
 * - LiveKit bridge: the user who started the session;
 * - telephony inbound: the configured `telephony.inboundRunAsUserEmail` user (a phone caller has no MJ identity of
 *   their own, so the dedicated least-privilege run-as user IS the principal);
 * - telephony outbound: the user who placed the call.
 *
 * `HasPermission` reads in-memory caches and fails closed on error, so an unresolvable agent drops OUT of the
 * union rather than becoming runnable. A filtered-out colleague is not an error: the delegation layer reports it
 * as "not available in this session", the same answer the model gets for a typo.
 *
 * @param allowedAgents The session's colleague union (absent/empty means single-target).
 * @param contextUser The ORIGINAL caller — never an elevated run user.
 * @returns The subset the caller may run, preserving order.
 */
export async function FilterAllowedAgentsByCanRun(
    allowedAgents: RealtimeAllowedAgent[] | undefined,
    contextUser: UserInfo,
): Promise<RealtimeAllowedAgent[] | undefined> {
    if (!allowedAgents || allowedAgents.length === 0) {
        return allowedAgents;
    }
    const verdicts = await Promise.all(allowedAgents.map((a) => AIAgentPermissionHelper.HasPermission(a.agentId, contextUser, 'run')));
    return allowedAgents.filter((_, i) => verdicts[i]);
}

/**
 * Validates a co-agent candidate against {@link AIEngine}'s cached metadata. Returns the cached agent, or a
 * human-readable `problem` — the CALLER decides whether that is fatal (explicit) or tolerated (metadata default).
 */
export function FindValidCoAgent(candidateID: string): { agent?: MJAIAgentEntityExtended; problem?: string } {
    const agent = (AIEngine.Instance.Agents ?? []).find((a) => UUIDsEqual(a.ID, candidateID));
    if (!agent) {
        return { problem: 'no agent with that ID exists.' };
    }
    if (agent.Status !== 'Active') {
        return { problem: `agent '${agent.Name}' is not Active (Status: ${agent.Status}).` };
    }
    const realtimeType = (AIEngine.Instance.AgentTypes ?? []).find((t) => t.Name?.trim().toLowerCase() === REALTIME_AGENT_TYPE_NAME.toLowerCase());
    if (!realtimeType) {
        return { problem: `the '${REALTIME_AGENT_TYPE_NAME}' agent type is not configured in this deployment.` };
    }
    if (!agent.TypeID || !UUIDsEqual(agent.TypeID, realtimeType.ID)) {
        return { problem: `agent '${agent.Name}' is not of the '${REALTIME_AGENT_TYPE_NAME}' agent type.` };
    }
    return { agent };
}

/**
 * Validates one metadata-level co-agent default (chain steps 2/3): the id when valid; logs and returns `null`
 * (caller falls through) when set but invalid; `null` silently when absent.
 */
function ResolveMetadataDefault(candidateID: string | null | undefined, source: string): string | null {
    if (!candidateID) {
        return null;
    }
    const { agent, problem } = FindValidCoAgent(candidateID);
    if (agent) {
        return agent.ID;
    }
    LogError(
        `Realtime co-agent resolution: ignoring co-agent default '${candidateID}' from ${source} — ${problem} ` +
            'Falling through to the next step of the co-agent resolution chain.',
    );
    return null;
}

/**
 * Chain step 3 lookup: the TYPE-LEVEL default co-agent for an agent type — the Active `AIAgentCoAgent` row of
 * Type `'CoAgent'` whose `TargetAgentTypeID` matches, `IsDefault` first, lowest `Sequence` breaking ties. Reads
 * the provider-scoped {@link AIEngineBase} cache. Tolerant: a failed read logs and returns `undefined`.
 */
async function FindTypeDefaultCoAgentID(agentTypeID: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string | undefined> {
    try {
        const engine = AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
        await engine.Config(false, contextUser, provider);
        const candidates = (engine.AgentCoAgents ?? [])
            .filter((r) => r.Type === 'CoAgent' && r.Status === 'Active' && r.TargetAgentTypeID != null && UUIDsEqual(r.TargetAgentTypeID, agentTypeID))
            .sort((a, b) => (a.IsDefault === b.IsDefault ? 0 : a.IsDefault ? -1 : 1) || (a.Sequence ?? 0) - (b.Sequence ?? 0));
        return candidates[0]?.CoAgentID;
    } catch (error) {
        LogError(
            `Realtime co-agent resolution: MJ: AI Agent Co Agents cache read failed while resolving the type-level default ` +
                `co-agent for agent type ${agentTypeID} (${(error as Error).message}) — falling through.`,
        );
        return undefined;
    }
}

/** Chain step 4: the seeded Realtime Co-Agent by name, with the deprecated pre-rename fallback. */
function ResolveGlobalCoAgentID(): string {
    const coAgent = FindAgentByName(REALTIME_CO_AGENT_NAME);
    if (coAgent) {
        return coAgent.ID;
    }
    const legacy = FindAgentByName(LEGACY_REALTIME_CO_AGENT_NAME);
    if (legacy) {
        LogStatus(
            `Realtime co-agent resolution: resolved the global co-agent via its DEPRECATED legacy name ` +
                `'${LEGACY_REALTIME_CO_AGENT_NAME}'. Re-sync the agent seed metadata to rename it to '${REALTIME_CO_AGENT_NAME}'.`,
        );
        return legacy.ID;
    }
    throw new Error(`The '${REALTIME_CO_AGENT_NAME}' agent is not configured; cannot start a realtime voice session.`);
}

/** Case/whitespace-insensitive agent lookup by Name in {@link AIEngine}'s cached agents. */
function FindAgentByName(name: string): MJAIAgentEntityExtended | undefined {
    const wanted = name.toLowerCase();
    return (AIEngine.Instance.Agents ?? []).find((a) => a.Name?.trim().toLowerCase() === wanted);
}
