import { describe, it, expect, vi } from 'vitest';
import { LogError, UserInfo, type RunViewParams } from '@memberjunction/core';
import type { MJEntityRecordDocumentEntity } from '@memberjunction/core-entities';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks — same shape as entityDocumentConfig.test.ts         */
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
    Metadata: class { Entities = []; },
    RunView: class {},
    ValidationResult: class { Errors: unknown[] = []; get Success() { return this.Errors.length === 0; } },
  };
});

vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/ai', () => ({}));
// Stubbed for the same reason the sibling suites stub it: the real module reaches
// @memberjunction/ai-core-plus, which imports a NAMED export from @memberjunction/core-entities —
// stubbed empty just above — so loading it fails collection before a single test runs.
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
const runViews = vi.fn(async (params: unknown[]): Promise<{ Success: boolean; Results: Record<string, unknown>[]; ErrorMessage?: string }[]> =>
  params.map(() => ({ Success: true, Results: [] })));
vi.mock('@memberjunction/ai-vectors', () => ({
  VectorBase: class {
    CurrentUser: unknown;
    get RunView() { return { RunViews: runViews }; }
    get Metadata() { return {}; }
  },
}));
vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: { Instance: { Config: vi.fn() } },
}));
vi.mock('@memberjunction/templates', () => ({
  TemplateEngineServer: { Instance: { Config: vi.fn(), Templates: [], SetupNunjucks: vi.fn() } },
}));
vi.mock('@memberjunction/templates-base-types', () => ({}));

import { EntityVectorSyncer } from '../models/entityVectorSync';
import type { EmbeddingData } from '../generic/vectorSync.types';

/**
 * The existence read before saving Entity Record Documents bypasses the cache.
 *
 * It is a find-or-create read, so a cached answer could miss a document that already exists and
 * create a duplicate. Its `RecordID IN (…)` filter is also different for every batch, so each batch
 * wrote a cache entry that its own saves dropped a moment later: write-only cache traffic.
 *
 * Every row a record already has is refreshed, matched without regard to the id's case: a row left
 * alone keeps serving its old text and vector, and a missed match creates another duplicate. A batch
 * whose read failed is not written at all: treating "unknown" as "none exist" created a duplicate of
 * every document in the batch.
 */
class BatchSyncer extends EntityVectorSyncer {
  /** The existing document each per-document save was handed (undefined: a new document). */
  public readonly SavedOver: (MJEntityRecordDocumentEntity | undefined)[] = [];

  /** The errors the upserts reported. */
  public readonly Errors = EntityVectorSyncer.NewRunErrors();

  public Upsert(batch: EmbeddingData[]): Promise<void> {
    return this.UpsertEntityRecordDocumentBatch(batch, new UserInfo(), this.Errors);
  }

  protected override async SaveEntityRecordDocument(_item: EmbeddingData, existing: MJEntityRecordDocumentEntity | undefined): Promise<void> {
    this.SavedOver.push(existing);
  }
}

const item = (id: string): EmbeddingData => ({ ID: 0, Vector: [], EntityData: {}, __mj_recordID: id, EntityDocument: { EntityID: 'E1', ID: 'D1' } });

describe('UpsertEntityRecordDocumentBatch', () => {
  it('reads existing documents from the database, not the cache', async () => {
    const syncer = new BatchSyncer();

    await syncer.Upsert([item('r1'), item('r2')]);

    expect(runViews).toHaveBeenCalledOnce();
    const params = runViews.mock.calls[0][0] as RunViewParams[];
    expect(params).toHaveLength(1);
    expect(params[0].EntityName).toBe('MJ: Entity Record Documents');
    expect(params[0].BypassCache).toBe(true);
    expect(syncer.SavedOver).toHaveLength(2);
  });

  it('refreshes every document a record already has, and creates none for it', async () => {
    const syncer = new BatchSyncer();
    const original = { ID: 'erd-1', RecordID: 'A1B2C3D4-0000-4000-8000-000000000001' };
    const duplicate = { ID: 'erd-2', RecordID: 'A1B2C3D4-0000-4000-8000-000000000001' };
    runViews.mockResolvedValueOnce([{ Success: true, Results: [original, duplicate] }]);
    const record = item('A1B2C3D4-0000-4000-8000-000000000001');

    await syncer.Upsert([record]);

    expect(syncer.SavedOver).toEqual([original, duplicate]);
  });

  it('matches a stored record id that differs only in case, rather than creating a duplicate', async () => {
    const syncer = new BatchSyncer();
    const stored = { ID: 'erd-1', RecordID: 'a1b2c3d4-0000-4000-8000-000000000001' };
    runViews.mockResolvedValueOnce([{ Success: true, Results: [stored] }]);

    await syncer.Upsert([item('A1B2C3D4-0000-4000-8000-000000000001')]);

    expect(syncer.SavedOver).toEqual([stored]);
  });

  it('creates the document of a record that has none', async () => {
    const syncer = new BatchSyncer();
    runViews.mockResolvedValueOnce([{ Success: true, Results: [] }]);

    await syncer.Upsert([item('r9')]);

    expect(syncer.SavedOver).toEqual([undefined]);
  });

  it('writes nothing for a batch whose existence read failed, and reports it', async () => {
    const syncer = new BatchSyncer();
    runViews.mockResolvedValueOnce([{ Success: false, Results: [], ErrorMessage: 'Connection lost' }]);

    await syncer.Upsert([item('A1B2C3D4-0000-4000-8000-000000000001'), item('A1B2C3D4-0000-4000-8000-000000000002')]);

    expect(syncer.SavedOver).toEqual([]);
    expect(syncer.Errors.Upsert.map((e) => e.RecordID)).toEqual(['A1B2C3D4-0000-4000-8000-000000000001', 'A1B2C3D4-0000-4000-8000-000000000002']);
    expect(syncer.Errors.Upsert[0].Message).toContain('Connection lost');
    expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining('Connection lost'));
  });
});
