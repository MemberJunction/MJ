import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { EmbeddingData } from '../generic/vectorSync.types';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks — same shape as entityVectorSyncRecordID.test.ts     */
/* ------------------------------------------------------------------ */

const h = vi.hoisted(() => ({
  getVectorIndexByID: vi.fn(),
}));

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
  VectorBase: class { CurrentUser: unknown; },
}));
vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: { Instance: { Config: vi.fn(), GetVectorIndexByID: h.getVectorIndexByID } },
}));
vi.mock('@memberjunction/templates', () => ({
  TemplateEngineServer: { Instance: { Config: vi.fn(), Templates: [], SetupNunjucks: vi.fn() } },
}));
vi.mock('@memberjunction/templates-base-types', () => ({}));

import { Base64ToFloat32Vector } from '@memberjunction/global';
import { EntityVectorSyncer } from '../models/entityVectorSync';

/** The Entity Record Document fields saveEntityRecordDocument writes, plus what Save saw. */
class FakeErd {
  EntityID: string | null = null;
  RecordID: string | null = null;
  DocumentText: string | null = null;
  VectorID: string | null = null;
  VectorJSON: string | null = null;
  VectorBinary: string | null = null;
  VectorIndexID: string | null = null;
  EntityRecordUpdatedAt: Date | null = null;
  EntityDocumentID: string | null = null;
  ContextCurrentUser: UserInfo | null = null;
  LatestResult = null;
  savedSnapshot: { VectorJSON: string | null; VectorBinary: string | null } | null = null;
  NewRecord(): void {}
  async Save(): Promise<boolean> {
    this.savedSnapshot = { VectorJSON: this.VectorJSON, VectorBinary: this.VectorBinary };
    return true;
  }
}

type SaveErdFn = (data: EmbeddingData, existing: FakeErd | undefined, md: IMetadataProvider, user: UserInfo) => Promise<void>;

class TestableSyncer extends EntityVectorSyncer {
  public saveErd(data: EmbeddingData, existing: FakeErd | undefined, md: IMetadataProvider, user: UserInfo): Promise<void> {
    const fn = (this as unknown as { saveEntityRecordDocument: SaveErdFn }).saveEntityRecordDocument;
    return fn.call(this, data, existing, md, user);
  }
}

function embeddingData(vector: number[]): EmbeddingData {
  return {
    ID: 1,
    Vector: vector,
    VectorID: 'vec-1',
    EntityData: {},
    __mj_recordID: 'rec-1',
    EntityDocument: { ID: 'doc-1', EntityID: 'ent-1' },
    TemplateContent: 'rendered text',
    VectorIndexID: 'vi-1',
  };
}

describe('EntityVectorSyncer.saveEntityRecordDocument persists both vector columns', () => {
  const syncer = new TestableSyncer();
  const user = {} as UserInfo;

  beforeEach(() => {
    h.getVectorIndexByID.mockReset();
    h.getVectorIndexByID.mockReturnValue({ ID: 'vi-1' });
  });

  it('writes VectorJSON and VectorBinary that decode to the same vector (existing ERD)', async () => {
    const erd = new FakeErd();
    const vector = [0.1, -0.25, 3.5, 0.2];

    await syncer.saveErd(embeddingData(vector), erd, {} as IMetadataProvider, user);

    expect(erd.savedSnapshot).not.toBeNull();
    const json = JSON.parse(erd.savedSnapshot?.VectorJSON ?? 'null') as number[];
    expect(json).toEqual(vector);

    const binary = erd.savedSnapshot?.VectorBinary ?? null;
    expect(typeof binary).toBe('string');
    const bytes = Buffer.from(binary ?? '', 'base64');
    expect(bytes.length).toBe(vector.length * 4);
    const fromBytes = Array.from({ length: vector.length }, (_, i) => bytes.readFloatLE(i * 4));
    const viaHelper = Array.from(Base64ToFloat32Vector(binary) ?? []);

    for (const decoded of [fromBytes, viaHelper]) {
      expect(decoded).toHaveLength(json.length);
      decoded.forEach((v, i) => expect(v).toBeCloseTo(json[i], 6));
    }
    expect(erd.RecordID).toBe('rec-1');
    expect(erd.VectorIndexID).toBe('vi-1');
  });

  it('writes both columns on a newly created ERD too', async () => {
    const created = new FakeErd();
    const md = { GetEntityObject: vi.fn().mockResolvedValue(created) } as unknown as IMetadataProvider;

    await syncer.saveErd(embeddingData([0.5, -1.5]), undefined, md, user);

    expect(created.savedSnapshot?.VectorJSON).toBe(JSON.stringify([0.5, -1.5]));
    expect(Array.from(Base64ToFloat32Vector(created.savedSnapshot?.VectorBinary) ?? [])).toEqual([0.5, -1.5]);
  });

  it('writes nothing when the vector index is not in the AIEngine cache', async () => {
    h.getVectorIndexByID.mockReturnValue(undefined);
    const erd = new FakeErd();

    await syncer.saveErd(embeddingData([0.5]), erd, {} as IMetadataProvider, user);

    expect(erd.savedSnapshot).toBeNull();
    expect(erd.VectorBinary).toBeNull();
  });
});
