import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFileStorageAction } from "./base-file-storage.action";

/**
 * Action for checking if a file object exists in a storage provider.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Check Storage Object Exists',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'Google Drive'
 *   }, {
 *     Name: 'ObjectName',
 *     Value: 'reports/monthly.xlsx'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage: Check Object Exists")
export class ObjectExistsAction extends BaseFileStorageAction {

    /**
     * Check if a file object exists
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage provider
     *   - ObjectName: Required - Name/path of the object
     *
     * @returns Operation result with:
     *   - Exists: Boolean indicating if the object exists
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

            // Execute the object exists operation
            const exists: boolean = await driver!.ObjectExists(objectName);

            // Add output parameter
            this.addOutputParam(params, 'Exists', exists);

            return this.createSuccessResult({
                operation: 'ObjectExists',
                objectName,
                exists
            }, params);

        } catch (error) {
            return this.createErrorResult(
                `Object exists check failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }
}
