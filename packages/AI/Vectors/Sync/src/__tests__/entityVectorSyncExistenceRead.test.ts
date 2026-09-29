import { describe, it, expect, vi } from 'vitest';
import type { RunViewParams, UserInfo } from '@memberjunction/core';

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
vi.mock('@memberjunction/ai-vectordb', () => ({
  VectorDBBase: class { constructor(_k: string) {} },
}));
const runViews = vi.fn(async (params: unknown[]) => params.map(() => ({ Success: true, Results: [] })));
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
 * The existence read before saving Entity Record Documents bypasses the cache (plan F13).
 *
 * It is a find-or-create read, so a cached answer could miss a document that already exists and
 * create a duplicate. Its `RecordID IN (…)` filter is also different for every batch, so each batch
 * wrote a cache entry that its own saves dropped a moment later: write-only cache traffic.
 */
class BatchSyncer extends EntityVectorSyncer {
  public Upsert(batch: EmbeddingData[]): Promise<void> {
    return this.UpsertEntityRecordDocumentBatch(batch, {} as UserInfo);
  }
}

describe('UpsertEntityRecordDocumentBatch', () => {
  it('reads existing documents from the database, not the cache', async () => {
    const syncer = new BatchSyncer();
    const save = vi.fn(async () => undefined);
    (syncer as unknown as { saveEntityRecordDocument: typeof save }).saveEntityRecordDocument = save;
    const item = (id: string) => ({ __mj_recordID: id, EntityDocument: { EntityID: 'E1', ID: 'D1' } }) as unknown as EmbeddingData;

    await syncer.Upsert([item('r1'), item('r2')]);

    expect(runViews).toHaveBeenCalledOnce();
    const params = runViews.mock.calls[0][0] as RunViewParams[];
    expect(params).toHaveLength(1);
    expect(params[0].EntityName).toBe('MJ: Entity Record Documents');
    expect(params[0].BypassCache).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
