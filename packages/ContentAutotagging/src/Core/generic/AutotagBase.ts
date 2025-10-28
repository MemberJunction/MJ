import { UserInfo } from '@memberjunction/core';
import { ContentSourceEntity, ContentItemEntity } from '@memberjunction/core-entities';

export abstract class AutotagBase {
    public abstract SetContentItemsToProcess(contentSources: ContentSourceEntity[]): Promise<ContentItemEntity[]>;
    public abstract Autotag(contextUser: UserInfo): Promise<void>;
}