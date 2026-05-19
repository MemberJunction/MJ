import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityDocumentConfiguration, EntityDocumentMetadataConfig } from '../generic/entityDocumentConfig.types';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */

vi.mock('@memberjunction/global', () => {
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
    RegisterClass: () => (_target: unknown) => {},
    MJGlobal: { Instance: { ClassFactory: { GetRegistration: vi.fn() } } },
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
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
vi.mock('@memberjunction/templates', () => ({
  TemplateEngineServer: { Instance: { Config: vi.fn(), Templates: [], SetupNunjucks: vi.fn() } },
}));
vi.mock('@memberjunction/templates-base-types', () => ({}));

import { EntityVectorSyncer } from '../models/entityVectorSync';

/* ------------------------------------------------------------------ */
/*  Helper: expose private methods for testing via subclass            */
/* ------------------------------------------------------------------ */
class TestableSyncer extends EntityVectorSyncer {
  /** Expose parseDocumentConfig for testing */
  public testParseConfig(doc: { Configuration: string | null }): EntityDocumentConfiguration {
    // Access private method via bracket notation
    return (this as unknown as Record<string, CallableFunction>)['parseDocumentConfig'](doc);
  }

  /** Expose getDisplayFields for testing */
  public testGetDisplayFields(
    entityInfo: { Fields: MockField[] } | undefined,
    metadataConfig?: EntityDocumentMetadataConfig
  ): MockField[] {
    return (this as unknown as Record<string, CallableFunction>)['getDisplayFields'](entityInfo, metadataConfig);
  }

  /** Expose getFieldTruncationLimit for testing */
  public testGetFieldTruncationLimit(
    field: MockField,
    metadataConfig?: EntityDocumentMetadataConfig
  ): number {
    return (this as unknown as Record<string, CallableFunction>)['getFieldTruncationLimit'](field, metadataConfig);
  }
}

type MockField = {
  Name: string;
  Type: string;
  IsPrimaryKey: boolean;
  MaxLength: number;
};

function makeField(overrides: Partial<MockField> & { Name: string }): MockField {
  return {
    Type: 'nvarchar',
    IsPrimaryKey: false,
    MaxLength: 100,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('EntityDocumentConfiguration', () => {
  let syncer: TestableSyncer;

  beforeEach(() => {
    vi.clearAllMocks();
    syncer = new TestableSyncer();
  });

  /* ---- parseDocumentConfig ---- */
  describe('parseDocumentConfig', () => {
    it('should return empty object for null Configuration', () => {
      const result = syncer.testParseConfig({ Configuration: null });
      expect(result).toEqual({});
    });

    it('should return empty object for empty string', () => {
      const result = syncer.testParseConfig({ Configuration: '' });
      expect(result).toEqual({});
    });

    it('should parse valid JSON', () => {
      const config: EntityDocumentConfiguration = {
        metadata: { fieldStrategy: 'include', defaultTruncationLimit: 500 },
        pipeline: { vectorizeBatchSize: 25 },
      };
      const result = syncer.testParseConfig({ Configuration: JSON.stringify(config) });
      expect(result.metadata?.fieldStrategy).toBe('include');
      expect(result.metadata?.defaultTruncationLimit).toBe(500);
      expect(result.pipeline?.vectorizeBatchSize).toBe(25);
    });

    it('should return empty object for invalid JSON and log error', async () => {
      const core = await import('@memberjunction/core');
      const result = syncer.testParseConfig({ Configuration: '{ broken json' });
      expect(result).toEqual({});
      expect(core.LogError).toHaveBeenCalled();
    });
  });

  /* ---- getDisplayFields ---- */
  describe('getDisplayFields', () => {
    const entityInfo = {
      Fields: [
        makeField({ Name: 'ID', IsPrimaryKey: true }),
        makeField({ Name: 'Name' }),
        makeField({ Name: 'Description', MaxLength: -1 }),
        makeField({ Name: 'Status' }),
        makeField({ Name: 'BinaryData', Type: 'varbinary' }),
        makeField({ Name: '__mj_CreatedAt' }),
        makeField({ Name: 'RelatedID', Type: 'uniqueidentifier' }),
      ],
    };

    it('should return undefined entityInfo as empty array', () => {
      expect(syncer.testGetDisplayFields(undefined)).toEqual([]);
    });

    it('should exclude PKs, system fields, binary types, and uniqueidentifiers by default', () => {
      const fields = syncer.testGetDisplayFields(entityInfo);
      const names = fields.map((f: MockField) => f.Name);
      expect(names).toEqual(['Name', 'Description', 'Status']);
      expect(names).not.toContain('ID');
      expect(names).not.toContain('BinaryData');
      expect(names).not.toContain('__mj_CreatedAt');
      expect(names).not.toContain('RelatedID');
    });

    it('should respect "include" strategy — only listed fields', () => {
      const metadataConfig: EntityDocumentMetadataConfig = {
        fieldStrategy: 'include',
        fields: {
          Name: { included: true },
          Status: { included: true },
        },
      };
      const fields = syncer.testGetDisplayFields(entityInfo, metadataConfig);
      const names = fields.map((f: MockField) => f.Name);
      expect(names).toEqual(['Name', 'Status']);
    });

    it('should respect "exclude" strategy — all except listed', () => {
      const metadataConfig: EntityDocumentMetadataConfig = {
        fieldStrategy: 'exclude',
        fields: {
          Description: { included: false },
        },
      };
      const fields = syncer.testGetDisplayFields(entityInfo, metadataConfig);
      const names = fields.map((f: MockField) => f.Name);
      expect(names).toEqual(['Name', 'Status']);
    });

    it('should allow individual exclusions under "all" strategy', () => {
      const metadataConfig: EntityDocumentMetadataConfig = {
        fieldStrategy: 'all',
        fields: {
          Status: { included: false },
        },
      };
      const fields = syncer.testGetDisplayFields(entityInfo, metadataConfig);
      const names = fields.map((f: MockField) => f.Name);
      expect(names).toEqual(['Name', 'Description']);
    });
  });

  /* ---- getFieldTruncationLimit ---- */
  describe('getFieldTruncationLimit', () => {
    it('should return field MaxLength for small fields (no config)', () => {
      const field = makeField({ Name: 'Name', MaxLength: 200 });
      expect(syncer.testGetFieldTruncationLimit(field)).toBe(200);
    });

    it('should return default 1000 for large fields (no config)', () => {
      const field = makeField({ Name: 'Notes', MaxLength: -1 });
      expect(syncer.testGetFieldTruncationLimit(field)).toBe(1000);
    });

    it('should return default 1000 for fields with MaxLength > 5000 (no config)', () => {
      const field = makeField({ Name: 'Bio', MaxLength: 10000 });
      expect(syncer.testGetFieldTruncationLimit(field)).toBe(1000);
    });

    it('should use global defaultTruncationLimit from config for large fields', () => {
      const field = makeField({ Name: 'Notes', MaxLength: -1 });
      const config: EntityDocumentMetadataConfig = { defaultTruncationLimit: 500 };
      expect(syncer.testGetFieldTruncationLimit(field, config)).toBe(500);
    });

    it('should use per-field truncationLimit override over global default', () => {
      const field = makeField({ Name: 'Notes', MaxLength: -1 });
      const config: EntityDocumentMetadataConfig = {
        defaultTruncationLimit: 500,
        fields: {
          Notes: { truncationLimit: 2000 },
        },
      };
      expect(syncer.testGetFieldTruncationLimit(field, config)).toBe(2000);
    });

    it('should use per-field override even for small fields', () => {
      const field = makeField({ Name: 'Name', MaxLength: 100 });
      const config: EntityDocumentMetadataConfig = {
        fields: {
          Name: { truncationLimit: 50 },
        },
      };
      expect(syncer.testGetFieldTruncationLimit(field, config)).toBe(50);
    });
  });
});
