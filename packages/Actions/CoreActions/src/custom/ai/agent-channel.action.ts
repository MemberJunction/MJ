import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { EscapeSQLString, RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { BaseEntity, IMetadataProvider, LogError, Metadata, type MJLimitsOverride, RunView, UserInfo } from '@memberjunction/core';
import {
    BUILT_IN_CONVERSATION_TYPE_IDS,
    CONVERSATION_TYPE_CODES,
    ConversationEngine,
    MJAIAgentRequestEntity,
    MJAgentChannelEntity,
    MJAgentChannelParticipantEntity,
    MJConversationDetailEntity,
    MJConversationDetailEntityExtended,
    MJUserEntity,
} from '@memberjunction/core-entities';
import {
    AgentUserPolicyEngine,
    MJAIAgentEntityExtended,
    ResolveAgentRunLimits,
    TypedActionPolicyGuard,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentWakeTriggerService } from '@memberjunction/ai-agents';
import { UserCache } from '@memberjunction/generic-database-provider';

const DEFAULT_AGENT_NAME = 'Chief of Staff';
const MY_AGENTS_APPLICATION_ID = 'C05A8E01-4C11-4E8A-9B01-1A2B3C4D5E70';

/**
 * A new entity object, or an error that names the entity. `GetEntityObject` logs and returns null
 * when the entity cannot be created (for example, a database whose migration for it has not run),
 * and dereferencing that null hides the cause behind "Cannot read properties of null".
 */
async function newEntityObject<T extends BaseEntity>(md: IMetadataProvider, entityName: string, user: UserInfo): Promise<T> {
    const entity = await md.GetEntityObject<T>(entityName, user);
    if (!entity) {
        throw new Error(`Entity ${entityName} not found in metadata or could not be created`);
    }
    return entity;
}

function resolveMyAgentsApplicationId(md: IMetadataProvider): string | null {
    const apps = (md as { Applications?: ReadonlyArray<{ ID: string; Name?: string }> }).Applications;
    if (!Array.isArray(apps)) {
        return MY_AGENTS_APPLICATION_ID;
    }
    const found =
        apps.find((a) => UUIDsEqual(a.ID, MY_AGENTS_APPLICATION_ID)) ??
        apps.find((a) => {
            const name = a.Name?.trim().toLowerCase();
            return name === 'my agents' || name === 'chief of staff';
        });
    return found?.ID ?? null;
}

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

function readOptionalPositiveIntParam(params: RunActionParams, name: string): number | undefined {
    const raw = readStringParam(params, name);
    if (!raw) {
        return undefined;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
        return undefined;
    }
    return Math.max(1, Math.trunc(parsed));
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

function readStringArrayParam(params: RunActionParams, name: string): string[] {
    const found = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
    if (found?.Value == null) {
        return [];
    }
    if (Array.isArray(found.Value)) {
        return found.Value.map((v) => String(v).trim()).filter(Boolean);
    }
    const raw = String(found.Value).trim();
    if (!raw) {
        return [];
    }
    if (raw.startsWith('[')) {
        const parsed = SafeJSONParse<string[]>(raw);
        if (Array.isArray(parsed)) {
            return parsed.map((v) => String(v).trim()).filter(Boolean);
        }
    }
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function extractContextAgentId(context: unknown): string | undefined {
    if (!context || typeof context !== 'object') {
        return undefined;
    }
    const val = (context as { AgentID?: unknown }).AgentID;
    return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;
}

function resolveAgent(params: RunActionParams, idParam: string, nameParam: string): MJAIAgentEntityExtended | null {
    const explicitId = readStringParam(params, idParam);
    if (explicitId) {
        return AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, explicitId)) ?? null;
    }
    const contextId = idParam === 'AgentID' ? extractContextAgentId(params.Context) : undefined;
    if (contextId) {
        return AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, contextId)) ?? null;
    }
    const explicitName = readStringParam(params, nameParam) ?? DEFAULT_AGENT_NAME;
    const callerUserId = params.ContextUser?.ID ?? null;
    const matches = AIEngine.Instance.Agents.filter(
        (a) => a.Name.trim().toLowerCase() === explicitName.toLowerCase() && (a.Status == null || a.Status === 'Active')
    );
    if (callerUserId && matches.length > 1) {
        const ownedMatch = matches.find((a) => a.OwnerUserID && UUIDsEqual(a.OwnerUserID, callerUserId));
        if (ownedMatch) {
            return ownedMatch;
        }
    }
    return (
        matches[0] ??
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
    return [...params.Params, { Name: name, Type: 'Output', Value: value }];
}

async function verifyApprovedRequest(
    approvalRequestId: string,
    ownerUserId: string,
    contextUser: UserInfo,
    md: IMetadataProvider
): Promise<boolean> {
    const rv = RunView.FromMetadataProvider(md);
    const res = await rv.RunView<MJAIAgentRequestEntity>(
        {
            EntityName: 'MJ: AI Agent Requests',
            ExtraFilter: `ID='${EscapeSQLString(approvalRequestId)}' AND RequestForUserID='${EscapeSQLString(
                ownerUserId
            )}' AND Status='Approved'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        },
        contextUser
    );
    return Boolean(res.Success && res.Results.length > 0);
}

/**
 * Opens a shared, observable `AGENT_CHANNEL` conversation (`MJ: Agent Channels` IS-A
 * `MJ: Conversations`) between the caller's agent and one or more colleagues' agents,
 * enforcing `CoordinationMode` (`Observer` blocked, `Coordinator` requires approval when run
 * autonomously, `Autonomous` allowed) and waking peer agents under loop-guard / rate-limit bounds.
 */
@RegisterClass(BaseAction, 'Open Agent Channel')
export class OpenAgentChannelAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Open Agent Channel requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const topic = readStringParam(params, 'Topic');
            const initialMessage = readStringParam(params, 'InitialMessage');
            const targetUserIds = Array.from(
                new Set([
                    ...readStringArrayParam(params, 'TargetUserIDs'),
                    ...readStringArrayParam(params, 'TargetUserID'),
                ])
            ).filter((id) => !UUIDsEqual(id, contextUser.ID));
            const explicitTargetAgentRef = Boolean(
                readStringParam(params, 'TargetAgentID') || readStringParam(params, 'TargetAgentName')
            );

            if (!topic || !initialMessage || (targetUserIds.length === 0 && !explicitTargetAgentRef)) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message:
                        'Topic, InitialMessage, and either colleague TargetUserID/TargetUserIDs or a sibling TargetAgentID/TargetAgentName are required.',
                    Params: params.Params,
                };
            }

            const createGuard = await TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: Agent Channels',
                operation: 'Create',
                contextUser,
                actionContext: params.Context,
                provider: params.Provider,
            });
            if (!createGuard.Allowed) {
                return {
                    Success: false,
                    ResultCode: createGuard.ResultCode,
                    Message: createGuard.Message,
                    Params: params.Params,
                };
            }

            await AIEngine.Instance.Config(false, contextUser);
            const senderAgent = resolveAgent(params, 'AgentID', 'AgentName');
            if (!senderAgent) {
                return {
                    Success: false,
                    ResultCode: 'AGENT_NOT_FOUND',
                    Message: 'Could not resolve sender AI Agent.',
                    Params: params.Params,
                };
            }
            const resolvedTargetAgent = explicitTargetAgentRef
                ? resolveAgent(params, 'TargetAgentID', 'TargetAgentName')
                : senderAgent;
            if (!resolvedTargetAgent) {
                const requestedRef =
                    readStringParam(params, 'TargetAgentName') ??
                    readStringParam(params, 'TargetAgentID') ??
                    'unknown';
                return {
                    Success: false,
                    ResultCode: 'AGENT_NOT_FOUND',
                    Message: `Target agent "${requestedRef}" was not found.`,
                    Params: params.Params,
                };
            }
            const targetAgent = resolvedTargetAgent;

            if (targetUserIds.length === 0 && UUIDsEqual(targetAgent.ID, senderAgent.ID)) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `Agent "${senderAgent.Name}" cannot open an Agent Channel with itself without another colleague participant.`,
                    Params: params.Params,
                };
            }

            // Same-user sibling channel (e.g., Pepper <-> Cato owned by or accessible to contextUser)
            const sameUserPeerUserId =
                targetUserIds.length === 0
                    ? targetAgent.OwnerUserID && !UUIDsEqual(targetAgent.OwnerUserID, contextUser.ID)
                        ? targetAgent.OwnerUserID
                        : contextUser.ID
                    : null;
            if (
                sameUserPeerUserId &&
                UUIDsEqual(sameUserPeerUserId, contextUser.ID) &&
                !AIEngine.Instance.CanUserViewAgent(targetAgent.ID, contextUser)
            ) {
                return {
                    Success: false,
                    ResultCode: 'POLICY_DENIED',
                    Message: `You do not have permission to include agent "${targetAgent.Name}" in an Agent Channel.`,
                    Params: params.Params,
                };
            }
            const effectiveCrossUserIds =
                sameUserPeerUserId && !UUIDsEqual(sameUserPeerUserId, contextUser.ID)
                    ? [sameUserPeerUserId]
                    : targetUserIds;
            const hasCrossUserTargets = effectiveCrossUserIds.length > 0;

            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const senderPolicyLookup = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
                senderAgent.ID,
                contextUser.ID,
                contextUser,
                { provider: md }
            );
            if (senderPolicyLookup.status === 'error') {
                return {
                    Success: false,
                    ResultCode: 'POLICY_DENIED',
                    Message: `Unable to verify sender agent policy: ${senderPolicyLookup.errorMessage}`,
                    Params: params.Params,
                };
            }

            const senderPolicy = senderPolicyLookup.policy;
            if (senderPolicy) {
                if (senderPolicy.Status === 'Disabled' || senderPolicy.Status === 'Paused') {
                    return {
                        Success: false,
                        ResultCode: 'POLICY_DENIED',
                        Message: `Agent policy is ${senderPolicy.Status}; opening an Agent Channel is not permitted.`,
                        Params: params.Params,
                    };
                }
                if (senderPolicy.AllowInterAgentCoordination === false) {
                    return {
                        Success: false,
                        ResultCode: 'POLICY_DENIED',
                        Message: 'Inter-agent coordination is disabled in your agent policy.',
                        Params: params.Params,
                    };
                }
                if (hasCrossUserTargets && senderPolicy.CoordinationMode === 'Observer') {
                    return {
                        Success: false,
                        ResultCode: 'POLICY_DENIED',
                        Message: 'CoordinationMode is Observer; agent cannot initiate peer channels.',
                        Params: params.Params,
                    };
                }
                const isAgentCall = Boolean(extractContextAgentId(params.Context));
                if (hasCrossUserTargets && isAgentCall && senderPolicy.CoordinationMode === 'Coordinator') {
                    const approvalId = readStringParam(params, 'ConfirmedApprovalRequestID');
                    const approved = approvalId
                        ? await verifyApprovedRequest(approvalId, contextUser.ID, contextUser, md)
                        : false;
                    if (!approved) {
                        return {
                            Success: false,
                            ResultCode: 'APPROVAL_REQUIRED',
                            Message:
                                'CoordinationMode is Coordinator: user confirmation (ConfirmedApprovalRequestID) is required before opening a peer Agent Channel.',
                            Params: params.Params,
                        };
                    }
                }
            }

            const systemUser = UserCache.Instance.GetSystemUser() ?? contextUser;
            const rv = RunView.FromMetadataProvider(md);

            // Validate every cross-user target is active
            let activeTargets: MJUserEntity[] = [];
            if (effectiveCrossUserIds.length > 0) {
                const targetUsersRes = await rv.RunView<MJUserEntity>(
                    {
                        EntityName: 'MJ: Users',
                        ExtraFilter: `IsActive=1 AND ID IN (${effectiveCrossUserIds
                            .map((id) => `'${EscapeSQLString(id)}'`)
                            .join(',')})`,
                        ResultType: 'entity_object',
                    },
                    systemUser
                );
                activeTargets = targetUsersRes.Success ? targetUsersRes.Results : [];
                if (activeTargets.length !== effectiveCrossUserIds.length) {
                    return {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: 'One or more TargetUserIDs do not match an active MJ user.',
                        Params: params.Params,
                    };
                }
            }

            const requestedMaxTurns = readOptionalPositiveIntParam(params, 'MaxConsecutiveAgentTurns');
            const requestedMaxHourlyWakes = readOptionalPositiveIntParam(params, 'MaxHourlyWakes');
            const channelRunOverride: MJLimitsOverride = {};
            if (requestedMaxTurns !== undefined) {
                channelRunOverride.AgentChannelConsecutiveTurns = requestedMaxTurns;
            }
            if (requestedMaxHourlyWakes !== undefined) {
                channelRunOverride.AgentChannelWakesPerHour = requestedMaxHourlyWakes;
            }
            const limitsResolution = ResolveAgentRunLimits({
                Agent: senderAgent,
                UserPolicy: senderPolicy,
                RunOverride: Object.keys(channelRunOverride).length > 0 ? channelRunOverride : null,
                ContextUser: contextUser,
                Provider: md,
                Options: {
                    EnforceUserPolicyAsCeiling: Boolean(senderPolicy),
                    EnforceConfiguredCeilings: true,
                    AllowAuthorizedCeilingOverride: true,
                },
            });
            const maxTurns = limitsResolution.Limits.AgentChannelConsecutiveTurns;
            const maxHourlyWakes = limitsResolution.Limits.AgentChannelWakesPerHour;
            const replyByRaw = readStringParam(params, 'ReplyByISO');
            const replyByDate = replyByRaw ? new Date(replyByRaw) : null;
            if (replyByDate && Number.isNaN(replyByDate.getTime())) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `Invalid ReplyByISO timestamp "${replyByRaw}".`,
                    Params: params.Params,
                };
            }

            const agentChannelTypeId =
                ConversationEngine.Instance.ResolveConversationTypeID(CONVERSATION_TYPE_CODES.AGENT_CHANNEL) ??
                BUILT_IN_CONVERSATION_TYPE_IDS.AGENT_CHANNEL;

            const myAgentsAppId = resolveMyAgentsApplicationId(md);
            const channel = await newEntityObject<MJAgentChannelEntity>(md, 'MJ: Agent Channels', systemUser);
            channel.NewRecord();
            channel.Name = topic.slice(0, 255);
            channel.UserID = contextUser.ID;
            channel.TypeID = agentChannelTypeId;
            if (myAgentsAppId) {
                channel.ApplicationScope = 'Application';
                channel.ApplicationID = myAgentsAppId;
            } else {
                channel.ApplicationScope = 'Global';
            }
            channel.Topic = topic;
            channel.ChannelStatus = 'Open';
            channel.ReplyBy = replyByDate;
            channel.ConsecutiveAgentTurns = 0;
            channel.MaxConsecutiveAgentTurns = maxTurns;
            channel.HourlyWakeCount = 0;
            channel.MaxHourlyWakes = maxHourlyWakes;

            const channelSaved = await channel.Save();
            if (!channelSaved) {
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: channel.LatestResult?.CompleteMessage || 'Failed to create Agent Channel.',
                    Params: params.Params,
                };
            }

            // Create participant records (initiator + all peers).
            // Preserve explicit derived instances (e.g., Cato); only redirect root templates (e.g., Chief of Staff) to the peer's primary instance.
            const resolvePeerAgentId = (baseTarget: MJAIAgentEntityExtended, userId: string): string => {
                if (baseTarget.BaseAgentID) {
                    return baseTarget.ID;
                }
                if (typeof AIEngine.Instance.ResolvePrimaryUserAgentInstance === 'function') {
                    const resolved = AIEngine.Instance.ResolvePrimaryUserAgentInstance(baseTarget.ID, userId);
                    if (resolved) {
                        return resolved.ID;
                    }
                }
                return baseTarget.ID;
            };
            const participantSpecs: Array<{ userId: string; agentId: string; role: MJAgentChannelParticipantEntity['Role'] }> = [
                { userId: contextUser.ID, agentId: senderAgent.ID, role: 'Initiator' },
                ...(activeTargets.length > 0
                    ? activeTargets.map((u) => ({
                          userId: u.ID,
                          agentId: resolvePeerAgentId(targetAgent, u.ID),
                          role: 'Participant' as const,
                      }))
                    : [
                          {
                              userId: contextUser.ID,
                              agentId: targetAgent.ID,
                              role: 'Participant' as const,
                          },
                      ]),
            ];

            for (const spec of participantSpecs) {
                const participant = await newEntityObject<MJAgentChannelParticipantEntity>(md, 'MJ: Agent Channel Participants', systemUser);
                participant.NewRecord();
                participant.AgentChannelID = channel.ID;
                participant.UserID = spec.userId;
                participant.AgentID = spec.agentId;
                participant.Role = spec.role;
                participant.JoinedAt = new Date();
                const savedPart = await participant.Save();
                if (!savedPart) {
                    return {
                        Success: false,
                        ResultCode: 'SAVE_FAILED',
                        Message:
                            participant.LatestResult?.CompleteMessage ||
                            `Failed to add participant "${spec.userId}" to Agent Channel.`,
                        Params: params.Params,
                    };
                }
            }

            // Post opening message as contextUser (channel initiator/participant); mark server-authored when an agent posts.
            const callingAgentId = extractContextAgentId(params.Context);
            const detail = await newEntityObject<MJConversationDetailEntity>(md, 'MJ: Conversation Details', contextUser);
            detail.NewRecord();
            detail.ConversationID = channel.ID;
            detail.UserID = contextUser.ID;
            detail.AgentID = callingAgentId ?? null;
            detail.Role = callingAgentId ? 'AI' : 'User';
            detail.Message = initialMessage;
            if (callingAgentId && typeof (detail as MJConversationDetailEntityExtended).MarkServerAuthoredReply === 'function') {
                (detail as MJConversationDetailEntityExtended).MarkServerAuthoredReply();
            }
            const detailSaved = await detail.Save();
            if (!detailSaved) {
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: detail.LatestResult?.CompleteMessage || 'Failed to save opening Agent Channel message.',
                    Params: params.Params,
                };
            }

            const wakeOutcome = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
                channelID: channel.ID,
                conversationDetailID: detail.ID,
                senderUserID: contextUser.ID,
                senderAgentID: callingAgentId ?? null,
                messagePreview: initialMessage,
                contextUser,
                metadataProvider: md,
            });

            const payload = {
                ChannelID: channel.ID,
                ConversationDetailID: detail.ID,
                Topic: channel.Topic,
                ChannelStatus: wakeOutcome.channelStatus,
                Participants: participantSpecs,
                WakeResults: wakeOutcome.results,
            };

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: setOutputParam(params, 'ChannelID', channel.ID),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[OpenAgentChannelAction] ${msg}`);
            return { Success: false, ResultCode: 'ERROR', Message: msg, Params: params.Params };
        }
    }
}

/**
 * Posts a reply into an existing `AGENT_CHANNEL` conversation, enforcing participant
 * membership, loop-guard / hourly wake caps, and optional channel resolution.
 */
@RegisterClass(BaseAction, 'Reply In Agent Channel')
export class ReplyInAgentChannelAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Reply In Agent Channel requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const channelId = readStringParam(params, 'ChannelID');
            const message = readStringParam(params, 'Message');
            const resolveChannel = readBooleanParam(params, 'ResolveChannel', false);
            if (!channelId || !message) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'ChannelID and Message are required.',
                    Params: params.Params,
                };
            }

            const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: Agent Channels',
                operation: 'Update',
                writeFields: ['ChannelStatus', 'ConsecutiveAgentTurns', 'HourlyWakeCount'],
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

            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const systemUser = UserCache.Instance.GetSystemUser() ?? contextUser;
            const channel = await newEntityObject<MJAgentChannelEntity>(md, 'MJ: Agent Channels', systemUser);
            const loaded = await channel.Load(channelId);
            if (!loaded) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `Agent Channel "${channelId}" was not found.`,
                    Params: params.Params,
                };
            }

            const rv = RunView.FromMetadataProvider(md);
            const partRes = await rv.RunView<MJAgentChannelParticipantEntity>(
                {
                    EntityName: 'MJ: Agent Channel Participants',
                    ExtraFilter: `AgentChannelID='${EscapeSQLString(channel.ID)}' AND UserID='${EscapeSQLString(
                        contextUser.ID
                    )}'`,
                    MaxRows: 1,
                    ResultType: 'entity_object',
                },
                systemUser
            );
            const isParticipant = partRes.Success && partRes.Results.length > 0;
            if (!isParticipant && contextUser.Type?.trim().toLowerCase() !== 'owner') {
                return {
                    Success: false,
                    ResultCode: 'POLICY_DENIED',
                    Message: 'You are not a participant in this Agent Channel.',
                    Params: params.Params,
                };
            }

            if (channel.ChannelStatus === 'Resolved') {
                return {
                    Success: false,
                    ResultCode: 'CHANNEL_RESOLVED',
                    Message: `Agent Channel "${channel.Topic}" is already Resolved.`,
                    Params: params.Params,
                };
            }

            const callingAgentId = extractContextAgentId(params.Context);
            if (callingAgentId && channel.ChannelStatus === 'Paused For Human') {
                return {
                    Success: false,
                    ResultCode: 'CHANNEL_PAUSED_LOOP_GUARD',
                    Message: `Agent Channel "${channel.Topic}" is paused awaiting human intervention; an agent cannot post until a human replies.`,
                    Params: params.Params,
                };
            }

            const detail = await newEntityObject<MJConversationDetailEntity>(md, 'MJ: Conversation Details', contextUser);
            detail.NewRecord();
            detail.ConversationID = channel.ID;
            detail.UserID = contextUser.ID;
            detail.AgentID = callingAgentId ?? null;
            detail.Role = callingAgentId ? 'AI' : 'User';
            detail.Message = message;
            if (callingAgentId && typeof (detail as MJConversationDetailEntityExtended).MarkServerAuthoredReply === 'function') {
                (detail as MJConversationDetailEntityExtended).MarkServerAuthoredReply();
            }
            const savedDetail = await detail.Save();
            if (!savedDetail) {
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: detail.LatestResult?.CompleteMessage || 'Failed to save Agent Channel reply.',
                    Params: params.Params,
                };
            }

            if (resolveChannel) {
                channel.ChannelStatus = 'Resolved';
                channel.ResolvedAt = new Date();
                const resolvedSaved = await channel.Save();
                if (!resolvedSaved) {
                    return {
                        Success: false,
                        ResultCode: 'SAVE_FAILED',
                        Message:
                            channel.LatestResult?.CompleteMessage ||
                            'Failed to mark Agent Channel as Resolved.',
                        Params: params.Params,
                    };
                }

                const resolvedPayload = {
                    ChannelID: channel.ID,
                    ConversationDetailID: detail.ID,
                    ChannelStatus: 'Resolved' as const,
                    PausedByGuard: false,
                    PauseReason: null,
                    WakeResults: [] as Awaited<
                        ReturnType<AgentWakeTriggerService['TriggerWakeOnAgentChannelMessage']>
                    >['results'],
                };
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: JSON.stringify(resolvedPayload),
                    Params: setOutputParam(params, 'ConversationDetailID', detail.ID),
                };
            }

            const wakeOutcome = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
                channelID: channel.ID,
                conversationDetailID: detail.ID,
                senderUserID: contextUser.ID,
                senderAgentID: callingAgentId ?? null,
                messagePreview: message,
                contextUser,
                metadataProvider: md,
            });

            const payload = {
                ChannelID: channel.ID,
                ConversationDetailID: detail.ID,
                ChannelStatus: wakeOutcome.channelStatus,
                PausedByGuard: wakeOutcome.pausedByGuard,
                PauseReason: wakeOutcome.pauseReason,
                WakeResults: wakeOutcome.results,
            };
            return {
                Success: true,
                ResultCode: wakeOutcome.pausedByGuard ? 'CHANNEL_PAUSED_LOOP_GUARD' : 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: setOutputParam(params, 'ConversationDetailID', detail.ID),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[ReplyInAgentChannelAction] ${msg}`);
            return { Success: false, ResultCode: 'ERROR', Message: msg, Params: params.Params };
        }
    }
}

/**
 * Reads an `AGENT_CHANNEL` conversation (metadata, participants, guard counters, and messages)
 * or lists the calling user's Agent Channels when `ChannelID` is omitted.
 */
@RegisterClass(BaseAction, 'Get Agent Channel')
export class GetAgentChannelAction extends BaseAction {
    public static override readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Get Agent Channel requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const guard = await TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ: Agent Channels',
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

            const channelId = readStringParam(params, 'ChannelID');
            const statusFilter = readStringParam(params, 'Status');
            const maxMessages = readNumberParam(params, 'MaxMessages', 30, 1, 100);
            const md: IMetadataProvider = params.Provider ?? Metadata.Provider;
            const rv = RunView.FromMetadataProvider(md);
            const systemUser = UserCache.Instance.GetSystemUser() ?? contextUser;
            const isOwner = contextUser.Type?.trim().toLowerCase() === 'owner';

            if (!channelId) {
                const myPartsRes = await rv.RunView<MJAgentChannelParticipantEntity>(
                    {
                        EntityName: 'MJ: Agent Channel Participants',
                        ExtraFilter: `UserID='${EscapeSQLString(contextUser.ID)}'`,
                        ResultType: 'entity_object',
                    },
                    systemUser
                );
                const myChannelIds = Array.from(
                    new Set((myPartsRes.Success ? myPartsRes.Results : []).map((p) => p.AgentChannelID))
                );
                if (myChannelIds.length === 0) {
                    const empty = { Count: 0, Channels: [] };
                    return {
                        Success: true,
                        ResultCode: 'SUCCESS',
                        Message: JSON.stringify(empty),
                        Params: setOutputParam(params, 'ChannelJSON', JSON.stringify(empty)),
                    };
                }

                const clauses = [
                    `ID IN (${myChannelIds.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`,
                ];
                if (statusFilter && statusFilter.toLowerCase() !== 'all') {
                    clauses.push(`ChannelStatus='${EscapeSQLString(statusFilter)}'`);
                }
                const channelsRes = await rv.RunView<MJAgentChannelEntity>(
                    {
                        EntityName: 'MJ: Agent Channels',
                        ExtraFilter: clauses.join(' AND '),
                        OrderBy: '__mj_UpdatedAt DESC',
                        MaxRows: 50,
                        ResultType: 'entity_object',
                    },
                    systemUser
                );
                const rows = TypedActionPolicyGuard.MaskRows(
                    (channelsRes.Success ? channelsRes.Results : []).map((c) => ({
                        ChannelID: c.ID,
                        Topic: c.Topic,
                        ChannelStatus: c.ChannelStatus,
                        ConsecutiveAgentTurns: c.ConsecutiveAgentTurns,
                        MaxConsecutiveAgentTurns: c.MaxConsecutiveAgentTurns,
                        HourlyWakeCount: c.HourlyWakeCount,
                        MaxHourlyWakes: c.MaxHourlyWakes,
                        ReplyBy: c.ReplyBy?.toISOString() ?? null,
                        LastHumanMessageAt: c.LastHumanMessageAt?.toISOString() ?? null,
                    })),
                    guard.DeniedFieldPatterns
                );
                const payload = { Count: rows.length, Channels: rows };
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: JSON.stringify(payload),
                    Params: setOutputParam(params, 'ChannelJSON', JSON.stringify(payload)),
                };
            }

            const participantsRes = await rv.RunView<MJAgentChannelParticipantEntity>(
                {
                    EntityName: 'MJ: Agent Channel Participants',
                    ExtraFilter: `AgentChannelID='${EscapeSQLString(channelId)}'`,
                    OrderBy: 'JoinedAt ASC',
                    ResultType: 'entity_object',
                },
                systemUser
            );
            const participants = participantsRes.Success ? participantsRes.Results : [];
            const callerIsParticipant = participants.some((p) => UUIDsEqual(p.UserID, contextUser.ID));
            if (!callerIsParticipant && !isOwner) {
                return {
                    Success: false,
                    ResultCode: 'POLICY_DENIED',
                    Message: 'You do not have access to this Agent Channel.',
                    Params: params.Params,
                };
            }

            const channel = await newEntityObject<MJAgentChannelEntity>(md, 'MJ: Agent Channels', systemUser);
            const loaded = await channel.Load(channelId);
            if (!loaded) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `Agent Channel "${channelId}" was not found.`,
                    Params: params.Params,
                };
            }

            const messagesRes = await rv.RunView<MJConversationDetailEntity>(
                {
                    EntityName: 'MJ: Conversation Details',
                    ExtraFilter: `ConversationID='${EscapeSQLString(channel.ID)}'`,
                    OrderBy: '__mj_CreatedAt ASC',
                    MaxRows: maxMessages,
                    ResultType: 'entity_object',
                },
                systemUser
            );

            const payload = {
                Channel: TypedActionPolicyGuard.MaskRecord(
                    {
                        ChannelID: channel.ID,
                        Topic: channel.Topic,
                        ChannelStatus: channel.ChannelStatus,
                        ConsecutiveAgentTurns: channel.ConsecutiveAgentTurns,
                        MaxConsecutiveAgentTurns: channel.MaxConsecutiveAgentTurns,
                        HourlyWakeCount: channel.HourlyWakeCount,
                        MaxHourlyWakes: channel.MaxHourlyWakes,
                        ReplyBy: channel.ReplyBy?.toISOString() ?? null,
                        LastHumanMessageAt: channel.LastHumanMessageAt?.toISOString() ?? null,
                        ResolvedAt: channel.ResolvedAt?.toISOString() ?? null,
                    },
                    guard.DeniedFieldPatterns
                ),
                Participants: participants.map((p) => ({
                    ParticipantID: p.ID,
                    UserID: p.UserID,
                    UserName: p.User,
                    AgentID: p.AgentID,
                    AgentName: p.Agent,
                    Role: p.Role,
                    JoinedAt: p.JoinedAt?.toISOString() ?? null,
                })),
                Messages: (messagesRes.Success ? messagesRes.Results : []).map((m) => ({
                    DetailID: m.ID,
                    Role: m.Role,
                    UserID: m.UserID,
                    AgentID: m.AgentID,
                    Message: m.Message,
                    CreatedAt: m.__mj_CreatedAt?.toISOString() ?? null,
                })),
            };

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(payload),
                Params: setOutputParam(params, 'ChannelJSON', JSON.stringify(payload)),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[GetAgentChannelAction] ${msg}`);
            return { Success: false, ResultCode: 'ERROR', Message: msg, Params: params.Params };
        }
    }
}
