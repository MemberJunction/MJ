import { Injectable } from '@angular/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/** Maximum number of URL entries to keep in the in-memory cache. */
const CACHE_MAX_SIZE = 20;

/**
 * Service for fetching pre-authenticated download URLs for file-mode artifact versions.
 *
 * URLs are cached in a bounded LRU-style Map (evicts oldest entry once the cap is reached)
 * to avoid repeated round-trips for the same version within a session.
 */
@Injectable({
    providedIn: 'root'
})
export class ArtifactFileService {

    private readonly urlCache = new Map<string, string>();

    private static readonly DOWNLOAD_URL_QUERY = `
        query ArtifactFileDownloadUrl($artifactVersionId: String!) {
            ArtifactFileDownloadUrl(artifactVersionId: $artifactVersionId)
        }
    `;

    /**
     * Returns a pre-authenticated download URL for the given artifact version.
     * Results are cached; pass `forceRefresh=true` to bypass the cache.
     */
    public async getDownloadUrl(artifactVersionId: string, forceRefresh = false): Promise<string> {
        if (!forceRefresh) {
            const cached = this.urlCache.get(artifactVersionId);
            if (cached) {
                return cached;
            }
        }

        const result = await GraphQLDataProvider.ExecuteGQL(
            ArtifactFileService.DOWNLOAD_URL_QUERY,
            { artifactVersionId },
        ) as { ArtifactFileDownloadUrl?: string };

        const url = result?.ArtifactFileDownloadUrl;
        if (!url) {
            throw new Error(`Failed to get download URL for artifact version ${artifactVersionId}`);
        }

        this.cacheUrl(artifactVersionId, url);
        return url;
    }

    /** Store a URL, evicting the oldest entry if the cache is at capacity. */
    private cacheUrl(key: string, url: string): void {
        if (this.urlCache.size >= CACHE_MAX_SIZE) {
            // Map preserves insertion order; delete the first (oldest) entry
            const oldestKey = this.urlCache.keys().next().value;
            if (oldestKey !== undefined) {
                this.urlCache.delete(oldestKey);
            }
        }
        this.urlCache.set(key, url);
    }

    /** Pre-fetch and cache a URL without awaiting in the calling context. */
    public prefetch(artifactVersionId: string): void {
        this.getDownloadUrl(artifactVersionId).catch(() => {
            // Prefetch failures are silently ignored — the component will retry on display
        });
    }

    /**
     * Converts a base64 data URL (data:mime;base64,...) to an ArrayBuffer.
     * Used by viewers to handle inline artifact content (ContentMode='Text').
     */
    public dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
        const commaIndex = dataUrl.indexOf(',');
        const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Converts a base64 data URL to an object URL suitable for download/display.
     * Used by viewers to create downloadable links for inline artifacts.
     */
    public dataUrlToObjectUrl(dataUrl: string, mimeType: string): string {
        const arrayBuffer = this.dataUrlToArrayBuffer(dataUrl);
        const blob = new Blob([arrayBuffer], { type: mimeType });
        return URL.createObjectURL(blob);
    }
}
