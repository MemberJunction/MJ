import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJContentSourceEntity, MJContentItemEntity } from '@memberjunction/core-entities';
import {
    AccessArtifact,
    DiscoverRequest,
    DiscoveredItem,
    LocatorFetchRequest,
    LocatorFetchResponse,
    SessionRequest,
} from '@memberjunction/content-pipeline-base';

/** Progress callback for per-item updates during autotagging */
export type AutotagProgressCallback = (processed: number, total: number, currentItem?: string) => void;

/**
 * The driver for one Content Source Type (`ContentSourceType.DriverClass`). The abstract members run
 * the autotagger; the optional ones are what the content pipeline calls.
 */
export abstract class AutotagBase {
    /** Optional provider override; falls back to Metadata.Provider when not set. */
    protected _provider?: IMetadataProvider;

    /** Returns the active provider — explicit override if set, otherwise the global default. */
    protected get ProviderToUse(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    public abstract SetContentItemsToProcess(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]>;
    /**
     * Run autotagging for this source type.
     * @param contextUser - The user context for server-side operations
     * @param onProgress - Optional progress callback
     * @param contentSourceIDs - Optional filter: only process these specific source IDs. If omitted, processes all sources for this type.
     * @param provider - Optional metadata provider override; defaults to Metadata.Provider
     * @returns the number of content items processed (new + retried)
     */
    public abstract Autotag(contextUser: UserInfo, onProgress?: AutotagProgressCallback, contentSourceIDs?: string[], provider?: IMetadataProvider): Promise<number>;

    /**
     * True when a driver's walk with `Since = null` is guaranteed to visit every live top-level item in the
     * source, so `Discover` in `Mode: 'Sync'` can safely mark unvisited items for deletion. Drivers backed by
     * bounded/windowed feeds (like RSS) leave this unset or `false`.
     */
    public readonly SupportsExhaustiveWalk?: boolean;

    /** Walk the source for the pipeline's Discover stage, yielding each item as it is found. */
    public Discover?(request: DiscoverRequest): AsyncIterable<DiscoveredItem>;

    /** Read the bytes behind a locator this driver yielded. Without it, Extract fetches the URL over HTTP. */
    public Fetch?(request: LocatorFetchRequest): Promise<LocatorFetchResponse>;

    /** Open a session for the source (headers, query parameters); the pipeline caches it per run. */
    public OpenSession?(request: SessionRequest): Promise<AccessArtifact | null>;
}
