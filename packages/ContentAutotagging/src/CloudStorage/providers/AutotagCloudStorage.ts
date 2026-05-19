import { RegisterClass } from '@memberjunction/global';
import { MJGlobal } from '@memberjunction/global';
import { IMetadataProvider, UserInfo, Metadata, RunView, LogStatus, LogError } from '@memberjunction/core';
import { MJContentItemEntity } from '@memberjunction/core-entities';
import { FileStorageBase, StorageObjectMetadata } from '@memberjunction/storage';
import { AutotagBase, AutotagProgressCallback } from '../../Core';
import { AutotagBaseEngine, ContentSourceParams } from '../../Engine';
import { MJContentSourceEntity } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';

/**
 * Configuration for cloud storage content sources.
 * Stored in ContentSource.Configuration JSON.
 */
interface ICloudStorageSourceConfig {
    /** ClassFactory key for the MJ Storage driver (e.g., 'Azure Blob Storage', 'AWS S3') */
    FileStorageProviderKey: string;
    /** Optional path prefix to restrict which files are scanned */
    PathPrefix?: string;
    /** Optional file extensions to include (e.g., ['.pdf', '.docx']). If empty, all files are included. */
    IncludeExtensions?: string[];
}

/**
 * Generic cloud storage autotag provider that works with ANY MJ Storage driver.
 *
 * Replaces the previous Azure-specific AutotagAzureBlob by delegating file listing
 * and reading to the MJ Storage abstraction layer (FileStorageBase). This means it
 * works with Azure Blob, AWS S3, Google Cloud Storage, SharePoint, Dropbox, Box, etc.
 *
 * Configuration is driven by ContentSource.Configuration JSON which must include
 * a `FileStorageProviderKey` matching a registered MJ Storage driver.
 *
 * The storage driver is initialized via environment-based config (e.g.,
 * STORAGE_AZURE_ACCOUNT_NAME, STORAGE_AZURE_ACCOUNT_KEY) which the MJ Storage
 * drivers read automatically on construction.
 */
@RegisterClass(AutotagBase, 'AutotagCloudStorage')
export class AutotagCloudStorage extends AutotagBase {
    private contextUser!: UserInfo;
    private engine!: AutotagBaseEngine;
    protected contentSourceTypeID!: string;

    public async Autotag(contextUser: UserInfo, onProgress?: AutotagProgressCallback, contentSourceIDs?: string[], provider?: IMetadataProvider): Promise<number> {
        if (provider) this._provider = provider;
        this.contextUser = contextUser;
        this.engine = AutotagBaseEngine.Instance;
        this.contentSourceTypeID = this.engine.SetSubclassContentSourceType('Cloud Storage');

        const contentSources = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID);
        const contentItemsToProcess = await this.SetContentItemsToProcess(contentSources);

        if (contentItemsToProcess.length > 0) {
            await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser, undefined, undefined, onProgress);
        } else {
            LogStatus('AutotagCloudStorage: no new or modified files to process');
        }

        return contentItemsToProcess.length;
    }

    public async SetContentItemsToProcess(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]> {
        const contentItemsToProcess: MJContentItemEntity[] = [];

        for (const contentSource of contentSources) {
            try {
                const items = await this.ProcessContentSource(contentSource);
                contentItemsToProcess.push(...items);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`AutotagCloudStorage: failed to process source "${contentSource.Name}": ${msg}`);
            }
        }

        return contentItemsToProcess;
    }

    /**
     * Process a single content source: initialize the storage driver, list files,
     * detect new/modified files, download and extract text, create ContentItems.
     */
    private async ProcessContentSource(contentSource: MJContentSourceEntity): Promise<MJContentItemEntity[]> {
        const config = this.ParseSourceConfig(contentSource);
        if (!config) return [];

        const driver = this.CreateStorageDriver(config.FileStorageProviderKey);
        if (!driver) return [];

        const lastRunDate = await this.engine.getContentSourceLastRunDate(contentSource.ID, this.contextUser);
        const prefix = config.PathPrefix ?? '';
        const objects = await this.ListModifiedObjects(driver, prefix, lastRunDate, config.IncludeExtensions);

        if (objects.length === 0) {
            LogStatus(`AutotagCloudStorage: no modified files in source "${contentSource.Name}" since ${lastRunDate.toISOString()}`);
            return [];
        }

        LogStatus(`AutotagCloudStorage: found ${objects.length} new/modified files in source "${contentSource.Name}"`);

        // Load existing content items for this source to enable upsert by URL
        const existingItems = await this.LoadExistingContentItems(contentSource.ID);

        const contentSourceParams: ContentSourceParams = {
            contentSourceID: contentSource.ID,
            name: contentSource.Name ?? '',
            ContentTypeID: contentSource.ContentTypeID,
            ContentSourceTypeID: contentSource.ContentSourceTypeID,
            ContentFileTypeID: contentSource.ContentFileTypeID,
            URL: contentSource.URL
        };

        const items: MJContentItemEntity[] = [];
        for (const obj of objects) {
            try {
                const item = await this.ProcessSingleFile(driver, obj, contentSourceParams, existingItems);
                if (item) items.push(item);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`AutotagCloudStorage: failed to process file "${obj.fullPath}": ${msg}`);
            }
        }

        return items;
    }

    /**
     * Parse the ContentSource.Configuration JSON to extract cloud storage config.
     */
    private ParseSourceConfig(contentSource: MJContentSourceEntity): ICloudStorageSourceConfig | null {
        const configObj = contentSource.ConfigurationObject;
        if (!configObj) {
            // Fall back: try to infer from URL or legacy setup
            LogError(`AutotagCloudStorage: source "${contentSource.Name}" has no Configuration JSON. Set FileStorageProviderKey in the Configuration field.`);
            return null;
        }

        const raw = configObj as Record<string, unknown>;
        const providerKey = raw['FileStorageProviderKey'] as string | undefined;
        if (!providerKey) {
            LogError(`AutotagCloudStorage: source "${contentSource.Name}" Configuration is missing FileStorageProviderKey`);
            return null;
        }

        return {
            FileStorageProviderKey: providerKey,
            PathPrefix: (raw['PathPrefix'] as string) ?? undefined,
            IncludeExtensions: (raw['IncludeExtensions'] as string[]) ?? undefined,
        };
    }

    /**
     * Create and return a storage driver via ClassFactory using the provider key.
     */
    private CreateStorageDriver(providerKey: string): FileStorageBase | null {
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
            FileStorageBase,
            providerKey
        );
        if (!driver) {
            LogError(`AutotagCloudStorage: no storage driver registered for key "${providerKey}". Ensure the driver is loaded (e.g., import '@memberjunction/storage').`);
            return null;
        }
        if (!driver.IsConfigured) {
            LogError(`AutotagCloudStorage: storage driver "${providerKey}" is not configured. Check environment variables or mj.config.cjs storage settings.`);
            return null;
        }
        return driver;
    }

    /**
     * List all objects in the storage driver that were modified after lastRunDate.
     * Optionally filter by file extension.
     */
    private async ListModifiedObjects(
        driver: FileStorageBase,
        prefix: string,
        lastRunDate: Date,
        includeExtensions?: string[]
    ): Promise<StorageObjectMetadata[]> {
        const result = await driver.ListObjects(prefix);
        const extSet = includeExtensions?.length
            ? new Set(includeExtensions.map(ext => ext.toLowerCase()))
            : null;

        return result.objects.filter(obj => {
            if (obj.isDirectory) return false;
            if (obj.lastModified <= lastRunDate) return false;
            if (extSet) {
                const ext = this.GetFileExtension(obj.name);
                if (!extSet.has(ext)) return false;
            }
            return true;
        });
    }

    /**
     * Download a file, extract text, and create/update a ContentItem.
     */
    private async ProcessSingleFile(
        driver: FileStorageBase,
        obj: StorageObjectMetadata,
        contentSourceParams: ContentSourceParams,
        existingItems: Map<string, MJContentItemEntity>
    ): Promise<MJContentItemEntity | null> {
        // Download the file content
        const buffer = await driver.GetObject({ fullPath: obj.fullPath });

        // Extract text using the engine's built-in parsers (PDF, DOCX, etc.)
        const text = await this.ExtractTextFromBuffer(buffer, obj.name);
        if (!text || text.trim().length === 0) {
            LogStatus(`AutotagCloudStorage: no extractable text from "${obj.fullPath}", skipping`);
            return null;
        }

        const checksum = await this.engine.getChecksumFromText(text);
        const urlKey = obj.fullPath.toLowerCase();

        // Check for existing content item by URL
        const existing = existingItems.get(urlKey);
        if (existing && existing.Checksum === checksum) {
            return null; // Content unchanged
        }

        const md = this.ProviderToUse;
        let contentItem: MJContentItemEntity;

        if (existing) {
            contentItem = existing;
        } else {
            contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
            contentItem.NewRecord();
            contentItem.ContentSourceID = contentSourceParams.contentSourceID;
            contentItem.ContentTypeID = contentSourceParams.ContentTypeID;
            contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID;
            contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID;
        }

        contentItem.Name = obj.name;
        contentItem.Description = this.engine.GetContentItemDescription(contentSourceParams);
        contentItem.URL = obj.fullPath;
        contentItem.Text = text;
        contentItem.Checksum = checksum;

        const saved = await contentItem.Save();
        if (!saved) {
            throw new Error(`Failed to save ContentItem for "${obj.fullPath}"`);
        }

        existingItems.set(urlKey, contentItem);
        return contentItem;
    }

    /**
     * Load existing ContentItems for a source, keyed by lowercase URL for upsert lookups.
     */
    private async LoadExistingContentItems(contentSourceID: string): Promise<Map<string, MJContentItemEntity>> {
        const rv = new RunView();
        const result = await rv.RunView<MJContentItemEntity>({
            EntityName: 'MJ: Content Items',
            ExtraFilter: `ContentSourceID='${contentSourceID}'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        const map = new Map<string, MJContentItemEntity>();
        if (result.Success) {
            for (const ci of result.Results) {
                if (ci.URL) {
                    map.set(ci.URL.toLowerCase(), ci);
                }
            }
        }
        return map;
    }

    /**
     * Extract text from a file buffer based on file extension.
     * Delegates to the engine's built-in parsers for PDF and Office documents.
     */
    private async ExtractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
        const ext = this.GetFileExtension(fileName);

        if (ext === '.pdf' || ext === '.docx' || ext === '.doc' || ext === '.pptx' || ext === '.xlsx') {
            return this.engine.parsePDF(buffer);
        }

        if (ext === '.txt' || ext === '.md' || ext === '.csv' || ext === '.json' || ext === '.xml' || ext === '.html') {
            return buffer.toString('utf-8');
        }

        // Attempt parsePDF as fallback for unknown formats (officeparser handles many formats)
        try {
            return await this.engine.parsePDF(buffer);
        } catch {
            LogStatus(`AutotagCloudStorage: unsupported file format "${ext}" for "${fileName}"`);
            return '';
        }
    }

    /**
     * Get the lowercase file extension including the dot (e.g., '.pdf').
     */
    private GetFileExtension(fileName: string): string {
        const lastDot = fileName.lastIndexOf('.');
        if (lastDot < 0) return '';
        return fileName.substring(lastDot).toLowerCase();
    }
}
