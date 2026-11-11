/**
 * The binding cache the login path reads on every request: exact issuer + subject lookup, the
 * once-a-day `LastLoginAt` write, and a failed binding save that does not throw.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('@memberjunction/core', () => ({
  BaseEngine: class {
    public LoadedConfigs: unknown[] = [];
    public ProviderToUse: unknown;
    protected async Load(configs: unknown[]): Promise<void> {
      this.LoadedConfigs = configs;
    }
    protected GetConfigData<T>(propertyName: string): T[] {
      return (this as unknown as Record<string, T[]>)[propertyName] ?? [];
    }
    public static getInstance<T>(this: new () => T): T {
      return new this();
    }
  },
  LogError: vi.fn(),
}));

import { UserExternalIdentityEngine } from '../UserExternalIdentityEngine.js';

/** The fields of a binding row the engine reads and writes. */
interface FakeBinding {
  ID: string;
  UserID: string;
  Issuer: string;
  Subject: string;
  ProviderName: string | null;
  LastLoginAt: Date | null;
  PrimaryKey: { ID: string };
  LatestResult?: { CompleteMessage: string };
  NewRecord: () => void;
  Save: () => Promise<boolean>;
  InnerLoad: () => Promise<boolean>;
}

const ISSUER = 'https://login.example/';
const DAY_MS = 24 * 60 * 60 * 1000;
const systemUser = { ID: 'system' } as UserInfo;

function row(id: string, userID: string, subject: string, lastLoginAt: Date | null = null): FakeBinding {
  return {
    ID: id,
    UserID: userID,
    Issuer: ISSUER,
    Subject: subject,
    ProviderName: null,
    LastLoginAt: lastLoginAt,
    PrimaryKey: { ID: id },
    NewRecord: vi.fn(),
    Save: vi.fn().mockResolvedValue(true),
    InnerLoad: vi.fn().mockResolvedValue(true),
  };
}

/** An engine holding `bindings`, whose provider hands out `entity` for every GetEntityObject call. */
function engineWith(bindings: FakeBinding[], entity: FakeBinding = row('new-id', '', '')) {
  const engine = new (UserExternalIdentityEngine as unknown as new () => UserExternalIdentityEngine)();
  const getEntityObject = vi.fn().mockResolvedValue(entity);
  const internals = engine as unknown as { _bindings: FakeBinding[]; ProviderToUse: { GetEntityObject: typeof getEntityObject } };
  internals._bindings = bindings;
  internals.ProviderToUse = { GetEntityObject: getEntityObject };
  return { engine, entity, getEntityObject };
}

describe('UserExternalIdentityEngine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads every binding, unfiltered', async () => {
    const { engine } = engineWith([]);
    await engine.Config();
    expect((engine as unknown as { LoadedConfigs: unknown[] }).LoadedConfigs).toEqual([
      { PropertyName: '_bindings', EntityName: 'MJ: User External Identities', CacheLocal: true },
    ]);
  });

  it('finds a binding only on an exact issuer and subject match', () => {
    const { engine } = engineWith([row('b1', 'user-a', 'sub-a')]);
    expect(engine.FindBinding(ISSUER, 'sub-a')?.ID).toBe('b1');
    expect(engine.FindBinding(ISSUER, 'SUB-A')).toBeUndefined();
    expect(engine.FindBinding('https://other.example/', 'sub-a')).toBeUndefined();
  });

  it('lists a user\'s bindings, comparing IDs case-insensitively', () => {
    const { engine } = engineWith([row('b1', 'AAAA-1', 's1'), row('b2', 'bbbb-2', 's2'), row('b3', 'aaaa-1', 's3')]);
    expect(engine.BindingsForUser('aaaa-1').map((b) => b.ID)).toEqual(['b1', 'b3']);
  });

  it('saves a new binding and returns its ID', async () => {
    const { engine, entity } = engineWith([]);
    const id = await engine.CreateBinding('user-a', { Issuer: ISSUER, Subject: 'sub-a', ProviderName: 'okta' }, systemUser);
    expect(id).toBe('new-id');
    expect(entity).toMatchObject({ UserID: 'user-a', Issuer: ISSUER, Subject: 'sub-a', ProviderName: 'okta' });
    expect(entity.LastLoginAt).toBeInstanceOf(Date);
  });

  it('returns undefined instead of throwing when the save fails', async () => {
    const entity = row('new-id', '', '');
    entity.Save = vi.fn().mockResolvedValue(false);
    entity.LatestResult = { CompleteMessage: 'Violation of UNIQUE KEY constraint' };
    const { engine } = engineWith([], entity);
    expect(await engine.CreateBinding('user-a', { Issuer: ISSUER, Subject: 'sub-a' }, systemUser)).toBeUndefined();
  });

  it('writes LastLoginAt when it is missing or over a day old', async () => {
    const stale = row('b1', 'user-a', 'sub-a', new Date(Date.now() - DAY_MS - 60_000));
    const { engine, entity } = engineWith([stale]);
    await engine.TouchLastLogin('b1', systemUser);
    expect(entity.InnerLoad).toHaveBeenCalledWith({ ID: 'b1' });
    expect(entity.Save).toHaveBeenCalledTimes(1);

    const missing = row('b2', 'user-a', 'sub-b', null);
    const second = engineWith([missing]);
    await second.engine.TouchLastLogin('b2', systemUser);
    expect(second.entity.Save).toHaveBeenCalledTimes(1);
  });

  it('skips the write when LastLoginAt is under a day old or the binding is unknown', async () => {
    const { engine, getEntityObject } = engineWith([row('b1', 'user-a', 'sub-a', new Date(Date.now() - 60_000))]);
    await engine.TouchLastLogin('b1', systemUser);
    await engine.TouchLastLogin('unknown', systemUser);
    expect(getEntityObject).not.toHaveBeenCalled();
  });

  it('writes once when the same binding is touched twice concurrently', async () => {
    const { engine, entity } = engineWith([row('b1', 'user-a', 'sub-a', null)]);
    await Promise.all([engine.TouchLastLogin('b1', systemUser), engine.TouchLastLogin('b1', systemUser)]);
    expect(entity.Save).toHaveBeenCalledTimes(1);
  });
});
