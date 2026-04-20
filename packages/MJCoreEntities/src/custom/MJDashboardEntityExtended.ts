import { BaseEntity, EntityDeleteOptions, IMetadataProvider, LogError, Metadata } from "@memberjunction/core";
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

            const md: Metadata = new Metadata();
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

            if (!permissions.CanEdit) {
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