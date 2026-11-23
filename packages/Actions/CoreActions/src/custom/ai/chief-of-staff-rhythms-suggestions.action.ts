import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { EscapeSQLString, RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata, RunView } from '@memberjunction/core';
import {
    MJAIAgentRhythmTemplateEntity,
    MJAIAgentSuggestionEntity,
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
} from '@memberjunction/core-entities';
import { AgentUserPolicyEngine, MJAIAgentEntityExtended, TypedActionPolicyGuard } from '@memberjunction/ai-core-plus';
import {
    CheckActivePolicyForAgentAndUser,
    ResolveAgentConfigurationIDInput,
    ResolveDefaultTierForWorkstreamKey,
    ResolveRoutineSeededAgentConfigurationID,
} from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import {
    VerifyActiveRhythmTemplate,
    VerifyApprovedAgentRequest,
} from './chief-of-staff-approval-helper';

const DEFAULT_AGENT_NAME = 'Chief of Staff';

interface ActionRunContext {
    AgentID?: string;
}

type ActionOutputValue = string | number | boolean | object | null | undefined;

function readStringParam(params: RunActionParams, name: string): string | undefined {
    const found = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
    if (found?.Value == null) {
        return undefined;
    }
    const str = String(found.Value).trim();
    return str.length > 0 ? str : undefined;
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

function extractContextAgentId(context: ActionRunContext | null | undefined): string | undefined {
    if (!context || typeof context !== 'object') {
        return undefined;
    }
    const val = context.AgentID;
    return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;
}

function resolveTargetAgent(params: RunActionParams): MJAIAgentEntityExtended | null {
    const explicitId = readStringParam(params, 'AgentID') ?? extractContextAgentId(params.Context as ActionRunContext | null | undefined);
    if (explicitId) {
        return AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, explicitId)) ?? null;
    }
    const explicitName = readStringParam(params, 'AgentName') ?? DEFAULT_AGENT_NAME;
    return (
        AIEngine.Instance.Agents.find((a) => a.Name.trim().toLowerCase() === explicitName.toLowerCase()) ??
        null
    );
}

function setOutputParam(params: RunActionParams, name: string, value: ActionOutputValue): ActionParam[] {
    const existing = params.Params.find(
        (p) => p.Name.trim().toLowerCase() === name.toLowerCase() && p.Type === 'Output'
    );
    if (existing) {
        existing.Value = value;
        return params.Params;
    }
    return [...params.Params, { Name: name, Type: 'Output', Value: value }];
}

/**
 * Lists offered `MJ: AI Agent Rhythm Templates` available for the agent, annotated with
 * whether the calling user already has an active routine or a prior suggestion response
 * (`Offered`, `Accepted`, `Declined`) for each template's `WorkstreamKey`.
 */
@RegisterClass(BaseAction, 'List Available Rhythms')
export class ListAvailableRhythmsAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'List Available Rhythms requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: AI Agent Rhythm Templates',
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

            const offerAtFilter = readStringParam(params, 'OfferAt')?.toLowerCase();
            const includeEnabled = readBooleanParam(params, 'IncludeEnabled', true);
            const includeDeclined = readBooleanParam(params, 'IncludeDeclined', false);

            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const rv = RunView.FromMetadataProvider(md);
            const safeAgentId = EscapeSQLString(agent.ID);
            const safeUserId = EscapeSQLString(contextUser.ID);

            const [templatesRes, routinesRes, suggestionsRes] = await Promise.all([
                rv.RunView<MJAIAgentRhythmTemplateEntity>(
                    {
                        EntityName: 'MJ: AI Agent Rhythm Templates',
                        ExtraFilter: `AgentID='${safeAgentId}' AND Status='Active'`,
                        OrderBy: 'Name ASC',
                        ResultType: 'entity_object',
                    },
                    contextUser
                ),
                rv.RunView<MJUserRoutineEntity>(
                    {
                        EntityName: 'MJ: User Routines',
                        ExtraFilter: `UserID='${safeUserId}' AND TargetID='${safeAgentId}'`,
                        ResultType: 'entity_object',
                    },
                    contextUser
                ),
                rv.RunView<MJAIAgentSuggestionEntity>(
                    {
                        EntityName: 'MJ: AI Agent Suggestions',
                        ExtraFilter: `UserID='${safeUserId}' AND AgentID='${safeAgentId}' AND Kind='Rhythm'`,
                        OrderBy: 'OfferedAt DESC',
                        ResultType: 'entity_object',
                    },
                    contextUser
                ),
            ]);

            if (!templatesRes.Success) {
                return {
                    Success: false,
                    ResultCode: 'QUERY_FAILED',
                    Message: templatesRes.ErrorMessage || 'Failed to load rhythm templates.',
                    Params: params.Params,
                };
            }

            const grantedSkillIds = new Set(
                AIEngine.Instance.AgentSkills.filter((s) => UUIDsEqual(s.AgentID, agent.ID)).map((s) =>
                    s.SkillID.toLowerCase()
                )
            );

            const routineByWorkstream = new Map<string, MJUserRoutineEntity>();
            for (const r of routinesRes.Success ? routinesRes.Results : []) {
                const key = r.WakeConfigurationObject?.workstreamKey?.trim().toLowerCase();
                if (key) {
                    routineByWorkstream.set(key, r);
                }
            }

            const suggestionByKey = new Map<string, MJAIAgentSuggestionEntity>();
            for (const s of suggestionsRes.Success ? suggestionsRes.Results : []) {
                const key = s.TargetKey.trim().toLowerCase();
                if (!suggestionByKey.has(key)) {
                    suggestionByKey.set(key, s);
                }
            }

            const filteredTemplates = templatesRes.Results.filter((t) => {
                // Only offer skill-contributed rhythms whose skill is granted to the agent
                if (t.SkillID && !grantedSkillIds.has(t.SkillID.toLowerCase())) {
                    return false;
                }
                if (offerAtFilter && offerAtFilter !== 'all') {
                    const tplOffer = t.OfferAt.toLowerCase();
                    if (tplOffer !== 'both' && tplOffer !== offerAtFilter) {
                        return false;
                    }
                }
                const key = t.WorkstreamKey.trim().toLowerCase();
                const routine = routineByWorkstream.get(key);
                const isEnabled = routine?.Status === 'Active';
                if (!includeEnabled && isEnabled) {
                    return false;
                }
                const suggestion = suggestionByKey.get(key);
                if (!includeDeclined && suggestion?.Status === 'Declined') {
                    return false;
                }
                return true;
            });

            // Lazily resolve catalog fallback configuration IDs only when any filtered template
            // has a null DefaultAgentConfigurationID in DB.
            const fallbackConfigIdByTierName = new Map<string, string | null>();
            const needsCatalogLookup = filteredTemplates.some(
                (t) => !t.DefaultAgentConfigurationID && Boolean(ResolveDefaultTierForWorkstreamKey(t.WorkstreamKey))
            );
            if (needsCatalogLookup) {
                const cfgRes = await rv.RunView<{ ID: string; Name: string; Status: string }>(
                    {
                        EntityName: 'MJ: AI Configurations',
                        ExtraFilter: "Name IN ('Fast', 'Standard', 'High Power')",
                        Fields: ['ID', 'Name', 'Status'],
                        OrderBy: 'Status ASC, Name ASC',
                        MaxRows: 20,
                        ResultType: 'simple',
                    },
                    contextUser
                );
                if (cfgRes.Success) {
                    for (const row of cfgRes.Results) {
                        const normalizedName = row.Name.trim().toLowerCase();
                        if (!fallbackConfigIdByTierName.has(normalizedName) || row.Status === 'Active') {
                            fallbackConfigIdByTierName.set(normalizedName, row.ID);
                        }
                    }
                }
            }

            const rows = filteredTemplates.map((t) => {
                const key = t.WorkstreamKey.trim().toLowerCase();
                const routine = routineByWorkstream.get(key);
                const suggestion = suggestionByKey.get(key);
                const tierSpec = ResolveDefaultTierForWorkstreamKey(t.WorkstreamKey);
                const catalogFallbackId = tierSpec
                    ? (fallbackConfigIdByTierName.get(tierSpec.DefaultConfigurationName.toLowerCase()) ?? null)
                    : null;
                return {
                    RhythmTemplateID: t.ID,
                    Name: t.Name,
                    WorkstreamKey: t.WorkstreamKey,
                    Description: t.Description,
                    DefaultCronExpression: t.DefaultCronExpression,
                    WakeReason: t.WakeReason,
                    OfferAt: t.OfferAt,
                    SkillID: t.SkillID,
                    SkillName: t.Skill,
                    DefaultAgentConfigurationID: t.DefaultAgentConfigurationID ?? catalogFallbackId,
                    DefaultAgentConfiguration: t.DefaultAgentConfiguration ?? tierSpec?.DefaultConfigurationName ?? null,
                    DefaultModelTier: tierSpec?.Tier ?? null,
                    EnabledForUser: routine?.Status === 'Active',
                    UserRoutineID: routine?.ID ?? null,
                    UserRoutineStatus: routine?.Status ?? null,
                    AgentConfigurationID: routine?.AgentConfigurationID ?? null,
                    PriorSuggestionStatus: suggestion?.Status ?? null,
                };
            });

            const masked = TypedActionPolicyGuard.MaskRows(rows, guard.DeniedFieldPatterns);
            const payload = { Count: masked.length, Rhythms: masked };
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: setOutputParam(params, 'RhythmsJSON', JSON.stringify(payload)),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[ListAvailableRhythmsAction] ${msg}`);
            return { Success: false, ResultCode: 'ERROR', Message: msg, Params: params.Params };
        }
    }
}

/**
 * Materializes an active `MJ: AI Agent Rhythm Templates` entry into a recurring
 * `MJ: User Routines` row for `ContextUser` after explicit user opt-in.
 */
@RegisterClass(BaseAction, 'Enable Agent Rhythm')
export class EnableAgentRhythmAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Enable Agent Rhythm requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const rhythmTemplateId = readStringParam(params, 'RhythmTemplateID');
            const workstreamKey = readStringParam(params, 'WorkstreamKey');
            if (!rhythmTemplateId && !workstreamKey) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Provide either RhythmTemplateID or WorkstreamKey to enable a rhythm.',
                    Params: params.Params,
                };
            }

            const routineGuard = await TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: User Routines',
                operation: 'Create',
                contextUser,
                actionContext: params.Context,
                provider: params.Provider,
            });
            if (!routineGuard.Allowed) {
                return {
                    Success: false,
                    ResultCode: routineGuard.ResultCode,
                    Message: routineGuard.Message,
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
            const callingAgentId =
                extractContextAgentId(params.Context) ||
                AgentUserPolicyEngine.Instance.GetActiveExecutingAgentID();
            if (callingAgentId) {
                const confirmedApprovalRequestId = readStringParam(params, 'ConfirmedApprovalRequestID');
                const approved = confirmedApprovalRequestId
                    ? await VerifyApprovedAgentRequest(
                          confirmedApprovalRequestId,
                          contextUser.ID,
                          agent.ID,
                          contextUser,
                          md
                      )
                    : false;
                if (!approved) {
                    return {
                        Success: false,
                        ResultCode: 'APPROVAL_REQUIRED',
                        Message:
                            'Enabling a recurring agent rhythm during agent execution requires a server-verified approved MJ: AI Agent Requests record (ConfirmedApprovalRequestID). Self-attested ConfirmedByUser is not sufficient.',
                        Params: params.Params,
                    };
                }
            }

            const rv = RunView.FromMetadataProvider(md);

            let template: MJAIAgentRhythmTemplateEntity | null = null;
            if (rhythmTemplateId) {
                template = await VerifyActiveRhythmTemplate(rhythmTemplateId, agent.ID, contextUser, md);
            } else {
                const tplFilter = `AgentID='${EscapeSQLString(agent.ID)}' AND LOWER(WorkstreamKey)='${EscapeSQLString(
                    workstreamKey!.toLowerCase()
                )}' AND Status='Active'`;
                const tplRes = await rv.RunView<MJAIAgentRhythmTemplateEntity>(
                    {
                        EntityName: 'MJ: AI Agent Rhythm Templates',
                        ExtraFilter: tplFilter,
                        MaxRows: 1,
                        ResultType: 'entity_object',
                    },
                    contextUser
                );
                const candidate = tplRes.Success ? tplRes.Results[0] ?? null : null;
                if (candidate && candidate.Status === 'Active' && UUIDsEqual(candidate.AgentID, agent.ID)) {
                    template = candidate;
                }
            }
            if (!template) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `No active rhythm template found for agent "${agent.Name}" matching ${
                        rhythmTemplateId ? `ID "${rhythmTemplateId}"` : `WorkstreamKey "${workstreamKey}"`
                    }.`,
                    Params: params.Params,
                };
            }

            const policyEval = await CheckActivePolicyForAgentAndUser(
                template.AgentID,
                contextUser.ID,
                contextUser,
                { provider: md, preferCache: true }
            );
            if (!policyEval.Allowed) {
                return {
                    Success: false,
                    ResultCode: 'POLICY_DENIED',
                    Message: policyEval.Reason,
                    Params: params.Params,
                };
            }

            const cronExpression = readStringParam(params, 'CronExpression') ?? template.DefaultCronExpression;
            const timezone = readStringParam(params, 'Timezone') ?? 'UTC';
            const parsedGate = template.DefaultWakeGate
                ? SafeJSONParse<Partial<MJUserRoutineEntity_IRoutineWakeConfiguration>>(template.DefaultWakeGate) ?? {}
                : {};

            const hasExplicitConfigParam = params.Params.some(
                (p) => p.Name.trim().toLowerCase() === 'agentconfigurationid'
            );
            const rawAgentConfigID = hasExplicitConfigParam
                ? (readStringParam(params, 'AgentConfigurationID') ?? null)
                : undefined;
            const rawModelTier = readStringParam(params, 'ModelTier');
            const configResolution = await ResolveAgentConfigurationIDInput({
                agentConfigurationID: rawAgentConfigID,
                modelTier: rawModelTier,
                contextUser,
                metadataProvider: md,
            });
            if (configResolution.ErrorMessage) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: configResolution.ErrorMessage,
                    Params: params.Params,
                };
            }

            // Upsert user's routine for (UserID, AgentID, WorkstreamKey)
            const existingRes = await rv.RunView<MJUserRoutineEntity>(
                {
                    EntityName: 'MJ: User Routines',
                    ExtraFilter: `UserID='${EscapeSQLString(contextUser.ID)}' AND TargetID='${EscapeSQLString(
                        template.AgentID
                    )}' AND RoutineType='AgentWake'`,
                    MaxRows: 50,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            let routine =
                (existingRes.Success ? existingRes.Results : []).find(
                    (r) =>
                        (r.WakeConfigurationObject?.workstreamKey ?? '').toLowerCase() ===
                        template.WorkstreamKey.toLowerCase()
                ) ?? null;

            const isNewRoutine = !routine;
            if (!routine) {
                routine = await md.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', contextUser);
                routine.NewRecord();
                routine.UserID = contextUser.ID;
                routine.RoutineType = 'AgentWake';
                routine.TargetType = 'Agent';
                routine.TargetID = template.AgentID;
            }

            if (isNewRoutine) {
                routine.AgentConfigurationID = await ResolveRoutineSeededAgentConfigurationID({
                    explicitAgentConfigurationID: configResolution.Provided
                        ? configResolution.ConfigurationID
                        : undefined,
                    templateDefaultAgentConfigurationID: template.DefaultAgentConfigurationID ?? null,
                    workstreamKey: template.WorkstreamKey,
                    contextUser,
                    metadataProvider: md,
                });
            } else if (configResolution.Provided) {
                routine.AgentConfigurationID = configResolution.ConfigurationID;
            }

            const wakeConfig: MJUserRoutineEntity_IRoutineWakeConfiguration = {
                ...parsedGate,
                workstreamKey: template.WorkstreamKey,
                wakeReason: template.WakeReason,
                resumeState: {
                    ...(parsedGate.resumeState ?? {}),
                    rhythmTemplateID: template.ID,
                    workstreamKey: template.WorkstreamKey,
                },
            };

            routine.Name = `${agent.Name} — ${template.Name}`;
            routine.Description = template.Description ?? template.WakeReason;
            routine.ScheduleMode = 'Recurring';
            routine.CronExpression = cronExpression;
            routine.Timezone = timezone;
            routine.Status = 'Active';
            routine.InitialMessage = `[AgentWake:${template.WorkstreamKey}] ${template.WakeReason}`;
            routine.WakeConfigurationObject = wakeConfig;
            if (template.SkillID && !routine.RequestedSkillIDs) {
                routine.RequestedSkillIDs = JSON.stringify([template.SkillID]);
            }

            const saved = await routine.Save();
            if (!saved) {
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: routine.LatestResult?.CompleteMessage || 'Failed to save enabled rhythm routine.',
                    Params: params.Params,
                };
            }

            // Mark any matching 'Offered' suggestion as 'Accepted' (best effort)
            const sugRes = await rv.RunView<MJAIAgentSuggestionEntity>(
                {
                    EntityName: 'MJ: AI Agent Suggestions',
                    ExtraFilter: `UserID='${EscapeSQLString(contextUser.ID)}' AND AgentID='${EscapeSQLString(
                        template.AgentID
                    )}' AND LOWER(TargetKey)='${EscapeSQLString(template.WorkstreamKey.toLowerCase())}' AND Status='Offered'`,
                    MaxRows: 5,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            if (sugRes.Success) {
                const now = new Date();
                for (const sug of sugRes.Results) {
                    sug.Status = 'Accepted';
                    sug.RespondedAt = now;
                    await sug.Save();
                }
            }

            const payload = {
                RoutineID: routine.ID,
                RhythmTemplateID: template.ID,
                Name: routine.Name,
                WorkstreamKey: template.WorkstreamKey,
                CronExpression: routine.CronExpression,
                Timezone: routine.Timezone,
                Status: routine.Status,
                AgentConfigurationID: routine.AgentConfigurationID ?? null,
            };
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: setOutputParam(params, 'RoutineID', routine.ID),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[EnableAgentRhythmAction] ${msg}`);
            return { Success: false, ResultCode: 'ERROR', Message: msg, Params: params.Params };
        }
    }
}

/**
 * Lists, records, or updates proactive capability/rhythm suggestions in `MJ: AI Agent Suggestions`
 * so declined suggestions are respected and never repeatedly offered.
 */
@RegisterClass(BaseAction, 'Manage Agent Suggestions')
export class ManageAgentSuggestionsAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Manage Agent Suggestions requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const operation = (readStringParam(params, 'Operation') ?? 'List').toLowerCase();
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
            const rv = RunView.FromMetadataProvider(md);

            if (operation === 'list') {
                const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                    entityName: 'MJ: AI Agent Suggestions',
                    operation: 'Read',
                    contextUser,
                    actionContext: params.Context,
                    provider: md,
                });
                if (!guard.Allowed) {
                    return {
                        Success: false,
                        ResultCode: guard.ResultCode,
                        Message: guard.Message,
                        Params: params.Params,
                    };
                }

                const status = readStringParam(params, 'Status');
                const kind = readStringParam(params, 'Kind');
                const clauses = [
                    `UserID='${EscapeSQLString(contextUser.ID)}'`,
                    `AgentID='${EscapeSQLString(agent.ID)}'`,
                ];
                if (status && status.toLowerCase() !== 'all') {
                    clauses.push(`Status='${EscapeSQLString(status)}'`);
                }
                if (kind && kind.toLowerCase() !== 'all') {
                    clauses.push(`Kind='${EscapeSQLString(kind)}'`);
                }

                const res = await rv.RunView<MJAIAgentSuggestionEntity>(
                    {
                        EntityName: 'MJ: AI Agent Suggestions',
                        ExtraFilter: clauses.join(' AND '),
                        OrderBy: 'OfferedAt DESC',
                        MaxRows: 50,
                        ResultType: 'entity_object',
                    },
                    contextUser
                );
                if (!res.Success) {
                    return {
                        Success: false,
                        ResultCode: 'QUERY_FAILED',
                        Message: res.ErrorMessage || 'Failed to list agent suggestions.',
                        Params: params.Params,
                    };
                }

                const rows = TypedActionPolicyGuard.MaskRows(
                    res.Results.map((s) => ({
                        SuggestionID: s.ID,
                        Kind: s.Kind,
                        TargetKey: s.TargetKey,
                        Summary: s.Summary,
                        Status: s.Status,
                        OfferedAt: s.OfferedAt?.toISOString() ?? null,
                        RespondedAt: s.RespondedAt?.toISOString() ?? null,
                    })),
                    guard.DeniedFieldPatterns
                );
                const payload = { Count: rows.length, Suggestions: rows };
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: JSON.stringify(payload),
                    Params: setOutputParam(params, 'SuggestionsJSON', JSON.stringify(payload)),
                };
            }

            if (operation === 'recordoffer') {
                const targetKey = readStringParam(params, 'TargetKey');
                const summary = readStringParam(params, 'Summary');
                const rawKind = readStringParam(params, 'Kind') ?? 'Rhythm';
                const validKinds: ReadonlyArray<MJAIAgentSuggestionEntity['Kind']> = [
                    'Rhythm',
                    'Skill',
                    'Behavior',
                    'Integration',
                ];
                const kind = validKinds.find((k) => k.toLowerCase() === rawKind.toLowerCase());
                if (!targetKey || !summary || !kind) {
                    return {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message:
                            'RecordOffer requires TargetKey, Summary, and Kind (Rhythm, Skill, Behavior, or Integration).',
                        Params: params.Params,
                    };
                }

                const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                    entityName: 'MJ: AI Agent Suggestions',
                    operation: 'Create',
                    contextUser,
                    actionContext: params.Context,
                    provider: md,
                });
                if (!guard.Allowed) {
                    return {
                        Success: false,
                        ResultCode: guard.ResultCode,
                        Message: guard.Message,
                        Params: params.Params,
                    };
                }

                const priorRes = await rv.RunView<MJAIAgentSuggestionEntity>(
                    {
                        EntityName: 'MJ: AI Agent Suggestions',
                        ExtraFilter: `UserID='${EscapeSQLString(contextUser.ID)}' AND AgentID='${EscapeSQLString(
                            agent.ID
                        )}' AND LOWER(TargetKey)='${EscapeSQLString(targetKey.toLowerCase())}'`,
                        OrderBy: 'OfferedAt DESC',
                        MaxRows: 5,
                        ResultType: 'entity_object',
                    },
                    contextUser
                );
                const priors = priorRes.Success ? priorRes.Results : [];
                const declined = priors.find((p) => p.Status === 'Declined');
                if (declined) {
                    return {
                        Success: false,
                        ResultCode: 'ALREADY_DECLINED',
                        Message: `Suggestion "${targetKey}" was previously declined by the user on ${
                            declined.RespondedAt?.toISOString() ?? declined.OfferedAt?.toISOString()
                        }; do not re-offer unless the user explicitly asks.`,
                        Params: params.Params,
                    };
                }
                const existingOffered = priors.find((p) => p.Status === 'Offered');
                if (existingOffered) {
                    const payload = {
                        SuggestionID: existingOffered.ID,
                        Status: existingOffered.Status,
                        AlreadyOffered: true,
                    };
                    return {
                        Success: true,
                        ResultCode: 'SUCCESS',
                        Message: JSON.stringify(payload),
                        Params: setOutputParam(params, 'SuggestionID', existingOffered.ID),
                    };
                }

                const suggestion = await md.GetEntityObject<MJAIAgentSuggestionEntity>(
                    'MJ: AI Agent Suggestions',
                    contextUser
                );
                suggestion.NewRecord();
                suggestion.AgentID = agent.ID;
                suggestion.UserID = contextUser.ID;
                suggestion.Kind = kind;
                suggestion.TargetKey = targetKey;
                suggestion.Summary = summary;
                suggestion.Status = 'Offered';
                suggestion.OfferedAt = new Date();
                const saved = await suggestion.Save();
                if (!saved) {
                    return {
                        Success: false,
                        ResultCode: 'SAVE_FAILED',
                        Message: suggestion.LatestResult?.CompleteMessage || 'Failed to record agent suggestion.',
                        Params: params.Params,
                    };
                }

                const payload = {
                    SuggestionID: suggestion.ID,
                    Kind: suggestion.Kind,
                    TargetKey: suggestion.TargetKey,
                    Status: suggestion.Status,
                };
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: JSON.stringify(payload),
                    Params: setOutputParam(params, 'SuggestionID', suggestion.ID),
                };
            }

            if (operation === 'respond') {
                const suggestionId = readStringParam(params, 'SuggestionID');
                const targetKey = readStringParam(params, 'TargetKey');
                const rawStatus = readStringParam(params, 'Status');
                const validResponses: ReadonlyArray<MJAIAgentSuggestionEntity['Status']> = [
                    'Accepted',
                    'Declined',
                    'Expired',
                ];
                const nextStatus = rawStatus
                    ? validResponses.find((s) => s.toLowerCase() === rawStatus.toLowerCase())
                    : undefined;

                if ((!suggestionId && !targetKey) || !nextStatus) {
                    return {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message:
                            'Respond requires SuggestionID or TargetKey and Status (Accepted, Declined, or Expired).',
                        Params: params.Params,
                    };
                }

                const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                    entityName: 'MJ: AI Agent Suggestions',
                    operation: 'Update',
                    writeFields: ['Status', 'RespondedAt'],
                    contextUser,
                    actionContext: params.Context,
                    provider: md,
                });
                if (!guard.Allowed) {
                    return {
                        Success: false,
                        ResultCode: guard.ResultCode,
                        Message: guard.Message,
                        Params: params.Params,
                    };
                }

                const filter = suggestionId
                    ? `ID='${EscapeSQLString(suggestionId)}' AND UserID='${EscapeSQLString(contextUser.ID)}'`
                    : `UserID='${EscapeSQLString(contextUser.ID)}' AND AgentID='${EscapeSQLString(
                          agent.ID
                      )}' AND LOWER(TargetKey)='${EscapeSQLString(targetKey!.toLowerCase())}'`;
                const foundRes = await rv.RunView<MJAIAgentSuggestionEntity>(
                    {
                        EntityName: 'MJ: AI Agent Suggestions',
                        ExtraFilter: filter,
                        OrderBy: 'OfferedAt DESC',
                        MaxRows: 1,
                        ResultType: 'entity_object',
                    },
                    contextUser
                );
                const suggestion = foundRes.Success ? foundRes.Results[0] ?? null : null;
                if (!suggestion) {
                    return {
                        Success: false,
                        ResultCode: 'NOT_FOUND',
                        Message: 'Matching agent suggestion was not found.',
                        Params: params.Params,
                    };
                }

                suggestion.Status = nextStatus;
                suggestion.RespondedAt = new Date();
                const saved = await suggestion.Save();
                if (!saved) {
                    return {
                        Success: false,
                        ResultCode: 'SAVE_FAILED',
                        Message: suggestion.LatestResult?.CompleteMessage || 'Failed to update agent suggestion.',
                        Params: params.Params,
                    };
                }

                const payload = {
                    SuggestionID: suggestion.ID,
                    TargetKey: suggestion.TargetKey,
                    Status: suggestion.Status,
                    RespondedAt: suggestion.RespondedAt?.toISOString() ?? null,
                };
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: JSON.stringify(payload),
                    Params: setOutputParam(params, 'SuggestionID', suggestion.ID),
                };
            }

            return {
                Success: false,
                ResultCode: 'VALIDATION_ERROR',
                Message: `Unsupported Operation "${operation}". Expected List, RecordOffer, or Respond.`,
                Params: params.Params,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[ManageAgentSuggestionsAction] ${msg}`);
            return { Success: false, ResultCode: 'ERROR', Message: msg, Params: params.Params };
        }
    }
}
