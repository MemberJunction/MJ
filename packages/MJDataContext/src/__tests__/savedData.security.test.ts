import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  DataObjectRelatedEntityParam: class {},
  EntityInfo: class {},
  LogError: vi.fn(),
  Metadata: class {},
  KeyValuePair: class {},
  RunQuery: class {},
  RunView: class {},
  RunViewParams: class {},
  UserInfo: class {},
  CompositeKey: class {},
  IMetadataProvider: class {},
  EntityPermissionType: { Create: 'Create', Read: 'Read', Update: 'Update', Delete: 'Delete' },
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJDataContextEntity: class {},
  MJDataContextItemEntity: class {},
  MJDataContextItemEntityType: class {},
  MJUserViewEntityExtended: class {},
  MJQueryEntityExtended: class {},
  QueryEngine: { Instance: { Queries: [{ ID: 'query-1', Name: 'Saved Query', SQL: 'SELECT 1' }] } },
}));

vi.mock('@memberjunction/global', () => ({
  MJGlobal: { Instance: { ClassFactory: { CreateInstance: () => null } } },
  RegisterClass: () => () => undefined,
  UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) =>
    !!a && !!b && a.toLowerCase() === b.toLowerCase(),
}));

import { DataContextItem } from '../types';

const SAVED_ROWS = [{ ID: 'row-1', Salary: 250000 }];

interface EntityShape {
  EnableFieldLevelSecurity: boolean;
  parentHasFieldLevelSecurity?: boolean;
  rowFilter: string;
  canRead: boolean;
}

function makeEntity(shape: EntityShape) {
  return {
    ID: 'entity-1',
    Name: 'Employees',
    Fields: [{ Name: 'ID', Type: 'uniqueidentifier', Description: '' }],
    EnableFieldLevelSecurity: shape.EnableFieldLevelSecurity,
    ParentChain: shape.parentHasFieldLevelSecurity ? [{ Name: 'People', EnableFieldLevelSecurity: true }] : [],
    GetEffectiveRowFilterWhereClause: () => shape.rowFilter,
    GetUserPermisions: () => ({ CanRead: shape.canRead }),
  };
}

const READER = { ID: 'user-b', Name: 'Reader' };

async function loadSavedItem(type: string, shape: EntityShape): Promise<DataContextItem> {
  const provider = { Entities: [makeEntity(shape)], CurrentUser: null };
  const record = {
    ID: 'dci-1',
    Type: type,
    EntityID: type === 'query' || type === 'sql' ? null : 'entity-1',
    RecordID: 'row-1',
    QueryID: 'query-1',
    CodeName: 'saved_sql',
    SQL: 'SELECT * FROM vwEmployees',
    ViewID: null,
    DataJSON: JSON.stringify(SAVED_ROWS),
  };
  const item = new DataContextItem();
  await item.LoadMetadataFromEntityRecord(record as never, provider as never, READER as never);
  return item;
}

const OPEN: EntityShape = { EnableFieldLevelSecurity: false, rowFilter: '', canRead: true };

describe('DataContextItem saved DataJSON', () => {
  it('serves saved rows of an entity with no field- or row-level security', async () => {
    const item = await loadSavedItem('full_entity', OPEN);
    expect(item.Data).toEqual(SAVED_ROWS);
  });

  it('ignores saved rows when the source entity has field-level security', async () => {
    const item = await loadSavedItem('full_entity', { ...OPEN, EnableFieldLevelSecurity: true });
    expect(item.DataLoaded).toBe(false);
    expect(item.Data).toBeUndefined();
  });

  it('ignores saved rows when an IS-A ancestor of the source entity has field-level security', async () => {
    const item = await loadSavedItem('view', { ...OPEN, parentHasFieldLevelSecurity: true });
    expect(item.DataLoaded).toBe(false);
  });

  it('ignores saved rows when the reader has a row-level security filter on the source entity', async () => {
    const item = await loadSavedItem('single_record', { ...OPEN, rowFilter: "OwnerID = 'user-b'" });
    expect(item.DataLoaded).toBe(false);
  });

  it('ignores saved rows when the reader cannot read the source entity', async () => {
    const item = await loadSavedItem('full_entity', { ...OPEN, canRead: false });
    expect(item.DataLoaded).toBe(false);
  });

  it('never serves saved rows of query or sql items', async () => {
    expect((await loadSavedItem('query', OPEN)).DataLoaded).toBe(false);
    expect((await loadSavedItem('sql', OPEN)).DataLoaded).toBe(false);
  });
});
