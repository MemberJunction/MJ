import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFileStorageAction } from "./base-file-storage.action";

/**
 * Action for generating a pre-authenticated upload URL for a file.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Storage Upload URL',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'AWS S3 Storage'
 *   }, {
 *     Name: 'ObjectName',
 *     Value: 'uploads/new-file.pdf'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage: Get Upload URL")
export class GetUploadUrlAction extends BaseFileStorageAction {

    /**
     * Generate a pre-authenticated upload URL
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage provider
     *   - ObjectName: Required - Name/path of the object to upload
     *
     * @returns Operation result with:
     *   - UploadUrl: Pre-authenticated URL for uploading the file
     *   - ProviderKey: Provider-specific key (if returned by provider)
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

            // Execute the create upload URL operation
            const result = await driver!.CreatePreAuthUploadUrl(objectName);

            // Add output parameters
            this.addOutputParam(params, 'UploadUrl', result.UploadUrl);

            if (result.ProviderKey) {
                this.addOutputParam(params, 'ProviderKey', result.ProviderKey);
            }

            return this.createSuccessResult({
                operation: 'GetUploadUrl',
                objectName,
                uploadUrl: result.UploadUrl,
                providerKey: result.ProviderKey
            }, params);

        } catch (error) {
            return this.createErrorResult(
                `Get upload URL operation failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }
}
