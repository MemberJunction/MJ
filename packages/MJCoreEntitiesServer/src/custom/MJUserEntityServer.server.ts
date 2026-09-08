import { BaseEntity, BaseEntityResult, EntityDeleteOptions, EntitySaveOptions, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
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
 * also overrides `Save()` and `Delete()`, so all five hold on every write path — GraphQL resolvers,
 * Remote Operations, the Create/Update/Delete Record actions, metadata sync, one-off scripts — and
 * for any role a deployment invents, not just the two seeded ones. A resolver-level check would
 * cover one door in a building with several.
 *
 * The `Save()` override is what makes that sentence literally true rather than nearly true.
 * `Validate()` alone does NOT cover every write path: `BaseEntity.Save()` force-passes validation
 * without calling `Validate()` when `EntitySaveOptions.ReplayOnly` is set (`baseEntity.ts:3725`),
 * and `ReplayOnly` does not suppress the write. Invariants 1-4 were therefore skippable by an
 * option, while invariant 5 was not — `Delete()` being an override. See `Save()` below for the
 * reachability analysis and why the fix refuses rather than re-validates.
 *
 * THE INVARIANTS, for a caller whose `Type` is not `'Owner'`:
 *
 *   1. **Creating a `MJ: Users` row at all is refused.** This is stricter than "may not create an
 *      Owner": there are FOUR automated creators of this entity — `NewUserBase.createNewUser`
 *      (`MJServer/src/auth/newUsers.ts`), `MagicLinkService`'s provisioning path
 *      (`MJServer/src/auth/magicLink/MagicLinkService.ts`), and `CreateNewUserBase.createNewUser`
 *      (`CodeGenLib/src/Misc/createNewUser.ts:33`, a CLI provisioning tool that sets `Type='Owner'`
 *      unconditionally at `:39` — already refused for a non-Owner caller before this round,
 *      regardless of the analysis below). The first two run as `ResolveConfiguredPrincipal(...)`,
 *      whose ladder is: rung 1 matches the configured string against `User.Name`, rung 2 against
 *      `User.Email` — NEITHER rung filters by `Type` (`MJServer/src/auth/principals.ts:134,141`) —
 *      and only rungs 3-4 (System-by-ID, then lowest-ID-among-ACTIVE-Owners) guarantee an Owner.
 *      So "no legitimate path creates a user row as a non-Owner" is NOT unconditional: it holds
 *      only while a deployment's `contextUserForNewUserCreation` / `contextUserForProvisioning`
 *      names an Owner-type user's `Name` or `Email` (the shipped default, `not.set@nowhere.com`,
 *      resolves by Email to the seeded Owner, so default installs are unaffected). A deployment
 *      that instead points either setting at a non-Owner user will have JWT auto-provisioning and
 *      magic-link provisioning fail CLOSED at `Save()` after this change — loudly, not silently —
 *      rather than continuing to create rows as that non-Owner; see the changeset for the upgrade
 *      note. Separately, Explorer's user-management UI has NO Owner gate today (no such guard
 *      exists in `user-management.component.ts` or its module), so a Developer-role non-Owner
 *      reaches it in practice and will now receive this same create/delete refusal there — a real
 *      consequence for such deployments, not a hypothetical one.
 *      A FOURTH creator exists and is not config-driven: `SyncRolesUsersResolver.AddNewUsers`
 *      (`MJServer/src/resolvers/SyncRolesUsersResolver.ts:343`), whose sibling `UpdateExistingUsers`
 *      also sets `Name` AND `Type` unconditionally on every synced row and whose `DeleteSingleUser`
 *      deletes. All three carry `@RequireSystemUser()`, and `getSystemUser()` resolves the seeded
 *      `Type='Owner'` system user, so the guard exempts them on a default install — but a deployment
 *      whose system user is NOT an Owner will see that sync path fail closed too, for the same
 *      reason as the config-driven pair above. Note also that `DeleteSingleUser` reads a `false`
 *      from `Delete()` as an FK-constraint condition and downgrades to a soft delete; invariant 5
 *      gives that same `false` a second meaning (non-Owner caller), which that call site does not
 *      distinguish.
 *      Refusing only `Type='Owner'` on create is NOT enough on its own: `Name` has no unique index
 *      and both seeded non-Owner roles hold `CanCreate`, so a non-Owner could otherwise repeatedly
 *      `Create` rows named to match the configured principal string until one sorts below the real
 *      system user by ID — the exact principal-redirection invariant 4 (below) exists to prevent,
 *      just reached through INSERT instead of UPDATE.
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
 *      `Email` is the ladder's OTHER rung (`principals.ts:141`) with the IDENTICAL lack of a `Type`
 *      filter, and is deliberately left mutable here — not overlooked. Two things narrow it: (a)
 *      `MJ: Users.Email` carries the database's `UQ_User_Email` unique constraint, so redirecting
 *      the Email rung to your own row requires the configured candidate to match NO active user at
 *      all — already the misconfiguration case this file's docs (and `resolvePrincipalFrom`'s own
 *      per-redeem logging) already surface loudly, not a quiet success path; and (b) even granting
 *      that misconfiguration, invariants 1 and 3 mean the payoff is no longer elevation: whatever
 *      row a provisioning path resolves its principal to, THIS guard still checks that resolved
 *      principal's actual `Type` before permitting the write it is attempting, so a non-Owner who
 *      gets themselves matched by the Email rung still cannot create or promote anything through
 *      it — the provisioning operation that would have run as them instead fails CLOSED. Freezing
 *      `Email` too would add friction to an already-narrow, already-loud misconfiguration path
 *      without closing any route that is still open.
 *   5. **Deleting a `MJ: Users` row at all is refused** (see the `Delete()` override below). MJ
 *      deactivates users via `IsActive`; it does not delete them. An unguarded delete would let a
 *      non-Owner remove ANY account — Owners included, which destroys the very accounts every
 *      exemption above depends on.
 *
 * Owner-type callers are exempt from all five — CONDITIONALLY on the deployment's own configuration
 * keeping `contextUserForNewUserCreation` / `contextUserForProvisioning` pointed at an Owner (see
 * invariant 1 above for why that is not automatic). Provided it is, this keeps admin user management
 * working, and it keeps auto-provisioning working — `NewUserBase.createNewUser` runs as
 * `contextUserForNewUserCreation`, which resolves to the seeded system user (`Type='Owner'`) under
 * the shipped default.
 * A caller-less save (no `ActiveUser` at all — e.g. a system/CLI path running under a bound provider
 * default) is likewise treated as exempt, though for `Save()` this is effectively decorative:
 * `BaseEntity.CheckPermissions` already throws on a falsy `ActiveUser` and runs BEFORE `Validate()`
 * inside `Save()`, so in production a caller-less `Save()` never reaches this guard's `Validate()`
 * body at all — see the "no caller" test for the exact call ordering. `Delete()`'s sequencing is the
 * OPPOSITE and the "no caller ⇒ exempt" default IS load-bearing there — see `callerIsOwner()`'s
 * docstring.
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
     * Refuses a `ReplayOnly` save by a non-Owner caller.
     *
     * WHY THIS OVERRIDE EXISTS. Invariants 1-4 are enforced in `Validate()`, and `Validate()` is the
     * one enforcement point `BaseEntity.Save()` can be told to skip: under `EntitySaveOptions.ReplayOnly`
     * it force-passes validation WITHOUT calling `Validate()` at all (`baseEntity.ts:3725`), and
     * `ReplayOnly` does NOT suppress the write — the provider only uses it to bypass the
     * `AllowUpdateAPI`/`AllowCreateAPI` gates before building and executing the SQL
     * (`databaseProviderBase.ts:1436-1443`). So a `ReplayOnly` save skipped all four Save-side
     * invariants while invariant 5 stayed enforced, because `Delete()` is an override and an
     * override cannot be switched off. This restores the symmetry: now neither half depends on the
     * caller's options.
     *
     * NOT CURRENTLY REACHABLE BY AN UNTRUSTED CALLER, and this is deliberately belt-and-braces
     * rather than a live hole. Every wire path that accepts `ReplayOnly` was enumerated: the
     * GraphQL `options___`/`DeleteOptionsInput` input exists only on the DELETE mutation (create and
     * update carry no options input, and `ResolverBase.CreateRecord`/`UpdateRecord` call `Save()`
     * with none); REST's `EntityCRUDHandler` does accept it, but calls `entity.Validate()`
     * explicitly before `Save()`, so the guard still runs there; and `graphQLSystemUserClient`
     * requires the system API key, i.e. a caller who is already superuser. The point is that the
     * class docstring's "holds on EVERY write path" is a promise a future wire path forwarding save
     * options would otherwise quietly break — a guard whose protection is one option away from off
     * is not the guard this file claims to be.
     *
     * WHY REFUSE RATHER THAN RE-RUN THE INVARIANTS. Re-running invariants 1-4 here would duplicate
     * `Validate()`'s logic in a second place that must then be kept in step with it — the exact
     * duplicated-decision this repo's design rules call out. Refusing outright is smaller and
     * strictly safer: `ReplayOnly` is a replication/replay facility for trusted sync paths, and a
     * non-Owner has no legitimate reason to replay writes onto the user table. Owners are exempt,
     * so replication and admin paths that run as an Owner are unaffected.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (options?.ReplayOnly && !this.callerIsOwner()) {
            return this.refuseSave();
        }
        return super.Save(options);
    }

    private refuseSave(): boolean {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message =
            'Only an Owner may perform a ReplayOnly save on a user record. ReplayOnly bypasses ' +
            'validation, which is where this entity\'s privilege-elevation invariants are enforced.';
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
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
        // Whole-record refusal, not a field-value problem — no field in this repo's convention
        // exists for that (surveyed every ValidationErrorInfo call site under custom/*.server.ts;
        // all attribute to the specific field the value is wrong for). Attributing to 'Type' would
        // make a form highlight Type for a refusal that has nothing to do with its value; 'ID' is
        // the closer fit — it is the field that identifies WHICH record is being refused.
        result.Errors.push(new ValidationErrorInfo(
            'ID',
            'Only an Owner may create a user record.',
            this.ID,
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
     *
     * `Email` is deliberately NOT frozen alongside `Name` — see the class docstring's invariant 4
     * paragraph for why the ladder's other rung doesn't need the same treatment.
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
     * nothing to compare against).
     *
     * The "no caller ⇒ exempt" default has DIFFERENT reachability for `Save()` vs. `Delete()`:
     *   - `Save()`: `BaseEntity.CheckPermissions` throws on a falsy `ActiveUser`
     *     (`baseEntity.ts:4003-4005`) and runs at `baseEntity.ts:3702`, BEFORE `Validate()` is
     *     called at `baseEntity.ts:3730` — so a caller-less `Save()` never reaches this method at
     *     all in production. The default is effectively decorative there.
     *   - `Delete()`: the sequencing is the OPPOSITE. THIS class's `Delete()` override calls
     *     `callerIsOwner()` as its very first statement, before `super.Delete()` is ever invoked —
     *     `CheckPermissions` only runs later, INSIDE `super.Delete()` (`baseEntity.ts:4612`). So a
     *     caller-less `Delete()` call DOES reach this method first, and the "no caller ⇒ exempt"
     *     default here is load-bearing: it lets the call proceed into `super.Delete()`, where
     *     `CheckPermissions` is the thing that actually refuses it. If this default were flipped to
     *     "no caller ⇒ refuse", a caller-less delete would be refused by `refuseDelete()` instead —
     *     same ultimate outcome (refused), different refusal mechanism and message.
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
