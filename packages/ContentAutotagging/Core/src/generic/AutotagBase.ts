import { UserInfo } from '@memberjunction/core';
import { ContentSourceEntity, ContentItemEntity } from 'mj_generatedentities';

export abstract class AutotagBase {
    public abstract SetContentItemsToProcess(contentSources: ContentSourceEntity|ContentSourceEntity[]): Promise<ContentItemEntity[]>;
    public abstract Autotag(contextUser: UserInfo): Promise<void>;
}