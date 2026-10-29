import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ConnectorFactory, IntegrationSchemaSync, type SourceFieldInfo, type SourceObjectInfo, type SourceSchemaInfo } from '@memberjunction/integration-engine';
import type { ArchiveSeedWork, RSUPendingWork } from '@memberjunction/schema-engine';

interface StoredRow {
  ID: string;
  Work: RSUPendingWork;
  Status: 'Pending';
  CreatedAt: Date;
}

const { writePendingWork, readPendingWorkByID } = vi.hoisted(() => ({
  writePendingWork: vi.fn<(data: RSUPendingWork, user?: UserInfo, provider?: IMetadataProvider) => Promise<string>>(),
  readPendingWorkByID: vi.fn<(id: string) => Promise<StoredRow | undefined>>(),
}));

vi.mock('@memberjunction/schema-engine', () => ({
  RuntimeSchemaManager: {
    get Instance() {
      return { WritePendingWork: writePendingWork, ReadPendingWorkByID: readPendingWorkByID };
    },
  },
}));

// The real resolver's type-graphql decorators need emitted decorator metadata, which vitest's
// transform does not produce; the store test never reaches it.
vi.mock('../../resolvers/IntegrationDiscoveryResolver.js', () => ({
  IntegrationDiscoveryResolver: class {},
}));

import { DefaultArchiveSeedDeps, MapSourceSchemaToTables } from '../archiveSeed/ArchiveSeedDeps';

function SourceObject(overrides: Partial<SourceObjectInfo>): SourceObjectInfo {
  return {
    ExternalName: 'dbo.Thing',
    ExternalLabel: 'Thing',
    Fields: [],
    PrimaryKeyFields: [],
    Relationships: [],
    ...overrides,
  };
}

function FieldsNamed(...names: string[]): SourceFieldInfo[] {
  return names.map(n => ({
    Name: n,
    Label: n,
    SourceType: 'nvarchar',
    IsRequired: false,
    MaxLength: null,
    Precision: null,
    Scale: null,
    DefaultValue: null,
    ForeignKeyTarget: null,
  }));
}

describe('MapSourceSchemaToTables', () => {
  it('maps a keyed table with a watermark', () => {
    const schema: SourceSchemaInfo = {
      Objects: [
        SourceObject({
          ExternalName: 'dbo.Orders',
          Fields: FieldsNamed('ID', 'Total', 'ModifiedAt'),
          PrimaryKeyFields: ['ID'],
          IncrementalWatermarkField: 'ModifiedAt',
        }),
      ],
    };
    expect(MapSourceSchemaToTables(schema)).toEqual([{ Name: 'dbo.Orders', ColumnCount: 3, HasPrimaryKey: true, WatermarkField: 'ModifiedAt' }]);
  });

  it('maps a key-less table without a watermark', () => {
    const schema: SourceSchemaInfo = { Objects: [SourceObject({ ExternalName: 'dbo.Log', Fields: FieldsNamed('Msg') })] };
    const [table] = MapSourceSchemaToTables(schema);
    expect(table).toEqual({ Name: 'dbo.Log', ColumnCount: 1, HasPrimaryKey: false });
    expect(table.WatermarkField).toBeUndefined();
  });
});

describe('DefaultArchiveSeedDeps().Store', () => {
  beforeEach(() => {
    writePendingWork.mockReset();
    writePendingWork.mockResolvedValue('job-1');
  });

  it('Create writes an archive-seed pending-work row carrying the work', async () => {
    const work = { State: 'Created', UserID: 'u-1', CompanyID: 'co-1' } as ArchiveSeedWork;
    const user = { ID: 'u-1' } as UserInfo;
    const provider = {} as IMetadataProvider;

    const id = await DefaultArchiveSeedDeps().Store.Create(work, 'ci-1', user, provider);

    expect(id).toBe('job-1');
    expect(writePendingWork).toHaveBeenCalledTimes(1);
    const [data, passedUser, passedProvider] = writePendingWork.mock.calls[0];
    expect(data.WorkType).toBe('archive-seed');
    expect(data.ArchiveSeed).toBe(work);
    expect(data.CompanyIntegrationID).toBe('ci-1');
    expect(data.SourceObjectNames).toEqual([]);
    expect(data.SchemaName).toBe('');
    expect(typeof data.CreatedAt).toBe('string');
    expect(passedUser).toBe(user);
    expect(passedProvider).toBe(provider);
  });
});

describe('DefaultArchiveSeedDeps().Store.Read', () => {
  it('returns the company integration the pending-work row carries', async () => {
    const work = { State: 'AwaitingSelection' } as ArchiveSeedWork;
    readPendingWorkByID.mockResolvedValue({
      ID: 'job-1',
      Work: { WorkType: 'archive-seed', CompanyIntegrationID: 'ci-9', SourceObjectNames: [], SchemaName: '', CreatedAt: '', ArchiveSeed: work },
      Status: 'Pending',
      CreatedAt: new Date(),
    });

    const job = await DefaultArchiveSeedDeps().Store.Read('job-1', { ID: 'u-1' } as UserInfo, {} as IMetadataProvider);

    expect(job).toEqual({ ID: 'job-1', Work: work, Status: 'Pending', CompanyIntegrationID: 'ci-9' });
  });
});

describe('DefaultArchiveSeedDeps().Records.SetDataSourceDefaultDatabase', () => {
  interface RecordingDataSource {
    DefaultDatabase: string | null;
    SavedDefaultDatabase?: string | null;
    Loaded?: string;
    Load(id: string): Promise<boolean>;
    Save(): Promise<boolean>;
  }

  function Provider(entity: RecordingDataSource): IMetadataProvider {
    return { GetEntityObject: vi.fn(async () => entity) } as Partial<IMetadataProvider> as IMetadataProvider;
  }

  it('loads the data source and saves the new default database', async () => {
    const entity: RecordingDataSource = {
      DefaultDatabase: null,
      async Load(id: string) {
        this.Loaded = id;
        return true;
      },
      async Save() {
        this.SavedDefaultDatabase = this.DefaultDatabase;
        return true;
      },
    };

    await DefaultArchiveSeedDeps().Records.SetDataSourceDefaultDatabase('ds-1', 'ERP_Prod', { ID: 'u-1' } as UserInfo, Provider(entity));

    expect(entity.Loaded).toBe('ds-1');
    expect(entity.SavedDefaultDatabase).toBe('ERP_Prod');
  });

  it('throws when the data source does not exist', async () => {
    const entity: RecordingDataSource = { DefaultDatabase: null, Load: async () => false, Save: async () => true };
    await expect(
      DefaultArchiveSeedDeps().Records.SetDataSourceDefaultDatabase('ds-x', 'ERP', { ID: 'u-1' } as UserInfo, Provider(entity)),
    ).rejects.toThrow('External Data Source "ds-x" not found');
  });
});

describe('DefaultArchiveSeedDeps().Records.CreateCompanyIntegration', () => {
  interface RecordingCompanyIntegration {
    ID: string;
    CompanyID?: string;
    IntegrationID?: string;
    Name?: string;
    Configuration?: string;
    IsActive?: boolean;
    SavedIsActive?: boolean;
    NewRecord(): void;
    Save(): Promise<boolean>;
  }

  it('creates the seeded company integration inactive', async () => {
    const entity: RecordingCompanyIntegration = {
      ID: 'ci-new',
      NewRecord() {},
      async Save() {
        this.SavedIsActive = this.IsActive;
        return true;
      },
    };
    const getEntityObject = vi.fn(async () => entity);
    const provider = { GetEntityObject: getEntityObject } as Partial<IMetadataProvider> as IMetadataProvider;

    const id = await DefaultArchiveSeedDeps().Records.CreateCompanyIntegration(
      { CompanyID: 'co-1', IntegrationID: 'int-1', Name: 'Archive', Configuration: '{}' },
      { ID: 'u-1' } as UserInfo,
      provider,
    );

    expect(id).toBe('ci-new');
    expect(getEntityObject).toHaveBeenCalledWith('MJ: Company Integrations', expect.anything());
    expect(entity.SavedIsActive).toBe(false);
  });
});

describe('DefaultArchiveSeedDeps().Discovery.IntrospectArchive', () => {
  const SCHEMA: SourceSchemaInfo = { Objects: [SourceObject({ ExternalName: 'dbo.Orders', PrimaryKeyFields: ['ID'], Fields: FieldsNamed('ID') })] };

  function Provider(): IMetadataProvider {
    const record = { IntegrationID: 'int-1', async Load() { return true; } };
    const partial: Partial<IMetadataProvider> = {
      GetEntityObject: vi.fn(async () => record) as Partial<IMetadataProvider>['GetEntityObject'],
    };
    return partial as IMetadataProvider;
  }

  function Connector(schemas: string[] | undefined): { IntrospectSchema: ReturnType<typeof vi.fn>; ListSchemas?: () => Promise<string[]> } {
    const connector: { IntrospectSchema: ReturnType<typeof vi.fn>; ListSchemas?: () => Promise<string[]> } = {
      IntrospectSchema: vi.fn(async () => SCHEMA),
    };
    if (schemas) {
      connector.ListSchemas = async () => schemas;
    }
    return connector;
  }

  beforeEach(() => {
    vi.spyOn(IntegrationSchemaSync, 'PersistDiscoveredSchema').mockResolvedValue(
      { ObjectsCreated: 1, ObjectsUpdated: 0, FieldsCreated: 1, FieldsUpdated: 0 } as Awaited<ReturnType<typeof IntegrationSchemaSync.PersistDiscoveredSchema>>,
    );
  });

  it.each([
    ['the archive schemas when the connector lists them', ['dbo', 'sales'], { Schemas: ['dbo', 'sales'], BaseTablesOnly: true }],
    ['only the base-table filter when it cannot', undefined, { BaseTablesOnly: true }],
  ])('introspects base tables only, passing %s', async (_label, schemas, expected) => {
    const connector = Connector(schemas);
    vi.spyOn(ConnectorFactory, 'Resolve').mockReturnValue(connector as unknown as ReturnType<typeof ConnectorFactory.Resolve>);

    const tables = await DefaultArchiveSeedDeps().Discovery.IntrospectArchive('ci-1', { ID: 'u-1' } as UserInfo, Provider());

    expect(connector.IntrospectSchema).toHaveBeenCalledWith(expect.anything(), expect.anything(), expected);
    expect(tables.map(t => t.Name)).toEqual(['dbo.Orders']);
  });
});

describe('DefaultArchiveSeedDeps().Records.MarkEntitiesBulkLoadable', () => {
  interface FakeEntityRow {
    ID: string;
    Name: string;
    SchemaName: string;
    TrackRecordChanges: boolean;
    TrustServerCacheCompletely: boolean;
    AllowDirectSQLInsert: boolean;
    Saved?: boolean;
    Load(id: string): Promise<boolean>;
    Save(): Promise<boolean>;
  }

  const ENTITIES: Record<string, { Name: string; SchemaName: string }> = {
    'ent-orders': { Name: 'Orders', SchemaName: 'sql_server' },
    'ent-customers': { Name: 'Customers', SchemaName: 'SQL_Server' },
    'ent-users': { Name: 'MJ: Users', SchemaName: '__mj' },
    'ent-hubspot': { Name: 'Contacts', SchemaName: 'hubspot' },
  };

  let loaded: FakeEntityRow[];
  let refresh: ReturnType<typeof vi.fn>;

  function NewEntity(): FakeEntityRow {
    const row: FakeEntityRow = {
      ID: '',
      Name: '',
      SchemaName: '',
      TrackRecordChanges: true,
      TrustServerCacheCompletely: true,
      AllowDirectSQLInsert: false,
      async Load(id: string) {
        const found = ENTITIES[id];
        if (!found) return false;
        Object.assign(this, { ID: id, ...found });
        return true;
      },
      async Save() {
        this.Saved = true;
        return true;
      },
    };
    loaded.push(row);
    return row;
  }

  function Provider(): IMetadataProvider {
    refresh = vi.fn(async () => true);
    const partial: Partial<IMetadataProvider> = {
      GetEntityObject: vi.fn(async () => NewEntity()) as Partial<IMetadataProvider>['GetEntityObject'],
      Refresh: refresh as Partial<IMetadataProvider>['Refresh'],
    };
    return partial as IMetadataProvider;
  }

  beforeEach(() => {
    loaded = [];
    const runView: Partial<RunView> = {
      RunView: vi.fn(async () => ({ Success: true, Results: [{ Integration: 'SQL Server' }] })) as Partial<RunView>['RunView'],
    };
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(runView as RunView);
  });

  it('marks the entities in the schema the apply created for the connection', async () => {
    await DefaultArchiveSeedDeps().Records.MarkEntitiesBulkLoadable('ci-1', ['ent-orders', 'ent-customers'], { ID: 'u-1' } as UserInfo, Provider());

    expect(loaded.filter(e => e.Saved).map(e => e.ID)).toEqual(['ent-orders', 'ent-customers']);
    expect(loaded.every(e => e.AllowDirectSQLInsert && !e.TrackRecordChanges && !e.TrustServerCacheCompletely)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a core (__mj) entity', 'ent-users'],
    ["another integration's entity", 'ent-hubspot'],
  ])('refuses %s and changes nothing', async (_label, foreign) => {
    await expect(
      DefaultArchiveSeedDeps().Records.MarkEntitiesBulkLoadable('ci-1', ['ent-orders', foreign], { ID: 'u-1' } as UserInfo, Provider()),
    ).rejects.toThrow(/outside the connection's schema 'sql_server'/);
    expect(loaded.some(e => e.Saved)).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});
