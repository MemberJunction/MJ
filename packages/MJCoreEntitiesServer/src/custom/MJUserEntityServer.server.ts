import { BaseEntity, BaseEntityResult, EntityDeleteOptions, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJUserEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: Users` entity enforcing MJ's privilege-elevation invariant (issue #4260).
 *
 * WHY THIS EXISTS AT ALL. `User.Type` is the column every Owner check in the platform reads —
 * `SqlLoggingConfigResolver`, magic-link `canIssueInvites`, the backup-system-user fallback in
 * MJServer's bootstrap. Writing it is therefore equivalent to granting yourself the platform's
 * superuser level. Nothing below this class stops that: on the baseline seed the `Developer` and
 * `Integration` roles hold unfiltered `CanCreate`/`CanUpdate`/`CanDelete` on `MJ: Users` (verified
 * against a live database, not just the seed), `AllowUpdateAPI`/`AllowDeleteAPI` are true on the
 * entity, `AllowUpdateAPI` is also true on both the `Type` and `Name` fields, `Name` has no unique
 * index, and CodeGen has already issued `GRANT EXECUTE` on the relevant stored procedures to those
 * roles' DB roles.
 *
 * WHY NOT ROW-LEVEL SECURITY. MJ's only field-adjacent access control is `RowLevelSecurityFilter`,
 * and an "own row only" update filter does NOT close this: scoping the update to the caller's own
 * row still permits setting one's OWN `Type` to `'Owner'`. There is no per-role FIELD permission in
 * MJ, and setting `EntityField.AllowUpdateAPI = 0` on `Type` would block Owners too, breaking every
 * legitimate admin path. An invariant in the save/delete path is the only mechanism that expresses
 * the actual rule.
 *
 * WHY HERE RATHER THAN IN A RESOLVER. `Validate()` runs inside `BaseEntity.Save()` and this class
 * also overrides `Delete()`, so both hold on EVERY write path — GraphQL resolvers, Remote
 * Operations, the Create/Update/Delete Record actions, metadata sync, one-off scripts — and for any
 * role a deployment invents, not just the two seeded ones. A resolver-level check would cover one
 * door in a building with several.
 *
 * THE INVARIANTS, for a caller whose `Type` is not `'Owner'`:
 *
 *   1. **Creating a `MJ: Users` row at all is refused.** This is stricter than "may not create an
 *      Owner": the only two automated creators of this entity — `NewUserBase.createNewUser`
 *      (`MJServer/src/auth/newUsers.ts`) and `MagicLinkService`'s provisioning path
 *      (`MJServer/src/auth/magicLink/MagicLinkService.ts`) — both run as
 *      `ResolveConfiguredPrincipal(...)`, which in a healthy system resolves to the seeded System
 *      user (`Type='Owner'`; rung 4 of the ladder is "lowest ID among ACTIVE owners"). Explorer's
 *      user-management UI is itself an Owner-level admin surface. So no legitimate path creates a
 *      user row as a non-Owner, and refusing non-Owner creation outright costs nothing real.
 *      Refusing only `Type='Owner'` on create is NOT enough: `Name` has no unique index and both
 *      seeded non-Owner roles hold `CanCreate`, so a non-Owner could otherwise repeatedly `Create`
 *      rows named to match the configured `contextUserForNewUserCreation` string until one sorts
 *      below the real system user by ID — the exact principal-redirection invariant 3 (below)
 *      exists to prevent, just reached through INSERT instead of UPDATE.
 *   2. `Type` may not be changed on an EXISTING row. It is a two-value CHECK column
 *      (`'User' | 'Owner'`), so any change by a non-Owner is either self-promotion or demoting
 *      somebody else. (Creation is already covered by invariant 1, so this only needs to consider
 *      updates.)
 *   3. The row must be the caller's own, compared against the PRE-SAVE `ID`. `ID` is a primary-key
 *      field — `EntityFieldInfo.ReadOnly` is `true` for `IsPrimaryKey`, and `EntityField.Value`'s
 *      setter silently ignores writes to a `ReadOnly` field after the record's initial hydration —
 *      so on a genuinely LOADED row `this.ID` is not reassignable through ordinary means. The
 *      pre-save value still matters for a narrower reason: it ties this guard to the row identity
 *      established the last time the object was actually loaded/hydrated from the database, which
 *      is what `ResolverBase.UpdateRecord` does first for any entity with `TrackRecordChanges=1`
 *      (as `MJ: Users` has) — rather than trusting whatever the in-memory object merely arrived
 *      holding. If that pre-save identity cannot be established at all, the guard fails CLOSED
 *      (refuses the save) instead of silently permitting it — see `validateOwnRowOnly`.
 *   4. `Name` may not be changed on an existing row. Invariants 2-3 do NOT cover this — renaming
 *      yourself is editing your own row. `resolvePrincipalFrom` (MJServer `auth/principals.ts`)
 *      resolves `contextUserForNewUserCreation` / `contextUserForProvisioning` /
 *      `contextUserForLookup` against `User.Name` FIRST, breaking ties by lowest ID, so a user
 *      who can rename themselves to the configured string and who sorts below the real system
 *      user becomes the principal the server acts as. That ordering is deliberate (backward
 *      compatibility) and is only sound while `Name` is not writable by untrusted parties; this
 *      invariant is what makes that true. `Name` is the login identifier — auto-provisioning sets
 *      `Name = email` — while `FirstName` / `LastName` / `Title` are the display fields and stay
 *      freely editable.
 *   5. **Deleting a `MJ: Users` row at all is refused** (see the `Delete()` override below). MJ
 *      deactivates users via `IsActive`; it does not delete them. An unguarded delete would let a
 *      non-Owner remove ANY account — Owners included, which destroys the very accounts every
 *      exemption above depends on.
 *
 * Owner-type callers are exempt from all five. That is deliberate and load-bearing: it keeps admin
 * user management working, and it keeps auto-provisioning working — `NewUserBase.createNewUser`
 * runs as `contextUserForNewUserCreation`, which resolves to the seeded system user (`Type='Owner'`).
 * A caller-less save/delete (no `ActiveUser` at all — e.g. a system/CLI path running under a bound
 * provider default) is likewise treated as exempt: `BaseEntity.CheckPermissions` already throws on a
 * falsy `ActiveUser` and runs BEFORE `Validate()` inside `Save()`, so in production this guard never
 * actually evaluates a caller-less request — see the "no caller" test for the exact call ordering.
 *
 * Pure: reads only this record's own field state and the caller. No `RunView`, no provider, no
 * engine, no I/O — so it costs nothing per save/delete and is unit-testable without a database.
 */
@RegisterClass(BaseEntity, 'MJ: Users')
export class MJUserEntityServer extends MJUserEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        if (!this.callerIsOwner()) {
            if (!this.IsSaved) {
                this.validateCreateRefused(result);
            } else {
                this.validateNoTypeChange(result);
                this.validateOwnRowOnly(result);
                this.validateNameImmutable(result);
            }
        }
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /**
     * Refuses deletion of any `MJ: Users` row by a non-Owner caller. See invariant 5 above for why:
     * MJ deactivates users via `IsActive` rather than deleting them, and an unguarded delete would
     * let a non-Owner remove any account, including Owner accounts this class's other exemptions
     * depend on.
     *
     * Reports the refusal the way `MJListEntityServer.Delete` does for its own row-level DELETE
     * authorization check — a `BaseEntityResult` on the result history so `LatestResult.CompleteMessage`
     * carries the reason (`Delete()` returns `false` on a logical rejection rather than throwing; see
     * the CLAUDE.md Save/Delete error-handling contract) — rather than `MJUserRoutineEntityServer`'s
     * `Delete()` override, which is FK-cleanup ordering, not an authorization decision, and reports
     * nothing beyond a bare `false`.
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!this.callerIsOwner()) {
            return this.refuseDelete();
        }
        return super.Delete(options);
    }

    private refuseDelete(): boolean {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = 'delete';
        result.Message =
            'Only an Owner may delete a user record. MJ deactivates users via IsActive rather than deleting them.';
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
    }

    /**
     * Invariant 1 — a non-Owner may not create a `MJ: Users` row at all. See the class docstring
     * for why this is the correct scope (not merely "may not create an Owner"): `Name` has no
     * unique index, so restricting only `Type='Owner'` on create would leave the INSERT path open
     * to the same principal-redirection invariant 4 blocks on UPDATE.
     */
    private validateCreateRefused(result: ValidationResult): void {
        result.Errors.push(new ValidationErrorInfo(
            'Type',
            'Only an Owner may create a user record. Every legitimate creator of a MJ: Users row ' +
            '(auto-provisioning, magic-link provisioning, Explorer\'s user-management UI) already runs ' +
            'as an Owner.',
            this.Type,
            ValidationErrorType.Failure
        ));
    }

    /**
     * Invariant 2 — a non-Owner may not change `Type` on an EXISTING row (self-promotion, or
     * demoting somebody else). Non-Owner creation is refused entirely by `validateCreateRefused`,
     * so this method only needs to consider updates — `Validate()` only calls it on that branch.
     */
    private validateNoTypeChange(result: ValidationResult): void {
        if (!(this.GetFieldByName('Type')?.Dirty ?? false)) {
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
     * Invariant 3 — a non-Owner may only modify their own user row, compared against the PRE-SAVE
     * `ID` (see the class docstring for why the pre-save value is the meaningful comparison here).
     *
     * Fails CLOSED: if the pre-save identity cannot be established at all, the save is refused
     * rather than silently permitted. This is currently unreachable in production only because
     * `MJ: Users` has `TrackRecordChanges=1`, which forces `ResolverBase.UpdateRecord` to genuinely
     * load the row from the database before applying edits — but that is an unrelated entity flag,
     * not a guarantee this class should assume will always hold.
     */
    private validateOwnRowOnly(result: ValidationResult): void {
        const preSaveId = this.GetFieldByName('ID')?.OldValue as string | null | undefined;
        if (!preSaveId) {
            result.Errors.push(new ValidationErrorInfo(
                'ID',
                'Could not determine this record\'s pre-save identity, so ownership cannot be verified. ' +
                'Refusing to save rather than risk permitting an edit to another user\'s row.',
                preSaveId ?? null,
                ValidationErrorType.Failure
            ));
            return;
        }
        if (!UUIDsEqual(preSaveId, this.ActiveUser.ID)) {
            result.Errors.push(new ValidationErrorInfo(
                'ID',
                'You may only modify your own user record. Changing another user\'s record requires an Owner.',
                preSaveId,
                ValidationErrorType.Failure
            ));
        }
    }

    /**
     * Invariant 4 — a non-Owner may not change `Name` on an existing row.
     *
     * `Name` is the column the context-user ladder resolves against first, so it is effectively a
     * capability name, not a display name. Non-Owner creation (where auto-provisioning legitimately
     * sets `Name = email`) is already refused entirely by `validateCreateRefused`, so this method
     * only runs on updates.
     */
    private validateNameImmutable(result: ValidationResult): void {
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
     * nothing to compare against, and `CheckPermissions` already refuses a caller-less save/delete
     * before either `Validate()` or `Delete()`'s body ever runs in production; see the class
     * docstring).
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
