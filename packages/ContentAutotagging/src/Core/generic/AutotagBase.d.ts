import { UserInfo } from '@memberjunction/core';
import { ContentSourceEntity, ContentItemEntity } from '@memberjunction/core-entities';
import { ContentDiscoveryResult } from '../../Engine/generic/process.types';
import { AutotagBaseEngine } from '../../Engine';
export declare abstract class AutotagBase {
    protected engine: AutotagBaseEngine;
    constructor();
    /**
     * Discovery phase: Find what items need processing without creating ContentItems yet
     * @param contentSources - Content sources to discover items from
     * @param contextUser - User context
     * @returns Array of items that need processing
     */
    abstract DiscoverContentToProcess(contentSources: ContentSourceEntity[], contextUser: UserInfo): Promise<ContentDiscoveryResult[]>;
    /**
     * Creation phase: Create/update single ContentItem with parsed text (no LLM processing)
     * @param discoveryItem - Discovery result identifying what to process
     * @param contextUser - User context
     * @returns Created/updated ContentItem with parsed text
     */
    abstract SetSingleContentItem(discoveryItem: ContentDiscoveryResult, contextUser: UserInfo): Promise<ContentItemEntity>;
    /**
     * Processing phase: Apply LLM processing to a single ContentItem
     * This method is generic and can be used by all subclasses
     * @param contentItem - ContentItem to process with LLM
     * @param contextUser - User context
     */
    TagSingleContentItem(contentItem: ContentItemEntity, contextUser: UserInfo): Promise<void>;
    /**
     * Legacy method: Bulk processing approach (kept for backward compatibility)
     */
    abstract SetContentItemsToProcess(contentSources: ContentSourceEntity[]): Promise<ContentItemEntity[]>;
    /**
     * Legacy method: Full autotag process (kept for backward compatibility)
     */
    abstract Autotag(contextUser: UserInfo): Promise<void>;
}
//# sourceMappingURL=AutotagBase.d.ts.map