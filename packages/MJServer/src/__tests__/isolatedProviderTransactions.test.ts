/**
 * Transactions opened outside a GraphQL request run on their OWN provider, never the shared
 * `Metadata.Provider`.
 *
 * A provider's ambient transaction is per INSTANCE, and the global provider is shared by every
 * request, scheduled job and background service. A transaction opened there nests into any other
 * caller's, and while it is open every global-provider write from anywhere lands inside it. One left
 * open swallows them all until the process restarts (MJ#2140). These tests pin the two call sites
 * that used to open their transaction on the global provider: magic-link provisioning and
 * SyncData's delete-with-filter. New-user creation is pinned in newUsers.test.ts.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { Users: [] } },
}));
vi.mock('@memberjunction/communication-engine', () => ({
  CommunicationEngine: { Instance: {} },
}));
vi.mock('@memberjunction/communication-types', () => ({
  Message: class {},
}));
vi.mock('../config.js', () => ({
  configInfo: {},
}));

const factory = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../isolatedProvider.js', () => ({ CreateIsolatedProvider: factory.create }));

import { Metadata, RunView, type IMetadataProvider, type RoleInfo, type UserInfo } from '@memberjunction/core';
import type { MJMagicLinkInviteEntity } from '@memberjunction/core-entities';
import type { MagicLinkConfig } from '../config.js';
import { MagicLinkService } from '../auth/magicLink/MagicLinkService.js';
import { SyncDataResolver, type ActionItemOutputType } from '../resolvers/SyncDataResolver.js';

/** A provider that records every call made on it. */
function recordingProvider(calls: string[], saveSucceeds = true) {
  return {
    BeginTransaction: vi.fn(async () => { calls.push('BeginTransaction'); }),
    CommitTransaction: vi.fn(async () => { calls.push('CommitTransaction'); }),
    RollbackTransaction: vi.fn(async () => { calls.push('RollbackTransaction'); }),
    GetEntityObject: vi.fn(async (entityName: string) => {
      calls.push(`GetEntityObject:${entityName}`);
      const entity: Record<string, unknown> = {
        NewRecord: () => { entity.ID = `id-${entityName}`; },
        Save: async () => saveSucceeds,
        GetAll: () => ({ ID: entity.ID }),
        LatestResult: { CompleteMessage: 'save failed' },
      };
      return entity;
    }),
  };
}

let globalCalls: string[];
let isolatedCalls: string[];

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  globalCalls = [];
  isolatedCalls = [];
  Metadata.Provider = recordingProvider(globalCalls) as unknown as IMetadataProvider;
});

afterEach(() => {
  Metadata.Provider = null as unknown as IMetadataProvider;
  vi.restoreAllMocks();
  factory.create.mockReset();
});

describe('MagicLinkService.createScopedUser', () => {
  const invite = { Email: 'guest@example.com', RoleID: 'role-1', ApplicationID: 'app-1' } as unknown as MJMagicLinkInviteEntity;
  const role = { ID: 'role-1', Name: 'External Guest' } as RoleInfo;
  const contextUser = { ID: 'ctx-user' } as UserInfo;
  const provision = () =>
    new MagicLinkService('https://mj.example.com', {} as MagicLinkConfig)['createScopedUser'](invite, role, contextUser);

  it('provisions inside a transaction on its own provider', async () => {
    factory.create.mockResolvedValue(recordingProvider(isolatedCalls));

    expect((await provision()).success).toBe(true);
    expect(isolatedCalls).toEqual([
      'BeginTransaction',
      'GetEntityObject:MJ: Users',
      'GetEntityObject:MJ: User Roles',
      'GetEntityObject:MJ: User Applications',
      'CommitTransaction',
    ]);
    expect(globalCalls).toEqual([]);
  });

  it('rolls back on its own provider when a save fails', async () => {
    factory.create.mockResolvedValue(recordingProvider(isolatedCalls, false));

    expect((await provision()).success).toBe(false);
    expect(isolatedCalls).toEqual(['BeginTransaction', 'GetEntityObject:MJ: Users', 'RollbackTransaction']);
    expect(globalCalls).toEqual([]);
  });
});

describe('SyncDataResolver.SyncSingleItemDeleteWithFilter', () => {
  const user = { ID: 'system' } as UserInfo;

  /** Rows the filtered view returns; each records its Delete on the shared call log. */
  function stubView(rows: number, deleteSucceeds = true) {
    const fromProvider = vi.spyOn(RunView, 'FromMetadataProvider').mockImplementation(
      () =>
        ({
          RunView: async () => ({
            Success: true,
            Results: Array.from({ length: rows }, (_, i) => ({
              Delete: async () => { isolatedCalls.push(`Delete:${i}`); return deleteSucceeds; },
              LatestResult: { CompleteMessage: 'delete failed' },
            })),
          }),
        }) as unknown as RunView,
    );
    return fromProvider;
  }

  const deleteWithFilter = (providerOverride?: IMetadataProvider) => {
    const result = { Success: false } as ActionItemOutputType;
    const resolver = new SyncDataResolver() as unknown as {
      SyncSingleItemDeleteWithFilter: (...args: unknown[]) => Promise<void>;
    };
    return resolver
      .SyncSingleItemDeleteWithFilter('MJ: Things', "Name = 'x'", result, user, {}, providerOverride)
      .then(() => result);
  };

  it('with no request provider, loads AND deletes on its own provider inside one transaction', async () => {
    const isolated = recordingProvider(isolatedCalls);
    factory.create.mockResolvedValue(isolated);
    const fromProvider = stubView(2);

    const result = await deleteWithFilter();

    expect(result.Success).toBe(true);
    expect(fromProvider).toHaveBeenCalledWith(isolated);
    expect(isolatedCalls).toEqual(['BeginTransaction', 'Delete:0', 'Delete:1', 'CommitTransaction']);
    expect(globalCalls).toEqual([]);
  });

  it('with a request provider, uses it for both the read and the transaction', async () => {
    const requestProvider = recordingProvider(isolatedCalls);
    const fromProvider = stubView(1);

    const result = await deleteWithFilter(requestProvider as unknown as IMetadataProvider);

    expect(result.Success).toBe(true);
    expect(factory.create).not.toHaveBeenCalled();
    expect(fromProvider).toHaveBeenCalledWith(requestProvider);
    expect(isolatedCalls).toEqual(['BeginTransaction', 'Delete:0', 'CommitTransaction']);
    expect(globalCalls).toEqual([]);
  });

  it('rolls back on the same provider when a delete fails', async () => {
    factory.create.mockResolvedValue(recordingProvider(isolatedCalls));
    stubView(2, false);

    const result = await deleteWithFilter();

    expect(result.Success).toBe(false);
    expect(isolatedCalls).toEqual(['BeginTransaction', 'Delete:0', 'RollbackTransaction']);
    expect(globalCalls).toEqual([]);
  });
});
