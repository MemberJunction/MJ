import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import type { EntityInfo, RunViewParams, UserInfo } from '@memberjunction/core';
import { createFakeProvider } from '@memberjunction/ng-test-utils';
import { SearchService } from '../lib/services/search.service';

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
 * The real SearchService task search: the conversation and message IDs it filters by are read
 * with RunView, never through a subquery over the conversation or message views.
 */
describe('SearchService task search', () => {
  const USER = { ID: 'user-1', Name: 'User One' } as unknown as UserInfo;
  const ENTITIES = {
    'MJ: Tasks': { Name: 'MJ: Tasks', SchemaName: '__mj', BaseView: 'vwTasks' },
    'MJ: Conversations': { Name: 'MJ: Conversations', SchemaName: '__mj', BaseView: 'vwConversations' },
    'MJ: Conversation Details': { Name: 'MJ: Conversation Details', SchemaName: '__mj', BaseView: 'vwConversationDetails' },
  } as unknown as Record<string, EntityInfo>;

  let service: SearchService;
  let queries: RunViewParams[];
  let rows: Record<string, object[]>;

  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    queries = [];
    rows = {};
    service = new SearchService();
    service.Provider = createFakeProvider<object>({
      runViewResults: (params) => {
        queries.push(params);
        return rows[params.EntityName ?? ''] ?? [];
      },
      entityByName: (name) => ENTITIES[name],
    });
    service.setSearchFilter('tasks');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** The ExtraFilter of each query sent for an entity, narrowed to string (`ExtraFilter` is `string | PlatformSQL`). */
  const filtersFor = (entityName: string): string[] =>
    queries.filter((q) => q.EntityName === entityName).map((q) => (typeof q.ExtraFilter === 'string' ? q.ExtraFilter : ''));

  it('searches tasks without a subquery over conversations or their messages', async () => {
    rows['MJ: Conversations'] = [{ ID: 'c1' }];
    rows['MJ: Conversation Details'] = [{ ID: 'd1' }];

    await service.search('plan', 'env-1', USER);

    const allFilters = queries.map((q) => (typeof q.ExtraFilter === 'string' ? q.ExtraFilter : '')).join(' ');
    expect(allFilters).not.toMatch(/vwConversation/i);
    const taskFilter = filtersFor('MJ: Tasks')[0] ?? '';
    expect(taskFilter.startsWith("ParentID IS NULL AND (UserID = 'user-1' OR ConversationDetailID IN ('d1')) AND ")).toBe(true);
    expect(taskFilter).toContain("LOWER(Name) LIKE '%plan%'");
  });

  it('reads the message IDs again on every task search', async () => {
    rows['MJ: Conversations'] = [{ ID: 'c1' }];
    rows['MJ: Conversation Details'] = [{ ID: 'd1' }];

    await service.search('plan', 'env-1', USER);
    rows['MJ: Conversation Details'] = [{ ID: 'd1' }, { ID: 'd2' }];
    await service.search('plan', 'env-1', USER);

    const taskFilters = filtersFor('MJ: Tasks');
    expect(taskFilters).toHaveLength(2);
    expect(taskFilters[1]).toContain("ConversationDetailID IN ('d1','d2')");
  });
});
