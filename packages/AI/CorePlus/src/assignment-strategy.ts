/**
 * @fileoverview Assignment Strategy for Agent Feedback Requests
 *
 * Defines how agent feedback requests are routed to users. Strategies are
 * configured as JSON blobs at multiple levels (RequestType, Category, AgentType,
 * per-run) and resolved bottom-up with first-non-null-wins semantics.
 *
 * @since 5.12.0
 */

/**
 * How to pick a user from a List when using List-based assignment.
 *
 * - `RoundRobin` — Rotate through list members in `Sequence` order, tracking
 *   last-assigned index in `ListDetail.AdditionalData`.
 * - `LeastBusy` — Assign to the member with the fewest pending (Requested) requests.
 * - `Random` — Pick a random active member from the list.
 */
export type ListAssignmentMode = 'RoundRobin' | 'LeastBusy' | 'Random';

/**
 * Configures how agent feedback requests are assigned to users.
 *
 * This interface is stored as a JSON blob in:
 * - `AIAgentRequestType.DefaultAssignmentStrategy` (broadest default)
 * - `AIAgentCategory.AssignmentStrategy` (category-level override)
 * - `AIAgentType.AssignmentStrategy` (agent-type-level override)
 * - `ExecuteAgentParams.assignmentStrategy` (per-invocation override, highest precedence)
 *
 * Resolution walks bottom-up: params → agentType → category (tree walk) → requestType → fallback.
 */
export interface AgentRequestAssignmentStrategy {
    /**
     * How to resolve the assignee.
     *
     * - `RunUser` — The user who triggered the agent run (`contextUser`).
     * - `AgentOwner` — The agent's `OwnerUserID`.
     * - `SpecificUser` — A hardcoded user (set `userID`).
     * - `List` — Pick from an MJ List of Users using `listStrategy`.
     * - `SharedInbox` — Leave unassigned; any member of the `listID` can claim it.
     */
    type: 'RunUser' | 'AgentOwner' | 'SpecificUser' | 'List' | 'SharedInbox';

    /** For `type='SpecificUser'` — the user to assign requests to. */
    userID?: string;

    /**
     * For `type='List'` or `type='SharedInbox'` — the MJ List ID containing
     * Users entity records. The list's `EntityID` must point to the Users entity.
     */
    listID?: string;

    /** For `type='List'` — how to pick from the list. Defaults to `'RoundRobin'`. */
    listStrategy?: ListAssignmentMode;

    /** Override default priority (1-100) for requests created under this strategy. */
    priority?: number;

    /** Override default expiration in minutes for requests created under this strategy. */
    expirationMinutes?: number;
}

/**
 * Merges two strategy objects, preferring non-null values from `override`.
 * Used when walking the resolution chain to layer overrides on top of defaults.
 */
export function mergeAssignmentStrategies(
    base: AgentRequestAssignmentStrategy | null | undefined,
    override: AgentRequestAssignmentStrategy | null | undefined
): AgentRequestAssignmentStrategy | null {
    if (!override && !base) return null;
    if (!override) return base!;
    if (!base) return override;

    // Override wins for all defined fields; base provides fallback
    return {
        type: override.type ?? base.type,
        userID: override.userID ?? base.userID,
        listID: override.listID ?? base.listID,
        listStrategy: override.listStrategy ?? base.listStrategy,
        priority: override.priority ?? base.priority,
        expirationMinutes: override.expirationMinutes ?? base.expirationMinutes,
    };
}

/**
 * Parses a JSON string into an `AgentRequestAssignmentStrategy`, returning null
 * if the input is null, undefined, empty, or invalid JSON.
 */
export function parseAssignmentStrategy(json: string | null | undefined): AgentRequestAssignmentStrategy | null {
    if (!json || json.trim().length === 0) return null;
    try {
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === 'object' && 'type' in parsed) {
            return parsed as AgentRequestAssignmentStrategy;
        }
        return null;
    } catch {
        return null;
    }
}
