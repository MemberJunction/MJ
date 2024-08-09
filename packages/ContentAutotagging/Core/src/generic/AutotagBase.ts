import { ContentSourceEntity, ContentItemEntity } from 'mj_generatedentities';

export abstract class AutotagBase {
    public abstract SetContentItemsToProcess(contentSources: ContentSourceEntity|ContentSourceEntity[]): Promise<ContentItemEntity[]>;
    public abstract Autotag(contentSourceItems: ContentItemEntity[]): Promise<void>;
}