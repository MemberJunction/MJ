import {
    BaseEntity,
    EntityDeleteOptions,
    EntitySaveOptions,
    IMetadataProvider,
    LogError
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    MJConversationDetailEntity,
    MJConversationEntity,
    MJResourcePermissionEntity
} from '../generated/entity_subclasses';
import { ResourcePermissionEngine } from './ResourcePermissions/ResourcePermissionEngine';

/** `MJ: Resource Types.ID` for Conversations — seeded in the resource type catalog. */
const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

/**
 * Server-side defense-in-depth for conversation sharing. The Angular chat UI
 * disables the message input when the current user only holds `View` access,
 * but that's a cosmetic gate — a determined caller could still hit the API
 * directly. This override blocks Create/Update/Delete of conversation
 * messages unless the context user is either:
 *
 *  1. The conversation's owner (`MJ: Conversations.UserID`), or
 *  2. A grantee on `MJ: Resource Permissions` with `PermissionLevel` of
 *     `Edit` or `Owner` (directly or via role) and `Status='Approved'`.
 *
 * Runs on the server only (`ProviderType === 'Database'`) — client-side
 * executions pass straight through to `super` so offline/optimistic paths
 * still work. `ResourcePermissionEngine`'s cache is used to avoid per-save
 * round trips for permission lookups.
 */
@RegisterClass(BaseEntity, 'MJ: Conversation Details')
export class MJConversationDetailEntityExtended extends MJConversationDetailEntity {
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!(await this.currentUserMayWrite())) {
            return false;
        }
        return super.Save(options);
    }

    override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!(await this.currentUserMayWrite())) {
            return false;
        }
        return super.Delete(options);
    }

    private async currentUserMayWrite(): Promise<boolean> {
        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        if (provider?.ProviderType !== 'Database') {
            // Client-side path — trust the enforcement that already ran upstream.
            return true;
        }

        const user = this.ContextCurrentUser;
        if (!user) {
            // No user context on a server save = system operation; allow.
            return true;
        }

        try {
            const conversation = await provider.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                user
            );
            const loaded = await conversation.Load(this.ConversationID);
            if (!loaded) {
                // Parent conversation missing — let the FK/base save handle it.
                return true;
            }

            if (conversation.UserID && UUIDsEqual(conversation.UserID, user.ID)) {
                return true;
            }

            const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(
                provider as IMetadataProvider,
                ResourcePermissionEngine
            ) as ResourcePermissionEngine;
            await engine.Config(false, user);

            const grant = engine
                .GetUserAvailableResources(user, CONVERSATIONS_RESOURCE_TYPE_ID)
                .find((p: MJResourcePermissionEntity) => UUIDsEqual(p.ResourceRecordID, this.ConversationID));

            if (!grant) {
                this.RecordDenied('You do not have access to this conversation.');
                return false;
            }
            if (grant.PermissionLevel === 'Edit' || grant.PermissionLevel === 'Owner') {
                return true;
            }

            // Only View — block writes.
            this.RecordDenied('You have view-only access to this conversation.');
            return false;
        } catch (error) {
            LogError(
                `MJConversationDetailEntityExtended.currentUserMayWrite failed: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            // Fail closed — safer to deny than silently allow a compromised write.
            this.RecordDenied('Unable to verify conversation permissions.');
            return false;
        }
    }

    /**
     * Populate `LatestResult.Message` so callers that inspect the save result
     * see why the write was refused rather than a generic failure.
     */
    private RecordDenied(message: string): void {
        const result = this.LatestResult as unknown as { Success: boolean; Message?: string } | undefined;
        if (result) {
            result.Success = false;
            result.Message = message;
        }
    }
}

/** Tree-shaking guard — referenced from the MJCoreEntities barrel so the decorator fires. */
export function LoadMJConversationDetailEntityExtended(): void {
    // intentionally empty
}
