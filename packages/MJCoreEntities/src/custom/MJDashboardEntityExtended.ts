import { BaseEntity, EntityDeleteOptions, EntitySaveOptions, IMetadataProvider, LogError, UserInfo } from "@memberjunction/core";
import { RegisterClass, ValidationErrorInfo, ValidationResult } from "@memberjunction/global";
import { MJDashboardEntity } from "../generated/entity_subclasses";
import { DashboardEngine, DashboardUserPermissions } from "../engines/dashboards";

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
        const md =  this.ProviderToUse as any as IMetadataProvider
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

        // For existing records (not new), check edit permission
        if (this.IsSaved) {
            const permissions = DashboardEngine.Instance.GetDashboardPermissions(this.ID, currentUser.ID);

            // 'unevaluated' (the engine's cache was never loaded) is reported as a DENIAL, not
            // waved through. This gate is the only server-side enforcement of dashboard sharing —
            // the GraphQL UpdateMJDashboard resolver reaches it through BaseEntity.Save — so
            // treating "I could not evaluate" as permission-to-proceed would be fail-OPEN for every
            // authenticated user. MJServer never configures this engine explicitly; it is pre-warmed
            // only by StartupManager 'full' (via @RegisterForStartup), which BOTH `task` mode and a
            // failed boot load bypass — and BaseEngine.Load leaves _loaded false WITHOUT throwing
            // when a config fails. So the unloaded state is genuinely reachable in a live MJAPI.
            //
            // Save() pre-loads the engine (see the override below) so this branch means the load
            // was ATTEMPTED and failed, not that nobody asked. The error text names that cause,
            // because the previous message sent people hunting for a permissions problem that did
            // not exist.
            if (!permissions.CanEdit) {
                const why = nonAuthoritativeReason(permissions);
                const reason = why
                    ? `Dashboard permissions could not be evaluated — ${why}. Failing closed.`
                    : 'You do not have permission to edit this dashboard';
                result.Success = false;
                result.Errors.push(new ValidationErrorInfo('Permission', reason, this.ID));
            }
        }

        return result;
    }

    /**
     * Load the sharing model before validating.
     *
     * {@link Validate} is synchronous and cannot await, so without this the gate would read an
     * unloaded cache and deny every write in any process that does not pre-warm engines — which is
     * exactly what broke `mj sync push` (it runs StartupManager in 'task' mode). Loading here lets
     * the gate answer from real data on every path: the CLI and metadata-sync run as the System
     * user, which OWNS the dashboards in `metadata/dashboards`, so they pass on genuine ownership
     * rather than on an exemption.
     *
     * `EnsureLoaded` is a no-op once loaded, so the cost is one load per process. A load failure is
     * logged and left to {@link Validate}, which fails closed.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const currentUser = this.ContextCurrentUser || md?.CurrentUser;
        if (this.IsSaved && currentUser) {
            await ensureSharingModelLoaded(currentUser, md, this.ID);
        }
        return super.Save(options);
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

        // Load the sharing model before consulting it — same reasoning as Save(): an unloaded
        // engine must not be mistaken for a denial (that broke `mj sync push`) NOR for consent
        // (that would be fail-open on the GraphQL DeleteMJDashboard path). Load, then honour the
        // real answer.
        await ensureSharingModelLoaded(currentUser, md, this.ID);
        const permissions = DashboardEngine.Instance.GetDashboardPermissions(this.ID, currentUser.ID);

        if (!permissions.CanDelete) {
            const why = nonAuthoritativeReason(permissions);
            LogError(
                why
                    ? `Cannot delete dashboard ${this.ID}: permissions could not be evaluated — ${why}. Failing closed.`
                    : `User ${currentUser.ID} does not have permission to delete dashboard ${this.ID}`
            );
            return false;
        }

        // Permission granted, proceed with delete
        return super.Delete(options);
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Module-level helpers, deliberately NOT class members.
//
// A member that does not exist on `MJDashboardEntity` breaks structural assignability from the
// base class to this one, and callers rely on that assignability — e.g.
// `dashboard: null as unknown as MJDashboardEntity` assigned to a `MJDashboardEntityExtended`
// field in ng-dashboards' DashboardConfig. Adding one broke the Angular build even though the
// overrides above (which already exist on the base) are fine. Keep new helpers at module scope.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Why this permission answer must NOT be read as an authoritative "no", or null when it can be.
 *
 * Two states produce all-false grants that look identical to a genuine denial:
 *
 *  - the engine was never loaded (`'unevaluated'`); and
 *  - the engine WAS loaded, but by a user lacking read on one of its configs. `BaseEngine`'s
 *    permission handling is all-or-nothing (`CheckPermissionsOrSkipAll`): every array is set to
 *    `[]`, `_loaded` flips true, and `EnsureLoaded` never retries. Because the engine is a
 *    process-global singleton, the first restricted writer to touch it seats that empty cache
 *    for every user in the process — after which each dashboard "isn't found" and reports
 *    `'none'`.
 *
 * Both fail closed either way, so this changes no grant. It changes the MESSAGE, which is the
 * whole point: "you do not have permission" sends someone to audit sharing rows, when the real
 * cause is an unloaded or permission-constrained cache. That misdiagnosis is exactly what this
 * class already cost people once.
 */
function nonAuthoritativeReason(permissions: DashboardUserPermissions): string | null {
    if (permissions.PermissionSource === 'unevaluated') {
        return 'DashboardEngine is not loaded in this process';
    }
    if (DashboardEngine.Instance.IsPermissionConstrained) {
        return 'DashboardEngine was loaded by a user without read access to the dashboard sharing tables, ' +
               'so its cache is empty for everyone in this process';
    }
    return null;
}

/**
 * Best-effort load of {@link DashboardEngine}. Never throws: the permission gates fail closed on
 * an unloaded engine, so a load failure must surface as a denial with a diagnosable log line
 * rather than as an exception from Save()/Delete().
 *
 * `provider` is the ENTITY'S own provider, not the global — this may run under a non-default
 * provider. Callers cast `ProviderToUse` (typed `IEntityDataProvider`) to `IMetadataProvider`;
 * every concrete provider implements both, but the two interfaces do not overlap structurally.
 */
async function ensureSharingModelLoaded(
    currentUser: UserInfo, provider: IMetadataProvider, dashboardId: string
): Promise<void> {
    try {
        await DashboardEngine.Instance.EnsureLoaded(currentUser, provider);
    } catch (err) {
        LogError(
            `MJDashboardEntityExtended: DashboardEngine failed to load while checking permissions on dashboard ` +
            `'${dashboardId}'. The permission check will fail closed. Cause: ${(err as Error)?.message ?? err}`
        );
    }
}
