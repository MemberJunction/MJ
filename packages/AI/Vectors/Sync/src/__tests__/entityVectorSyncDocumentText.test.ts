/**
 * `renderAndEmbedBatch` must carry each record's RENDERED text on `EmbeddingData.TemplateContent`.
 *
 * That field becomes `EntityRecordDocument.DocumentText`, the audit trail for "what text actually got
 * embedded for record X". The bug this pins: the batch carried the raw Nunjucks template instead, so
 * every row held the same `Name: {{ (org_name or '') | lower | trim }}` boilerplate (7,095 identical
 * rows for one entity on a production tenant) and the question could not be asked at all.
 *
 * Two records with different field values must therefore produce different `TemplateContent`, and
 * each must equal the text handed to the embedding model for that record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
vi.mock('@memberjunction/ai-vectors', () => ({
  VectorBase: class { CurrentUser: unknown; },
}));
vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: { Instance: { Config: vi.fn() } },
}));

/** Renders "Name: <org_name>" from the record, standing in for Nunjucks. */
const renderTemplateMock = vi.fn(async (_template: unknown, _content: unknown, data: Record<string, unknown>) => ({
  Success: true,
  Output: `Name: ${String(data['org_name'] ?? '').toLowerCase().trim()}`,
  Message: '',
}));
vi.mock('@memberjunction/templates', () => ({
  TemplateEngineServer: {
    Instance: {
      Config: vi.fn(),
      Templates: [],
      SetupNunjucks: vi.fn(),
      RenderTemplate: (...args: [unknown, unknown, Record<string, unknown>, boolean, boolean]) => renderTemplateMock(...args),
    },
  },
}));
vi.mock('@memberjunction/templates-base-types', () => ({}));
// Only referenced by the vectorization entry points, never by renderAndEmbedBatch.
vi.mock('@memberjunction/entity-documents', () => ({
  EntityDocumentCache: class { static get Instance() { return {}; } },
}));

import { EntityVectorSyncer } from '../models/entityVectorSync';
import type { EmbeddingData } from '../generic/vectorSync.types';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const RAW_TEMPLATE = "Name: {{ (org_name or '') | lower | trim }}";
const templateContent = { TemplateText: RAW_TEMPLATE };
const template = { ID: 'T1' };

/** Embedding double: records every text it is asked to embed and returns one vector per text. */
const embedTextsMock = vi.fn(async ({ texts }: { texts: string[] }) => ({
  vectors: texts.map((text, i) => [i, text.length]),
}));
const embedding = { EmbedTexts: (params: { texts: string[] }) => embedTextsMock(params) };

const batch: Record<string, unknown>[] = [
  { __mj_recordID: 'R1', __mj_compositeKey: 'ID|R1', org_name: 'Acme Corp', VectorID: '', VectorIndexID: 'VI1' },
  { __mj_recordID: 'R2', __mj_compositeKey: 'ID|R2', org_name: 'Globex', VectorID: '', VectorIndexID: 'VI1' },
];

class TestableSyncer extends EntityVectorSyncer {
  public testRenderAndEmbedBatch(rows: Record<string, unknown>[]): Promise<EmbeddingData[]> {
    return (this as unknown as Record<string, CallableFunction>)['renderAndEmbedBatch'](
      rows, template, templateContent, embedding, 'text-embedding-3-small', 0
    ) as Promise<EmbeddingData[]>;
  }
}

describe('renderAndEmbedBatch → EmbeddingData.TemplateContent (DocumentText)', () => {
  let result: EmbeddingData[];

  beforeEach(async () => {
    renderTemplateMock.mockClear();
    embedTextsMock.mockClear();
    result = await new TestableSyncer().testRenderAndEmbedBatch(batch);
  });

  it('carries a different rendered text for two records with different field values', () => {
    expect(result).toHaveLength(2);
    expect(result[0].TemplateContent).toBe('Name: acme corp');
    expect(result[1].TemplateContent).toBe('Name: globex');
    expect(result[0].TemplateContent).not.toBe(result[1].TemplateContent);
  });

  it('never carries the raw template', () => {
    for (const row of result) {
      expect(row.TemplateContent).not.toBe(RAW_TEMPLATE);
      expect(row.TemplateContent).not.toContain('{{');
    }
  });

  it('carries exactly the text that was embedded for that record', () => {
    expect(embedTextsMock).toHaveBeenCalledTimes(1);
    const embedded = embedTextsMock.mock.calls[0][0].texts;
    expect(result.map(r => r.TemplateContent)).toEqual(embedded);
    expect(result.map(r => r.__mj_recordID)).toEqual(['R1', 'R2']);
  });
});
