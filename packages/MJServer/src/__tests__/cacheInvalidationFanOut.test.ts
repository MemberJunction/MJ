import { describe, it, expect, vi, afterEach } from 'vitest';
import { ParseReplicatedCacheInvalidation, ReplicateCacheInvalidation, SetCacheInvalidationPublishHook } from '../generic/CacheInvalidationFanOut.js';
import type { CacheInvalidationPayload } from '../generic/CacheInvalidationResolver.js';

/**
 * Cross-process CACHE_INVALIDATION (MJ #5510, part B).
 *
 * A save in one MJAPI process used to reach only the browsers whose socket is attached to THAT
 * process. Running background work (agents, scheduled jobs) in a separate worker process — the fix
 * for a stall in one taking every interactive user down — would then mean the worker's saves reach
 * no browser at all. These pin the wire format both ends agree on.
 */

const LOCAL = 'local-server-id';

function payload(overrides: Partial<CacheInvalidationPayload> = {}): CacheInvalidationPayload {
  return {
    entityName: 'MJ: Conversation Details',
    primaryKeyValues: JSON.stringify([{ FieldName: 'ID', Value: 'abc' }]),
    action: 'save',
    sourceServerId: 'worker-server-id',
    timestamp: new Date('2026-10-12T14:02:00.000Z'),
    ...overrides,
  };
}

describe('ParseReplicatedCacheInvalidation', () => {
  it("round-trips a peer's event, timestamp back to a Date", () => {
    const parsed = ParseReplicatedCacheInvalidation(JSON.stringify(payload({ recordData: '{"ID":"abc"}' })), LOCAL);
    expect(parsed).toEqual(payload({ recordData: '{"ID":"abc"}' }));
    expect(parsed?.timestamp).toBeInstanceOf(Date);
  });

  it("drops this process's own event echoed back by Redis", () => {
    expect(ParseReplicatedCacheInvalidation(JSON.stringify(payload({ sourceServerId: LOCAL })), LOCAL)).toBeNull();
  });

  it('drops malformed JSON', () => {
    expect(ParseReplicatedCacheInvalidation('{not json', LOCAL)).toBeNull();
  });

  it('drops an event with no entity name — the subscription filter could not permission-check it', () => {
    expect(ParseReplicatedCacheInvalidation(JSON.stringify(payload({ entityName: '' })), LOCAL)).toBeNull();
  });

  it('drops an event whose fields have the wrong types', () => {
    const bad = { ...payload(), primaryKeyValues: 42 };
    expect(ParseReplicatedCacheInvalidation(JSON.stringify(bad), LOCAL)).toBeNull();
  });

  it('drops an event with no source — it could be our own and would loop', () => {
    const noSource: Partial<CacheInvalidationPayload> = payload();
    delete noSource.sourceServerId;
    expect(ParseReplicatedCacheInvalidation(JSON.stringify(noSource), LOCAL)).toBeNull();
  });

  it('keeps an entity-level event (no primary key)', () => {
    expect(ParseReplicatedCacheInvalidation(JSON.stringify(payload({ primaryKeyValues: null })), LOCAL)?.primaryKeyValues).toBeNull();
  });
});

describe('ReplicateCacheInvalidation', () => {
  afterEach(() => SetCacheInvalidationPublishHook(undefined));

  it('does nothing without a hook (no shared cache configured)', () => {
    expect(() => ReplicateCacheInvalidation(payload())).not.toThrow();
  });

  it('hands the event to the hook', () => {
    const hook = vi.fn();
    SetCacheInvalidationPublishHook(hook);
    ReplicateCacheInvalidation(payload());
    expect(hook).toHaveBeenCalledWith(payload());
  });

  it('never lets a failing bus break the save that triggered it', () => {
    SetCacheInvalidationPublishHook(() => {
      throw new Error('redis is down');
    });
    expect(() => ReplicateCacheInvalidation(payload())).not.toThrow();
  });
});
