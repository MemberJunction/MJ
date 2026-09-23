// The gate lives beside the subscription it protects, and that module carries type-graphql
// decorators — so the metadata shim has to be in place before it is imported.
import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/**
 * The allowlist is normalised where it enters, not where it is compared.
 *
 * Raised in review: the wildcard was matched raw while entity names were trimmed and lowercased,
 * so a hand-edited `[' * ']` matched neither branch and silently opted nothing in — a config that
 * reads as "broadcast everything" while the gate stayed fully closed.
 */
describe('allowlist normalisation', () => {
  afterEach(() => ConfigureRecordDataBroadcast([]));

  it("honours a wildcard written with surrounding whitespace", () => {
    ConfigureRecordDataBroadcast([' * ']);
    expect(MayBroadcastRecordData('Users')).toBe(true);
  });

  it('ignores blank entries rather than letting one match something', () => {
    ConfigureRecordDataBroadcast(['', '   ']);
    expect(MayBroadcastRecordData('Users')).toBe(false);
    // A blank entry must not become a wildcard by accident either.
    expect(MayBroadcastRecordData('')).toBe(false);
  });

  it('still matches a normal name written with odd casing and padding', () => {
    ConfigureRecordDataBroadcast(['  AI MODELS  ']);
    expect(MayBroadcastRecordData('ai models')).toBe(true);
    expect(MayBroadcastRecordData('Users')).toBe(false);
  });
});

/**
 * Entity-level delivery filtering, raised in review.
 *
 * An event for an entity a session cannot read at all tells that session the record exists, its
 * stable key and when it changed — and the session could never have read it, so withholding costs
 * nothing. This does NOT close the row-level case: two sessions that both hold read permission on
 * an entity still see each other's keys. That is tracked separately and deliberately not faked
 * green here.
 */
describe('cacheInvalidationFilter', () => {
  const event = (entityName: string) => ({
    entityName,
    primaryKeyValues: '[{"FieldName":"ID","Value":"r1"}]',
    action: 'save',
    sourceServerId: 's1',
    timestamp: new Date(),
  });
  const session = (userRecord: unknown) => ({ userPayload: { userRecord } });

  const withEntities = async (entities: Array<{ Name: string; CanRead: boolean }>) => {
    vi.resetModules();
    vi.doMock('@memberjunction/core', () => ({
      Metadata: class {
        get Entities() {
          return entities.map((e) => ({
            Name: e.Name,
            GetUserPermisions: () => ({ CanRead: e.CanRead }),
          }));
        }
      },
    }));
    return (await import('../generic/CacheInvalidationResolver.js')).cacheInvalidationFilter;
  };

  afterEach(() => vi.doUnmock('@memberjunction/core'));

  it('delivers an event for an entity the session may read', async () => {
    const filter = await withEntities([{ Name: 'AI Models', CanRead: true }]);
    expect(filter({ payload: event('AI Models') as never, context: session({ ID: 'u1' }) })).toBe(true);
  });

  it('withholds an event for an entity the session may NOT read', async () => {
    const filter = await withEntities([{ Name: 'Users', CanRead: false }]);
    expect(filter({ payload: event('Users') as never, context: session({ ID: 'u1' }) })).toBe(false);
  });

  it('fails closed when the connection carries no user', async () => {
    // onConnect rejects a socket whose token does not validate, so this should not arise — and it
    // is the case least deserving of an unfiltered firehose if it does.
    const filter = await withEntities([{ Name: 'AI Models', CanRead: true }]);
    expect(filter({ payload: event('AI Models') as never, context: undefined })).toBe(false);
    expect(filter({ payload: event('AI Models') as never, context: session(undefined) })).toBe(false);
  });

  it('delivers when the entity is unknown to this server, rather than silently going stale', async () => {
    // Deliberately the opposite choice: a name absent from metadata cannot be permission-checked,
    // and withholding would stop invalidating a legitimately cacheable entity — a correctness bug
    // in place of a disclosure one.
    const filter = await withEntities([{ Name: 'AI Models', CanRead: true }]);
    expect(filter({ payload: event('Some Entity This Server Never Heard Of') as never, context: session({ ID: 'u1' }) })).toBe(true);
  });

  it('withholds an event with no entity name', async () => {
    const filter = await withEntities([{ Name: 'AI Models', CanRead: true }]);
    expect(filter({ payload: { ...event(''), entityName: '' } as never, context: session({ ID: 'u1' }) })).toBe(false);
  });
});
