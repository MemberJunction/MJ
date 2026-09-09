import { BaseEntity, BaseEntityResult, EntityDeleteOptions, EntitySaveOptions, UserInfo, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJUserRoleEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: User Roles` entity enforcing MJ's role-elevation invariant (issue #4282).
 *
 * WHY THIS EXISTS AT ALL. Issue #4260 (`MJUserEntityServer`) closed the `User.Type` route to
 * elevated capability. Role assignment is the platform's OTHER authority mechanism and was
 * unguarded: verified against a live database, the `Developer` and `Integration` roles hold
 * unfiltered `CanCreate`/`CanUpdate`/`CanDelete` on `MJ: User Roles`, `AllowCreateAPI` /
 * `AllowUpdateAPI` / `AllowDeleteAPI` are all true on the entity, and no server-side subclass
 * existed — `ClassFactory` resolved the generated `MJUserRoleEntity`, whose `Validate()` knows
 * nothing about who is calling. Reproduced end to end before this class was written: a caller whose
 * `Type` is `'User'`, holding only `Developer` and `UI`, inserted a row granting itself
 * `Integration`; `Validate()` returned `Success=true` and `Save()` returned `true`.
 *
 * THE INVARIANT: **a non-Owner may only grant, move or revoke a role they themselves hold.**
 *
 * Why that rule and not a stricter one. Unlike `User.Type` — two values, no legitimate non-Owner
 * write — role assignment has real non-Owner use cases the platform ships with: delegated
 * administration, IdP/group sync, onboarding automation. The subset rule is the weakest rule that
 * still closes elevation completely, because it is a CEILING: whatever a non-Owner does through
 * this entity, the authority they can hand out is authority they already had, so no sequence of
 * calls lets any caller exceed their own grant. Issue #4282 also floated adding "and may not grant
 * a role that confers write access to `MJ: Roles`/`MJ: User Roles`". That was considered and
 * declined: it does not close any elevation the subset rule leaves open (granting a peer a role you
 * hold is delegation, not escape), it breaks the peer-onboarding case above, and it would require
 * this guard to read `EntityInfo.Permissions` — trading the purity below for protection that
 * `MJ: Entity Permissions` (which carries the SAME unfiltered `Developer`/`Integration` grant, and
 * is a separate, still-open route) would undercut anyway.
 *
 * WHY HERE RATHER THAN IN A RESOLVER, and why `Save()`/`Delete()` are overridden alongside
 * `Validate()`: identical reasoning to `MJUserEntityServer`, and see that file for the full
 * argument. In short — `Validate()` runs inside `BaseEntity.Save()`, so the rule holds on every
 * write path (GraphQL resolvers, Remote Operations, the Create/Update/Delete Record actions,
 * metadata sync, one-off scripts) and for any role a deployment invents; but `BaseEntity.Save()`
 * force-passes validation WITHOUT calling `Validate()` under `EntitySaveOptions.ReplayOnly`
 * (`baseEntity.ts:3725`) while still performing the write, and `Delete()` never consults
 * `Validate()` at all. Overriding all three is what makes "every write path" literal.
 *
 * THE INVARIANTS, for a caller whose `Type` is not `'Owner'`:
 *
 *   1. **Create** — `RoleID` must name a role the caller holds. This is the #4282 escalation
 *      itself: the self-grant of an unheld role.
 *   2. **Update** — the NEW `RoleID` must be held (invariant 1, reached through UPDATE instead of
 *      INSERT), and so must the PRE-SAVE `RoleID`. The second half is not redundant: moving an
 *      existing grant off a role you do not hold is a revocation you were not entitled to make,
 *      and without it a non-Owner could strip an Owner of any role by repointing the row.
 *      `UserID` is deliberately NOT frozen — moving a grant between users stays within the
 *      caller's ceiling, which is the whole point of the rule.
 *   3. **Delete** — the row's `RoleID` must be held by the caller, for the same reason as the
 *      pre-save half of invariant 2. Revocation is bounded by the same ceiling as granting.
 *   4. **A `ReplayOnly` save is refused outright**, because `ReplayOnly` is the one option that
 *      skips `Validate()` and therefore invariants 1-2. Refusing rather than re-running them keeps
 *      the decision in ONE place; `ReplayOnly` is a replication facility for trusted sync paths and
 *      a non-Owner has no legitimate reason to replay writes onto the role-assignment table.
 *
 * A caller holding NO roles can therefore grant nothing — correct, and it is also why this guard
 * needs no special case for an unpopulated `UserInfo.UserRoles`: the subset test fails closed on
 * an empty list on its own. (Server-side that list is populated — `MJServer`'s `context.ts` resolves
 * the request principal from `UserCache` precisely "to ensure UserRoles is properly populated", and
 * `CloneUserForSessionContext` carries it onto the per-session clone.)
 *
 * NOT COVERED, deliberately: a magic-link session's SYNTHESIZED roles (`context.ts`
 * `buildMagicLinkSessionUser`) count as roles held, so a scope-limited principal is measured by the
 * same rule as any other caller. Narrowing scope-limited principals further is a magic-link concern,
 * not a role-elevation one — `IsScopeLimitedPrincipal` lives in MJServer, which this package cannot
 * import, and duplicating its predicate here would put one decision in two places. Such a session
 * still needs `CanCreate` on this entity to reach the guard at all, which the `Magic Link Baseline`
 * role does not grant.
 *
 * Owner-type callers are exempt from all four, so admin role management, and the
 * `SyncRolesAndUsers` / `SyncUsers` mutations (both `@RequireSystemUser()`, whose `getSystemUser()`
 * resolves the seeded `Type='Owner'` system user), are unaffected on a default install. A
 * deployment whose system user is NOT an Owner will see those sync paths fail closed — loudly,
 * at the save — exactly as #4260 documented for `MJ: Users`.
 *
 * Pure: reads only this record's own field state and the caller's cached roles. No `RunView`, no
 * provider, no engine, no I/O — so it costs nothing per save/delete and is unit-testable without a
 * database.
 */
@RegisterClass(BaseEntity, 'MJ: User Roles')
export class MJUserRoleEntityServer extends MJUserRoleEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        if (!this.callerIsOwner()) {
            this.validateRoleHeld(
                result,
                this.RoleID,
                'You may only assign a role that you hold yourself. Assigning a role you do not hold would ' +
                'grant authority you were not given. Ask an Owner to make this assignment.'
            );
            if (this.IsSaved) {
                this.validatePriorRoleHeld(result);
            }
        }
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /**
     * Refuses a `ReplayOnly` save by a non-Owner caller — invariant 4. `ReplayOnly` force-passes
     * validation without calling `Validate()` (`baseEntity.ts:3725`) yet does not suppress the
     * write, so without this override invariants 1-2 were one caller-supplied option away from off
     * while invariant 3 stayed enforced (an override cannot be switched off). Mirrors
     * `MJUserEntityServer.Save()`, including its reasoning for refusing rather than re-validating.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (options?.ReplayOnly && !this.callerIsOwner()) {
            return this.refuse(
                this.IsSaved ? 'update' : 'create',
                'Only an Owner may perform a ReplayOnly save on a user-role assignment. ReplayOnly bypasses ' +
                'validation, which is where this entity\'s role-elevation invariants are enforced.'
            );
        }
        return super.Save(options);
    }

    /**
     * Invariant 3 — a non-Owner may only revoke a role they hold themselves.
     *
     * Reports the refusal the way `MJUserEntityServer.Delete` does — a `BaseEntityResult` on the
     * result history, so `LatestResult.CompleteMessage` carries the reason, `Delete()` returning
     * `false` on a logical rejection rather than throwing (the CLAUDE.md Save/Delete error-handling
     * contract). Note that `SyncRolesUsersResolver.SyncUserRoles` treats a `false` from this method
     * as a hard error and throws, rolling its transaction back; that mutation runs as the system
     * Owner, so it is exempt and never sees this refusal on a default install.
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!this.callerIsOwner() && !this.callerHoldsRole(this.RoleID)) {
            return this.refuse(
                'delete',
                'You may only revoke a role that you hold yourself. Revoking a role you do not hold would let you ' +
                'strip authority you were never granted. Ask an Owner to make this change.'
            );
        }
        return super.Delete(options);
    }

    /**
     * Invariants 1 and 2's forward half — the role being assigned must be one the caller holds.
     * Attributed to `RoleID` because that IS the field whose value is refused, so a form highlights
     * the control the user must change.
     */
    private validateRoleHeld(result: ValidationResult, roleId: string | null | undefined, message: string): void {
        if (this.callerHoldsRole(roleId)) {
            return;
        }
        result.Errors.push(new ValidationErrorInfo('RoleID', message, roleId ?? null, ValidationErrorType.Failure));
    }

    /**
     * Invariant 2's second half — the role this assignment granted BEFORE the edit must also be one
     * the caller holds, compared against the pre-save value rather than whatever the in-memory
     * object arrived holding. `MJ: User Roles` has `TrackRecordChanges=1`, which forces
     * `ResolverBase.UpdateRecord` to genuinely load the row from the database before applying edits,
     * so that pre-save value is the row's real prior state on every wire path — but that is an
     * unrelated entity flag, not a guarantee this class should assume will always hold, so a
     * pre-save value that cannot be established fails CLOSED with its own message rather than
     * falling through to "you do not hold role null".
     */
    private validatePriorRoleHeld(result: ValidationResult): void {
        const priorRoleId = this.GetFieldByName('RoleID')?.OldValue as string | null | undefined;
        if (!priorRoleId) {
            result.Errors.push(new ValidationErrorInfo(
                'RoleID',
                'Could not determine which role this assignment previously granted, so it cannot be checked ' +
                'against your own roles. Refusing to save rather than risk changing a grant you were not ' +
                'entitled to change.',
                priorRoleId ?? null,
                ValidationErrorType.Failure
            ));
            return;
        }
        this.validateRoleHeld(
            result,
            priorRoleId,
            'You may only change an assignment of a role that you hold yourself. This assignment currently grants ' +
            'a role you do not hold, so changing it would revoke authority you were never granted.'
        );
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
     * True when the caller's own role assignments include `roleId`.
     *
     * `UUIDsEqual` rather than `===` because role IDs reach this class from two different sources
     * with two different casings — the cached `UserInfo.UserRoles` and the entity field the client
     * sent (see `guides/UUID_COMPARISON_GUIDE.md`). A falsy `roleId`, or a caller with no roles,
     * yields `false`: both are the fail-closed answer, and neither needs a branch of its own.
     */
    private callerHoldsRole(roleId: string | null | undefined): boolean {
        if (!roleId) {
            return false;
        }
        const caller = this.ActiveUser;
        return (caller?.UserRoles ?? []).some((userRole) => UUIDsEqual(userRole.RoleID, roleId));
    }

    /**
     * True when the caller is an Owner (or when there is no caller to evaluate — the guard has
     * nothing to compare against). `Type` is an `NCHAR` column, so it arrives space-padded; casing
     * is normalized for the same reason `MJServer`'s `principals.ts` does.
     *
     * The "no caller ⇒ exempt" default has the same asymmetric reachability documented on
     * `MJUserEntityServer.callerIsOwner()`: `BaseEntity.CheckPermissions` throws on a falsy
     * `ActiveUser` BEFORE `Validate()` runs inside `Save()`, so the default is decorative there;
     * in `Delete()` it is load-bearing, letting a caller-less delete proceed into `super.Delete()`
     * where `CheckPermissions` is what actually refuses it.
     *
     * Reads `ActiveUser` rather than `ContextCurrentUser` directly so a per-request provider's
     * `CurrentUser` is honored on multi-provider servers.
     */
    private callerIsOwner(): boolean {
        const caller: UserInfo | null = this.ActiveUser;
        if (!caller) {
            return true;
        }
        return caller.Type?.trim().toLowerCase() === 'owner';
    }
}
