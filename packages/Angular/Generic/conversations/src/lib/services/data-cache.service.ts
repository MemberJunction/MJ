import { Injectable } from '@angular/core';
import { ConversationEntity, ConversationDetailEntity } from '@memberjunction/core-entities';
import { Metadata, UserInfo, BaseEntity } from '@memberjunction/core';

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
  private conversations: ConversationEntity[] = [];
  private conversationDetails: ConversationDetailEntity[] = [];

  constructor() {}

  // =============================================================================
  // ConversationEntity Methods
  // =============================================================================

  /**
   * Get a ConversationEntity by ID from cache, or load it if not cached
   * @param id The conversation ID
   * @param currentUser User context for loading
   * @returns The cached or loaded ConversationEntity, or null if not found
   */
  async getConversation(id: string, currentUser: UserInfo): Promise<ConversationEntity | null> {
    // Check cache first
    const cached = this.conversations.find(c => c.ID === id);
    if (cached) {
      return cached;
    }

    // Not in cache - load from DB
    const md = new Metadata();
    const conversation = await md.GetEntityObject<ConversationEntity>('Conversations', currentUser);
    const loaded = await conversation.Load(id);

    if (loaded) {
      // Add to cache
      this.conversations.push(conversation);
      return conversation;
    }

    return null;
  }

  /**
   * Create a new ConversationEntity and automatically cache it
   * The cache is the ONLY place GetEntityObject() should be called
   * @param currentUser User context
   * @returns New ConversationEntity instance (already cached)
   */
  async createConversation(currentUser: UserInfo): Promise<ConversationEntity> {
    const md = new Metadata();
    const conversation = await md.GetEntityObject<ConversationEntity>('Conversations', currentUser);

    // Automatically add to cache - user code doesn't need to do anything
    // Note: Conversation has no ID yet (not saved), so we can't deduplicate
    // After Save(), the ID will be populated and future getConversation() calls will find it
    this.conversations.push(conversation);

    return conversation;
  }

  /**
   * Remove a ConversationEntity from the cache
   * @param id The conversation ID to remove
   */
  removeConversation(id: string): void {
    this.conversations = this.conversations.filter(c => c.ID !== id);
  }

  /**
   * Get all cached ConversationEntity objects (no DB call)
   * @returns Array of cached conversations
   */
  getCachedConversations(): ConversationEntity[] {
    return this.conversations;
  }

  // =============================================================================
  // ConversationDetailEntity Methods
  // =============================================================================

  /**
   * Get a ConversationDetailEntity by ID from cache, or load it if not cached
   * @param id The conversation detail ID
   * @param currentUser User context for loading
   * @returns The cached or loaded ConversationDetailEntity, or null if not found
   */
  async getConversationDetail(id: string, currentUser: UserInfo): Promise<ConversationDetailEntity | null> {
    // Check cache first
    const cached = this.conversationDetails.find(d => d.ID === id);
    if (cached) {
      return cached;
    }

    // Not in cache - load from DB
    const md = new Metadata();
    const detail = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', currentUser);
    const loaded = await detail.Load(id);

    if (loaded) {
      // Add to cache
      this.conversationDetails.push(detail);
      return detail;
    }

    return null;
  }

  /**
   * Create a new ConversationDetailEntity and automatically cache it
   * The cache is the ONLY place GetEntityObject() should be called
   * @param currentUser User context
   * @returns New ConversationDetailEntity instance (already cached)
   */
  async createConversationDetail(currentUser: UserInfo): Promise<ConversationDetailEntity> {
    const md = new Metadata();
    const detail = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', currentUser);

    // Automatically add to cache - user code doesn't need to do anything
    // Note: Detail has no ID yet (not saved), so we can't deduplicate
    // After Save(), the ID will be populated and future getConversationDetail() calls will find it

    detail.UserRating = 1 // TO-DO - temp fix for a BUG - remove this after 2.105.0 makes this field optional again, right now it requires a value even though column is nullable

    this.conversationDetails.push(detail);

    return detail;
  }

  /**
   * Load all ConversationDetail entities for a conversation and cache them
   * Used when loading a conversation's message history
   * @param conversationId The conversation ID
   * @param currentUser User context
   * @returns Array of ConversationDetailEntity objects
   */
  async loadConversationDetails(conversationId: string, currentUser: UserInfo): Promise<ConversationDetailEntity[]> {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 💾 DataCacheService.loadConversationDetails - Loading messages for conversation ${conversationId}`);

    const md = new Metadata();
    const rv = new (await import('@memberjunction/core')).RunView();

    console.log(`[${timestamp}] 💾 DataCacheService - Executing RunView for Conversation Details`);
    const result = await rv.RunView<ConversationDetailEntity>(
      {
        EntityName: 'Conversation Details',
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
        const existingIndex = this.conversationDetails.findIndex(d => d.ID === detail.ID);
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

  /**
   * Get all cached ConversationDetail entities for a conversation (no DB call)
   * @param conversationId The conversation ID
   * @returns Array of cached conversation details
   */
  getCachedConversationDetails(conversationId: string): ConversationDetailEntity[] {
    return this.conversationDetails.filter(d => d.ConversationID === conversationId);
  }

  /**
   * Remove a ConversationDetailEntity from the cache
   * @param id The conversation detail ID to remove
   */
  removeConversationDetail(id: string): void {
    this.conversationDetails = this.conversationDetails.filter(d => d.ID !== id);
  }

  // =============================================================================
  // Cache Management
  // =============================================================================

  /**
   * Clear all cached entities
   * Call when switching environments, users, or when needed
   */
  clear(): void {
    this.conversations = [];
    this.conversationDetails = [];
  }

  /**
   * Clear cached entities for a specific conversation
   * @param conversationId The conversation ID
   */
  clearConversation(conversationId: string): void {
    this.conversations = this.conversations.filter(c => c.ID !== conversationId);
    this.conversationDetails = this.conversationDetails.filter(d => d.ConversationID !== conversationId);
  }

  /**
   * Get cache statistics for debugging
   * @returns Object with cache sizes
   */
  getStats(): { conversations: number; conversationDetails: number } {
    return {
      conversations: this.conversations.length,
      conversationDetails: this.conversationDetails.length
    };
  }
}
