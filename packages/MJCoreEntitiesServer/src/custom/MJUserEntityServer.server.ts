import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJUserEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: Users` entity enforcing MJ's privilege-elevation invariant (issue #4260).
 *
 * WHY THIS EXISTS AT ALL. `User.Type` is the column every Owner check in the platform reads —
 * `SqlLoggingConfigResolver`, magic-link `canIssueInvites`, the backup-system-user fallback in
 * MJServer's bootstrap. Writing it is therefore equivalent to granting yourself the platform's
 * superuser level. Nothing below this class stops that: on the baseline seed the `Developer` and
 * `Integration` roles hold unfiltered `CanUpdate` on `MJ: Users` (439 of 446 entities for
 * `Developer`), `AllowUpdateAPI` is true on the entity and on both the `Type` and `Name` fields,
 * and CodeGen has already issued `GRANT EXECUTE ON __mj.spUpdateUser` to those roles' DB roles.
 *
 * WHY NOT ROW-LEVEL SECURITY. MJ's only field-adjacent access control is `RowLevelSecurityFilter`,
 * and an "own row only" update filter does NOT close this: scoping the update to the caller's own
 * row still permits setting one's OWN `Type` to `'Owner'`. There is no per-role FIELD permission in
 * MJ, and setting `EntityField.AllowUpdateAPI = 0` on `Type` would block Owners too, breaking every
 * legitimate admin path. An invariant in the save path is the only mechanism that expresses the
 * actual rule.
 *
 * WHY HERE RATHER THAN IN A RESOLVER. `Validate()` runs inside `BaseEntity.Save()`, so this holds
 * on EVERY write path — GraphQL resolvers, Remote Operations, the Create/Update Record actions,
 * metadata sync, one-off scripts — and for any role a deployment invents, not just the two seeded
 * ones. A resolver-level check would cover one door in a building with several.
 *
 * THE INVARIANTS, for a caller whose `Type` is not `'Owner'`:
 *
 *   1. `Type` may not be changed. It is a two-value CHECK column (`'User' | 'Owner'`), so any
 *      change by a non-Owner is either self-promotion or demoting somebody else. Testing
 *      dirtiness rather than the new value covers create-as-Owner and update-to-Owner together.
 *   2. The row must be the caller's own, compared against the PRE-SAVE `ID`. Comparing against
 *      `this.ID` would compare with a value the caller just supplied, and would always pass.
 *   3. `Name` may not be changed on an existing row. Invariants 1-2 do NOT cover this — renaming
 *      yourself is editing your own row. `resolvePrincipalFrom` (MJServer `auth/principals.ts`)
 *      resolves `contextUserForNewUserCreation` / `contextUserForProvisioning` /
 *      `contextUserForLookup` against `User.Name` FIRST, breaking ties by lowest ID, so a user
 *      who can rename themselves to the configured string and who sorts below the real system
 *      user becomes the principal the server acts as. That ordering is deliberate (backward
 *      compatibility) and is only sound while `Name` is not writable by untrusted parties; this
 *      invariant is what makes that true. `Name` is the login identifier — auto-provisioning sets
 *      `Name = email` — while `FirstName` / `LastName` / `Title` are the display fields and stay
 *      freely editable.
 *
 * Owner-type callers are exempt from all three. That is deliberate and load-bearing: it keeps admin
 * user management working, and it keeps auto-provisioning working — `NewUserBase.createNewUser`
 * runs as `contextUserForNewUserCreation`, which resolves to the seeded system user (`Type='Owner'`).
 *
 * Pure: reads only this record's own field state and the caller. No `RunView`, no provider, no
 * engine, no I/O — so it costs nothing per save and is unit-testable without a database.
 */
@RegisterClass(BaseEntity, 'MJ: Users')
export class MJUserEntityServer extends MJUserEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateNoPrivilegeElevation(result);
        this.validateOwnRowOnly(result);
        this.validateNameImmutable(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /**
     * Invariant 1 — a non-Owner may not change `Type` on an existing row, and may not mint a new
     * Owner.
     *
     * On an EXISTING row the test is the field's Dirty flag rather than a comparison to
     * `'Owner'`, so it also refuses a non-Owner DEMOTING an Owner.
     *
     * On a NEW row it is the resulting value instead. Every field reads dirty on an insert, so
     * testing dirtiness there would refuse a non-Owner creating ANY user — a much broader policy
     * change than this invariant is about, and not one to smuggle in under an elevation guard.
     * What must never happen on create is minting an Owner.
     */
    private validateNoPrivilegeElevation(result: ValidationResult): void {
        if (this.callerIsOwner()) {
            return;
        }
        const offends = this.IsSaved
            ? (this.GetFieldByName('Type')?.Dirty ?? false)
            : this.Type?.trim().toLowerCase() === 'owner';
        if (!offends) {
            return;
        }
        result.Errors.push(new ValidationErrorInfo(
            'Type',
            'Only an Owner may set or change a user\'s Type. Type is the column MJ\'s Owner checks read, ' +
            'so changing it grants platform-superuser access.',
            this.Type,
            ValidationErrorType.Failure
        ));
    }

    /**
     * Invariant 2 — a non-Owner may only modify their own user row.
     *
     * Compared against the PRE-SAVE `ID` so that rewriting `ID` in the post-image cannot bypass
     * it. New records are exempt: there is no existing row to protect, and invariant 1 already
     * refuses a non-Owner creating an Owner.
     */
    private validateOwnRowOnly(result: ValidationResult): void {
        if (this.callerIsOwner() || !this.IsSaved) {
            return;
        }
        const caller = this.ActiveUser;
        if (!caller) {
            return;
        }
        const preSaveId = (this.GetFieldByName('ID')?.OldValue as string | null | undefined) ?? this.ID;
        if (preSaveId && !UUIDsEqual(preSaveId, caller.ID)) {
            result.Errors.push(new ValidationErrorInfo(
                'ID',
                'You may only modify your own user record. Changing another user\'s record requires an Owner.',
                preSaveId,
                ValidationErrorType.Failure
            ));
        }
    }

    /**
     * Invariant 3 — a non-Owner may not change `Name` on an existing row.
     *
     * `Name` is the column the context-user ladder resolves against first, so it is effectively a
     * capability name, not a display name. New records are exempt: auto-provisioning legitimately
     * sets `Name = email` at creation, and it runs as the Owner-type system user anyway.
     */
    private validateNameImmutable(result: ValidationResult): void {
        if (this.callerIsOwner() || !this.IsSaved) {
            return;
        }
        if (!(this.GetFieldByName('Name')?.Dirty ?? false)) {
            return;
        }
        result.Errors.push(new ValidationErrorInfo(
            'Name',
            'Only an Owner may change a user\'s Name. Name is the identifier MJ\'s configured-principal ' +
            'resolution matches against, so changing it can redirect which user the server acts as. ' +
            'Update FirstName, LastName or Title instead.',
            this.Name,
            ValidationErrorType.Failure
        ));
    }

    /**
     * True when the caller is an Owner (or when there is no caller to evaluate — the guard has
     * nothing to compare against, and the permission system and RLS still apply).
     *
     * `Type` is an `NCHAR` column, so it arrives space-padded; casing is normalized for the same
     * reason `principals.ts` does. Reads `ActiveUser` rather than `ContextCurrentUser` directly so
     * a per-request provider's `CurrentUser` is honored on multi-provider servers.
     */
    private callerIsOwner(): boolean {
        const caller = this.ActiveUser;
        if (!caller) {
            return true;
        }
        return caller.Type?.trim().toLowerCase() === 'owner';
    }
}
