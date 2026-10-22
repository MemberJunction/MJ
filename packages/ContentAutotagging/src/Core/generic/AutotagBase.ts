import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJContentSourceEntity, MJContentItemEntity } from '@memberjunction/core-entities';
import {
    DiscoverRequest,
    DiscoveredItem,
    LocatorFetchRequest,
    LocatorFetchResponse,
} from '@memberjunction/content-pipeline-base';

/** Progress callback for per-item updates during autotagging */
export type AutotagProgressCallback = (processed: number, total: number, currentItem?: string) => void;

/**
 * The driver for one Content Source Type (`ContentSourceType.DriverClass`).
 *
 * Legacy autotagger drivers implement {@link Autotag} and {@link SetContentItemsToProcess}; pipeline
 * drivers implement {@link Discover} and optionally {@link Fetch} (new pipeline-only drivers do not
 * need to override the legacy methods).
 */
export abstract class AutotagBase {
    /** Optional provider override; falls back to Metadata.Provider when not set. */
    protected _provider?: IMetadataProvider;

    /** Returns the active provider — explicit override if set, otherwise the global default. */
    protected get ProviderToUse(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * @deprecated Legacy autotagger entry point. Implement {@link Discover} and optionally {@link Fetch}
     * for the Content Pipeline Framework (`@memberjunction/content-pipeline`).
     */
    public async SetContentItemsToProcess(_contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]> {
        throw new Error(`${this.constructor.name} is a Content Pipeline source driver and does not implement legacy SetContentItemsToProcess.`);
    }

    /**
     * Run autotagging for this source type.
     *
     * @deprecated Legacy autotagger entry point. Implement {@link Discover} and optionally {@link Fetch}
     * for the Content Pipeline Framework (`@memberjunction/content-pipeline`).
     * @param contextUser - The user context for server-side operations
     * @param onProgress - Optional progress callback
     * @param contentSourceIDs - Optional filter: only process these specific source IDs. If omitted, processes all sources for this type.
     * @param provider - Optional metadata provider override; defaults to Metadata.Provider
     * @returns the number of content items processed (new + retried)
     */
    public async Autotag(_contextUser: UserInfo, _onProgress?: AutotagProgressCallback, _contentSourceIDs?: string[], _provider?: IMetadataProvider): Promise<number> {
        throw new Error(`${this.constructor.name} is a Content Pipeline source driver and does not implement legacy Autotag.`);
    }

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
}
