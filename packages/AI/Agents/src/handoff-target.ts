import { LogError, UserInfo } from '@memberjunction/core';
import { MAX_HANDOFF_HOPS, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import {
    DecisionDiscoveryAgent,
    DecisionDiscoveryCatalog,
    DecisionDiscoveryRunnableAgents,
    KeepHostAllowedAgents,
} from './decision-discovery';

/**
 * Why a requested handoff target was refused.
 */
export type HandoffRefusalReason =
    | 'NotFound'
    | 'Self'
    | 'NotDiscoverable'
    | 'NotAllowedHere'
    | 'NoRunPermission'
    | 'AlreadyInThisTurn'
    | 'HopLimit';

/**
 * Details of a refused handoff target.
 */
export interface HandoffRefusal {
    Reason: HandoffRefusalReason;
    Message: string;
}

/**
 * Candidate agent entry returned on refusal.
 */
export interface HandoffCandidate {
    ID: string;
    Name: string;
}

/**
 * Inputs for {@link ResolveHandoffTarget}.
 */
export interface ResolveHandoffTargetInput<T extends DecisionDiscoveryAgent = MJAIAgentEntityExtended> {
    /** The target agent name requested by the model. */
    AgentName: string;
    /** The ID of the agent requesting the handoff. */
    SourceAgentID: string;
    /** Ordered list of agent IDs that have already handed this user turn on, oldest first. */
    HandoffChain: ReadonlyArray<string>;
    /** Optional host allow-list of agent IDs (`HostAllowedAgentIDs(data)`). */
    HostAllowedIDs?: ReadonlyArray<string>;
    /** Calling user whose view/run permissions gate target resolution and candidate discovery. */
    ContextUser: UserInfo | undefined;
    /** Agent catalog (`AIEngine.Instance.Agents`). */
    Agents: ReadonlyArray<T>;
}

/**
 * Outcome of {@link ResolveHandoffTarget}.
 */
export type ResolveHandoffTargetResult<T extends DecisionDiscoveryAgent = MJAIAgentEntityExtended> =
    | {
          /** Resolved target agent when all checks pass. */
          Target: T;
          Refusal?: undefined;
          /** Empty when target resolution succeeds. */
          Candidates: HandoffCandidate[];
      }
    | {
          Target?: undefined;
          /** Refusal reason and model-facing guidance when the target is rejected. */
          Refusal: HandoffRefusal;
          /** Sorted list of up to 20 candidate agents the source may hand off to, populated on refusal. */
          Candidates: HandoffCandidate[];
      };

/** Maximum number of candidate agent names returned on refusal. */
export const MAX_HANDOFF_CANDIDATES = 20;

/**
 * Resolves and validates a handoff target agent in deterministic order:
 * 1. `NotFound` — no Active agent with that name (trimmed, case-insensitive), or `ContextUser` lacks `'view'` permission on it.
 * 2. `Self` — the target is the source agent (`SourceAgentID`).
 * 3. `NotDiscoverable` — `!AIAgentPermissionHelper.IsDirectlyDiscoverable(target)`.
 * 4. `NotAllowedHere` — `HostAllowedIDs` is present and the target is not in it.
 * 5. `NoRunPermission` — `AIAgentPermissionHelper.HasPermission(target.ID, ContextUser, 'run')` is false or throws (fail closed).
 * 6. `AlreadyInThisTurn` — the target is already in `HandoffChain` (prevents ping-pong and longer cycles).
 * 7. `HopLimit` — `HandoffChain.length + 1 > MAX_HANDOFF_HOPS`.
 *
 * When multiple Active agents share the requested name, matches are ordered by `NormalizeUUID(ID)`
 * and checked in order, resolving to the first match that passes all checks and refusing with the
 * first match's failure reason only when none passes.
 */
export async function ResolveHandoffTarget<T extends DecisionDiscoveryAgent = MJAIAgentEntityExtended>(
    input: ResolveHandoffTargetInput<T>
): Promise<ResolveHandoffTargetResult<T>> {
    const requestedName = (input.AgentName ?? '').trim();
    const normalizedName = requestedName.toLowerCase();
    const fallbackLabel = requestedName || '(empty)';

    const matches = normalizedName.length > 0
        ? input.Agents
              .filter(a => a.Status === 'Active' && (a.Name ?? '').trim().toLowerCase() === normalizedName)
              .sort((a, b) => NormalizeUUID(a.ID).localeCompare(NormalizeUUID(b.ID)))
        : [];

    if (matches.length === 0) {
        return buildRefusal('NotFound', fallbackLabel, input);
    }

    let firstViewableFailure: { reason: HandoffRefusalReason; label: string } | undefined;

    for (const target of matches) {
        const canView = await checkPermissionFailClosed(target.ID, input.ContextUser, 'view');
        if (!canView) {
            continue;
        }

        const targetLabel = target.Name ?? fallbackLabel;

        if (UUIDsEqual(target.ID, input.SourceAgentID)) {
            firstViewableFailure ??= { reason: 'Self', label: targetLabel };
            continue;
        }

        if (!AIAgentPermissionHelper.IsDirectlyDiscoverable(target)) {
            firstViewableFailure ??= { reason: 'NotDiscoverable', label: targetLabel };
            continue;
        }

        if (input.HostAllowedIDs !== undefined) {
            const allowed = KeepHostAllowedAgents([target], input.HostAllowedIDs);
            if (allowed.length === 0) {
                firstViewableFailure ??= { reason: 'NotAllowedHere', label: targetLabel };
                continue;
            }
        }

        const canRun = await checkPermissionFailClosed(target.ID, input.ContextUser, 'run');
        if (!canRun) {
            firstViewableFailure ??= { reason: 'NoRunPermission', label: targetLabel };
            continue;
        }

        const inChain = input.HandoffChain.some(chainId => UUIDsEqual(chainId, target.ID));
        if (inChain) {
            firstViewableFailure ??= { reason: 'AlreadyInThisTurn', label: targetLabel };
            continue;
        }

        if (input.HandoffChain.length + 1 > MAX_HANDOFF_HOPS) {
            firstViewableFailure ??= { reason: 'HopLimit', label: targetLabel };
            continue;
        }

        return {
            Target: target,
            Candidates: [],
        };
    }

    const refusal = firstViewableFailure ?? { reason: 'NotFound' as const, label: fallbackLabel };
    return buildRefusal(refusal.reason, refusal.label, input);
}

async function checkPermissionFailClosed(
    agentId: string,
    user: UserInfo | undefined,
    permission: 'view' | 'run'
): Promise<boolean> {
    if (!user) {
        return false;
    }
    try {
        return await AIAgentPermissionHelper.HasPermission(agentId, user, permission);
    } catch (error) {
        LogError(
            `ResolveHandoffTarget: Failed to check '${permission}' permission for agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
        );
        return false;
    }
}

async function computeHandoffCandidates<T extends DecisionDiscoveryAgent>(
    input: ResolveHandoffTargetInput<T>
): Promise<HandoffCandidate[]> {
    if (!input.ContextUser) {
        return [];
    }
    try {
        const runnable = await DecisionDiscoveryRunnableAgents([...input.Agents], input.ContextUser);
        const discoverable = DecisionDiscoveryCatalog(runnable, input.SourceAgentID);
        const hostAllowed = KeepHostAllowedAgents(discoverable, input.HostAllowedIDs);
        const chainSet = new Set(input.HandoffChain.map(id => NormalizeUUID(id)));
        return hostAllowed
            .filter(a => !chainSet.has(NormalizeUUID(a.ID)))
            .map(a => ({ ID: a.ID, Name: a.Name ?? '' }))
            .sort((a, b) => a.Name.localeCompare(b.Name))
            .slice(0, MAX_HANDOFF_CANDIDATES);
    } catch (error) {
        LogError(
            `ResolveHandoffTarget: Failed to compute handoff candidates for agent ${input.SourceAgentID}: ${error instanceof Error ? error.message : String(error)}`
        );
        return [];
    }
}

async function buildRefusal<T extends DecisionDiscoveryAgent>(
    reason: HandoffRefusalReason,
    targetLabel: string,
    input: ResolveHandoffTargetInput<T>
): Promise<ResolveHandoffTargetResult<T>> {
    const candidates = await computeHandoffCandidates(input);
    const candidateNames = candidates.map(c => c.Name).join(', ');
    const nextAction = candidates.length > 0
        ? `Hand off to one of: ${candidateNames}, or call Find Candidate Agents.`
        : 'Call Find Candidate Agents, or answer the user yourself.';

    const message = formatRefusalMessage(reason, targetLabel, nextAction);
    return {
        Refusal: {
            Reason: reason,
            Message: message,
        },
        Candidates: candidates,
    };
}

function formatRefusalMessage(reason: HandoffRefusalReason, targetLabel: string, nextAction: string): string {
    switch (reason) {
        case 'NotFound':
            return `Agent '${targetLabel}' not found or not active. ${nextAction}`;
        case 'Self':
            return `You cannot hand off the conversation to yourself (${targetLabel}). ${nextAction}`;
        case 'NotDiscoverable':
            return `${targetLabel} can't be reached directly via Handoff (it is a sub-agent or child agent). ${nextAction}`;
        case 'NotAllowedHere':
            return `${targetLabel} is not available in this host environment. ${nextAction}`;
        case 'NoRunPermission':
            return `The current user does not have permission to run ${targetLabel}. ${nextAction}`;
        case 'AlreadyInThisTurn':
            return `${targetLabel} has already participated in this turn and cannot be handed back to in the same turn. Answer the user yourself.`;
        case 'HopLimit':
            return `The maximum handoff limit (${MAX_HANDOFF_HOPS} hops) for this turn has been reached; cannot hand off to ${targetLabel}. Answer the user yourself.`;
    }
}
