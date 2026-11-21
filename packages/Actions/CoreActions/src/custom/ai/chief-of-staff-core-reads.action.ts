import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { ActionEngineServer, BaseAction } from '@memberjunction/actions';
import { EscapeSQLString, IndexByUUID, RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, LimitsConfigResolver, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJAIAgentSuggestionEntity,
    MJAIAgentUserPolicyEntity,
    MJAgentChannelEntity,
    MJAgentChannelParticipantEntity,
    MJUserEntity,
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
    MJUserRoutineRunEntity,
} from '@memberjunction/core-entities';
import {
    AgentUserPolicyEngine,
    MJAIAgentEntityExtended,
    TypedActionPolicyGuard,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { UserCache } from '@memberjunction/generic-database-provider';

const DEFAULT_AGENT_NAME = 'Chief of Staff';

function readStringParam(params: RunActionParams, name: string): string | undefined {
    const found = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
    if (found?.Value == null) {
        return undefined;
    }
    const str = String(found.Value).trim();
    return str.length > 0 ? str : undefined;
}

function readNumberParam(params: RunActionParams, name: string, fallback: number, min: number, max: number): number {
    const raw = readStringParam(params, name);
    if (!raw) {
        return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function readBooleanParam(params: RunActionParams, name: string, fallback: boolean): boolean {
    const found = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
    if (found?.Value == null) {
        return fallback;
    }
    if (typeof found.Value === 'boolean') {
        return found.Value;
    }
    const normalized = String(found.Value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
        return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return false;
    }
    return fallback;
}

function extractContextAgentId(context: unknown): string | undefined {
    if (!context || typeof context !== 'object') {
        return undefined;
    }
    const val = (context as { AgentID?: unknown }).AgentID;
    if (typeof val === 'string' && val.trim().length > 0) {
        return val.trim();
    }
    return undefined;
}

function resolveTargetAgent(params: RunActionParams): MJAIAgentEntityExtended | null {
    const explicitId = readStringParam(params, 'AgentID') ?? extractContextAgentId(params.Context);
    if (explicitId) {
        return AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, explicitId)) ?? null;
    }
    const explicitName = readStringParam(params, 'AgentName') ?? DEFAULT_AGENT_NAME;
    return (
        AIEngine.Instance.Agents.find((a) => a.Name.trim().toLowerCase() === explicitName.toLowerCase()) ??
        null
    );
}

function setOutputParam(params: RunActionParams, name: string, value: unknown): ActionParam[] {
    const existing = params.Params.find(
        (p) => p.Name.trim().toLowerCase() === name.toLowerCase() && p.Type === 'Output'
    );
    if (existing) {
        existing.Value = value;
        return params.Params;
    }
    return [
        ...params.Params,
        {
            Name: name,
            Type: 'Output',
            Value: value,
        },
    ];
}

/**
 * Returns the calling user's identity, active `MJ: AI Agent User Policies` posture,
 * granted AI skills (filtered by skill permissions), and active routine counts.
 */
@RegisterClass(BaseAction, 'Get My Agent Context')
export class GetMyAgentContextAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Get My Agent Context requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: AI Agent User Policies',
                operation: 'Read',
                contextUser,
                actionContext: params.Context,
                provider: params.Provider,
            });
            if (!guard.Allowed) {
                return {
                    Success: false,
                    ResultCode: guard.ResultCode,
                    Message: guard.Message,
                    Params: params.Params,
                };
            }

            await AIEngine.Instance.Config(false, contextUser);
            const agent = resolveTargetAgent(params);
            if (!agent) {
                return {
                    Success: false,
                    ResultCode: 'AGENT_NOT_FOUND',
                    Message: 'Could not resolve target AI Agent.',
                    Params: params.Params,
                };
            }

            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const policyLookup = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
                agent.ID,
                contextUser.ID,
                contextUser,
                { provider: md }
            );
            const policy: MJAIAgentUserPolicyEntity | null =
                policyLookup.status === 'found' ? policyLookup.policy : null;

            const skillsById = IndexByUUID(AIEngine.Instance.Skills, (s) => s.ID);
            const agentSkillLinks = AIEngine.Instance.AgentSkills.filter((link) =>
                UUIDsEqual(link.AgentID, agent.ID) && link.Status === 'Active'
            );
            const grantedSkills = agentSkillLinks
                .map((link) => {
                    const skill = skillsById.Get(link.SkillID);
                    if (!skill || skill.Status !== 'Active') {
                        return null;
                    }
                    return {
                        SkillID: skill.ID,
                        Name: skill.Name,
                        Description: skill.Description,
                        Status: link.Status,
                    };
                })
                .filter((s): s is NonNullable<typeof s> => s !== null);

            const rv = RunView.FromMetadataProvider(md);
            const routinesResult = await rv.RunView<{ ID: string; Status: string }>(
                {
                    EntityName: 'MJ: User Routines',
                    ExtraFilter: `UserID='${EscapeSQLString(contextUser.ID)}' AND TargetID='${EscapeSQLString(agent.ID)}'`,
                    Fields: ['ID', 'Status'],
                    ResultType: 'simple',
                },
                contextUser
            );
            const routines = routinesResult.Success ? routinesResult.Results : [];
            const activeRoutineCount = routines.filter((r) => r.Status === 'Active').length;

            const policySummary = policy
                ? TypedActionPolicyGuard.MaskRecord(
                      {
                          PolicyID: policy.ID,
                          Status: policy.Status,
                          OnboardingStatus: policy.OnboardingStatus,
                          DisplayNameOverride: policy.DisplayNameOverride,
                          PreferredPersonaID: policy.PreferredPersonaID,
                          PreferredPersona: policy.PreferredPersona,
                          CoordinationMode: policy.CoordinationMode,
                          DefaultDataAccessMode: policy.DefaultDataAccessMode,
                          EmailChannelMode: policy.EmailChannelMode,
                          PhoneChannelMode: policy.PhoneChannelMode,
                          MessagingChannelMode: policy.MessagingChannelMode,
                          CalendarChannelMode: policy.CalendarChannelMode,
                          AllowInterAgentCoordination: policy.AllowInterAgentCoordination,
                          RequireApprovalForExternalComms: policy.RequireApprovalForExternalComms,
                          RequireApprovalForFinancials: policy.RequireApprovalForFinancials,
                          RequireApprovalForDestructiveActions: policy.RequireApprovalForDestructiveActions,
                          HasInstructionsOverride: Boolean(policy.InstructionsOverride?.trim()),
                          InstructionsOverrideLength: policy.InstructionsOverride?.length ?? 0,
                      },
                      guard.DeniedFieldPatterns
                  )
                : null;

            const payload = {
                User: {
                    UserID: contextUser.ID,
                    Name: contextUser.Name,
                    Email: contextUser.Email,
                    FirstName: contextUser.FirstName,
                    LastName: contextUser.LastName,
                },
                Agent: {
                    AgentID: agent.ID,
                    Name: agent.Name,
                },
                Policy: policySummary,
                GrantedSkills: grantedSkills,
                Routines: {
                    TotalCount: routines.length,
                    ActiveCount: activeRoutineCount,
                },
            };

            const outParams = setOutputParam(params, 'ContextJSON', JSON.stringify(payload));
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: outParams,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[GetMyAgentContextAction] ${msg}`);
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: msg,
                Params: params.Params,
            };
        }
    }
}

/**
 * Deterministic single-call briefing assembler.
 *
 * Reads `AIEngine.Instance.GetBriefingActionsForAgent(agent, contextUser)` — every action
 * bound with `AISkillAction.Role IN ('Briefing', 'Both')` on the agent's active granted skills
 * that the user is permitted to use — executes them in parallel as `ContextUser`, and combines
 * their payloads with core Chief of Staff state (pending approvals, active routines, open/paused
 * Agent Channels, and offered suggestions).
 */
@RegisterClass(BaseAction, 'Assemble My Briefing')
export class AssembleMyBriefingAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Assemble My Briefing requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const resolvedLimits = LimitsConfigResolver.Resolve().Limits;
            const horizonDays = readNumberParam(params, 'HorizonDays', 7, 1, 30);
            const contributorTimeoutMs = readNumberParam(
                params,
                'ContributorTimeoutMs',
                resolvedLimits.BriefingContributorTimeoutMs,
                20,
                60_000
            );
            const maxContributorChars = readNumberParam(
                params,
                'MaxContributorChars',
                resolvedLimits.BriefingMaxContributorChars,
                100,
                524_288
            );
            const includeSkillNamesRaw = readStringParam(params, 'IncludeSkillNames');
            const includeSkillSet = includeSkillNamesRaw
                ? new Set(
                      includeSkillNamesRaw
                          .split(',')
                          .map((s) => s.trim().toLowerCase())
                          .filter(Boolean)
                  )
                : null;

            await Promise.all([
                AIEngine.Instance.Config(false, contextUser),
                ActionEngineServer.Instance.Config(false, contextUser),
            ]);

            const agent = resolveTargetAgent(params);
            if (!agent) {
                return {
                    Success: false,
                    ResultCode: 'AGENT_NOT_FOUND',
                    Message: 'Could not resolve target AI Agent for Assemble My Briefing.',
                    Params: params.Params,
                };
            }

            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const briefingEntries = AIEngine.Instance.GetBriefingActionsForAgent(agent, contextUser).filter(
                (entry) => !includeSkillSet || includeSkillSet.has(entry.skill.Name.trim().toLowerCase())
            );

            const [coreState, skillBriefings] = await Promise.all([
                this.loadCoreBriefingState(agent.ID, contextUser, params.Context, md),
                Promise.all(
                    briefingEntries.map((entry) =>
                        this.runBriefingContributor(
                            entry.skill.Name,
                            entry.actionID,
                            agent.ID,
                            horizonDays,
                            contributorTimeoutMs,
                            maxContributorChars,
                            params
                        )
                    )
                ),
            ]);

            const payload = {
                GeneratedAtISO: new Date().toISOString(),
                HorizonDays: horizonDays,
                Agent: { AgentID: agent.ID, Name: agent.Name },
                User: { UserID: contextUser.ID, Name: contextUser.Name, Email: contextUser.Email },
                Core: coreState,
                SkillBriefings: skillBriefings,
            };

            const outParams = setOutputParam(params, 'BriefingJSON', JSON.stringify(payload));
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: outParams,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[AssembleMyBriefingAction] ${msg}`);
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: msg,
                Params: params.Params,
            };
        }
    }

    private async loadCoreBriefingState(
        agentId: string,
        contextUser: UserInfo,
        actionContext: unknown,
        md: IMetadataProvider
    ): Promise<Record<string, unknown>> {
        const rv = RunView.FromMetadataProvider(md);
        const safeUserId = EscapeSQLString(contextUser.ID);
        const safeAgentId = EscapeSQLString(agentId);

        const [approvalsGuard, routinesGuard, channelsGuard, suggestionsGuard] = await Promise.all([
            TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: AI Agent Requests',
                operation: 'Read',
                contextUser,
                actionContext,
                provider: md,
            }),
            TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: User Routines',
                operation: 'Read',
                contextUser,
                actionContext,
                provider: md,
            }),
            TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: Agent Channels',
                operation: 'Read',
                contextUser,
                actionContext,
                provider: md,
            }),
            TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: AI Agent Suggestions',
                operation: 'Read',
                contextUser,
                actionContext,
                provider: md,
            }),
        ]);

        const [approvalsRes, routinesRes, participantRes, suggestionsRes] = await Promise.all([
            approvalsGuard.Allowed
                ? rv.RunView<MJAIAgentRequestEntity>(
                      {
                          EntityName: 'MJ: AI Agent Requests',
                          ExtraFilter: `RequestForUserID='${safeUserId}' AND Status='Requested'`,
                          OrderBy: '__mj_CreatedAt DESC',
                          MaxRows: 25,
                          ResultType: 'entity_object',
                      },
                      contextUser
                  )
                : Promise.resolve({ Success: false, Results: [] as MJAIAgentRequestEntity[] }),
            routinesGuard.Allowed
                ? rv.RunView<MJUserRoutineEntity>(
                      {
                          EntityName: 'MJ: User Routines',
                          ExtraFilter: `UserID='${safeUserId}' AND TargetID='${safeAgentId}' AND Status='Active'`,
                          OrderBy: 'NextRunAt ASC',
                          MaxRows: 25,
                          ResultType: 'entity_object',
                      },
                      contextUser
                  )
                : Promise.resolve({ Success: false, Results: [] as MJUserRoutineEntity[] }),
            channelsGuard.Allowed
                ? rv.RunView<MJAgentChannelParticipantEntity>(
                      {
                          EntityName: 'MJ: Agent Channel Participants',
                          ExtraFilter: `UserID='${safeUserId}'`,
                          MaxRows: 25,
                          ResultType: 'entity_object',
                      },
                      contextUser
                  )
                : Promise.resolve({ Success: false, Results: [] as MJAgentChannelParticipantEntity[] }),
            suggestionsGuard.Allowed
                ? rv.RunView<MJAIAgentSuggestionEntity>(
                      {
                          EntityName: 'MJ: AI Agent Suggestions',
                          ExtraFilter: `UserID='${safeUserId}' AND AgentID='${safeAgentId}' AND Status='Offered'`,
                          OrderBy: 'OfferedAt DESC',
                          MaxRows: 10,
                          ResultType: 'entity_object',
                      },
                      contextUser
                  )
                : Promise.resolve({ Success: false, Results: [] as MJAIAgentSuggestionEntity[] }),
        ]);

        let activeChannels: Array<Record<string, unknown>> = [];
        if (channelsGuard.Allowed && participantRes.Success && participantRes.Results.length > 0) {
            const channelIds = participantRes.Results.map((p) => `'${EscapeSQLString(p.AgentChannelID)}'`).join(',');
            const chanRes = await rv.RunView<MJAgentChannelEntity>(
                {
                    EntityName: 'MJ: Agent Channels',
                    ExtraFilter: `ID IN (${channelIds}) AND ChannelStatus IN ('Open', 'Paused For Human')`,
                    OrderBy: '__mj_UpdatedAt DESC',
                    MaxRows: 25,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            if (chanRes.Success) {
                activeChannels = TypedActionPolicyGuard.MaskRows(
                    chanRes.Results.map((c) => ({
                        ChannelID: c.ID,
                        Topic: c.Topic,
                        ChannelStatus: c.ChannelStatus,
                        ConsecutiveAgentTurns: c.ConsecutiveAgentTurns,
                        MaxConsecutiveAgentTurns: c.MaxConsecutiveAgentTurns,
                        ReplyBy: c.ReplyBy?.toISOString() ?? null,
                    })),
                    channelsGuard.DeniedFieldPatterns
                );
            }
        }

        const pendingApprovals =
            approvalsGuard.Allowed && approvalsRes.Success
                ? TypedActionPolicyGuard.MaskRows(
                      approvalsRes.Results.map((r) => ({
                          RequestID: r.ID,
                          Status: r.Status,
                          Priority: r.Priority,
                          Request: r.Request,
                          ExpiresAt: r.ExpiresAt?.toISOString() ?? null,
                          CreatedAt: r.__mj_CreatedAt?.toISOString() ?? null,
                      })),
                      approvalsGuard.DeniedFieldPatterns
                  )
                : [];

        const activeRoutines =
            routinesGuard.Allowed && routinesRes.Success
                ? TypedActionPolicyGuard.MaskRows(
                      routinesRes.Results.map((r) => ({
                          RoutineID: r.ID,
                          Name: r.Name,
                          ScheduleMode: r.ScheduleMode,
                          CronExpression: r.CronExpression,
                          NextRunAt: r.NextRunAt?.toISOString() ?? null,
                          WorkstreamKey: r.WakeConfigurationObject?.workstreamKey ?? null,
                      })),
                      routinesGuard.DeniedFieldPatterns
                  )
                : [];

        const openSuggestions =
            suggestionsGuard.Allowed && suggestionsRes.Success
                ? TypedActionPolicyGuard.MaskRows(
                      suggestionsRes.Results.map((s) => ({
                          SuggestionID: s.ID,
                          Kind: s.Kind,
                          TargetKey: s.TargetKey,
                          Summary: s.Summary,
                          OfferedAt: s.OfferedAt?.toISOString() ?? null,
                      })),
                      suggestionsGuard.DeniedFieldPatterns
                  )
                : [];

        return {
            PendingApprovals: pendingApprovals,
            ActiveRoutines: activeRoutines,
            AgentChannels: activeChannels,
            OpenSuggestions: openSuggestions,
        };
    }

    private async runBriefingContributor(
        skillName: string,
        actionId: string,
        agentId: string,
        horizonDays: number,
        contributorTimeoutMs: number,
        maxContributorChars: number,
        parentParams: RunActionParams
    ): Promise<Record<string, unknown>> {
        const action = ActionEngineServer.Instance.Actions.find((a) => UUIDsEqual(a.ID, actionId));
        if (!action) {
            return {
                SkillName: skillName,
                ActionID: actionId,
                ActionName: null,
                Success: false,
                ResultCode: 'ACTION_NOT_FOUND',
                Data: null,
                Error: `Briefing action ${actionId} is not registered in ActionEngineServer.`,
            };
        }

        const timeoutSentinel = Symbol('BRIEFING_CONTRIBUTOR_TIMEOUT');
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        try {
            const runPromise = ActionEngineServer.Instance.RunAction({
                Action: action,
                Params: [
                    { Name: 'HorizonDays', Type: 'Input', Value: horizonDays },
                    { Name: 'AgentID', Type: 'Input', Value: agentId },
                ],
                Filters: [],
                ContextUser: parentParams.ContextUser,
                Context: parentParams.Context,
                Provider: parentParams.Provider,
                SkipActionLog: false,
            });
            // Prevent unhandled rejection if the action rejects after the timeout has already won the race.
            runPromise.catch(() => undefined);

            const timeoutPromise = new Promise<typeof timeoutSentinel>((resolve) => {
                timeoutHandle = setTimeout(() => resolve(timeoutSentinel), contributorTimeoutMs);
            });

            const raced = await Promise.race([runPromise, timeoutPromise]);
            if (raced === timeoutSentinel) {
                return {
                    SkillName: skillName,
                    ActionID: action.ID,
                    ActionName: action.Name,
                    Success: false,
                    ResultCode: 'TIMEOUT',
                    Data: null,
                    Error: `Briefing contributor "${action.Name}" timed out after ${contributorTimeoutMs}ms.`,
                };
            }

            const result = raced;
            const parsedData =
                result.Message && (result.Message.trim().startsWith('{') || result.Message.trim().startsWith('['))
                    ? SafeJSONParse<Record<string, unknown>>(result.Message)
                    : null;

            const outputParams: Record<string, unknown> = {};
            for (const p of result.Params ?? []) {
                if ((p.Type === 'Output' || p.Type === 'Both') && p.Value !== undefined && p.Value !== null) {
                    if (typeof p.Value === 'string') {
                        const trimmed = p.Value.trim();
                        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                            const parsed = SafeJSONParse<unknown>(trimmed);
                            outputParams[p.Name] = parsed ?? p.Value;
                            continue;
                        }
                    }
                    outputParams[p.Name] = p.Value;
                }
            }
            const hasOutputs = Object.keys(outputParams).length > 0;
            const rawContributorData: unknown = parsedData
                ? hasOutputs
                    ? { ...parsedData, Outputs: outputParams }
                    : parsedData
                : hasOutputs
                  ? { Summary: result.Message ?? null, ...outputParams }
                  : result.Message ?? null;

            const contributorData = this.capContributorPayload(rawContributorData, maxContributorChars);

            return {
                SkillName: skillName,
                ActionID: action.ID,
                ActionName: action.Name,
                Success: result.Success,
                ResultCode: result.Result?.ResultCode ?? (result.Success ? 'SUCCESS' : 'ERROR'),
                Data: contributorData,
                Error: result.Success ? null : result.Message ?? 'Briefing contributor failed.',
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[AssembleMyBriefingAction] Contributor "${action.Name}" failed: ${msg}`);
            return {
                SkillName: skillName,
                ActionID: action.ID,
                ActionName: action.Name,
                Success: false,
                ResultCode: 'ERROR',
                Data: null,
                Error: msg,
            };
        } finally {
            if (timeoutHandle !== null) {
                clearTimeout(timeoutHandle);
            }
        }
    }

    private capContributorPayload(data: unknown, maxChars: number): unknown {
        if (data === null || data === undefined) {
            return data;
        }
        const serialized = typeof data === 'string' ? data : JSON.stringify(data);
        if (typeof serialized !== 'string' || serialized.length <= maxChars) {
            return data;
        }
        return {
            Truncated: true,
            OriginalChars: serialized.length,
            Preview: serialized.slice(0, maxChars),
        };
    }
}

/**
 * Lists the calling user's `MJ: User Routines` for the active agent.
 */
@RegisterClass(BaseAction, 'List My Agent Routines')
export class ListMyAgentRoutinesAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'List My Agent Routines requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: User Routines',
                operation: 'Read',
                contextUser,
                actionContext: params.Context,
                provider: params.Provider,
            });
            if (!guard.Allowed) {
                return {
                    Success: false,
                    ResultCode: guard.ResultCode,
                    Message: guard.Message,
                    Params: params.Params,
                };
            }

            await AIEngine.Instance.Config(false, contextUser);
            const agent = resolveTargetAgent(params);
            const statusFilter = readStringParam(params, 'Status');
            const workstreamFilter = readStringParam(params, 'WorkstreamKey')?.toLowerCase();
            const maxRows = readNumberParam(params, 'MaxRows', 50, 1, 100);

            const clauses: string[] = [`UserID='${EscapeSQLString(contextUser.ID)}'`];
            if (agent) {
                clauses.push(`TargetID='${EscapeSQLString(agent.ID)}'`);
            }
            if (statusFilter && statusFilter.toLowerCase() !== 'all') {
                clauses.push(`Status='${EscapeSQLString(statusFilter)}'`);
            }

            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const rv = RunView.FromMetadataProvider(md);
            const res = await rv.RunView<MJUserRoutineEntity>(
                {
                    EntityName: 'MJ: User Routines',
                    ExtraFilter: clauses.join(' AND '),
                    OrderBy: 'NextRunAt ASC, __mj_UpdatedAt DESC',
                    MaxRows: maxRows,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            if (!res.Success) {
                return {
                    Success: false,
                    ResultCode: 'QUERY_FAILED',
                    Message: res.ErrorMessage || 'Failed to load user routines.',
                    Params: params.Params,
                };
            }

            const rows = res.Results.map((r) => {
                const cfg: Partial<MJUserRoutineEntity_IRoutineWakeConfiguration> =
                    r.WakeConfigurationObject ??
                    (r.WakeConfiguration
                        ? SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(r.WakeConfiguration) ?? {}
                        : {});
                return {
                    RoutineID: r.ID,
                    Name: r.Name,
                    RoutineType: r.RoutineType,
                    ScheduleMode: r.ScheduleMode,
                    Status: r.Status,
                    CronExpression: r.CronExpression,
                    Timezone: r.Timezone,
                    NextRunAt: r.NextRunAt?.toISOString() ?? null,
                    LastRunAt: r.LastRunAt?.toISOString() ?? null,
                    WorkstreamKey: cfg.workstreamKey ?? null,
                    WakeReason: cfg.wakeReason ?? null,
                    Description: r.Description,
                };
            }).filter((row) => !workstreamFilter || (row.WorkstreamKey ?? '').toLowerCase() === workstreamFilter);

            const masked = TypedActionPolicyGuard.MaskRows(rows, guard.DeniedFieldPatterns);
            const payload = { Count: masked.length, Routines: masked };
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: setOutputParam(params, 'RoutinesJSON', JSON.stringify(payload)),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[ListMyAgentRoutinesAction] ${msg}`);
            return { Success: false, ResultCode: 'ERROR', Message: msg, Params: params.Params };
        }
    }
}

/**
 * Retrieves recent run history (`MJ: User Routine Runs`) for the caller's routines.
 */
@RegisterClass(BaseAction, 'Get Routine Run Results')
export class GetRoutineRunResultsAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Get Routine Run Results requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: User Routine Runs',
                operation: 'Read',
                contextUser,
                actionContext: params.Context,
                provider: params.Provider,
            });
            if (!guard.Allowed) {
                return {
                    Success: false,
                    ResultCode: guard.ResultCode,
                    Message: guard.Message,
                    Params: params.Params,
                };
            }

            const routineId = readStringParam(params, 'RoutineID');
            const workstreamKey = readStringParam(params, 'WorkstreamKey')?.toLowerCase();
            const maxRows = readNumberParam(params, 'MaxRows', 10, 1, 50);

            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const rv = RunView.FromMetadataProvider(md);

            // Always verify routine ownership against ContextUser first
            const routineClauses = [`UserID='${EscapeSQLString(contextUser.ID)}'`];
            if (routineId) {
                routineClauses.push(`ID='${EscapeSQLString(routineId)}'`);
            }
            const routinesRes = await rv.RunView<MJUserRoutineEntity>(
                {
                    EntityName: 'MJ: User Routines',
                    ExtraFilter: routineClauses.join(' AND '),
                    MaxRows: 50,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            const ownedRoutines = (routinesRes.Success ? routinesRes.Results : []).filter((r) => {
                if (!workstreamKey) {
                    return true;
                }
                const key = r.WakeConfigurationObject?.workstreamKey?.toLowerCase();
                return key === workstreamKey;
            });

            if (ownedRoutines.length === 0) {
                const empty = { Count: 0, Runs: [] };
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: JSON.stringify(empty),
                    Params: setOutputParam(params, 'RunsJSON', JSON.stringify(empty)),
                };
            }

            const inClause = ownedRoutines.map((r) => `'${EscapeSQLString(r.ID)}'`).join(',');
            const runsRes = await rv.RunView<MJUserRoutineRunEntity>(
                {
                    EntityName: 'MJ: User Routine Runs',
                    ExtraFilter: `RoutineID IN (${inClause})`,
                    OrderBy: 'StartedAt DESC',
                    MaxRows: maxRows,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            if (!runsRes.Success) {
                return {
                    Success: false,
                    ResultCode: 'QUERY_FAILED',
                    Message: runsRes.ErrorMessage || 'Failed to load routine runs.',
                    Params: params.Params,
                };
            }

            const rows = TypedActionPolicyGuard.MaskRows(
                runsRes.Results.map((run) => ({
                    RunID: run.ID,
                    RoutineID: run.RoutineID,
                    RoutineName: run.Routine,
                    Status: run.Status,
                    StartedAt: run.StartedAt?.toISOString() ?? null,
                    CompletedAt: run.CompletedAt?.toISOString() ?? null,
                    AgentRunID: run.AgentRunID,
                    ResultSummary: run.ResultSummary,
                    NotificationSent: run.NotificationSent,
                    ErrorMessage: run.ErrorMessage,
                })),
                guard.DeniedFieldPatterns
            );

            const payload = { Count: rows.length, Runs: rows };
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: setOutputParam(params, 'RunsJSON', JSON.stringify(payload)),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[GetRoutineRunResultsAction] ${msg}`);
            return { Success: false, ResultCode: 'ERROR', Message: msg, Params: params.Params };
        }
    }
}

/**
 * Lists pending (or filtered-status) `MJ: AI Agent Requests` for the calling user.
 */
@RegisterClass(BaseAction, 'List My Pending Approvals')
export class ListMyPendingApprovalsAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'List My Pending Approvals requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: AI Agent Requests',
                operation: 'Read',
                contextUser,
                actionContext: params.Context,
                provider: params.Provider,
            });
            if (!guard.Allowed) {
                return {
                    Success: false,
                    ResultCode: guard.ResultCode,
                    Message: guard.Message,
                    Params: params.Params,
                };
            }

            const status = readStringParam(params, 'Status') ?? 'Requested';
            const maxRows = readNumberParam(params, 'MaxRows', 50, 1, 100);
            const clauses = [`RequestForUserID='${EscapeSQLString(contextUser.ID)}'`];
            if (status.toLowerCase() !== 'all') {
                clauses.push(`Status='${EscapeSQLString(status)}'`);
            }

            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const rv = RunView.FromMetadataProvider(md);
            const res = await rv.RunView<MJAIAgentRequestEntity>(
                {
                    EntityName: 'MJ: AI Agent Requests',
                    ExtraFilter: clauses.join(' AND '),
                    OrderBy: 'Priority DESC, __mj_CreatedAt DESC',
                    MaxRows: maxRows,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            if (!res.Success) {
                return {
                    Success: false,
                    ResultCode: 'QUERY_FAILED',
                    Message: res.ErrorMessage || 'Failed to load pending approvals.',
                    Params: params.Params,
                };
            }

            const rows = TypedActionPolicyGuard.MaskRows(
                res.Results.map((r) => ({
                    RequestID: r.ID,
                    AgentID: r.AgentID,
                    Status: r.Status,
                    Priority: r.Priority,
                    Request: r.Request,
                    Response: r.Response,
                    Comments: r.Comments,
                    ExpiresAt: r.ExpiresAt?.toISOString() ?? null,
                    CreatedAt: r.__mj_CreatedAt?.toISOString() ?? null,
                    RespondedAt: r.RespondedAt?.toISOString() ?? null,
                })),
                guard.DeniedFieldPatterns
            );

            const payload = { Count: rows.length, Approvals: rows };
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: setOutputParam(params, 'ApprovalsJSON', JSON.stringify(payload)),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[ListMyPendingApprovalsAction] ${msg}`);
            return { Success: false, ResultCode: 'ERROR', Message: msg, Params: params.Params };
        }
    }
}

/**
 * Disables/cancels an active wake routine owned by `ContextUser` by `RoutineID` or `WorkstreamKey`.
 */
@RegisterClass(BaseAction, 'Cancel Agent Wake')
export class CancelAgentWakeAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Cancel Agent Wake requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const routineId = readStringParam(params, 'RoutineID');
            const workstreamKey = readStringParam(params, 'WorkstreamKey');
            if (!routineId && !workstreamKey) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Provide either RoutineID or WorkstreamKey to cancel an agent wake.',
                    Params: params.Params,
                };
            }

            const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: User Routines',
                operation: 'Update',
                writeFields: ['Status', 'NextRunAt', 'Description'],
                contextUser,
                actionContext: params.Context,
                provider: params.Provider,
            });
            if (!guard.Allowed) {
                return {
                    Success: false,
                    ResultCode: guard.ResultCode,
                    Message: guard.Message,
                    Params: params.Params,
                };
            }

            await AIEngine.Instance.Config(false, contextUser);
            const agent = resolveTargetAgent(params);
            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const rv = RunView.FromMetadataProvider(md);

            const clauses = [`UserID='${EscapeSQLString(contextUser.ID)}'`];
            if (routineId) {
                clauses.push(`ID='${EscapeSQLString(routineId)}'`);
            } else if (agent) {
                clauses.push(`TargetID='${EscapeSQLString(agent.ID)}'`);
            }

            const res = await rv.RunView<MJUserRoutineEntity>(
                {
                    EntityName: 'MJ: User Routines',
                    ExtraFilter: clauses.join(' AND '),
                    MaxRows: 50,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            const candidates = res.Success ? res.Results : [];
            const target = routineId
                ? candidates[0] ?? null
                : candidates.find(
                      (r) =>
                          (r.WakeConfigurationObject?.workstreamKey ?? '').toLowerCase() ===
                          workstreamKey!.toLowerCase()
                  ) ?? null;

            if (!target) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `No routine found for ${routineId ? `RoutineID "${routineId}"` : `WorkstreamKey "${workstreamKey}"`}.`,
                    Params: params.Params,
                };
            }

            const reason = readStringParam(params, 'Reason');
            target.Status = 'Disabled';
            target.NextRunAt = null;
            if (reason) {
                target.Description = reason;
            }
            const saved = await target.Save();
            if (!saved) {
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: target.LatestResult?.CompleteMessage || 'Failed to cancel agent wake routine.',
                    Params: params.Params,
                };
            }

            const payload = {
                RoutineID: target.ID,
                Name: target.Name,
                WorkstreamKey: target.WakeConfigurationObject?.workstreamKey ?? workstreamKey ?? null,
                Status: target.Status,
            };
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: setOutputParam(params, 'RoutineID', target.ID),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[CancelAgentWakeAction] ${msg}`);
            return { Success: false, ResultCode: 'ERROR', Message: msg, Params: params.Params };
        }
    }
}

/**
 * Searches active internal colleagues (`MJ: Users`) by name or email, returning non-sensitive
 * directory info and whether each colleague accepts inter-agent coordination.
 */
@RegisterClass(BaseAction, 'Find Colleague')
export class FindColleagueAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Find Colleague requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const query = readStringParam(params, 'Query');
            if (!query) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Query (name or email) is required for Find Colleague.',
                    Params: params.Params,
                };
            }

            const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: Users',
                operation: 'Read',
                contextUser,
                actionContext: params.Context,
                provider: params.Provider,
            });
            if (!guard.Allowed) {
                return {
                    Success: false,
                    ResultCode: guard.ResultCode,
                    Message: guard.Message,
                    Params: params.Params,
                };
            }

            const maxRows = readNumberParam(params, 'MaxRows', 10, 1, 25);
            const includeSelf = readBooleanParam(params, 'IncludeSelf', false);
            const safeLike = EscapeSQLString(query);
            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const rv = RunView.FromMetadataProvider(md);

            const res = await rv.RunView<MJUserEntity>(
                {
                    EntityName: 'MJ: Users',
                    ExtraFilter:
                        `IsActive=1 AND (Name LIKE '%${safeLike}%' OR FirstName LIKE '%${safeLike}%'` +
                        ` OR LastName LIKE '%${safeLike}%' OR Email LIKE '%${safeLike}%')`,
                    OrderBy: 'Name ASC',
                    MaxRows: maxRows,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            if (!res.Success) {
                return {
                    Success: false,
                    ResultCode: 'QUERY_FAILED',
                    Message: res.ErrorMessage || 'Failed to search colleagues.',
                    Params: params.Params,
                };
            }

            await AIEngine.Instance.Config(false, contextUser);
            const cosAgent = resolveTargetAgent(params);
            const systemUser = UserCache.Instance.GetSystemUser() ?? contextUser;

            const filteredUsers = res.Results.filter(
                (u) => includeSelf || !UUIDsEqual(u.ID, contextUser.ID)
            );

            const colleagues = await Promise.all(
                filteredUsers.map(async (u) => {
                    let acceptsInterAgent = false;
                    if (cosAgent) {
                        const pol = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
                            cosAgent.ID,
                            u.ID,
                            systemUser,
                            { provider: md }
                        );
                        if (pol.status === 'found' && pol.policy) {
                            acceptsInterAgent =
                                pol.policy.Status === 'Active' && pol.policy.AllowInterAgentCoordination !== false;
                        }
                    }
                    return {
                        UserID: u.ID,
                        Name: u.Name,
                        FirstName: u.FirstName,
                        LastName: u.LastName,
                        Email: u.Email,
                        Title: u.Title,
                        AcceptsInterAgentCoordination: acceptsInterAgent,
                    };
                })
            );

            const masked = TypedActionPolicyGuard.MaskRows(colleagues, guard.DeniedFieldPatterns);
            const payload = { Count: masked.length, Colleagues: masked };
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: setOutputParam(params, 'ColleaguesJSON', JSON.stringify(payload)),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[FindColleagueAction] ${msg}`);
            return { Success: false, ResultCode: 'ERROR', Message: msg, Params: params.Params };
        }
    }
}
