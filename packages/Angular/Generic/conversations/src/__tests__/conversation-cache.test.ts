import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests for the compound conversation data cache used by ConversationChatAreaComponent.
 *
 * The cache stores both raw query data and hydrated entity objects in a single Map entry.
 * This test exercises the cache logic in isolation (no Angular, no real entities) to verify:
 * - Compound cache structure (raw + nullable entities)
 * - Cache hit paths: entities present vs only raw present vs miss
 * - Invalidation clears both raw and entities
 * - In-place patching of raw data preserves entity references
 */

/** Minimal stand-in for ConversationDetailComplete (raw query row) */
interface MockRawRow {
  ID: string;
  ConversationID: string;
  Message: string;
  Role: string;
  Status: string;
  IsPinned: boolean;
}

/** Minimal stand-in for a hydrated entity object */
interface MockEntity {
  ID: string;
  Message: string;
  Status: string;
  IsPinned: boolean;
}

/** The compound cache entry shape matching the component's implementation */
interface CacheEntry {
  raw: MockRawRow[];
  entities: MockEntity[] | null;
}

/**
 * Extracts the cache management logic from ConversationChatAreaComponent
 * for isolated testing without Angular dependencies.
 */
class TestableConversationCache {
  private cache = new Map<string, CacheEntry>();

  has(conversationId: string): boolean {
    return this.cache.has(conversationId);
  }

  get(conversationId: string): CacheEntry | undefined {
    return this.cache.get(conversationId);
  }

  /** Store raw data from server (first visit) */
  setRaw(conversationId: string, raw: MockRawRow[]): void {
    this.cache.set(conversationId, { raw, entities: null });
  }

  /** Store hydrated entities after conversion */
  setEntities(conversationId: string, entities: MockEntity[]): void {
    const entry = this.cache.get(conversationId);
    if (entry) {
      entry.entities = entities;
    }
  }

  /** Invalidate both raw and entities */
  invalidate(conversationId: string): void {
    this.cache.delete(conversationId);
  }

  /** Patch raw data in-place (e.g., after pin toggle) */
  patchRaw(conversationId: string, messageId: string, patch: Partial<MockRawRow>): void {
    const entry = this.cache.get(conversationId);
    if (entry) {
      const row = entry.raw.find(r => r.ID === messageId);
      if (row) {
        Object.assign(row, patch);
      }
    }
  }

  /** Update raw data with fresh server data (invalidates entities) */
  refreshRaw(conversationId: string, raw: MockRawRow[]): void {
    this.cache.set(conversationId, { raw, entities: null });
  }

  get size(): number {
    return this.cache.size;
  }
}

/** Simulate the 3-path loadMessages logic */
function resolveLoadPath(cache: TestableConversationCache, conversationId: string): 'cached-entities' | 'cached-raw' | 'server-fetch' {
  const entry = cache.get(conversationId);
  if (entry?.entities) return 'cached-entities';
  if (entry) return 'cached-raw';
  return 'server-fetch';
}

// ─── Test data ───────────────────────────────────────────────────────────

function createRawRows(conversationId: string, count: number): MockRawRow[] {
  return Array.from({ length: count }, (_, i) => ({
    ID: `detail-${i}`,
    ConversationID: conversationId,
    Message: `Message ${i}`,
    Role: i % 2 === 0 ? 'user' : 'AI',
    Status: 'Completed',
    IsPinned: false,
  }));
}

function createEntities(rawRows: MockRawRow[]): MockEntity[] {
  return rawRows.map(r => ({
    ID: r.ID,
    Message: r.Message,
    Status: r.Status,
    IsPinned: r.IsPinned,
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('Conversation Compound Cache', () => {
  let cache: TestableConversationCache;
  const convA = 'conv-aaa';
  const convB = 'conv-bbb';

  beforeEach(() => {
    cache = new TestableConversationCache();
  });

  describe('Cache structure', () => {
    it('should start empty', () => {
      expect(cache.size).toBe(0);
      expect(cache.has(convA)).toBe(false);
    });

    it('should store raw data with null entities on first visit', () => {
      const raw = createRawRows(convA, 5);
      cache.setRaw(convA, raw);

      const entry = cache.get(convA);
      expect(entry).toBeDefined();
      expect(entry!.raw).toBe(raw);
      expect(entry!.entities).toBeNull();
    });

    it('should store entities alongside raw data after conversion', () => {
      const raw = createRawRows(convA, 5);
      cache.setRaw(convA, raw);

      const entities = createEntities(raw);
      cache.setEntities(convA, entities);

      const entry = cache.get(convA);
      expect(entry!.raw).toBe(raw);
      expect(entry!.entities).toBe(entities);
      expect(entry!.entities).toHaveLength(5);
    });
  });

  describe('Load path resolution', () => {
    it('should resolve to server-fetch when cache is empty', () => {
      expect(resolveLoadPath(cache, convA)).toBe('server-fetch');
    });

    it('should resolve to cached-raw when only raw data exists', () => {
      cache.setRaw(convA, createRawRows(convA, 3));
      expect(resolveLoadPath(cache, convA)).toBe('cached-raw');
    });

    it('should resolve to cached-entities when entities are populated', () => {
      const raw = createRawRows(convA, 3);
      cache.setRaw(convA, raw);
      cache.setEntities(convA, createEntities(raw));
      expect(resolveLoadPath(cache, convA)).toBe('cached-entities');
    });

    it('should handle multiple conversations independently', () => {
      const rawA = createRawRows(convA, 3);
      cache.setRaw(convA, rawA);
      cache.setEntities(convA, createEntities(rawA));

      cache.setRaw(convB, createRawRows(convB, 2));

      expect(resolveLoadPath(cache, convA)).toBe('cached-entities');
      expect(resolveLoadPath(cache, convB)).toBe('cached-raw');
    });
  });

  describe('Invalidation', () => {
    it('should remove both raw and entities on invalidate', () => {
      const raw = createRawRows(convA, 3);
      cache.setRaw(convA, raw);
      cache.setEntities(convA, createEntities(raw));

      cache.invalidate(convA);

      expect(cache.has(convA)).toBe(false);
      expect(cache.get(convA)).toBeUndefined();
      expect(resolveLoadPath(cache, convA)).toBe('server-fetch');
    });

    it('should not affect other conversations when invalidating one', () => {
      cache.setRaw(convA, createRawRows(convA, 3));
      cache.setRaw(convB, createRawRows(convB, 2));

      cache.invalidate(convA);

      expect(cache.has(convA)).toBe(false);
      expect(cache.has(convB)).toBe(true);
    });
  });

  describe('Raw data refresh', () => {
    it('should replace raw data and clear entities on refresh', () => {
      const raw = createRawRows(convA, 3);
      cache.setRaw(convA, raw);
      cache.setEntities(convA, createEntities(raw));

      const freshRaw = createRawRows(convA, 5);
      cache.refreshRaw(convA, freshRaw);

      const entry = cache.get(convA);
      expect(entry!.raw).toBe(freshRaw);
      expect(entry!.raw).toHaveLength(5);
      expect(entry!.entities).toBeNull(); // entities cleared
      expect(resolveLoadPath(cache, convA)).toBe('cached-raw');
    });
  });

  describe('In-place raw patching', () => {
    it('should patch a specific row in raw data', () => {
      const raw = createRawRows(convA, 3);
      cache.setRaw(convA, raw);

      cache.patchRaw(convA, 'detail-1', { IsPinned: true });

      const entry = cache.get(convA);
      expect(entry!.raw[1].IsPinned).toBe(true);
      // Other rows unaffected
      expect(entry!.raw[0].IsPinned).toBe(false);
      expect(entry!.raw[2].IsPinned).toBe(false);
    });

    it('should not affect entities when patching raw data', () => {
      const raw = createRawRows(convA, 3);
      cache.setRaw(convA, raw);
      const entities = createEntities(raw);
      cache.setEntities(convA, entities);

      cache.patchRaw(convA, 'detail-1', { IsPinned: true });

      // Raw is patched
      expect(cache.get(convA)!.raw[1].IsPinned).toBe(true);
      // Entity objects are separate — not patched by raw patch
      // (In the real component, the entity is already mutated by .Save())
      expect(cache.get(convA)!.entities![1].IsPinned).toBe(false);
    });

    it('should be a no-op for non-existent conversation', () => {
      cache.patchRaw('nonexistent', 'detail-0', { IsPinned: true });
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should be a no-op for non-existent message ID', () => {
      const raw = createRawRows(convA, 2);
      cache.setRaw(convA, raw);

      cache.patchRaw(convA, 'nonexistent-detail', { IsPinned: true });

      // Nothing changed
      expect(raw.every(r => r.IsPinned === false)).toBe(true);
    });
  });

  describe('Conversation switching simulation', () => {
    it('should provide instant switch when entities are cached', () => {
      // Visit conversation A — full load
      const rawA = createRawRows(convA, 10);
      cache.setRaw(convA, rawA);
      cache.setEntities(convA, createEntities(rawA));

      // Visit conversation B — full load
      const rawB = createRawRows(convB, 5);
      cache.setRaw(convB, rawB);
      cache.setEntities(convB, createEntities(rawB));

      // Switch back to A — should be instant (cached-entities path)
      expect(resolveLoadPath(cache, convA)).toBe('cached-entities');
      const entryA = cache.get(convA)!;
      expect(entryA.entities).toHaveLength(10);

      // Switch to B — also instant
      expect(resolveLoadPath(cache, convB)).toBe('cached-entities');
      const entryB = cache.get(convB)!;
      expect(entryB.entities).toHaveLength(5);
    });

    it('should fall back to raw conversion after invalidation', () => {
      const raw = createRawRows(convA, 3);
      cache.setRaw(convA, raw);
      cache.setEntities(convA, createEntities(raw));

      // New message arrives — cache invalidated
      cache.invalidate(convA);

      // Re-fetch from server, store new raw
      const freshRaw = createRawRows(convA, 4);
      cache.setRaw(convA, freshRaw);

      // Should need conversion (cached-raw path, not cached-entities)
      expect(resolveLoadPath(cache, convA)).toBe('cached-raw');

      // After conversion
      cache.setEntities(convA, createEntities(freshRaw));
      expect(resolveLoadPath(cache, convA)).toBe('cached-entities');
    });
  });
});
