import 'reflect-metadata';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  Arg,
  AuthorizationError,
  buildSchema,
  Ctx,
  Directive,
  Field,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from 'type-graphql';
import type { GraphQLResolveInfo } from 'graphql';
import type { UserInfo } from '@memberjunction/core';
import type { AppContext } from '../types.js';
import { RequireSystemUserDirective } from '../directives/RequireSystemUser.js';

vi.mock('@memberjunction/server', () => ({
  Arg,
  AuthorizationError,
  CompositeKeyInputType: class CompositeKeyInputType {},
  CompositeKeyOutputType: class CompositeKeyOutputType {},
  Ctx,
  Directive,
  Field,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
}));

vi.mock('../generated/generated.js', () => ({
  MJUserFavorite_: class MJUserFavorite_ {},
  MJUserFavoriteResolverBase: class MJUserFavoriteResolverBase {
    protected async findBy(): Promise<unknown[]> {
      return [];
    }
  },
}));

vi.mock('../config.js', () => ({
  configInfo: {},
  LoadConfig: vi.fn(async () => ({
    sqlLogging: {
      enabled: true,
      maxActiveSessions: 5,
      allowedLogDirectory: '/tmp/mj-test-sql-logs',
    },
  })),
}));

import { EntityPermissionResolver } from '../resolvers/EntityPermissionResolver.js';
import { UserFavoriteResolver, type UserFavoriteSearchParams, type UserFavoriteSetParams } from '../resolvers/UserFavoriteResolver.js';
import { SqlLoggingConfigResolver, type StartSqlLoggingInput } from '../resolvers/SqlLoggingConfigResolver.js';

const ALICE_ID = '11111111-2222-3333-4444-555555555555';
const BOB_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ENTITY_ID = '99999999-8888-7777-6666-555555555555';

function makeContext(userId: string, isSystemUser = false): AppContext {
  const userRecord = { ID: userId, Email: 'alice@example.com' } as unknown as UserInfo;
  const provider = {
    Entities: [{ ID: ENTITY_ID, Name: 'MJ: Users' }],
    GetRecordFavoriteStatus: vi.fn(async () => true),
    SetRecordFavoriteStatus: vi.fn(async () => undefined),
    GetActiveSqlLoggingSessions: vi.fn(() => []),
    CreateSqlLogger: vi.fn(async () => ({
      id: 'sess-1',
      filePath: '/tmp/mj-test-sql-logs/ok.sql',
      startTime: new Date(),
      statementCount: 0,
      options: {},
    })),
  };
  return {
    dataSource: {} as AppContext['dataSource'],
    dataSources: [],
    providers: [{ provider: provider as unknown as AppContext['providers'][0]['provider'], type: 'Read-Write' }],
    userPayload: {
      userRecord,
      email: 'alice@example.com',
      sessionId: 'sess',
      isSystemUser,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EntityPermissionResolver — @RequireSystemUser gate', () => {
  it('blocks non-system users at the GraphQL directive layer', async () => {
    const rawSchema = await buildSchema({
      resolvers: [EntityPermissionResolver],
      validate: false,
    });
    const schema = RequireSystemUserDirective.transformer(rawSchema);
    const field = schema.getQueryType()?.getFields()['CheckEntityPermissionsSystemUser'];
    expect(field?.resolve).toBeDefined();

    expect(() =>
      field!.resolve!(
        undefined,
        { EntityNames: ['MJ: Users'], UserEmail: 'bob@example.com' },
        makeContext(ALICE_ID, false),
        {} as GraphQLResolveInfo
      )
    ).toThrow(/Operation not permitted for this user/);
  });
});

describe('UserFavoriteResolver — IDOR protection', () => {
  const searchParams = (userId: string): UserFavoriteSearchParams => ({
    EntityID: ENTITY_ID,
    UserID: userId,
    CompositeKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'rec-1' }] },
  });

  const setParams = (userId: string): UserFavoriteSetParams => ({
    ...searchParams(userId),
    IsFavorite: true,
  });

  it('refuses reading or setting another user’s favorites for a regular caller', async () => {
    const resolver = new UserFavoriteResolver();
    const aliceCtx = makeContext(ALICE_ID, false);

    await expect(resolver.UserFavoriteSearchByParams(searchParams(BOB_ID), aliceCtx)).rejects.toThrow(
      /Access denied: UserID does not match the authenticated user/
    );
    await expect(resolver.GetRecordFavoriteStatus(searchParams(BOB_ID), aliceCtx)).rejects.toThrow(
      /Access denied: UserID does not match the authenticated user/
    );
    await expect(resolver.SetRecordFavoriteStatus(setParams(BOB_ID), aliceCtx)).rejects.toThrow(
      /Access denied: UserID does not match the authenticated user/
    );
  });

  it('allows the caller’s own UserID (case-insensitively) and allows the system user', async () => {
    const resolver = new UserFavoriteResolver();
    const aliceCtx = makeContext(ALICE_ID, false);
    const sysCtx = makeContext(ALICE_ID, true);

    await expect(resolver.GetRecordFavoriteStatus(searchParams(ALICE_ID.toUpperCase()), aliceCtx)).resolves.toMatchObject({
      Success: true,
      IsFavorite: true,
    });
    await expect(resolver.GetRecordFavoriteStatus(searchParams(BOB_ID), sysCtx)).resolves.toMatchObject({
      Success: true,
    });
  });
});

describe('SqlLoggingConfigResolver — path traversal containment', () => {
  it.each(['../escape.sql', 'sub/nested.sql', 'sub\\nested.sql', '..'])(
    'rejects fileName "%s" containing separators or parent references',
    async (badName) => {
      const resolver = new SqlLoggingConfigResolver();
      vi.spyOn(
        resolver as unknown as { checkOwnerAccess(ctx: AppContext): Promise<void> },
        'checkOwnerAccess'
      ).mockResolvedValue(undefined);
      vi.spyOn(
        resolver as unknown as { ensureDirectoryExists(dir: string): Promise<void> },
        'ensureDirectoryExists'
      ).mockResolvedValue(undefined);

      const input = { fileName: badName, filterToCurrentUser: false } as StartSqlLoggingInput;
      await expect(resolver.startSqlLogging(input, makeContext(ALICE_ID, true))).rejects.toThrow(
        /Invalid file name/
      );
    }
  );
});
