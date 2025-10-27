import { UserInfo } from '@memberjunction/global';
import { ContentSourceEntity, ContentItemEntity } from '@memberjunction/core-entities';

export abstract class AutotagBase {
  public abstract SetContentItemsToProcess(contentSources: ContentSourceEntity[]): Promise<ContentItemEntity[]>;
  public abstract Autotag(contextUser: UserInfo): Promise<void>;
}
