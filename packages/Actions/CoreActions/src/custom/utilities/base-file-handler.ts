import { BaseAction } from "@memberjunction/actions";
import { RunActionParams } from "@memberjunction/actions-base";
import { RunView, UserInfo } from "@memberjunction/core";
import { EscapeSQLString, IsValidUUID } from "@memberjunction/global";
import { MJFileEntity } from "@memberjunction/core-entities";
import { FileStorageEngine, StorageAccessEvaluator, StorageAccountAccessDeniedError } from "@memberjunction/storage";
import { DrainResponseBody, SafeFetch } from "@memberjunction/network-utils";

/**
 * Base class for actions that handle file inputs from multiple sources
 * Provides common functionality for loading files from:
 * - MJ Storage (Document Libraries)
 * - URLs
 * - Direct data
 *
 * **Storage access is gated for the caller.** A file loaded by `FileID` is read as the caller (the `MJ: Files` row
 * must be readable), then resolved through `FileStorageEngine.ResolveFileObject`, which refuses unless the caller may
 * read the storage account the row's provider resolves to and every `MJ: Files` row tracking the object. A save asks
 * `StorageAccessEvaluator` for `Write` on the account it lands in — named, agent-resolved or the default — and an
 * unknown account name is refused exactly like a restricted one.
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
            if (!IsValidUUID(fileId)) {
                throw new Error(`File not found in MJ: Files: ${fileId}`);
            }
            const rv = new RunView();
            const fileResult = await rv.RunView<MJFileEntity>({
                EntityName: 'MJ: Files',
                ExtraFilter: `ID = '${EscapeSQLString(fileId)}'`,
                ResultType: 'entity_object'
            }, params.ContextUser);

            if (!fileResult.Success || fileResult.Results.length === 0) {
                throw new Error(`File not found in MJ: Files: ${fileId}`);
            }

            const file = fileResult.Results[0];
            const resolved = await FileStorageEngine.Instance.ResolveFileObject(file, params.ContextUser, 'Read');
            if (!resolved) {
                throw new Error(`No FileStorageAccount found for ProviderID ${file.ProviderID}`);
            }
            const content = await resolved.Driver.GetObject({ fullPath: resolved.ObjectKey });

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

            // Route through the SSRF guard: the URL is caller-controlled, so private/loopback/
            // link-local/reserved targets are blocked and every redirect hop is re-validated.
            const response = await SafeFetch(url);
            if (!response.ok) {
                await DrainResponseBody(response);
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

            // Resolve the account the upload lands in, then gate it for Write before anything is uploaded
            const storageAccountId = storageAccountName
                ? this.storageAccountIdByName(storageAccountName)
                : await this.resolveStorageAccountId(params);
            await this.assertCanWrite(storageAccountId, params.ContextUser);

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
     * The ID of the FileStorageAccount named `accountName`, from the engine's cached metadata. An unknown name is refused
     * with the same error as an account the caller may not use, so the refusal never reveals which names exist.
     */
    private storageAccountIdByName(accountName: string): string {
        const account = FileStorageEngine.Instance.GetAccountByName(accountName);
        if (!account) {
            throw new StorageAccountAccessDeniedError();
        }
        return account.ID;
    }

    /**
     * The account gate for a save: `contextUser` must hold `Write` on the account the upload lands in. With no account
     * at all there is nothing to gate — `UploadFile` then refuses with its documented "no file storage accounts" error.
     */
    private async assertCanWrite(storageAccountId: string | undefined, contextUser: UserInfo): Promise<void> {
        if (storageAccountId) {
            await StorageAccessEvaluator.Instance.AssertAccountAccess(storageAccountId, contextUser, 'Write');
        }
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