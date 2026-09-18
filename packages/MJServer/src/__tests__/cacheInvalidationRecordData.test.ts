// The gate lives beside the subscription it protects, and that module carries type-graphql
// decorators — so the metadata shim has to be in place before it is imported.
import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConfigureRecordDataBroadcast,
  MayBroadcastPrimaryKey,
  MayBroadcastRecordData,
} from '../generic/CacheInvalidationResolver.js';

/**
 * The cache-invalidation subscription is delivered to every connected client with no per-user
 * filter, so anything `MayBroadcastRecordData` lets through is readable by every signed-in session
 * regardless of row-level security or any tenant scoping a consumer applies on the read path.
 *
 * The important case is the DEFAULT: an untouched deployment must broadcast no row data at all,
 * because that is the configuration everyone upgrades into.
 */
describe('MayBroadcastRecordData', () => {
  afterEach(() => ConfigureRecordDataBroadcast([]));

  it('broadcasts nothing before anything has configured it', () => {
    // No ConfigureRecordDataBroadcast call at all — the state a process starts in, and the state it
    // stays in if bootstrap ever stops calling it. Failing closed there is the whole point.
    expect(MayBroadcastRecordData('Users')).toBe(false);
    expect(MayBroadcastRecordData('AI Models')).toBe(false);
  });

  it('broadcasts nothing when the deployment has not opted in', () => {
    ConfigureRecordDataBroadcast([]);
    expect(MayBroadcastRecordData('Users')).toBe(false);
  });

  it('broadcasts nothing when the config value is absent', () => {
    ConfigureRecordDataBroadcast(undefined);
    expect(MayBroadcastRecordData('Users')).toBe(false);
  });

  it('allows exactly the entities named, and no others', () => {
    ConfigureRecordDataBroadcast(['AI Models']);
    expect(MayBroadcastRecordData('AI Models')).toBe(true);
    expect(MayBroadcastRecordData('Users')).toBe(false);
    expect(MayBroadcastRecordData('AI Model Vendors')).toBe(false);
    // The allowlisted name as a SUBSTRING of another entity must not carry it in. Written this way
    // deliberately: 'AI Model Vendors' above does not contain 'AI Models', so it passes against a
    // loose `includes` match too and proves nothing — a substring mutation survived it.
    expect(MayBroadcastRecordData('Archived AI Models 2024')).toBe(false);
    // ...and the reverse direction, where the entity name is a substring of the allowlisted one.
    expect(MayBroadcastRecordData('AI Model')).toBe(false);
  });

  it('matches entity names case- and whitespace-insensitively', () => {
    ConfigureRecordDataBroadcast(['  ai models  ']);
    expect(MayBroadcastRecordData('AI Models')).toBe(true);
  });

  it("restores the previous broadcast-everything behaviour only on an explicit '*'", () => {
    ConfigureRecordDataBroadcast(['*']);
    expect(MayBroadcastRecordData('Users')).toBe(true);
    expect(MayBroadcastRecordData('Organization Person Roles')).toBe(true);
  });
});

/**
 * Importing this module must not drag server config loading in with it.
 *
 * The first version of this change read `configInfo` at module scope. `config.ts` runs
 * `loadConfig()` on import, so every test that touched the resolver — directly or through
 * ResolverBase — died at import with "Configuration validation failed". CI caught it; this keeps
 * it caught.
 */
describe('CacheInvalidationResolver module surface', () => {
  it('imports without any server configuration present', async () => {
    await expect(import('../generic/CacheInvalidationResolver.js')).resolves.toBeDefined();
  });
});

/**
 * The record id is withheld on a save that withholds the row — and only there.
 *
 * Verified against both consumers before writing this: LocalCacheManager and BaseEngine read
 * `primaryKeyValues` ONLY under `action === 'delete'`. On a save they build the key from
 * `recordData` (`buildCompositeKeyFromRow`), so once the row is withheld the key is read by nobody
 * and its only effect is to disclose the id of a record the subscriber may not be entitled to.
 */
describe('MayBroadcastPrimaryKey', () => {
  afterEach(() => ConfigureRecordDataBroadcast([]));

  it('withholds the key on a save whose row is withheld', () => {
    ConfigureRecordDataBroadcast([]);
    expect(MayBroadcastPrimaryKey('save', 'MJ: Conversation Details')).toBe(false);
  });

  it('sends the key on a save whose row is going anyway', () => {
    // Nothing is gained by hiding the id of a row being shipped in full beside it.
    ConfigureRecordDataBroadcast(['AI Models']);
    expect(MayBroadcastPrimaryKey('save', 'AI Models')).toBe(true);
    expect(MayBroadcastPrimaryKey('save', 'MJ: Conversation Details')).toBe(false);
  });

  it('always sends the key on a delete, which is the one path that reads it', () => {
    // A delete carries no row content to withhold, and both consumers need the key to drop that one
    // row; without it they fall back to invalidating the whole entity for no privacy gain.
    ConfigureRecordDataBroadcast([]);
    expect(MayBroadcastPrimaryKey('delete', 'MJ: Conversation Details')).toBe(true);
  });
});
