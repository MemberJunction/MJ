import { Injectable } from '@angular/core';
import { ConversationEntity } from '@memberjunction/core-entities';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';

/**
 * Simplified state management for conversations
 * Uses simple arrays with Angular change detection instead of complex observables
 * This prevents synchronization issues when updating conversation properties
 */
@Injectable({
  providedIn: 'root'
})
export class ConversationStateService {
  // Simple properties - Angular change detection will handle updates
  public conversations: ConversationEntity[] = [];
  public activeConversationId: string | null = null;
  public searchQuery: string = '';
  public isLoading: boolean = false;
  public activeThreadId: string | null = null;

  // Pending message from empty state - persists across component lifecycle
  public pendingMessageToSend: string | null = null;

  // Pending artifact navigation - used when jumping from collection to conversation
  public pendingArtifactId: string | null = null;
  public pendingArtifactVersionNumber: number | null = null;

  constructor() {}

  /**
   * Gets the active conversation object
   */
  get activeConversation(): ConversationEntity | null {
    if (!this.activeConversationId) return null;
    return this.conversations.find(c => c.ID === this.activeConversationId) || null;
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
   * Sets the active conversation
   * @param id The conversation ID to activate (or null to clear)
   */
  setActiveConversation(id: string | null): void {
    console.log('🎯 Setting active conversation:', id);
    this.activeConversationId = id;
  }

  /**
   * Gets the current active conversation ID
   */
  getActiveConversationId(): string | null {
    return this.activeConversationId;
  }

  /**
   * Adds a conversation to the list
   * @param conversation The conversation to add
   */
  addConversation(conversation: ConversationEntity): void {
    this.conversations = [conversation, ...this.conversations];
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
      console.log('📝 Updated conversation in-place:', { id, updates });
    }
  }

  /**
   * Removes a conversation from the list
   * @param id The conversation ID to remove
   */
  removeConversation(id: string): void {
    this.conversations = this.conversations.filter(c => c.ID !== id);
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
   * Loads conversations from the database
   * @param environmentId The environment ID to filter by
   * @param currentUser The current user context
   */
  async loadConversations(environmentId: string, currentUser: UserInfo): Promise<void> {
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
    } catch (error) {
      console.error('Error loading conversations:', error);
      this.conversations = [];
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
      if (this.getActiveConversationId() === id) {
        this.setActiveConversation(null);
      }
      return true;
    } else {
      throw new Error(conversation.LatestResult?.Message || 'Failed to delete conversation');
    }
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

  /**
   * Opens a thread panel for a specific message
   * @param messageId The parent message ID
   */
  openThread(messageId: string): void {
    this.activeThreadId = messageId;
  }

  /**
   * Closes the currently open thread panel
   */
  closeThread(): void {
    this.activeThreadId = null;
  }

  /**
   * Gets the currently active thread ID
   */
  getActiveThreadId(): string | null {
    return this.activeThreadId;
  }
}
