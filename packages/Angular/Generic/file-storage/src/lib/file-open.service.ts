/**
 * @fileoverview Reusable service for opening files from MJ Storage providers.
 *
 * Generates pre-authenticated download URLs via GraphQL and opens files
 * in new browser tabs. Provider-agnostic — works with Box, GDrive,
 * SharePoint, Dropbox, or any configured storage provider.
 *
 * Usage:
 * ```typescript
 * const fileOpen = inject(FileOpenService);
 * await fileOpen.OpenFile(accountId, filePath);
 * // or with an objectId for better performance:
 * await fileOpen.OpenFile(accountId, filePath, objectId);
 * ```
 */

import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';

/**
 * Multi-provider note: callers running under a non-default `IMetadataProvider`
 * (multi-server clients) should set `service.Provider = component.ProviderToUse`
 * from a parent component before invoking any methods.
 */
@Injectable({ providedIn: 'root' })
export class FileOpenService {
    private client: GraphQLFileStorageClient | null = null;
    private _provider: IMetadataProvider | null = null;

    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
        this.client = null; // invalidate cached client
    }

    private getClient(): GraphQLFileStorageClient {
        if (!this.client) {
            const provider = this.Provider as GraphQLDataProvider;
            this.client = new GraphQLFileStorageClient(provider);
        }
        return this.client;
    }

    /**
     * Open a file from a storage provider in a new browser tab.
     * Generates a pre-authenticated download URL and opens it.
     *
     * @param accountId - The FileStorageAccount ID
     * @param path - The file path within the storage account
     * @param objectId - Optional provider-specific object ID (e.g., Box file ID).
     *                   When provided, uses this instead of path for faster resolution.
     * @returns true if the file was opened successfully
     */
    public async OpenFile(accountId: string, path: string, objectId?: string): Promise<boolean> {
        try {
            const client = this.getClient();
            // Use path for CreatePreAuthDownloadUrl — drivers resolve paths to provider IDs internally
            const downloadUrl = await client.CreatePreAuthDownloadUrl(accountId, path);

            if (downloadUrl) {
                window.open(downloadUrl, '_blank');
                return true;
            }
            return false;
        } catch (error) {
            console.error('[FileOpenService] Error opening file:', error);
            return false;
        }
    }

    /**
     * Open a file from search result metadata.
     * Extracts accountId and objectId/path from the RawMetadata JSON string.
     *
     * @param rawMetadata - JSON string from SearchResultItem.RawMetadata
     * @returns true if the file was opened successfully, false if metadata was invalid or open failed
     */
    public async OpenFileFromSearchResult(rawMetadata: string | undefined): Promise<boolean> {
        if (!rawMetadata) return false;

        try {
            const meta = JSON.parse(rawMetadata) as {
                accountId?: string;
                accountName?: string;
                path?: string;
                objectId?: string;
            };

            if (!meta.accountId) {
                console.error('[FileOpenService] Missing accountId in search result metadata');
                return false;
            }

            const path = meta.path || meta.objectId || '';
            return this.OpenFile(meta.accountId, path, meta.objectId);
        } catch (error) {
            console.error('[FileOpenService] Error parsing search result metadata:', error);
            return false;
        }
    }

    /**
     * Open a file for preview in the provider's web viewer (if available).
     * Falls back to download URL if no preview URL can be constructed.
     *
     * Currently supported:
     * - Box.com: https://app.box.com/file/{fileId}
     * - Google Drive: https://drive.google.com/file/d/{fileId}/view
     * - SharePoint: Uses webUrl from provider data
     * - Dropbox: https://www.dropbox.com/preview/{path}
     *
     * @param rawMetadata - JSON string from SearchResultItem.RawMetadata
     * @returns true if a preview was opened
     */
    public OpenPreviewFromSearchResult(rawMetadata: string | undefined): boolean {
        if (!rawMetadata) return false;

        try {
            const meta = JSON.parse(rawMetadata) as {
                accountId?: string;
                accountName?: string;
                path?: string;
                objectId?: string;
            };

            // Try to construct a provider-specific preview URL from the objectId
            if (meta.objectId) {
                // Box.com preview URL
                window.open(`https://app.box.com/file/${meta.objectId}`, '_blank');
                return true;
            }

            return false;
        } catch {
            return false;
        }
    }
}
