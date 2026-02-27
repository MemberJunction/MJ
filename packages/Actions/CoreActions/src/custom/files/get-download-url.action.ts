import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFileStorageAction } from "./base-file-storage.action";

/**
 * Action for generating a pre-authenticated download URL for a file.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Storage Download URL',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'Azure Blob Storage'
 *   }, {
 *     Name: 'ObjectName',
 *     Value: 'documents/contract.pdf'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage: Get Download URL")
export class GetDownloadUrlAction extends BaseFileStorageAction {

    /**
     * Generate a pre-authenticated download URL
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage provider
     *   - ObjectName: Required - Name/path of the object
     *
     * @returns Operation result with:
     *   - DownloadUrl: Pre-authenticated URL for downloading the file
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

            // Execute the create download URL operation
            const url: string = await driver!.CreatePreAuthDownloadUrl(objectName);

            // Add output parameter
            this.addOutputParam(params, 'DownloadUrl', url);

            return this.createSuccessResult({
                operation: 'GetDownloadUrl',
                objectName,
                downloadUrl: url
            }, params);

        } catch (error) {
            return this.createErrorResult(
                `Get download URL operation failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }
}
