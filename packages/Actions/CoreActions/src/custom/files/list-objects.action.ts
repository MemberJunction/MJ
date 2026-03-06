import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { StorageListResult } from "@memberjunction/storage";
import { BaseAction } from "@memberjunction/actions";
import { BaseFileStorageAction } from "./base-file-storage.action";

/**
 * Action for listing objects (files and directories) in a storage account path.
 *
 * Uses the enterprise credential model where storage accounts are configured
 * with credentials managed at the organization level.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'File Storage: List Objects',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'My Google Drive'
 *   }, {
 *     Name: 'Path',
 *     Value: 'documents/'
 *   }, {
 *     Name: 'Delimiter',
 *     Value: '/'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage: List Objects")
export class ListObjectsAction extends BaseFileStorageAction {

    /**
     * List objects in a storage account path
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage account
     *   - Path: Optional - Directory path to list (default: "/")
     *   - Delimiter: Optional - Path delimiter (default: "/")
     *
     * @returns Operation result with:
     *   - Objects: Array of file objects
     *   - Prefixes: Array of directory prefixes
     *   - ObjectCount: Number of objects
     *   - DirectoryCount: Number of directories
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get and initialize storage driver
            const { driver, error } = await this.getDriverFromParams(params);
            if (error) return error;

            // Get optional parameters with defaults
            const path = this.getStringParamWithDefault(params, 'path', '/');
            const delimiter = this.getStringParamWithDefault(params, 'delimiter', '/');

            // Execute the list operation
            const result: StorageListResult = await driver!.ListObjects(path, delimiter);

            // Add output parameters
            this.addOutputParam(params, 'Objects', result.objects);
            this.addOutputParam(params, 'Prefixes', result.prefixes);
            this.addOutputParam(params, 'ObjectCount', result.objects.length);
            this.addOutputParam(params, 'DirectoryCount', result.prefixes.length);

            return this.createSuccessResult({
                operation: 'ListObjects',
                path,
                objectCount: result.objects.length,
                directoryCount: result.prefixes.length,
                objects: result.objects,
                prefixes: result.prefixes
            }, params);

        } catch (error) {
            return this.createErrorResult(
                `List objects operation failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }
}