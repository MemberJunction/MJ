import { UserInfo } from '@memberjunction/core';
import { MJContentSourceEntity, MJContentItemEntity } from '@memberjunction/core-entities';

export abstract class AutotagBase {
    public abstract SetContentItemsToProcess(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]>;
    public abstract Autotag(contextUser: UserInfo): Promise<void>;
}