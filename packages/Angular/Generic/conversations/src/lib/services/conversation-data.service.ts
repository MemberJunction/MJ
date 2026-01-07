import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ConversationEntity } from '@memberjunction/core-entities';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';

/**
 * Shared data service for conversations
 * This is a SINGLETON service that manages the conversation data (list of conversations)
 * Selection state (which conversation is active) is managed by parent components locally
 *
 * This architecture enables multiple conversation panels to coexist (e.g., in tabs)
 * without conflicting over which conversation is "active"
 */
@Injectable({
  providedIn: 'root'
})
export class ConversationDataService {
  // The list of conversations - shared across all components
  public conversations: ConversationEntity[] = [];

  // Observable for conversation list changes (for components that need reactive updates)
  private _conversations$ = new BehaviorSubject<ConversationEntity[]>([]);
  public readonly conversations$ = this._conversations$.asObservable();

  // Search query for filtering - shared across sidebars
  public searchQuery: string = '';

  // Loading state
  public isLoading: boolean = false;

  constructor() {}

  /**
   * Gets a conversation by ID
   * @param id The conversation ID
   * @returns The conversation entity or null if not found
   */
  getConversationById(id: string): ConversationEntity | null {
    return this.conversations.find(c => c.ID === id) || null;
  }

  /**
   * Gets filtered conversations based on search query
   */
  get filteredConversations(): ConversationEntity[] {
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
  get pinnedConversations(): ConversationEntity[] {
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
   * Adds a conversation to the list
   * @param conversation The conversation to add
   */
  addConversation(conversation: ConversationEntity): void {
    this.conversations = [conversation, ...this.conversations];
    this._conversations$.next(this.conversations);
  }

  /**
   * Updates a conversation in the list by directly modifying the entity object
   * Angular change detection will pick up the changes automatically
   * @param id The conversation ID
   * @param updates The fields to update
   */
  updateConversationInPlace(id: string, updates: Partial<ConversationEntity>): void {
    const conversation = this.conversations.find(c => c.ID === id);
    if (conversation) {
      Object.assign(conversation, updates);
      // Emit update to trigger reactive subscribers
      this._conversations$.next(this.conversations);
    }
  }

  /**
   * Removes a conversation from the list
   * @param id The conversation ID to remove
   * @returns True if the conversation was the active one (caller may need to handle)
   */
  removeConversation(id: string): void {
    this.conversations = this.conversations.filter(c => c.ID !== id);
    this._conversations$.next(this.conversations);
  }

  /**
   * Loads conversations from the database.
   * Skips if already loaded to prevent redundant DB calls.
   * @param environmentId The environment ID to filter by
   * @param currentUser The current user context
   */
  async loadConversations(environmentId: string, currentUser: UserInfo): Promise<void> {
    // Skip if already loaded - prevents redundant DB calls when multiple components initialize
    if (this.conversations.length > 0) {
      return;
    }
    await this.fetchConversations(environmentId, currentUser);
  }

  /**
   * Force refresh conversations from the database, ignoring cache.
   * Use this when user explicitly requests a refresh.
   * @param environmentId The environment ID to filter by
   * @param currentUser The current user context
   */
  async refreshConversations(environmentId: string, currentUser: UserInfo): Promise<void> {
    await this.fetchConversations(environmentId, currentUser);
  }

  /**
   * Internal method to fetch conversations from the database.
   * @param environmentId The environment ID to filter by
   * @param currentUser The current user context
   */
  private async fetchConversations(environmentId: string, currentUser: UserInfo): Promise<void> {
    this.isLoading = true;
    try {
      const rv = new RunView();
      const filter = `EnvironmentID='${environmentId}' AND UserID='${currentUser.ID}' AND (IsArchived IS NULL OR IsArchived=0)`;

      const result = await rv.RunView<ConversationEntity>(
        {
          EntityName: 'Conversations',
          ExtraFilter: filter,
          OrderBy: 'IsPinned DESC, __mj_UpdatedAt DESC',
          MaxRows: 1000,
          ResultType: 'entity_object' 
        },
        currentUser
      );

      if (result.Success) {
        this.conversations = result.Results || [];
      } else {
        console.error('Failed to load conversations:', result.ErrorMessage);
        this.conversations = [];
      }
      this._conversations$.next(this.conversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
      this.conversations = [];
      this._conversations$.next(this.conversations);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Creates a new conversation
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
  ): Promise<ConversationEntity> {
    const md = new Metadata();
    const conversation = await md.GetEntityObject<ConversationEntity>('Conversations', currentUser);

    conversation.Name = name;
    conversation.EnvironmentID = environmentId;
    conversation.UserID = currentUser.ID;
    if (description) conversation.Description = description;
    if (projectId) conversation.ProjectID = projectId;

    const saved = await conversation.Save();
    if (saved) {
      this.addConversation(conversation);
      return conversation;
    } else {
      throw new Error(conversation.LatestResult?.Message || 'Failed to create conversation');
    }
  }

  /**
   * Deletes a conversation
   * @param id The conversation ID
   * @param currentUser The current user context
   * @returns True if successful
   */
  async deleteConversation(id: string, currentUser: UserInfo): Promise<boolean> {
    const md = new Metadata();
    const conversation = await md.GetEntityObject<ConversationEntity>('Conversations', currentUser);

    const loaded = await conversation.Load(id);
    if (!loaded) {
      throw new Error('Conversation not found');
    }

    const deleted = await conversation.Delete();
    if (deleted) {
      this.removeConversation(id);
      return true;
    } else {
      throw new Error(conversation.LatestResult?.Message || 'Failed to delete conversation');
    }
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
        const conversation = this.conversations.find(c => c.ID === id);
        const name = conversation?.Name || 'Unknown';

        const deleted = await this.deleteConversation(id, currentUser);
        if (deleted) {
          successful.push(id);
        } else {
          failed.push({ id, name, error: 'Delete returned false' });
        }
      } catch (error) {
        const conversation = this.conversations.find(c => c.ID === id);
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
   * Updates a conversation - saves to database AND updates in-place in the array
   * @param id The conversation ID
   * @param updates The fields to update
   * @param currentUser The current user context
   * @returns True if successful
   */
  async saveConversation(
    id: string,
    updates: Partial<ConversationEntity>,
    currentUser: UserInfo
  ): Promise<boolean> {
    const md = new Metadata();
    const conversation = await md.GetEntityObject<ConversationEntity>('Conversations', currentUser);

    const loaded = await conversation.Load(id);
    if (!loaded) {
      throw new Error('Conversation not found');
    }

    // Apply updates
    Object.assign(conversation, updates);

    const saved = await conversation.Save();
    if (saved) {
      // Update the in-memory conversation directly
      this.updateConversationInPlace(id, updates);
      return true;
    } else {
      throw new Error(conversation.LatestResult?.Message || 'Failed to update conversation');
    }
  }

  /**
   * Toggles the pinned status of a conversation
   * @param id The conversation ID
   * @param currentUser The current user context
   */
  async togglePin(id: string, currentUser: UserInfo): Promise<void> {
    const conversation = this.conversations.find(c => c.ID === id);
    if (conversation) {
      await this.saveConversation(id, { IsPinned: !conversation.IsPinned }, currentUser);
    }
  }

  /**
   * Archives a conversation
   * @param id The conversation ID
   * @param currentUser The current user context
   */
  async archiveConversation(id: string, currentUser: UserInfo): Promise<void> {
    await this.saveConversation(id, { IsArchived: true }, currentUser);
  }
}
