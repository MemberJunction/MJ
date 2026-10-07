import { describe, it, expect, vi } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks — same shape as entityVectorSyncRecordID.test.ts    */
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
  AIEngine: { Instance: { Config: vi.fn() } },
}));
vi.mock('@memberjunction/templates', () => ({
  TemplateEngineServer: { Instance: { Config: vi.fn(), Templates: [], SetupNunjucks: vi.fn() } },
}));
vi.mock('@memberjunction/templates-base-types', () => ({}));

import type { IMetadataProvider } from '@memberjunction/core';
import type { MJEntityDocumentEntity } from '@memberjunction/core-entities';
import { EntityVectorSyncer } from '../models/entityVectorSync';
import { GetEntityDocumentRecordFilter, ParseEntityDocumentConfiguration } from '../generic/entityDocumentConfig';
import type { VectorizeEntityParams } from '../generic/vectorSync.types';

/**
 * The entity document's record filter, `Configuration.recordFilter.extraFilter`. It was declared and
 * documented (its example is `IsDeleted = 0`) but nothing read it, so a document configured to skip
 * deleted records vectorized them anyway. Sync now ANDs it into the filter on every page it reads,
 * and duplicate detection reads it through the same GetEntityDocumentRecordFilter.
 */

const INDIVIDUALS = { Name: 'Individuals', FirstPrimaryKey: { Name: 'individual_id' } } as unknown as EntityInfo;
const MD = { ConfigData: { MJCoreSchemaName: '__mj' } } as unknown as IMetadataProvider;
const NOT_DELETED = "ind_delete_flag <> '1'";

function doc(configuration: string | null): MJEntityDocumentEntity {
  return { Name: 'Individuals Duplicate', Configuration: configuration } as unknown as MJEntityDocumentEntity;
}

class TestableSyncer extends EntityVectorSyncer {
  public pageFilter(params: Partial<VectorizeEntityParams>, entityDocument: MJEntityDocumentEntity): string | undefined {
    return this.BuildRecordPageFilter(INDIVIDUALS, params as VectorizeEntityParams, entityDocument, MD);
  }
  protected override BuildListFilter(_entity: EntityInfo, _schema: string, listId: string): string {
    return `<members of ${listId}>`;
  }
}

describe('Entity document record filter', () => {
  describe('GetEntityDocumentRecordFilter', () => {
    it('reads recordFilter.extraFilter, trimmed', () => {
      expect(GetEntityDocumentRecordFilter(doc(JSON.stringify({ recordFilter: { extraFilter: `  ${NOT_DELETED} ` } })))).toBe(NOT_DELETED);
    });

    it('is null when there is no configuration, no recordFilter, a blank filter, or invalid JSON', () => {
      expect(GetEntityDocumentRecordFilter(doc(null))).toBeNull();
      expect(GetEntityDocumentRecordFilter(doc(JSON.stringify({ recordFilter: { maxRecords: 10 } })))).toBeNull();
      expect(GetEntityDocumentRecordFilter(doc(JSON.stringify({ recordFilter: { extraFilter: '   ' } })))).toBeNull();
      expect(GetEntityDocumentRecordFilter(doc('{not json'))).toBeNull();
    });

    it('parses the rest of the configuration as before', () => {
      expect(ParseEntityDocumentConfiguration(doc(JSON.stringify({ vectorIdStrategy: 'recordId' })))).toEqual({ vectorIdStrategy: 'recordId' });
      expect(ParseEntityDocumentConfiguration(doc(null))).toEqual({});
    });
  });

  describe('BuildRecordPageFilter', () => {
    const syncer = new TestableSyncer();
    const filtered = doc(JSON.stringify({ recordFilter: { extraFilter: NOT_DELETED } }));

    it('is the record filter alone for a whole-entity run', () => {
      expect(syncer.pageFilter({}, filtered)).toBe(NOT_DELETED);
    });

    it('ANDs the record filter with a list run\'s membership filter', () => {
      expect(syncer.pageFilter({ listID: 'list-1' }, filtered)).toBe(`(<members of list-1>) AND (${NOT_DELETED})`);
    });

    it('is unchanged without a record filter: the list filter alone, or nothing', () => {
      expect(syncer.pageFilter({ listID: 'list-1' }, doc(null))).toBe('<members of list-1>');
      expect(syncer.pageFilter({}, doc(null))).toBeUndefined();
    });
  });
});
