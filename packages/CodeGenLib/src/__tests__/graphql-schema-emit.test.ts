import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('@memberjunction/core', () => ({
  EntityInfo: class {},
  EntityFieldInfo: class {},
  EntityRelationshipInfo: class {},
  Metadata: class {
    get Entities() { return []; }
    EntityByName() { return undefined; }
  },
  getGraphQLTypeNameBase: (e: { ClassName?: string }) => e.ClassName ?? 'X',
  TypeScriptTypeFromSQLType: (t: string) => t,
  TypeScriptTypeFromSQLTypeWithNullableOption: (t: string) => t,
}));

vi.mock('@memberjunction/sql-dialect', () => ({
  IsBinarySQLType: () => false,
  IsBooleanSQLType: () => false,
  IsCurrencySQLType: () => false,
  IsDateSQLType: () => false,
  IsFloatSQLType: () => false,
  IsStringSQLType: () => false,
  IsUuidSQLType: () => false,
}));

vi.mock('../Misc/status_logging', () => ({ logError: vi.fn(), logStatus: vi.fn() }));

vi.mock('../Config/config', () => ({
  mjCoreSchema: '__mj',
  configInfo: { fileEmit: { perSchema: true, writeIfChanged: false, parallel: false, concurrency: 1 } },
  resolveEntityPackageName: () => 'pkg',
  getExternalEntitySchemas: () => [],
}));

vi.mock('../Misc/util', () => ({
  makeDir: vi.fn(),
  sortBySequenceAndCreatedAt: (items: unknown[]) => [...items],
  sortRelatedEntities: (items: unknown[]) => [...items],
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue(''),
    },
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(''),
  };
});

import { GraphQLServerGeneratorBase } from '../Misc/graphql_server_codegen';

function entity(name: string, schema: string) {
  return {
    Name: name,
    ClassName: name.replace(/ /g, ''),
    CodeName: name.replace(/ /g, ''),
    BaseView: `vw${name.replace(/ /g, '')}`,
    SchemaName: schema,
    Description: '',
    IncludeInAPI: true,
    ExternalDataSourceID: null,
    AllowCreateAPI: false,
    AllowUpdateAPI: false,
    AllowDeleteAPI: false,
    Fields: [{ Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, IsVirtual: false, Description: '', Sequence: 1, MaxLength: 16, __mj_CreatedAt: new Date(0) }],
    FirstPrimaryKey: { Name: 'ID', CodeName: 'ID', GraphQLType: 'String', TSType: 'string' },
    PrimaryKeys: [{ Name: 'ID', CodeName: 'ID', GraphQLType: 'String', TSType: 'string' }],
    RelatedEntities: [],
    _floatCount: 0,
  };
}

describe('GraphQL per-schema emit', () => {
  beforeEach(() => {
    vi.mocked(fs.writeFileSync).mockClear();
  });

  it('writes one resolver file per schema plus a barrel generated.ts', () => {
    const generator = new GraphQLServerGeneratorBase();
    const ok = generator.generateGraphQLServerCode(
      [entity('Customers', 'crm') as never, entity('Invoices', 'billing') as never],
      '/gql',
      'pkg',
      false,
      { perSchema: true, writeIfChanged: false, dirtySchemas: 'all' },
    );
    expect(ok).toBe(true);
    const written = vi.mocked(fs.writeFileSync).mock.calls.map((c) => String(c[0]));
    expect(written.some((p) => p.endsWith('graphql-schemas/crm.ts'))).toBe(true);
    expect(written.some((p) => p.endsWith('graphql-schemas/billing.ts'))).toBe(true);
    const barrel = vi.mocked(fs.writeFileSync).mock.calls.find((c) => String(c[0]).endsWith('generated.ts'));
    expect(String(barrel![1])).toContain("export * from './graphql-schemas/crm.js'");
    expect(String(barrel![1])).toContain("export * from './graphql-schemas/billing.js'");
  });
});
