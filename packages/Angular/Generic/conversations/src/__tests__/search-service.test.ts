import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import { RunViewParams, UserInfo } from '@memberjunction/core';
import { ConversationEngine } from '@memberjunction/core-entities';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';
import { SearchService } from '../lib/services/search.service';
import { ArtifactPermissionService } from '../lib/services/artifact-permission.service';
import { CollectionPermissionService } from '../lib/services/collection-permission.service';

// Test search service logic without Angular DI
interface SearchResult {
  conversationId: string;
  conversationName: string;
  matchingMessages: { id: string; text: string; matchIndex: number }[];
  score: number;
}

interface SearchState {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  totalResults: number;
}

/**
 * Pure logic extraction from SearchService for testing
 */
class TestableSearchLogic {
  private state = new BehaviorSubject<SearchState>({
    query: '',
    results: [],
    isSearching: false,
    totalResults: 0
  });

  get currentState(): SearchState {
    return this.state.value;
  }

  setQuery(query: string): void {
    this.state.next({ ...this.state.value, query });
  }

  setSearching(isSearching: boolean): void {
    this.state.next({ ...this.state.value, isSearching });
  }

  setResults(results: SearchResult[]): void {
    this.state.next({
      ...this.state.value,
      results,
      totalResults: results.length,
      isSearching: false
    });
  }

  clearResults(): void {
    this.state.next({
      ...this.state.value,
      query: '',
      results: [],
      totalResults: 0,
      isSearching: false
    });
  }

  highlightMatch(text: string, query: string): string {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }
}

describe('SearchService logic', () => {
  let service: TestableSearchLogic;

  beforeEach(() => {
    service = new TestableSearchLogic();
  });

  describe('initial state', () => {
    it('should start with empty query', () => {
      expect(service.currentState.query).toBe('');
    });

    it('should start with empty results', () => {
      expect(service.currentState.results).toHaveLength(0);
    });

    it('should not be searching', () => {
      expect(service.currentState.isSearching).toBe(false);
    });
  });

  describe('setQuery', () => {
    it('should update the query', () => {
      service.setQuery('hello');
      expect(service.currentState.query).toBe('hello');
    });
  });

  describe('setSearching', () => {
    it('should update searching state', () => {
      service.setSearching(true);
      expect(service.currentState.isSearching).toBe(true);
    });
  });

  describe('setResults', () => {
    it('should set results and count', () => {
      const results: SearchResult[] = [
        { conversationId: 'c1', conversationName: 'Conv 1', matchingMessages: [], score: 0.9 },
        { conversationId: 'c2', conversationName: 'Conv 2', matchingMessages: [], score: 0.5 }
      ];
      service.setResults(results);
      expect(service.currentState.results).toHaveLength(2);
      expect(service.currentState.totalResults).toBe(2);
      expect(service.currentState.isSearching).toBe(false);
    });
  });

  describe('clearResults', () => {
    it('should reset to empty state', () => {
      service.setQuery('test');
      service.setResults([{ conversationId: 'c1', conversationName: 'C', matchingMessages: [], score: 1 }]);
      service.clearResults();
      expect(service.currentState.query).toBe('');
      expect(service.currentState.results).toHaveLength(0);
      expect(service.currentState.totalResults).toBe(0);
    });
  });

  describe('highlightMatch', () => {
    it('should wrap matched text in mark tags', () => {
      expect(service.highlightMatch('Hello World', 'World')).toBe('Hello <mark>World</mark>');
    });

    it('should be case insensitive', () => {
      expect(service.highlightMatch('Hello World', 'hello')).toBe('<mark>Hello</mark> World');
    });

    it('should handle regex special chars in query', () => {
      expect(service.highlightMatch('Price: $10.00', '$10')).toBe('Price: <mark>$10</mark>.00');
    });

    it('should return text unchanged for empty query', () => {
      expect(service.highlightMatch('Hello', '')).toBe('Hello');
    });

    it('should return text unchanged for empty text', () => {
      expect(service.highlightMatch('', 'test')).toBe('');
    });
  });
});

/**
 * The real SearchService: each sub-search must stay inside what the user can already see,
 * using the same rules as the conversation list and as opening an artifact.
 */
describe('SearchService visibility scope', () => {
  const USER = { ID: 'user-1', Name: 'User One' } as unknown as UserInfo;
  const VISIBLE_CONVERSATIONS = "EnvironmentID='env-1' AND (UserID='user-1')";
  const READABLE_ARTIFACTS = "(UserID='user-1' OR ID IN ('a-shared'))";

  let service: SearchService;
  let artifactPermissions: ArtifactPermissionService;
  let queries: RunViewParams[];
  let rows: Record<string, object[]>;

  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    queries = [];
    rows = {};
    vi.spyOn(ConversationEngine.Instance, 'GetVisibleConversationsFilter').mockResolvedValue(VISIBLE_CONVERSATIONS);
    artifactPermissions = new ArtifactPermissionService(new CollectionPermissionService());
    vi.spyOn(artifactPermissions, 'GetReadableArtifactsFilter').mockResolvedValue(READABLE_ARTIFACTS);

    service = new SearchService(artifactPermissions);
    service.Provider = CreateFakeProvider<object>({
      runViewResults: (params) => {
        queries.push(params);
        return rows[params.EntityName ?? ''] ?? [];
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const queriesFor = (entityName: string): RunViewParams[] => queries.filter((q) => q.EntityName === entityName);

  it('searches only conversations the user can see', async () => {
    service.SetSearchFilter('conversations');

    await service.Search('poem', 'env-1', USER);

    expect(ConversationEngine.Instance.GetVisibleConversationsFilter).toHaveBeenCalledWith('env-1', USER);
    const filter = queriesFor('MJ: Conversations')[0].ExtraFilter ?? '';
    expect(filter.startsWith(`${VISIBLE_CONVERSATIONS} AND (`)).toBe(true);
    expect(filter).toContain("LOWER(Name) LIKE '%poem%'");
  });

  it('searches messages only inside conversations the user can see', async () => {
    rows['MJ: Conversations'] = [{ ID: 'c1' }, { ID: 'c2' }];
    service.SetSearchFilter('messages');

    await service.Search('poem', 'env-1', USER);

    const idQuery = queriesFor('MJ: Conversations')[0];
    expect(idQuery.ExtraFilter).toBe(VISIBLE_CONVERSATIONS);
    expect(idQuery.Fields).toEqual(['ID']);
    expect(idQuery.MaxRows).toBeUndefined();
    const messageFilter = queriesFor('MJ: Conversation Details')[0].ExtraFilter ?? '';
    expect(messageFilter.startsWith("ConversationID IN ('c1','c2') AND ")).toBe(true);
    expect(messageFilter).toContain("LOWER(Message) LIKE '%poem%'");
  });

  it('filters messages without a subquery on another entity', async () => {
    // The PostgreSQL provider quotes only the queried entity's own columns.
    rows['MJ: Conversations'] = [{ ID: 'c1' }];
    service.SetSearchFilter('messages');

    await service.Search('poem', 'env-1', USER);

    expect(queriesFor('MJ: Conversation Details')[0].ExtraFilter).not.toMatch(/SELECT/i);
  });

  it('skips the message query when the user can see no conversations', async () => {
    service.SetSearchFilter('messages');

    const results = await service.Search('poem', 'env-1', USER);

    expect(queriesFor('MJ: Conversation Details')).toHaveLength(0);
    expect(results.messages).toEqual([]);
  });

  it('searches only artifacts the user can read', async () => {
    service.SetSearchFilter('artifacts');

    await service.Search('poem', 'env-1', USER);

    expect(artifactPermissions.GetReadableArtifactsFilter).toHaveBeenCalledWith('user-1', USER);
    const filter = queriesFor('MJ: Artifacts')[0].ExtraFilter ?? '';
    expect(filter.startsWith(`EnvironmentID='env-1' AND ${READABLE_ARTIFACTS} AND (`)).toBe(true);
  });
});
