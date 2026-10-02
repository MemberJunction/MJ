/**
 * Binary fields on the SQL Server save path.
 *
 * A binary field's value in a BaseEntity is a base64 string. SQL Server has no implicit
 * conversion from a quoted string to varbinary, so the provider renders a T-SQL hex literal
 * (`0x…`) via FormatBinaryLiteral, in both the DECLARE/SET block (generateSetStatementValue) and
 * the logged simple-params form (generateSingleSPParam). Read-back rows (Buffers from tedious)
 * must come back as base64 on the hydrated entity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import { BaseEntity, EntityFieldInfo, EntityInfo, EntitySaveOptions } from '@memberjunction/core';
import type { SaveCallBinding } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';
import { TEST_USER, TestEntity } from './helpers/entity-fixtures';

const DOC_ENTITY_ID = 'B1000000-0000-0000-0000-000000000001';

interface ProviderPrivateSurface {
  _pool: MockConnectionPool;
  _datetimeOffsetTestComplete: boolean;
  _needsDatetimeOffsetAdjustment: boolean;
}

class BinaryTestProvider extends SQLServerDataProvider {
  private testEntities: EntityInfo[] = [];

  public override get Entities(): EntityInfo[] {
    return this.testEntities;
  }
  public override get MJCoreSchemaName(): string {
    return '__mj';
  }
  public SetTestEntities(entities: EntityInfo[]): void {
    this.testEntities = entities;
  }
  public AttachPool(pool: MockConnectionPool): void {
    const surface = this as unknown as ProviderPrivateSurface;
    surface._pool = pool;
    surface._datetimeOffsetTestComplete = true;
    surface._needsDatetimeOffsetAdjustment = false;
  }
  protected override async HandleEntityActions(): Promise<never[]> {
    return [];
  }
  protected override async HandleEntityAIActions(): Promise<void> {
    // not under test
  }

  // --- protected exposures ---
  public FormatBinaryLiteralForTest(field: EntityFieldInfo, value: unknown): string {
    return this.FormatBinaryLiteral(field, value);
  }
  public RenderBindingForTest(entity: BaseEntity, values: Map<EntityFieldInfo, unknown>, isUpdate: boolean): SaveCallBinding {
    return this.RenderSaveCallBinding(entity, values, isUpdate, 'spCreateDocument');
  }
}

function documentFieldInitData(): Record<string, unknown>[] {
  const base = {
    EntityID: DOC_ENTITY_ID,
    Precision: 0,
    Scale: 0,
    AllowsNull: false,
    DefaultValue: null,
    AutoIncrement: false,
    IsVirtual: false,
    IsPrimaryKey: false,
    IsUnique: false,
    AllowUpdateAPI: true,
    IsComputed: false,
    Status: 'Active',
  };
  return [
    { ...base, ID: 'FB000000-0000-0000-0000-000000000001', Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, IsUnique: true, AllowUpdateAPI: false },
    { ...base, ID: 'FB000000-0000-0000-0000-000000000002', Sequence: 2, Name: 'Name', Type: 'nvarchar', Length: 200 },
    { ...base, ID: 'FB000000-0000-0000-0000-000000000003', Sequence: 3, Name: 'Content', Type: 'varbinary', Length: -1, AllowsNull: true },
    { ...base, ID: 'FB000000-0000-0000-0000-000000000004', Sequence: 4, Name: 'Hash', Type: 'binary', Length: 4, AllowsNull: true },
  ];
}

function makeDocumentEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: DOC_ENTITY_ID,
    Name: 'Documents',
    Status: 'Active',
    SchemaName: 'dbo',
    BaseTable: 'Document',
    BaseTableCodeName: 'Document',
    BaseView: 'vwDocuments',
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: true,
    spCreateGenerated: true,
    spUpdateGenerated: true,
    TrackRecordChanges: false,
    spCreate: null,
    spUpdate: null,
    spDelete: null,
    ExternalDataSourceID: null,
    VirtualEntity: false,
    AllowMultipleSubtypes: false,
    EntityFields: documentFieldInitData(),
    EntityPermissions: [],
  });
}

function makeProvider(entityInfo: EntityInfo): BinaryTestProvider {
  const provider = new BinaryTestProvider();
  provider.AttachPool(new MockConnectionPool());
  provider.SetTestEntities([entityInfo]);
  return provider;
}

function field(entityInfo: EntityInfo, name: string): EntityFieldInfo {
  const f = entityInfo.Fields.find(x => x.Name === name);
  if (!f) throw new Error(`fixture field ${name} missing`);
  return f;
}

function newEntity(entityInfo: EntityInfo): TestEntity {
  const entity = new TestEntity(entityInfo);
  entity.ContextCurrentUser = TEST_USER;
  entity.NewRecord();
  return entity;
}

describe('SQLServerDataProvider.FormatBinaryLiteral', () => {
  const entityInfo = makeDocumentEntityInfo();
  const provider = makeProvider(entityInfo);
  const content = field(entityInfo, 'Content');

  it('renders a base64 string as an uppercase 0x hex literal', () => {
    // 'AQL/' = bytes 01 02 FF
    expect(provider.FormatBinaryLiteralForTest(content, 'AQL/')).toBe('0x0102FF');
    expect(provider.FormatBinaryLiteralForTest(content, Buffer.from('hello').toString('base64'))).toBe('0x68656C6C6F');
  });

  it('accepts a byte array (Buffer and plain Uint8Array)', () => {
    expect(provider.FormatBinaryLiteralForTest(content, Buffer.from([0xab, 0x0c]))).toBe('0xAB0C');
    expect(provider.FormatBinaryLiteralForTest(content, new Uint8Array([0, 1]))).toBe('0x0001');
  });

  it('renders only the viewed range of a Uint8Array view', () => {
    const backing = new Uint8Array([0xee, 0x01, 0x02, 0xee]);
    expect(provider.FormatBinaryLiteralForTest(content, backing.subarray(1, 3))).toBe('0x0102');
  });

  it('renders zero bytes / empty base64 as bare 0x', () => {
    expect(provider.FormatBinaryLiteralForTest(content, '')).toBe('0x');
    expect(provider.FormatBinaryLiteralForTest(content, new Uint8Array(0))).toBe('0x');
  });

  it('accepts unpadded base64', () => {
    expect(provider.FormatBinaryLiteralForTest(content, 'AQ')).toBe('0x01');
  });

  it('throws, naming the field, for a string that is not valid base64', () => {
    expect(() => provider.FormatBinaryLiteralForTest(content, 'not base64!')).toThrow(/Field "Content" is binary \(varbinary\)/);
    expect(() => provider.FormatBinaryLiteralForTest(content, 'A')).toThrow(/not valid base64/);
    expect(() => provider.FormatBinaryLiteralForTest(content, 'AQ ID')).toThrow(/not valid base64/);
  });

  it('throws for values that are neither a string nor a byte array', () => {
    expect(() => provider.FormatBinaryLiteralForTest(content, 42)).toThrow(/not valid base64/);
    expect(() => provider.FormatBinaryLiteralForTest(content, { a: 1 })).toThrow(/not valid base64/);
    expect(() => provider.FormatBinaryLiteralForTest(content, null)).toThrow(/not valid base64/);
  });

  it('never emits a quoted literal (no injection surface)', () => {
    const literal = provider.FormatBinaryLiteralForTest(content, Buffer.from("'; DROP TABLE x;--").toString('base64'));
    expect(literal).toMatch(/^0x[0-9A-F]*$/);
  });
});

describe('SQLServerDataProvider.RenderSaveCallBinding — binary fields', () => {
  let entityInfo: EntityInfo;
  let provider: BinaryTestProvider;

  beforeEach(() => {
    mssqlState.Reset();
    entityInfo = makeDocumentEntityInfo();
    provider = makeProvider(entityInfo);
  });

  function binding(values: Array<[string, unknown]>): Extract<SaveCallBinding, { kind: 'mssql-declare-exec' }> {
    const map = new Map<EntityFieldInfo, unknown>(values.map(([n, v]) => [field(entityInfo, n), v]));
    const b = provider.RenderBindingForTest(newEntity(entityInfo), map, false);
    if (b.kind !== 'mssql-declare-exec') throw new Error(`unexpected binding kind ${b.kind}`);
    return b;
  }

  it('SETs a binary variable from a hex literal, declared as VARBINARY(MAX)', () => {
    const b = binding([['Name', 'Doc'], ['Content', 'AQL/']]);
    expect(b.preambleSQL).toMatch(/@Content_[0-9a-f]+ VARBINARY\(MAX\)/);
    expect(b.setSQL).toMatch(/SET @Content_[0-9a-f]+ = 0x0102FF/);
    expect(b.setSQL).not.toContain("'AQL/'");
  });

  it('renders the simple-params form of a binary field as a hex literal', () => {
    const b = binding([['Name', 'Doc'], ['Content', 'AQL/']]);
    expect(b.simpleParamsSQL).toContain('@Content=0x0102FF');
    expect(b.simpleParamsSQL).not.toContain('AQL/');
  });

  it('a binary field as the FIRST param has no leading separator', () => {
    const b = binding([['Content', 'AQ=='], ['Name', 'Doc']]);
    expect(b.simpleParamsSQL.startsWith('@Content=0x01')).toBe(true);
  });

  it('a null binary value is not SET and renders NULL in the simple-params form (with _Clear)', () => {
    const b = binding([['Name', 'Doc'], ['Content', null]]);
    expect(b.setSQL).not.toMatch(/SET @Content_/);
    expect(b.simpleParamsSQL).toContain('@Content=NULL');
    expect(b.callArgsSQL).toMatch(/@Content=@Content_[0-9a-f]+/);
  });

  it('handles fixed-length binary(n) the same way', () => {
    const b = binding([['Name', 'Doc'], ['Hash', Buffer.from([1, 2, 3, 4]).toString('base64')]]);
    expect(b.setSQL).toMatch(/SET @Hash_[0-9a-f]+ = 0x01020304/);
    expect(b.simpleParamsSQL).toContain('@Hash=0x01020304');
  });

  it('throws for an invalid base64 value instead of storing garbage', () => {
    expect(() => binding([['Name', 'Doc'], ['Content', '%%%']])).toThrow(/Field "Content" is binary/);
  });
});

describe('SQLServerDataProvider save path — binary round trip', () => {
  beforeEach(() => {
    mssqlState.Reset();
  });

  it('writes the hex literal and hydrates the returned Buffer as base64', async () => {
    const entityInfo = makeDocumentEntityInfo();
    const provider = makeProvider(entityInfo);
    const entity = newEntity(entityInfo);
    entity.Set('Name', 'Doc');
    entity.Set('Content', 'AQL/');

    mssqlState.QueueResult({
      rows: [{ ID: 'd-0001', Name: 'Doc', Content: Buffer.from([1, 2, 255]), Hash: null }],
    });

    const result = await provider.Save(entity, TEST_USER, new EntitySaveOptions());
    expect(result).not.toBe(false);

    expect(mssqlState.Queries).toHaveLength(1);
    const sql = mssqlState.Queries[0].sql;
    expect(sql).toMatch(/SET @Content_[0-9a-f]+ = 0x0102FF/);
    expect(sql).toContain('EXEC [dbo].spCreateDocument');

    const saved = result as Record<string, unknown>;
    expect(saved.Content).toBe('AQL/');
    expect(saved.Hash).toBeNull();
  });
});
