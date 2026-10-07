/**
 * @fileoverview The cloud storage walk, as a Discover driver.
 *
 * Unlike the other lifted walks this one does not reuse the autotagger's implementation, because
 * the autotagger's is bound to one vendor: {@link AutotagAzureBlob} talks to the Azure Blob SDK
 * directly, so a SharePoint or S3 source cannot use it at all.
 *
 * MJ already owns that abstraction. `FileStorageBase` has seven registered drivers — Azure, S3, Box,
 * Dropbox, Google Cloud, Google Drive, SharePoint — and `ContentSourceType.Configuration` for Cloud
 * Storage already declares a `storage-provider-picker` field, so a source already names the provider
 * it wants. Walking through `ListObjects` means every one of those providers is a usable content
 * source with no per-vendor code here.
 *
 * It also gives change detection something honest to work with: `ListObjects` returns each object's
 * etag, which is the storage service's own statement of version.
 *
 * @module @memberjunction/content-autotagging
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseDiscoverDriver, DiscoverRequest, DiscoveredItem } from '@memberjunction/content-pipeline-base';
import { FileStorageEngine, ResolveStorageDriver } from '@memberjunction/storage';

/** Registered under the name `ContentSourceType.DriverClass` already carries for this source type. */
@RegisterClass(BaseDiscoverDriver, 'AutotagCloudStorage')
export class CloudStorageDiscoverDriver extends BaseDiscoverDriver {
    public readonly Key = 'AutotagCloudStorage';

    public async *Discover(request: DiscoverRequest): AsyncIterable<DiscoveredItem> {
        const driver = await this.resolveProvider(request);
        const prefix = request.Parameters.Prefix ?? '';
        const listing = await driver.ListObjects(prefix);

        let found = 0;
        for (const object of listing.objects) {
            if (request.Signal.aborted) {
                return;
            }
            if (object.isDirectory) {
                continue;
            }
            yield {
                URL: object.fullPath,
                // The service's own version marker where it offers one; size and modified time are
                // the fallback for a provider that does not.
                Checksum: object.etag || `${object.size}:${object.lastModified?.getTime() ?? 0}`,
                Fields: [
                    { Field: 'Title', Value: object.name, Confidence: request.Confidence.DiscoveredTitle },
                    ...(object.lastModified ? [{ Field: 'Date' as const, Value: object.lastModified, Confidence: request.Confidence.DiscoveredDate }] : []),
                    ...(object.contentType
                        ? [{ Field: 'FileType' as const, Value: object.contentType, Confidence: request.Confidence.DiscoveredFileType }]
                        : []),
                ],
                Extensions: { Size: object.size, ContentType: object.contentType },
            };
            found++;
            if (found % 25 === 0) {
                request.ReportProgress(`listed ${found} object(s)`);
            }
        }
    }

    /**
     * The storage provider this source is configured for.
     *
     * `FileStorageProviderKey` is the field name the Cloud Storage source type already declares in
     * its `RequiredFields`, so an existing source needs no new configuration.
     */
    private async resolveProvider(request: DiscoverRequest) {
        const providerKey = request.Parameters.FileStorageProviderKey;
        if (!providerKey) {
            throw new Error(
                "This Cloud Storage source names no storage provider. Set FileStorageProviderKey in its type-specific configuration.",
            );
        }
        const engine = FileStorageEngine.Instance;
        await engine.Config(false, request.ContextUser, request.Provider);
        const provider =
            engine.GetProviderById(providerKey) ?? engine.Providers.find((p) => p.Name === providerKey);
        if (!provider) {
            throw new Error(`No file storage provider matches '${providerKey}'`);
        }
        const driver = ResolveStorageDriver(provider);
        // Not optional-chained: initialize() is required before any call, so if it ever goes away
        // this should fail here rather than quietly list nothing. Sources needing per-account
        // credentials rather than environment configuration use
        // InitializeDriverWithAccountCredentials instead.
        await driver.initialize();
        return driver;
    }
}
