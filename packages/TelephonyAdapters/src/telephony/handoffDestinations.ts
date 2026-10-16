/**
 * @fileoverview Turns a named entry of the transfer directory into a resolved destination the room handoff engine can act
 * on, at the moment the agent asks to transfer.
 *
 * The directory (`telephony.transferTargets`) holds names, emails and agent names, and is validated when the server starts.
 * What it cannot know until a call is live is whether the person still exists and is active, whether the agent exists and
 * the call's run-as user may run it, and whether a number still passes the outbound policy. Those are checked here, every
 * time, because the answers change while the server runs and because the model (and so an unverified caller) is the one
 * choosing which entry to ask for.
 *
 * Every refusal message is safe to hand back to the model: it says a destination is unavailable without saying why in a
 * way that exposes configuration.
 *
 * @module @memberjunction/telephony-adapters
 */

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { HandoffDestination } from '@memberjunction/livekit-room-server';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { CheckTransferDestination, CanUserRunAgent, type OutboundCallPolicy, type TransferTarget } from './outboundCallPolicy.js';
import { UserCacheDirectory, type RunAsUserDirectory } from './runAsIdentity.js';

/** An agent found by name. */
export interface FoundAgent {
    ID: string;
    Name: string;
}

/** What destination resolution reads. All optional: production defaults are used when absent. */
export interface HandoffDestinationDeps {
    /** The outbound policy a number (or a fallback number) is checked against. */
    Policy: OutboundCallPolicy;
    /** User lookups (defaults to the process-wide user cache). */
    Directory?: RunAsUserDirectory;
    /** Finds an active agent by name (defaults to the AI engine's agent cache). */
    FindAgentByName?: (name: string, user: UserInfo, provider: IMetadataProvider) => Promise<FoundAgent | undefined>;
    /** Whether the user may run the agent (defaults to the agent permission check the browser path applies). */
    CanRunAgent?: (agentId: string, user: UserInfo) => Promise<boolean>;
}

/** The outcome of resolving a directory entry. */
export type ResolvedDestination = { Ok: true; Destination: HandoffDestination } | { Ok: false; Error: string };

/** The context the resolution runs in: the call's run-as user and provider. */
export interface HandoffResolutionContext {
    User: UserInfo;
    Provider: IMetadataProvider;
}

/** Finds an ACTIVE agent by name (case-insensitive) in the AI engine's cache. */
export async function FindActiveAgentByName(name: string, user: UserInfo, provider: IMetadataProvider): Promise<FoundAgent | undefined> {
    await AIEngineBase.Instance.Config(false, user, provider);
    const wanted = (name ?? '').trim().toLowerCase();
    const agent = AIEngineBase.Instance.Agents.find((a) => a.Status === 'Active' && (a.Name ?? '').trim().toLowerCase() === wanted);
    return agent ? { ID: agent.ID, Name: agent.Name ?? name } : undefined;
}

/** The display name of an agent by id, or `undefined` when it is not in the cache. */
export async function FindAgentNameByID(agentID: string, user: UserInfo, provider: IMetadataProvider): Promise<string | undefined> {
    await AIEngineBase.Instance.Config(false, user, provider);
    const wanted = (agentID ?? '').toLowerCase();
    return AIEngineBase.Instance.Agents.find((a) => a.ID.toLowerCase() === wanted)?.Name ?? undefined;
}

/**
 * Resolves one directory entry to a destination, checking everything that can change while the server runs. Never throws.
 */
export async function ResolveHandoffDestination(
    target: TransferTarget,
    context: HandoffResolutionContext,
    deps: HandoffDestinationDeps,
): Promise<ResolvedDestination> {
    switch (target.Kind) {
        case 'number':
            return resolveNumber(target.Number, target.Name, deps.Policy);
        case 'user':
            return resolveUser(target, deps);
        case 'agent':
            return resolveAgent(target.AgentName, context, deps);
    }
}

function resolveNumber(number: string, displayName: string, policy: OutboundCallPolicy): ResolvedDestination {
    const verdict = CheckTransferDestination(policy, number);
    if (!verdict.Allowed) {
        return { Ok: false, Error: verdict.Reason };
    }
    return { Ok: true, Destination: { Kind: 'number', Number: verdict.Number, DisplayName: displayName } };
}

function resolveUser(target: Extract<TransferTarget, { Kind: 'user' }>, deps: HandoffDestinationDeps): ResolvedDestination {
    const user = (deps.Directory ?? UserCacheDirectory).FindByEmail(target.UserEmail);
    if (!user || !user.IsActive) {
        return { Ok: false, Error: `${target.Name} is not available.` };
    }
    if (!target.FallbackNumber) {
        return { Ok: true, Destination: { Kind: 'user', UserID: user.ID, DisplayName: target.Name } };
    }
    const fallback = CheckTransferDestination(deps.Policy, target.FallbackNumber);
    if (!fallback.Allowed) {
        return { Ok: false, Error: fallback.Reason };
    }
    return { Ok: true, Destination: { Kind: 'user', UserID: user.ID, DisplayName: target.Name, FallbackNumber: fallback.Number } };
}

async function resolveAgent(agentName: string, context: HandoffResolutionContext, deps: HandoffDestinationDeps): Promise<ResolvedDestination> {
    const find = deps.FindAgentByName ?? FindActiveAgentByName;
    const agent = await find(agentName, context.User, context.Provider);
    if (!agent) {
        return { Ok: false, Error: `${agentName} is not available.` };
    }
    const canRun = deps.CanRunAgent ?? CanUserRunAgent;
    if (!(await canRun(agent.ID, context.User))) {
        return { Ok: false, Error: `${agentName} is not available.` };
    }
    return { Ok: true, Destination: { Kind: 'agent', AgentID: agent.ID, AgentName: agent.Name } };
}
