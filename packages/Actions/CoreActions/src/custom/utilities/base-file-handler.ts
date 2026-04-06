import { BaseAction } from "@memberjunction/actions";
import { RunActionParams } from "@memberjunction/actions-base";
import { Metadata, RunView } from "@memberjunction/core";
import { MJFileEntity, MJFileStorageAccountEntity, MJFileStorageProviderEntity } from "@memberjunction/core-entities";
import { initializeDriverWithAccountCredentials } from "@memberjunction/storage";

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
            const { accountEntity, providerEntity } = storageAccountName
                ? await this.loadStorageAccountByName(storageAccountName, params)
                : await this.loadDefaultStorageAccount(params);
            const driver = await initializeDriverWithAccountCredentials({
                accountEntity,
                providerEntity,
                contextUser: params.ContextUser
            });

            const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
            const resolvedPath = storagePath
                ? `${storagePath.replace(/\/+$/, '')}/${fileName}`
                : `artifacts/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}/${fileName}`;
            const uploaded = await driver.PutObject(resolvedPath, buffer, mimeType);
            if (!uploaded) {
                throw new Error(`PutObject returned false for path: ${resolvedPath}`);
            }

            const md = new Metadata();
            const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', params.ContextUser);
            fileEntity.Name = fileName;
            fileEntity.ContentType = mimeType;
            fileEntity.ProviderID = providerEntity.ID;
            fileEntity.ProviderKey = resolvedPath;
            fileEntity.Status = 'Uploaded';

            const saved = await fileEntity.Save();
            if (!saved) {
                throw new Error('Failed to save MJ: Files record after upload');
            }

            return fileEntity.ID;
        } catch (error) {
            throw new Error(`Failed to save file to storage: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Loads a FileStorageAccount by name along with its provider entity.
     */
    private async loadStorageAccountByName(accountName: string, params: RunActionParams): Promise<{
        accountEntity: MJFileStorageAccountEntity;
        providerEntity: MJFileStorageProviderEntity;
    }> {
        const rv = new RunView();
        const accountResult = await rv.RunView<MJFileStorageAccountEntity>({
            EntityName: 'MJ: File Storage Accounts',
            ExtraFilter: `Name = '${accountName.replace(/'/g, "''")}'`,
            MaxRows: 1,
            ResultType: 'entity_object'
        }, params.ContextUser);

        if (!accountResult.Success || accountResult.Results.length === 0) {
            throw new Error(`FileStorageAccount "${accountName}" not found. Check account name or use default.`);
        }

        const accountEntity = accountResult.Results[0];
        const md = new Metadata();
        const providerEntity = await md.GetEntityObject<MJFileStorageProviderEntity>(
            'MJ: File Storage Providers', params.ContextUser
        );
        const providerLoaded = await providerEntity.Load(accountEntity.ProviderID);
        if (!providerLoaded) {
            throw new Error(`FileStorageProvider ${accountEntity.ProviderID} not found for account "${accountName}"`);
        }

        return { accountEntity, providerEntity };
    }

    /**
     * Loads the first active FileStorageAccount along with its provider entity.
     * Used by saveToMJStorage to determine where to upload files.
     */
    private async loadDefaultStorageAccount(params: RunActionParams): Promise<{
        accountEntity: MJFileStorageAccountEntity;
        providerEntity: MJFileStorageProviderEntity;
    }> {
        const rv = new RunView();
        const accountResult = await rv.RunView<MJFileStorageAccountEntity>({
            EntityName: 'MJ: File Storage Accounts',
            OrderBy: '__mj_CreatedAt ASC',
            MaxRows: 1,
            ResultType: 'entity_object'
        }, params.ContextUser);

        if (!accountResult.Success || accountResult.Results.length === 0) {
            throw new Error('No active FileStorageAccount found. Configure at least one storage account.');
        }

        const accountEntity = accountResult.Results[0];
        const md = new Metadata();
        const providerEntity = await md.GetEntityObject<MJFileStorageProviderEntity>(
            'MJ: File Storage Providers', params.ContextUser
        );
        const providerLoaded = await providerEntity.Load(accountEntity.ProviderID);
        if (!providerLoaded) {
            throw new Error(`FileStorageProvider ${accountEntity.ProviderID} not found for account "${accountEntity.Name}"`);
        }

        return { accountEntity, providerEntity };
    }

    /**
     * Initializes a storage driver for the given file by looking up its storage account.
     */
    private async initializeDriverForFile(file: MJFileEntity, params: RunActionParams) {
        const rv = new RunView();
        const accountResult = await rv.RunView<MJFileStorageAccountEntity>({
            EntityName: 'MJ: File Storage Accounts',
            ExtraFilter: `ProviderID = '${file.ProviderID}'`,
            MaxRows: 1,
            ResultType: 'entity_object'
        }, params.ContextUser);

        if (!accountResult.Success || accountResult.Results.length === 0) {
            throw new Error(`No FileStorageAccount found for ProviderID ${file.ProviderID}`);
        }

        const accountEntity = accountResult.Results[0];
        const md = new Metadata();
        const providerEntity = await md.GetEntityObject<MJFileStorageProviderEntity>(
            'MJ: File Storage Providers', params.ContextUser
        );
        const providerLoaded = await providerEntity.Load(file.ProviderID);
        if (!providerLoaded) {
            throw new Error(`FileStorageProvider ${file.ProviderID} not found`);
        }

        return initializeDriverWithAccountCredentials({ accountEntity, providerEntity, contextUser: params.ContextUser });
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