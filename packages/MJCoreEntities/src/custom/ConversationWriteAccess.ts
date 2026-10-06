import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJConversationEntity, MJResourcePermissionEntity } from '../generated/entity_subclasses';
import { ResourcePermissionEngine } from './ResourcePermissions/ResourcePermissionEngine';

/** Resource type ID for conversations in the resource permission system. */
export const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

export interface ConversationWriteDecision {
    Allowed: boolean;
    Reason: string | null;
    /** True only when the conversation loaded and the user is its owner. */
    IsOwner: boolean;
}

/**
 * Whether a user may write rows that belong to a conversation: the owner, or a user with
 * an Edit or Owner grant. Server-side only; a non-database provider trusts the enforcement
 * that already ran upstream.
 */
export async function UserMayWriteConversation(
    provider: IMetadataProvider,
    user: UserInfo | null | undefined,
    conversationId: string
): Promise<ConversationWriteDecision> {
    if (provider?.ProviderType !== 'Database' || !user) {
        return { Allowed: true, Reason: null, IsOwner: false };
    }
    const conversation = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', user);
    if (!(await conversation.Load(conversationId))) {
        return { Allowed: true, Reason: null, IsOwner: false };
    }
    if (conversation.UserID && UUIDsEqual(conversation.UserID, user.ID)) {
        return { Allowed: true, Reason: null, IsOwner: true };
    }
    const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(provider, ResourcePermissionEngine) as ResourcePermissionEngine;
    await engine.Config(false, user);
    const grant = engine
        .GetUserAvailableResources(user, CONVERSATIONS_RESOURCE_TYPE_ID)
        .find((p: MJResourcePermissionEntity) => UUIDsEqual(p.ResourceRecordID, conversationId));
    if (!grant) {
        return { Allowed: false, Reason: 'You do not have access to this conversation.', IsOwner: false };
    }
    if (grant.PermissionLevel === 'Edit' || grant.PermissionLevel === 'Owner') {
        return { Allowed: true, Reason: null, IsOwner: false };
    }
    return { Allowed: false, Reason: 'You have view-only access to this conversation.', IsOwner: false };
}
