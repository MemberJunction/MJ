import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { ConversationEntity } from '@memberjunction/core-entities';

/**
 * Centralized state management for conversations
 * Provides reactive streams for UI components
 */
@Injectable({
  providedIn: 'root'
})
export class ConversationStateService {
  private _activeConversationId$ = new BehaviorSubject<string | null>(null);
  private _conversations$ = new BehaviorSubject<ConversationEntity[]>([]);
  private _searchQuery$ = new BehaviorSubject<string>('');

  // Public observable streams
  public readonly activeConversationId$ = this._activeConversationId$.asObservable();
  public readonly conversations$ = this._conversations$.asObservable();
  public readonly searchQuery$ = this._searchQuery$.asObservable();

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
}