import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJUserRoutineRecipientEntity } from '@memberjunction/core-entities';

/**
 * Server-side UserRoutineRecipient entity enforcing the recipient-exclusivity invariant:
 * **exactly one** of `UserID` / `Email` must be set — never both, never neither.
 *
 * Mirrors `MJAISkillPermissionEntityServer`'s grantee-exclusivity gate. A recipient is
 * either an internal MJ user (UserID → in-app and/or email via the user's address) or an
 * external email address (Email) — a row carrying both is ambiguous and a row carrying
 * neither is undeliverable. Enforced here as a version-controlled, deterministic
 * server-side gate so the invariant holds on every server save path (`Save()` calls
 * `Validate()` and the ClassFactory resolves this higher-priority subclass server-side).
 */
@RegisterClass(BaseEntity, 'MJ: User Routine Recipients')
export class MJUserRoutineRecipientEntityServer extends MJUserRoutineRecipientEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const hasUser = this.UserID != null;
        const hasEmail = this.Email != null && this.Email.trim().length > 0;
        if ((hasUser && hasEmail) || (!hasUser && !hasEmail)) {
            result.Errors.push(new ValidationErrorInfo(
                'UserID/Email',
                'You must specify either a User or an Email address, but not both and not neither.',
                `UserID: ${this.UserID}, Email: ${this.Email}`,
                ValidationErrorType.Failure
            ));
        }
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }
}
