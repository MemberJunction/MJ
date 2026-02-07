import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFileStorageAction } from "./base-file-storage.action";

/**
 * Action for deleting a file object from a storage provider.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Delete Storage Object',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'SharePoint Storage'
 *   }, {
 *     Name: 'ObjectName',
 *     Value: 'old-files/deprecated.doc'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage: Delete Object")
export class DeleteObjectAction extends BaseFileStorageAction {

    /**
     * Delete a file object
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage provider
     *   - ObjectName: Required - Name/path of the object to delete
     *
     * @returns Operation result with:
     *   - Success: Boolean indicating if the delete succeeded
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get and initialize storage driver
            const { driver, error } = await this.getDriverFromParams(params);
            if (error) return error;

            // Get required parameter
            const objectName = this.getStringParam(params, 'objectname');
            if (!objectName) {
                return this.createErrorResult(
                    "ObjectName parameter is required",
                    "MISSING_OBJECTNAME"
                );
            }

            // Execute the delete operation
            const success: boolean = await driver!.DeleteObject(objectName);

            // Add output parameter
            this.addOutputParam(params, 'Success', success);

            return this.createSuccessResult({
                operation: 'DeleteObject',
                objectName,
                success
            }, params);

        } catch (error) {
            return this.createErrorResult(
                `Delete object operation failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }
}
