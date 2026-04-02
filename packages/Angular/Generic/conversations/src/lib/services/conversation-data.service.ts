import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { MJConversationEntity, ConversationEngine } from '@memberjunction/core-entities';
import { Metadata, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Shared data service for conversations.
 * Thin Angular adapter that delegates to ConversationEngine (the single source of truth)
 * for data loading and CRUD, while keeping UI-specific filtering/sorting logic here.
 *
 * Selection state (which conversation is active) is managed by parent components locally.
 * This architecture enables multiple conversation panels to coexist (e.g., in tabs)
 * without conflicting over which conversation is "active".
 */
@Injectable({
  providedIn: 'root'
})
export class ConversationDataService implements OnDestroy {
  private engine = ConversationEngine.Instance;
  private subscription: Subscription;

  /**
   * The list of conversations — kept in sync with ConversationEngine.Conversations$.
   * Components that read this property directly (non-reactive) still work unchanged.
   */
  public conversations: MJConversationEntity[] = [];

  /**
   * Observable for conversation list changes (reactive).
   * Delegates to ConversationEngine.Conversations$.
   */
  public readonly conversations$: Observable<MJConversationEntity[]> = this.engine.Conversations$;

  // Search query for filtering - shared across sidebars
  public searchQuery: string = '';

  // Loading state
  public isLoading: boolean = false;

  constructor() {
    // Keep the local `conversations` array in sync with the engine's reactive stream
    this.subscription = this.engine.Conversations$.subscribe(convos => {
      this.conversations = convos;
    });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  /**
   * Gets a conversation by ID
   * @param id The conversation ID
   * @returns The conversation entity or null if not found
   */
  getConversationById(id: string): MJConversationEntity | null {
    return this.conversations.find(c => UUIDsEqual(c.ID, id)) || null;
  }

  /**
   * Gets filtered conversations based on search query
   */
  get filteredConversations(): MJConversationEntity[] {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      return this.conversations;
    }
    const lowerQuery = this.searchQuery.toLowerCase();
    return this.conversations.filter(c =>
      (c.Name?.toLowerCase().includes(lowerQuery)) ||
      (c.Description?.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Gets pinned conversations
   */
  get pinnedConversations(): MJConversationEntity[] {
    return this.conversations.filter(c => c.IsPinned);
  }

  /**
   * Sets the search query
   * @param query The search query string
   */
  setSearchQuery(query: string): void {
    this.searchQuery = query;
  }

  /**
   * Clears the search query
   */
  clearSearchQuery(): void {
    this.searchQuery = '';
  }

  /**
   * Adds a conversation to the local list.
   * Normally not needed since ConversationEngine.CreateConversation() updates the
   * reactive stream, but kept for edge cases where a caller adds to the list directly.
   * @param conversation The conversation to add
   */
  addConversation(conversation: MJConversationEntity): void {
    this.conversations = [conversation, ...this.conversations];
  }

  /**
   * Updates a conversation in the list by directly modifying the entity object.
   * Angular change detection will pick up the changes automatically.
   * @param id The conversation ID
   * @param updates The fields to update
   */
  updateConversationInPlace(id: string, updates: Partial<MJConversationEntity>): void {
    const conversation = this.conversations.find(c => UUIDsEqual(c.ID, id));
    if (conversation) {
      Object.assign(conversation, updates);
    }
  }

  /**
   * Removes a conversation from the local list.
   * Normally not needed since ConversationEngine handles list updates,
   * but kept for edge cases.
   * @param id The conversation ID to remove
   */
  removeConversation(id: string): void {
    this.conversations = this.conversations.filter(c => !UUIDsEqual(c.ID, id));
  }

  /**
   * Loads conversations from the database via ConversationEngine.
   * Skips if already loaded to prevent redundant DB calls.
   * @param environmentId The environment ID to filter by
   * @param currentUser The current user context
   */
  async loadConversations(environmentId: string, currentUser: UserInfo): Promise<void> {
    this.isLoading = true;
    try {
      await this.engine.LoadConversations(environmentId, currentUser, false);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Force refresh conversations from the database, ignoring cache.
   * Use this when user explicitly requests a refresh.
   * @param environmentId The environment ID to filter by
   * @param currentUser The current user context
   */
  async refreshConversations(environmentId: string, currentUser: UserInfo): Promise<void> {
    this.isLoading = true;
    try {
      await this.engine.LoadConversations(environmentId, currentUser, true);
    } catch (error) {
      console.error('Error refreshing conversations:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Creates a new conversation via ConversationEngine
   * @param name The conversation name
   * @param environmentId The environment ID
   * @param currentUser The current user context
   * @param description Optional description
   * @param projectId Optional project ID
   * @returns The created conversation entity
   */
  async createConversation(
    name: string,
    environmentId: string,
    currentUser: UserInfo,
    description?: string,
    projectId?: string
  ): Promise<MJConversationEntity> {
    return this.engine.CreateConversation(name, environmentId, currentUser, description, projectId);
  }

  /**
   * Deletes a conversation via ConversationEngine
   * @param id The conversation ID
   * @param currentUser The current user context
   * @returns True if successful
   */
  async deleteConversation(id: string, currentUser: UserInfo): Promise<boolean> {
    return this.engine.DeleteConversation(id, currentUser);
  }

  /**
   * Deletes multiple conversations in a batch operation
   * @param ids - Array of conversation IDs to delete
   * @param currentUser - Current user info
   * @returns Object with successful deletions and failed deletions with error info
   */
  async deleteMultipleConversations(
    ids: string[],
    currentUser: UserInfo
  ): Promise<{
    successful: string[];
    failed: Array<{ id: string; name: string; error: string }>;
  }> {
    const successful: string[] = [];
    const failed: Array<{ id: string; name: string; error: string }> = [];

    for (const id of ids) {
      try {
        const conversation = this.conversations.find(c => UUIDsEqual(c.ID, id));
        const name = conversation?.Name || 'Unknown';

        const deleted = await this.engine.DeleteConversation(id, currentUser);
        if (deleted) {
          successful.push(id);
        } else {
          failed.push({ id, name, error: 'Delete returned false' });
        }
      } catch (error) {
        const conversation = this.conversations.find(c => UUIDsEqual(c.ID, id));
        failed.push({
          id,
          name: conversation?.Name || 'Unknown',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { successful, failed };
  }

  /**
   * Updates a conversation - saves to database AND updates in-place in the array.
   * Uses Metadata directly since ConversationEngine doesn't have a generic save method.
   * @param id The conversation ID
   * @param updates The fields to update
   * @param currentUser The current user context
   * @returns True if successful
   */
  async saveConversation(
    id: string,
    updates: Partial<MJConversationEntity>,
    currentUser: UserInfo
  ): Promise<boolean> {
    // ConversationEngine doesn't have a generic "save partial fields" method,
    // so we keep this logic here. The engine's list is updated via the subscription.
    const md = new Metadata();
    const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', currentUser);

    const loaded = await conversation.Load(id);
    if (!loaded) {
      throw new Error('Conversation not found');
    }

    // Apply updates
    Object.assign(conversation, updates);

    const saved = await conversation.Save();
    if (saved) {
      // Update the in-memory conversation directly in our local list
      this.updateConversationInPlace(id, updates);
      return true;
    } else {
      throw new Error(conversation.LatestResult?.Message || 'Failed to update conversation');
    }
  }

  /**
   * Toggles the pinned status of a conversation via ConversationEngine
   * @param id The conversation ID
   * @param currentUser The current user context
   */
  async togglePin(id: string, currentUser: UserInfo): Promise<void> {
    const conversation = this.conversations.find(c => UUIDsEqual(c.ID, id));
    if (conversation) {
      await this.engine.PinConversation(id, !conversation.IsPinned, currentUser);
    }
  }

  /**
   * Archives a conversation via ConversationEngine
   * @param id The conversation ID
   * @param currentUser The current user context
   */
  async archiveConversation(id: string, currentUser: UserInfo): Promise<void> {
    await this.engine.ArchiveConversation(id, currentUser);
  }
}
