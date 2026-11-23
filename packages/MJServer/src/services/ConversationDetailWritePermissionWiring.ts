import { LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserMayWriteConversation, type MJConversationDetailEntity } from '@memberjunction/core-entities';
import {
    ConversationDetailWritePermissionRegistry,
    ResolveConversationSummaryForWritePermission,
    type ConversationDetailWriteOperation,
    type ConversationDetailWritePermissionVerdict,
    type ConversationSummaryForWritePermission,
} from '@memberjunction/core-entities-server';

/**
 * Parameters for {@link AuthorizeConversationDetailWrite}.
 */
export interface AuthorizeConversationDetailWriteParams {
    Provider: IMetadataProvider;
    ContextUser: UserInfo;
    Operation: ConversationDetailWriteOperation;
    ConversationDetail: MJConversationDetailEntity;
    Conversation?: ConversationSummaryForWritePermission | null;
    IsServerAuthoredReply?: boolean;
}

/**
 * Authorization decision returned by {@link AuthorizeConversationDetailWrite}.
 */
export interface ConversationDetailWriteAuthorizationResult {
    Allowed: boolean;
    IsOwner: boolean;
    Reason: string | null;
    DecisionSource: 'CustomProvider' | 'Default';
    Conversation: ConversationSummaryForWritePermission | null;
}

/**
 * Preloads lightweight conversation metadata once so custom `MJServer` mutations or handlers
 * can attach it to `MJConversationDetailEntityServer.SetConversationWriteContext(...)` without
 * issuing redundant per-write conversation queries.
 */
export async function ResolveConversationDetailWriteContext(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    conversationId: string
): Promise<ConversationSummaryForWritePermission | null> {
    return ResolveConversationSummaryForWritePermission(provider, contextUser, conversationId);
}

/**
 * Evaluates conversation-detail write authorization using any registered
 * {@link ConversationDetailWritePermissionProvider}s (via `ClassFactory` or explicit registry)
 * and falls back cleanly to {@link UserMayWriteConversation} when all providers abstain or none are registered.
 */
export async function AuthorizeConversationDetailWrite(
    params: AuthorizeConversationDetailWriteParams
): Promise<ConversationDetailWriteAuthorizationResult> {
    const conversationId = params.ConversationDetail.ConversationID;
    let preloaded: ConversationSummaryForWritePermission | null = params.Conversation ?? null;

    if (ConversationDetailWritePermissionRegistry.Instance.HasRegisteredProviders()) {
        try {
            preloaded = await ResolveConversationSummaryForWritePermission(
                params.Provider,
                params.ContextUser,
                conversationId,
                preloaded
            );
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(
                `AuthorizeConversationDetailWrite failed closed on conversation ${conversationId} for user ${params.ContextUser.ID}: ${msg}`
            );
            return {
                Allowed: false,
                IsOwner: false,
                Reason: 'Unable to verify conversation write permissions.',
                DecisionSource: 'CustomProvider',
                Conversation: null,
            };
        }
        const verdict: ConversationDetailWritePermissionVerdict =
            await ConversationDetailWritePermissionRegistry.Instance.Evaluate({
                Provider: params.Provider,
                ContextUser: params.ContextUser,
                Operation: params.Operation,
                ConversationID: conversationId,
                Conversation: preloaded,
                ConversationDetail: params.ConversationDetail,
                IsServerAuthoredReply: Boolean(params.IsServerAuthoredReply),
            });

        if (verdict.Decision === 'Allow') {
            return {
                Allowed: true,
                IsOwner: Boolean(verdict.IsOwnerOverride),
                Reason: verdict.Reason ?? null,
                DecisionSource: 'CustomProvider',
                Conversation: preloaded,
            };
        }
        if (verdict.Decision === 'Deny') {
            return {
                Allowed: false,
                IsOwner: false,
                Reason: verdict.Reason,
                DecisionSource: 'CustomProvider',
                Conversation: preloaded,
            };
        }
    }

    const defaultDecision = await UserMayWriteConversation(
        params.Provider,
        params.ContextUser,
        conversationId
    );
    return {
        Allowed: defaultDecision.Allowed,
        IsOwner: defaultDecision.IsOwner,
        Reason: defaultDecision.Reason,
        DecisionSource: 'Default',
        Conversation: preloaded,
    };
}

/**
 * Eagerly resolves all ClassFactory-registered {@link ConversationDetailWritePermissionProvider}s
 * at server boot and returns the count of active providers.
 */
export function InitializeConversationDetailWritePermissionProviders(): number {
    return ConversationDetailWritePermissionRegistry.Instance.ResolveProviders().length;
}
