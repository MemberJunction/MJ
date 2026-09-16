import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, map } from 'rxjs/operators';
import {
  MJConversationEntity,
  MJConversationDetailEntity,
  MJConversationArtifactEntity,
  MJCollectionEntity,
  MJCollectionArtifactEntity,
  MJTaskEntity,
  MJArtifactEntity
} from '@memberjunction/core-entities';
import { RunView, UserInfo, Metadata, IMetadataProvider } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';

/**
 * Types of searchable content
 */
export type SearchResultType = 'conversation' | 'message' | 'artifact' | 'collection' | 'task';

/**
 * Filter options for search
 */
export type SearchFilter = 'all' | 'conversations' | 'messages' | 'artifacts' | 'collections' | 'tasks';

/**
 * Unified search result
 */
export interface SearchResult {
  id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  type: SearchResultType;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  title: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  preview: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  matchedText?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  conversationId?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  conversationName?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  artifactType?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  collectionId?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  collectionName?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  createdAt: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  relevanceScore: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Search results grouped by type
 */
export interface GroupedSearchResults {
  conversations: SearchResult[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  messages: SearchResult[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  artifacts: SearchResult[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  collections: SearchResult[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  tasks: SearchResult[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  total: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Date range filter
 */
export interface DateRange {
  start: Date | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  end: Date | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Service for searching across conversations, messages, and artifacts
 * Provides debounced search with result ranking and filtering
 */
/**
 * NOTE ON `LIKE` ESCAPING
 *
 * The predicates below interpolate the user's query into `LIKE '%…%'` via `EscapeSQLString`, which
 * neutralises quotes but NOT LIKE metacharacters — `%`, `_` and `[` in a search term are still
 * treated as wildcards rather than literal text. That is this service's long-standing search
 * behaviour, so it is left as-is deliberately; changing it would change what users' searches match.
 * If literal matching is wanted, escape the metacharacters and append `ESCAPE '\\'` (see
 * `escapeLikeValue()` in `@memberjunction/core`, `generic/runQuerySQLFilterImplementations.ts`).
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
    collections: [],
    tasks: [],
    total: 0
  });

  // Recent searches stored in memory (could be persisted to localStorage)
  private recentSearches: string[] = [];
  private readonly MAX_RECENT_SEARCHES = 10;

  // Public observables
  public readonly SearchQuery$ = this._searchQuery$.asObservable();

  /** @deprecated Use {@link SearchQuery$}. */
  public get searchQuery$() {
    return this.SearchQuery$;
  }
  public readonly SearchFilter$ = this._searchFilter$.asObservable();

  /** @deprecated Use {@link SearchFilter$}. */
  public get searchFilter$() {
    return this.SearchFilter$;
  }
  public readonly DateRange$ = this._dateRange$.asObservable();

  /** @deprecated Use {@link DateRange$}. */
  public get dateRange$() {
    return this.DateRange$;
  }
  public readonly IsSearching$ = this._isSearching$.asObservable();

  /** @deprecated Use {@link IsSearching$}. */
  public get isSearching$() {
    return this.IsSearching$;
  }
  public readonly SearchResults$ = this._searchResults$.asObservable();

  /** @deprecated Use {@link SearchResults$}. */
  public get searchResults$() {
    return this.SearchResults$;
  }

  private _provider: IMetadataProvider | null = null;

  constructor() {
    this.initializeSearch();
    this.loadRecentSearches();
  }

  /**
   * Set the metadata provider this service should use. When unset, falls back to Metadata.Provider.
   */
  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }

  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
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
  public async Search(
    query: string,
    environmentId: string,
    currentUser: UserInfo
  ): Promise<GroupedSearchResults> {
    if (!query || query.trim().length === 0) {
      const emptyResults: GroupedSearchResults = {
        conversations: [],
        messages: [],
        artifacts: [],
        collections: [],
        tasks: [],
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
      const [conversations, messages, artifacts, collections, tasks] = await Promise.all([
        filter === 'all' || filter === 'conversations'
          ? this.searchConversations(query, environmentId, currentUser, dateRange)
          : Promise.resolve([]),
        filter === 'all' || filter === 'messages'
          ? this.searchMessages(query, environmentId, currentUser, dateRange)
          : Promise.resolve([]),
        filter === 'all' || filter === 'artifacts'
          ? this.searchArtifacts(query, environmentId, currentUser, dateRange)
          : Promise.resolve([]),
        filter === 'all' || filter === 'collections'
          ? this.searchCollections(query, environmentId, currentUser, dateRange)
          : Promise.resolve([]),
        filter === 'all' || filter === 'tasks'
          ? this.searchTasks(query, environmentId, currentUser, dateRange)
          : Promise.resolve([])
      ]);

      const results: GroupedSearchResults = {
        conversations,
        messages,
        artifacts,
        collections,
        tasks,
        total: conversations.length + messages.length + artifacts.length + collections.length + tasks.length
      };

      this._searchResults$.next(results);
      return results;
    } finally {
      this._isSearching$.next(false);
    }
  }

  /** @deprecated Use {@link Search}. */
  public async search(
    query: string,
    environmentId: string,
    currentUser: UserInfo
  ): Promise<GroupedSearchResults> {
    return this.Search(query, environmentId, currentUser);
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
    const rv = RunView.FromMetadataProvider(this.Provider);
    const lowerQuery = query.toLowerCase();

    let filter = `EnvironmentID='${environmentId}' AND (IsArchived IS NULL OR IsArchived=0)`;
    filter += ` AND (LOWER(Name) LIKE '%${EscapeSQLString(lowerQuery)}%' OR LOWER(Description) LIKE '%${EscapeSQLString(lowerQuery)}%')`;

    if (dateRange.start) {
      filter += ` AND __mj_CreatedAt >= '${dateRange.start.toISOString()}'`;
    }
    if (dateRange.end) {
      filter += ` AND __mj_CreatedAt <= '${dateRange.end.toISOString()}'`;
    }

    const result = await rv.RunView<MJConversationEntity>(
      {
        EntityName: 'MJ: Conversations',
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
    const rv = RunView.FromMetadataProvider(this.Provider);
    const lowerQuery = query.toLowerCase();

    // First get conversations in this environment
    let filter = `ConversationID IN (SELECT ID FROM vwConversations WHERE EnvironmentID='${environmentId}' AND (IsArchived IS NULL OR IsArchived=0))`;
    filter += ` AND LOWER(Message) LIKE '%${EscapeSQLString(lowerQuery)}%'`;
    filter += ` AND (HiddenToUser IS NULL OR HiddenToUser=0)`;

    if (dateRange.start) {
      filter += ` AND __mj_CreatedAt >= '${dateRange.start.toISOString()}'`;
    }
    if (dateRange.end) {
      filter += ` AND __mj_CreatedAt <= '${dateRange.end.toISOString()}'`;
    }

    const result = await rv.RunView<MJConversationDetailEntity>(
      {
        EntityName: 'MJ: Conversation Details',
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
   * Search artifacts by name and description
   * Includes artifacts from both conversations and collections
   */
  private async searchArtifacts(
    query: string,
    environmentId: string,
    currentUser: UserInfo,
    dateRange: DateRange
  ): Promise<SearchResult[]> {
    const rv = RunView.FromMetadataProvider(this.Provider);
    const lowerQuery = query.toLowerCase();

    // Search artifacts directly by name and description
    let filter = `EnvironmentID='${environmentId}'`;
    filter += ` AND (LOWER(Name) LIKE '%${EscapeSQLString(lowerQuery)}%' OR LOWER(Description) LIKE '%${EscapeSQLString(lowerQuery)}%')`;

    if (dateRange.start) {
      filter += ` AND __mj_CreatedAt >= '${dateRange.start.toISOString()}'`;
    }
    if (dateRange.end) {
      filter += ` AND __mj_CreatedAt <= '${dateRange.end.toISOString()}'`;
    }

    const result = await rv.RunView<MJArtifactEntity>(
      {
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `${filter} AND (Visibility IS NULL OR Visibility='Always')`,
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

    const searchResults: SearchResult[] = [];

    // For each artifact, check if it's in a collection for context
    for (const artifact of result.Results) {
      // Check for collection associations
      const collResult = await rv.RunView<MJCollectionArtifactEntity>(
        {
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `ArtifactVersionID IN (
            SELECT ID FROM [__mj].[vwArtifactVersions] WHERE ArtifactID='${artifact.ID}'
          )`,
          MaxRows: 1,
          ResultType: 'entity_object'
        },
        currentUser
      );

      if (collResult.Success && collResult.Results && collResult.Results.length > 0) {
        const collArtifact = collResult.Results[0];
        searchResults.push(
          this.mapArtifactToSearchResult(
            artifact,
            query,
            collArtifact.CollectionID,
            collArtifact.Collection
          )
        );
      } else {
        // No collection association
        searchResults.push(this.mapArtifactToSearchResult(artifact, query));
      }
    }

    return searchResults;
  }

  /**
   * Search collections by name and description
   * Includes both owned collections and shared collections user has access to
   */
  private async searchCollections(
    query: string,
    environmentId: string,
    currentUser: UserInfo,
    dateRange: DateRange
  ): Promise<SearchResult[]> {
    const rv = RunView.FromMetadataProvider(this.Provider);
    const lowerQuery = query.toLowerCase();

    const ownerFilter = `OwnerID='${currentUser.ID}'`;
    const permissionSubquery = `ID IN (
      SELECT CollectionID
      FROM [__mj].[vwCollectionPermissions]
      WHERE UserID='${currentUser.ID}'
    )`;

    let filter = `EnvironmentID='${environmentId}'`;
    filter += ` AND (OwnerID IS NULL OR ${ownerFilter} OR ${permissionSubquery})`;
    filter += ` AND (LOWER(Name) LIKE '%${EscapeSQLString(lowerQuery)}%' OR LOWER(Description) LIKE '%${EscapeSQLString(lowerQuery)}%')`;

    if (dateRange.start) {
      filter += ` AND __mj_CreatedAt >= '${dateRange.start.toISOString()}'`;
    }
    if (dateRange.end) {
      filter += ` AND __mj_CreatedAt <= '${dateRange.end.toISOString()}'`;
    }

    const result = await rv.RunView<MJCollectionEntity>(
      {
        EntityName: 'MJ: Collections',
        ExtraFilter: filter,
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: 100,
        ResultType: 'entity_object'
      },
      currentUser
    );

    if (!result.Success || !result.Results) {
      console.error('Failed to search collections:', result.ErrorMessage);
      return [];
    }

    return result.Results.map(coll => this.mapCollectionToSearchResult(coll, query));
  }

  /**
   * Search tasks by name, description, and notes
   * Only includes tasks in conversations user has access to
   */
  private async searchTasks(
    query: string,
    environmentId: string,
    currentUser: UserInfo,
    dateRange: DateRange
  ): Promise<SearchResult[]> {
    const rv = RunView.FromMetadataProvider(this.Provider);
    const lowerQuery = query.toLowerCase();

    // Build filter using same logic as TasksFullViewComponent
    const md = this.Provider;
    const cd = md.EntityByName('MJ: Conversation Details');
    const c = md.EntityByName('MJ: Conversations');

    if (!cd || !c) {
      console.warn('⚠️ Missing metadata for Conversations or Conversation Details');
      return [];
    }

    let filter = `ParentID IS NULL AND (UserID = '${currentUser.ID}' OR ConversationDetailID IN (
      SELECT ID FROM [${cd.SchemaName}].[${cd.BaseView}]
      WHERE
      UserID ='${currentUser.ID}' OR
      ConversationID IN (
        SELECT ID FROM [${c.SchemaName}].[${c.BaseView}] WHERE UserID='${currentUser.ID}'
      )
    ))`;

    filter += ` AND (LOWER(Name) LIKE '%${EscapeSQLString(lowerQuery)}%' OR LOWER(Description) LIKE '%${EscapeSQLString(lowerQuery)}%')`;

    if (dateRange.start) {
      filter += ` AND __mj_CreatedAt >= '${dateRange.start.toISOString()}'`;
    }
    if (dateRange.end) {
      filter += ` AND __mj_CreatedAt <= '${dateRange.end.toISOString()}'`;
    }

    const result = await rv.RunView<MJTaskEntity>(
      {
        EntityName: 'MJ: Tasks',
        ExtraFilter: filter,
        OrderBy: '__mj_UpdatedAt DESC',
        MaxRows: 100,
        ResultType: 'entity_object'
      },
      currentUser
    );

    if (!result.Success || !result.Results) {
      console.error('Failed to search tasks:', result.ErrorMessage);
      return [];
    }

    return result.Results.map(task => this.mapTaskToSearchResult(task, query));
  }

  /**
   * Map conversation entity to search result
   */
  private mapConversationToSearchResult(conversation: MJConversationEntity, query: string): SearchResult {
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
  private mapMessageToSearchResult(message: MJConversationDetailEntity, query: string): SearchResult {
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
  private mapArtifactToSearchResult(
    artifact: MJArtifactEntity,
    query: string,
    collectionId?: string,
    collectionName?: string
  ): SearchResult {
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
      collectionId,
      collectionName,
      artifactType: artifact.Type || undefined,
      createdAt: artifact.__mj_CreatedAt,
      relevanceScore: score
    };
  }

  /**
   * Map collection entity to search result
   */
  private mapCollectionToSearchResult(collection: MJCollectionEntity, query: string): SearchResult {
    const lowerQuery = query.toLowerCase();
    const name = collection.Name || 'Untitled Collection';
    const description = collection.Description || '';

    let score = 0;
    if (name.toLowerCase().includes(lowerQuery)) score += 10;
    if (description.toLowerCase().includes(lowerQuery)) score += 5;

    const matchedText = this.extractMatchContext(
      name.toLowerCase().includes(lowerQuery) ? name : description,
      query
    );

    return {
      id: collection.ID,
      type: 'collection',
      title: name,
      preview: description || 'No description',
      matchedText,
      collectionId: collection.ID,
      collectionName: name,
      createdAt: collection.__mj_CreatedAt,
      relevanceScore: score
    };
  }

  /**
   * Map task entity to search result
   */
  private mapTaskToSearchResult(task: MJTaskEntity, query: string): SearchResult {
    const lowerQuery = query.toLowerCase();
    const name = task.Name || 'Untitled Task';
    const description = task.Description || '';

    let score = 0;
    if (name.toLowerCase().includes(lowerQuery)) score += 10;
    if (description.toLowerCase().includes(lowerQuery)) score += 5;

    const matchedText = this.extractMatchContext(
      name.toLowerCase().includes(lowerQuery) ? name : description,
      query
    );

    return {
      id: task.ID,
      type: 'task',
      title: name,
      preview: description || 'No description',
      matchedText,
      createdAt: task.__mj_CreatedAt,
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
   * Set search filter
   */
  public SetSearchFilter(filter: SearchFilter): void {
    this._searchFilter$.next(filter);
  }

  /** @deprecated Use {@link SetSearchFilter}. */
  public setSearchFilter(filter: SearchFilter): void {
    return this.SetSearchFilter(filter);
  }

  /**
   * Set date range filter
   */
  public SetDateRange(range: DateRange): void {
    this._dateRange$.next(range);
  }

  /** @deprecated Use {@link SetDateRange}. */
  public setDateRange(range: DateRange): void {
    return this.SetDateRange(range);
  }

  /**
   * Clear all filters
   */
  public ClearFilters(): void {
    this._searchFilter$.next('all');
    this._dateRange$.next({ start: null, end: null });
  }

  /** @deprecated Use {@link ClearFilters}. */
  public clearFilters(): void {
    return this.ClearFilters();
  }

  /**
   * Clear search results
   */
  public ClearResults(): void {
    this._searchResults$.next({
      conversations: [],
      messages: [],
      artifacts: [],
      collections: [],
      tasks: [],
      total: 0
    });
  }

  /** @deprecated Use {@link ClearResults}. */
  public clearResults(): void {
    return this.ClearResults();
  }

  /**
   * Get recent searches
   */
  public GetRecentSearches(): string[] {
    return [...this.recentSearches];
  }

  /** @deprecated Use {@link GetRecentSearches}. */
  public getRecentSearches(): string[] {
    return this.GetRecentSearches();
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
  public ClearRecentSearches(): void {
    this.recentSearches = [];
    this.saveRecentSearches();
  }

  /** @deprecated Use {@link ClearRecentSearches}. */
  public clearRecentSearches(): void {
    return this.ClearRecentSearches();
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
