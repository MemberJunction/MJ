import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFileStorageAction } from "./base-file-storage.action";

/**
 * Action for creating a directory in a storage provider.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Create Storage Directory',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'Google Drive'
 *   }, {
 *     Name: 'DirectoryPath',
 *     Value: 'projects/2025/'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage: Create Directory")
export class CreateDirectoryAction extends BaseFileStorageAction {

    /**
     * Create a directory
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage provider
     *   - DirectoryPath: Required - Path for the new directory
     *
     * @returns Operation result with:
     *   - Success: Boolean indicating if the directory was created
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

            // Execute the create directory operation
            const success: boolean = await driver!.CreateDirectory(directoryPath);

            // Add output parameter
            this.addOutputParam(params, 'Success', success);

            return this.createSuccessResult({
                operation: 'CreateDirectory',
                directoryPath,
                success
            }, params);

        } catch (error) {
            return this.createErrorResult(
                `Create directory operation failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }
}
export function LoadCreateDirectoryAction() {
    // Stub function to prevent tree shaking
}
