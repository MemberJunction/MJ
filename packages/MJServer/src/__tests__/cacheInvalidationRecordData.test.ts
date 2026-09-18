// The gate lives beside the subscription it protects, and that module carries type-graphql
// decorators — so the metadata shim has to be in place before it is imported.
import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConfigureRecordDataBroadcast,
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
