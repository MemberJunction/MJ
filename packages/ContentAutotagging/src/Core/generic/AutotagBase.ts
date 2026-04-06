import { UserInfo } from '@memberjunction/core';
import { MJContentSourceEntity, MJContentItemEntity } from '@memberjunction/core-entities';

/** Progress callback for per-item updates during autotagging */
export type AutotagProgressCallback = (processed: number, total: number, currentItem?: string) => void;

export abstract class AutotagBase {
    public abstract SetContentItemsToProcess(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]>;
    public abstract Autotag(contextUser: UserInfo, onProgress?: AutotagProgressCallback): Promise<void>;
}