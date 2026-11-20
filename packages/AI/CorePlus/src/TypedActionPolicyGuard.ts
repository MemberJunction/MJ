import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    AgentEntityCrudOperation,
    AgentPolicyVerdict,
    AgentUserPolicyEngine,
} from './AgentUserPolicyEngine';

/**
 * Input for checking a typed domain action's entity access against the calling agent's
 * (and any ancestor parent agent's) active `MJ: AI Agent User Policies` row.
 */
export interface TypedActionEntityGuardInput {
    /** Canonical MJ entity name (for example `'MJ_BizApps_Tasks: Tasks'`). */
    entityName: string;
    /** CRUD operation being performed by the typed action. */
    operation: AgentEntityCrudOperation;
    /** User executing the action (`params.ContextUser`). */
    contextUser: UserInfo | undefined;
    /** Optional `params.Context` object passed into `InternalRunAction` (carries `AgentID` during agent runs). */
    actionContext?: unknown;
    /** Optional metadata provider (defaults to global provider when omitted). */
    provider?: IMetadataProvider;
    /** Optional field names being written on Create/Update, checked against `FieldWriteRules`. */
    writeFields?: readonly string[];
    /** Optional record snapshot for record-level condition rules. */
    record?: Record<string, string | number | boolean | null | undefined>;
    /** Optional clock override for deterministic time-window tests. */
    now?: Date;
}

/**
 * Outcome returned by {@link TypedActionPolicyGuard.CheckEntityAccess}.
 */
export type TypedActionPolicyResultCode = 'POLICY_DENIED' | 'POLICY_DEFERRED' | 'APPROVAL_REQUIRED';

export interface TypedActionEntityGuardOutcome {
    Allowed: boolean;
    /** True when at least one active agent user policy was evaluated. */
    Active: boolean;
    /** Union of denied field patterns across all active policies in the agent ceiling chain. */
    DeniedFieldPatterns: string[];
    /** Populated when `Allowed` is `false`. */
    ResultCode?: TypedActionPolicyResultCode;
    /** Human-readable denial/deferral/approval reason when `Allowed` is `false`. */
    Message?: string;
}

const VERDICT_RANK: Record<AgentPolicyVerdict, number> = {
    Allow: 0,
    RequireApproval: 1,
    DeferUntilNextWindow: 2,
    Deny: 3,
};

function extractCallingAgentID(actionContext: unknown): string | null {
    if (!actionContext || typeof actionContext !== 'object') {
        return null;
    }
    const raw = (actionContext as { AgentID?: unknown }).AgentID;
    if (typeof raw !== 'string') {
        return null;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function verdictToResultCode(verdict: Exclude<AgentPolicyVerdict, 'Allow'>): TypedActionPolicyResultCode {
    if (verdict === 'Deny') {
        return 'POLICY_DENIED';
    }
    if (verdict === 'DeferUntilNextWindow') {
        return 'POLICY_DEFERRED';
    }
    return 'APPROVAL_REQUIRED';
}

/**
 * Shared runtime policy narrowing guard for **typed domain actions** across MJ Core and Open Apps.
 *
 * Unlike generic CRUD actions (which use `AgentDataPolicyGuard` inside `@memberjunction/core-actions`),
 * typed domain actions (such as `Create Task`, `Find Tasks`, `Record Key Result Progress`, and core
 * Chief of Staff actions) call this lightweight, browser/server-safe guard so that per-user
 * `MJ: AI Agent User Policies` (`DefaultDataAccessMode`, `EntityAccessRules`, `FieldWriteRules`,
 * `TimeWindows`, `MaskRecordFields`) remain strictly enforced even after generic CRUD is removed
 * from an agent — including across delegated sub-agent policy ceilings.
 */
export class TypedActionPolicyGuard {
    /**
     * Checks whether the currently executing agent (plus any inherited parent policy ceiling agents)
     * may perform `operation` on `entityName` for `contextUser`.
     *
     * When called outside an agent execution (direct human UI/GraphQL call with no active agent ID),
     * returns `{ Allowed: true, Active: false, DeniedFieldPatterns: [] }` immediately.
     */
    public static async CheckEntityAccess(
        input: TypedActionEntityGuardInput
    ): Promise<TypedActionEntityGuardOutcome> {
        const engine = AgentUserPolicyEngine.Instance;
        const explicitAgentId = extractCallingAgentID(input.actionContext);
        const agentChain = engine.GetEffectivePolicyAgentChain(explicitAgentId);

        if (agentChain.length === 0) {
            return { Allowed: true, Active: false, DeniedFieldPatterns: [] };
        }
        if (!input.contextUser?.ID) {
            return {
                Allowed: false,
                Active: false,
                DeniedFieldPatterns: [],
                ResultCode: 'POLICY_DENIED',
                Message: `Typed action on "${input.entityName}" requires a valid ContextUser.`,
            };
        }

        let anyPolicyActive = false;
        const deniedPatterns = new Set<string>();
        let strictestVerdict: AgentPolicyVerdict = 'Allow';
        let strictestReason = '';

        for (const agentId of agentChain) {
            let policy = engine.GetCachedPolicy(agentId, input.contextUser.ID, input.provider);
            if (!policy) {
                const lookup = await engine.ResolvePolicyForAgentAndUser(
                    agentId,
                    input.contextUser.ID,
                    input.contextUser,
                    { provider: input.provider }
                );
                if (lookup.status === 'error') {
                    return {
                        Allowed: false,
                        Active: anyPolicyActive,
                        DeniedFieldPatterns: Array.from(deniedPatterns),
                        ResultCode: 'POLICY_DENIED',
                        Message: `Policy check failed closed for "${input.entityName}": ${lookup.errorMessage}`,
                    };
                }
                policy = lookup.policy;
            }
            if (!policy) {
                continue;
            }
            anyPolicyActive = true;

            const evalResult = engine.EvaluateEntityAccess({
                entityName: input.entityName,
                operation: input.operation,
                mutatedFields: input.writeFields ? [...input.writeFields] : undefined,
                record: input.record,
                contextUser: input.contextUser,
                policy,
                provider: input.provider,
                now: input.now,
            });

            for (const pattern of evalResult.deniedFieldPatterns) {
                deniedPatterns.add(pattern);
            }

            if (VERDICT_RANK[evalResult.verdict] > VERDICT_RANK[strictestVerdict]) {
                strictestVerdict = evalResult.verdict;
                strictestReason = evalResult.reason;
            }
        }

        if (strictestVerdict !== 'Allow') {
            return {
                Allowed: false,
                Active: anyPolicyActive,
                DeniedFieldPatterns: Array.from(deniedPatterns),
                ResultCode: verdictToResultCode(strictestVerdict),
                Message: strictestReason || `Action on "${input.entityName}" (${input.operation}) blocked by agent user policy.`,
            };
        }

        return {
            Allowed: true,
            Active: anyPolicyActive,
            DeniedFieldPatterns: Array.from(deniedPatterns),
        };
    }

    /**
     * Masks fields matching `deniedFieldPatterns` on a single output object returned by a typed read action.
     */
    public static MaskRecord<T extends Record<string, string | number | boolean | object | null | undefined>>(
        record: T,
        deniedFieldPatterns: readonly string[]
    ): Partial<T> {
        if (!deniedFieldPatterns || deniedFieldPatterns.length === 0) {
            return record;
        }
        return AgentUserPolicyEngine.Instance.MaskRecordFields(record, [...deniedFieldPatterns]);
    }

    /**
     * Masks fields matching `deniedFieldPatterns` across an array of output records returned by a typed read action.
     */
    public static MaskRows<T extends Record<string, string | number | boolean | object | null | undefined>>(
        rows: readonly T[],
        deniedFieldPatterns: readonly string[]
    ): Partial<T>[] {
        if (!deniedFieldPatterns || deniedFieldPatterns.length === 0) {
            return [...rows];
        }
        return rows.map((row) => TypedActionPolicyGuard.MaskRecord(row, deniedFieldPatterns));
    }
}
