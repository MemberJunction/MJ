import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  GraphQLFieldResolver,
  GraphQLResolveInfo,
  GraphQLSchema,
  executeSync,
  parse,
} from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { AuthorizationError } from 'type-graphql';
import { EntityInfo, EntityFieldInfo, DatasetItemResultType, UserInfo } from '@memberjunction/core';
import sql from 'mssql';
import {
  ApplyBuiltInDirectivesTransformer,
  RequireSystemUserDirective,
  PublicDirective,
} from '../directives/index.js';
import {
  RunViewResolver,
  RunViewResultRow,
  frozenRowSerializationCache,
} from '../generic/RunViewResolver.js';
import {
  DatasetResolverBase,
  datasetItemJsonCache,
} from '../resolvers/DatasetResolver.js';
import { AppContext, UserPayload } from '../types.js';

function createTestContext(options: {
  isActive?: boolean;
  isSystemUser?: boolean;
}): AppContext {
  const user = new UserInfo();
  user.IsActive = options.isActive ?? false;

  const payload: UserPayload = {
    email: 'tester@example.com',
    sessionId: 'session-wave4-7',
    isSystemUser: options.isSystemUser ?? false,
    userRecord: user,
  };

  return {
    dataSource: new sql.ConnectionPool({ server: 'localhost' }),
    dataSources: [],
    providers: [],
    userPayload: payload,
  };
}

class TestRunViewResolver extends RunViewResolver {
  public testProcessRawData(
    rawData: Record<string, unknown>[],
    entityId: string,
    entityInfo: EntityInfo
  ): RunViewResultRow[] {
    return this.processRawData(rawData, entityId, entityInfo);
  }
}

class TestDatasetResolver extends DatasetResolverBase {
  public testSerializeDatasetItems(items: DatasetItemResultType[]): string {
    return this.SerializeDatasetItems(items);
  }
}

describe('Wave 4.7 Wire, Schema Diet & Directives Optimizations', () => {
  describe('RequireSystemUserDirective', () => {
    it('does not wrap non-@RequireSystemUser fields with a new resolver closure', () => {
      const typeDefs = `
        directive @RequireSystemUser on FIELD_DEFINITION
        type Query {
          plainField: String
          systemField: String @RequireSystemUser
        }
      `;
      const plainResolver: GraphQLFieldResolver<unknown, AppContext> = () => 'plain';
      const systemResolver: GraphQLFieldResolver<unknown, AppContext> = () => 'system';

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            plainField: plainResolver,
            systemField: systemResolver,
          },
        },
      });

      const fieldBefore = schema.getQueryType()?.getFields().plainField;
      const transformed = RequireSystemUserDirective.transformer(schema);
      const fieldAfter = transformed.getQueryType()?.getFields().plainField;

      // The transformer must return fieldConfig unchanged when @RequireSystemUser is absent
      expect(fieldAfter?.resolve).toBe(fieldBefore?.resolve);
    });

    it('throws AuthorizationError when isSystemUser is falsy and succeeds when true', () => {
      const typeDefs = `
        directive @RequireSystemUser on FIELD_DEFINITION
        type Query {
          systemField: String @RequireSystemUser
        }
      `;
      const systemResolver: GraphQLFieldResolver<unknown, AppContext> = () => 'system-ok';
      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: { Query: { systemField: systemResolver } },
      });

      const transformed = RequireSystemUserDirective.transformer(schema);
      const systemField = transformed.getQueryType()?.getFields().systemField;
      expect(systemField?.resolve).toBeDefined();

      const nonSysContext = createTestContext({ isActive: true, isSystemUser: false });
      const sysContext = createTestContext({ isActive: true, isSystemUser: true });
      const dummyInfo = {} as GraphQLResolveInfo;

      expect(() =>
        systemField?.resolve?.({}, {}, nonSysContext, dummyInfo)
      ).toThrow(AuthorizationError);

      const success = systemField?.resolve?.({}, {}, sysContext, dummyInfo);
      expect(success).toBe('system-ok');
    });
  });

  describe('PublicDirective', () => {
    it('resolves synchronous scalar fields synchronously without returning a Promise', () => {
      const typeDefs = `
        directive @Public on FIELD_DEFINITION
        type Query {
          secretScalar: String
        }
      `;
      const scalarResolver: GraphQLFieldResolver<unknown, AppContext> = () => 'sync-scalar';
      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: { Query: { secretScalar: scalarResolver } },
      });

      const transformed = PublicDirective.transformer(schema);
      const secretField = transformed.getQueryType()?.getFields().secretScalar;
      expect(secretField?.resolve).toBeDefined();

      const activeContext = createTestContext({ isActive: true });
      const dummyInfo = {} as GraphQLResolveInfo;

      const directResult = secretField?.resolve?.({}, {}, activeContext, dummyInfo);
      expect(directResult).toBe('sync-scalar');
      expect(directResult instanceof Promise).toBe(false);

      // executeSync throws if any resolver returns a Promise; passing verifies synchronous execution
      const syncExecResult = executeSync({
        schema: transformed,
        document: parse('{ secretScalar }'),
        contextValue: activeContext,
      });
      expect(syncExecResult.data).toEqual({ secretScalar: 'sync-scalar' });
      expect(syncExecResult.errors).toBeUndefined();

      // Inactive user throws AuthorizationError synchronously
      const inactiveContext = createTestContext({ isActive: false });
      expect(() =>
        secretField?.resolve?.({}, {}, inactiveContext, dummyInfo)
      ).toThrow(AuthorizationError);
    });

    it('@Public fields bypass the user active check', () => {
      const typeDefs = `
        directive @Public on FIELD_DEFINITION
        type Query {
          publicField: String @Public
        }
      `;
      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: { Query: { publicField: () => 'public-data' } },
      });

      const transformed = PublicDirective.transformer(schema);
      const publicField = transformed.getQueryType()?.getFields().publicField;
      const inactiveContext = createTestContext({ isActive: false });
      const dummyInfo = {} as GraphQLResolveInfo;

      const result = publicField?.resolve?.({}, {}, inactiveContext, dummyInfo);
      expect(result).toBe('public-data');
      expect(result instanceof Promise).toBe(false);
    });
  });

  describe('ApplyBuiltInDirectivesTransformer', () => {
    it('applies both @RequireSystemUser and @Public directive rules in a single schema pass', () => {
      const typeDefs = `
        directive @RequireSystemUser on FIELD_DEFINITION
        directive @Public on FIELD_DEFINITION

        type Query {
          defaultField: String
          publicOnlyField: String @Public
          systemOnlyField: String @RequireSystemUser
          publicAndSystemField: String @Public @RequireSystemUser
        }
      `;

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            defaultField: () => 'default-val',
            publicOnlyField: () => 'public-val',
            systemOnlyField: () => 'system-val',
            publicAndSystemField: () => 'both-val',
          },
        },
      });

      const transformed = ApplyBuiltInDirectivesTransformer(schema);
      const fields = transformed.getQueryType()?.getFields();
      expect(fields).toBeDefined();

      const dummyInfo = {} as GraphQLResolveInfo;
      const activeUser = createTestContext({ isActive: true, isSystemUser: false });
      const inactiveUser = createTestContext({ isActive: false, isSystemUser: false });
      const systemUser = createTestContext({ isActive: true, isSystemUser: true });
      const inactiveSystemUser = createTestContext({ isActive: false, isSystemUser: true });

      // 1. defaultField (requires active user, does not require system user)
      expect(fields?.defaultField.resolve?.({}, {}, activeUser, dummyInfo)).toBe('default-val');
      expect(() => fields?.defaultField.resolve?.({}, {}, inactiveUser, dummyInfo)).toThrow(
        AuthorizationError
      );

      // 2. publicOnlyField (bypasses active check, does not require system user)
      expect(fields?.publicOnlyField.resolve?.({}, {}, inactiveUser, dummyInfo)).toBe(
        'public-val'
      );

      // 3. systemOnlyField (requires active user AND system user)
      expect(fields?.systemOnlyField.resolve?.({}, {}, systemUser, dummyInfo)).toBe('system-val');
      expect(() => fields?.systemOnlyField.resolve?.({}, {}, activeUser, dummyInfo)).toThrow(
        AuthorizationError
      );
      expect(() => fields?.systemOnlyField.resolve?.({}, {}, inactiveSystemUser, dummyInfo)).toThrow(
        AuthorizationError
      );

      // 4. publicAndSystemField (bypasses active check via @Public, but still requires system user)
      expect(
        fields?.publicAndSystemField.resolve?.({}, {}, inactiveSystemUser, dummyInfo)
      ).toBe('both-val');
      expect(() =>
        fields?.publicAndSystemField.resolve?.({}, {}, activeUser, dummyInfo)
      ).toThrow(AuthorizationError);
    });
  });

  describe('RunViewResolver.processRawData', () => {
    const idField = new EntityFieldInfo({ Name: 'ID', IsPrimaryKey: true, Type: 'nvarchar' });
    const nameField = new EntityFieldInfo({ Name: 'Name', IsPrimaryKey: false, Type: 'nvarchar' });
    const binField = new EntityFieldInfo({ Name: 'Data', IsPrimaryKey: false, Type: 'varbinary' });

    const nonBinaryEntity = new EntityInfo({ Fields: [idField, nameField] });
    const binaryEntity = new EntityInfo({ Fields: [idField, binField] });

    it('memoizes frozen rows in WeakMap and returns identical object references', () => {
      const resolver = new TestRunViewResolver();
      const frozenRow = Object.freeze({ ID: 'row-1', Name: 'Frozen Item' });

      const firstCall = resolver.testProcessRawData([frozenRow], 'ent-1', nonBinaryEntity);
      const secondCall = resolver.testProcessRawData([frozenRow], 'ent-1', nonBinaryEntity);

      expect(firstCall.length).toBe(1);
      expect(secondCall.length).toBe(1);
      expect(secondCall[0]).toBe(firstCall[0]);
      expect(frozenRowSerializationCache.get(frozenRow)?.get('ent-1')).toBe(firstCall[0]);
    });

    it('skips ReplaceByteArraysWithBase64 on non-binary entities while converting byte arrays on binary entities', () => {
      const resolver = new TestRunViewResolver();

      // Non-binary entity with plain strings
      const plainRow = { ID: 'row-plain', Name: 'Sample' };
      const nonBinResult = resolver.testProcessRawData([plainRow], 'ent-1', nonBinaryEntity);
      expect(JSON.parse(nonBinResult[0].Data)).toEqual(plainRow);

      // Binary entity with Uint8Array converts to base64 string
      const binaryRow = { ID: 'row-bin', Data: new Uint8Array([1, 2, 3, 4]) };
      const binResult = resolver.testProcessRawData([binaryRow], 'ent-2', binaryEntity);
      const parsed = JSON.parse(binResult[0].Data) as Record<string, string>;
      expect(parsed.Data).toBe('AQIDBA==');
    });
  });

  describe('DatasetResolverBase.SerializeDatasetItems', () => {
    const resolver = new TestDatasetResolver();

    it('produces output byte-for-byte identical to JSON.stringify(items)', () => {
      const items: DatasetItemResultType[] = [
        {
          Code: 'Item1',
          EntityName: 'Entity1',
          EntityID: 'EID-1',
          LatestUpdateDate: new Date('2026-06-01T12:00:00.000Z'),
          Results: [
            { ID: 1, Label: 'One' },
            { ID: 2, Label: 'Two' },
          ],
        },
        {
          Code: 'Item2',
          EntityName: 'Entity2',
          EntityID: 'EID-2',
          Results: [{ ID: 3, Label: 'Three' }],
        },
      ];

      const serialized = resolver.testSerializeDatasetItems(items);
      const stringified = JSON.stringify(items);
      expect(serialized).toBe(stringified);
    });

    it('reuses cached item JSON when item.Results is frozen', () => {
      const rows: Record<string, unknown>[] = [
        { ID: 10, Label: 'Alpha' },
        { ID: 20, Label: 'Beta' },
      ];
      const frozenResults = Object.freeze(rows) as Record<string, unknown>[];

      const frozenItem: DatasetItemResultType = {
        Code: 'CodeFrozen',
        EntityName: 'EntityFrozen',
        EntityID: 'EID-Frozen',
        LatestUpdateDate: new Date('2026-07-01T00:00:00.000Z'),
        Results: frozenResults,
      };

      const firstOutput = resolver.testSerializeDatasetItems([frozenItem]);
      const cached = datasetItemJsonCache.get(frozenResults);

      expect(cached).toBeDefined();
      expect(cached?.code).toBe('CodeFrozen');
      expect(cached?.itemJson).toBe(JSON.stringify(frozenItem));

      const secondOutput = resolver.testSerializeDatasetItems([frozenItem]);
      expect(secondOutput).toBe(firstOutput);
    });
  });
});
