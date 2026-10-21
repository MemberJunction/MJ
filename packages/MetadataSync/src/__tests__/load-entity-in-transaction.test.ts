/**
 * LoadEntity over a preloaded entity, inside the push transaction.
 *
 * The preload cache learns about rows saved during a push only through BaseEngine's save-event
 * bus, and while a transaction is open that mutation is deferred to commit (rollback-safe engine
 * caches). The default push is one transaction, so a record created by an earlier graph is not in
 * the cache when a later graph addresses it by primaryKey. LoadEntity must not read that cache miss
 * as "record absent" — that turned the later update into a create of a half-populated row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncMetadataEngine } from '../lib/sync-metadata-engine';
import { SyncEngine } from '../lib/sync-engine';
import {
  BaseEntity,
  CompositeKey,
  type EntityInfo,
  type EntityFieldInfo,
  type IMetadataProvider,
  type UserInfo,
} from '@memberjunction/core';

const ENTITY = 'MJ: Test Widgets';

interface CapturedRunViewParams {
  EntityName: string;
  ExtraFilter?: string;
  MaxRows?: number;
}

/** Rows visible to the push's transaction — committed and uncommitted alike. */
const transactionRows = new Map<string, Record<string, unknown>>();
const runViewCalls: CapturedRunViewParams[] = [];

const idField = { Name: 'ID', Type: 'uniqueidentifier', NeedsQuotes: true } as unknown as EntityFieldInfo;
const entityInfoFixture: EntityInfo = {
  Name: ENTITY,
  PrimaryKeys: [idField],
  FirstPrimaryKey: idField,
  Fields: [
    idField,
    { Name: 'Name', Type: 'nvarchar', NeedsQuotes: true } as unknown as EntityFieldInfo,
  ],
} as unknown as EntityInfo;

function idFromFilter(filter: string | undefined): string {
  const match = /ID = '([^']+)'/.exec(filter ?? '');
  return match ? match[1] : '';
}

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();

  class MockMetadata {
    public EntityByName(name: string): EntityInfo | null {
      return name === ENTITY ? entityInfoFixture : null;
    }
  }

  class MockRunView {
    public async RunView(params: CapturedRunViewParams): Promise<{ Success: boolean; Results: Array<Record<string, unknown>> }> {
      runViewCalls.push(params);
      const row = transactionRows.get(idFromFilter(params.ExtraFilter).toLowerCase());
      return { Success: true, Results: row ? [row] : [] };
    }
  }

  return {
    ...actual,
    Metadata: MockMetadata,
    RunView: MockRunView,
    BaseEngine: class {
      protected ProviderToUse: IMetadataProvider | null = null;
      public Configs: unknown[] = [];
      protected async Load(): Promise<void> {}
      protected SetupGlobalEventListener(): void {}
      protected canUseImmediateMutation(): boolean {
        return true;
      }
    },
  };
});

/** Minimal stand-in for a BaseEntity row: field access, PK, provider binding, and InnerLoad. */
class FakeWidget {
  private data: Record<string, unknown>;
  public BoundProvider: unknown = null;

  constructor(data: Record<string, unknown> = {}) {
    this.data = { ...data };
  }

  public Get(name: string): unknown {
    return this.data[name];
  }

  public GetAll(): Record<string, unknown> {
    return { ...this.data };
  }

  public get PrimaryKey(): CompositeKey {
    const key = new CompositeKey();
    key.LoadFromSimpleObject({ ID: this.data.ID });
    return key;
  }

  public BindProvider(provider: unknown): void {
    this.BoundProvider = provider;
  }

  public async InnerLoad(key: CompositeKey): Promise<boolean> {
    const id = String(key.GetValueByFieldName('ID')).toLowerCase();
    const row = transactionRows.get(id);
    if (!row) return false;
    this.data = { ...row };
    return true;
  }
}

/** The push's provider: a transaction is open, so BaseEngine defers cache mutations to commit. */
function makeTransactionalProvider(): IMetadataProvider {
  return {
    TransactionDepth: 1,
    GetEntityObject: async () => new FakeWidget() as unknown as BaseEntity,
  } as unknown as IMetadataProvider;
}

const EXISTING_ID = '11111111-1111-1111-1111-111111111111';
const CREATED_THIS_PUSH_ID = '22222222-2222-2222-2222-222222222222';
const NEVER_CREATED_ID = '33333333-3333-3333-3333-333333333333';

describe('SyncEngine.LoadEntity — preloaded entity inside an open push transaction', () => {
  let syncEngine: SyncEngine;
  let syncMetadataEngine: SyncMetadataEngine;
  let provider: IMetadataProvider;

  beforeEach(() => {
    transactionRows.clear();
    runViewCalls.length = 0;

    syncEngine = new SyncEngine({} as UserInfo);
    syncMetadataEngine = new SyncMetadataEngine();
    syncMetadataEngine.initializeEngine(syncEngine);
    syncEngine.setMetadataEngine(syncMetadataEngine);
    provider = makeTransactionalProvider();

    // Preloaded before the push: one committed row.
    const existingRow = { ID: EXISTING_ID, Name: 'Existing' };
    transactionRows.set(EXISTING_ID.toLowerCase(), existingRow);
    syncMetadataEngine.setCachedEntitiesForTesting(ENTITY, [new FakeWidget(existingRow) as unknown as BaseEntity]);
  });

  it('serves a preloaded row from the cache without a database round trip', async () => {
    const loaded = await syncEngine.LoadEntity(ENTITY, { ID: EXISTING_ID }, provider);

    expect(loaded).not.toBeNull();
    expect(loaded!.Get('Name')).toBe('Existing');
    expect(runViewCalls).toHaveLength(0);
    expect((loaded as unknown as FakeWidget).BoundProvider).toBe(provider);
  });

  it('finds a record created earlier in the same push (graph 1 create, graph 2 update by primaryKey)', async () => {
    // Graph 1: the record does not exist yet, so LoadEntity reports it absent and the push creates it.
    expect(await syncEngine.LoadEntity(ENTITY, { ID: CREATED_THIS_PUSH_ID }, provider)).toBeNull();

    // The save lands in the open transaction. BaseEngine defers the cache mutation until commit,
    // so the preload cache still does not hold the row.
    transactionRows.set(CREATED_THIS_PUSH_ID.toLowerCase(), { ID: CREATED_THIS_PUSH_ID, Name: 'Created by graph 1' });
    expect(syncMetadataEngine.findCachedByPrimaryKey(ENTITY, { ID: CREATED_THIS_PUSH_ID })).toBeNull();

    // Graph 2 addresses the same primaryKey with an update. It must load the row, not report it missing.
    const loaded = await syncEngine.LoadEntity(ENTITY, { ID: CREATED_THIS_PUSH_ID }, provider);

    expect(loaded).not.toBeNull();
    expect(loaded!.Get('ID')).toBe(CREATED_THIS_PUSH_ID);
    expect(loaded!.Get('Name')).toBe('Created by graph 1');
    expect(runViewCalls.at(-1)?.ExtraFilter).toContain(CREATED_THIS_PUSH_ID);
  });

  it('does not put an uncommitted row into the preload cache, so a rollback cannot leave it behind', async () => {
    transactionRows.set(CREATED_THIS_PUSH_ID.toLowerCase(), { ID: CREATED_THIS_PUSH_ID, Name: 'Uncommitted' });

    await syncEngine.LoadEntity(ENTITY, { ID: CREATED_THIS_PUSH_ID }, provider);

    expect(syncMetadataEngine.findCachedByPrimaryKey(ENTITY, { ID: CREATED_THIS_PUSH_ID })).toBeNull();
    expect(syncMetadataEngine.getCachedEntities(ENTITY)).toHaveLength(1);
  });

  it('still returns null for a primaryKey that exists nowhere, so the push creates it', async () => {
    const loaded = await syncEngine.LoadEntity(ENTITY, { ID: NEVER_CREATED_ID }, provider);

    expect(loaded).toBeNull();
    expect(runViewCalls).toHaveLength(1);
  });
});
