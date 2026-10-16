import { UserInfo } from '@memberjunction/core';
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
    /** Calling user whose run permission gates target resolution and candidate discovery. */
    ContextUser: UserInfo | undefined;
    /** Agent catalog (`AIEngine.Instance.Agents`). */
    Agents: ReadonlyArray<T>;
}

/**
 * Outcome of {@link ResolveHandoffTarget}.
 */
export interface ResolveHandoffTargetResult<T extends DecisionDiscoveryAgent = MJAIAgentEntityExtended> {
    /** Resolved target agent when all checks pass. */
    Target?: T;
    /** Refusal reason and model-facing guidance when the target is rejected. */
    Refusal?: HandoffRefusal;
    /** Sorted list of up to 20 candidate agents the source may hand off to, populated on refusal. */
    Candidates: HandoffCandidate[];
}

/** Maximum number of candidate agent names returned on refusal. */
export const MAX_HANDOFF_CANDIDATES = 20;

/**
 * Resolves and validates a handoff target agent in deterministic order:
 * 1. `NotFound` — no Active agent with that name (trimmed, case-insensitive).
 * 2. `Self` — the target is the source agent (`SourceAgentID`).
 * 3. `NotDiscoverable` — `!AIAgentPermissionHelper.IsDirectlyDiscoverable(target)`.
 * 4. `NotAllowedHere` — `HostAllowedIDs` is present and the target is not in it.
 * 5. `NoRunPermission` — `AIAgentPermissionHelper.HasPermission(target.ID, ContextUser, 'run')` is false or throws (fail closed).
 * 6. `AlreadyInThisTurn` — the target is already in `HandoffChain` (prevents ping-pong and longer cycles).
 * 7. `HopLimit` — `HandoffChain.length + 1 > MAX_HANDOFF_HOPS`.
 *
 * At most one handoff per user turn per source is enforced naturally because a successful Handoff
 * ends the source agent's run (`FinalStep: 'Success'`) and `SourceAgentID` is appended to `HandoffChain`.
 */
export async function ResolveHandoffTarget<T extends DecisionDiscoveryAgent = MJAIAgentEntityExtended>(
    input: ResolveHandoffTargetInput<T>
): Promise<ResolveHandoffTargetResult<T>> {
    const requestedName = (input.AgentName ?? '').trim();
    const normalizedName = requestedName.toLowerCase();

    const target = normalizedName.length > 0
        ? input.Agents.find(a => a.Status === 'Active' && (a.Name ?? '').trim().toLowerCase() === normalizedName)
        : undefined;

    if (!target) {
        return buildRefusal('NotFound', requestedName || '(empty)', input);
    }

    if (UUIDsEqual(target.ID, input.SourceAgentID)) {
        return buildRefusal('Self', target.Name, input);
    }

    if (!AIAgentPermissionHelper.IsDirectlyDiscoverable(target)) {
        return buildRefusal('NotDiscoverable', target.Name, input);
    }

    if (input.HostAllowedIDs !== undefined) {
        const allowed = KeepHostAllowedAgents([target], input.HostAllowedIDs);
        if (allowed.length === 0) {
            return buildRefusal('NotAllowedHere', target.Name, input);
        }
    }

    const canRun = await checkRunPermissionFailClosed(target.ID, input.ContextUser);
    if (!canRun) {
        return buildRefusal('NoRunPermission', target.Name, input);
    }

    const inChain = input.HandoffChain.some(chainId => UUIDsEqual(chainId, target.ID));
    if (inChain) {
        return buildRefusal('AlreadyInThisTurn', target.Name, input);
    }

    if (input.HandoffChain.length + 1 > MAX_HANDOFF_HOPS) {
        return buildRefusal('HopLimit', target.Name, input);
    }

    return {
        Target: target,
        Candidates: [],
    };
}

async function checkRunPermissionFailClosed(agentId: string, user: UserInfo | undefined): Promise<boolean> {
    if (!user) {
        return false;
    }
    try {
        return await AIAgentPermissionHelper.HasPermission(agentId, user, 'run');
    } catch {
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
    } catch {
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
