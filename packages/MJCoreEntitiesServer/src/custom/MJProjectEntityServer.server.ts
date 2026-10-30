import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult, WellKnownUserSource } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJProjectEntityExtended } from '@memberjunction/core-entities';
import { IsSetByTransactionVariable } from './anonymousOwnershipKeyGuard';

/**
 * Server-side `MJ: Projects` (conversation folder) entity.
 *
 * Keeps a folder's owner and place in its owner's hands: see {@link checkFolderOwnerOnlyChange}. Uses the
 * synchronous `Validate()` so the rule runs on every save, like `MJConversationEntityServer`.
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
