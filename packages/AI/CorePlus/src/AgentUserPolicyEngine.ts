/**
 * @fileoverview Engine for loading and evaluating per-(Agent, User) governance policies
 * (`MJ: AI Agent User Policies` / `__mj.AIAgentUserPolicy`).
 *
 * Architectural invariant:
 * - The owning user's MJ permissions (`contextUser` entity CRUD permissions, Role RLS, Role FLS)
 *   are ALWAYS the hard ceiling.
 * - `MJAIAgentUserPolicyEntity` can only NARROW what the agent is permitted to do on that user's
 *   behalf: restricting entity CRUD, adding SQL/expression RLS filters, masking or write-protecting
 *   FLS fields, enforcing time-of-day / day-of-week windows, and gating actions behind
 *   `MJ: AI Agent Requests` approvals.
 *
 * @module @memberjunction/ai-core-plus
 */

import { IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentUserPolicyEntity,
    MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule,
    MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule,
} from '@memberjunction/core-entities';
import {
    BaseSingleton,
    SafeExpressionEvaluator,
    SafeJSONParse,
    SQLExpressionValidator,
    UUIDsEqual,
} from '@memberjunction/global';

/**
 * Type of a time window rule derived from `MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule`.
 */
export type AgentPolicyTimeWindow = NonNullable<
    MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule['timeWindows']
>[number];

/**
 * Verdict returned by `AgentUserPolicyEngine` when evaluating an entity operation or action invocation.
 */
export type AgentPolicyVerdict = 'Allow' | 'RequireApproval' | 'Deny' | 'DeferUntilNextWindow';

/**
 * CRUD operation types evaluated against entity access policies.
 */
export type AgentEntityCrudOperation = 'Read' | 'Create' | 'Update' | 'Delete';

/**
 * Optional explicit user permission flags for an entity (auto-resolved from `Metadata` when omitted).
 */
export interface UserEntityPermissionCeiling {
    canRead: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
}

/**
 * Input parameters for evaluating entity access under a user's agent policy.
 */
export interface EvaluateEntityAccessInput {
    entityName: string;
    operation: AgentEntityCrudOperation;
    contextUser: UserInfo;
    policy: MJAIAgentUserPolicyEntity | null;
    /** Optional record values for Tier 1 `recordConditionExpression` evaluation. */
    record?: Record<string, string | number | boolean | null | undefined>;
    /** Optional field names being written on Create or Update. */
    mutatedFields?: string[];
    /** Optional explicit permission ceiling override for unit testing without global Metadata. */
    userPermissionCeiling?: UserEntityPermissionCeiling;
    /** Optional metadata provider (falls back to global Metadata when omitted). */
    provider?: IMetadataProvider;
    /** Evaluation timestamp (defaults to `new Date()`). */
    now?: Date;
}

/**
 * Detailed result of evaluating an entity access request against the user's ceiling + agent policy.
 */
export interface EntityAccessEvaluationResult {
    verdict: AgentPolicyVerdict;
    reason: string;
    /** Additional SQL WHERE clause (validated via `SQLExpressionValidator`) to AND with user RLS. */
    combinedRlsWhereClause: string | null;
    /** Reusable `MJ: Row Level Security Filters` IDs referenced by matching rules. */
    rlsFilterIds: string[];
    /** Field patterns that must be stripped from read results and blocked from writes. */
    deniedFieldPatterns: string[];
    /** Field patterns that are readable but blocked from Create/Update mutations. */
    readOnlyFieldPatterns: string[];
    /** Field patterns whose mutation requires explicit user approval via `AIAgentRequest`. */
    requireApprovalFieldPatterns: string[];
    /** Next allowed window start timestamp (ISO-8601) when `verdict === 'DeferUntilNextWindow'`. */
    nextWindowStartISO: string | null;
}

/**
 * Input parameters for evaluating an action execution under a user's agent policy.
 */
export interface EvaluateActionExecutionInput {
    actionName: string;
    params?: Record<string, string | number | boolean | object | null | undefined>;
    contextUser: UserInfo;
    policy: MJAIAgentUserPolicyEntity | null;
    /** Optional flag indicating the action communicates with external (non-org) recipients. */
    isExternalCommunication?: boolean;
    /** Optional monetary amount associated with the action. */
    financialAmount?: number | null;
    /** Optional flag indicating the action deletes data or cancels workflows. */
    isDestructive?: boolean;
    /** Evaluation timestamp (defaults to `new Date()`). */
    now?: Date;
}

/**
 * Detailed result of evaluating an action execution against the user's agent policy.
 */
export interface ActionPolicyEvaluationResult {
    verdict: AgentPolicyVerdict;
    reason: string;
    matchedRulePattern: string | null;
    nextWindowStartISO: string | null;
}

const DAY_NAMES: ReadonlyArray<'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'> = [
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
];

/**
 * Singleton engine that loads and evaluates `MJ: AI Agent User Policies` records.
 */
export class AgentUserPolicyEngine extends BaseSingleton<AgentUserPolicyEngine> {
    private readonly expressionEvaluator = new SafeExpressionEvaluator();
    private readonly policyCache = new Map<string, MJAIAgentUserPolicyEntity>();

    public constructor() {
        super();
    }

    public static get Instance(): AgentUserPolicyEngine {
        return AgentUserPolicyEngine.getInstance<AgentUserPolicyEngine>();
    }

    /** Build a canonical cache key for an `(agentId, userId)` pair. */
    private buildCacheKey(agentId: string, userId: string): string {
        return `${agentId.trim().toLowerCase()}::${userId.trim().toLowerCase()}`;
    }

    /** Put or update a policy entity in the in-memory cache. */
    public SetCachedPolicy(policy: MJAIAgentUserPolicyEntity): void {
        if (policy.AgentID && policy.UserID) {
            this.policyCache.set(this.buildCacheKey(policy.AgentID, policy.UserID), policy);
        }
    }

    /** Synchronously retrieve a cached policy for `(agentId, userId)` if loaded. */
    public GetCachedPolicy(agentId: string, userId: string): MJAIAgentUserPolicyEntity | null {
        if (!agentId || !userId) {
            return null;
        }
        return this.policyCache.get(this.buildCacheKey(agentId, userId)) ?? null;
    }

    /** Clear all cached policies (or a single `(agentId, userId)` pair). */
    public ClearCache(agentId?: string, userId?: string): void {
        if (agentId && userId) {
            this.policyCache.delete(this.buildCacheKey(agentId, userId));
            return;
        }
        this.policyCache.clear();
    }

    /**
     * Load the active/configured `MJAIAgentUserPolicyEntity` for `(agentId, userId)`.
     * Returns `null` when no policy row has been created yet for this user and agent.
     */
    public async GetPolicyForAgentAndUser(
        agentId: string,
        userId: string,
        contextUser: UserInfo,
        forceRefresh: boolean = false
    ): Promise<MJAIAgentUserPolicyEntity | null> {
        const key = this.buildCacheKey(agentId, userId);
        if (!forceRefresh && this.policyCache.has(key)) {
            return this.policyCache.get(key) ?? null;
        }

        try {
            const rv = new RunView();
            const safeAgentId = agentId.replace(/'/g, "''");
            const safeUserId = userId.replace(/'/g, "''");
            const result = await rv.RunView<MJAIAgentUserPolicyEntity>(
                {
                    EntityName: 'MJ: AI Agent User Policies',
                    ExtraFilter: `AgentID='${safeAgentId}' AND UserID='${safeUserId}'`,
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            if (result.Success && result.Results.length > 0) {
                const policy = result.Results[0];
                this.policyCache.set(key, policy);
                return policy;
            }
        } catch (error) {
            LogError(
                `AgentUserPolicyEngine.GetPolicyForAgentAndUser failed for agent=${agentId}, user=${userId}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
        return null;
    }

    /**
     * Evaluate whether an agent running as `contextUser` may perform `operation` on `entityName`.
     * Enforces:
     * 1. `contextUser`'s MJ EntityPermission ceiling (hard ceiling — never widened)
     * 2. `policy.Status` & `policy.DefaultDataAccessMode`
     * 3. Matching `EntityAccessRules` CRUD narrowing
     * 4. Time window gates (`timeWindows` + `outsideWindowBehavior`)
     * 5. Row-Level Security narrowing (`whereClause` validated via `SQLExpressionValidator` + `recordConditionExpression`)
     * 6. Field-Level Security narrowing (`deniedFields`, `readOnlyFields`, `requireApprovalFields`)
     */
    public EvaluateEntityAccess(input: EvaluateEntityAccessInput): EntityAccessEvaluationResult {
        const now = input.now ?? new Date();
        const ceiling =
            input.userPermissionCeiling ??
            this.resolveUserEntityPermissionCeiling(input.entityName, input.contextUser, input.provider);

        // 1. Enforce hard user permission ceiling first
        if (!this.isAllowedByUserCeiling(input.operation, ceiling)) {
            return {
                verdict: 'Deny',
                reason: `User '${input.contextUser.Name || input.contextUser.ID}' does not have '${input.operation}' permission on entity '${input.entityName}'. Agent cannot exceed the user's permission ceiling.`,
                combinedRlsWhereClause: null,
                rlsFilterIds: [],
                deniedFieldPatterns: [],
                readOnlyFieldPatterns: [],
                requireApprovalFieldPatterns: [],
                nextWindowStartISO: null,
            };
        }

        const policy = input.policy;
        if (!policy) {
            return {
                verdict: 'Allow',
                reason: 'Permitted within user permission ceiling (no narrowing policy configured).',
                combinedRlsWhereClause: null,
                rlsFilterIds: [],
                deniedFieldPatterns: [],
                readOnlyFieldPatterns: [],
                requireApprovalFieldPatterns: [],
                nextWindowStartISO: null,
            };
        }

        if (policy.Status === 'Disabled') {
            return {
                verdict: 'Deny',
                reason: 'Agent user policy status is Disabled.',
                combinedRlsWhereClause: null,
                rlsFilterIds: [],
                deniedFieldPatterns: [],
                readOnlyFieldPatterns: [],
                requireApprovalFieldPatterns: [],
                nextWindowStartISO: null,
            };
        }

        const rules = this.resolveEntityRules(policy);
        const matchingRules = rules.filter((r) => this.matchesWildcardPattern(input.entityName, r.entityPattern));

        const whereClauses: string[] = [];
        const rlsFilterIds: string[] = [];
        const deniedFieldPatterns: string[] = [];
        const readOnlyFieldPatterns: string[] = [];
        const requireApprovalFieldPatterns: string[] = [];

        for (const rule of matchingRules) {
            if (rule.rlsNarrowing?.rowLevelSecurityFilterId) {
                rlsFilterIds.push(rule.rlsNarrowing.rowLevelSecurityFilterId);
            }
            if (rule.rlsNarrowing?.whereClause) {
                const validatedClause = this.validateAndInterpolateWhereClause(
                    rule.rlsNarrowing.whereClause,
                    input.contextUser
                );
                if (!validatedClause.valid) {
                    return {
                        verdict: 'Deny',
                        reason: `Entity RLS whereClause rejected by SQLExpressionValidator: ${validatedClause.error}`,
                        combinedRlsWhereClause: null,
                        rlsFilterIds,
                        deniedFieldPatterns,
                        readOnlyFieldPatterns,
                        requireApprovalFieldPatterns,
                        nextWindowStartISO: null,
                    };
                }
                if (validatedClause.sql) {
                    whereClauses.push(`(${validatedClause.sql})`);
                }
            }
            if (rule.flsNarrowing?.deniedFields) {
                deniedFieldPatterns.push(...rule.flsNarrowing.deniedFields);
            }
            if (rule.flsNarrowing?.readOnlyFields) {
                readOnlyFieldPatterns.push(...rule.flsNarrowing.readOnlyFields);
            }
            if (rule.flsNarrowing?.requireApprovalFields) {
                requireApprovalFieldPatterns.push(...rule.flsNarrowing.requireApprovalFields);
            }
        }

        const combinedRlsWhereClause = whereClauses.length > 0 ? whereClauses.join(' AND ') : null;
        const isWriteOperation = input.operation !== 'Read';

        // 2. Check DefaultDataAccessMode when no explicit rule matched
        if (matchingRules.length === 0) {
            if (policy.DefaultDataAccessMode === 'AllowListOnly') {
                return {
                    verdict: 'Deny',
                    reason: `Entity '${input.entityName}' is not listed in EntityAccessRules and DefaultDataAccessMode is AllowListOnly.`,
                    combinedRlsWhereClause,
                    rlsFilterIds,
                    deniedFieldPatterns,
                    readOnlyFieldPatterns,
                    requireApprovalFieldPatterns,
                    nextWindowStartISO: null,
                };
            }
            if (policy.DefaultDataAccessMode === 'ReadOnly' && isWriteOperation) {
                return {
                    verdict: 'Deny',
                    reason: `Write operation '${input.operation}' on '${input.entityName}' blocked because DefaultDataAccessMode is ReadOnly.`,
                    combinedRlsWhereClause,
                    rlsFilterIds,
                    deniedFieldPatterns,
                    readOnlyFieldPatterns,
                    requireApprovalFieldPatterns,
                    nextWindowStartISO: null,
                };
            }
        }

        let finalVerdict: AgentPolicyVerdict = 'Allow';
        let finalReason = 'Permitted by user policy.';
        let nextWindowStartISO: string | null = null;

        // 3. Destructive operation gate on Delete
        if (input.operation === 'Delete' && policy.RequireApprovalForDestructiveActions) {
            finalVerdict = 'RequireApproval';
            finalReason = `Deleting from '${input.entityName}' requires user approval (RequireApprovalForDestructiveActions=true).`;
        }

        // 4. Evaluate each matching rule (most restrictive verdict wins)
        for (const rule of matchingRules) {
            if (rule.access === 'Deny') {
                return {
                    verdict: 'Deny',
                    reason: `Entity rule '${rule.entityPattern}' denies all access to '${input.entityName}'.`,
                    combinedRlsWhereClause,
                    rlsFilterIds,
                    deniedFieldPatterns,
                    readOnlyFieldPatterns,
                    requireApprovalFieldPatterns,
                    nextWindowStartISO: null,
                };
            }
            if (rule.access === 'ReadOnly' && isWriteOperation) {
                return {
                    verdict: 'Deny',
                    reason: `Entity rule '${rule.entityPattern}' restricts '${input.entityName}' to ReadOnly.`,
                    combinedRlsWhereClause,
                    rlsFilterIds,
                    deniedFieldPatterns,
                    readOnlyFieldPatterns,
                    requireApprovalFieldPatterns,
                    nextWindowStartISO: null,
                };
            }
            if (rule.access === 'RequireApprovalOnWrite' && isWriteOperation) {
                finalVerdict = 'RequireApproval';
                finalReason = `Entity rule '${rule.entityPattern}' requires user approval for '${input.operation}' on '${input.entityName}'.`;
            }

            // Evaluate Time Windows on the rule
            if (rule.timeWindows && rule.timeWindows.length > 0) {
                const windowEval = this.evaluateTimeWindows(rule.timeWindows, now, isWriteOperation);
                if (!windowEval.inWindow) {
                    if (windowEval.verdict === 'Deny') {
                        return {
                            verdict: 'Deny',
                            reason: windowEval.reason,
                            combinedRlsWhereClause,
                            rlsFilterIds,
                            deniedFieldPatterns,
                            readOnlyFieldPatterns,
                            requireApprovalFieldPatterns,
                            nextWindowStartISO: null,
                        };
                    }
                    if (windowEval.verdict === 'DeferUntilNextWindow') {
                        finalVerdict = 'DeferUntilNextWindow';
                        finalReason = windowEval.reason;
                        nextWindowStartISO = windowEval.nextWindowStartISO;
                    } else if (windowEval.verdict === 'RequireApproval' && finalVerdict === 'Allow') {
                        finalVerdict = 'RequireApproval';
                        finalReason = windowEval.reason;
                    }
                }
            }

            // Evaluate record-level SafeExpressionEvaluator RLS condition if a record was supplied
            if (input.record && rule.rlsNarrowing?.recordConditionExpression) {
                const exprResult = this.expressionEvaluator.evaluate(
                    rule.rlsNarrowing.recordConditionExpression,
                    {
                        record: input.record,
                        user: {
                            ID: input.contextUser.ID,
                            Email: input.contextUser.Email,
                            Name: input.contextUser.Name,
                        },
                        nowIso: now.toISOString(),
                    }
                );
                if (!exprResult.success || !exprResult.value) {
                    return {
                        verdict: 'Deny',
                        reason: `Record failed policy RLS recordConditionExpression '${rule.rlsNarrowing.recordConditionExpression}'.`,
                        combinedRlsWhereClause,
                        rlsFilterIds,
                        deniedFieldPatterns,
                        readOnlyFieldPatterns,
                        requireApprovalFieldPatterns,
                        nextWindowStartISO: null,
                    };
                }
            }
        }

        // 5. Evaluate FLS field narrowing on Create/Update mutations
        if (isWriteOperation && input.mutatedFields && input.mutatedFields.length > 0) {
            for (const field of input.mutatedFields) {
                if (deniedFieldPatterns.some((p) => this.matchesWildcardPattern(field, p))) {
                    return {
                        verdict: 'Deny',
                        reason: `Field '${field}' on '${input.entityName}' is denied by user policy FLS narrowing.`,
                        combinedRlsWhereClause,
                        rlsFilterIds,
                        deniedFieldPatterns,
                        readOnlyFieldPatterns,
                        requireApprovalFieldPatterns,
                        nextWindowStartISO: null,
                    };
                }
                if (readOnlyFieldPatterns.some((p) => this.matchesWildcardPattern(field, p))) {
                    return {
                        verdict: 'Deny',
                        reason: `Field '${field}' on '${input.entityName}' is read-only under user policy FLS narrowing.`,
                        combinedRlsWhereClause,
                        rlsFilterIds,
                        deniedFieldPatterns,
                        readOnlyFieldPatterns,
                        requireApprovalFieldPatterns,
                        nextWindowStartISO: null,
                    };
                }
                if (
                    finalVerdict === 'Allow' &&
                    requireApprovalFieldPatterns.some((p) => this.matchesWildcardPattern(field, p))
                ) {
                    finalVerdict = 'RequireApproval';
                    finalReason = `Modifying field '${field}' on '${input.entityName}' requires user approval under FLS narrowing.`;
                }
            }
        }

        return {
            verdict: finalVerdict,
            reason: finalReason,
            combinedRlsWhereClause,
            rlsFilterIds,
            deniedFieldPatterns,
            readOnlyFieldPatterns,
            requireApprovalFieldPatterns,
            nextWindowStartISO,
        };
    }

    /**
     * Strip `deniedFields` patterns from a plain record object returned to an agent.
     */
    public MaskRecordFields<T extends Record<string, string | number | boolean | object | null | undefined>>(
        record: T,
        deniedFieldPatterns: string[]
    ): Partial<T> {
        if (deniedFieldPatterns.length === 0) {
            return { ...record };
        }
        const clone: Partial<T> = {};
        for (const [key, value] of Object.entries(record)) {
            const isDenied = deniedFieldPatterns.some((pattern) => this.matchesWildcardPattern(key, pattern));
            if (!isDenied) {
                clone[key as keyof T] = value as T[keyof T];
            }
        }
        return clone;
    }

    /**
     * Evaluate whether an agent running as `contextUser` may execute `actionName` with `params`.
     */
    public EvaluateActionExecution(input: EvaluateActionExecutionInput): ActionPolicyEvaluationResult {
        const now = input.now ?? new Date();
        const policy = input.policy;
        if (!policy) {
            return {
                verdict: 'Allow',
                reason: 'No user policy narrowing configured for this agent.',
                matchedRulePattern: null,
                nextWindowStartISO: null,
            };
        }

        if (policy.Status === 'Disabled') {
            return {
                verdict: 'Deny',
                reason: 'Agent user policy status is Disabled.',
                matchedRulePattern: null,
                nextWindowStartISO: null,
            };
        }

        const rules = this.resolveActionRules(policy);
        const params = input.params ?? {};
        let verdict: AgentPolicyVerdict = 'Allow';
        let reason = 'Permitted by user policy.';
        let matchedRulePattern: string | null = null;
        let nextWindowStartISO: string | null = null;

        // High-level approval switches on MJAIAgentUserPolicyEntity
        const isExternal =
            input.isExternalCommunication === true ||
            params['IsExternal'] === true ||
            params['isExternal'] === true;
        if (isExternal && policy.RequireApprovalForExternalComms) {
            verdict = 'RequireApproval';
            reason = `Action '${input.actionName}' targets external recipients and RequireApprovalForExternalComms is enabled.`;
        }

        const rawAmount =
            input.financialAmount ??
            (typeof params['Amount'] === 'number'
                ? params['Amount']
                : typeof params['amount'] === 'number'
                  ? params['amount']
                  : null);
        if (rawAmount != null) {
            if (policy.RequireApprovalForFinancials) {
                verdict = 'RequireApproval';
                reason = `Action '${input.actionName}' involves financial amount ${rawAmount} and RequireApprovalForFinancials is enabled.`;
            } else if (
                policy.AutoApproveAmountThreshold != null &&
                rawAmount > policy.AutoApproveAmountThreshold
            ) {
                verdict = 'RequireApproval';
                reason = `Action '${input.actionName}' amount (${rawAmount}) exceeds AutoApproveAmountThreshold (${policy.AutoApproveAmountThreshold}).`;
            }
        }

        const isDestructive =
            input.isDestructive === true ||
            this.matchesWildcardPattern(input.actionName, '*Delete*') ||
            this.matchesWildcardPattern(input.actionName, '*Cancel*');
        if (isDestructive && policy.RequireApprovalForDestructiveActions) {
            verdict = 'RequireApproval';
            reason = `Action '${input.actionName}' is destructive and RequireApprovalForDestructiveActions is enabled.`;
        }

        // Evaluate ActionPolicyRules in order
        for (const rule of rules) {
            if (!this.matchesWildcardPattern(input.actionName, rule.actionPattern)) {
                continue;
            }

            if (rule.conditionExpression && rule.conditionExpression.trim().length > 0) {
                const condResult = this.expressionEvaluator.evaluate(rule.conditionExpression, {
                    params,
                    user: {
                        ID: input.contextUser.ID,
                        Email: input.contextUser.Email,
                        Name: input.contextUser.Name,
                    },
                    nowIso: now.toISOString(),
                });
                if (!condResult.success || !condResult.value) {
                    continue;
                }
            }

            matchedRulePattern = rule.actionPattern;

            if (rule.policy === 'Deny') {
                return {
                    verdict: 'Deny',
                    reason: `Action '${input.actionName}' denied by action policy rule '${rule.actionPattern}'.`,
                    matchedRulePattern,
                    nextWindowStartISO: null,
                };
            }

            if (rule.policy === 'RequireApproval') {
                verdict = 'RequireApproval';
                reason = `Action '${input.actionName}' requires user approval per rule '${rule.actionPattern}'.`;
            }

            if (rule.timeWindows && rule.timeWindows.length > 0) {
                const windowEval = this.evaluateTimeWindows(rule.timeWindows, now, true);
                if (!windowEval.inWindow) {
                    if (windowEval.verdict === 'Deny') {
                        return {
                            verdict: 'Deny',
                            reason: windowEval.reason,
                            matchedRulePattern,
                            nextWindowStartISO: null,
                        };
                    }
                    if (windowEval.verdict === 'DeferUntilNextWindow') {
                        verdict = 'DeferUntilNextWindow';
                        reason = windowEval.reason;
                        nextWindowStartISO = windowEval.nextWindowStartISO;
                    } else if (windowEval.verdict === 'RequireApproval' && verdict === 'Allow') {
                        verdict = 'RequireApproval';
                        reason = windowEval.reason;
                    }
                }
            }
        }

        return {
            verdict,
            reason,
            matchedRulePattern,
            nextWindowStartISO,
        };
    }

    /**
     * Build a concise Markdown governance summary to inject into the agent's system prompt
     * so the agent knows the user's personalized name, onboarding state, coordination posture,
     * channel modes, and active narrowing rules.
     */
    public BuildPromptPolicyContextBlock(policy: MJAIAgentUserPolicyEntity | null, user: UserInfo): string {
        if (!policy) {
            return [
                '### User Governance & Personalization Policy',
                `- **User**: ${user.Name} (${user.Email})`,
                '- **Onboarding Status**: `NotStarted` (No `MJ: AI Agent User Policies` record exists yet for this user — initiate onboarding to capture goals, coordination posture, channel permissions, and approval boundaries.)',
                '- **Permission Ceiling**: Running strictly within the user\'s MJ Entity CRUD, Role RLS, and Role FLS permissions.',
            ].join('\n');
        }

        const lines: string[] = [
            '### User Governance & Personalization Policy',
            `- **User**: ${user.Name} (${user.Email})`,
            `- **Agent Display Name**: ${policy.DisplayNameOverride || 'Chief of Staff'}`,
            `- **Policy Status**: \`${policy.Status}\` | **Onboarding Status**: \`${policy.OnboardingStatus}\``,
            `- **Coordination Mode**: \`${policy.CoordinationMode}\` | **Inter-Agent Coordination**: \`${policy.AllowInterAgentCoordination ? 'Allowed' : 'Disabled'}\``,
            `- **Default Data Access Mode**: \`${policy.DefaultDataAccessMode}\` (always bounded by user's MJ role permissions)`,
            `- **Channels**: Email=\`${policy.EmailChannelMode}\`, Calendar=\`${policy.CalendarChannelMode ?? 'ProposeWithApproval'}\`, Phone=\`${policy.PhoneChannelMode}\`, Messaging=\`${policy.MessagingChannelMode}\``,
            `- **Approval Guardrails**: ExternalComms=\`${policy.RequireApprovalForExternalComms ? 'RequireApproval' : 'Auto'}\`, Financials=\`${policy.RequireApprovalForFinancials ? 'RequireApproval' : 'Auto'}\` (Threshold: ${policy.AutoApproveAmountThreshold != null ? `$${policy.AutoApproveAmountThreshold}` : 'None'}), Destructive=\`${policy.RequireApprovalForDestructiveActions ? 'RequireApproval' : 'Auto'}\``,
        ];

        if (policy.InstructionsOverride && policy.InstructionsOverride.trim().length > 0) {
            lines.push(`- **User Standing Instructions**: ${policy.InstructionsOverride.trim()}`);
        }

        return lines.join('\n');
    }

    /**
     * Evaluate whether a user's `CalendarChannelMode` permits reading or mutating calendar events.
     */
    public EvaluateCalendarOperation(
        policy: MJAIAgentUserPolicyEntity | null,
        isMutation: boolean
    ): { verdict: AgentPolicyVerdict; mode: MJAIAgentUserPolicyEntity['CalendarChannelMode']; reason: string } {
        const mode: MJAIAgentUserPolicyEntity['CalendarChannelMode'] =
            policy?.CalendarChannelMode ?? 'ProposeWithApproval';
        if (policy?.Status === 'Disabled' || mode === 'Disabled') {
            return {
                verdict: 'Deny',
                mode: 'Disabled',
                reason: 'Calendar channel access is Disabled in the user\'s AI Agent User Policy.',
            };
        }
        if (!isMutation) {
            return {
                verdict: 'Allow',
                mode,
                reason: `Calendar read permitted under CalendarChannelMode='${mode}'.`,
            };
        }
        if (mode === 'ReadOnly') {
            return {
                verdict: 'Deny',
                mode,
                reason: 'Calendar mutations are blocked because CalendarChannelMode is ReadOnly.',
            };
        }
        if (mode === 'ProposeWithApproval') {
            return {
                verdict: 'RequireApproval',
                mode,
                reason: 'Calendar mutations require user approval because CalendarChannelMode is ProposeWithApproval.',
            };
        }
        return {
            verdict: 'Allow',
            mode,
            reason: 'Calendar mutation permitted autonomously under CalendarChannelMode=Autonomous.',
        };
    }

    /**
     * Evaluate whether a user's `EmailChannelMode` permits reading, drafting, or sending email.
     */
    public EvaluateEmailOperation(
        policy: MJAIAgentUserPolicyEntity | null,
        operation: 'Read' | 'Draft' | 'Send'
    ): { verdict: AgentPolicyVerdict; mode: MJAIAgentUserPolicyEntity['EmailChannelMode']; reason: string } {
        const mode: MJAIAgentUserPolicyEntity['EmailChannelMode'] = policy?.EmailChannelMode ?? 'DraftOnly';
        if (policy?.Status === 'Disabled' || mode === 'Disabled') {
            return {
                verdict: 'Deny',
                mode: 'Disabled',
                reason: 'Email channel access is Disabled in the user\'s AI Agent User Policy.',
            };
        }
        if (operation === 'Read') {
            return {
                verdict: 'Allow',
                mode,
                reason: `Email read permitted under EmailChannelMode='${mode}'.`,
            };
        }
        if (mode === 'ReadOnly') {
            return {
                verdict: 'Deny',
                mode,
                reason: `Email ${operation.toLowerCase()} is blocked because EmailChannelMode is ReadOnly.`,
            };
        }
        if (operation === 'Draft') {
            return {
                verdict: 'Allow',
                mode,
                reason: `Email draft creation permitted under EmailChannelMode='${mode}'.`,
            };
        }
        if (mode === 'DraftOnly') {
            return {
                verdict: 'Deny',
                mode,
                reason: 'Direct email sending is blocked because EmailChannelMode is DraftOnly (save a draft instead).',
            };
        }
        if (policy?.RequireApprovalForExternalComms) {
            return {
                verdict: 'RequireApproval',
                mode,
                reason: `Sending email (${mode}) requires user approval because RequireApprovalForExternalComms is enabled.`,
            };
        }
        return {
            verdict: 'Allow',
            mode,
            reason: `Sending email permitted under EmailChannelMode=${mode}.`,
        };
    }

    // ========================================================================
    // Internal Helpers
    // ========================================================================

    private resolveUserEntityPermissionCeiling(
        entityName: string,
        user: UserInfo,
        provider?: IMetadataProvider
    ): UserEntityPermissionCeiling {
        try {
            const md = provider ?? new Metadata();
            const entity = md.EntityByName(entityName);
            if (!entity) {
                return { canRead: true, canCreate: true, canUpdate: true, canDelete: true };
            }
            const perms = entity.GetUserPermisions(user);
            return {
                canRead: perms.CanRead,
                canCreate: perms.CanCreate,
                canUpdate: perms.CanUpdate,
                canDelete: perms.CanDelete,
            };
        } catch {
            // In unit test environments where Metadata provider is not initialized, default to open ceiling
            // unless explicit `userPermissionCeiling` is supplied.
            return { canRead: true, canCreate: true, canUpdate: true, canDelete: true };
        }
    }

    private isAllowedByUserCeiling(
        operation: AgentEntityCrudOperation,
        ceiling: UserEntityPermissionCeiling
    ): boolean {
        switch (operation) {
            case 'Read':
                return ceiling.canRead;
            case 'Create':
                return ceiling.canCreate;
            case 'Update':
                return ceiling.canUpdate;
            case 'Delete':
                return ceiling.canDelete;
            default:
                return false;
        }
    }

    private resolveEntityRules(
        policy: MJAIAgentUserPolicyEntity
    ): MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[] {
        if (policy.EntityAccessRulesObject) {
            return policy.EntityAccessRulesObject;
        }
        if (policy.EntityAccessRules && policy.EntityAccessRules.trim().length > 0) {
            return SafeJSONParse<MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[]>(policy.EntityAccessRules) ?? [];
        }
        return [];
    }

    private resolveActionRules(
        policy: MJAIAgentUserPolicyEntity
    ): MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[] {
        if (policy.ActionPolicyRulesObject) {
            return policy.ActionPolicyRulesObject;
        }
        if (policy.ActionPolicyRules && policy.ActionPolicyRules.trim().length > 0) {
            return SafeJSONParse<MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[]>(policy.ActionPolicyRules) ?? [];
        }
        return [];
    }

    /** Case-insensitive wildcard matcher supporting `*` anywhere in `pattern`. */
    private matchesWildcardPattern(candidate: string, pattern: string): boolean {
        const trimmedPattern = pattern.trim();
        if (trimmedPattern === '*') {
            return true;
        }
        const escaped = trimmedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        const regex = new RegExp(`^${escaped}$`, 'i');
        return regex.test(candidate.trim());
    }

    /**
     * Validate a SQL `whereClause` via `SQLExpressionValidator` and interpolate safe
     * `{{UserID}}` and `{{UserEmail}}` tokens.
     */
    private validateAndInterpolateWhereClause(
        rawWhereClause: string,
        user: UserInfo
    ): { valid: boolean; sql: string | null; error?: string } {
        const safeUserId = (user.ID ?? '').replace(/'/g, "''");
        const safeEmail = (user.Email ?? '').replace(/'/g, "''");
        const interpolated = rawWhereClause
            .replace(/\{\{\s*UserID\s*\}\}/gi, () => `'${safeUserId}'`)
            .replace(/\{\{\s*UserEmail\s*\}\}/gi, () => `'${safeEmail}'`);

        const validation = SQLExpressionValidator.Instance.validate(interpolated, {
            context: 'where_clause',
        });
        if (!validation.valid) {
            return {
                valid: false,
                sql: null,
                error: validation.error ?? 'Unsafe SQL expression in whereClause',
            };
        }
        return { valid: true, sql: interpolated.trim() };
    }

    /**
     * Evaluate whether `now` falls inside at least one of the configured `timeWindows`.
     */
    private evaluateTimeWindows(
        windows: AgentPolicyTimeWindow[],
        now: Date,
        isWriteOperation: boolean
    ): {
        inWindow: boolean;
        verdict: AgentPolicyVerdict;
        reason: string;
        nextWindowStartISO: string | null;
    } {
        for (const win of windows) {
            if (this.isInsideSingleTimeWindow(win, now)) {
                return {
                    inWindow: true,
                    verdict: 'Allow',
                    reason: 'Within allowed time window.',
                    nextWindowStartISO: null,
                };
            }
        }

        const primaryWindow = windows[0];
        const behavior = primaryWindow?.outsideWindowBehavior ?? 'RequireApproval';
        const nextWindowStartISO = this.computeNextWindowStartISO(primaryWindow, now);

        if (behavior === 'ReadOnly') {
            if (!isWriteOperation) {
                return {
                    inWindow: true,
                    verdict: 'Allow',
                    reason: 'Read permitted outside write time window.',
                    nextWindowStartISO: null,
                };
            }
            return {
                inWindow: false,
                verdict: 'Deny',
                reason: 'Write operation blocked outside allowed time window (outsideWindowBehavior=ReadOnly).',
                nextWindowStartISO,
            };
        }

        if (behavior === 'Deny') {
            return {
                inWindow: false,
                verdict: 'Deny',
                reason: 'Operation denied outside allowed time window.',
                nextWindowStartISO,
            };
        }

        if (behavior === 'DeferUntilNextWindow') {
            return {
                inWindow: false,
                verdict: 'DeferUntilNextWindow',
                reason: `Operation deferred until next allowed time window (${nextWindowStartISO ?? 'upcoming'}).`,
                nextWindowStartISO,
            };
        }

        return {
            inWindow: false,
            verdict: 'RequireApproval',
            reason: 'Operation invoked outside allowed time window — user approval required.',
            nextWindowStartISO,
        };
    }

    private isInsideSingleTimeWindow(win: AgentPolicyTimeWindow, now: Date): boolean {
        if (win.validFromISO && now.getTime() < new Date(win.validFromISO).getTime()) {
            return false;
        }
        if (win.validUntilISO && now.getTime() > new Date(win.validUntilISO).getTime()) {
            return false;
        }

        const tz = win.timezone?.trim() || 'UTC';
        const localParts = this.getLocalTimeParts(now, tz);

        if (win.daysOfWeek && win.daysOfWeek.length > 0) {
            if (!win.daysOfWeek.includes(localParts.dayOfWeek)) {
                return false;
            }
        }

        const currentMinutes = localParts.hour * 60 + localParts.minute;
        const startMinutes = win.startTime ? this.parseHHMM(win.startTime) : 0;
        const endMinutes = win.endTime ? this.parseHHMM(win.endTime) : 24 * 60;

        if (startMinutes <= endMinutes) {
            return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        }
        // Overnight window (e.g. 22:00 to 06:00)
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    private getLocalTimeParts(
        date: Date,
        timeZone: string
    ): { dayOfWeek: 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'; hour: number; minute: number } {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone,
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            });
            const parts = formatter.formatToParts(date);
            const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
            const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
            const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0';
            const matchedDay = DAY_NAMES.find((d) => d.toLowerCase() === weekdayStr.substring(0, 3).toLowerCase()) ?? 'Mon';
            const rawHour = parseInt(hourStr, 10);
            return {
                dayOfWeek: matchedDay,
                hour: rawHour === 24 ? 0 : rawHour,
                minute: parseInt(minuteStr, 10),
            };
        } catch {
            return {
                dayOfWeek: DAY_NAMES[date.getUTCDay()],
                hour: date.getUTCHours(),
                minute: date.getUTCMinutes(),
            };
        }
    }

    private parseHHMM(hhmm: string): number {
        const [h, m] = hhmm.split(':').map((part) => parseInt(part, 10));
        return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    }

    /** Compute the next timestamp (up to 8 days ahead) when `win` opens. */
    private computeNextWindowStartISO(win: AgentPolicyTimeWindow | undefined, now: Date): string | null {
        if (!win) {
            return null;
        }
        const probe = new Date(now.getTime());
        probe.setUTCSeconds(0, 0);
        // Step in 15-minute increments up to 8 days to find the next window opening
        const maxSteps = 8 * 24 * 4;
        for (let i = 1; i <= maxSteps; i++) {
            const candidate = new Date(probe.getTime() + i * 15 * 60_000);
            if (this.isInsideSingleTimeWindow(win, candidate)) {
                return candidate.toISOString();
            }
        }
        return null;
    }
}
