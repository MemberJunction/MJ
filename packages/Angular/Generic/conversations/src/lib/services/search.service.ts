import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, map } from 'rxjs/operators';
import {
  ConversationEntity,
  ConversationDetailEntity,
  ConversationArtifactEntity
} from '@memberjunction/core-entities';
import { RunView, UserInfo } from '@memberjunction/core';

/**
 * Types of searchable content
 */
export type SearchResultType = 'conversation' | 'message' | 'artifact';

/**
 * Filter options for search
 */
export type SearchFilter = 'all' | 'conversations' | 'messages' | 'artifacts';

/**
 * Unified search result
 */
export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  preview: string;
  matchedText?: string;
  conversationId?: string;
  conversationName?: string;
  artifactType?: string;
  createdAt: Date;
  relevanceScore: number;
}

/**
 * Search results grouped by type
 */
export interface GroupedSearchResults {
  conversations: SearchResult[];
  messages: SearchResult[];
  artifacts: SearchResult[];
  total: number;
}

/**
 * Date range filter
 */
export interface DateRange {
  start: Date | null;
  end: Date | null;
}

/**
 * Service for searching across conversations, messages, and artifacts
 * Provides debounced search with result ranking and filtering
 */
@Injectable({
  providedIn: 'root'
})
export class SearchService {
  private _searchQuery$ = new Subject<string>();
  private _searchFilter$ = new BehaviorSubject<SearchFilter>('all');
  private _dateRange$ = new BehaviorSubject<DateRange>({ start: null, end: null });
  private _isSearching$ = new BehaviorSubject<boolean>(false);
  private _searchResults$ = new BehaviorSubject<GroupedSearchResults>({
    conversations: [],
    messages: [],
    artifacts: [],
    total: 0
  });

  // Recent searches stored in memory (could be persisted to localStorage)
  private recentSearches: string[] = [];
  private readonly MAX_RECENT_SEARCHES = 10;

  // Public observables
  public readonly searchQuery$ = this._searchQuery$.asObservable();
  public readonly searchFilter$ = this._searchFilter$.asObservable();
  public readonly dateRange$ = this._dateRange$.asObservable();
  public readonly isSearching$ = this._isSearching$.asObservable();
  public readonly searchResults$ = this._searchResults$.asObservable();

  constructor() {
    this.initializeSearch();
    this.loadRecentSearches();
  }

  /**
   * Initialize debounced search
   */
  private initializeSearch(): void {
    this._searchQuery$.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(query => {
      if (query && query.trim().length > 0) {
        this.addToRecentSearches(query);
      }
    });
  }

  /**
   * Search across all content types
   */
  public async search(
    query: string,
    environmentId: string,
    currentUser: UserInfo
  ): Promise<GroupedSearchResults> {
    if (!query || query.trim().length === 0) {
      const emptyResults: GroupedSearchResults = {
        conversations: [],
        messages: [],
        artifacts: [],
        total: 0
      };
      this._searchResults$.next(emptyResults);
      return emptyResults;
    }

    this._isSearching$.next(true);
    this._searchQuery$.next(query);

    try {
      const filter = this._searchFilter$.value;
      const dateRange = this._dateRange$.value;

      // Search based on active filter
      const [conversations, messages, artifacts] = await Promise.all([
        filter === 'all' || filter === 'conversations'
          ? this.searchConversations(query, environmentId, currentUser, dateRange)
          : Promise.resolve([]),
        filter === 'all' || filter === 'messages'
          ? this.searchMessages(query, environmentId, currentUser, dateRange)
          : Promise.resolve([]),
        filter === 'all' || filter === 'artifacts'
          ? this.searchArtifacts(query, environmentId, currentUser, dateRange)
          : Promise.resolve([])
      ]);

      const results: GroupedSearchResults = {
        conversations,
        messages,
        artifacts,
        total: conversations.length + messages.length + artifacts.length
      };

      this._searchResults$.next(results);
      return results;
    } finally {
      this._isSearching$.next(false);
    }
  }

  /**
   * Search conversations by name and description
   */
  private async searchConversations(
    query: string,
    environmentId: string,
    currentUser: UserInfo,
    dateRange: DateRange
  ): Promise<SearchResult[]> {
    const rv = new RunView();
    const lowerQuery = query.toLowerCase();

    let filter = `EnvironmentID='${environmentId}' AND (IsArchived IS NULL OR IsArchived=0)`;
    filter += ` AND (LOWER(Name) LIKE '%${this.escapeSQL(lowerQuery)}%' OR LOWER(Description) LIKE '%${this.escapeSQL(lowerQuery)}%')`;

    if (dateRange.start) {
      filter += ` AND __mj_CreatedAt >= '${dateRange.start.toISOString()}'`;
    }
    if (dateRange.end) {
      filter += ` AND __mj_CreatedAt <= '${dateRange.end.toISOString()}'`;
    }

    const result = await rv.RunView<ConversationEntity>(
      {
        EntityName: 'Conversations',
        ExtraFilter: filter,
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: 100,
        ResultType: 'entity_object'
      },
      currentUser
    );

    if (!result.Success || !result.Results) {
      console.error('Failed to search conversations:', result.ErrorMessage);
      return [];
    }

    return result.Results.map(conv => this.mapConversationToSearchResult(conv, query));
  }

  /**
   * Search message content
   */
  private async searchMessages(
    query: string,
    environmentId: string,
    currentUser: UserInfo,
    dateRange: DateRange
  ): Promise<SearchResult[]> {
    const rv = new RunView();
    const lowerQuery = query.toLowerCase();

    // First get conversations in this environment
    let filter = `ConversationID IN (SELECT ID FROM vwConversations WHERE EnvironmentID='${environmentId}' AND (IsArchived IS NULL OR IsArchived=0))`;
    filter += ` AND LOWER(Message) LIKE '%${this.escapeSQL(lowerQuery)}%'`;
    filter += ` AND (HiddenToUser IS NULL OR HiddenToUser=0)`;

    if (dateRange.start) {
      filter += ` AND __mj_CreatedAt >= '${dateRange.start.toISOString()}'`;
    }
    if (dateRange.end) {
      filter += ` AND __mj_CreatedAt <= '${dateRange.end.toISOString()}'`;
    }

    const result = await rv.RunView<ConversationDetailEntity>(
      {
        EntityName: 'Conversation Details',
        ExtraFilter: filter,
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: 100,
        ResultType: 'entity_object'
      },
      currentUser
    );

    if (!result.Success || !result.Results) {
      console.error('Failed to search messages:', result.ErrorMessage);
      return [];
    }

    return result.Results.map(msg => this.mapMessageToSearchResult(msg, query));
  }

  /**
   * Search artifacts by name and content
   */
  private async searchArtifacts(
    query: string,
    environmentId: string,
    currentUser: UserInfo,
    dateRange: DateRange
  ): Promise<SearchResult[]> {
    const rv = new RunView();
    const lowerQuery = query.toLowerCase();

    // Get artifacts in conversations from this environment
    let filter = `ConversationID IN (SELECT ID FROM vwConversations WHERE EnvironmentID='${environmentId}' AND (IsArchived IS NULL OR IsArchived=0))`;
    filter += ` AND (LOWER(Name) LIKE '%${this.escapeSQL(lowerQuery)}%' OR LOWER(Description) LIKE '%${this.escapeSQL(lowerQuery)}%')`;

    if (dateRange.start) {
      filter += ` AND __mj_CreatedAt >= '${dateRange.start.toISOString()}'`;
    }
    if (dateRange.end) {
      filter += ` AND __mj_CreatedAt <= '${dateRange.end.toISOString()}'`;
    }

    const result = await rv.RunView<ConversationArtifactEntity>(
      {
        EntityName: 'MJ: Conversation Artifacts',
        ExtraFilter: filter,
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: 100,
        ResultType: 'entity_object'
      },
      currentUser
    );

    if (!result.Success || !result.Results) {
      console.error('Failed to search artifacts:', result.ErrorMessage);
      return [];
    }

    return result.Results.map(artifact => this.mapArtifactToSearchResult(artifact, query));
  }

  /**
   * Map conversation entity to search result
   */
  private mapConversationToSearchResult(conversation: ConversationEntity, query: string): SearchResult {
    const lowerQuery = query.toLowerCase();
    const name = conversation.Name || 'Untitled Conversation';
    const description = conversation.Description || '';

    // Calculate relevance score
    let score = 0;
    if (name.toLowerCase().includes(lowerQuery)) score += 10;
    if (description.toLowerCase().includes(lowerQuery)) score += 5;

    // Find matched text
    const matchedText = this.extractMatchContext(
      name.toLowerCase().includes(lowerQuery) ? name : description,
      query
    );

    return {
      id: conversation.ID,
      type: 'conversation',
      title: name,
      preview: description || 'No description',
      matchedText,
      conversationId: conversation.ID,
      conversationName: name,
      createdAt: conversation.__mj_CreatedAt,
      relevanceScore: score
    };
  }

  /**
   * Map message entity to search result
   */
  private mapMessageToSearchResult(message: ConversationDetailEntity, query: string): SearchResult {
    const messageText = message.Message || '';
    const matchedText = this.extractMatchContext(messageText, query);

    return {
      id: message.ID,
      type: 'message',
      title: `Message in ${message.Conversation || 'Unknown Conversation'}`,
      preview: this.truncateText(messageText, 150),
      matchedText,
      conversationId: message.ConversationID,
      conversationName: message.Conversation || undefined,
      createdAt: message.__mj_CreatedAt,
      relevanceScore: 5
    };
  }

  /**
   * Map artifact entity to search result
   */
  private mapArtifactToSearchResult(artifact: ConversationArtifactEntity, query: string): SearchResult {
    const name = artifact.Name || 'Untitled Artifact';
    const description = artifact.Description || '';
    const lowerQuery = query.toLowerCase();

    let score = 0;
    if (name.toLowerCase().includes(lowerQuery)) score += 10;
    if (description.toLowerCase().includes(lowerQuery)) score += 5;

    const matchedText = this.extractMatchContext(
      name.toLowerCase().includes(lowerQuery) ? name : description,
      query
    );

    return {
      id: artifact.ID,
      type: 'artifact',
      title: name,
      preview: description || 'No description',
      matchedText,
      conversationId: artifact.ConversationID,
      conversationName: artifact.Conversation || undefined,
      artifactType: artifact.ArtifactType || undefined,
      createdAt: artifact.__mj_CreatedAt,
      relevanceScore: score
    };
  }

  /**
   * Extract context around matched text
   */
  private extractMatchContext(text: string, query: string, contextLength: number = 100): string {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return this.truncateText(text, contextLength);

    const start = Math.max(0, index - contextLength / 2);
    const end = Math.min(text.length, index + query.length + contextLength / 2);

    let context = text.substring(start, end);
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';

    return context;
  }

  /**
   * Truncate text to specified length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Escape SQL special characters
   */
  private escapeSQL(value: string): string {
    return value.replace(/'/g, "''");
  }

  /**
   * Set search filter
   */
  public setSearchFilter(filter: SearchFilter): void {
    this._searchFilter$.next(filter);
  }

  /**
   * Set date range filter
   */
  public setDateRange(range: DateRange): void {
    this._dateRange$.next(range);
  }

  /**
   * Clear all filters
   */
  public clearFilters(): void {
    this._searchFilter$.next('all');
    this._dateRange$.next({ start: null, end: null });
  }

  /**
   * Clear search results
   */
  public clearResults(): void {
    this._searchResults$.next({
      conversations: [],
      messages: [],
      artifacts: [],
      total: 0
    });
  }

  /**
   * Get recent searches
   */
  public getRecentSearches(): string[] {
    return [...this.recentSearches];
  }

  /**
   * Add to recent searches
   */
  private addToRecentSearches(query: string): void {
    const trimmed = query.trim();
    if (!trimmed) return;

    // Remove if already exists
    this.recentSearches = this.recentSearches.filter(q => q !== trimmed);

    // Add to front
    this.recentSearches.unshift(trimmed);

    // Keep only MAX_RECENT_SEARCHES
    if (this.recentSearches.length > this.MAX_RECENT_SEARCHES) {
      this.recentSearches = this.recentSearches.slice(0, this.MAX_RECENT_SEARCHES);
    }

    this.saveRecentSearches();
  }

  /**
   * Clear recent searches
   */
  public clearRecentSearches(): void {
    this.recentSearches = [];
    this.saveRecentSearches();
  }

  /**
   * Load recent searches from localStorage
   */
  private loadRecentSearches(): void {
    try {
      const stored = localStorage.getItem('mj-recent-searches');
      if (stored) {
        this.recentSearches = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load recent searches:', error);
      this.recentSearches = [];
    }
  }

  /**
   * Save recent searches to localStorage
   */
  private saveRecentSearches(): void {
    try {
      localStorage.setItem('mj-recent-searches', JSON.stringify(this.recentSearches));
    } catch (error) {
      console.error('Failed to save recent searches:', error);
    }
  }
}
