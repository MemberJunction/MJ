import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntityPermissionType,
    IMetadataProvider,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    WellKnownUserSource
} from '@memberjunction/core';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MAX_BRANCH_DEPTH, MJConversationEntity, MJProjectEntity, MJProjectEntityExtended } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { IsSetByTransactionVariable } from './anonymousOwnershipKeyGuard';

/**
 * Server-side `MJ: Projects` (conversation folder) entity.
 *
 * Keeps a folder's owner and place in its owner's hands: see {@link checkFolderOwnerOnlyChange}. Uses the
 * synchronous `Validate()` so the rule runs on every save, like `MJConversationEntityServer`. `ValidateAsync()`
 * refuses a parent that would make the folder its own ancestor. `Delete()` empties the folder first, for a caller
 * who may delete it but cannot reach everything inside it: see {@link Delete}.
 */
@RegisterClass(BaseEntity, 'MJ: Projects')
export class MJProjectEntityServer extends MJProjectEntityExtended {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const violation = checkFolderOwnerOnlyChange(this);
        if (violation) {
            result.Errors.push(violation);
            result.Success = false;
        }
        return result;
    }

    /**
     * Deletes the folder after moving what it holds out of it, in one transaction.
     *
     * `Project.ParentID` and `Conversation.ProjectID` are RESTRICT foreign keys, so a folder that still holds a
     * subfolder or a conversation cannot be deleted. The client (`ConversationEngine.DeleteProject`) moves the rows
     * it can change first, but a user whose folder writes are row-filtered (the UI role: own folders only) cannot
     * change another user's subfolder or conversation inside their Shared folder, so the delete would fail on the
     * foreign key. When the caller may delete this folder (the Delete permission and its row-level filter both
     * pass), its direct subfolders move up to its parent and its conversations leave it, written as the system user,
     * in the same transaction as the delete. A caller who may not delete it gets the provider's refusal as before,
     * with nothing moved. A delete that already runs in a transaction group is left to that group.
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const user = this.ContextCurrentUser;
        const systemUser = UserCache.Instance.GetSystemUser();
        if (!user || !systemUser || !this.IsSaved || this.TransactionGroup || options?.ReplayOnly) {
            return super.Delete(options);
        }
        if (!(await this.callerMayDelete(user, systemUser))) {
            return super.Delete(options);
        }
        const contents = await this.readContents(systemUser);
        if (typeof contents === 'string') {
            return this.refuseDelete(contents);
        }
        if (contents.FolderIDs.length === 0 && contents.ConversationIDs.length === 0) {
            return super.Delete(options);
        }
        return this.deleteWithContentsMoved(contents, systemUser, options);
    }

    /**
     * True when the caller holds Delete on folders and this folder passes their Delete row-level filter. Checked
     * here, before anything moves, because the provider checks only the folder itself and only after the before-delete
     * hooks. Reads as the system user, with the caller's own filter as the condition.
     */
    private async callerMayDelete(user: UserInfo, systemUser: UserInfo): Promise<boolean> {
        if (!this.EntityInfo.GetUserPermisions(user).CanDelete) {
            return false;
        }
        const filter = this.EntityInfo.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Delete, '');
        if (!filter) {
            return true;
        }
        const read = await new RunView(this.RunViewProviderToUse).RunView<{ ID: string }>(
            { EntityName: 'MJ: Projects', ExtraFilter: `ID='${EscapeSQLString(this.ID)}' AND (${filter})`, Fields: ['ID'], ResultType: 'simple' },
            systemUser,
        );
        return read.Success && read.Results.length > 0;
    }

    /** The IDs of the folder's direct subfolders and conversations, read as the system user; a message on failure. */
    private async readContents(systemUser: UserInfo): Promise<FolderContents | string> {
        const rv = new RunView(this.RunViewProviderToUse);
        const id = EscapeSQLString(this.ID);
        const [folders, conversations] = await rv.RunViews(
            [
                { EntityName: 'MJ: Projects', ExtraFilter: `ParentID='${id}'`, Fields: ['ID'], ResultType: 'simple' },
                { EntityName: 'MJ: Conversations', ExtraFilter: `ProjectID='${id}'`, Fields: ['ID'], ResultType: 'simple' },
            ],
            systemUser,
        );
        if (!folders?.Success || !conversations?.Success) {
            return `Could not read what the folder holds: ${folders?.ErrorMessage || conversations?.ErrorMessage || 'unknown error'}`;
        }
        return {
            FolderIDs: (folders.Results as Array<{ ID: string }>).map((r) => r.ID),
            ConversationIDs: (conversations.Results as Array<{ ID: string }>).map((r) => r.ID),
        };
    }

    /** Queues the moves and this delete in one transaction group and submits it. */
    private async deleteWithContentsMoved(
        contents: FolderContents,
        systemUser: UserInfo,
        options: EntityDeleteOptions | undefined,
    ): Promise<boolean> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const group = await md.CreateTransactionGroup();
        const newParentId = this.ParentID ?? null;
        for (const folderId of contents.FolderIDs) {
            const child = await md.GetEntityObject<MJProjectEntity>('MJ: Projects', systemUser);
            if (!(await child.Load(folderId))) {
                return this.refuseDelete('Could not load a subfolder to move it out of the folder.');
            }
            child.ParentID = newParentId;
            child.TransactionGroup = group;
            if (!(await child.Save())) {
                return this.refuseDelete(child.LatestResult?.CompleteMessage || 'Could not move a subfolder out of the folder.');
            }
        }
        for (const conversationId of contents.ConversationIDs) {
            const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', systemUser);
            if (!(await conversation.Load(conversationId))) {
                return this.refuseDelete('Could not load a conversation to take it out of the folder.');
            }
            conversation.ProjectID = null;
            conversation.TransactionGroup = group;
            if (!(await conversation.Save())) {
                return this.refuseDelete(conversation.LatestResult?.CompleteMessage || 'Could not take a conversation out of the folder.');
            }
        }
        this.TransactionGroup = group;
        try {
            if (!(await super.Delete(options))) {
                return false;
            }
            const submitted = await group.Submit();
            return submitted && this.LatestResult?.Success !== false;
        } finally {
            this.TransactionGroup = null;
        }
    }

    /** Records a refused delete so the caller reads the reason from `LatestResult`. */
    private refuseDelete(message: string): boolean {
        const result = new BaseEntityResult();
        result.StartedAt = new Date();
        result.Type = 'delete';
        result.Success = false;
        result.Message = message;
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const violation = await this.checkParentCycle();
        if (violation) {
            result.Errors.push(violation);
            result.Success = false;
        }
        return result;
    }

    /**
     * Refuses a `ParentID` that makes the folder its own ancestor. The sidebar builds the tree from the top, so a
     * cycle hides every folder in it from everyone. Walks up from the new parent as the system user, since the
     * chain can pass through folders the caller cannot read, for at most the engine's {@link MAX_BRANCH_DEPTH}
     * levels.
     */
    private async checkParentCycle(): Promise<ValidationErrorInfo | null> {
        if (!this.ParentID || !this.GetFieldByName('ParentID')?.Dirty) {
            return null;
        }
        const refuse = (message: string) => new ValidationErrorInfo('ParentID', message, this.ParentID, ValidationErrorType.Failure);
        if (UUIDsEqual(this.ParentID, this.ID)) {
            return refuse('A folder cannot be moved into itself or one of its subfolders.');
        }
        if (!this.IsSaved) {
            return null; // nothing points at a new folder yet
        }
        const rv = new RunView(this.RunViewProviderToUse);
        const readUser = UserCache.Instance.GetSystemUser() ?? this.ContextCurrentUser;
        let cursor: string | null = this.ParentID;
        for (let depth = 0; cursor && depth < MAX_BRANCH_DEPTH; depth++) {
            const read = await rv.RunView<{ ParentID: string | null }>(
                { EntityName: 'MJ: Projects', ExtraFilter: `ID='${EscapeSQLString(cursor)}'`, Fields: ['ParentID'], ResultType: 'simple' },
                readUser,
            );
            if (!read.Success) {
                return refuse(`Could not check the folder's new place: ${read.ErrorMessage}`);
            }
            cursor = read.Results[0]?.ParentID ?? null;
            if (cursor && UUIDsEqual(cursor, this.ID)) {
                return refuse('A folder cannot be moved into itself or one of its subfolders.');
            }
        }
        return cursor ? refuse(`Folders cannot be nested more than ${MAX_BRANCH_DEPTH} levels deep.`) : null;
    }
}

/** What a folder holds directly: the rows its delete has to move first. */
interface FolderContents {
    FolderIDs: string[];
    ConversationIDs: string[];
}

/**
 * Refuses a change to an existing folder's owner (`OwnerUserID`) or parent (`ParentID`) by anyone but its
 * stored owner.
 *
 * `OwnerUserID` decides who sees the folder: clearing it makes the folder Public, which lists it, and the
 * conversations in it that inherit its access, for everyone, and setting it to yourself lets you share someone
 * else's folder. So only
 * the owner may change it, including making it Public. A Public folder has no owner, so nobody may claim it;
 * its `ParentID` stays open, since a parent grants no access. The server itself (no context user, or the
 * system user) is exempt. A transaction variable that sets one of these fields, or `ID`, counts as a change:
 * it is applied at submit, after this check has run.
 */
function checkFolderOwnerOnlyChange(entity: MJProjectEntityExtended): ValidationErrorInfo | null {
    const user = entity.ContextCurrentUser;
    if (!entity.IsSaved || !user || WellKnownUserSource.Instance.IsSystemUser(user)) {
        return null;
    }
    const owner = entity.GetFieldByName('OwnerUserID')?.OldValue as string | null | undefined;
    if (owner && UUIDsEqual(owner, user.ID)) {
        return null;
    }
    const guarded = owner ? ['OwnerUserID', 'ParentID'] : ['OwnerUserID'];
    const changed =
        guarded.find((name) => entity.GetFieldByName(name)?.Dirty) ??
        (IsSetByTransactionVariable(entity, [...guarded, 'ID']) ? guarded[0] : undefined);
    if (!changed) {
        return null;
    }
    return new ValidationErrorInfo(
        changed,
        owner
            ? "Only the folder's owner can change its owner or move it to another folder."
            : 'A Public folder has no owner, so it cannot be claimed.',
        null,
        ValidationErrorType.Failure,
    );
}
