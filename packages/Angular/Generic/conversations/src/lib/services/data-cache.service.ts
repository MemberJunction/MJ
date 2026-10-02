import { Injectable } from '@angular/core';
import { MJConversationEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { Metadata, UserInfo, BaseEntity, RunView, IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Global singleton cache for conversation-related entities.
 * Maintains single instances of entities to prevent race conditions and ensure
 * all components see the same object state.
 *
 * Pattern: Instead of creating new entity instances with GetEntityObject() everywhere,
 * request entities from this cache. The cache returns the same instance each time,
 * so when one component updates entity.Status = 'Complete', all other components
 * see that change immediately without needing to reload from the database.
 */
@Injectable({
  providedIn: 'root'
})
export class DataCacheService {
  // Separate arrays for each entity type
  private conversations: MJConversationEntity[] = [];
  private conversationDetails: MJConversationDetailEntity[] = [];

  private _provider: IMetadataProvider | null = null;

  constructor() {}

  /**
   * Set the metadata provider this service should use. When unset, falls back to Metadata.Provider.
   */
  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }

  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
  }

  // =============================================================================
  // MJConversationEntity Methods
  // =============================================================================

  /**
   * Get a MJConversationEntity by ID from cache, or load it if not cached
   * @param id The conversation ID
   * @param currentUser User context for loading
   * @returns The cached or loaded MJConversationEntity, or null if not found
   */
  async GetConversation(id: string, currentUser: UserInfo): Promise<MJConversationEntity | null> {
    // Check cache first
    const cached = this.conversations.find(c => UUIDsEqual(c.ID, id));
    if (cached) {
      return cached;
    }

    // Not in cache - load from DB
    const md = this.Provider;
    const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', currentUser);
    const loaded = await conversation.Load(id);

    if (loaded) {
      // Add to cache
      this.conversations.push(conversation);
      return conversation;
    }

    return null;
  }

  /** @deprecated Use {@link GetConversation}. */
  async getConversation(id: string, currentUser: UserInfo): Promise<MJConversationEntity | null> {
    return this.GetConversation(id, currentUser);
  }

  /**
   * Create a new MJConversationEntity and automatically cache it
   * The cache is the ONLY place GetEntityObject() should be called
   * @param currentUser User context
   * @returns New MJConversationEntity instance (already cached)
   */
  async CreateConversation(currentUser: UserInfo): Promise<MJConversationEntity> {
    const md = this.Provider;
    const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', currentUser);

    // Automatically add to cache - user code doesn't need to do anything
    // Note: Conversation has no ID yet (not saved), so we can't deduplicate
    // After Save(), the ID will be populated and future getConversation() calls will find it
    this.conversations.push(conversation);

    return conversation;
  }

  /** @deprecated Use {@link CreateConversation}. */
  async createConversation(currentUser: UserInfo): Promise<MJConversationEntity> {
    return this.CreateConversation(currentUser);
  }

  /**
   * Remove a MJConversationEntity from the cache
   * @param id The conversation ID to remove
   */
  RemoveConversation(id: string): void {
    this.conversations = this.conversations.filter(c => !UUIDsEqual(c.ID, id));
  }

  /** @deprecated Use {@link RemoveConversation}. */
  removeConversation(id: string): void {
    return this.RemoveConversation(id);
  }

  /**
   * Get all cached MJConversationEntity objects (no DB call)
   * @returns Array of cached conversations
   */
  GetCachedConversations(): MJConversationEntity[] {
    return this.conversations;
  }

  /** @deprecated Use {@link GetCachedConversations}. */
  getCachedConversations(): MJConversationEntity[] {
    return this.GetCachedConversations();
  }

  // =============================================================================
  // MJConversationDetailEntity Methods
  // =============================================================================

  /**
   * Get a MJConversationDetailEntity by ID from cache, or load it if not cached
   * @param id The conversation detail ID
   * @param currentUser User context for loading
   * @returns The cached or loaded MJConversationDetailEntity, or null if not found
   */
  async GetConversationDetail(id: string, currentUser: UserInfo): Promise<MJConversationDetailEntity | null> {
    // Check cache first
    const cached = this.conversationDetails.find(d => UUIDsEqual(d.ID, id));
    if (cached) {
      return cached;
    }

    // Not in cache - load from DB
    const md = this.Provider;
    const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', currentUser);
    const loaded = await detail.Load(id);

    if (loaded) {
      // Add to cache
      this.conversationDetails.push(detail);
      return detail;
    }

    return null;
  }

  /** @deprecated Use {@link GetConversationDetail}. */
  async getConversationDetail(id: string, currentUser: UserInfo): Promise<MJConversationDetailEntity | null> {
    return this.GetConversationDetail(id, currentUser);
  }

  /**
   * Create a new MJConversationDetailEntity and automatically cache it
   * The cache is the ONLY place GetEntityObject() should be called
   * @param currentUser User context
   * @returns New MJConversationDetailEntity instance (already cached)
   */
  async CreateConversationDetail(currentUser: UserInfo): Promise<MJConversationDetailEntity> {
    const md = this.Provider;
    const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', currentUser);

    // Automatically add to cache - user code doesn't need to do anything
    // Note: Detail has no ID yet (not saved), so we can't deduplicate
    // After Save(), the ID will be populated and future getConversationDetail() calls will find it

    this.conversationDetails.push(detail);

    return detail;
  }

  /** @deprecated Use {@link CreateConversationDetail}. */
  async createConversationDetail(currentUser: UserInfo): Promise<MJConversationDetailEntity> {
    return this.CreateConversationDetail(currentUser);
  }

  /**
   * Load all ConversationDetail entities for a conversation and cache them
   * Used when loading a conversation's message history
   * @param conversationId The conversation ID
   * @param currentUser User context
   * @returns Array of MJConversationDetailEntity objects
   */
  async LoadConversationDetails(conversationId: string, currentUser: UserInfo): Promise<MJConversationDetailEntity[]> {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 💾 DataCacheService.loadConversationDetails - Loading messages for conversation ${conversationId}`);

    const rv = RunView.FromMetadataProvider(this.Provider);

    console.log(`[${timestamp}] 💾 DataCacheService - Executing RunView for Conversation Details`);
    const result = await rv.RunView<MJConversationDetailEntity>(
      {
        EntityName: 'MJ: Conversation Details',
        ExtraFilter: `ConversationID='${conversationId}'`,
        OrderBy: '__mj_CreatedAt ASC',
        ResultType: 'entity_object'
      },
      currentUser
    );

    if (result.Success) {
      const details = result.Results || [];
      console.log(`[${timestamp}] 💾 DataCacheService - Loaded ${details.length} message(s) for conversation ${conversationId}`);

      // Add all to cache (avoid duplicates by checking ID)
      for (const detail of details) {
        const existingIndex = this.conversationDetails.findIndex(d => UUIDsEqual(d.ID, detail.ID));
        if (existingIndex >= 0) {
          // Replace existing (ensures we keep the same object reference)
          this.conversationDetails[existingIndex] = detail;
        } else {
          // Add new
          this.conversationDetails.push(detail);
        }
      }

      return details;
    }

    console.log(`[${timestamp}] 💾 DataCacheService - Failed to load messages for conversation ${conversationId}`);
    return [];
  }

  /** @deprecated Use {@link LoadConversationDetails}. */
  async loadConversationDetails(conversationId: string, currentUser: UserInfo): Promise<MJConversationDetailEntity[]> {
    return this.LoadConversationDetails(conversationId, currentUser);
  }

  /**
   * Get all cached ConversationDetail entities for a conversation (no DB call)
   * @param conversationId The conversation ID
   * @returns Array of cached conversation details
   */
  GetCachedConversationDetails(conversationId: string): MJConversationDetailEntity[] {
    return this.conversationDetails.filter(d => UUIDsEqual(d.ConversationID, conversationId));
  }

  /** @deprecated Use {@link GetCachedConversationDetails}. */
  getCachedConversationDetails(conversationId: string): MJConversationDetailEntity[] {
    return this.GetCachedConversationDetails(conversationId);
  }

  /**
   * Remove a MJConversationDetailEntity from the cache
   * @param id The conversation detail ID to remove
   */
  RemoveConversationDetail(id: string): void {
    this.conversationDetails = this.conversationDetails.filter(d => !UUIDsEqual(d.ID, id));
  }

  /** @deprecated Use {@link RemoveConversationDetail}. */
  removeConversationDetail(id: string): void {
    return this.RemoveConversationDetail(id);
  }

  // =============================================================================
  // Cache Management
  // =============================================================================

  /**
   * Refresh entity data by clearing cached entities of a specific type
   * This forces a reload from the database on next access
   * @param entityName The entity name to refresh (e.g., 'Conversations', 'MJ: Conversation Details')
   */
  async RefreshEntity(entityName: string): Promise<void> {
    switch (entityName) {
      case 'Conversations':
        this.conversations = [];
        break;
      case 'MJ: Conversation Details':
        this.conversationDetails = [];
        break;
      default:
        console.warn('Unknown entity name for refresh:', entityName);
    }
  }

  /** @deprecated Use {@link RefreshEntity}. */
  async refreshEntity(entityName: string): Promise<void> {
    return this.RefreshEntity(entityName);
  }

  /**
   * Refresh a specific cache by name
   * This method can be extended to handle different cache types
   * @param cacheName The cache name ('Core', 'AI', 'Actions')
   */
  async RefreshCache(cacheName: 'Core' | 'AI' | 'Actions'): Promise<void> {
    switch (cacheName) {
      case 'Core':
        // Clear core entity caches
        this.Clear();
        break;
      case 'AI':
        // AI-specific cache refresh would go here
        // For now, just log it
        console.log('AI cache refresh requested (not yet implemented)');
        break;
      case 'Actions':
        // Actions-specific cache refresh would go here
        console.log('Actions cache refresh requested (not yet implemented)');
        break;
      default:
        console.warn('Unknown cache name for refresh:', cacheName);
    }
  }

  /** @deprecated Use {@link RefreshCache}. */
  async refreshCache(cacheName: 'Core' | 'AI' | 'Actions'): Promise<void> {
    return this.RefreshCache(cacheName);
  }

  /**
   * Clear all cached entities
   * Call when switching environments, users, or when needed
   */
  Clear(): void {
    this.conversations = [];
    this.conversationDetails = [];
  }

  /** @deprecated Use {@link Clear}. */
  clear(): void {
    return this.Clear();
  }

  /**
   * Clear cached entities for a specific conversation
   * @param conversationId The conversation ID
   */
  ClearConversation(conversationId: string): void {
    this.conversations = this.conversations.filter(c => !UUIDsEqual(c.ID, conversationId));
    this.conversationDetails = this.conversationDetails.filter(d => !UUIDsEqual(d.ConversationID, conversationId));
  }

  /** @deprecated Use {@link ClearConversation}. */
  clearConversation(conversationId: string): void {
    return this.ClearConversation(conversationId);
  }

  /**
   * Get cache statistics for debugging
   * @returns Object with cache sizes
   */
  GetStats(): { conversations: number; conversationDetails: number } {
    return {
      conversations: this.conversations.length,
      conversationDetails: this.conversationDetails.length
    };
  }

  /** @deprecated Use {@link GetStats}. */
  getStats(): { conversations: number; conversationDetails: number } {
    return this.GetStats();
  }
}
