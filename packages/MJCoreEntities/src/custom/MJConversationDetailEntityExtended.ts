import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    UserInfo,
    WellKnownUserSource
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
 * The fields of a person's (`Role='User'`) message that say who wrote it and what it says: its author, its role, its
 * text, its attachment, its media type and where it sits in a thread. Only its author may change them. Other fields
 * (pinning, hiding, bookkeeping the server writes) keep the conversation-level rules.
 */
const AUTHORED_FIELDS = ['UserID', 'Role', 'Message', 'ArtifactID', 'ArtifactVersionID', 'MediaType', 'ParentID'];

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
 *
 * **Who a message is from** (A19, the rules for people's messages). For a `Role='User'` message, the owner and
 * grantees alike:
 *  - post only as themselves: a new message naming another person's `UserID` is refused, and a grantee's message
 *    with no `UserID` gets the grantee's (an empty one reads as the conversation's owner). The owner's stays empty,
 *    since it already means them;
 *  - change who wrote it and what it says ({@link AUTHORED_FIELDS}) only when they wrote it, and never its role;
 *  - delete it only when they wrote it, or own the conversation.
 *
 * The system user may write any message, as a save with no user may: it is how server code writes in anyone's
 * conversation. Agent replies (`Role='AI'`/`'Error'`) keep today's rules until MJ's chat stops writing them from the
 * browser (A19's second half).
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
        if (WellKnownUserSource.Instance.IsSystemUser(user)) {
            // Server code writing as the system user (agent replies, transcripts) may write any message.
            return true;
        }

        try {
            const conversation = await provider.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                user
            );
            const loaded = await conversation.Load(this.ConversationID);
            if (!loaded) {
                // The person cannot read the conversation. If it exists, it is hidden from them (a row filter), and
                // they may not write to it. If no one can find it, it is missing or being created in this same
                // transaction: let the foreign key and the base save decide, as before.
                if (await this.conversationExists(provider)) {
                    this.recordDenied('You do not have access to this conversation.', resultType);
                    return false;
                }
                return true;
            }

            const isOwner =
                !!conversation.UserID && UUIDsEqual(conversation.UserID, user.ID);
            const refusal = (isOwner ? null : await this.nonOwnerAccessRefusal(provider, user))
                ?? this.authorshipRefusal(operation, user, conversation.UserID, isOwner);
            if (refusal) {
                this.recordDenied(refusal, resultType);
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
     * Why a person who does not own the conversation may not write to it, or `null` when they may: the rating fields
     * are the owner's alone, and anyone else needs an `Edit` or `Owner` grant on the conversation.
     */
    private async nonOwnerAccessRefusal(provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
        // Non-owners are *never* allowed to touch the rating fields, even
        // when they hold Edit/Owner grants on the conversation. UserRating
        // and UserFeedback represent the owner's evaluation of an AI
        // message and there is no per-user storage to overwrite.
        if (this.dirtyRatingFieldNames().length > 0) {
            return 'Only the conversation owner can set or change the rating and feedback on this message.';
        }

        const engine = ResourcePermissionEngine.GetProviderInstance<ResourcePermissionEngine>(
            provider,
            ResourcePermissionEngine
        ) as ResourcePermissionEngine;
        await engine.Config(false, user);

        const grant = engine
            .GetUserAvailableResources(user, CONVERSATIONS_RESOURCE_TYPE_ID)
            .find((p: MJResourcePermissionEntity) => UUIDsEqual(p.ResourceRecordID, this.ConversationID));

        if (!grant) {
            return 'You do not have access to this conversation.';
        }
        if (grant.PermissionLevel === 'Edit' || grant.PermissionLevel === 'Owner') {
            return null;
        }
        // Only View — block writes.
        return 'You have view-only access to this conversation.';
    }

    /**
     * Why this write breaks the rules for people's messages (see the class doc), or `null` when it does not. On a new
     * message from a grantee with no `UserID`, fills in the grantee's.
     */
    private authorshipRefusal(
        operation: 'save' | 'delete',
        user: UserInfo,
        ownerID: string | null,
        isOwner: boolean
    ): string | null {
        if (operation === 'delete') {
            return this.deleteRefusal(user, ownerID, isOwner);
        }
        return this.IsSaved ? this.changeRefusal(user, ownerID) : this.postRefusal(user, isOwner);
    }

    /** A new person's message names its author as the poster, or names no one (filled in for a grantee). */
    private postRefusal(user: UserInfo, isOwner: boolean): string | null {
        if (this.Role !== 'User') {
            return null;
        }
        if (!this.UserID) {
            // An empty UserID reads as the conversation's owner. A grantee's message gets the grantee's ID; the
            // owner's stays empty, so server code writing as the owner (a room transcript of what other people said)
            // is not stamped with the owner's ID.
            if (!isOwner) {
                this.UserID = user.ID;
            }
            return null;
        }
        return UUIDsEqual(this.UserID, user.ID) ? null : 'You can post a message only as yourself.';
    }

    /** An existing person's message: only its author changes who wrote it and what it says, and no one its role. */
    private changeRefusal(user: UserInfo, ownerID: string | null): string | null {
        if (this.originalFieldText('Role') !== 'User') {
            return null;
        }
        const changed = AUTHORED_FIELDS.filter((name) => this.Fields.find((f) => f.Name === name)?.Dirty);
        if (changed.length === 0) {
            return null;
        }
        if (changed.includes('Role')) {
            return "A message's role cannot be changed.";
        }
        const author = this.originalFieldText('UserID') ?? ownerID;
        if (!author || !UUIDsEqual(author, user.ID)) {
            return 'Only the person who wrote this message can change it.';
        }
        if (changed.includes('UserID') && !(this.UserID && UUIDsEqual(this.UserID, user.ID))) {
            return 'You can post a message only as yourself.';
        }
        return null;
    }

    /** A person's message is deleted by its author or by the conversation's owner. */
    private deleteRefusal(user: UserInfo, ownerID: string | null, isOwner: boolean): string | null {
        if (this.Role !== 'User' || isOwner) {
            return null;
        }
        const author = this.UserID || ownerID;
        return author && UUIDsEqual(author, user.ID)
            ? null
            : "Only the message's author or the conversation's owner can delete it.";
    }

    /** Whether the conversation exists, read as the system user; false when there is no system user to ask. */
    private async conversationExists(provider: IMetadataProvider): Promise<boolean> {
        const systemUser = await WellKnownUserSource.Instance.GetSystemUser(provider);
        if (!systemUser) {
            return false;
        }
        const conversation = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', systemUser);
        return conversation.Load(this.ConversationID);
    }

    /** A field's value as loaded, before this save's changes; `null` when it was empty or is not text. */
    private originalFieldText(name: string): string | null {
        const original: unknown = this.Fields.find((f) => f.Name === name)?.OldValue;
        return typeof original === 'string' && original.length > 0 ? original : null;
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
