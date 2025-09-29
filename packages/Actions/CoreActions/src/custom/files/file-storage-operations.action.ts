import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { RunView, UserInfo } from "@memberjunction/core";
import { FileStorageProviderEntity } from "@memberjunction/core-entities";
import { FileStorageBase, StorageObjectMetadata, StorageListResult } from "@memberjunction/storage";
import { MJGlobal } from "@memberjunction/global";

/**
 * Comprehensive action for performing file storage operations across different storage providers.
 * Supports operations on Azure Blob Storage, AWS S3, Google Cloud Storage, Google Drive,
 * Dropbox, Box.com, and SharePoint.
 *
 * @example
 * ```typescript
 * // List objects in a directory
 * await runAction({
 *   ActionName: 'File Storage Operations',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'ListObjects'
 *   }, {
 *     Name: 'StorageProvider',
 *     Value: 'Azure Blob Storage'
 *   }, {
 *     Name: 'Path',
 *     Value: 'documents/'
 *   }]
 * });
 *
 * // Get object metadata
 * await runAction({
 *   ActionName: 'File Storage Operations',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'GetMetadata'
 *   }, {
 *     Name: 'StorageProvider',
 *     Value: 'AWS S3 Storage'
 *   }, {
 *     Name: 'ObjectName',
 *     Value: 'reports/annual-report.pdf'
 *   }]
 * });
 *
 * // Download file content
 * await runAction({
 *   ActionName: 'File Storage Operations',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'GetObject'
 *   }, {
 *     Name: 'StorageProvider',
 *     Value: 'Google Cloud Storage'
 *   }, {
 *     Name: 'ObjectName',
 *     Value: 'data/export.json'
 *   }]
 * });
 *
 * // Copy an object
 * await runAction({
 *   ActionName: 'File Storage Operations',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'CopyObject'
 *   }, {
 *     Name: 'StorageProvider',
 *     Value: 'Azure Blob Storage'
 *   }, {
 *     Name: 'SourceObjectName',
 *     Value: 'drafts/document.pdf'
 *   }, {
 *     Name: 'DestinationObjectName',
 *     Value: 'archive/document.pdf'
 *   }]
 * });
 *
 * // Create directory
 * await runAction({
 *   ActionName: 'File Storage Operations',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'CreateDirectory'
 *   }, {
 *     Name: 'StorageProvider',
 *     Value: 'Google Drive'
 *   }, {
 *     Name: 'DirectoryPath',
 *     Value: 'projects/2025/'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage Operations")
export class FileStorageOperationsAction extends BaseAction {

    /**
     * Performs file storage operations across different providers
     *
     * @param params - The action parameters containing:
     *   - Operation: Required - The operation to perform:
     *     - "ListObjects" - List files and directories
     *     - "GetMetadata" - Get file metadata
     *     - "GetObject" - Download file content
     *     - "GetDownloadUrl" - Get pre-authenticated download URL
     *     - "GetUploadUrl" - Get pre-authenticated upload URL
     *     - "ObjectExists" - Check if file exists
     *     - "DirectoryExists" - Check if directory exists
     *     - "CopyObject" - Copy a file
     *     - "MoveObject" - Move/rename a file
     *     - "DeleteObject" - Delete a file
     *     - "CreateDirectory" - Create a directory
     *     - "DeleteDirectory" - Delete a directory
     *
     *   - StorageProvider: Required - Name of the storage provider (e.g., "Azure Blob Storage", "AWS S3 Storage")
     *
     *   - ObjectName: Object/file name (used by most operations)
     *   - Path: Directory path (for ListObjects)
     *   - Delimiter: Path delimiter (for ListObjects) - default: "/"
     *   - SourceObjectName: Source file (for CopyObject, MoveObject)
     *   - DestinationObjectName: Destination file (for CopyObject, MoveObject)
     *   - DirectoryPath: Directory path (for CreateDirectory, DeleteDirectory, DirectoryExists)
     *   - Recursive: Boolean - recursive delete (for DeleteDirectory) - default: false
     *
     * @returns Operation result with appropriate output parameters
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get required parameters
            const operation = this.getStringParam(params, 'operation');
            const providerName = this.getStringParam(params, 'storageprovider');

            // Validate required parameters
            if (!operation) {
                return this.createErrorResult("Operation parameter is required", "MISSING_OPERATION");
            }

            if (!providerName) {
                return this.createErrorResult("StorageProvider parameter is required", "MISSING_PROVIDER");
            }

            // Get the storage provider entity
            const provider = await this.getStorageProvider(providerName, params.ContextUser);
            if (!provider) {
                return this.createErrorResult(`Storage provider '${providerName}' not found`, "PROVIDER_NOT_FOUND");
            }

            // Initialize the storage driver
            const driver = await this.initializeDriver(provider);

            // Execute the requested operation
            const normalizedOperation = operation.toLowerCase() as string;
            switch (normalizedOperation) {
                case 'listobjects':
                    return await this.executeListObjects(params, driver);

                case 'getmetadata':
                    return await this.executeGetMetadata(params, driver);

                case 'getobject':
                    return await this.executeGetObject(params, driver);

                case 'getdownloadurl':
                    return await this.executeGetDownloadUrl(params, driver);

                case 'getuploadurl':
                    return await this.executeGetUploadUrl(params, driver);

                case 'objectexists':
                    return await this.executeObjectExists(params, driver);

                case 'directoryexists':
                    return await this.executeDirectoryExists(params, driver);

                case 'copyobject':
                    return await this.executeCopyObject(params, driver);

                case 'moveobject':
                    return await this.executeMoveObject(params, driver);

                case 'deleteobject':
                    return await this.executeDeleteObject(params, driver);

                case 'createdirectory':
                    return await this.executeCreateDirectory(params, driver);

                case 'deletedirectory':
                    return await this.executeDeleteDirectory(params, driver);

                default:
                    return this.createErrorResult(
                        `Unknown operation '${operation}'. Valid operations: ListObjects, GetMetadata, GetObject, GetDownloadUrl, GetUploadUrl, ObjectExists, DirectoryExists, CopyObject, MoveObject, DeleteObject, CreateDirectory, DeleteDirectory`,
                        "INVALID_OPERATION"
                    );
            }

        } catch (error) {
            return this.createErrorResult(
                `File storage operation failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }

    /**
     * Get storage provider entity by name
     */
    private async getStorageProvider(providerName: string, contextUser: UserInfo): Promise<FileStorageProviderEntity | null> {
        const rv = new RunView();
        const result = await rv.RunView<FileStorageProviderEntity>({
            EntityName: 'File Storage Providers',
            ExtraFilter: `Name='${providerName.replace(/'/g, "''")}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (result.Success && result.Results && result.Results.length > 0) {
            return result.Results[0];
        }

        return null;
    }

    /**
     * Initialize storage driver from provider entity
     */
    private async initializeDriver(provider: FileStorageProviderEntity): Promise<FileStorageBase> {
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
            FileStorageBase,
            provider.ServerDriverKey
        );

        // Initialize the driver if it has an initialize method
        await driver.initialize();

        return driver;
    }

    /**
     * Execute ListObjects operation
     */
    private async executeListObjects(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const path = this.getStringParamWithDefault(params, 'path', '/');
        const delimiter = this.getStringParamWithDefault(params, 'delimiter', '/');

        const result: StorageListResult = await driver.ListObjects(path, delimiter);

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
        });
    }

    /**
     * Execute GetMetadata operation
     */
    private async executeGetMetadata(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const objectName = this.getStringParam(params, 'objectname');

        if (!objectName) {
            return this.createErrorResult("ObjectName parameter is required for GetMetadata operation", "MISSING_OBJECTNAME");
        }

        const metadata: StorageObjectMetadata = await driver.GetObjectMetadata(objectName);

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
        });
    }

    /**
     * Execute GetObject operation
     */
    private async executeGetObject(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const objectName = this.getStringParam(params, 'objectname');

        if (!objectName) {
            return this.createErrorResult("ObjectName parameter is required for GetObject operation", "MISSING_OBJECTNAME");
        }

        const content: Buffer = await driver.GetObject(objectName);

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
        });
    }

    /**
     * Execute GetDownloadUrl operation
     */
    private async executeGetDownloadUrl(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const objectName = this.getStringParam(params, 'objectname');

        if (!objectName) {
            return this.createErrorResult("ObjectName parameter is required for GetDownloadUrl operation", "MISSING_OBJECTNAME");
        }

        const url: string = await driver.CreatePreAuthDownloadUrl(objectName);

        // Add output parameters
        this.addOutputParam(params, 'DownloadUrl', url);

        return this.createSuccessResult({
            operation: 'GetDownloadUrl',
            objectName,
            downloadUrl: url
        });
    }

    /**
     * Execute GetUploadUrl operation
     */
    private async executeGetUploadUrl(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const objectName = this.getStringParam(params, 'objectname');

        if (!objectName) {
            return this.createErrorResult("ObjectName parameter is required for GetUploadUrl operation", "MISSING_OBJECTNAME");
        }

        const result = await driver.CreatePreAuthUploadUrl(objectName);

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
        });
    }

    /**
     * Execute ObjectExists operation
     */
    private async executeObjectExists(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const objectName = this.getStringParam(params, 'objectname');

        if (!objectName) {
            return this.createErrorResult("ObjectName parameter is required for ObjectExists operation", "MISSING_OBJECTNAME");
        }

        const exists: boolean = await driver.ObjectExists(objectName);

        // Add output parameters
        this.addOutputParam(params, 'Exists', exists);

        return this.createSuccessResult({
            operation: 'ObjectExists',
            objectName,
            exists
        });
    }

    /**
     * Execute DirectoryExists operation
     */
    private async executeDirectoryExists(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const directoryPath = this.getStringParam(params, 'directorypath');

        if (!directoryPath) {
            return this.createErrorResult("DirectoryPath parameter is required for DirectoryExists operation", "MISSING_DIRECTORYPATH");
        }

        const exists: boolean = await driver.DirectoryExists(directoryPath);

        // Add output parameters
        this.addOutputParam(params, 'Exists', exists);

        return this.createSuccessResult({
            operation: 'DirectoryExists',
            directoryPath,
            exists
        });
    }

    /**
     * Execute CopyObject operation
     */
    private async executeCopyObject(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const sourceObjectName = this.getStringParam(params, 'sourceobjectname');
        const destinationObjectName = this.getStringParam(params, 'destinationobjectname');

        if (!sourceObjectName) {
            return this.createErrorResult("SourceObjectName parameter is required for CopyObject operation", "MISSING_SOURCE");
        }

        if (!destinationObjectName) {
            return this.createErrorResult("DestinationObjectName parameter is required for CopyObject operation", "MISSING_DESTINATION");
        }

        const success: boolean = await driver.CopyObject(sourceObjectName, destinationObjectName);

        // Add output parameters
        this.addOutputParam(params, 'Success', success);

        return this.createSuccessResult({
            operation: 'CopyObject',
            sourceObjectName,
            destinationObjectName,
            success
        });
    }

    /**
     * Execute MoveObject operation
     */
    private async executeMoveObject(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const sourceObjectName = this.getStringParam(params, 'sourceobjectname');
        const destinationObjectName = this.getStringParam(params, 'destinationobjectname');

        if (!sourceObjectName) {
            return this.createErrorResult("SourceObjectName parameter is required for MoveObject operation", "MISSING_SOURCE");
        }

        if (!destinationObjectName) {
            return this.createErrorResult("DestinationObjectName parameter is required for MoveObject operation", "MISSING_DESTINATION");
        }

        const success: boolean = await driver.MoveObject(sourceObjectName, destinationObjectName);

        // Add output parameters
        this.addOutputParam(params, 'Success', success);

        return this.createSuccessResult({
            operation: 'MoveObject',
            sourceObjectName,
            destinationObjectName,
            success
        });
    }

    /**
     * Execute DeleteObject operation
     */
    private async executeDeleteObject(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const objectName = this.getStringParam(params, 'objectname');

        if (!objectName) {
            return this.createErrorResult("ObjectName parameter is required for DeleteObject operation", "MISSING_OBJECTNAME");
        }

        const success: boolean = await driver.DeleteObject(objectName);

        // Add output parameters
        this.addOutputParam(params, 'Success', success);

        return this.createSuccessResult({
            operation: 'DeleteObject',
            objectName,
            success
        });
    }

    /**
     * Execute CreateDirectory operation
     */
    private async executeCreateDirectory(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const directoryPath = this.getStringParam(params, 'directorypath');

        if (!directoryPath) {
            return this.createErrorResult("DirectoryPath parameter is required for CreateDirectory operation", "MISSING_DIRECTORYPATH");
        }

        const success: boolean = await driver.CreateDirectory(directoryPath);

        // Add output parameters
        this.addOutputParam(params, 'Success', success);

        return this.createSuccessResult({
            operation: 'CreateDirectory',
            directoryPath,
            success
        });
    }

    /**
     * Execute DeleteDirectory operation
     */
    private async executeDeleteDirectory(params: RunActionParams, driver: FileStorageBase): Promise<ActionResultSimple> {
        const directoryPath = this.getStringParam(params, 'directorypath');
        const recursive = this.getBooleanParam(params, 'recursive', false);

        if (!directoryPath) {
            return this.createErrorResult("DirectoryPath parameter is required for DeleteDirectory operation", "MISSING_DIRECTORYPATH");
        }

        const success: boolean = await driver.DeleteDirectory(directoryPath, recursive);

        // Add output parameters
        this.addOutputParam(params, 'Success', success);

        return this.createSuccessResult({
            operation: 'DeleteDirectory',
            directoryPath,
            recursive,
            success
        });
    }

    /**
     * Helper to add output parameter
     */
    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Type: 'Output',
            Value: value
        });
    }

    /**
     * Helper to create success result
     */
    private createSuccessResult(data: Record<string, unknown>): ActionResultSimple {
        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: JSON.stringify(data, null, 2)
        };
    }

    /**
     * Helper to create error result
     */
    private createErrorResult(message: string, code: string): ActionResultSimple {
        return {
            Success: false,
            Message: message,
            ResultCode: code
        };
    }

    /**
     * Extract parameter value by name (case-insensitive)
     */
    protected getParamValue(params: RunActionParams, paramName: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        return param?.Value as string | undefined;
    }

    /**
     * Get string parameter value (guaranteed to be string or undefined)
     */
    protected getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const value = this.getParamValue(params, paramName);
        if (value === undefined || value === null) return undefined;
        return String(value);
    }

    /**
     * Get string parameter value with default
     */
    protected getStringParamWithDefault(params: RunActionParams, paramName: string, defaultValue: string): string {
        return this.getStringParam(params, paramName) ?? defaultValue;
    }

    /**
     * Get boolean parameter value with default
     */
    protected getBooleanParam(params: RunActionParams, paramName: string, defaultValue: boolean = false): boolean {
        const value = this.getParamValue(params, paramName);
        if (value === undefined || value === null) return defaultValue;
        return String(value).toLowerCase() === 'true';
    }

    /**
     * Get numeric parameter value with default
     */
    protected getNumericParam(params: RunActionParams, paramName: string, defaultValue: number = 0): number {
        const value = this.getParamValue(params, paramName);
        if (value === undefined || value === null) return defaultValue;
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
    }
}