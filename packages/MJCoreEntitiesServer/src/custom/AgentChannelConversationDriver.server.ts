import {
    BaseEntity,
    IMetadataProvider,
    LogError,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    WellKnownUserSource,
} from '@memberjunction/core';
import {
    BUILT_IN_CONVERSATION_TYPE_IDS,
    CONVERSATION_TYPE_CODES,
    ConversationEngine,
    MJAgentChannelEntity,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, GetGlobalObjectStore, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { ConversationTypeDriver } from './ConversationAndCommentDrivers';

/**
 * Well-known `GetGlobalObjectStore()` key shared between `@memberjunction/core-entities-server`
 * and `@memberjunction/ai-agents` so human replies saved directly to an `AGENT_CHANNEL`
 * conversation wake peer participant agents without introducing a circular package dependency.
 */
export const AGENT_CHANNEL_HUMAN_POST_WAKE_HANDLER_KEY = '__MJ_AGENT_CHANNEL_HUMAN_POST_WAKE_HANDLER__';

/**
 * Optional message metadata passed from `MJConversationDetailEntityServer.Save()` to
 * {@link AgentChannelConversationDriver.HandleHumanMessagePosted} so peer wake routines
 * carry the posted message ID, author, and preview text.
 */
export interface AgentChannelHumanPostContext {
    conversationDetailID?: string | null;
    senderUserID?: string | null;
    messagePreview?: string;
    skipPeerWake?: boolean;
}

/**
 * Event payload dispatched to the registered {@link AgentChannelHumanPostWakeHandler}
 * whenever a direct human message is saved in an active `AGENT_CHANNEL` conversation.
 */
export interface AgentChannelHumanPostWakeEvent {
    provider: IMetadataProvider;
    channelID: string;
    conversationDetailID: string | null;
    senderUserID: string;
    messagePreview: string;
    contextUser: UserInfo;
    now: Date;
    reopenedFromPause: boolean;
}

/**
 * Decoupled callback registered by `@memberjunction/ai-agents` (`AgentWakeTriggerService`)
 * to schedule immediate peer participant wakes after a human posts in an Agent Channel.
 */
export type AgentChannelHumanPostWakeHandler = (
    event: AgentChannelHumanPostWakeEvent
) => Promise<number | void> | number | void;

/**
 * Registers (or clears when passed `null`) the process-wide handler invoked after a human
 * participant posts directly in an `AGENT_CHANNEL` conversation.
 */
export function RegisterAgentChannelHumanPostWakeHandler(
    handler: AgentChannelHumanPostWakeHandler | null
): void {
    const store = GetGlobalObjectStore();
    if (!store) {
        return;
    }
    if (handler) {
        store[AGENT_CHANNEL_HUMAN_POST_WAKE_HANDLER_KEY] = handler;
    } else {
        delete store[AGENT_CHANNEL_HUMAN_POST_WAKE_HANDLER_KEY];
    }
}

/**
 * Returns the currently registered human-post wake handler, or `null` if none is registered.
 */
export function GetAgentChannelHumanPostWakeHandler(): AgentChannelHumanPostWakeHandler | null {
    const store = GetGlobalObjectStore();
    const candidate = store?.[AGENT_CHANNEL_HUMAN_POST_WAKE_HANDLER_KEY];
    return typeof candidate === 'function' ? (candidate as AgentChannelHumanPostWakeHandler) : null;
}

function extractAgentChannelFromEntity(entity: BaseEntity): MJAgentChannelEntity | null {
    if (entity.EntityInfo?.Name === 'MJ: Agent Channels') {
        return entity as MJAgentChannelEntity;
    }
    if (entity.ISAChild && entity.ISAChild.EntityInfo?.Name === 'MJ: Agent Channels') {
        return entity.ISAChild as MJAgentChannelEntity;
    }
    return null;
}

/**
 * Outcome returned by {@link AgentChannelConversationDriver.HandleHumanMessagePosted}.
 */
export interface AgentChannelHumanMessageResult {
    isAgentChannel: boolean;
    updated: boolean;
    reopenedFromPause: boolean;
    channelStatus?: MJAgentChannelEntity['ChannelStatus'];
    wakeHandlerInvoked?: boolean;
    peerWakesTriggered?: number;
}

/**
 * Built-in server driver for `MJ: Conversation Types` code `'AGENT_CHANNEL'`
 * (`MJ: Agent Channels` IS-A `MJ: Conversations`).
 *
 * Responsibilities:
 * 1. Validates Agent Channel guard bounds (`Topic`, `MaxConsecutiveAgentTurns`, `MaxHourlyWakes`).
 * 2. Verifies participant membership before direct messages are posted to an Agent Channel.
 * 3. Resets `ConsecutiveAgentTurns = 0`, updates `LastHumanMessageAt`, and transitions
 *    `ChannelStatus` from `'Paused For Human'` back to `'Open'` whenever a human participant
 *    posts directly in the channel.
 */
@RegisterClass(ConversationTypeDriver, 'AgentChannelConversationDriver')
export class AgentChannelConversationDriver extends ConversationTypeDriver {
    public override Validate(
        entity: BaseEntity,
        result: ValidationResult,
        _contextUser: UserInfo | null
    ): void {
        const channel = extractAgentChannelFromEntity(entity);
        if (!channel) {
            return;
        }

        if (!channel.Topic || channel.Topic.trim().length === 0) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'Topic',
                    'Agent Channel requires a non-empty Topic.',
                    channel.Topic,
                    ValidationErrorType.Failure
                )
            );
        }

        if (channel.MaxConsecutiveAgentTurns < 1) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'MaxConsecutiveAgentTurns',
                    'MaxConsecutiveAgentTurns must be at least 1.',
                    channel.MaxConsecutiveAgentTurns,
                    ValidationErrorType.Failure
                )
            );
        }

        if (channel.MaxHourlyWakes < 1) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo(
                    'MaxHourlyWakes',
                    'MaxHourlyWakes must be at least 1.',
                    channel.MaxHourlyWakes,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    /**
     * Checks whether `user` is permitted to post a new message into `conversationID` if it is
     * an `AGENT_CHANNEL` conversation. Returns an error string when refused, or `null` when allowed
     * (or when the conversation is not an Agent Channel).
     */
    public static async CheckParticipantCanPost(
        provider: IMetadataProvider,
        conversationID: string,
        user: UserInfo
    ): Promise<string | null> {
        if (!provider || provider.ProviderType !== 'Database' || !conversationID || !user?.ID) {
            return null;
        }
        if (WellKnownUserSource.Instance.IsSystemUser(user) || user.Type?.trim().toLowerCase() === 'owner') {
            return null;
        }

        const systemUser = (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? user;
        const conversation = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', systemUser);
        const loaded = await conversation.Load(conversationID);
        if (!loaded) {
            return null;
        }

        const agentChannelTypeID =
            ConversationEngine.Instance.ResolveConversationTypeID(CONVERSATION_TYPE_CODES.AGENT_CHANNEL) ??
            BUILT_IN_CONVERSATION_TYPE_IDS.AGENT_CHANNEL;
        if (!conversation.TypeID || !UUIDsEqual(conversation.TypeID, agentChannelTypeID)) {
            return null;
        }

        const rv = RunView.FromMetadataProvider(provider);
        const participantCheck = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Agent Channel Participants',
                ExtraFilter: `AgentChannelID='${EscapeSQLString(conversationID)}' AND UserID='${EscapeSQLString(user.ID)}'`,
                Fields: ['ID'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            systemUser
        );
        if (!participantCheck.Success || participantCheck.Results.length === 0) {
            return 'You are not a participant in this Agent Channel and cannot post messages to it.';
        }

        return null;
    }

    /**
     * Called after a direct human message (`Role === 'User'` and no `AgentID`) is saved to a
     * conversation. When the conversation is an `AGENT_CHANNEL`, resets `ConsecutiveAgentTurns`
     * to `0`, updates `LastHumanMessageAt`, re-opens `'Paused For Human'` channels to `'Open'`,
     * and invokes the registered peer-agent wake hook so participant agents wake immediately.
     */
    public static async HandleHumanMessagePosted(
        provider: IMetadataProvider,
        conversationID: string,
        contextUser: UserInfo | null,
        now: Date = new Date(),
        messageContext?: AgentChannelHumanPostContext
    ): Promise<AgentChannelHumanMessageResult> {
        if (!provider || provider.ProviderType !== 'Database' || !conversationID) {
            return { isAgentChannel: false, updated: false, reopenedFromPause: false };
        }

        try {
            const systemUser = (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? contextUser ?? undefined;
            if (!systemUser) {
                return { isAgentChannel: false, updated: false, reopenedFromPause: false };
            }

            const conversation = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', systemUser);
            const convLoaded = await conversation.Load(conversationID);
            if (!convLoaded) {
                return { isAgentChannel: false, updated: false, reopenedFromPause: false };
            }

            const agentChannelTypeID =
                ConversationEngine.Instance.ResolveConversationTypeID(CONVERSATION_TYPE_CODES.AGENT_CHANNEL) ??
                BUILT_IN_CONVERSATION_TYPE_IDS.AGENT_CHANNEL;
            if (!conversation.TypeID || !UUIDsEqual(conversation.TypeID, agentChannelTypeID)) {
                return { isAgentChannel: false, updated: false, reopenedFromPause: false };
            }

            const channel = await provider.GetEntityObject<MJAgentChannelEntity>('MJ: Agent Channels', systemUser);
            const loaded = await channel.Load(conversationID);
            if (!loaded) {
                return { isAgentChannel: true, updated: false, reopenedFromPause: false };
            }

            if (channel.ChannelStatus === 'Resolved') {
                return {
                    isAgentChannel: true,
                    updated: false,
                    reopenedFromPause: false,
                    channelStatus: channel.ChannelStatus,
                };
            }

            const wasPaused = channel.ChannelStatus === 'Paused For Human';
            channel.ConsecutiveAgentTurns = 0;
            channel.LastHumanMessageAt = now;
            if (wasPaused) {
                channel.ChannelStatus = 'Open';
            }

            const saved = await channel.Save();
            if (!saved) {
                LogError(
                    `AgentChannelConversationDriver.HandleHumanMessagePosted failed to update channel ${conversationID}: ${
                        channel.LatestResult?.CompleteMessage ?? 'unknown error'
                    }`
                );
                return {
                    isAgentChannel: true,
                    updated: false,
                    reopenedFromPause: false,
                    channelStatus: channel.ChannelStatus,
                };
            }

            let wakeHandlerInvoked = false;
            let peerWakesTriggered: number | undefined;
            const wakeHandler = messageContext?.skipPeerWake ? null : GetAgentChannelHumanPostWakeHandler();
            const senderUserID = (messageContext?.senderUserID ?? contextUser?.ID ?? '').trim();
            const actingUser = contextUser ?? systemUser;
            if (wakeHandler && senderUserID && actingUser) {
                wakeHandlerInvoked = true;
                try {
                    const count = await wakeHandler({
                        provider,
                        channelID: conversationID,
                        conversationDetailID: messageContext?.conversationDetailID ?? null,
                        senderUserID,
                        messagePreview: messageContext?.messagePreview ?? '',
                        contextUser: actingUser,
                        now,
                        reopenedFromPause: wasPaused,
                    });
                    if (typeof count === 'number') {
                        peerWakesTriggered = count;
                    }
                } catch (wakeError) {
                    LogError(
                        `AgentChannelConversationDriver.HandleHumanMessagePosted wake hook failed on channel ${conversationID}: ${
                            wakeError instanceof Error ? wakeError.message : String(wakeError)
                        }`
                    );
                }
            }

            return {
                isAgentChannel: true,
                updated: true,
                reopenedFromPause: wasPaused,
                channelStatus: channel.ChannelStatus,
                wakeHandlerInvoked,
                ...(peerWakesTriggered !== undefined ? { peerWakesTriggered } : {}),
            };
        } catch (error) {
            LogError(
                `AgentChannelConversationDriver.HandleHumanMessagePosted error on conversation ${conversationID}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            return { isAgentChannel: false, updated: false, reopenedFromPause: false };
        }
    }
}
