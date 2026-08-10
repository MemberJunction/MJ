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
        // The owner case needs no cache — `UserID` is on the record being validated. Resolving it
        // first fixes the defect without weakening the gate: a non-owner still cannot pass on an
        // unevaluable cache, which is the direction a permission check should fail. Validate() is
        // synchronous and cannot await Config(), so a non-owner whose grant lives only in the
        // engine is refused when the cache is cold — the pre-existing behaviour for that case,
        // deliberately left as-is rather than opened up.
        if (this.IsSaved && !UUIDsEqual(this.UserID, currentUser.ID)) {
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
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const currentUser = this.ContextCurrentUser || md.CurrentUser;

        if (!currentUser) {
            LogError('Cannot delete dashboard: User not authenticated');
            return false;
        }

        // Check delete permission. Unlike Validate(), this path is async, so it can load the
        // engine rather than guess — an unconfigured cache would otherwise refuse the owner.
        await DashboardEngine.Instance.Config(false, currentUser, this.ProviderToUse as unknown as IMetadataProvider);
        const permissions = DashboardEngine.Instance.GetDashboardPermissions(this.ID, currentUser.ID);

        if (!permissions.CanDelete) {
            LogError(`User ${currentUser.ID} does not have permission to delete dashboard ${this.ID}`);
            return false;
        }

        // Permission granted, proceed with delete
        return super.Delete(options);
    }
}