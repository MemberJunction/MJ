import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntitySaveOptions,
    IMetadataProvider,
    LogError
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJConversationDetailEntity } from '../generated/entity_subclasses';
import { UserMayWriteConversation } from './ConversationWriteAccess';

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
        if (!(await this.currentUserMayWrite('save'))) {
            return false;
        }
        return super.Save(options);
    }

    override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!(await this.currentUserMayWrite('delete'))) {
            return false;
        }
        return super.Delete(options);
    }

    private async currentUserMayWrite(operation: 'save' | 'delete'): Promise<boolean> {
        const resultType: 'create' | 'update' | 'delete' =
            operation === 'delete' ? 'delete' : this.IsSaved ? 'update' : 'create';
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
            const decision = await UserMayWriteConversation(provider, user, this.ConversationID);
            if (decision.IsOwner) {
                return true;
            }

            // Non-owners are *never* allowed to touch the rating fields, even
            // when they hold Edit/Owner grants on the conversation. UserRating
            // and UserFeedback represent the owner's evaluation of an AI
            // message and there is no per-user storage to overwrite.
            if (this.dirtyRatingFieldNames().length > 0) {
                this.recordDenied(
                    'Only the conversation owner can set or change the rating and feedback on this message.',
                    resultType
                );
                return false;
            }

            if (!decision.Allowed) {
                this.recordDenied(decision.Reason ?? 'Permission denied.', resultType);
                return false;
            }
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(
                `MJConversationDetailEntityExtended.currentUserMayWrite failed ` +
                    `(${operation} on conversation ${this.ConversationID}, user ${user.ID}): ${message}`
            );
            // Fail closed — safer to deny than silently allow a compromised write.
            this.recordDenied('Unable to verify conversation permissions.', resultType);
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
     * Records WHY the write was refused as a NEW `ResultHistory` entry, so callers that read
     * `LatestResult.CompleteMessage` see the reason (issue #4791).
     *
     * It must be a new entry, not an edit of `LatestResult`: on a brand-new record there IS no
     * `LatestResult` yet (nothing has been saved), so editing it silently dropped the denial and
     * every caller logged "unknown error". Appending also leaves an earlier successful save's
     * entry untouched. Mirrors `ReadOnlyExternalBaseEntity.rejectMutation`.
     */
    private recordDenied(message: string, type: 'create' | 'update' | 'delete'): void {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
    }
}

/** Tree-shaking guard — referenced from the MJCoreEntities barrel so the decorator fires. */
export function LoadMJConversationDetailEntityExtended(): void {
    // intentionally empty
}
