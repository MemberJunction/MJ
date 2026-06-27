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
 * Fields that represent the conversation owner's evaluation of an AI message.
 * Storage is a single value per message (no per-user rating column), so only
 * the owner may set or change them — even users with `Edit`-level grants on
 * the parent conversation cannot retroactively rewrite the owner's rating.
 */
const OWNER_ONLY_RATING_FIELDS = ['UserRating', 'UserFeedback'];

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
 * Additionally, the **rating fields** (`UserRating` and `UserFeedback`) are
 * owner-only — even users with `Edit`-level grants on the conversation are
 * blocked from changing them, because the storage is a single value per
 * message (it represents the owner's evaluation, not per-grantee opinions).
 * MJ's permissions engine has no native primitive for per-field row-conditional
 * write rules, so this gate lives here rather than in `MJ: Entity Permissions`.
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

            const isOwner =
                !!conversation.UserID && UUIDsEqual(conversation.UserID, user.ID);
            if (isOwner) {
                return true;
            }

            // Non-owners are *never* allowed to touch the rating fields, even
            // when they hold Edit/Owner grants on the conversation. UserRating
            // and UserFeedback represent the owner's evaluation of an AI
            // message and there is no per-user storage to overwrite.
            if (this.dirtyRatingFieldNames().length > 0) {
                this.RecordDenied(
                    'Only the conversation owner can set or change the rating and feedback on this message.'
                );
                return false;
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
     * Names of the rating/feedback fields that are dirty on this save.
     * Used by `currentUserMayWrite` to detect attempts by non-owners to
     * modify the owner-only fields and surface a specific denial message.
     */
    private dirtyRatingFieldNames(): string[] {
        const matches: string[] = [];
        for (const name of OWNER_ONLY_RATING_FIELDS) {
            const field = this.Fields.find((f) => f.Name === name);
            if (field?.Dirty) matches.push(name);
        }
        return matches;
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
