import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import type { PageRecordsParams } from '@memberjunction/ai-vectors';

/** What the next PageRecordsByEntityID call answers: rows, or an error to throw. */
const pages = vi.hoisted((): Array<Record<string, unknown>[] | Error> => []);
const runViews = vi.hoisted(() => vi.fn());
const runView = vi.hoisted(() => vi.fn());

/* ------------------------------------------------------------------ */
/*  Hoisted mocks — same shape as entityVectorSyncExistenceRead.test.ts */
/* ------------------------------------------------------------------ */

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  class MockBaseSingleton<T> {
    private static _instances = new Map<string, unknown>();
    static getInstance<U>(): U {
      const key = this.name;
      if (!MockBaseSingleton._instances.has(key)) {
        MockBaseSingleton._instances.set(key, new (this as unknown as new () => U)());
      }
      return MockBaseSingleton._instances.get(key) as U;
    }
  }

  return {
    ...actual,
    RegisterClass: () => (_target: unknown) => {},
    RequiresSubclass: () => (_target: unknown) => {},
    OptionalKeyedSpecialization: () => (_target: unknown) => {},
    MJGlobal: { Instance: { ClassFactory: { GetRegistration: vi.fn() } } },
    BaseSingleton: MockBaseSingleton,
  };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    Metadata: class { Entities = []; },
    RunView: class {},
    ValidationResult: class { Errors: unknown[] = []; get Success() { return this.Errors.length === 0; } },
  };
});

vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/ai', () => ({}));
vi.mock('@memberjunction/ai-prompts', () => ({
  AIEmbeddingRunner: class {
    async RunEmbedding() {
      return { Success: true, Vectors: [] };
    }
  },
}));
vi.mock('@memberjunction/ai-vectordb', () => ({
  VectorDBBase: class { constructor(_k: string) {} },
}));
vi.mock('@memberjunction/ai-vectors', () => ({
  VectorBase: class {
    CurrentUser: unknown;
    Provider: unknown = undefined;
    get RunView() { return { RunViews: runViews, RunView: runView }; }
    /** Tests set this to stand in for the metadata provider `super.Metadata` returns. */
    TestMetadata: unknown = {};
    get Metadata() { return this.TestMetadata; }
    protected CanUseKeysetPagination(): boolean {
      return false;
    }
    protected async PageRecordsByEntityID<T>(_params: PageRecordsParams): Promise<T[]> {
      const next = pages.shift() ?? [];
      if (next instanceof Error) throw next;
      return next as T[];
    }
  },
}));
vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: { Instance: { Config: vi.fn() } },
}));
vi.mock('@memberjunction/templates', () => ({
  TemplateEngineServer: { Instance: { Config: vi.fn(), Templates: [], SetupNunjucks: vi.fn() } },
}));
vi.mock('@memberjunction/templates-base-types', () => ({}));

import type { MJEntityDocumentEntity, MJTemplateEntityExtended, MJVectorIndexEntity } from '@memberjunction/core-entities';
import { EntityVectorSyncer, ShouldPruneAfterRun } from '../models/entityVectorSync';
import { PagedRecords } from '../models/PagedRecords';
import type { EmbeddingData, TemplateParamData, VectorizeEntityParams, VectorizeEntityResponse } from '../generic/vectorSync.types';
import type { RecordDocumentVectorTarget } from '../models/entityRecordDocumentPruner';

const USER = { ID: 'u1' } as UserInfo;
const ENTITY = {
  Name: 'Members',
  FirstPrimaryKey: { Name: 'ID' },
  PrimaryKeys: [{ Name: 'ID' }],
} as unknown as EntityInfo;
const MD = { ConfigData: { MJCoreSchemaName: '__mj' } } as unknown as IMetadataProvider;
const DOC = { ID: 'D1', EntityID: 'E1', Name: 'Members search', Configuration: null } as unknown as MJEntityDocumentEntity;

type PagingState = { SeenRecordIDs: Set<string>; Completed: boolean };

interface DataPagingSeam {
  startDataPaging(
    dataStream: PagedRecords, params: VectorizeEntityParams, md: IMetadataProvider, entity: EntityInfo,
    template: MJTemplateEntityExtended, vectorIndexEntity: MJVectorIndexEntity, entityDocument: MJEntityDocumentEntity,
    pageSize: number, pagingState?: PagingState
  ): void;
}

class TestableSyncer extends EntityVectorSyncer {
  public async page(pageSize: number): Promise<PagingState> {
    const state: PagingState = { SeenRecordIDs: new Set(), Completed: false };
    const stream = new PagedRecords();
    const ended = new Promise<void>((resolve) => stream.on('end', () => resolve()));
    stream.resume();
    (this as unknown as DataPagingSeam).startDataPaging(
      stream, { entityID: 'E1' } as VectorizeEntityParams, MD, ENTITY,
      { Content: [{ TemplateText: 't' }] } as unknown as MJTemplateEntityExtended,
      { ID: 'VI1' } as MJVectorIndexEntity, DOC, pageSize, state
    );
    await ended;
    return state;
  }
  protected override async GetRelatedTemplateDataForBatch(): Promise<TemplateParamData[]> {
    return [];
  }
  protected override async GetTemplateData(_e: EntityInfo, record: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { ...record };
  }
  public Upsert(batch: EmbeddingData[]): Promise<void> {
    return this.UpsertEntityRecordDocumentBatch(batch, USER);
  }
  public Prune(seen: Set<string>, target: RecordDocumentVectorTarget): Promise<number> {
    return this.PruneOrphanedRecordDocuments(DOC, seen, target, USER);
  }
}

describe('ShouldPruneAfterRun', () => {
  it('prunes after a completed whole-document run', () => {
    expect(ShouldPruneAfterRun({}, { Completed: true }, undefined)).toBe(true);
    expect(ShouldPruneAfterRun({}, { Completed: true }, true)).toBe(true);
  });

  it('does not prune a list run, an offset run, a run whose paging stopped early, or when opted out', () => {
    expect(ShouldPruneAfterRun({ listID: 'L1' }, { Completed: true }, undefined)).toBe(false);
    expect(ShouldPruneAfterRun({ StartingOffset: 2 }, { Completed: true }, undefined)).toBe(false);
    expect(ShouldPruneAfterRun({}, { Completed: false }, undefined)).toBe(false);
    expect(ShouldPruneAfterRun({}, { Completed: true }, false)).toBe(false);
  });
});

describe('the paging loop records what a run saw', () => {
  beforeEach(() => { pages.length = 0; });

  it('collects every paged RecordID and marks a run that reached the last page complete', async () => {
    pages.push([{ ID: 'r1' }, { ID: 'r2' }], [{ ID: 'r3' }]);
    const state = await new TestableSyncer().page(2);
    expect([...state.SeenRecordIDs].sort()).toEqual(['r1', 'r2', 'r3']);
    expect(state.Completed).toBe(true);
  });

  it('leaves a run whose paging failed incomplete, so it does not prune', async () => {
    pages.push([{ ID: 'r1' }, { ID: 'r2' }], new Error('database went away'));
    const state = await new TestableSyncer().page(2);
    expect(state.SeenRecordIDs.size).toBe(2);
    expect(state.Completed).toBe(false);
  });
});

describe('PruneOrphanedRecordDocuments', () => {
  beforeEach(() => { runView.mockReset(); });

  it('reads the whole document past the cache and removes rows for records the run did not see', async () => {
    runView.mockResolvedValue({
      Success: true,
      Results: [
        { ID: 'a', RecordID: 'r1', VectorID: 'v1', __mj_UpdatedAt: new Date() },
        { ID: 'b', RecordID: 'gone', VectorID: 'v2', __mj_UpdatedAt: new Date() },
      ],
    });
    const deleted: string[] = [];
    const syncer = new TestableSyncer();
    syncer.Provider = {
      GetEntityObject: async () => {
        let id = '';
        return { Load: async (k: string) => { id = k; return true; }, Delete: async () => { deleted.push(id); return true; } };
      },
    } as unknown as IMetadataProvider;
    const vectorDB = { IsReadOnly: false, DeleteRecords: vi.fn(async () => ({ success: true, message: '', data: null })) };

    const pruned = await syncer.Prune(new Set(['r1']), { VectorDB: vectorDB as unknown as RecordDocumentVectorTarget['VectorDB'] });

    const params = runView.mock.calls[0][0] as RunViewParams;
    expect(params.IgnoreMaxRows).toBe(true);
    expect(params.BypassCache).toBe(true);
    expect(params.ExtraFilter).toBe("EntityDocumentID='D1'");
    expect(pruned).toBe(1);
    expect(deleted).toEqual(['b']);
    expect(vectorDB.DeleteRecords.mock.calls[0][0]).toEqual([{ id: 'v2', values: [] }]);
  });

  it('removes nothing and does not throw when the read fails', async () => {
    runView.mockResolvedValue({ Success: false, ErrorMessage: 'boom', Results: [] });
    await expect(new TestableSyncer().Prune(new Set(), { VectorDB: null })).resolves.toBe(0);
  });
});

describe('UpsertEntityRecordDocumentBatch with duplicate rows for one record', () => {
  it('keeps the newest row for the save and removes the others', async () => {
    const older = { ID: 'old', RecordID: 'r1', VectorID: 'v1', __mj_UpdatedAt: new Date('2026-01-01') };
    const newer = { ID: 'new', RecordID: 'r1', VectorID: 'v1', __mj_UpdatedAt: new Date('2026-02-01') };
    runViews.mockResolvedValueOnce([{ Success: true, Results: [older, newer] }]);
    const deleted: string[] = [];
    const syncer = new TestableSyncer();
    const md = {
      Entities: [{ Name: 'MJ: Entity Record Documents', GetUserPermisions: () => ({ CanDelete: true }) }],
      GetEntityObject: async () => {
        let id = '';
        return { Load: async (k: string) => { id = k; return true; }, Delete: async () => { deleted.push(id); return true; } };
      },
    };
    (syncer as unknown as { TestMetadata: unknown }).TestMetadata = md;
    const save = vi.fn(async () => undefined);
    (syncer as unknown as { saveEntityRecordDocument: typeof save }).saveEntityRecordDocument = save;

    await syncer.Upsert([{ __mj_recordID: 'r1', EntityDocument: { EntityID: 'E1', ID: 'D1' } } as unknown as EmbeddingData]);

    expect(deleted).toEqual(['old']);
    expect((save.mock.calls[0] as unknown[])[1]).toBe(newer);
  });

  it('keeps the duplicates when the user cannot delete Entity Record Documents', async () => {
    const older = { ID: 'old', RecordID: 'r1', VectorID: 'v1', __mj_UpdatedAt: new Date('2026-01-01') };
    const newer = { ID: 'new', RecordID: 'r1', VectorID: 'v2', __mj_UpdatedAt: new Date('2026-02-01') };
    runViews.mockResolvedValueOnce([{ Success: true, Results: [older, newer] }]);
    const deleted: string[] = [];
    const syncer = new TestableSyncer();
    const md = {
      Entities: [{ Name: 'MJ: Entity Record Documents', GetUserPermisions: () => ({ CanDelete: false }) }],
      GetEntityObject: async () => ({ Load: async () => true, Delete: async () => { deleted.push('x'); return true; } }),
    };
    (syncer as unknown as { TestMetadata: unknown }).TestMetadata = md;
    const save = vi.fn(async () => undefined);
    (syncer as unknown as { saveEntityRecordDocument: typeof save }).saveEntityRecordDocument = save;

    await syncer.Upsert([{ __mj_recordID: 'r1', EntityDocument: { EntityID: 'E1', ID: 'D1' } } as unknown as EmbeddingData]);

    expect(deleted).toEqual([]);
    expect((save.mock.calls[0] as unknown[])[1]).toBe(newer);
  });
});

describe('one run per entity document per process', () => {
  it('a second run of the same document waits for the first', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const syncer = new TestableSyncer();
    let calls = 0;
    (syncer as unknown as { vectorizeEntityRun: () => Promise<VectorizeEntityResponse> }).vectorizeEntityRun = async () => {
      const n = ++calls;
      order.push(`start ${n}`);
      if (n === 1) await new Promise<void>((resolve) => { releaseFirst = resolve; });
      order.push(`end ${n}`);
      return { success: true, status: 'Complete', errorMessage: '' };
    };

    const first = syncer.VectorizeEntity({ entityID: 'E1', entityDocumentID: 'DOC-X' }, USER);
    const second = syncer.VectorizeEntity({ entityID: 'E1', entityDocumentID: 'doc-x' }, USER);
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(['start 1']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2']);
  });

  it('runs of different documents do not wait for each other', async () => {
    const syncer = new TestableSyncer();
    let running = 0;
    let maxRunning = 0;
    (syncer as unknown as { vectorizeEntityRun: () => Promise<VectorizeEntityResponse> }).vectorizeEntityRun = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { success: true, status: 'Complete', errorMessage: '' };
    };
    await Promise.all([
      syncer.VectorizeEntity({ entityID: 'E1', entityDocumentID: 'A' }, USER),
      syncer.VectorizeEntity({ entityID: 'E1', entityDocumentID: 'B' }, USER),
    ]);
    expect(maxRunning).toBe(2);
  });
});
