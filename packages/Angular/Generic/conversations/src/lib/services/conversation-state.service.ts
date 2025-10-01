import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { ConversationEntity } from '@memberjunction/core-entities';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';

/**
 * Centralized state management for conversations
 * Provides reactive streams for UI components
 * Handles CRUD operations for conversations
 */
@Injectable({
  providedIn: 'root'
})
export class ConversationStateService {
  private _activeConversationId$ = new BehaviorSubject<string | null>(null);
  private _conversations$ = new BehaviorSubject<ConversationEntity[]>([]);
  private _searchQuery$ = new BehaviorSubject<string>('');
  private _isLoading$ = new BehaviorSubject<boolean>(false);
  private _activeThreadId$ = new BehaviorSubject<string | null>(null);

  // Public observable streams
  public readonly activeConversationId$ = this._activeConversationId$.asObservable();
  public readonly conversations$ = this._conversations$.asObservable();
  public readonly searchQuery$ = this._searchQuery$.asObservable();
  public readonly isLoading$ = this._isLoading$.asObservable();
  public readonly activeThreadId$ = this._activeThreadId$.asObservable();

  // Derived observables
  public readonly activeConversation$: Observable<ConversationEntity | null> = combineLatest([
    this.activeConversationId$,
    this.conversations$
  ]).pipe(
    map(([id, conversations]) => conversations.find(c => c.ID === id) || null),
    shareReplay(1)
  );

  public readonly filteredConversations$: Observable<ConversationEntity[]> = combineLatest([
    this.conversations$,
    this.searchQuery$
  ]).pipe(
    map(([conversations, query]) => {
      if (!query || query.trim() === '') {
        return conversations;
      }
      const lowerQuery = query.toLowerCase();
      return conversations.filter(c =>
        (c.Name?.toLowerCase().includes(lowerQuery)) ||
        (c.Description?.toLowerCase().includes(lowerQuery))
      );
    }),
    shareReplay(1)
  );

  public readonly pinnedConversations$: Observable<ConversationEntity[]> = this.conversations$.pipe(
    map(conversations => conversations.filter(c => c.IsPinned)),
    shareReplay(1)
  );

  constructor() {}

  /**
   * Sets the active conversation
   * @param id The conversation ID to activate (or null to clear)
   */
  setActiveConversation(id: string | null): void {
    this._activeConversationId$.next(id);
  }

  /**
   * Gets the current active conversation ID
   */
  getActiveConversationId(): string | null {
    return this._activeConversationId$.value;
  }

  /**
   * Updates the conversations list
   * @param conversations The new conversations array
   */
  setConversations(conversations: ConversationEntity[]): void {
    this._conversations$.next(conversations);
  }

  /**
   * Adds a conversation to the list
   * @param conversation The conversation to add
   */
  addConversation(conversation: ConversationEntity): void {
    const current = this._conversations$.value;
    this._conversations$.next([conversation, ...current]);
  }

  /**
   * Updates a conversation in the list
   * @param id The conversation ID
   * @param updates Partial updates to apply
   */
  updateConversation(id: string, updates: Partial<ConversationEntity>): void {
    const current = this._conversations$.value;
    const index = current.findIndex(c => c.ID === id);
    if (index >= 0) {
      current[index] = { ...current[index], ...updates } as ConversationEntity;
      this._conversations$.next([...current]);
    }
  }

  /**
   * Removes a conversation from the list
   * @param id The conversation ID to remove
   */
  removeConversation(id: string): void {
    const current = this._conversations$.value;
    this._conversations$.next(current.filter(c => c.ID !== id));
  }

  /**
   * Sets the search query
   * @param query The search query string
   */
  setSearchQuery(query: string): void {
    this._searchQuery$.next(query);
  }

  /**
   * Clears the search query
   */
  clearSearchQuery(): void {
    this._searchQuery$.next('');
  }

  /**
   * Loads conversations from the database
   * @param environmentId The environment ID to filter by
   * @param currentUser The current user context
   */
  async loadConversations(environmentId: string, currentUser: UserInfo): Promise<void> {
    this._isLoading$.next(true);
    try {
      const rv = new RunView();
      const filter = `EnvironmentID='${environmentId}' AND (IsArchived IS NULL OR IsArchived=0)`;

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
        this.setConversations(result.Results || []);
      } else {
        console.error('Failed to load conversations:', result.ErrorMessage);
        this.setConversations([]);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
      this.setConversations([]);
    } finally {
      this._isLoading$.next(false);
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
   * Updates a conversation
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
      this.updateConversation(id, updates);
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
    const conversations = this._conversations$.value;
    const conversation = conversations.find(c => c.ID === id);
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
    this._activeThreadId$.next(messageId);
  }

  /**
   * Closes the currently open thread panel
   */
  closeThread(): void {
    this._activeThreadId$.next(null);
  }

  /**
   * Gets the currently active thread ID
   */
  getActiveThreadId(): string | null {
    return this._activeThreadId$.value;
  }
}