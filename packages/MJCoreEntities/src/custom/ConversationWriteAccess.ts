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
 * Roles whose members may delete any conversation. Matches the roles that may delete any List
 * (`MJListEntityExtended.UserCanDelete`); the system user holds Developer.
 */
const CONVERSATION_DELETE_PRIVILEGED_ROLES = ['developer', 'integration'];

/** The refusal recorded when a user who is not allowed to delete a conversation tries to. */
export const CONVERSATION_DELETE_REFUSED_REASON =
    'Only the owner, or someone with Owner access, can delete a conversation';

/** True when the user holds a role whose members may delete any conversation (Developer or Integration). */
export function UserHoldsConversationDeleteRole(user: UserInfo | null | undefined): boolean {
    return (user?.UserRoles ?? []).some(ur =>
        CONVERSATION_DELETE_PRIVILEGED_ROLES.includes((ur.Role ?? '').trim().toLowerCase())
    );
}

/**
 * The rule for deleting a conversation for everyone: its owner, a user with an Owner-level grant on it,
 * or a user in the Developer or Integration role. An Edit grant lets someone change a conversation, not
 * remove it. Pure, so the client (to enable Delete) and the server (to enforce it) apply the same rule.
 *
 * @param ownerUserId the conversation's `UserID`
 * @param user the acting user, with `UserRoles` populated; none means not allowed
 * @param grantLevel the user's grant level on the conversation, or null when they hold none
 */
export function ConversationDeleteAllowed(
    ownerUserId: string | null | undefined,
    user: UserInfo | null | undefined,
    grantLevel: 'View' | 'Edit' | 'Owner' | null | undefined
): boolean {
    if (!user) {
        return false;
    }
    if (ownerUserId && UUIDsEqual(ownerUserId, user.ID)) {
        return true;
    }
    if (UserHoldsConversationDeleteRole(user)) {
        return true;
    }
    return grantLevel === 'Owner';
}

/**
 * Whether a user may delete a conversation for everyone (see {@link ConversationDeleteAllowed}). Reads the
 * user's grant from `MJ: Resource Permissions` only when ownership and role do not already decide it.
 * Server-side only; a non-database provider, or a call with no user, trusts the enforcement upstream,
 * as {@link UserMayWriteConversation} does.
 */
export async function UserMayDeleteConversation(
    provider: IMetadataProvider,
    user: UserInfo | null | undefined,
    conversation: { ID: string; UserID: string | null }
): Promise<{ Allowed: boolean; Reason: string | null }> {
    if (provider?.ProviderType !== 'Database' || !user) {
        return { Allowed: true, Reason: null };
    }
    if (ConversationDeleteAllowed(conversation.UserID, user, null)) {
        return { Allowed: true, Reason: null };
    }
    const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(provider, ResourcePermissionEngine) as ResourcePermissionEngine;
    await engine.Config(false, user);
    const level = engine.GetUserResourcePermissionLevel(CONVERSATIONS_RESOURCE_TYPE_ID, conversation.ID, user);
    if (ConversationDeleteAllowed(conversation.UserID, user, level)) {
        return { Allowed: true, Reason: null };
    }
    return { Allowed: false, Reason: `${CONVERSATION_DELETE_REFUSED_REASON}.` };
}
