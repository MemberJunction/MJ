/**
 * Promotion of `relatedEntities` groups to collection items.
 *
 * WHAT THIS PROTECTS
 *
 * - **Which collections qualify**: a writable, loadable collection with no automatic sequence
 *   numbering. Sequenced collections renumber every child, which would overwrite the sequence values a
 *   `relatedEntities` item states, so they keep the separate-save behaviour.
 * - **Which groups qualify**: items that join to the parent (no join field, or `@parent:ID`), with no
 *   nested `relatedEntities` and no `deleteRecord`.
 * - **Push**: a promoted group is not flattened into records of its own, its items are applied to the
 *   parent's collection before the parent saves (so they join its graph), `@parent:` resolves to the
 *   parent, and the record file keeps its `relatedEntities` format.
 * - **Pull**: a record new to the file is written with `collections`; an existing record keeps the
 *   format its file uses.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { BaseEntity, EntityInfo, Metadata, ProviderBase } from '@memberjunction/core';
import type { IEntityDataProvider, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { RecordData, BatchContext } from '../lib/sync-engine';
import type { RelatedEntityConfig } from '../config';
import {
  CollectionPromotion,
  CollectionPromotionResolver,
  DeclaredCollectionsOf,
  IsPromotableGroup,
} from '../lib/collection-promotion';
import { RecordDependencyAnalyzer } from '../lib/record-dependency-analyzer';
import { PushService } from '../services/PushService';
import { SyncEngine } from '../lib/sync-engine';
import { RecordProcessor, WithoutJoinField } from '../lib/RecordProcessor';
import { PullService } from '../services/PullService';

const USER = { ID: 'u-1', Name: 'Tester', Email: 't@example.com', UserRoles: [] };

function entityInfo(id: string, name: string): EntityInfo {
  return new EntityInfo({
    ID: id,
    Name: name,
    Fields: ['ID', 'Name', 'QueryID', 'Sequence'].map((field, index) => ({
      ID: `${id}-${index}`, EntityID: id, Entity: name, Name: field, Type: field === 'Sequence' ? 'int' : 'nvarchar',
      IsPrimaryKey: field === 'ID', AllowsNull: field !== 'ID', AllowUpdateAPI: true, ValueListType: 'None',
      Sequence: index + 1, Status: 'Active', EntityFieldValues: [],
    })),
    Permissions: [],
    RelatedEntities: [],
  });
}

let parentInfo: EntityInfo;
let childInfo: EntityInfo;

/** A child record with no collections of its own (BaseEntity is abstract). */
class ChildEntity extends BaseEntity {}

/** A parent declaring one collection of each kind the promotion rules distinguish. */
class ParentEntity extends BaseEntity {
  public readonly Params = this.DeclareRelatedRecords({
    Name: 'Params', RelatedEntity: 'Children', RelatedEntityJoinField: 'QueryID', Load: 'explicit', Source: 'database', ReadOnly: false,
  });
  public readonly Ordered = this.DeclareRelatedRecords({
    Name: 'Ordered', RelatedEntity: 'Ordered Children', RelatedEntityJoinField: 'QueryID', Sequence: { Field: 'Sequence', From: 1 },
  });
  public readonly Cached = this.DeclareRelatedRecords({
    Name: 'Cached', RelatedEntity: 'Cached Children', RelatedEntityJoinField: 'QueryID', Source: 'cache',
  });
  public readonly Never = this.DeclareRelatedRecords({
    Name: 'Never', RelatedEntity: 'Never Children', RelatedEntityJoinField: 'QueryID', Load: 'never',
  });
}

/** The entity provider: hands out child records for a collection's `Create()`. */
const PROVIDER = {
  CurrentUser: USER,
  GetEntityObject: async () => new ChildEntity(childInfo, PROVIDER),
} as unknown as IEntityDataProvider;

function newParent(): ParentEntity {
  return new ParentEntity(parentInfo, PROVIDER);
}

/** A metadata provider whose entity objects are `ParentEntity` for 'Parents' and plain otherwise. */
function metadataProvider(): IMetadataProvider {
  return {
    GetEntityObject: vi.fn(async (name: string) => (name === 'Parents' ? newParent() : new ChildEntity(childInfo, PROVIDER))),
  } as unknown as IMetadataProvider;
}

beforeAll(() => {
  parentInfo = entityInfo('P0', 'Parents');
  childInfo = entityInfo('C0', 'Children');
  Metadata.Provider = { Entities: [parentInfo, childInfo], CurrentUser: USER } as unknown as ProviderBase;
});

const PARAMS: CollectionPromotion = { CollectionName: 'Params', JoinField: 'QueryID', ParentKeyField: 'ID' };

describe('DeclaredCollectionsOf', () => {
  it('offers only writable, loadable, unsequenced collections, keyed by related entity', () => {
    const declared = DeclaredCollectionsOf(newParent());
    expect([...declared.keys()]).toEqual(['children']);
    expect(declared.get('children')).toEqual(PARAMS);
  });
});

describe('IsPromotableGroup', () => {
  it('accepts items that leave the join field out or point it at the parent', () => {
    expect(IsPromotableGroup([{ fields: { Name: 'a' } }, { fields: { Name: 'b', QueryID: '@parent:ID' } }], PARAMS)).toBe(true);
  });

  it.each<[string, RecordData]>([
    ['a literal join value', { fields: { Name: 'a', QueryID: 'SOME-OTHER-ID' } }],
    ['a join to another parent field', { fields: { Name: 'a', QueryID: '@parent:Name' } }],
    ['nested relatedEntities', { fields: { Name: 'a' }, relatedEntities: { Grandchildren: [{ fields: {} }] } }],
    ['a deleteRecord item', { fields: { Name: 'a' }, deleteRecord: { delete: true } }],
  ])('keeps a group with %s on the separate-save path', (_label, item) => {
    expect(IsPromotableGroup([{ fields: { Name: 'ok' } }, item], PARAMS)).toBe(false);
  });

  it('does not promote an empty group', () => {
    expect(IsPromotableGroup([], PARAMS)).toBe(false);
  });
});

describe('CollectionPromotionResolver and flattening', () => {
  const records: RecordData[] = [
    {
      primaryKey: { ID: 'P-1' },
      fields: { Name: 'Parent' },
      relatedEntities: {
        Children: [{ fields: { Name: 'param', QueryID: '@parent:ID' } }],
        'Ordered Children': [{ fields: { Name: 'ordered', QueryID: '@parent:ID' } }],
      },
    },
  ];

  it('resolves a declared collection and leaves others to the separate-save path', async () => {
    const resolver = new CollectionPromotionResolver(() => metadataProvider(), USER as unknown as UserInfo);
    await resolver.Prepare(records, 'Parents');

    expect(resolver.Resolve('Parents', 'Children', records[0].relatedEntities!.Children)).toEqual(PARAMS);
    expect(resolver.Resolve('Parents', 'Ordered Children', records[0].relatedEntities!['Ordered Children'])).toBeUndefined();
    expect(resolver.PromotedGroups('Parents', records[0]).map((g) => g.RelatedEntity)).toEqual(['Children']);
  });

  it('flattens only the groups that are not promoted', async () => {
    const resolver = new CollectionPromotionResolver(() => metadataProvider(), USER as unknown as UserInfo);
    await resolver.Prepare(records, 'Parents');

    const promoted = await new RecordDependencyAnalyzer().analyzeFileRecords(records, 'Parents', resolver);
    const all = await new RecordDependencyAnalyzer().analyzeFileRecords(records, 'Parents');

    expect(promoted.sortedRecords.map((r) => r.entityName)).toEqual(['Parents', 'Ordered Children']);
    expect(all.sortedRecords.map((r) => r.entityName).sort()).toEqual(['Children', 'Ordered Children', 'Parents']);
  });

  it('keeps every group when the provider cannot be reached', async () => {
    const resolver = new CollectionPromotionResolver(() => {
      throw new Error('no provider');
    }, USER as unknown as UserInfo);
    await resolver.Prepare(records, 'Parents');
    expect(resolver.PromotedGroups('Parents', records[0])).toEqual([]);
  });
});

describe('PushService applies promoted items to the parent collection', () => {
  it('creates the items in the collection, resolves @parent: to the parent, and leaves the file format alone', async () => {
    const parent = newParent();
    parent.NewRecord();
    parent.Set('ID', 'P-1');
    const record: RecordData = {
      primaryKey: { ID: 'P-1' },
      fields: { Name: 'Parent' },
      relatedEntities: {
        Children: [
          { primaryKey: { ID: 'C-1' }, fields: { Name: 'first', QueryID: '@parent:ID' } },
          { fields: { Name: 'second' } },
        ],
      },
    };
    const before = JSON.stringify(record);

    const syncEngine = {
      GetProvider: () => metadataProvider(),
      setMetadataEngine: vi.fn(),
      processFieldValue: vi.fn(async (value: unknown, _dir: string, parentRecord: BaseEntity | null) =>
        typeof value === 'string' && value.startsWith('@parent:') ? parentRecord?.Get(value.slice('@parent:'.length)) : value),
    } as unknown as SyncEngine;
    const push = new PushService(syncEngine, USER as unknown as UserInfo);
    const internals = push as unknown as {
      collectionPromotions(): CollectionPromotionResolver;
      applyCompositionAxes(entity: BaseEntity, record: RecordData, entityName: string, entityDir: string, batchContext: BatchContext, collector: unknown, options: object): Promise<void>;
      writeBackPromotedKeys(record: RecordData): void;
    };
    await internals.collectionPromotions().Prepare([record], 'Parents');

    await internals.applyCompositionAxes(parent, record, 'Parents', '/dir', new Map() as unknown as BatchContext, { notes: [] }, {});

    expect(parent.Params.Items.map((c) => c.Get('Name'))).toEqual(['first', 'second']);
    expect(parent.Params.Items[0].Get('ID')).toBe('C-1');
    expect(parent.Params.Items[0].Get('QueryID')).toBe('P-1');
    expect(parent.Dirty).toBe(true);
    expect(JSON.stringify(record)).toBe(before);

    // After the save, the item created without a key gets the key it was saved with.
    internals.writeBackPromotedKeys(record);
    expect(record.relatedEntities!.Children[1].primaryKey).toEqual({ ID: parent.Params.Items[1].Get('ID') });
    expect(record.relatedEntities!.Children[0].primaryKey).toEqual({ ID: 'C-1' });
  });
});

describe('RecordProcessor pull format', () => {
  const relation: RelatedEntityConfig = { entity: 'Children', foreignKey: 'QueryID' };
  const declared = new Map([['children', PARAMS]]);
  const formatFor = (existing: RecordData | undefined, collections: Record<string, RecordData[]> = {}) =>
    (new RecordProcessor({} as SyncEngine, USER as unknown as UserInfo) as unknown as {
      collectionFormatFor(
        declared: ReadonlyMap<string, CollectionPromotion>,
        relationConfig: RelatedEntityConfig,
        relationKey: string,
        existingRecordData: RecordData | undefined,
        collections: Record<string, RecordData[]>
      ): CollectionPromotion | undefined;
    }).collectionFormatFor(declared, relation, 'Children', existing, collections);

  it('writes a record new to the file in the collections format', () => {
    expect(formatFor(undefined)).toEqual(PARAMS);
  });

  it('keeps relatedEntities for a record whose file uses it', () => {
    expect(formatFor({ fields: {}, relatedEntities: { Children: [] } })).toBeUndefined();
  });

  it('keeps collections for a record whose file uses it', () => {
    expect(formatFor({ fields: {}, collections: { Params: [] } })).toEqual(PARAMS);
  });

  it('keeps the previous format for an existing record that lists neither', () => {
    expect(formatFor({ fields: {} })).toBeUndefined();
  });

  it('does not replace a collection another pull step already wrote', () => {
    expect(formatFor(undefined, { Params: [] })).toBeUndefined();
  });

  it('does not use a collection joined on a different foreign key', () => {
    const other = new Map([['children', { ...PARAMS, JoinField: 'OtherID' }]]);
    const processor = new RecordProcessor({} as SyncEngine, USER as unknown as UserInfo) as unknown as {
      collectionFormatFor(d: ReadonlyMap<string, CollectionPromotion>, r: RelatedEntityConfig, k: string, e: RecordData | undefined, c: Record<string, RecordData[]>): CollectionPromotion | undefined;
    };
    expect(processor.collectionFormatFor(other, relation, 'Children', undefined, {})).toBeUndefined();
  });

  it('drops the join field from a collection item, which the collection sets on save', () => {
    const item: RecordData = { primaryKey: { ID: 'C-1' }, fields: { Name: 'p', QueryID: '@parent:ID' } };
    expect(WithoutJoinField(item, 'queryid')).toEqual({ primaryKey: { ID: 'C-1' }, fields: { Name: 'p' } });
  });
});

describe('PullService merge keeps the composition axes of an existing record', () => {
  type Merge = (existing: RecordData, newData: RecordData, strategy: 'overwrite' | 'merge' | 'skip', preserve: string[]) => Promise<RecordData>;
  const merge = (): Merge => {
    const service = new PullService({} as SyncEngine, USER as unknown as UserInfo) as unknown as { mergeRecords: Merge };
    return service.mergeRecords.bind(service);
  };
  const existing: RecordData = {
    fields: { Name: 'Q' },
    collections: { Parameters: [{ fields: { Name: 'old' } }], Fields: [{ fields: { Name: 'Authored' } }] },
    primaryKey: { ID: 'Q-1' },
  };
  const pulled: RecordData = { fields: { Name: 'Q' }, collections: { Parameters: [{ fields: { Name: 'new' } }] }, primaryKey: { ID: 'Q-1' } };

  it('merge: takes the pulled collections and keeps the ones the pull did not produce', async () => {
    const result = await merge()(existing, pulled, 'merge', []);
    expect(result.collections).toEqual({ Parameters: [{ fields: { Name: 'new' } }], Fields: [{ fields: { Name: 'Authored' } }] });
  });

  it('overwrite: writes the pulled collections', async () => {
    const result = await merge()(existing, pulled, 'overwrite', []);
    expect(result.collections).toEqual({ Parameters: [{ fields: { Name: 'new' } }] });
  });
});

