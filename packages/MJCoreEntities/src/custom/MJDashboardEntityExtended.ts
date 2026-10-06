import { BaseEntity, EntityDeleteOptions, IMetadataProvider, LogError } from "@memberjunction/core";
import { RegisterClass, UUIDsEqual, ValidationErrorInfo, ValidationResult } from "@memberjunction/global";
import { MJDashboardEntity } from "../generated/entity_subclasses";
import { DashboardEngine } from "../engines/dashboards";

/**
 * The owner as stored in the database, ignoring any pending change to `UserID`.
 *
 * `BaseEntity` keeps the loaded value on the field as `OldValue`, which is what makes this
 * answerable without a round trip. For a record that was loaded and not modified, `OldValue`
 * and the current value agree; the two diverge exactly when someone is trying to change the
 * owner, which is the case this exists to see through.
 *
 * **`OldValue` is only trustworthy when the server loaded the row itself.**
 * `ResolverBase.UpdateRecord` takes two paths: when the entity has `TrackRecordChanges` it
 * re-reads the record server-side, but when it does NOT, it hydrates from the client-supplied
 * `OldValues___` — and first-set hydration writes `Value` *and* `OldValue`. On that path
 * `OldValue` is attacker-controlled and both gates below would read whatever the caller sent.
 * `MJ: Dashboards` ships with `TrackRecordChanges = 1`, but it is an ordinary admin-editable
 * field — MJ has already shipped a migration disabling it on other transient entities — and
 * `EntityInfo` declares it `boolean = null` with no coercion, so a metadata row missing the key
 * reads falsy too. Either way this returns `null` rather than a guessable value, and the
 * callers withhold the owner shortcut instead of trusting it.
 *
 * Note this is a CONSERVATIVE proxy for the real condition. `ResolverBase` re-reads when
 * `TrackRecordChanges || !input.OldValues___`, so a caller that supplies no `OldValues___` also
 * gets a server-loaded row and a trustworthy `OldValue` — this returns null there anyway,
 * costing that caller the owner shortcut. That is the safe direction to be wrong in, and it
 * only ever falls back to the pre-existing engine check. The precise fix is for `BaseEntity` to
 * expose whether the instance was server-hydrated; until it does, this errs toward refusing to
 * trust.
 *
 * Deliberately a MODULE-LEVEL function, not a class member. A `protected` (or `private`) method
 * makes the subclass structurally distinct from `MJDashboardEntity`, and the codebase assigns
 * across those two types (`BaseDashboard`'s `DashboardConfig.dashboard`), so adding one breaks
 * compilation in consumers that never touch this logic.
 */
function persistedUserID(entity: MJDashboardEntity): string | null {
    if (!entity.EntityInfo?.TrackRecordChanges) {
        // Fail closed. Without server-side re-read there is no trustworthy persisted value
        // here, and the alternative — falling back to `entity.UserID` — is precisely the
        // client-supplied value the gate exists to distrust.
        return null;
    }
    const field = entity.GetFieldByName('UserID');
    const persisted = field?.OldValue;
    return typeof persisted === 'string' && persisted.length > 0 ? persisted : entity.UserID;
}

@RegisterClass(BaseEntity, 'MJ: Dashboards')
export class MJDashboardEntityExtended extends MJDashboardEntity  {
    public NewRecord(): boolean {
        try{
            super.NewRecord();
            const defaultConfigDetails = {
                columns: 4,
                rowHeight: 150,
                resizable: true,
                reorderable: true,
                items: []
            }

            const configJSON = JSON.stringify(defaultConfigDetails);
            this.Set("UIConfigDetails", configJSON);

            const md = this.ProviderToUse as unknown as IMetadataProvider;
            if(md.CurrentUser){
                this.Set("UserID", md.CurrentUser.ID);
            }

            return true;
        }
        catch(error) {
            LogError("Error in NewRecord: ");
            LogError(error);
            return false;
        }
    }

    /**
     * Override Validate to check dashboard permissions before save.
     * For new records, user must be authenticated.
     * For existing records, user must have edit permission.
     */
    public override Validate(): ValidationResult {
        // Run base validation first
        const result = super.Validate();

        // Check permission for save operation
        const md =  this.ProviderToUse as unknown as IMetadataProvider
        const currentUser = this.ContextCurrentUser || md.CurrentUser;

        if (!currentUser) {
            result.Success = false;
            result.Errors.push(new ValidationErrorInfo(
                'Permission',
                'You must be logged in to save a dashboard',
                null
            ));
            return result;
        }

        // For existing records (not new), check edit permission.
        //
        // Ownership is answered from THIS ROW, not from the engine. GetDashboardPermissions reads
        // DashboardEngine's backing array directly, so an engine that was never Config()'d is
        // indistinguishable from "this dashboard grants you nothing" — and every caller is refused,
        // the owner included. That is not hypothetical: any process using the default `task`
        // startup mode defers engine pre-warm, which is why `mj sync push` failed on a dashboard
        // whose UserID *was* the pushing user.
        //
        // The owner case needs no cache — the persisted `UserID` is on the record being validated.
        // Resolving it first fixes the defect without weakening the gate: a non-owner still cannot
        // pass on an unevaluable cache, which is the direction a permission check should fail.
        // Validate() is synchronous and cannot await Config(), so a non-owner whose grant lives
        // only in the engine is refused when the cache is cold — the pre-existing behaviour for
        // that case, deliberately left as-is rather than opened up.
        if (this.IsSaved) {
            const persistedOwnerID = persistedUserID(this);

            // NOTE — supersedes upstream's `ownsRecord` fallback (255d506404, "a dashboard's owner
            // can save when the engine is unloaded"). That fix solved the same cold-cache problem by
            // trusting `this.UserID` whenever `DashboardEngine.Instance.Loaded` was false — but
            // `UserID` is client-settable on the update path, so a caller who can load a dashboard
            // could set it to themselves and, on any process where the engine happens to be cold,
            // be granted edit on someone else's record. Reading the PERSISTED owner fixes the cold
            // cache the same way (the row carries the answer; no engine needed) without ever
            // trusting a value the caller supplied.
            // The check MUST read the persisted owner, never `this.UserID`. `UserID` is a settable
            // field on UpdateMJDashboardInput, and ResolverBase.UpdateRecord loads the row and then
            // applies the client's values BEFORE Save() runs Validate(). Trusting the in-memory
            // value would let any user who can load a dashboard send
            // `UpdateMJDashboard(ID: <someone else's>, UserID: <self>)`, satisfy the owner branch
            // with the value they just supplied, and take ownership of the record.
            //
            // A NULL persisted owner means that value is not trustworthy here (see
            // persistedUserID). It must not open the owner branch — but it must not refuse the save
            // either. Refusing turns an auditing setting into a total outage: nobody, owner
            // included, could update any dashboard. Instead the owner shortcut is simply withheld
            // and the engine decides, which is exactly the behaviour before this fix existed. That
            // is strictly no weaker than the shipped baseline while still closing the escalation.
            if (persistedOwnerID === null || !UUIDsEqual(persistedOwnerID, currentUser.ID)) {
                const permissions = DashboardEngine.Instance.GetDashboardPermissions(this.ID, currentUser.ID);

                if (!permissions.CanEdit) {
                    result.Success = false;
                    result.Errors.push(new ValidationErrorInfo(
                        'Permission',
                        'You do not have permission to edit this dashboard',
                        this.ID
                    ));
                }
            }

            // Reassigning ownership is an owner-only act, and separate from being able to edit.
            // A user granted CanEdit through a share must not be able to make the dashboard theirs.
            //
            // ⚠️ KNOWN LIMITATION when `persistedOwnerID` is null (change tracking off). `Dirty` is
            // `Value !== OldValue`, and on that path BOTH sides come from the client: the resolver
            // hydrates from `OldValues___`, and first-set hydration writes `Value` *and* `OldValue`.
            // A caller who sends `OldValues___.UserID = <self>` alongside `UserID = <self>` presents
            // a field that is NOT dirty while the value is already theirs, so this gate does not
            // fire and the transfer proceeds. It catches an honest client, not a hostile one.
            //
            // This is deliberately not "fixed" by tightening the predicate — every signal reachable
            // from here is client-supplied on that path. The real fix is for `BaseEntity` to expose
            // whether the instance was server-hydrated (or for this to do a provider round-trip),
            // and `Validate()` being synchronous is what rules the round-trip out today. Until then
            // the shipped default (`TrackRecordChanges = 1`) is what keeps this closed, and that
            // coupling is now stated rather than assumed.
            if (persistedOwnerID === null) {
                const field = this.GetFieldByName('UserID');
                if (field?.Dirty) {
                    result.Success = false;
                    result.Errors.push(new ValidationErrorInfo(
                        'UserID',
                        'Dashboard ownership cannot be transferred while change tracking is disabled for ' +
                        'MJ: Dashboards, because the current owner cannot be verified.',
                        this.ID
                    ));
                }
            } else if (!UUIDsEqual(this.UserID, persistedOwnerID) && !UUIDsEqual(persistedOwnerID, currentUser.ID)) {
                result.Success = false;
                result.Errors.push(new ValidationErrorInfo(
                    'UserID',
                    'Only the owner of a dashboard can transfer its ownership',
                    this.ID
                ));
            }
        }

        return result;
    }

    /**
     * Override Delete to check dashboard permissions before deletion.
     * User must have delete permission (typically only owners can delete).
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const currentUser = this.ContextCurrentUser || md.CurrentUser;

        if (!currentUser) {
            LogError('Cannot delete dashboard: User not authenticated');
            return false;
        }

        // The owner is answered from the persisted row, for the same reason as in Validate():
        // it needs no cache, and a cache that is merely stale — a dashboard created since the
        // last Config() is absent from the backing array — otherwise refuses its own owner.
        //
        // A null answer means the persisted owner is not trustworthy (see persistedUserID), so
        // this shortcut is skipped and the delete falls through to the engine. Unlike Validate(),
        // that costs nothing here beyond a load — the engine is the authoritative source, and
        // this path is async and can consult it.
        const persistedOwnerID = persistedUserID(this);
        if (persistedOwnerID !== null && UUIDsEqual(persistedOwnerID, currentUser.ID)) {
            return super.Delete(options);
        }

        // Not the owner, so the grant can only come from the engine. Unlike Validate(), this path
        // is async, so it can load the engine rather than guess.
        //
        // The load is GUARDED because it is the one thing here that can throw, and `Delete()` is
        // documented to report logical failure by RETURNING FALSE, not by throwing — callers check
        // the boolean and read `LatestResult`. Letting a Config() rejection escape would change
        // this method's contract for every caller as a side effect of consulting the engine, and it
        // would do so only on the cold-cache path, which is the one nobody exercises. A failure to
        // load the permission source is a refusal to delete, which is the safe direction: it can
        // never turn into an accidental grant.
        try {
            await DashboardEngine.Instance.Config(false, currentUser, this.ProviderToUse as unknown as IMetadataProvider);
        }
        catch (err) {
            LogError(`Cannot delete dashboard ${this.ID}: loading dashboard permissions failed: ${err}`);
            return false;
        }
        const permissions = DashboardEngine.Instance.GetDashboardPermissions(this.ID, currentUser.ID);

        if (!permissions.CanDelete) {
            LogError(`User ${currentUser.ID} does not have permission to delete dashboard ${this.ID}`);
            return false;
        }

        // Permission granted, proceed with delete
        return super.Delete(options);
    }
}