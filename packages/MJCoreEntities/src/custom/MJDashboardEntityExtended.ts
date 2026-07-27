import { BaseEntity, EntityDeleteOptions, IMetadataProvider, LogError, LogStatus } from "@memberjunction/core";
import { RegisterClass, ValidationErrorInfo, ValidationResult } from "@memberjunction/global";
import { MJDashboardEntity } from "../generated/entity_subclasses";
import { DashboardEngine } from "../engines/dashboards";

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

            // 'unevaluated' means DashboardEngine was never configured in this process, so the
            // sharing model could not be consulted — NOT that this user was refused. Blocking here
            // would deny every writer in any process that does not pre-warm engines, which is what
            // made `mj sync push` fail on every dashboard with a permissions message describing a
            // problem that did not exist.
            //
            // Skipping is not a hole in the sharing model: every multi-user surface loads this
            // engine (MJAPI pre-warms it via StartupManager 'full'; Explorer configures it before
            // rendering a dashboard), so the gate stays enforced exactly where untrusted callers
            // reach it. The processes that land here — the CLI and metadata sync — run as the
            // System user against declarative metadata, where per-user dashboard sharing is not
            // the security boundary. Logged rather than silent so this can never be mistaken for
            // an enforced check.
            if (permissions.PermissionSource === 'unevaluated') {
                LogStatus(
                    `MJDashboardEntityExtended.Validate: dashboard sharing permissions not enforced for '${this.ID}' — ` +
                    `DashboardEngine is not configured in this process (expected for CLI/metadata-sync; ` +
                    `NOT expected inside MJAPI or Explorer).`
                );
            } else if (!permissions.CanEdit) {
                result.Success = false;
                result.Errors.push(new ValidationErrorInfo(
                    'Permission',
                    'You do not have permission to edit this dashboard',
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
        const md = this.ProviderToUse as any as IMetadataProvider;
        const currentUser = this.ContextCurrentUser || md.CurrentUser;

        if (!currentUser) {
            LogError('Cannot delete dashboard: User not authenticated');
            return false;
        }

        // Check delete permission. Same 'unevaluated' distinction as Validate() — see the long
        // comment there for why an unconfigured engine must not be read as a refusal. Without
        // this, a CLI-context delete is rejected with a message blaming the user's permissions.
        const permissions = DashboardEngine.Instance.GetDashboardPermissions(this.ID, currentUser.ID);

        if (permissions.PermissionSource === 'unevaluated') {
            LogStatus(
                `MJDashboardEntityExtended.Delete: dashboard sharing permissions not enforced for '${this.ID}' — ` +
                `DashboardEngine is not configured in this process (expected for CLI/metadata-sync; ` +
                `NOT expected inside MJAPI or Explorer).`
            );
        } else if (!permissions.CanDelete) {
            LogError(`User ${currentUser.ID} does not have permission to delete dashboard ${this.ID}`);
            return false;
        }

        // Permission granted, proceed with delete
        return super.Delete(options);
    }
}