/**
 * Unit tests for the two guards that stand between an embedding and an index it does not fit.
 *
 * The `dimensions` value threaded into `EmbedTexts` is a **request hint, not a contract**: only
 * some providers honour it, a local ONNX model is free to ignore it, and nothing downstream ever
 * compared what came back against what the index accepts. Both failure modes are silent in
 * different ways — a provider that enforces width rejects the upsert one API round trip at a time,
 * and a provider that does not enforce it accepts vectors of two widths into one index, which makes
 * similarity search quietly meaningless. The Pinecone driver already knew this failure by name, in
 * a comment, after the fact.
 *
 * Compounding it, the index's own `Dimensions` column is null on most existing rows: the Knowledge
 * Hub create-index form never set it, and the server-side write-back was fire-and-forget. So the
 * refusal cannot simply reject null — it asks the provider first and repairs the row.
 *
 * And the model that decides the width used to be chosen by `EntityDocument.AIModelID`, a nullable
 * column that fell through to an arbitrary pick. The index's `EmbeddingModelID` is NOT NULL and the
 * index's accepted width is fixed at creation, so the index is the only party whose opinion can be
 * right.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { EmbedTextsResult } from '@memberjunction/ai';
import type { MJEntityDocumentEntity, MJVectorIndexEntity } from '@memberjunction/core-entities';
import type { IndexList, VectorDBBase } from '@memberjunction/ai-vectordb';

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

const logErrorMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    LogError: (...args: unknown[]) => logErrorMock(...args),
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

/** Controllable stand-ins for the two VectorBase members these guards lean on. */
const getAIModelMock = vi.fn();
const saveEntityMock = vi.fn(async (_entity: unknown) => true);
vi.mock('@memberjunction/ai-vectors', () => ({
  VectorBase: class {
    CurrentUser: unknown;
    protected GetAIModel(id?: string) { return getAIModelMock(id); }
    protected async SaveEntity(entity: unknown) { return saveEntityMock(entity); }
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

class TestableSyncer extends EntityVectorSyncer {
  public resolveDims(index: MJVectorIndexEntity, db: VectorDBBase): Promise<number | null> {
    return this.ResolveIndexDimensions(index, db);
  }
  public assertWidth(e: EmbedTextsResult, expected: number | undefined, model: string, indexName?: string): void {
    this.AssertVectorWidth(e, expected, model, indexName);
  }
  public resolveModel(doc: MJEntityDocumentEntity, index?: MJVectorIndexEntity) {
    return this.ResolveEmbeddingModel(doc, index);
  }
  public providerIndexName(index: MJVectorIndexEntity): string {
    return this.ResolveProviderIndexName(index);
  }
}

interface FakeIndexRow {
  ID: string;
  Name: string;
  Dimensions: number | null;
  Metric: string | null;
  ExternalID: string | null;
  EmbeddingModelID?: string | null;
  LatestResult?: { CompleteMessage?: string } | null;
}

function indexRow(over: Partial<FakeIndexRow> = {}): MJVectorIndexEntity {
  const row: FakeIndexRow = {
    ID: 'IDX-1111-2222-3333-444444444444',
    Name: 'Knowledge Index',
    Dimensions: null,
    Metric: null,
    ExternalID: null,
    LatestResult: null,
    ...over,
  };
  return row as unknown as MJVectorIndexEntity;
}

function driver(opts: { managesIndexes?: boolean; indexes?: IndexList | Error }): VectorDBBase {
  return {
    ManagesIndexes: opts.managesIndexes ?? true,
    ListIndexes: async () => {
      if (opts.indexes instanceof Error) throw opts.indexes;
      return opts.indexes ?? { indexes: [] };
    },
  } as unknown as VectorDBBase;
}

function embeddings(widths: number[], model = 'text-embedding-3-small'): EmbedTextsResult {
  return {
    object: 'list',
    model,
    ModelUsage: {} as EmbedTextsResult['ModelUsage'],
    vectors: widths.map(w => new Array<number>(w).fill(0.1)),
  };
}

describe('EntityVectorSyncer.ResolveIndexDimensions', () => {
  let syncer: TestableSyncer;
  beforeEach(() => {
    logErrorMock.mockReset();
    saveEntityMock.mockReset();
    saveEntityMock.mockResolvedValue(true);
    getAIModelMock.mockReset();
    syncer = new TestableSyncer();
  });

  it('uses the width declared on the index', async () => {
    await expect(syncer.resolveDims(indexRow({ Dimensions: 384 }), driver({}))).resolves.toBe(384);
  });

  it('declines to police a driver that owns no index object', async () => {
    // SimpleVectorServiceProvider's "index" is a logical pairing; the vectors live in a JSON
    // column with no fixed width. There is nothing to check and nothing to refuse — and MJ ships
    // exactly such a Vector Index row by default, with Dimensions null.
    const result = await syncer.resolveDims(indexRow({ Dimensions: null }), driver({ managesIndexes: false }));
    expect(result).toBeNull();
  });

  it('refuses an index whose width nobody can state, naming the index and what to set', async () => {
    const row = indexRow({ Dimensions: null });
    await expect(syncer.resolveDims(row, driver({ indexes: { indexes: [] } })))
      .rejects.toThrow(/Knowledge Index/);
    await expect(syncer.resolveDims(row, driver({ indexes: { indexes: [] } })))
      .rejects.toThrow(/Set Dimensions on the Vector Index record/);
  });

  it('backfills the width from the provider rather than stranding the row', async () => {
    const row = indexRow({ Dimensions: null, Name: 'Knowledge Index' });
    const db = driver({ indexes: { indexes: [{ name: 'knowledge index', dimension: 768, metric: 'dotproduct', host: 'h' }] } });

    await expect(syncer.resolveDims(row, db)).resolves.toBe(768);

    expect(row.Dimensions).toBe(768);
    expect(row.Metric).toBe('dotproduct');
    expect(row.ExternalID).toBe('knowledge index');
    expect(saveEntityMock).toHaveBeenCalledWith(row);
  });

  it('matches on ExternalID, which is the only name a sanitized index answers to', async () => {
    const row = indexRow({ Dimensions: null, Name: 'My Index!!', ExternalID: 'my-index' });
    const db = driver({ indexes: { indexes: [{ name: 'my-index', dimension: 1536, metric: 'cosine', host: 'h' }] } });
    await expect(syncer.resolveDims(row, db)).resolves.toBe(1536);
  });

  it('treats a provider that reports dimension 0 as not knowing, not as a zero-width index', async () => {
    // Qdrant's list endpoint does exactly this.
    const db = driver({ indexes: { indexes: [{ name: 'knowledge index', dimension: 0, metric: 'cosine', host: 'h' }] } });
    await expect(syncer.resolveDims(indexRow({ Dimensions: null }), db)).rejects.toThrow(/no Dimensions recorded/);
  });

  it('refuses rather than crashing when the provider cannot be listed', async () => {
    const db = driver({ indexes: new Error('401 unauthorized') });
    await expect(syncer.resolveDims(indexRow({ Dimensions: null }), db)).rejects.toThrow(/no Dimensions recorded/);
    expect(logErrorMock.mock.calls.flat().join(' ')).toContain('401 unauthorized');
  });

  it('still returns the width when the repair could not be persisted', async () => {
    saveEntityMock.mockResolvedValue(false);
    const db = driver({ indexes: { indexes: [{ name: 'knowledge index', dimension: 512, metric: 'cosine', host: 'h' }] } });
    await expect(syncer.resolveDims(indexRow({ Dimensions: null }), db)).resolves.toBe(512);
  });
});

describe('EntityVectorSyncer.AssertVectorWidth', () => {
  let syncer: TestableSyncer;
  beforeEach(() => { syncer = new TestableSyncer(); });

  it('refuses a 768-dimension embedding against a 1536-dimension index, with both numbers', () => {
    let message = '';
    try {
      syncer.assertWidth(embeddings([768, 768]), 1536, 'all-mpnet-base-v2', 'Knowledge Index');
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain('768');
    expect(message).toContain('1536');
    expect(message).toContain('Knowledge Index');
    expect(message).toContain('Nothing was upserted');
  });

  it('names the model the provider actually used', () => {
    expect(() => syncer.assertWidth(embeddings([768], 'gte-small'), 1536, 'requested-name', 'IDX'))
      .toThrow(/gte-small/);
  });

  it('catches one odd vector in an otherwise correct batch', () => {
    expect(() => syncer.assertWidth(embeddings([1536, 1536, 1024]), 1536, 'm', 'IDX')).toThrow(/1024/);
  });

  it('passes a batch that matches', () => {
    expect(() => syncer.assertWidth(embeddings([1536, 1536]), 1536, 'm', 'IDX')).not.toThrow();
  });

  it('does not police an index that declares no width', () => {
    expect(() => syncer.assertWidth(embeddings([768]), undefined, 'm', 'IDX')).not.toThrow();
    expect(() => syncer.assertWidth(embeddings([768]), 0, 'm', 'IDX')).not.toThrow();
  });
});

describe('EntityVectorSyncer.ResolveEmbeddingModel', () => {
  let syncer: TestableSyncer;
  const MODEL_A = 'AAAAAAAA-1111-2222-3333-444444444444';
  const MODEL_B = 'BBBBBBBB-1111-2222-3333-444444444444';

  beforeEach(() => {
    logErrorMock.mockReset();
    getAIModelMock.mockReset();
    getAIModelMock.mockImplementation((id?: string) => ({ ID: id ?? 'arbitrary', APIName: 'api', DriverClass: 'D' }));
    syncer = new TestableSyncer();
  });

  it('takes the model from the index, not from the Entity Document', () => {
    const doc = { Name: 'Contacts Search', AIModelID: MODEL_A } as unknown as MJEntityDocumentEntity;
    const index = indexRow({ EmbeddingModelID: MODEL_B, Name: 'Contacts Index' });

    expect(syncer.resolveModel(doc, index).ID).toBe(MODEL_B);
    // The disagreement is a real misconfiguration and is reported, but it does not fail the run.
    expect(logErrorMock.mock.calls.flat().join(' ')).toContain('Contacts Index');
  });

  it('says nothing when the document agrees with the index', () => {
    const doc = { Name: 'Contacts Search', AIModelID: MODEL_B } as unknown as MJEntityDocumentEntity;
    expect(syncer.resolveModel(doc, indexRow({ EmbeddingModelID: MODEL_B })).ID).toBe(MODEL_B);
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it('honours the index even when the document names no model at all', () => {
    // This is the case that used to reach the arbitrary `find()`.
    const doc = { Name: 'Contacts Search', AIModelID: null } as unknown as MJEntityDocumentEntity;
    expect(syncer.resolveModel(doc, indexRow({ EmbeddingModelID: MODEL_B })).ID).toBe(MODEL_B);
    expect(getAIModelMock).toHaveBeenCalledWith(MODEL_B);
  });

  it('falls back to the document when there is no index in hand', () => {
    const doc = { Name: 'Contacts Search', AIModelID: MODEL_A } as unknown as MJEntityDocumentEntity;
    expect(syncer.resolveModel(doc).ID).toBe(MODEL_A);
    expect(getAIModelMock).toHaveBeenCalledWith(MODEL_A);
  });
});

describe('EntityVectorSyncer.ResolveProviderIndexName', () => {
  let syncer: TestableSyncer;
  beforeEach(() => {
    syncer = new TestableSyncer();
  });

  it('addresses the index by ExternalID, which is the name the provider gave it', () => {
    // The upsert path used to pass Name. Where the provider sanitized the name at creation,
    // that addresses an index the provider does not have — and a create-on-write provider
    // makes one, so the vectors land in an index nothing ever searches.
    const index = indexRow({ Name: 'Contacts (Prod)', ExternalID: 'contacts-prod' });
    expect(syncer.providerIndexName(index)).toBe('contacts-prod');
  });

  it('falls back to Name for a row that predates the write-back', () => {
    expect(syncer.providerIndexName(indexRow({ Name: 'Knowledge Index', ExternalID: null }))).toBe('Knowledge Index');
  });

  it('treats a blank or whitespace ExternalID as absent rather than as an index name', () => {
    expect(syncer.providerIndexName(indexRow({ Name: 'Knowledge Index', ExternalID: '' }))).toBe('Knowledge Index');
    expect(syncer.providerIndexName(indexRow({ Name: 'Knowledge Index', ExternalID: '   ' }))).toBe('Knowledge Index');
  });

  it('trims a padded ExternalID instead of sending the padding to the provider', () => {
    expect(syncer.providerIndexName(indexRow({ ExternalID: '  contacts-prod  ' }))).toBe('contacts-prod');
  });
});

describe('the vectorize path actually uses the resolved provider index name', () => {
  // ResolveProviderIndexName being correct is worth nothing if the upsert call site goes back to
  // passing `vectorIndexEntity.Name`, and that revert is invisible to every behavioural test here:
  // `VectorizeEntity` needs a live provider, a template engine and a metadata provider to reach the
  // upsert. So this pins the wiring at the source level. It is narrow on purpose — it reads only
  // the argument list of the one call, not the whole file.
  const source = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'models', 'entityVectorSync.ts'),
    'utf8'
  );

  function argsOf(call: string): string {
    const start = source.indexOf(call);
    expect(start, `${call} not found — the call was renamed or removed`).toBeGreaterThan(-1);
    const open = source.indexOf('(', start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') {
        depth--;
        if (depth === 0) return source.slice(open + 1, i);
      }
    }
    throw new Error(`unbalanced parentheses after ${call}`);
  }

  it('passes the resolved name to the upserter, not the MJ display label', () => {
    const args = argsOf('this.createVectorUpserter');
    expect(args).toContain('providerIndexName');
    // The defect being pinned: the provider-side index addressed by its MJ display name.
    expect(args).not.toContain('vectorIndexEntity.Name');
  });

  it('resolves that name through ResolveProviderIndexName rather than inlining the fallback', () => {
    // Inlining would work today but drifts from the search lane and the autotag vectorizer, which
    // #4411 fixed the same way; one named decision keeps the three honest.
    expect(source).toContain('this.ResolveProviderIndexName(vectorIndexEntity)');
  });

  it('still reports the index to the operator by its MJ display name', () => {
    // The width-refusal message is read by a human, who knows the row by its label, not its
    // provider-side id — so the creator side must keep using Name. Guards against an
    // over-eager sweep replacing every occurrence.
    expect(argsOf('this.createVectorCreator')).toContain('vectorIndexEntity.Name');
  });
});
