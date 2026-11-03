import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJConversationEntity, MJResourcePermissionEntity } from '../generated/entity_subclasses';
import { IsConversationHiddenByFieldSecurity, UserCanReadLinkedRecord } from './AnchoredConversationSecurity';
import { ResourcePermissionEngine } from './ResourcePermissions/ResourcePermissionEngine';

/** Resource type ID for conversations in the resource permission system. */
export const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

export interface ConversationWriteDecision {
    Allowed: boolean;
    Reason: string | null;
    /** True only when the conversation loaded and the user is its owner. */
    IsOwner: boolean;
    /**
     * True when the conversation loaded for the user. A conversation that did not load is `Allowed` whether it is
     * missing or hidden from the user by a row filter, so a caller that must tell those apart checks this.
     */
    Loaded: boolean;
}

/**
 * Whether a user may write rows that belong to a conversation:
 * - For anchored record/artifact comment threads (`AnchorType != null` with `LinkedEntityID` and `LinkedRecordID`),
 *   any user who can read the linked record (including RLS) and is not denied read access on the anchored field
 *   or `restrictedFields` (FLS) may post and reply in the thread.
 * - For standard chat conversations (`AnchorType == null`), the conversation owner or a user with an `Edit` or
 *   `Owner` grant on `MJ: Resource Permissions`.
 *
 * Server-side only; a non-database provider trusts the enforcement that already ran upstream.
 */
export async function UserMayWriteConversation(
    provider: IMetadataProvider,
    user: UserInfo | null | undefined,
    conversationId: string
): Promise<ConversationWriteDecision> {
    if (provider?.ProviderType !== 'Database' || !user) {
        return { Allowed: true, Reason: null, IsOwner: false, Loaded: false };
    }
    const conversation = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', user);
    if (!(await conversation.Load(conversationId))) {
        return { Allowed: true, Reason: null, IsOwner: false, Loaded: false };
    }
    const isOwner = Boolean(conversation.UserID && UUIDsEqual(conversation.UserID, user.ID));

    if (conversation.AnchorType != null && conversation.LinkedEntityID && conversation.LinkedRecordID) {
        const entityInfo =
            (typeof provider.EntityByID === 'function'
                ? provider.EntityByID(conversation.LinkedEntityID)
                : undefined) ??
            provider.Entities?.find((e) => UUIDsEqual(e.ID, conversation.LinkedEntityID)) ??
            null;
        if (entityInfo) {
            if (entityInfo.AllowRecordComments === false) {
                return {
                    Allowed: false,
                    Reason: `Record commenting is disabled for ${entityInfo.DisplayNameOrName}.`,
                    IsOwner: isOwner,
                    Loaded: true
                };
            }
            if (typeof entityInfo.CanUserComment === 'function' && !entityInfo.CanUserComment(user)) {
                return {
                    Allowed: false,
                    Reason: `You do not have permission to post comments on ${entityInfo.DisplayNameOrName} records.`,
                    IsOwner: isOwner,
                    Loaded: true
                };
            }
        }

        const recordAccess = await UserCanReadLinkedRecord(
            provider,
            user,
            conversation.LinkedEntityID,
            conversation.LinkedRecordID
        );
        if (!recordAccess.Allowed || !recordAccess.EntityInfo) {
            return {
                Allowed: false,
                Reason: recordAccess.Reason ?? 'You do not have access to the linked record.',
                IsOwner: isOwner,
                Loaded: true
            };
        }
        if (
            IsConversationHiddenByFieldSecurity(
                recordAccess.EntityInfo,
                user,
                conversation.AnchorType,
                conversation.AnchorKey,
                conversation.AnchorMetadataObject ?? conversation.AnchorMetadata
            )
        ) {
            return {
                Allowed: false,
                Reason: 'You do not have permission to access the field referenced by this comment thread.',
                IsOwner: isOwner,
                Loaded: true
            };
        }
        return { Allowed: true, Reason: null, IsOwner: isOwner, Loaded: true };
    }

    if (isOwner) {
        return { Allowed: true, Reason: null, IsOwner: true, Loaded: true };
    }
    const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(provider, ResourcePermissionEngine) as ResourcePermissionEngine;
    await engine.Config(false, user);
    const grant = engine
        .GetUserAvailableResources(user, CONVERSATIONS_RESOURCE_TYPE_ID)
        .find((p: MJResourcePermissionEntity) => UUIDsEqual(p.ResourceRecordID, conversationId));
    if (!grant) {
        return { Allowed: false, Reason: 'You do not have access to this conversation.', IsOwner: false, Loaded: true };
    }
    if (grant.PermissionLevel === 'Edit' || grant.PermissionLevel === 'Owner') {
        return { Allowed: true, Reason: null, IsOwner: false, Loaded: true };
    }
    return { Allowed: false, Reason: 'You have view-only access to this conversation.', IsOwner: false, Loaded: true };
}
