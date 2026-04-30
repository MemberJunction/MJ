import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJContentSourceEntity, MJContentItemEntity } from '@memberjunction/core-entities';

/** Progress callback for per-item updates during autotagging */
export type AutotagProgressCallback = (processed: number, total: number, currentItem?: string) => void;

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
     */
    /**
     * @returns the number of content items processed (new + retried)
     */
    public abstract Autotag(contextUser: UserInfo, onProgress?: AutotagProgressCallback, contentSourceIDs?: string[], provider?: IMetadataProvider): Promise<number>;
}