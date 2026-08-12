import { BaseEntity, EntityDeleteOptions, IMetadataProvider, LogError } from "@memberjunction/core";
import { RegisterClass, UUIDsEqual, ValidationErrorInfo, ValidationResult } from "@memberjunction/global";
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

            // An unloaded engine is not a permission decision. GetDashboardPermissions resolves
            // against `_dashboards`, and a dashboard it cannot find returns "no permissions" — which
            // is indistinguishable from a genuine denial. In a process that never configures the
            // engine (a CLI task, where the 14 engines are deferred to first use), that array is
            // empty, so EVERY dashboard save is refused, including the owner's own.
            //
            // Ownership does not need the cache to be answered: the row carries UserID. Falling back
            // to it keeps the owner able to save while leaving every real denial intact — a loaded
            // engine still decides, and a non-owner is still refused either way.
            //
            // Found by `mj sync push` on PostgreSQL, where this record is dirty and therefore
            // reaches Validate(); on SQL Server the same record is unchanged, so Save() short-
            // circuits and the defect stays hidden.
            const ownsRecord = !DashboardEngine.Instance.Loaded && UUIDsEqual(this.UserID, currentUser.ID);

            if (!permissions.CanEdit && !ownsRecord) {
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

        // Check delete permission
        const permissions = DashboardEngine.Instance.GetDashboardPermissions(this.ID, currentUser.ID);

        if (!permissions.CanDelete) {
            LogError(`User ${currentUser.ID} does not have permission to delete dashboard ${this.ID}`);
            return false;
        }

        // Permission granted, proceed with delete
        return super.Delete(options);
    }
}