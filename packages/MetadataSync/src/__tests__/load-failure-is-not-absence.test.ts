/**
 * A failed primary-key lookup is not "row absent" (#5486).
 *
 * `RunView` returning `Success: false` has not shown that the row is missing. Treating it as absent
 * let push create a duplicate (`NewRecord()` with the declared key) or mark a delete as already done
 * (`notFound`). Only `Success: true` with no rows is absence. RunView and Metadata are mocked; the
 * real SyncEngine lookup runs underneath PushService.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BaseEntity, EntityFieldInfo, EntityInfo, UserInfo } from '@memberjunction/core';
import type { FlattenedRecord } from '../lib/record-dependency-analyzer';
import type { PushCallbacks, PushRecordError } from '../services/PushService';

const ENTITY = 'MJ: Test Widgets';
const ROW_ID = '11111111-1111-1111-1111-111111111111';

type RunViewOutcome = { Success: boolean; Results: Record<string, unknown>[]; ErrorMessage?: string };

/** What the next RunView returns. */
let runViewOutcome: RunViewOutcome = { Success: true, Results: [] };
/** Every entity object handed out, so a test can see whether NewRecord ran. */
const createdEntities: FakeWidget[] = [];

const idField = { Name: 'ID', Type: 'uniqueidentifier', NeedsQuotes: true } as unknown as EntityFieldInfo;
const entityInfoFixture = {
  Name: ENTITY,
  PrimaryKeys: [idField],
  FirstPrimaryKey: idField,
  Fields: [idField, { Name: 'Name', Type: 'nvarchar', NeedsQuotes: true } as unknown as EntityFieldInfo],
} as unknown as EntityInfo;

/** Minimal stand-in for a BaseEntity: field access, NewRecord and InnerLoad. */
class FakeWidget {
  public data: Record<string, unknown> = {};
  public NewRecordCalls = 0;
  public EntityInfo = entityInfoFixture;
  public LatestResult = null;

  public Get(name: string): unknown {
    return this.data[name];
  }

  public Set(name: string, value: unknown): void {
    this.data[name] = value;
  }

  public GetAll(): Record<string, unknown> {
    return { ...this.data };
  }

  public NewRecord(): void {
    this.NewRecordCalls++;
    this.data = {};
  }

  public BindProvider(): void {}

  public async InnerLoad(): Promise<boolean> {
    const row = runViewOutcome.Results[0];
    if (!row) return false;
    this.data = { ...row };
    return true;
  }
}

function newWidget(): FakeWidget {
  const widget = new FakeWidget();
  createdEntities.push(widget);
  return widget;
}

const fakeHost = {
  TransactionDepth: 1,
  GetEntityObject: async () => newWidget() as unknown as BaseEntity,
};

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockMetadata {
    public static get Provider(): typeof fakeHost {
      return fakeHost;
    }
    public EntityByName(name: string): EntityInfo | null {
      return name === ENTITY ? entityInfoFixture : null;
    }
    public async GetEntityObject(): Promise<BaseEntity> {
      return newWidget() as unknown as BaseEntity;
    }
  }
  class MockRunView {
    public async RunView(): Promise<RunViewOutcome> {
      return runViewOutcome;
    }
  }
  return { ...actual, Metadata: MockMetadata, RunView: MockRunView };
});

import { SyncEngine } from '../lib/sync-engine';
import { PushService } from '../services/PushService';

const FAILED: RunViewOutcome = { Success: false, Results: [], ErrorMessage: 'connection reset' };
const EMPTY: RunViewOutcome = { Success: true, Results: [] };
const ONE_ROW: RunViewOutcome = { Success: true, Results: [{ ID: ROW_ID, Name: 'Existing' }] };

function upsertRecord(): FlattenedRecord {
  return {
    id: 'widget',
    entityName: ENTITY,
    record: { primaryKey: { ID: ROW_ID }, fields: { Name: 'Existing' } },
    dependencies: new Set(),
    depth: 0,
    path: 'widgets/.widgets.json',
    originalIndex: 0,
    graphId: 'widget',
  };
}

function deleteRecord(): FlattenedRecord {
  return { ...upsertRecord(), record: { primaryKey: { ID: ROW_ID }, fields: {}, deleteRecord: { delete: true } } };
}

describe('SyncEngine primary-key lookup', () => {
  let syncEngine: SyncEngine;

  beforeEach(() => {
    syncEngine = new SyncEngine({} as UserInfo);
    createdEntities.length = 0;
  });

  it('throws a lookup error naming the entity and key when RunView fails', async () => {
    runViewOutcome = FAILED;
    await expect(syncEngine.LoadEntity(ENTITY, { ID: ROW_ID })).rejects.toThrow(
      `Lookup of ${ENTITY} (ID = '${ROW_ID}') failed: connection reset`
    );
    await expect(syncEngine.LoadEntityFromDatabase(ENTITY, { ID: ROW_ID })).rejects.toThrow('failed: connection reset');
  });

  it('returns null when RunView succeeds with no rows', async () => {
    runViewOutcome = EMPTY;
    expect(await syncEngine.LoadEntity(ENTITY, { ID: ROW_ID })).toBeNull();
    expect(await syncEngine.LoadEntityFromDatabase(ENTITY, { ID: ROW_ID })).toBeNull();
  });

  it('loads the row when RunView finds it', async () => {
    runViewOutcome = ONE_ROW;
    const loaded = await syncEngine.LoadEntity(ENTITY, { ID: ROW_ID });
    expect(loaded?.Get('Name')).toBe('Existing');
  });

  it('throws when RunView finds the row but the entity load fails', async () => {
    runViewOutcome = ONE_ROW;
    vi.spyOn(FakeWidget.prototype, 'InnerLoad').mockResolvedValueOnce(false);
    await expect(syncEngine.LoadEntityFromDatabase(ENTITY, { ID: ROW_ID })).rejects.toThrow('could not be loaded');
  });
});

describe('push with a failed primary-key lookup', () => {
  let service: PushService;
  let recordErrors: PushRecordError[];
  let warnings: string[];
  let callbacks: PushCallbacks;

  beforeEach(() => {
    const syncEngine = new SyncEngine({} as UserInfo);
    service = new PushService(syncEngine, {} as UserInfo);
    createdEntities.length = 0;
    recordErrors = [];
    warnings = [];
    callbacks = {
      onRecordError: (detail: PushRecordError) => recordErrors.push(detail),
      onWarn: (message: string) => warnings.push(message),
      onError: () => undefined,
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const push = (record: FlattenedRecord) =>
    service['processFlattenedRecord'](record, '/dummy/dir', {}, new Map(), callbacks, { entity: ENTITY });
  const remove = (record: FlattenedRecord) => service['processDeleteRecord'](record, '', {}, callbacks);

  it('create path: a failed lookup throws and never reaches NewRecord', async () => {
    runViewOutcome = FAILED;
    await expect(push(upsertRecord())).rejects.toThrow(`Lookup of ${ENTITY}`);
    expect(createdEntities.every(e => e.NewRecordCalls === 0)).toBe(true);
    expect(recordErrors.filter(e => e.message.startsWith('Record not found'))).toEqual([]);
  });

  it('create path: a confirmed-empty lookup still reports the record as missing', async () => {
    runViewOutcome = EMPTY;
    const result = await push(upsertRecord());
    expect(result.status).toBe('error');
    expect(recordErrors[0]?.message).toContain('Record not found');
  });

  it('delete path: a failed lookup throws and does not mark the record notFound', async () => {
    runViewOutcome = FAILED;
    const marker = deleteRecord();
    await expect(remove(marker)).rejects.toThrow(`Lookup of ${ENTITY}`);
    expect(marker.record.deleteRecord?.notFound).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it('delete path: a confirmed-empty lookup is skipped as not found', async () => {
    runViewOutcome = EMPTY;
    const marker = deleteRecord();
    const result = await remove(marker);
    expect(result.status).toBe('skipped');
    expect(marker.record.deleteRecord?.notFound).toBe(true);
  });
});
