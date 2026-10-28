import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { SourceFieldInfo, SourceObjectInfo, SourceSchemaInfo } from '@memberjunction/integration-engine';
import type { ArchiveSeedWork, RSUPendingWork } from '@memberjunction/schema-engine';

const { writePendingWork } = vi.hoisted(() => ({
  writePendingWork: vi.fn<(data: RSUPendingWork, user?: UserInfo, provider?: IMetadataProvider) => Promise<string>>(),
}));

vi.mock('@memberjunction/schema-engine', () => ({
  RuntimeSchemaManager: {
    get Instance() {
      return { WritePendingWork: writePendingWork };
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
