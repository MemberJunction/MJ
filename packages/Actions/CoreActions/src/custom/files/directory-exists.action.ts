import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFileStorageAction } from "./base-file-storage.action";

/**
 * Action for checking if a directory exists in a storage provider.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Check Storage Directory Exists',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'Dropbox'
 *   }, {
 *     Name: 'DirectoryPath',
 *     Value: 'projects/2025/'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage: Check Directory Exists")
export class DirectoryExistsAction extends BaseFileStorageAction {

    /**
     * Check if a directory exists
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage provider
     *   - DirectoryPath: Required - Path to the directory
     *
     * @returns Operation result with:
     *   - Exists: Boolean indicating if the directory exists
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

            // Execute the directory exists operation
            const exists: boolean = await driver!.DirectoryExists(directoryPath);

            // Add output parameter
            this.addOutputParam(params, 'Exists', exists);

            return this.createSuccessResult({
                operation: 'DirectoryExists',
                directoryPath,
                exists
            }, params);

        } catch (error) {
            return this.createErrorResult(
                `Directory exists check failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }
}
