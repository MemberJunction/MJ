/**
 * The vector-sync embedding call must pin the entity document's model (ModelID) and the index's
 * Dimensions. ModelID is the only thing keeping a vector index single-model: unpinned, the runner may
 * answer from any Embeddings model, whose vectors are not comparable with the ones already stored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { AIEmbeddingRunner } from '@memberjunction/ai-prompts';
import type { EmbeddingRunParams, EmbeddingRunResult } from '@memberjunction/ai-prompts';

const h = vi.hoisted(() => {
  const runEmbedding = vi.fn(async (params: EmbeddingRunParams): Promise<EmbeddingRunResult> => ({
    Success: true,
    Vectors: params.Texts.map(() => [0.1, 0.2]),
    PromptRunID: null,
    TokensUsed: 0,
    Cost: 0,
    ErrorMessage: null,
    ExecutionTimeMs: 0,
  }));
  return { runEmbedding };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    RegisterClass: () => () => undefined,
    MJGlobal: { Instance: { ClassFactory: { GetRegistration: vi.fn() } } },
  };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: class { Entities = []; },
    RunView: class {},
  };
});

vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/ai', () => ({}));
vi.mock('@memberjunction/ai-prompts', () => ({
  AIEmbeddingRunner: class {
    RunEmbedding = h.runEmbedding;
  },
}));
vi.mock('@memberjunction/ai-vectordb', () => ({
  VectorDBBase: class {},
}));
vi.mock('@memberjunction/ai-vectors', () => ({
  VectorBase: class {
    private user: UserInfo | undefined;
    public get CurrentUser(): UserInfo | undefined { return this.user; }
    public set CurrentUser(value: UserInfo | undefined) { this.user = value; }
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

/** Reaches the protected embedding step the render-and-embed batch transform calls. */
class TestableSyncer extends EntityVectorSyncer {
  public EmbedBatch(texts: string[], runner: AIEmbeddingRunner, aiModelID: string, dimensions?: number): Promise<EmbeddingRunResult> {
    return this.EmbedRenderedTexts(texts, runner, aiModelID, dimensions, 'People template');
  }
}

describe('EntityVectorSyncer embedding call', () => {
  const user = new UserInfo(undefined, { ID: 'user-1', Name: 'Test User' });
  let syncer: TestableSyncer;

  beforeEach(() => {
    h.runEmbedding.mockClear();
    syncer = new TestableSyncer();
    syncer.CurrentUser = user;
  });

  it('pins the entity document\'s model and forwards the index Dimensions', async () => {
    const result = await syncer.EmbedBatch(['Ada Lovelace', 'Alan Turing'], new AIEmbeddingRunner(), 'model-doc-1', 256);

    expect(result.Success).toBe(true);
    expect(h.runEmbedding).toHaveBeenCalledTimes(1);
    expect(h.runEmbedding).toHaveBeenCalledWith(expect.objectContaining({
      Texts: ['Ada Lovelace', 'Alan Turing'],
      ModelID: 'model-doc-1',
      Dimensions: 256,
      ContextUser: user,
    }));
  });

  it('leaves Dimensions undefined when the index sets none, and still pins the model', async () => {
    await syncer.EmbedBatch(['Grace Hopper'], new AIEmbeddingRunner(), 'model-doc-2');

    const params = h.runEmbedding.mock.calls[0]?.[0];
    expect(params?.ModelID).toBe('model-doc-2');
    expect(params?.Dimensions).toBeUndefined();
  });
});
