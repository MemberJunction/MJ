import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { StorageObjectMetadata } from "@memberjunction/storage";
import { BaseAction } from "@memberjunction/actions";
import { BaseFileStorageAction } from "./base-file-storage.action";

/**
 * Action for retrieving metadata about a file object in a storage provider.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Storage Object Metadata',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'AWS S3 Storage'
 *   }, {
 *     Name: 'ObjectName',
 *     Value: 'reports/annual-report.pdf'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage: Get Object Metadata")
export class GetMetadataAction extends BaseFileStorageAction {

    /**
     * Get metadata for a storage object
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage provider
     *   - ObjectName: Required if ObjectID not provided - Name/path of the object
     *   - ObjectID: Optional - Provider-specific object ID (bypasses path resolution for faster access)
     *
     * @returns Operation result with metadata fields:
     *   - Name: File name
     *   - Path: Directory path
     *   - FullPath: Complete path
     *   - Size: File size in bytes
     *   - ContentType: MIME type
     *   - LastModified: Last modified timestamp
     *   - IsDirectory: Whether object is a directory
     *   - ETag: Entity tag (if available)
     *   - CustomMetadata: Custom metadata key-value pairs (if available)
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

            // Execute the get metadata operation with new params structure
            const metadata: StorageObjectMetadata = await driver!.GetObjectMetadata({
                objectId: objectId || undefined,
                fullPath: objectName || undefined
            });

            // Add output parameters
            this.addOutputParam(params, 'Name', metadata.name);
            this.addOutputParam(params, 'Path', metadata.path);
            this.addOutputParam(params, 'FullPath', metadata.fullPath);
            this.addOutputParam(params, 'Size', metadata.size);
            this.addOutputParam(params, 'ContentType', metadata.contentType);
            this.addOutputParam(params, 'LastModified', metadata.lastModified.toISOString());
            this.addOutputParam(params, 'IsDirectory', metadata.isDirectory);

            if (metadata.etag) {
                this.addOutputParam(params, 'ETag', metadata.etag);
            }

            if (metadata.customMetadata) {
                this.addOutputParam(params, 'CustomMetadata', metadata.customMetadata);
            }

            return this.createSuccessResult({
                operation: 'GetMetadata',
                objectName,
                metadata
            }, params);

        } catch (error) {
            return this.createErrorResult(
                `Get metadata operation failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }
}

export function LoadGetMetadataAction() {
    // Stub function to prevent tree shaking
}
