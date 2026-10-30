import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJConversationEntity, MJProjectEntity, MJResourcePermissionEntity } from '../generated/entity_subclasses';
import { ResourcePermissionEngine } from './ResourcePermissions/ResourcePermissionEngine';

/** Resource type ID for conversations in the resource permission system. */
export const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

/** Resource type ID for conversation folders (`MJ: Projects`) in the resource permission system. */
const PROJECTS_RESOURCE_TYPE_ID = '88D0DF27-AF8F-43AC-9EC4-2AC314F49355';

/**
 * Returns whether a conversation inherits access from its folder (`ProjectID`).
 * Defaults to `true` unless `AdditionalData` explicitly sets `"inheritFolderAccess": false`.
 */
function IsInheritingFolderAccess(
    conversation: { AdditionalData?: string | null } | null | undefined
): boolean {
    const raw = conversation?.AdditionalData;
    if (!raw || typeof raw !== 'string') return true;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return parsed?.['inheritFolderAccess'] !== false;
    } catch {
        return !raw.includes('"inheritFolderAccess":false');
    }
}

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
 * Whether a user may write rows that belong to a conversation: the owner, a user with an
 * explicit `Edit`/`Owner` grant on the conversation, or (when {@link IsInheritingFolderAccess}
 * is true) a user with an `Edit`/`Owner` grant on the conversation's folder (`MJ: Projects`).
 * Conversations inside a Public folder (`Project.OwnerUserID IS NULL`) or a Shared folder with
 * `View` access grant View-only access unless an explicit `Edit`/`Owner` grant says otherwise.
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
    if (conversation.UserID && UUIDsEqual(conversation.UserID, user.ID)) {
        return { Allowed: true, Reason: null, IsOwner: true, Loaded: true };
    }
    const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(provider, ResourcePermissionEngine) as ResourcePermissionEngine;
    await engine.Config(false, user);
    const grant = engine
        .GetUserAvailableResources(user, CONVERSATIONS_RESOURCE_TYPE_ID)
        .find((p: MJResourcePermissionEntity) => UUIDsEqual(p.ResourceRecordID, conversationId));
    if (grant && (grant.PermissionLevel === 'Edit' || grant.PermissionLevel === 'Owner')) {
        return { Allowed: true, Reason: null, IsOwner: false, Loaded: true };
    }

    let hasViewAccess = grant?.PermissionLevel === 'View';

    if (conversation.ProjectID && IsInheritingFolderAccess(conversation)) {
        const folderPerm = engine.GetUserResourcePermissionLevel?.(
            PROJECTS_RESOURCE_TYPE_ID,
            conversation.ProjectID,
            user
        );
        if (folderPerm === 'Edit' || folderPerm === 'Owner') {
            return { Allowed: true, Reason: null, IsOwner: false, Loaded: true };
        }
        if (folderPerm === 'View') {
            hasViewAccess = true;
        } else {
            const project = await provider.GetEntityObject<MJProjectEntity>('MJ: Projects', user);
            if (await project.Load(conversation.ProjectID)) {
                if (!project.OwnerUserID || (project.OwnerUserID && UUIDsEqual(project.OwnerUserID, user.ID))) {
                    hasViewAccess = true;
                }
            }
        }
    }

    if (hasViewAccess) {
        return { Allowed: false, Reason: 'You have view-only access to this conversation.', IsOwner: false, Loaded: true };
    }
    return { Allowed: false, Reason: 'You do not have access to this conversation.', IsOwner: false, Loaded: true };
}

