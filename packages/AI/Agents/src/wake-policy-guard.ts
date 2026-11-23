/**
 * @fileoverview Active coordination policy gating for agent wake triggers and dispatchers.
 *
 * Enforces S2-AC-1: users without an `Active` `MJ: AI Agent User Policies` row (no policy,
 * `Paused`, `Disabled`, or policy verification failure) must receive zero agent runs across all
 * scheduled and event-driven wake paths.
 *
 * All database lookups use `RunView.RunView` with `ResultType: 'simple'`, explicit `Fields`, and
 * batched `ExtraFilter` expressions so N+1 `BaseEntity` load loops are never used.
 *
 * @module @memberjunction/ai-agents
 */

import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';

/**
 * Maximum number of `(AgentID, UserID)` pair predicates combined into a single batched `ExtraFilter`.
 */
const POLICY_BATCH_CHUNK_SIZE = 40;

/**
 * Projection fields requested from `MJ: AI Agent User Policies` when using `ResultType: 'simple'`.
 */
const POLICY_SUMMARY_FIELDS: string[] = [
    'ID',
    'AgentID',
    'UserID',
    'Status',
    'AllowInterAgentCoordination',
    'EmailChannelMode',
    'Agent',
];

/**
 * Strongly-typed projection of an `MJ: AI Agent User Policies` row returned via `ResultType: 'simple'`.
 */
export interface AgentUserPolicySummary {
    ID: string;
    AgentID: string;
    UserID: string;
    Status: MJAIAgentUserPolicyEntity['Status'];
    AllowInterAgentCoordination: boolean;
    EmailChannelMode: MJAIAgentUserPolicyEntity['EmailChannelMode'];
    Agent: string | null;
}

/**
 * Identifying pair for policy lookups.
 */
export interface PolicyPairLookupKey {
    AgentID: string;
    UserID: string;
}

/**
 * Options controlling policy lookup behavior.
 */
export interface PolicyBatchLoadOptions {
    /** Optional metadata provider override for server/test environments. */
    provider?: IMetadataProvider;
    /**
     * When true, checks `AgentUserPolicyEngine.Instance.GetCachedPolicy` for cached non-null
     * entries before querying `RunView`. Set to `false` (or use `bypassCache: true`) on
     * dispatch/execution paths so mid-queue policy deactivations are observed immediately.
     */
    preferCache?: boolean;
    /** Forces a live `RunView` query even if `preferCache` is passed. */
    bypassCache?: boolean;
}

/**
 * Result of batched `MJ: AI Agent User Policies` lookup via `RunView` (`ResultType: 'simple'`).
 */
export interface PolicyBatchLoadResult {
    PoliciesByPair: Map<string, AgentUserPolicySummary>;
    LookupFailed: boolean;
    ErrorMessage: string | null;
}

/**
 * Outcome of evaluating whether an `(AgentID, UserID)` pair is authorized for wake scheduling or execution.
 */
export interface PolicyGateEvaluation {
    Allowed: boolean;
    Reason: string;
    Policy: AgentUserPolicySummary | null;
    LookupStatus: 'found' | 'not_found' | 'error';
}

/**
 * Normalizes an `(AgentID, UserID)` pair into a canonical case-insensitive map key.
 */
export function BuildPolicyPairKey(agentID: string, userID: string): string {
    return `${agentID.trim().toLowerCase()}::${userID.trim().toLowerCase()}`;
}

/**
 * Converts a loaded `MJAIAgentUserPolicyEntity` into an immutable `AgentUserPolicySummary`.
 */
export function SummarizeAgentUserPolicy(entity: MJAIAgentUserPolicyEntity): AgentUserPolicySummary {
    return {
        ID: entity.ID,
        AgentID: entity.AgentID,
        UserID: entity.UserID,
        Status: entity.Status,
        AllowInterAgentCoordination: entity.AllowInterAgentCoordination,
        EmailChannelMode: entity.EmailChannelMode ?? 'DraftOnly',
        Agent: entity.Agent ?? null,
    };
}

/**
 * Evaluates a resolved `AgentUserPolicySummary` (or absence/error) using fail-closed active-policy semantics.
 */
export function EvaluateActivePolicyFromSummary(
    policy: AgentUserPolicySummary | null,
    agentID: string,
    userID: string,
    lookupFailed: boolean = false,
    errorMessage: string | null = null
): PolicyGateEvaluation {
    if (lookupFailed) {
        return {
            Allowed: false,
            Reason: `Could not verify coordination policy for user ${userID} and agent ${agentID}: ${errorMessage ?? 'policy lookup failed'}`,
            Policy: null,
            LookupStatus: 'error',
        };
    }

    if (!policy) {
        return {
            Allowed: false,
            Reason: `User ${userID} has no active policy for agent ${agentID}.`,
            Policy: null,
            LookupStatus: 'not_found',
        };
    }

    if (policy.Status !== 'Active') {
        return {
            Allowed: false,
            Reason: `User ${userID} has ${policy.Status} policy for agent ${agentID}; only Active policies may wake.`,
            Policy: policy,
            LookupStatus: 'found',
        };
    }

    return {
        Allowed: true,
        Reason: `Active coordination policy verified for user ${userID} and agent ${agentID}.`,
        Policy: policy,
        LookupStatus: 'found',
    };
}

/**
 * Deduplicates `(AgentID, UserID)` pairs while preserving non-empty inputs.
 */
function deduplicatePairs(pairs: PolicyPairLookupKey[]): PolicyPairLookupKey[] {
    const seen = new Map<string, PolicyPairLookupKey>();
    for (const pair of pairs) {
        const agentID = pair.AgentID?.trim() ?? '';
        const userID = pair.UserID?.trim() ?? '';
        if (!agentID || !userID) {
            continue;
        }
        const key = BuildPolicyPairKey(agentID, userID);
        if (!seen.has(key)) {
            seen.set(key, { AgentID: agentID, UserID: userID });
        }
    }
    return Array.from(seen.values());
}

/**
 * Merges a fetched `AgentUserPolicySummary` row into the pair lookup map, preferring `'Active'` rows
 * if multiple records ever exist for the same `(AgentID, UserID)` pair.
 */
function recordPolicySummary(
    map: Map<string, AgentUserPolicySummary>,
    row: AgentUserPolicySummary
): void {
    if (!row.AgentID || !row.UserID) {
        return;
    }
    const key = BuildPolicyPairKey(row.AgentID, row.UserID);
    const existing = map.get(key);
    if (!existing) {
        map.set(key, row);
        return;
    }
    if (existing.Status !== 'Active' && row.Status === 'Active') {
        map.set(key, row);
    }
}

/**
 * Builds a SQL `ExtraFilter` predicate matching a chunk of `(AgentID, UserID)` pairs.
 */
function buildPolicyChunkFilter(chunk: PolicyPairLookupKey[]): string {
    const clauses = chunk.map(
        (pair) => `(AgentID = '${EscapeSQLString(pair.AgentID)}' AND UserID = '${EscapeSQLString(pair.UserID)}')`
    );
    return `(${clauses.join(' OR ')})`;
}

/**
 * Loads `MJ: AI Agent User Policies` summaries in batches using `RunView` with `ResultType: 'simple'`.
 *
 * Fail-closed: if any batch `RunView` fails or throws, `LookupFailed` is `true` so callers reject wakes.
 */
export async function LoadPoliciesForPairsBatched(
    pairs: PolicyPairLookupKey[],
    contextUser: UserInfo,
    options?: PolicyBatchLoadOptions
): Promise<PolicyBatchLoadResult> {
    const resultMap = new Map<string, AgentUserPolicySummary>();
    const uniquePairs = deduplicatePairs(pairs);
    if (uniquePairs.length === 0) {
        return { PoliciesByPair: resultMap, LookupFailed: false, ErrorMessage: null };
    }

    const useCache = options?.preferCache === true && options?.bypassCache !== true;
    const uncachedPairs: PolicyPairLookupKey[] = [];

    if (useCache) {
        const policyEngine = AgentUserPolicyEngine.Instance;
        for (const pair of uniquePairs) {
            const cached = policyEngine.GetCachedPolicy(pair.AgentID, pair.UserID);
            if (cached) {
                recordPolicySummary(resultMap, SummarizeAgentUserPolicy(cached));
            } else {
                uncachedPairs.push(pair);
            }
        }
    } else {
        uncachedPairs.push(...uniquePairs);
    }

    if (uncachedPairs.length === 0) {
        return { PoliciesByPair: resultMap, LookupFailed: false, ErrorMessage: null };
    }

    const rv = options?.provider ? RunView.FromMetadataProvider(options.provider) : new RunView();

    for (let offset = 0; offset < uncachedPairs.length; offset += POLICY_BATCH_CHUNK_SIZE) {
        const chunk = uncachedPairs.slice(offset, offset + POLICY_BATCH_CHUNK_SIZE);
        const filter = buildPolicyChunkFilter(chunk);
        try {
            const queryResult = await rv.RunView<AgentUserPolicySummary>(
                {
                    EntityName: 'MJ: AI Agent User Policies',
                    ExtraFilter: filter,
                    Fields: POLICY_SUMMARY_FIELDS,
                    ResultType: 'simple',
                },
                contextUser
            );

            if (!queryResult.Success) {
                const msg = queryResult.ErrorMessage ?? 'RunView returned Success=false for MJ: AI Agent User Policies.';
                LogError(`wake-policy-guard: batched policy lookup failed: ${msg}`);
                return { PoliciesByPair: resultMap, LookupFailed: true, ErrorMessage: msg };
            }

            const requestedKeys = new Set(chunk.map((pair) => BuildPolicyPairKey(pair.AgentID, pair.UserID)));
            const rows = queryResult.Results ?? [];
            for (const row of rows) {
                if (!row || !row.AgentID || !row.UserID) {
                    continue;
                }
                if (requestedKeys.has(BuildPolicyPairKey(row.AgentID, row.UserID))) {
                    recordPolicySummary(resultMap, {
                        ID: row.ID,
                        AgentID: row.AgentID,
                        UserID: row.UserID,
                        Status: row.Status,
                        AllowInterAgentCoordination: Boolean(row.AllowInterAgentCoordination),
                        EmailChannelMode: row.EmailChannelMode ?? 'DraftOnly',
                        Agent: row.Agent ?? null,
                    });
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`wake-policy-guard: batched policy lookup threw: ${msg}`);
            return { PoliciesByPair: resultMap, LookupFailed: true, ErrorMessage: msg };
        }
    }

    return { PoliciesByPair: resultMap, LookupFailed: false, ErrorMessage: null };
}

/**
 * Checks whether a single `(AgentID, UserID)` pair has an `Active` coordination policy.
 * Uses `RunView` with `ResultType: 'simple'` (or valid non-null cache when `preferCache: true`).
 */
export async function CheckActivePolicyForAgentAndUser(
    agentID: string,
    userID: string,
    contextUser: UserInfo,
    options?: PolicyBatchLoadOptions
): Promise<PolicyGateEvaluation> {
    if (!agentID?.trim() || !userID?.trim()) {
        return {
            Allowed: false,
            Reason: 'Both AgentID and UserID are required to verify coordination policy.',
            Policy: null,
            LookupStatus: 'not_found',
        };
    }

    const batch = await LoadPoliciesForPairsBatched(
        [{ AgentID: agentID, UserID: userID }],
        contextUser,
        options
    );
    const key = BuildPolicyPairKey(agentID, userID);
    const policy = batch.PoliciesByPair.get(key) ?? null;
    return EvaluateActivePolicyFromSummary(policy, agentID, userID, batch.LookupFailed, batch.ErrorMessage);
}

/**
 * Batch-evaluates active coordination policies for multiple `(AgentID, UserID)` pairs using one
 * batched `RunView` (`ResultType: 'simple'`) round-trip per chunk.
 */
export async function CheckActivePoliciesForBatch(
    pairs: PolicyPairLookupKey[],
    contextUser: UserInfo,
    options?: PolicyBatchLoadOptions
): Promise<Map<string, PolicyGateEvaluation>> {
    const evaluations = new Map<string, PolicyGateEvaluation>();
    const uniquePairs = deduplicatePairs(pairs);
    if (uniquePairs.length === 0) {
        return evaluations;
    }

    const batch = await LoadPoliciesForPairsBatched(uniquePairs, contextUser, options);
    for (const pair of uniquePairs) {
        const key = BuildPolicyPairKey(pair.AgentID, pair.UserID);
        const policy = batch.PoliciesByPair.get(key) ?? null;
        evaluations.set(
            key,
            EvaluateActivePolicyFromSummary(
                policy,
                pair.AgentID,
                pair.UserID,
                batch.LookupFailed,
                batch.ErrorMessage
            )
        );
    }

    return evaluations;
}
