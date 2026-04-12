import { BaseAction } from "@memberjunction/actions";
import { RunActionParams } from "@memberjunction/actions-base";
import { RunView } from "@memberjunction/core";
import { MJFileEntity, MJFileStorageAccountEntity } from "@memberjunction/core-entities";
import { FileStorageEngine } from "@memberjunction/storage";

/**
 * Base class for actions that handle file inputs from multiple sources
 * Provides common functionality for loading files from:
 * - MJ Storage (Document Libraries)
 * - URLs
 * - Direct data
 */
export abstract class BaseFileHandlerAction extends BaseAction {
    /**
     * Get file content from various sources based on parameters
     * Priority: FileID > FileURL > Data parameter
     * 
     * @param params - Action parameters
     * @param dataParamName - Name of the parameter containing direct data
     * @param fileParamName - Name of the parameter containing file ID (default: 'FileID')
     * @param urlParamName - Name of the parameter containing file URL (default: 'FileURL')
     * @returns Object with content and metadata
     */
    protected async getFileContent(
        params: RunActionParams,
        dataParamName: string,
        fileParamName: string = 'FileID',
        urlParamName: string = 'FileURL'
    ): Promise<{
        content: string | Buffer;
        fileName?: string;
        mimeType?: string;
        source: 'storage' | 'url' | 'direct';
    }> {
        // Check for FileID first (MJ Storage)
        const fileIdParam = params.Params.find(p => p.Name.trim().toLowerCase() === fileParamName.toLowerCase());
        if (fileIdParam?.Value) {
            return await this.loadFromMJStorage(fileIdParam.Value.toString(), params);
        }

        // Check for FileURL
        const fileUrlParam = params.Params.find(p => p.Name.trim().toLowerCase() === urlParamName.toLowerCase());
        if (fileUrlParam?.Value) {
            return await this.loadFromURL(fileUrlParam.Value.toString());
        }

        // Check for direct data
        const dataParam = params.Params.find(p => p.Name.trim().toLowerCase() === dataParamName.toLowerCase());
        if (dataParam?.Value) {
            return {
                content: dataParam.Value.toString(),
                source: 'direct'
            };
        }

        throw new Error(`No input provided. Please provide ${fileParamName}, ${urlParamName}, or ${dataParamName}`);
    }

    /**
     * Load file from MJ Storage (MJ: Files entity)
     */
    private async loadFromMJStorage(fileId: string, params: RunActionParams): Promise<{
        content: string | Buffer;
        fileName?: string;
        mimeType?: string;
        source: 'storage';
    }> {
        try {
            const rv = new RunView();
            const fileResult = await rv.RunView<MJFileEntity>({
                EntityName: 'MJ: Files',
                ExtraFilter: `ID = '${fileId}'`,
                ResultType: 'entity_object'
            }, params.ContextUser);

            if (!fileResult.Success || fileResult.Results.length === 0) {
                throw new Error(`File not found in MJ: Files: ${fileId}`);
            }

            const file = fileResult.Results[0];
            const driver = await this.initializeDriverForFile(file, params);
            const objectName = file.ProviderKey ?? file.Name;
            const content = await driver.GetObject({ fullPath: objectName });

            return {
                content,
                fileName: file.Name,
                mimeType: file.ContentType ?? undefined,
                source: 'storage'
            };
        } catch (error) {
            throw new Error(`Failed to load file from storage: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Load file from URL
     */
    private async loadFromURL(url: string): Promise<{
        content: string | Buffer;
        fileName?: string;
        mimeType?: string;
        source: 'url';
    }> {
        try {
            // Validate URL
            const urlObj = new URL(url);
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                throw new Error('Only HTTP and HTTPS URLs are supported');
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            const contentDisposition = response.headers.get('content-disposition');
            let fileName: string | undefined;

            // Extract filename from content-disposition if available
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (match && match[1]) {
                    fileName = match[1].replace(/['"]/g, '');
                }
            }

            // If no filename from header, extract from URL
            if (!fileName) {
                fileName = urlObj.pathname.split('/').pop();
            }

            const content = await response.text();

            return {
                content,
                fileName,
                mimeType: contentType || undefined,
                source: 'url'
            };
        } catch (error) {
            throw new Error(`Failed to load file from URL: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Save file to MJ Storage. Uploads the content to a FileStorageAccount
     * and creates the corresponding MJ: Files entity record.
     *
     * @param content - File content as string or Buffer
     * @param fileName - Name for the file
     * @param mimeType - MIME type of the file
     * @param params - Action parameters (for contextUser)
     * @param storageAccountName - Optional: name of the storage account to use (falls back to first active)
     * @param storagePath - Optional: custom storage path prefix (falls back to `artifacts/{date}/{uuid}/`)
     * @returns The ID of the newly created MJ: Files record
     */
    protected async saveToMJStorage(
        content: string | Buffer,
        fileName: string,
        mimeType: string,
        params: RunActionParams,
        storageAccountName?: string,
        storagePath?: string
    ): Promise<string> {
        try {
            await FileStorageEngine.Instance.Config(false, params.ContextUser);

            // Resolve storage account ID
            let storageAccountId: string | undefined;
            if (storageAccountName) {
                const account = this.loadStorageAccountByName(storageAccountName);
                storageAccountId = account.ID;
            } else {
                storageAccountId = await this.resolveStorageAccountId(params);
            }

            const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
            const pathPrefix = storagePath
                ? storagePath.replace(/\/+$/, '')
                : undefined;

            const result = await FileStorageEngine.Instance.UploadFile({
                content: buffer,
                fileName,
                mimeType,
                contextUser: params.ContextUser,
                storageAccountId,
                pathPrefix
            });

            return result.FileID;
        } catch (error) {
            throw new Error(`Failed to save file to storage: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Finds a FileStorageAccount by name using the engine's cached metadata.
     */
    private loadStorageAccountByName(accountName: string): MJFileStorageAccountEntity {
        const account = FileStorageEngine.Instance.GetAccountByName(accountName);
        if (!account) {
            throw new Error(`FileStorageAccount "${accountName}" not found. Check account name or use default.`);
        }
        return account;
    }

    /**
     * Resolves a storage account ID from the agent's resolution chain (via Context)
     * or falls back to the first active account via FileStorageEngine.
     */
    private async resolveStorageAccountId(params: RunActionParams): Promise<string | undefined> {
        // Check for agent-resolved storage account ID (passed via Context by BaseAgent)
        const context = params.Context as Record<string, unknown> | undefined;
        const resolvedId = context?.__resolvedStorageAccountId;
        if (resolvedId) {
            return resolvedId.toString();
        }

        // Fallback: pick first active via engine
        const resolved = FileStorageEngine.Instance.ResolveStorageAccount();
        return resolved?.account.ID;
    }

    /**
     * Initializes a storage driver for the given file using the engine's cached metadata.
     */
    private async initializeDriverForFile(file: MJFileEntity, params: RunActionParams) {
        const accounts = FileStorageEngine.Instance.GetAccountsByProviderID(file.ProviderID);
        if (accounts.length === 0) {
            throw new Error(`No FileStorageAccount found for ProviderID ${file.ProviderID}`);
        }

        return FileStorageEngine.Instance.GetDriver(accounts[0].ID, params.ContextUser);
    }

    /**
     * Extract parameter value by name (case-insensitive)
     */
    protected getParamValue(params: RunActionParams, paramName: string): any {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        return param?.Value;
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