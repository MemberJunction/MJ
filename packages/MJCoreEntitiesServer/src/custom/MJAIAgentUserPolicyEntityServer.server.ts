import { BaseEntity, EntitySaveOptions, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: AI Agent User Policies` entity: a user's agent policy is private to that user.
 *
 * The UI role may create and update policies (granted in `metadata/entity-permissions`) so that
 * a regular user's Chief of Staff can persist their preferences during onboarding and the
 * cockpit's Governance tab can save edits. Row-level security for this entity is not yet
 * expressible as version-controlled metadata, so this subclass is the defense-in-depth gate,
 * mirroring `MJUserRoutineEntityServer`:
 *
 * 1. **Ownership** — a non-Owner-type context user may only save the policy whose `UserID` is
 *    their own, compared against the PRE-save owner so reassigning `UserID` cannot bypass it.
 *    Owner-type users (administrators, the scheduler's system user) are exempt.
 * 2. **Owner attribution** — first save defaults `UserID` to the context user when unset, so
 *    programmatic create paths attribute the row correctly.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent User Policies')
export class MJAIAgentUserPolicyEntityServer extends MJAIAgentUserPolicyEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.IsSaved && !this.UserID && this.ContextCurrentUser) {
            this.UserID = this.ContextCurrentUser.ID;
        }
        return super.Save(options);
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateOwnership(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    private validateOwnership(result: ValidationResult): void {
        const user = this.ContextCurrentUser;
        if (!user || user.Type?.trim().toLowerCase() === 'owner') {
            return;
        }
        const preSaveOwnerId = (this.GetFieldByName('UserID')?.OldValue as string | null | undefined) ?? this.UserID;
        if (preSaveOwnerId && !UUIDsEqual(preSaveOwnerId, user.ID)) {
            result.Errors.push(new ValidationErrorInfo(
                'UserID',
                'An agent policy is private to its user — you can only modify your own policy.',
                this.UserID,
                ValidationErrorType.Failure
            ));
        }
    }
}
