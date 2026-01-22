import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { BaseFileStorageAction } from "./base-file-storage.action";

/**
 * Action for downloading file content from a storage provider.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Storage Object',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'Google Cloud Storage'
 *   }, {
 *     Name: 'ObjectName',
 *     Value: 'data/export.json'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage: Get Object")
export class GetObjectAction extends BaseFileStorageAction {

    /**
     * Download file content from storage
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage provider
     *   - ObjectName: Required if ObjectID not provided - Name/path of the object
     *   - ObjectID: Optional - Provider-specific object ID (bypasses path resolution for faster access)
     *
     * @returns Operation result with:
     *   - Content: Base64-encoded file content
     *   - Size: File size in bytes
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get and initialize storage driver
            const { driver, error } = await this.getDriverFromParams(params);
            if (error) return error;

            // Get identifier (prefer ObjectID if provided for performance)
            const objectId = this.getStringParam(params, 'objectid');
            const objectName = this.getStringParam(params, 'objectname');

            if (!objectId && !objectName) {
                return this.createErrorResult(
                    "Either ObjectName or ObjectID parameter is required",
                    "MISSING_IDENTIFIER"
                );
            }

            // Execute the get object operation with new params structure
            const content: Buffer = await driver!.GetObject({
                objectId: objectId || undefined,
                fullPath: objectName || undefined
            });

            // Convert buffer to base64 for transport
            const base64Content = content.toString('base64');

            // Add output parameters
            this.addOutputParam(params, 'Content', base64Content);
            this.addOutputParam(params, 'Size', content.length);

            return this.createSuccessResult({
                operation: 'GetObject',
                objectName,
                size: content.length,
                contentBase64: base64Content
            }, params);

        } catch (error) {
            return this.createErrorResult(
                `Get object operation failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }
}
export function LoadGetObjectAction() {
    // Stub function to prevent tree shaking
}
