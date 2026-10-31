import { BaseEntity, EntitySaveOptions, ValidationErrorInfo, ValidationErrorType, ValidationResult, WellKnownUserSource } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    CanonicalizeConversationAdditionalData,
    IsInheritingFolderAccess,
    IsInheritingFolderAccessInSQL,
    MJConversationEntity,
} from '@memberjunction/core-entities';
import { CheckAnonymousOwnershipKeyChange, IsSetByTransactionVariable } from './anonymousOwnershipKeyGuard';

/**
 * Server-side `MJ: Conversations` entity.
 *
 * Keeps `ExternalID` — the scope identity an anonymous visitor's realtime session is owned through — out
 * of an anonymous visitor's reach once the conversation exists. See {@link CheckAnonymousOwnershipKeyChange}.
 * Keeps who a conversation belongs to and who it is shared with in its owner's hands: see
 * {@link checkOwnerOnlyChange}. Uses the synchronous `Validate()` so the rules run on every save, like
 * `MJAIAgentSessionEntityServer`.
 *
 * Saves `AdditionalData` as compact JSON when it holds an object, so the stored text always uses the spelling
 * the conversation list's SQL filter matches (`INHERIT_FOLDER_ACCESS_SQL_CLAUSE`): the filter and the parser
 * cannot then disagree about whether a conversation inherits its folder's access.
 */
@RegisterClass(BaseEntity, 'MJ: Conversations')
export class MJConversationEntityServer extends MJConversationEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const additionalData = this.GetFieldByName('AdditionalData');
        if (additionalData?.Dirty) {
            const canonical = CanonicalizeConversationAdditionalData(additionalData.Value as string | null);
            if (canonical !== additionalData.Value) {
                additionalData.Value = canonical;
            }
        }
        return super.Save(options);
    }

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
    const before = additionalData?.OldValue as string | null;
    const after = additionalData?.Value as string | null;
    // Both readings: the parser's, and the SQL filter's. A rewrite one of them reads differently (an odd
    // spelling the LIKE misses) would otherwise re-share the conversation past a parser-only check.
    const inheritanceChanged =
        !!additionalData?.Dirty &&
        (IsInheritingFolderAccess({ AdditionalData: before }) !== IsInheritingFolderAccess({ AdditionalData: after }) ||
            IsInheritingFolderAccessInSQL(before) !== IsInheritingFolderAccessInSQL(after));
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
