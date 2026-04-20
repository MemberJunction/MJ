import { UserInfo } from '@memberjunction/core';
import { MJContentSourceEntity, MJContentItemEntity } from '@memberjunction/core-entities';

/** Progress callback for per-item updates during autotagging */
export type AutotagProgressCallback = (processed: number, total: number, currentItem?: string) => void;

export abstract class AutotagBase {
    public abstract SetContentItemsToProcess(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]>;
    /**
     * Run autotagging for this source type.
     * @param contextUser - The user context for server-side operations
     * @param onProgress - Optional progress callback
     * @param contentSourceIDs - Optional filter: only process these specific source IDs. If omitted, processes all sources for this type.
     */
    /**
     * @returns the number of content items processed (new + retried)
     */
    public abstract Autotag(contextUser: UserInfo, onProgress?: AutotagProgressCallback, contentSourceIDs?: string[]): Promise<number>;
}