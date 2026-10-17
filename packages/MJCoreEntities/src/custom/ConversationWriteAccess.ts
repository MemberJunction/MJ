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
    /**
     * True when the conversation loaded for the user. A conversation that did not load is `Allowed` whether it is
     * missing or hidden from the user by a row filter, so a caller that must tell those apart checks this.
     */
    Loaded: boolean;
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
        return { Allowed: true, Reason: null, IsOwner: false, Loaded: false };
    }
    const conversation = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', user);
    if (!(await conversation.Load(conversationId))) {
        return { Allowed: true, Reason: null, IsOwner: false, Loaded: false };
    }
    if (conversation.UserID && UUIDsEqual(conversation.UserID, user.ID)) {
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

/**
 * Whether a user owns a conversation: its `UserID`, or an Owner-level grant on it. The same
 * rule as the share gate. Server-side only: a non-database provider, or a conversation that
 * cannot be loaded, reports false, since nothing could be verified; callers that must fail
 * open on the client decide that themselves.
 */
export async function UserOwnsConversation(
    provider: IMetadataProvider,
    user: UserInfo | null | undefined,
    conversationId: string
): Promise<boolean> {
    if (provider?.ProviderType !== 'Database' || !user) {
        return false;
    }
    const conversation = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', user);
    if (!(await conversation.Load(conversationId))) {
        return false;
    }
    if (conversation.UserID && UUIDsEqual(conversation.UserID, user.ID)) {
        return true;
    }
    const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(provider, ResourcePermissionEngine) as ResourcePermissionEngine;
    await engine.Config(false, user);
    const grant = engine
        .GetUserAvailableResources(user, CONVERSATIONS_RESOURCE_TYPE_ID)
        .find((p: MJResourcePermissionEntity) => UUIDsEqual(p.ResourceRecordID, conversationId));
    return grant?.PermissionLevel === 'Owner';
}
