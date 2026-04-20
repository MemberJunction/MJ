import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';

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
