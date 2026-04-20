import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFileStorageAction } from "./base-file-storage.action";

/**
 * Action for deleting a directory from a storage provider.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Delete Storage Directory',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'Dropbox'
 *   }, {
 *     Name: 'DirectoryPath',
 *     Value: 'old-projects/'
 *   }, {
 *     Name: 'Recursive',
 *     Value: 'true'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage: Delete Directory")
export class DeleteDirectoryAction extends BaseFileStorageAction {

    /**
     * Delete a directory
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage provider
     *   - DirectoryPath: Required - Path to the directory to delete
     *   - Recursive: Optional - Delete recursively (default: false)
     *
     * @returns Operation result with:
     *   - Success: Boolean indicating if the directory was deleted
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get and initialize storage driver
            const { driver, error } = await this.getDriverFromParams(params);
            if (error) return error;

            // Get required parameter
            const directoryPath = this.getStringParam(params, 'directorypath');
            if (!directoryPath) {
                return this.createErrorResult(
                    "DirectoryPath parameter is required",
                    "MISSING_DIRECTORYPATH"
                );
            }

            // Get optional recursive parameter
            const recursive = this.getBooleanParam(params, 'recursive', false);

            // Execute the delete directory operation
            const success: boolean = await driver!.DeleteDirectory(directoryPath, recursive);

            // Add output parameter
            this.addOutputParam(params, 'Success', success);

            return this.createSuccessResult({
                operation: 'DeleteDirectory',
                directoryPath,
                recursive,
                success
            }, params);

        } catch (error) {
            return this.createErrorResult(
                `Delete directory operation failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }
}
