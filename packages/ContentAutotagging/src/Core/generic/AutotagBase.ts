import { UserInfo } from '@memberjunction/core';
import { ContentSourceEntity, ContentItemEntity } from '@memberjunction/core-entities';
import { ContentDiscoveryResult } from '../../Engine/generic/process.types';
import { AutotagBaseEngine } from '../../Engine';

export abstract class AutotagBase {
    protected engine: AutotagBaseEngine;
    
    constructor() {
        this.engine = AutotagBaseEngine.Instance;
    }

    // NEW CLOUD-FRIENDLY METHODS
    
    /**
     * Discovery phase: Find what items need processing without creating ContentItems yet
     * @param contentSources - Content sources to discover items from
     * @param contextUser - User context
     * @returns Array of items that need processing
     */
    public abstract DiscoverContentToProcess(
        contentSources: ContentSourceEntity[], 
        contextUser: UserInfo
    ): Promise<ContentDiscoveryResult[]>;
    
    /**
     * Creation phase: Create/update single ContentItem with parsed text (no LLM processing)
     * @param discoveryItem - Discovery result identifying what to process
     * @param contextUser - User context
     * @returns Created/updated ContentItem with parsed text
     */
    public abstract SetSingleContentItem(
        discoveryItem: ContentDiscoveryResult, 
        contextUser: UserInfo
    ): Promise<ContentItemEntity>;
    
    /**
     * Processing phase: Apply LLM processing to a single ContentItem
     * This method is generic and can be used by all subclasses
     * @param contentItem - ContentItem to process with LLM
     * @param contextUser - User context
     * @param protectedFields - Array of ContentItem field names that should not be updated (e.g., ['Name', 'Description'])
     * @param forceVisionProcessing - Optional flag to force vision model processing for PDF items
     */
    public async TagSingleContentItem(
        contentItem: ContentItemEntity, 
        contextUser: UserInfo,
        protectedFields?: string[],
        forceVisionProcessing?: boolean
    ): Promise<void> {
        // Auto-detect vision processing from environment if not explicitly set
        const shouldForceVision = forceVisionProcessing ?? this.shouldAutoForceVisionProcessing();
        
        const contentItems = [contentItem];
        await this.engine.ExtractTextAndProcessWithLLM(contentItems, contextUser, protectedFields, shouldForceVision);
    }

    /**
     * Check if vision processing should be automatically forced based on environment
     */
    private shouldAutoForceVisionProcessing(): boolean {
        const envForceVision = process.env.FORCE_VISION_PROCESSING;
        return envForceVision && (envForceVision.toLowerCase() === 'true' || envForceVision === '1');
    }

    // LEGACY METHODS (for backward compatibility)
    
    /**
     * Legacy method: Bulk processing approach (kept for backward compatibility)
     */
    public abstract SetContentItemsToProcess(contentSources: ContentSourceEntity[]): Promise<ContentItemEntity[]>;
    
    /**
     * Legacy method: Full autotag process (kept for backward compatibility)
     */
    public abstract Autotag(contextUser: UserInfo): Promise<void>;
}