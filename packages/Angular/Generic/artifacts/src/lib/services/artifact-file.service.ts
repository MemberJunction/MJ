import { Injectable } from '@angular/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { DocumentLiveBlockEngine } from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/** Maximum number of URL entries to keep in the in-memory cache. */
const CACHE_MAX_SIZE = 20;

/** Maximum lifetime for cached pre-authenticated download URLs (10 minutes). */
export const ARTIFACT_FILE_URL_CACHE_TTL_MS = 10 * 60 * 1000;

interface CachedUrlEntry {
    Url: string;
    CachedAt: number;
}

interface ArtifactFileGraphQLPayload {
    ArtifactFileDownloadUrl?: string;
    MJFile?: {
        DownloadUrl?: string | null;
    } | null;
}

interface GraphQLExecutorProvider {
    ExecuteGQL: (
        query: string,
        variables?: Record<string, string | number | boolean | null>,
    ) => Promise<ArtifactFileGraphQLPayload>;
}

const FILE_DOWNLOAD_URL_QUERY = `
    query FileDownloadUrl($FileID: String!) {
        MJFile(ID: $FileID) {
            DownloadUrl
        }
    }
`;

let clientFileBytesLoaderRegistered = false;

function hasExecuteGQL(provider: IMetadataProvider | null | undefined): provider is IMetadataProvider & GraphQLExecutorProvider {
    if (!provider) {
        return false;
    }
    const candidate = provider as IMetadataProvider & Partial<GraphQLExecutorProvider>;
    return typeof candidate.ExecuteGQL === 'function';
}

function parseSafeDownloadHttpUrl(rawUrl: string | null | undefined): string | null {
    if (!rawUrl || !rawUrl.trim()) {
        return null;
    }
    try {
        const parsed = new URL(rawUrl.trim());
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.toString();
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Client-side loader callback registered with {@link DocumentLiveBlockEngine.RegisterArtifactFileBytesLoader}
 * so client live blocks (`Embed`, `=MJ.IMPORTRANGE`) targeting `ContentMode = 'File'` artifacts can fetch
 * `MJ: Files` bytes via pre-authenticated download URLs.
 */
export async function LoadClientArtifactFileBytes(
    fileId: string,
    _user: UserInfo,
    provider: IMetadataProvider,
): Promise<Uint8Array | ArrayBuffer | null> {
    if (!fileId || !fileId.trim() || typeof fetch !== 'function') {
        return null;
    }
    const gqlResult = (
        hasExecuteGQL(provider)
            ? await provider.ExecuteGQL(FILE_DOWNLOAD_URL_QUERY, { FileID: fileId })
            : await GraphQLDataProvider.ExecuteGQL(FILE_DOWNLOAD_URL_QUERY, { FileID: fileId })
    ) as ArtifactFileGraphQLPayload | null | undefined;
    const safeUrl = parseSafeDownloadHttpUrl(gqlResult?.MJFile?.DownloadUrl);
    if (!safeUrl) {
        return null;
    }
    const response = await fetch(safeUrl);
    if (!response.ok) {
        return null;
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
}

/**
 * Registers {@link LoadClientArtifactFileBytes} on {@link DocumentLiveBlockEngine.Instance} once per client
 * runtime (or immediately when `force = true`).
 */
export function RegisterClientArtifactFileBytesLoader(force = false): void {
    if (clientFileBytesLoaderRegistered && !force) {
        return;
    }
    clientFileBytesLoaderRegistered = true;
    DocumentLiveBlockEngine.Instance.RegisterArtifactFileBytesLoader(LoadClientArtifactFileBytes);
}

/**
 * Service for fetching pre-authenticated download URLs for file-mode artifact versions.
 *
 * URLs are cached in a bounded LRU-style Map with a 10-minute TTL (evicts expired or
 * oldest entries once capacity is reached) to avoid repeated round-trips or stale signed URLs.
 */
@Injectable({
    providedIn: 'root'
})
export class ArtifactFileService {

    private readonly urlCache = new Map<string, CachedUrlEntry>();

    private static readonly DOWNLOAD_URL_QUERY = `
        query ArtifactFileDownloadUrl($artifactVersionId: String!) {
            ArtifactFileDownloadUrl(artifactVersionId: $artifactVersionId)
        }
    `;

    /**
     * Returns a pre-authenticated download URL for the given artifact version.
     * Results are cached; pass `forceRefresh=true` to bypass the cache.
     */
    public async GetDownloadUrl(
        artifactVersionId: string,
        forceRefresh = false,
        provider?: IMetadataProvider | null,
    ): Promise<string> {
        if (!forceRefresh) {
            const cached = this.urlCache.get(artifactVersionId);
            if (cached) {
                if (Date.now() - cached.CachedAt < ARTIFACT_FILE_URL_CACHE_TTL_MS) {
                    // Refresh LRU position
                    this.urlCache.delete(artifactVersionId);
                    this.urlCache.set(artifactVersionId, cached);
                    return cached.Url;
                }
                this.urlCache.delete(artifactVersionId);
            }
        }

        const result = (
            hasExecuteGQL(provider)
                ? await provider.ExecuteGQL(ArtifactFileService.DOWNLOAD_URL_QUERY, { artifactVersionId })
                : await GraphQLDataProvider.ExecuteGQL(ArtifactFileService.DOWNLOAD_URL_QUERY, { artifactVersionId })
        ) as { ArtifactFileDownloadUrl?: string };

        const url = result?.ArtifactFileDownloadUrl;
        if (!url) {
            throw new Error(`Failed to get download URL for artifact version ${artifactVersionId}`);
        }

        this.cacheUrl(artifactVersionId, url);
        return url;
    }

    /** @deprecated Use {@link GetDownloadUrl}. */
    public async getDownloadUrl(artifactVersionId: string, forceRefresh = false): Promise<string> {
        return this.GetDownloadUrl(artifactVersionId, forceRefresh);
    }

    /** Store a URL, evicting expired or oldest entries if the cache is at capacity. */
    private cacheUrl(key: string, url: string): void {
        const now = Date.now();
        if (this.urlCache.has(key)) {
            this.urlCache.delete(key);
        } else if (this.urlCache.size >= CACHE_MAX_SIZE) {
            for (const [entryKey, entryVal] of this.urlCache.entries()) {
                if (now - entryVal.CachedAt >= ARTIFACT_FILE_URL_CACHE_TTL_MS) {
                    this.urlCache.delete(entryKey);
                }
            }
            if (this.urlCache.size >= CACHE_MAX_SIZE) {
                const oldestKey = this.urlCache.keys().next().value;
                if (oldestKey !== undefined) {
                    this.urlCache.delete(oldestKey);
                }
            }
        }
        this.urlCache.set(key, { Url: url, CachedAt: now });
    }

    /** Pre-fetch and cache a URL without awaiting in the calling context. */
    public Prefetch(artifactVersionId: string, provider?: IMetadataProvider | null): void {
        this.GetDownloadUrl(artifactVersionId, false, provider).catch(() => {
            // Prefetch failures are silently ignored — the component will retry on display
        });
    }

    /** @deprecated Use {@link Prefetch}. */
    public prefetch(artifactVersionId: string): void {
        return this.Prefetch(artifactVersionId);
    }

    /**
     * Converts a `data:` URI (base64 or URL-encoded text) to an ArrayBuffer.
     * Used by viewers to handle inline artifact content (ContentMode='Text').
     */
    public DataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
        const commaIndex = dataUrl.indexOf(',');
        const header = commaIndex >= 0 ? dataUrl.slice(0, commaIndex).toLowerCase() : '';
        const payload = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
        if (commaIndex >= 0 && !header.includes(';base64')) {
            const decodedText = decodeURIComponent(payload);
            const encodedBytes = new TextEncoder().encode(decodedText);
            return encodedBytes.buffer.slice(
                encodedBytes.byteOffset,
                encodedBytes.byteOffset + encodedBytes.byteLength,
            );
        }
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /** @deprecated Use {@link DataUrlToArrayBuffer}. */
    public dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
        return this.DataUrlToArrayBuffer(dataUrl);
    }

    /**
     * Converts a base64 data URL to an object URL suitable for download/display.
     * Used by viewers to create downloadable links for inline artifacts.
     */
    public DataUrlToObjectUrl(dataUrl: string, mimeType: string): string {
        const arrayBuffer = this.DataUrlToArrayBuffer(dataUrl);
        const blob = new Blob([arrayBuffer], { type: mimeType });
        return URL.createObjectURL(blob);
    }

    /** @deprecated Use {@link DataUrlToObjectUrl}. */
    public dataUrlToObjectUrl(dataUrl: string, mimeType: string): string {
        return this.DataUrlToObjectUrl(dataUrl, mimeType);
    }
}
