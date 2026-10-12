/**
 * Parameterized entity saves/deletes on SQL Server.
 *
 * A save's values travel as nvarchar(max) parameters so the executed batch text is constant per
 * entity + operation and SQL Server reuses its plan, while the LITERAL statement remains what SQL
 * logging records and what runs whenever parameterizing is unsafe. Drives the REAL provider through
 * Save()/Delete() with REAL EntityInfo fixtures; only the mssql module is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import type { BaseEntity, EntityFieldInfo, UserInfo } from '@memberjunction/core';
import { EntityDeleteOptions, EntityInfo, EntitySaveOptions } from '@memberjunction/core';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { SQLServerTransactionGroup } from '../SQLServerTransactionGroup';
import { SaveParameterText, SQLServerParameterizedStatement } from '../parameterizedSave';
import { mssqlState, MockConnectionPool, MOCK_MAX, RecordedQuery } from './helpers/mock-mssql';
import {
  TEST_USER,
  makeWidgetEntityInfo,
  makeRecordChangesEntityInfo,
  makeSavedWidgetEntity,
  makeNewWidgetEntity,
  savedWidgetRow,
  TestEntity,
} from './helpers/entity-fixtures';

/** A loaded (IsSaved) widget with the given primary key. */
function loadedWidget(info: EntityInfo, id: string): TestEntity {
  const entity = new TestEntity(info);
  entity.ContextCurrentUser = TEST_USER;
  entity.SetMany({ ...savedWidgetRow(), ID: id }, false, true, true);
  return entity;
}

interface ProviderPrivateSurface {
  _pool: MockConnectionPool;
  _datetimeOffsetTestComplete: boolean;
  _needsDatetimeOffsetAdjustment: boolean;
}

interface LoggedStatement {
  Query: string;
  SimpleSQLFallback?: string;
}

class ParamTestProvider extends SQLServerDataProvider {
  public Logged: LoggedStatement[] = [];
  private testEntities: EntityInfo[] = [makeRecordChangesEntityInfo()];

  public override get Entities(): EntityInfo[] {
    return this.testEntities;
  }

  public override get MJCoreSchemaName(): string {
    return '__mj';
  }

  public AttachPool(pool: MockConnectionPool): void {
    const surface = this as unknown as ProviderPrivateSurface;
    surface._pool = pool;
    surface._datetimeOffsetTestComplete = true;
    surface._needsDatetimeOffsetAdjustment = false;
  }

  // Captures exactly what every SQL logging session receives (SqlLogger writes `query`, or
  // `simpleSQLFallback` for sessions without logRecordChangeMetadata — it never reads parameters).
  protected override async _logSqlStatement(
    query: string,
    _parameters?: unknown,
    _description?: string,
    ignoreLogging: boolean = false,
    _isMutation: boolean = false,
    simpleSQLFallback?: string,
  ): Promise<void> {
    if (!ignoreLogging) this.Logged.push({ Query: query, SimpleSQLFallback: simpleSQLFallback });
  }

  protected override async HandleEntityActions(): Promise<never[]> {
    return [];
  }

  protected override async HandleEntityAIActions(): Promise<void> {
    // AI engine not under test
  }

  public async SaveSQLForTest(entity: BaseEntity, isNew: boolean) {
    return this.GenerateSaveSQL(entity, isNew, TEST_USER as UserInfo, new EntitySaveOptions());
  }
}

function makeProvider(): ParamTestProvider {
  const provider = new ParamTestProvider();
  provider.AttachPool(new MockConnectionPool());
  return provider;
}

function inputValue(q: RecordedQuery, value: unknown): boolean {
  return q.inputs.some((i) => i.value === value);
}

async function saveUpdate(provider: ParamTestProvider, entityInfo: EntityInfo, id: string, name: string, quantity: number | null): Promise<RecordedQuery> {
  const entity = loadedWidget(entityInfo, id);
  entity.Set('Name', name);
  entity.Set('Quantity', quantity);
  mssqlState.QueueResult({ rows: [{ ...savedWidgetRow(), ID: id, Name: name, Quantity: quantity }] });
  expect(await provider.Save(entity, TEST_USER, new EntitySaveOptions())).toBeTruthy();
  return mssqlState.Queries[mssqlState.Queries.length - 1];
}

describe('parameterized saves: constant statement text', () => {
  beforeEach(() => mssqlState.Reset());

  it('two UPDATEs of different records with different values execute byte-identical SQL', async () => {
    const provider = makeProvider();
    const info = makeWidgetEntityInfo();
    const a = await saveUpdate(provider, info, 'w-0001', 'Alpha', 1);
    const b = await saveUpdate(provider, info, 'w-0002', "Beta's", 2);

    expect(a.sql).toBe(b.sql);
    expect(a.sql).toContain('EXEC [dbo].spUpdateWidget ');
    expect(a.sql).not.toContain('Alpha');
    expect(b.sql).not.toContain('Beta');
    expect(a.sql).not.toContain('w-0001');
    expect(inputValue(a, 'Alpha') && inputValue(a, 'w-0001')).toBe(true);
    expect(inputValue(b, "Beta's") && inputValue(b, 'w-0002')).toBe(true);
  });

  it('a NULL value is SET from a NULL parameter; only its _Clear companion changes the text', async () => {
    const provider = makeProvider();
    const info = makeWidgetEntityInfo();
    const withValue = await saveUpdate(provider, info, 'w-0001', 'Alpha', 5);
    const withNull = await saveUpdate(provider, info, 'w-0001', 'Alpha', null);
    // The literal path omits the SET for a NULL; the parameterized one always SETs, so the only
    // variance is the `_Clear=1` companion (kept as-is: one extra plan per null pattern of
    // NeedsClearCompanion fields, not one per save).
    expect(withNull.sql).toContain('SET @Quantity_mjp = @mjp');
    expect(withNull.sql).toContain('@Quantity_Clear=1');
    expect(withValue.sql).not.toContain('@Quantity_Clear');
    expect(withNull.sql.replace(',\n                @Quantity_Clear=1', '')).toBe(withValue.sql);
    const quantityRef = /SET @Quantity_mjp = @(mjp\d+)/.exec(withNull.sql) as RegExpExecArray;
    expect(withNull.inputs.find((i) => i.name === quantityRef[1])?.value).toBeNull();
  });

  it('two UPDATEs with TrackRecordChanges execute byte-identical SQL; Record Change values are parameters', async () => {
    const provider = makeProvider();
    const info = makeWidgetEntityInfo({ trackRecordChanges: true });
    const a = await saveUpdate(provider, info, 'w-0001', 'Alpha', 1);
    const b = await saveUpdate(provider, info, 'w-0002', "O'Brien", 2);

    expect(a.sql).toBe(b.sql);
    expect(a.sql).toContain('spCreateRecordChange_Internal');
    expect(a.sql).toContain('@mjrc_ChangesJSON VARCHAR(MAX) = @mjp');
    expect(a.sql).toContain('@mjrc_FullRecordJSON VARCHAR(MAX) = @mjp');
    expect(a.sql).toContain('@ChangesJSON=@mjrc_ChangesJSON');
    expect(b.sql).not.toContain('Brien');
    // The bound Record Change JSON is the text the literal produced: quotes NOT doubled.
    const changes = b.inputs.map((i) => i.value).find((v) => typeof v === 'string' && v.includes('"Name"') && v.includes('"field"'));
    expect(changes).toBeDefined();
    expect(changes as string).toContain("O'Brien");
    expect(changes as string).not.toContain("O''Brien");
    expect(b.inputs.some((i) => i.value === TEST_USER.ID)).toBe(true);
  });

  it('two DELETEs (with Record Changes) of different records execute byte-identical SQL', async () => {
    const provider = makeProvider();
    const info = makeWidgetEntityInfo({ trackRecordChanges: true });
    const run = async (id: string): Promise<RecordedQuery> => {
      const entity = loadedWidget(info, id);
      mssqlState.QueueResult({ rows: [{ ID: id }] });
      expect(await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER)).toBe(true);
      return mssqlState.Queries[mssqlState.Queries.length - 1];
    };
    const a = await run('w-0001');
    const b = await run('w-0002');
    expect(a.sql).toBe(b.sql);
    expect(a.sql).toContain('EXEC [dbo].[spDeleteWidget] @ID=@mjp0');
    expect(a.sql).toContain('@RecordID=@mjrc_RecordID');
    expect(a.sql).not.toContain('w-0001');
    expect(inputValue(a, 'w-0001') && inputValue(b, 'w-0002')).toBe(true);
  });
});

describe('parameterized saves: parameter values and types', () => {
  beforeEach(() => mssqlState.Reset());

  it('CREATE binds every value as nvarchar(max) text equal to the literal it replaces (unicode, quotes, bit, date, NULL)', async () => {
    const provider = makeProvider();
    const entity = makeNewWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    entity.Set('ID', 'C0000000-0000-0000-0000-0000000000C1');
    entity.Set('Name', "Wídgét's 名前 😀");
    entity.Set('IsActive', false);
    entity.Set('LaunchedAt', new Date('2025-04-05T12:00:00.000Z'));
    entity.Set('Quantity', 42);
    mssqlState.QueueResult({ rows: [savedWidgetRow()] });

    await provider.Save(entity, TEST_USER, new EntitySaveOptions());
    const q = mssqlState.Queries[0];

    expect(q.inputs.length).toBeGreaterThan(0);
    for (const input of q.inputs) {
      expect(input.type).toEqual({ type: 'NVarChar', length: MOCK_MAX });
      expect(input.name).toMatch(/^mjp\d+$/);
    }
    const valueFor = (codeName: string): unknown => {
      const ref = new RegExp(`SET @${codeName}_mjp = @(mjp\\d+)`).exec(q.sql);
      expect(ref, `no SET for ${codeName} in:\n${q.sql}`).not.toBeNull();
      return q.inputs.find((i) => i.name === (ref as RegExpExecArray)[1])?.value;
    };
    expect(valueFor('Name')).toBe("Wídgét's 名前 😀"); // raw text: no N prefix, no doubled quote
    expect(valueFor('IsActive')).toBe('0');
    expect(valueFor('LaunchedAt')).toBe('2025-04-05T12:00:00.000Z');
    expect(valueFor('Quantity')).toBe('42');
    expect(valueFor('ID')).toBe('C0000000-0000-0000-0000-0000000000C1');
    expect(valueFor('Description')).toBeNull();
    // Typed variables are unchanged, so SQL Server converts the same text to the same type.
    expect(q.sql).toContain('@Name_mjp NVARCHAR(100)');
    expect(q.sql).toContain('@LaunchedAt_mjp DATETIMEOFFSET');
  });

  describe('SaveParameterText (per type class)', () => {
    const info = new EntityInfo({
      ID: 'B1000000-0000-0000-0000-000000000001',
      Name: 'Type Probe',
      SchemaName: 'dbo',
      BaseTable: 'TypeProbe',
      BaseView: 'vwTypeProbes',
      EntityFields: [
        ['Amount', 'decimal', 9, 18, 4],
        ['Code', 'varchar', 50, 0, 0],
        ['Count', 'int', 4, 0, 0],
        ['Ratio', 'float', 8, 0, 0],
        ['Stamp', 'datetime', 8, 0, 0],
        ['Flag', 'bit', 1, 0, 0],
        ['Payload', 'nvarchar', -1, 0, 0],
        ['Blob', 'varbinary', -1, 0, 0],
        ['Ref', 'uniqueidentifier', 16, 0, 0],
      ].map(([name, type, length, precision, scale], i) => ({
        ID: `B2000000-0000-0000-0000-00000000000${i}`,
        EntityID: 'B1000000-0000-0000-0000-000000000001',
        Sequence: i + 1,
        Name: name,
        Type: type,
        Length: length,
        Precision: precision,
        Scale: scale,
        AllowsNull: true,
        Status: 'Active',
      })),
    });
    const field = (name: string): EntityFieldInfo => info.Fields.find((f) => f.Name === name) as EntityFieldInfo;

    it('decimal / float: plain digits bind as the literal text', () => {
      expect(SaveParameterText(field('Amount'), 1234.5678)).toBe('1234.5678');
      expect(SaveParameterText(field('Amount'), -0.1)).toBe('-0.1');
      expect(SaveParameterText(field('Ratio'), 0.30000000000000004)).toBe('0.30000000000000004');
    });

    it('numbers with no identical text form are unsafe (exponent literal, fraction for an int column)', () => {
      expect(SaveParameterText(field('Amount'), 1e-7)).toBeUndefined();
      expect(SaveParameterText(field('Ratio'), 1e21)).toBeUndefined();
      expect(SaveParameterText(field('Count'), 3.5)).toBeUndefined();
      expect(SaveParameterText(field('Count'), 7)).toBe('7');
    });

    it('varchar binds raw text (SQL Server converts to the varchar variable, as it did the literal)', () => {
      expect(field('Code').UnicodePrefix).toBe('');
      expect(SaveParameterText(field('Code'), "it's")).toBe("it's");
    });

    it('datetime: numbers, strings and Dates all become the same ISO text the literal used', () => {
      const iso = '2024-02-29T23:59:59.123Z';
      expect(SaveParameterText(field('Stamp'), new Date(iso))).toBe(iso);
      expect(SaveParameterText(field('Stamp'), iso)).toBe(iso);
      expect(SaveParameterText(field('Stamp'), Date.parse(iso))).toBe(iso);
    });

    it('bit: booleans and boolean strings map to 1/0', () => {
      expect(SaveParameterText(field('Flag'), true)).toBe('1');
      expect(SaveParameterText(field('Flag'), 'false')).toBe('0');
      expect(SaveParameterText(field('Flag'), 0)).toBe('0');
    });

    it('nvarchar(max): objects are JSON text, long strings pass through whole', () => {
      expect(SaveParameterText(field('Payload'), { a: "b'c" })).toBe('{"a":"b\'c"}');
      const long = 'x'.repeat(100_000);
      expect(SaveParameterText(field('Payload'), long)).toBe(long);
    });

    it('uniqueidentifier text, NULL, and binary (hex literal → unsafe)', () => {
      expect(SaveParameterText(field('Ref'), 'B2000000-0000-0000-0000-000000000001')).toBe('B2000000-0000-0000-0000-000000000001');
      expect(SaveParameterText(field('Ref'), null)).toBeNull();
      expect(SaveParameterText(field('Amount'), undefined)).toBeNull();
      expect(SaveParameterText(field('Blob'), 'AAEC')).toBeUndefined();
    });
  });
});

describe('parameterized saves: SQL logging still records runnable literal SQL', () => {
  beforeEach(() => mssqlState.Reset());

  it('the logger receives the literal statement (and literal fallback), not the @mjp text', async () => {
    const provider = makeProvider();
    const info = makeWidgetEntityInfo({ trackRecordChanges: true });
    const executed = await saveUpdate(provider, info, 'w-0001', "Wídgét's", 9);

    expect(provider.Logged).toHaveLength(1);
    const logged = provider.Logged[0];
    expect(logged.Query).not.toContain('@mjp');
    expect(logged.Query).toMatch(/SET @Name_[0-9a-f]{12} = N'Wídgét''s'/);
    expect(logged.Query).toContain("@ChangesJSON='");
    expect(logged.SimpleSQLFallback).toMatch(/SET @Name_[0-9a-f]{12} = N'Wídgét''s'/);
    expect(logged.SimpleSQLFallback).not.toContain('@mjp');
    // ...while the executed statement carried the values as parameters.
    expect(executed.sql).toContain('@mjp');
    expect(executed.sql).not.toContain('Wídgét');
  });
});

describe('parameterized saves: fallback to the literal batch', () => {
  beforeEach(() => mssqlState.Reset());
  afterEach(() => {
    SQLServerDataProvider.MaxSaveParameters = 2000;
  });

  it('past MaxSaveParameters the literal batch runs with no bound inputs', async () => {
    SQLServerDataProvider.MaxSaveParameters = 3;
    const provider = makeProvider();
    const q = await saveUpdate(provider, makeWidgetEntityInfo(), 'w-0001', 'Over Limit', 1);
    expect(q.inputs).toHaveLength(0);
    expect(q.sql).not.toContain('@mjp');
    expect(q.sql).toMatch(/SET @Name_[0-9a-f]{12} = N'Over Limit'/);
  });

  it('at exactly MaxSaveParameters it still parameterizes', async () => {
    const provider = makeProvider();
    const probe = await saveUpdate(provider, makeWidgetEntityInfo(), 'w-0001', 'Probe', 1);
    SQLServerDataProvider.MaxSaveParameters = probe.inputs.length;
    const q = await saveUpdate(provider, makeWidgetEntityInfo(), 'w-0001', 'At Limit', 1);
    expect(q.inputs).toHaveLength(probe.inputs.length);
    expect(q.sql).toContain('@mjp');
  });

  it('a value with no plain-text literal form (int written in exponent form) runs the literal batch', async () => {
    const provider = makeProvider();
    const q = await saveUpdate(provider, makeWidgetEntityInfo(), 'w-0001', 'Exponent', 1e21);
    expect(q.inputs).toHaveLength(0);
    expect(q.sql).toMatch(/SET @Quantity_[0-9a-f]{12} = 1e\+21/);
  });

  it('a save inside a TransactionGroup keeps the literal statement and no parameters', async () => {
    const provider = makeProvider();
    const entity = makeSavedWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    entity.TransactionGroup = new SQLServerTransactionGroup();
    entity.Set('Name', 'Grouped');
    const details = await provider.SaveSQLForTest(entity, false);
    expect(details.parameters).toBeNull();
    expect(details.fullSQL).toMatch(/SET @Name_[0-9a-f]{12} = N'Grouped'/);
  });

  it('ParameterizeSaves=false restores literal execution everywhere', async () => {
    SQLServerDataProvider.ParameterizeSaves = false;
    try {
      const provider = makeProvider();
      const q = await saveUpdate(provider, makeWidgetEntityInfo(), 'w-0001', 'Switched Off', 1);
      expect(q.inputs).toHaveLength(0);
      expect(q.sql).toMatch(/SET @Name_[0-9a-f]{12} = N'Switched Off'/);
    } finally {
      SQLServerDataProvider.ParameterizeSaves = true;
    }
  });

  it('a parameterized statement handed a different query runs that query literally, unbound', async () => {
    const provider = makeProvider();
    const stale = new SQLServerParameterizedStatement('SELECT @mjp0 AS X', [{ Name: 'mjp0', Value: '1' }], 'SELECT 1 AS X');
    mssqlState.QueueResult({ rows: [{ X: 2 }] });
    await provider.ExecuteSQL('SELECT 2 AS X', [stale]);
    const q = mssqlState.Queries[0];
    expect(q.sql).toBe('SELECT 2 AS X');
    expect(q.inputs).toHaveLength(0);
  });
});
