// The gate lives beside the subscription it protects, and that module carries type-graphql
// decorators — so the metadata shim has to be in place before it is imported.
import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * The cache-invalidation subscription is delivered to every connected client with no per-user
 * filter, so anything `MayBroadcastRecordData` lets through is readable by every signed-in session
 * regardless of row-level security or any tenant scoping a consumer applies on the read path.
 *
 * These cover the gate itself. The important case is the DEFAULT: an untouched deployment must
 * broadcast no row data at all, because that is the configuration everyone upgrades into.
 */
const loadGate = async (recordDataBroadcastEntities: string[] | undefined) => {
  vi.resetModules();
  vi.doMock('../config.js', () => ({
    configInfo: { cacheSettings: recordDataBroadcastEntities ? { recordDataBroadcastEntities } : {} },
  }));
  return (await import('../generic/CacheInvalidationResolver.js')).MayBroadcastRecordData;
};

describe('MayBroadcastRecordData', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('../config.js'));

  it('broadcasts nothing when the deployment has not opted in', async () => {
    const may = await loadGate([]);
    expect(may('Users')).toBe(false);
    expect(may('AI Models')).toBe(false);
  });

  it('broadcasts nothing when cacheSettings is absent entirely', async () => {
    const may = await loadGate(undefined);
    expect(may('Users')).toBe(false);
  });

  it('allows exactly the entities named, and no others', async () => {
    const may = await loadGate(['AI Models']);
    expect(may('AI Models')).toBe(true);
    expect(may('Users')).toBe(false);
    expect(may('AI Model Vendors')).toBe(false);
    // The allowlisted name as a SUBSTRING of another entity must not carry it in. Written this way
    // deliberately: 'AI Model Vendors' above does not contain 'AI Models', so it passes against a
    // loose `includes` match too and proves nothing — a substring mutation survived it.
    expect(may('Archived AI Models 2024')).toBe(false);
    // ...and the reverse direction, where the entity name is a substring of the allowlisted one.
    expect(may('AI Model')).toBe(false);
  });

  it('matches entity names case- and whitespace-insensitively', async () => {
    const may = await loadGate(['  ai models  ']);
    expect(may('AI Models')).toBe(true);
  });

  it("restores the previous broadcast-everything behaviour only on an explicit '*'", async () => {
    const may = await loadGate(['*']);
    expect(may('Users')).toBe(true);
    expect(may('Organization Person Roles')).toBe(true);
  });
});
