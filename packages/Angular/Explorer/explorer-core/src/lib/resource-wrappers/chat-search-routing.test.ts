import { describe, expect, it } from 'vitest';
import type { SearchResult } from '@memberjunction/ng-conversations';
import { ResolveChatSearchRoute } from './chat-search-routing.js';

function result(overrides: Partial<SearchResult> & Pick<SearchResult, 'id' | 'type'>): SearchResult {
  return {
    title: 'Title',
    preview: 'Preview',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    relevanceScore: 10,
    ...overrides,
  };
}

describe('ResolveChatSearchRoute', () => {
  it('opens a conversation result in place', () => {
    expect(ResolveChatSearchRoute(result({ id: 'C1', type: 'conversation', conversationId: 'C1' }))).toEqual({
      Kind: 'conversation',
      ConversationId: 'C1',
    });
  });

  it('opens the parent conversation of a message result', () => {
    expect(ResolveChatSearchRoute(result({ id: 'M1', type: 'message', conversationId: 'C9' }))).toEqual({
      Kind: 'conversation',
      ConversationId: 'C9',
    });
  });

  it('does nothing for a message result with no conversation', () => {
    expect(ResolveChatSearchRoute(result({ id: 'M1', type: 'message' }))).toBeNull();
  });

  it('opens an artifact directly, even when it belongs to a collection', () => {
    expect(
      ResolveChatSearchRoute(result({ id: 'A1', type: 'artifact', title: 'Q3 Report', collectionId: 'COL1' }))
    ).toEqual({ Kind: 'artifact', ArtifactId: 'A1', Title: 'Q3 Report' });
  });

  it('opens an artifact that belongs to no collection', () => {
    expect(ResolveChatSearchRoute(result({ id: 'A2', type: 'artifact', title: 'Draft' }))).toEqual({
      Kind: 'artifact',
      ArtifactId: 'A2',
      Title: 'Draft',
    });
  });

  it('opens a collection result on the Collections nav item', () => {
    expect(ResolveChatSearchRoute(result({ id: 'COL1', type: 'collection' }))).toEqual({
      Kind: 'nav-item',
      NavItemName: 'Collections',
      Configuration: { collectionId: 'COL1' },
    });
  });

  it('opens a task result on the Tasks nav item', () => {
    expect(ResolveChatSearchRoute(result({ id: 'T1', type: 'task' }))).toEqual({
      Kind: 'nav-item',
      NavItemName: 'Tasks',
      Configuration: { taskId: 'T1' },
    });
  });
});
