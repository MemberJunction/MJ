import path from 'path';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJGlobal } from '@memberjunction/global';
import { IMetadataProvider, UserInfo, Metadata, RunView, LogStatus, LogError } from '@memberjunction/core';
import { MJContentItemEntity } from '@memberjunction/core-entities';
import { FileStorageBase, FileStorageEngine, StorageObjectMetadata } from '@memberjunction/storage';
import {
    ConfidenceScale,
    DiscoverRequest,
    DiscoveredItem,
    LocatorFetchRequest,
    LocatorFetchResponse,
} from '@memberjunction/content-pipeline-base';
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
    public override readonly SupportsExhaustiveWalk = true;

    /** Maximum folder depth ListModifiedObjects will descend below PathPrefix. */
    private static readonly MAX_LIST_DEPTH = 16;

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
                const items = await this.processContentSource(contentSource);
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
    private async processContentSource(contentSource: MJContentSourceEntity): Promise<MJContentItemEntity[]> {
        const config = this.parseSourceConfig(contentSource);
        if (!config) return [];

        const driver = await this.ResolveStorageDriver(config.FileStorageProviderKey, this.contextUser, this.ProviderToUse);

        const lastRunDate = await this.engine.getContentSourceLastRunDate(contentSource.ID, this.contextUser);
        const prefix = config.PathPrefix ?? '';
        const objects = await this.listModifiedObjects(driver, prefix, lastRunDate, config.IncludeExtensions);

        if (objects.length === 0) {
            LogStatus(`AutotagCloudStorage: no modified files in source "${contentSource.Name}" since ${lastRunDate.toISOString()}`);
            return [];
        }

        LogStatus(`AutotagCloudStorage: found ${objects.length} new/modified files in source "${contentSource.Name}"`);

        // Load existing content items for this source to enable upsert by URL
        const existingItems = await this.loadExistingContentItems(contentSource.ID);

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
                const item = await this.processSingleFile(driver, obj, contentSourceParams, existingItems);
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
    private parseSourceConfig(contentSource: MJContentSourceEntity): ICloudStorageSourceConfig | null {
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
     * The storage driver for a provider key (ID, name or driver key): the provider's first File
     * Storage Account through `FileStorageEngine.GetDriver` (credentialed), else the
     * environment-configured driver registered under that key.
     */
    public async ResolveStorageDriver(providerKey: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<FileStorageBase> {
        const engine = FileStorageEngine.Instance;
        await engine.Config(false, contextUser, provider);
        const storageProvider = engine.Providers.find(
            (p) => UUIDsEqual(p.ID, providerKey) || p.Name === providerKey || p.ServerDriverKey === providerKey,
        );
        const account = storageProvider ? engine.GetAccountsByProviderID(storageProvider.ID)[0] : undefined;
        if (account) {
            return engine.GetDriver(account.ID, contextUser);
        }
        const driverKey = storageProvider?.ServerDriverKey ?? providerKey;
        const driver = MJGlobal.Instance.ClassFactory.TryCreateInstance<FileStorageBase>(FileStorageBase, driverKey);
        if (!driver.Resolved || !driver.Instance) {
            throw new Error(`No storage driver is registered for "${driverKey}". Ensure '@memberjunction/storage' is loaded.`);
        }
        await driver.Instance.initialize();
        if (!driver.Instance.IsConfigured) {
            throw new Error(`Storage driver "${driverKey}" has no File Storage Account and no environment configuration.`);
        }
        return driver.Instance;
    }

    /** List the objects under `PathPrefix` for the pipeline, skipping objects older than `request.Since` when provided. */
    public async *Discover(request: DiscoverRequest): AsyncIterable<DiscoveredItem> {
        const driver = await this.ResolveStorageDriver(this.providerKeyOf(request), request.ContextUser, request.Provider);
        // IncludeExtensions arrives as ".pdf,.docx" or a JSON array, flattened to a string either way.
        const extensions = request.Parameters.IncludeExtensions?.replace(/[[\]"\s]/g, '').split(',').filter(Boolean);
        const confidence = request.Confidence ?? ConfidenceScale;
        for (const object of await this.listModifiedObjects(driver, request.Parameters.PathPrefix ?? '', request.Since ?? undefined, extensions)) {
            if (request.Signal.aborted) {
                return;
            }
            const extension = path.extname(object.name).slice(1).toLowerCase();
            yield {
                URL: object.fullPath,
                Fields: [
                    { Field: 'Title', Value: object.name, Confidence: confidence.DiscoveredTitle },
                    ...(object.lastModified ? [{ Field: 'Date' as const, Value: object.lastModified, Confidence: confidence.DiscoveredDate }] : []),
                    ...(extension ? [{ Field: 'FileType' as const, Value: extension, Confidence: confidence.DiscoveredFileType }] : []),
                ],
            };
        }
    }

    /** Read a listed object through the same provider, confined to `PathPrefix` when configured. */
    public async Fetch(request: LocatorFetchRequest): Promise<LocatorFetchResponse> {
        const objectPath = this.trimLeadingSlashes(request.URL);
        if (!objectPath || objectPath.split('/').some((seg) => seg === '..' || seg === '.')) {
            throw new Error(`'${request.URL}' is not a valid cloud storage object key`);
        }
        const prefix = this.trimSlashes(request.Parameters.PathPrefix ?? '');
        if (prefix && objectPath !== prefix && !objectPath.startsWith(`${prefix}/`)) {
            throw new Error(`'${request.URL}' is outside the source's PathPrefix '${request.Parameters.PathPrefix}'`);
        }
        const driver = await this.ResolveStorageDriver(this.providerKeyOf(request), request.ContextUser, request.Provider);
        const bytes = await driver.GetObject({ fullPath: request.URL });
        return { Content: new Uint8Array(bytes), ResolvedURL: request.URL };
    }

    private trimLeadingSlashes(value: string): string {
        let start = 0;
        while (start < value.length && value.charCodeAt(start) === 47) {
            start++;
        }
        return start === 0 ? value : value.slice(start);
    }

    private trimTrailingSlashes(value: string): string {
        let end = value.length;
        while (end > 0 && value.charCodeAt(end - 1) === 47) {
            end--;
        }
        return end === value.length ? value : value.slice(0, end);
    }

    private trimSlashes(value: string): string {
        return this.trimTrailingSlashes(this.trimLeadingSlashes(value));
    }

    /** `FileStorageProviderKey`, the field the Cloud Storage type declares. */
    private providerKeyOf(request: DiscoverRequest | LocatorFetchRequest): string {
        const key = request.Parameters.FileStorageProviderKey;
        if (!key) {
            throw new Error('This Cloud Storage source names no storage provider. Set FileStorageProviderKey.');
        }
        return key;
    }

    /**
     * List every object under `prefix`, recursively — only those modified after `lastRunDate` when
     * given, and only `includeExtensions` (with or without the dot) when given.
     */
    private async listModifiedObjects(
        driver: FileStorageBase,
        prefix: string,
        lastRunDate?: Date,
        includeExtensions?: string[]
    ): Promise<StorageObjectMetadata[]> {
        const extSet = includeExtensions?.length
            ? new Set(includeExtensions.map(ext => (ext.startsWith('.') ? ext : `.${ext}`).toLowerCase()))
            : null;

        // Walk the tree under the prefix: ListObjects returns one level (objects + child prefixes), so
        // recurse into every child prefix. Guard against pathological depth and prefix loops.
        const objects: StorageObjectMetadata[] = [];
        const seen = new Set<string>();
        const walk = async (current: string, depth: number): Promise<void> => {
            const key = this.trimTrailingSlashes(current);
            if (seen.has(key) || depth > AutotagCloudStorage.MAX_LIST_DEPTH) return;
            seen.add(key);
            const result = await driver.ListObjects(current);
            objects.push(...result.objects);
            for (const child of result.prefixes ?? []) {
                if (this.trimTrailingSlashes(child) === key) continue; // provider echoed the folder itself
                await walk(child, depth + 1);
            }
        };
        await walk(prefix, 0);

        return objects.filter(obj => {
            if (obj.isDirectory) return false;
            if (lastRunDate && obj.lastModified <= lastRunDate) return false;
            if (extSet) {
                const ext = this.getFileExtension(obj.name);
                if (!extSet.has(ext)) return false;
            }
            return true;
        });
    }

    /**
     * Download a file, extract text, and create/update a ContentItem.
     */
    private async processSingleFile(
        driver: FileStorageBase,
        obj: StorageObjectMetadata,
        contentSourceParams: ContentSourceParams,
        existingItems: Map<string, MJContentItemEntity>
    ): Promise<MJContentItemEntity | null> {
        // Download the file content
        const buffer = await driver.GetObject({ fullPath: obj.fullPath });

        // Extract text using the engine's built-in parsers (PDF, DOCX, etc.)
        const text = await this.extractTextFromBuffer(buffer, obj.name);
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
    private async loadExistingContentItems(contentSourceID: string): Promise<Map<string, MJContentItemEntity>> {
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
    private async extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
        const ext = this.getFileExtension(fileName);

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
    private getFileExtension(fileName: string): string {
        const lastDot = fileName.lastIndexOf('.');
        if (lastDot < 0) return '';
        return fileName.substring(lastDot).toLowerCase();
    }
}
