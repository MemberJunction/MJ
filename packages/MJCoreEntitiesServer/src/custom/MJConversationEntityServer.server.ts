import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult, WellKnownUserSource } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { IsInheritingFolderAccess, MJConversationEntity } from '@memberjunction/core-entities';
import { CheckAnonymousOwnershipKeyChange, IsSetByTransactionVariable } from './anonymousOwnershipKeyGuard';

/**
 * Server-side `MJ: Conversations` entity.
 *
 * Keeps `ExternalID` — the scope identity an anonymous visitor's realtime session is owned through — out
 * of an anonymous visitor's reach once the conversation exists. See {@link CheckAnonymousOwnershipKeyChange}.
 * Keeps who a conversation belongs to and who it is shared with in its owner's hands: see
 * {@link checkOwnerOnlyChange}. Uses the synchronous `Validate()` so the rules run on every save, like
 * `MJAIAgentSessionEntityServer`.
 */
@RegisterClass(BaseEntity, 'MJ: Conversations')
export class MJConversationEntityServer extends MJConversationEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        for (const violation of [CheckAnonymousOwnershipKeyChange(this, 'ExternalID'), checkOwnerOnlyChange(this)]) {
            if (violation) {
                result.Errors.push(violation);
                result.Success = false;
            }
        }
        return result;
    }
}

/**
 * Refuses a change to an existing conversation's folder (`ProjectID`), owner (`UserID`) or folder
 * inheritance (`AdditionalData.inheritFolderAccess`) by anyone but its owner.
 *
 * Those three decide who else can see the conversation: moving it into a Shared or Public folder shares it,
 * and turning inheritance back on re-shares it. An Edit grant lets someone work in a conversation, not
 * publish it. The server itself (no context user, or the system user) is exempt, as is a conversation with
 * no owner on record. A transaction variable that sets one of these fields, or `ID`, counts as a change:
 * it is applied at submit, after this check has run.
 */
function checkOwnerOnlyChange(entity: MJConversationEntity): ValidationErrorInfo | null {
    const user = entity.ContextCurrentUser;
    if (!entity.IsSaved || !user || WellKnownUserSource.Instance.IsSystemUser(user)) {
        return null;
    }
    const owner = entity.GetFieldByName('UserID')?.OldValue as string | null | undefined;
    if (!owner || UUIDsEqual(owner, user.ID)) {
        return null;
    }
    const additionalData = entity.GetFieldByName('AdditionalData');
    const inheritanceChanged =
        !!additionalData?.Dirty &&
        IsInheritingFolderAccess({ AdditionalData: additionalData.OldValue as string | null }) !==
            IsInheritingFolderAccess({ AdditionalData: additionalData.Value as string | null });
    const changed = ['ProjectID', 'UserID'].find((name) => entity.GetFieldByName(name)?.Dirty)
        ?? (inheritanceChanged ? 'AdditionalData' : undefined)
        ?? (IsSetByTransactionVariable(entity, ['ProjectID', 'UserID', 'AdditionalData', 'ID']) ? 'ProjectID' : undefined);
    if (!changed) {
        return null;
    }
    return new ValidationErrorInfo(
        changed,
        "Only the conversation's owner can move it to another folder, change its owner, or change whether it inherits its folder's access.",
        null,
        ValidationErrorType.Failure,
    );
}
