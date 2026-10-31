import { BaseEntity, RunView, ValidationErrorInfo, ValidationErrorType, ValidationResult, WellKnownUserSource } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MAX_BRANCH_DEPTH, MJProjectEntityExtended } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { IsSetByTransactionVariable } from './anonymousOwnershipKeyGuard';

/**
 * Server-side `MJ: Projects` (conversation folder) entity.
 *
 * Keeps a folder's owner and place in its owner's hands: see {@link checkFolderOwnerOnlyChange}. Uses the
 * synchronous `Validate()` so the rule runs on every save, like `MJConversationEntityServer`. `ValidateAsync()`
 * refuses a parent that would make the folder its own ancestor.
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

/**
 * Refuses a change to an existing folder's owner (`OwnerUserID`) or parent (`ParentID`) by anyone but its
 * stored owner.
 *
 * `OwnerUserID` decides who sees the folder: clearing it makes the folder Public, which lists the owner's
 * conversations in it for everyone, and setting it to yourself lets you share someone else's folder. So only
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
