import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import {
    CompositeKey,
    DatabaseProviderBase,
    EntityInfo,
    IMetadataProvider,
    Metadata,
    QueryInfo,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import {
    MJAIAgentUserPolicyEntity,
    MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule,
} from '@memberjunction/core-entities';
import {
    AgentEntityCrudOperation,
    AgentUserPolicyEngine,
    EntityAccessEvaluationResult,
} from '@memberjunction/ai-core-plus';
import { ClientClauseScreen, RenderPipeline } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';

type ScalarFieldValue = string | number | boolean | null | undefined;
type ScalarRecord = Record<string, ScalarFieldValue>;

export interface ActiveAgentPolicyEvaluation {
    active: true;
    policy: MJAIAgentUserPolicyEntity;
    evalResult: EntityAccessEvaluationResult;
    effectiveWhereClause: string;
    hasRecordConditionRules: boolean;
}

export interface InactiveAgentPolicyEvaluation {
    active: false;
}

export type AgentPolicyGuardOutcome =
    | { blocked: ActionResultSimple }
    | { allowed: ActiveAgentPolicyEvaluation | InactiveAgentPolicyEvaluation };

export type QueryPolicyGuardOutcome =
    | { blocked: ActionResultSimple }
    | { allowed: { active: boolean; deniedFieldPatterns: string[] } };

/**
 * Shared runtime guard that wires `AgentUserPolicyEngine.EvaluateEntityAccess` and
 * `AgentUserPolicyEngine.MaskRecordFields` into record CRUD actions and query actions
 * whenever an action executes on behalf of an agent (`params.Context.AgentID`).
 */
export class AgentDataPolicyGuard {
    /**
     * Extracts the calling agent ID from `params.Context` when running inside an agent turn.
     */
    public static GetCallingAgentID(params: RunActionParams): string | null {
        const ctx = params.Context as { AgentID?: unknown } | undefined;
        if (!ctx || typeof ctx.AgentID !== 'string') {
            return null;
        }
        const trimmed = ctx.AgentID.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    /**
     * Evaluates entity-level, field-write, time-window, and optional record-condition rules
     * for a calling agent before or after loading/mutating an entity record.
     */
    public static async EvaluateRecordOperation(input: {
        params: RunActionParams;
        entityInfo: EntityInfo;
        operation: AgentEntityCrudOperation;
        mutatedFields?: string[];
        record?: Record<string, unknown>;
    }): Promise<AgentPolicyGuardOutcome> {
        const callingAgentId = AgentDataPolicyGuard.GetCallingAgentID(input.params);
        const contextUser = input.params.ContextUser;
        if (!callingAgentId || !contextUser?.ID) {
            return { allowed: { active: false } };
        }

        const policy = await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(
            callingAgentId,
            contextUser.ID,
            contextUser
        );
        if (!policy) {
            return { allowed: { active: false } };
        }

        const evalResult = AgentUserPolicyEngine.Instance.EvaluateEntityAccess({
            policy,
            contextUser,
            entityName: input.entityInfo.Name,
            operation: input.operation,
            mutatedFields: input.mutatedFields,
            record: input.record ? AgentDataPolicyGuard.toScalarRecord(input.record) : undefined,
            provider: input.params.Provider,
        });

        const verdictError = AgentDataPolicyGuard.verdictToActionError(evalResult, input.params);
        if (verdictError) {
            return { blocked: verdictError };
        }

        const rlsResolution = AgentDataPolicyGuard.resolveEffectiveWhereClause(
            evalResult,
            contextUser,
            input.params.Provider
        );
        if ('blocked' in rlsResolution) {
            return rlsResolution;
        }

        return {
            allowed: {
                active: true,
                policy,
                evalResult,
                effectiveWhereClause: rlsResolution.whereClause,
                hasRecordConditionRules: AgentDataPolicyGuard.hasRecordConditionRulesForEntity(
                    policy,
                    input.entityInfo
                ),
            },
        };
    }

    /**
     * Verifies that a specific primary-key record satisfies the agent policy's SQL row-level
     * filter (`whereClause` / `rlsFilterIds`) via `RunView` before returning, updating, or deleting it.
     */
    public static async VerifyPrimaryKeyPassesWhereClause(input: {
        params: RunActionParams;
        entityInfo: EntityInfo;
        primaryKey: CompositeKey | Record<string, unknown>;
        effectiveWhereClause: string;
    }): Promise<ActionResultSimple | null> {
        const clause = input.effectiveWhereClause.trim();
        if (!clause) {
            return null;
        }

        const pairs: Array<{ FieldName: string; Value: unknown }> =
            input.primaryKey instanceof CompositeKey
                ? input.primaryKey.KeyValuePairs
                : Object.entries(input.primaryKey).map(([FieldName, Value]) => ({ FieldName, Value }));

        const pkPredicates: string[] = [];
        for (const kv of pairs) {
            const fieldMeta = input.entityInfo.Fields.find(
                (f) => f.Name.trim().toLowerCase() === kv.FieldName.trim().toLowerCase()
            );
            const colName = fieldMeta ? fieldMeta.Name : kv.FieldName;
            if (kv.Value === null || kv.Value === undefined) {
                pkPredicates.push(`[${ colName }] IS NULL`);
            } else if (typeof kv.Value === 'number' && Number.isFinite(kv.Value)) {
                pkPredicates.push(`[${ colName }] = ${ kv.Value }`);
            } else if (typeof kv.Value === 'boolean') {
                pkPredicates.push(`[${ colName }] = ${ kv.Value ? 1 : 0 }`);
            } else {
                pkPredicates.push(`[${ colName }] = '${ EscapeSQLString(String(kv.Value)) }'`);
            }
        }

        if (pkPredicates.length === 0) {
            return {
                Success: false,
                ResultCode: 'PERMISSION_DENIED',
                Message: `Agent policy row filter on "${ input.entityInfo.Name }" could not verify primary key.`,
                Params: input.params.Params,
            };
        }

        const combinedFilter = `(${ pkPredicates.join(' AND ') }) AND (${ clause })`;
        const rv = input.params.Provider
            ? RunView.FromMetadataProvider(input.params.Provider)
            : new RunView();
        const checkResult = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: input.entityInfo.Name,
                ExtraFilter: combinedFilter,
                Fields: input.entityInfo.PrimaryKeys.map((pk) => pk.Name),
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            input.params.ContextUser
        );

        if (!checkResult.Success || !checkResult.Results || checkResult.Results.length === 0) {
            return {
                Success: false,
                ResultCode: 'PERMISSION_DENIED',
                Message: `Record on entity "${ input.entityInfo.Name }" is outside the calling agent's row-level policy scope.`,
                Params: input.params.Params,
            };
        }

        return null;
    }

    /**
     * Evaluates `rlsNarrowing.recordConditionExpression` on a loaded/post-mutation record when active rules exist,
     * returning a deterministic denial/approval/deferral `ActionResultSimple` if blocked.
     */
    public static CheckRecordCondition(input: {
        params: RunActionParams;
        policy: MJAIAgentUserPolicyEntity;
        entityInfo: EntityInfo;
        operation: AgentEntityCrudOperation;
        mutatedFields?: string[];
        record: Record<string, unknown>;
    }): ActionResultSimple | null {
        if (!input.params.ContextUser) {
            return null;
        }
        const evalResult = AgentUserPolicyEngine.Instance.EvaluateEntityAccess({
            policy: input.policy,
            contextUser: input.params.ContextUser,
            entityName: input.entityInfo.Name,
            operation: input.operation,
            mutatedFields: input.mutatedFields,
            record: AgentDataPolicyGuard.toScalarRecord(input.record),
            provider: input.params.Provider,
        });
        return AgentDataPolicyGuard.verdictToActionError(evalResult, input.params);
    }

    /**
     * Filters an array of `Get Records` rows through `EvaluateEntityAccess` when the policy carries
     * `recordConditionExpression` rules, then masks denied fields on every surviving row.
     */
    public static FilterAndMaskRows(input: {
        rows: Record<string, unknown>[];
        evalState: ActiveAgentPolicyEvaluation | InactiveAgentPolicyEvaluation;
        entityInfo: EntityInfo | undefined;
        contextUser?: UserInfo;
        provider?: IMetadataProvider;
    }): Record<string, unknown>[] {
        if (!input.evalState.active) {
            return input.rows;
        }
        const { policy, evalResult, hasRecordConditionRules } = input.evalState;
        let filtered = input.rows;
        if (hasRecordConditionRules && input.entityInfo && input.contextUser) {
            filtered = input.rows.filter((row) => {
                const rowEval = AgentUserPolicyEngine.Instance.EvaluateEntityAccess({
                    policy,
                    contextUser: input.contextUser!,
                    entityName: input.entityInfo!.Name,
                    operation: 'Read',
                    record: AgentDataPolicyGuard.toScalarRecord(row),
                    provider: input.provider,
                });
                return rowEval.verdict === 'Allow';
            });
        }
        return AgentDataPolicyGuard.MaskRows(filtered, evalResult.deniedFieldPatterns);
    }

    /**
     * Masks denied fields on a single record using `AgentUserPolicyEngine.Instance.MaskRecordFields`
     * while preserving non-scalar values (such as `Date` or nested objects) on allowed fields.
     */
    public static MaskRecord(
        record: Record<string, unknown>,
        deniedFieldPatterns: string[]
    ): Record<string, unknown> {
        if (!deniedFieldPatterns || deniedFieldPatterns.length === 0) {
            return record;
        }
        const probe: ScalarRecord = {};
        for (const key of Object.keys(record)) {
            probe[key] = 1;
        }
        const allowedKeys = AgentUserPolicyEngine.Instance.MaskRecordFields(probe, deniedFieldPatterns);
        const masked: Record<string, unknown> = {};
        for (const key of Object.keys(allowedKeys)) {
            masked[key] = record[key];
        }
        return masked;
    }

    /**
     * Masks denied fields across an array of result rows.
     */
    public static MaskRows(
        rows: Record<string, unknown>[],
        deniedFieldPatterns: string[]
    ): Record<string, unknown>[] {
        if (!deniedFieldPatterns || deniedFieldPatterns.length === 0 || rows.length === 0) {
            return rows;
        }
        return rows.map((row) => AgentDataPolicyGuard.MaskRecord(row, deniedFieldPatterns));
    }

    /**
     * Enforces agent data-access narrowing for `Run Stored Query`.
     */
    public static async EvaluateStoredQuery(
        params: RunActionParams,
        queryId: string | undefined,
        queryName: string | undefined
    ): Promise<QueryPolicyGuardOutcome> {
        const callingAgentId = AgentDataPolicyGuard.GetCallingAgentID(params);
        const contextUser = params.ContextUser;
        if (!callingAgentId || !contextUser?.ID) {
            return { allowed: { active: false, deniedFieldPatterns: [] } };
        }

        const policy = await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(
            callingAgentId,
            contextUser.ID,
            contextUser
        );
        if (!policy) {
            return { allowed: { active: false, deniedFieldPatterns: [] } };
        }
        if (policy.Status === 'Disabled') {
            return {
                blocked: {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: 'Agent user policy status is Disabled; stored query execution is denied.',
                    Params: params.Params,
                },
            };
        }

        const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
        const queryInfo = AgentDataPolicyGuard.findStoredQueryInfo(md, queryId, queryName);
        if (!queryInfo) {
            if (AgentDataPolicyGuard.policyNarrowsEntityReads(policy)) {
                return {
                    blocked: {
                        Success: false,
                        ResultCode: 'PERMISSION_DENIED',
                        Message: `Stored query "${ queryName ?? queryId }" metadata could not be resolved to verify agent data-access policy.`,
                        Params: params.Params,
                    },
                };
            }
            return { allowed: { active: true, deniedFieldPatterns: [] } };
        }

        const referencedEntities = AgentDataPolicyGuard.resolveStoredQueryEntities(md, queryInfo);
        if (referencedEntities === null) {
            return {
                blocked: {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: `Stored query "${ queryInfo.Name }" entity references could not be verified against the calling agent's data-access policy.`,
                    Params: params.Params,
                },
            };
        }

        if (referencedEntities.length === 0 && AgentDataPolicyGuard.policyNarrowsEntityReads(policy)) {
            return {
                blocked: {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: `Stored query "${ queryInfo.Name }" has no catalogued entity lineage and cannot be verified under a narrowed agent data-access policy.`,
                    Params: params.Params,
                },
            };
        }

        return AgentDataPolicyGuard.evaluateEntitiesForSqlRead(
            params,
            policy,
            contextUser,
            referencedEntities,
            `stored query "${ queryInfo.Name }"`
        );
    }

    /**
     * Enforces agent data-access narrowing for `Run Ad-hoc Query`.
     */
    public static async EvaluateAdhocQuery(
        params: RunActionParams,
        normalizedSql: string,
        readOnlyProvider: DatabaseProviderBase
    ): Promise<QueryPolicyGuardOutcome> {
        const callingAgentId = AgentDataPolicyGuard.GetCallingAgentID(params);
        const contextUser = params.ContextUser;
        if (!callingAgentId || !contextUser?.ID) {
            return { allowed: { active: false, deniedFieldPatterns: [] } };
        }

        const policy = await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(
            callingAgentId,
            contextUser.ID,
            contextUser
        );
        if (!policy) {
            return { allowed: { active: false, deniedFieldPatterns: [] } };
        }
        if (policy.Status === 'Disabled') {
            return {
                blocked: {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: 'Agent user policy status is Disabled; ad-hoc query execution is denied.',
                    Params: params.Params,
                },
            };
        }

        const entities = readOnlyProvider.Entities?.length
            ? readOnlyProvider.Entities
            : (params.Provider ?? Metadata.Provider)?.Entities ?? [];
        const dialect = ClientClauseScreen.DialectFor(readOnlyProvider);

        let renderedSql = normalizedSql;
        try {
            const rendered = RenderPipeline.Run(normalizedSql, {
                Platform: readOnlyProvider.PlatformKey,
                ContextUser: contextUser,
                RequireReadStatement: true,
            });
            renderedSql = rendered.Trace.AfterTemplates;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                blocked: {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: `Ad-hoc SQL could not be rendered safely for agent data-policy verification: ${ msg }`,
                    Params: params.Params,
                },
            };
        }

        let referencedEntities: EntityInfo[];
        try {
            referencedEntities = ClientClauseScreen.ResolveStatementEntities(
                renderedSql,
                entities,
                dialect,
                'ad-hoc SQL'
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                blocked: {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: `Ad-hoc SQL rejected by agent data-policy guard: ${ msg }`,
                    Params: params.Params,
                },
            };
        }

        if (referencedEntities.length === 0 && policy.DefaultDataAccessMode === 'AllowListOnly') {
            return {
                blocked: {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: 'Agent DefaultDataAccessMode is AllowListOnly; ad-hoc queries that do not reference an allow-listed entity are denied.',
                    Params: params.Params,
                },
            };
        }

        const entityCheck = AgentDataPolicyGuard.evaluateEntitiesForSqlRead(
            params,
            policy,
            contextUser,
            referencedEntities,
            'ad-hoc SQL'
        );
        if ('blocked' in entityCheck) {
            return entityCheck;
        }

        const { deniedFieldPatterns } = entityCheck.allowed;
        if (deniedFieldPatterns.length > 0) {
            const sqlTokens = ClientClauseScreen.ExtractStatementIdentifierTokens(renderedSql, dialect);
            const tokenProbe: ScalarRecord = {};
            for (const token of sqlTokens) {
                tokenProbe[token] = 1;
            }
            const survivingTokens = AgentUserPolicyEngine.Instance.MaskRecordFields(tokenProbe, deniedFieldPatterns);
            const referencedDeniedTokens = sqlTokens.filter((token) => !(token in survivingTokens));
            if (referencedDeniedTokens.length > 0) {
                return {
                    blocked: {
                        Success: false,
                        ResultCode: 'PERMISSION_DENIED',
                        Message: `Ad-hoc SQL references field(s) denied by the calling agent's policy: ${ referencedDeniedTokens.join(', ') }.`,
                        Params: params.Params,
                    },
                };
            }
        }

        return entityCheck;
    }

    /**
     * Combines an action's optional user `ExtraFilter` with the agent policy's effective SQL
     * row-level filter (`whereClause` + resolved `rlsFilterIds`).
     */
    public static CombineExtraFilters(existingFilter: string | undefined, policyWhereClause: string): string | undefined {
        const left = existingFilter?.trim() ?? '';
        const right = policyWhereClause.trim();
        if (left && right) {
            return `(${ left }) AND (${ right })`;
        }
        if (right) {
            return right;
        }
        return left || undefined;
    }

    private static evaluateEntitiesForSqlRead(
        params: RunActionParams,
        policy: MJAIAgentUserPolicyEntity,
        contextUser: UserInfo,
        entities: EntityInfo[],
        queryLabel: string
    ): QueryPolicyGuardOutcome {
        const deniedPatterns = new Set<string>();
        for (const entity of entities) {
            const evalResult = AgentUserPolicyEngine.Instance.EvaluateEntityAccess({
                policy,
                contextUser,
                entityName: entity.Name,
                operation: 'Read',
                provider: params.Provider,
            });
            const verdictError = AgentDataPolicyGuard.verdictToActionError(evalResult, params);
            if (verdictError) {
                return { blocked: verdictError };
            }

            const rlsResolution = AgentDataPolicyGuard.resolveEffectiveWhereClause(
                evalResult,
                contextUser,
                params.Provider
            );
            if ('blocked' in rlsResolution) {
                return rlsResolution;
            }
            if (
                rlsResolution.whereClause.length > 0 ||
                AgentDataPolicyGuard.hasRecordConditionRulesForEntity(policy, entity)
            ) {
                return {
                    blocked: {
                        Success: false,
                        ResultCode: 'PERMISSION_DENIED',
                        Message: `Cannot execute ${ queryLabel }: calling agent policy narrows rows on entity "${ entity.Name }", which raw/stored SQL cannot enforce. Read "${ entity.Name }" with Get Records instead.`,
                        Params: params.Params,
                    },
                };
            }

            for (const pattern of evalResult.deniedFieldPatterns) {
                deniedPatterns.add(pattern);
            }
        }

        return {
            allowed: {
                active: true,
                deniedFieldPatterns: Array.from(deniedPatterns),
            },
        };
    }

    private static findStoredQueryInfo(
        md: IMetadataProvider | undefined,
        queryId: string | undefined,
        queryName: string | undefined
    ): QueryInfo | undefined {
        const queries = md?.Queries ?? [];
        if (queryId) {
            const byId = queries.find((q) => UUIDsEqual(q.ID, queryId));
            if (byId) {
                return byId;
            }
        }
        if (queryName) {
            const target = queryName.trim().toLowerCase();
            return queries.find((q) => q.Name?.trim().toLowerCase() === target);
        }
        return undefined;
    }

    private static resolveStoredQueryEntities(
        md: IMetadataProvider | undefined,
        queryInfo: QueryInfo
    ): EntityInfo[] | null {
        const entities = md?.Entities ?? [];
        const resolved = new Map<string, EntityInfo>();
        for (const qe of queryInfo.Entities ?? []) {
            const match =
                (qe.EntityID ? entities.find((e) => UUIDsEqual(e.ID, qe.EntityID)) : undefined) ??
                (qe.Entity ? entities.find((e) => e.Name.trim().toLowerCase() === qe.Entity.trim().toLowerCase()) : undefined);
            if (!match) {
                return null;
            }
            resolved.set(match.ID || match.Name, match);
        }
        if (resolved.size > 0) {
            return Array.from(resolved.values());
        }
        if (queryInfo.SQL && queryInfo.SQL.trim().length > 0 && entities.length > 0) {
            try {
                const dialect = ClientClauseScreen.DialectFor(md);
                return ClientClauseScreen.ResolveStatementEntities(
                    queryInfo.SQL,
                    entities,
                    dialect,
                    `stored query "${ queryInfo.Name }"`
                );
            } catch {
                return [];
            }
        }
        return [];
    }

    private static policyNarrowsEntityReads(policy: MJAIAgentUserPolicyEntity): boolean {
        if (policy.DefaultDataAccessMode === 'AllowListOnly') {
            return true;
        }
        const rules = policy.EntityAccessRulesObject ?? [];
        return rules.length > 0;
    }

    private static resolveEffectiveWhereClause(
        evalResult: EntityAccessEvaluationResult,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): { whereClause: string } | { blocked: ActionResultSimple } {
        const clauses: string[] = [];
        const inlineClause = evalResult.combinedRlsWhereClause?.trim() ?? '';
        if (inlineClause.length > 0) {
            clauses.push(inlineClause);
        }
        if (evalResult.rlsFilterIds.length > 0) {
            const rlsCatalog = (provider ?? Metadata.Provider)?.RowLevelSecurityFilters ?? [];
            for (const filterId of evalResult.rlsFilterIds) {
                const found = rlsCatalog.find((f) => UUIDsEqual(f.ID, filterId));
                if (!found || !found.FilterText?.trim()) {
                    return {
                        blocked: {
                            Success: false,
                            ResultCode: 'PERMISSION_DENIED',
                            Message: `Agent policy references Row Level Security Filter "${ filterId }" which could not be resolved; failing closed.`,
                        },
                    };
                }
                const expanded = found.MarkupFilterText(contextUser).trim();
                if (!expanded) {
                    return {
                        blocked: {
                            Success: false,
                            ResultCode: 'PERMISSION_DENIED',
                            Message: `Agent policy Row Level Security Filter "${ found.Name || filterId }" rendered an empty predicate; failing closed.`,
                        },
                    };
                }
                clauses.push(`(${ expanded })`);
            }
        }
        return { whereClause: clauses.join(' AND ') };
    }

    private static hasRecordConditionRulesForEntity(
        policy: MJAIAgentUserPolicyEntity,
        entityInfo: EntityInfo
    ): boolean {
        const rules: MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[] = policy.EntityAccessRulesObject ?? [];
        const normalizedName = entityInfo.Name.trim().toLowerCase();
        return rules.some((rule) => {
            const cond = rule.rlsNarrowing?.recordConditionExpression;
            if (!cond || cond.trim().length === 0) {
                return false;
            }
            const pattern = rule.entityPattern?.trim().toLowerCase() ?? '';
            return (
                pattern === '*' ||
                pattern === normalizedName ||
                (pattern.includes('*') &&
                    new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i').test(
                        entityInfo.Name
                    ))
            );
        });
    }

    private static verdictToActionError(
        evalResult: EntityAccessEvaluationResult,
        params: RunActionParams
    ): ActionResultSimple | null {
        if (evalResult.verdict === 'Allow') {
            return null;
        }
        const codeMap: Record<Exclude<EntityAccessEvaluationResult['verdict'], 'Allow'>, string> = {
            Deny: 'PERMISSION_DENIED',
            RequireApproval: 'APPROVAL_REQUIRED',
            DeferUntilNextWindow: 'DEFERRED_OUTSIDE_WINDOW',
        };
        return {
            Success: false,
            ResultCode: codeMap[evalResult.verdict],
            Message: evalResult.reason,
            Params: params.Params,
        };
    }

    private static toScalarRecord(raw: Record<string, unknown>): ScalarRecord {
        const out: ScalarRecord = {};
        for (const [k, v] of Object.entries(raw)) {
            if (v === null) {
                out[k] = null;
            } else if (v === undefined) {
                out[k] = undefined;
            } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                out[k] = v;
            } else if (v instanceof Date) {
                out[k] = v.toISOString();
            } else {
                try {
                    out[k] = JSON.stringify(v);
                } catch {
                    out[k] = String(v);
                }
            }
        }
        return out;
    }
}
