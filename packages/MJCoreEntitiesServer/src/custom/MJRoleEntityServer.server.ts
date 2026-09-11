import { BaseEntity, BaseEntityResult, EntityDeleteOptions, EntitySaveOptions, UserInfo, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJRoleEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: Roles` entity enforcing MJ's role-elevation invariant (issue #4282).
 *
 * WHY THIS EXISTS AT ALL. Roles are the containers the platform's authority is expressed in, and
 * writing one was unguarded: verified against a live database, the `Developer` and `Integration`
 * roles hold unfiltered `CanCreate`/`CanUpdate`/`CanDelete` on `MJ: Roles`, all three `Allow*API`
 * flags are true on the entity, and no server-side subclass existed. Reproduced end to end before
 * this class was written: a caller whose `Type` is `'User'` created a brand-new role and `Save()`
 * returned `true`. Its sibling `MJUserRoleEntityServer` guards who may be GIVEN a role; this class
 * guards what the roles themselves are.
 *
 * THE INVARIANT: **a non-Owner may not create, change or delete a role.** All three, not a subset
 * of fields — because every field on this entity is authority-bearing:
 *
 *   - `Name` is what `SyncRolesUsersResolver` matches roles by (case-insensitively, in
 *     `DoSyncRoles` / `SyncUserRoles`) and what Explorer's `resolveRoleByIDOrName` resolves against,
 *     so renaming a role redirects which role a sync or a deep link lands on.
 *   - `DirectoryID` is the role's identifier in the external directory used for authentication —
 *     the mapping from an IdP group to platform authority.
 *   - `SQLName` is what CodeGen emits `GRANT` statements against, so it decides which DATABASE role
 *     receives object-level rights on every regenerated view and procedure.
 *   - Creation matters even though a new role confers nothing on its own: it is step one of
 *     "mint a role, grant it to myself, then give it permissions", and refusing it removes the
 *     step this entity owns.
 *   - Deletion destroys every assignment under the role at once, which is authority removal for
 *     everyone who held it, not just the caller.
 *
 * Freezing only the authority-bearing fields was considered and declined: it would leave the list
 * above to be re-derived every time a field is added to this entity, and `Description` — the only
 * field it would keep writable — is not worth a rule with that failure mode. This shape also
 * matches what issue #4260 chose for `MJ: Users` create/delete: refuse the operation, not a column.
 *
 * WHY HERE RATHER THAN IN A RESOLVER, and why `Save()` and `Delete()` are overridden alongside
 * `Validate()`: see `MJUserEntityServer` for the full argument. `Validate()` runs inside
 * `BaseEntity.Save()`, so the rule holds on every write path; `EntitySaveOptions.ReplayOnly`
 * force-passes validation without calling `Validate()` (`baseEntity.ts:3725`) while still writing,
 * and `Delete()` never consults `Validate()` at all.
 *
 * WHAT THIS BREAKS, deliberately. Explorer's role-management screen (`role-management.component.ts`
 * and its `role-dialog`) has no Owner gate of its own, so a non-Owner administrator who reaches it
 * today can create, rename and delete roles; after this change those saves are refused with the
 * messages below. That is the same trade-off issue #4260 accepted for the user-management screen,
 * and it is called out in this branch's changeset as an upgrade note. `SyncRoles` and
 * `SyncRolesAndUsers` are unaffected on a default install: both carry `@RequireSystemUser()`, whose
 * `getSystemUser()` resolves the seeded `Type='Owner'` system user. A deployment whose system user
 * is NOT an Owner will see them fail closed — loudly, at the save.
 *
 * Pure: reads only the caller. No `RunView`, no provider, no engine, no I/O.
 */
@RegisterClass(BaseEntity, 'MJ: Roles')
export class MJRoleEntityServer extends MJRoleEntity {
    private static readonly CREATE_REFUSED =
        'Only an Owner may create a role. Roles are the containers MJ expresses authority in, so creating one ' +
        'is the first step in granting authority that was not given.';

    private static readonly UPDATE_REFUSED =
        'Only an Owner may change a role. A role\'s Name is what user/role synchronization matches on, its ' +
        'DirectoryID maps an external directory group to this role, and its SQLName decides which database role ' +
        'CodeGen grants object rights to — so editing any of them redirects authority.';

    private static readonly DELETE_REFUSED =
        'Only an Owner may delete a role. Deleting one removes it from every user who holds it.';

    public override Validate(): ValidationResult {
        const result = super.Validate();
        if (!this.callerIsOwner()) {
            // Attributed to 'ID' rather than to a value-bearing field: this is a whole-record
            // refusal, not a complaint about any one value, and 'ID' is the field that identifies
            // WHICH record is being refused. Same convention and reasoning as
            // `MJUserEntityServer.validateCreateRefused`.
            result.Errors.push(new ValidationErrorInfo(
                'ID',
                this.IsSaved ? MJRoleEntityServer.UPDATE_REFUSED : MJRoleEntityServer.CREATE_REFUSED,
                this.ID,
                ValidationErrorType.Failure
            ));
        }
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /**
     * Closes the `ReplayOnly` bypass. Without this, a non-Owner could write this entity through the
     * one option that skips `Validate()` — see the class docstring and `MJUserEntityServer.Save()`
     * for why refusing outright beats re-running the rule in a second place.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (options?.ReplayOnly && !this.callerIsOwner()) {
            return this.refuse(
                this.IsSaved ? 'update' : 'create',
                'Only an Owner may perform a ReplayOnly save on a role. ReplayOnly bypasses validation, which is ' +
                'where this entity\'s role-elevation invariants are enforced.'
            );
        }
        return super.Save(options);
    }

    /**
     * Reports the refusal the way `MJUserEntityServer.Delete` does — a `BaseEntityResult` on the
     * result history so `LatestResult.CompleteMessage` carries the reason, `Delete()` returning
     * `false` on a logical rejection rather than throwing (the CLAUDE.md Save/Delete contract).
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!this.callerIsOwner()) {
            return this.refuse('delete', MJRoleEntityServer.DELETE_REFUSED);
        }
        return super.Delete(options);
    }

    /** Records a logical refusal on the result history so `LatestResult.CompleteMessage` carries the reason. */
    private refuse(type: 'create' | 'update' | 'delete', message: string): boolean {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
    }

    /**
     * True when the caller is an Owner (or when there is no caller to evaluate). Identical contract,
     * normalization and `Save()`-vs-`Delete()` reachability asymmetry as
     * `MJUserRoleEntityServer.callerIsOwner()` — see that method's docstring.
     */
    private callerIsOwner(): boolean {
        const caller: UserInfo | null = this.ActiveUser;
        if (!caller) {
            return true;
        }
        return caller.Type?.trim().toLowerCase() === 'owner';
    }
}
