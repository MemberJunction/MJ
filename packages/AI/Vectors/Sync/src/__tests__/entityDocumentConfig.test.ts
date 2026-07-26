import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityDocumentConfiguration, EntityDocumentMetadataConfig } from '../generic/entityDocumentConfig.types';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */

vi.mock('@memberjunction/global', async (importOriginal) => {
  // Spread the REAL module (mirrors the @memberjunction/core mock below) so any export
  // MJCore's real code needs at import time — decorators like @RequiresSubclass(), utility
  // functions, etc. — stays available without this test needing to know about it. Only the
  // three exports below are deliberately overridden, each for a specific reason:
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
    // Real RegisterClass eagerly registers into the real ClassFactory the moment this test's
    // module graph loads — avoid that side effect with a no-op.
    RegisterClass: () => (_target: unknown) => {},
    // No-op decorator factory — classes in the ai-vector-sync module graph declare
    // `@RequiresSubclass()`; the mock must expose it or module init throws on the missing export.
    RequiresSubclass: () => (_target: unknown) => {},
    // Same story for OptionalKeyedSpecialization (baseEntity marks EntityField with it, B47).
    OptionalKeyedSpecialization: () => (_target: unknown) => {},
    MJGlobal: { Instance: { ClassFactory: { GetRegistration: vi.fn() } } },
    // Real BaseSingleton persists instances in a process-wide global object store
    // (GetGlobalObjectStore()) — shared across every test file in the same vitest worker.
    // A Map scoped to this mock module keeps each test file's singletons isolated.
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

  /** Expose buildVectorId for testing */
  public testBuildVectorId(entityDocumentID: string, compositeKey: string, strategy: 'hash' | 'recordId'): string {
    return (this as unknown as Record<string, CallableFunction>)['buildVectorId'](entityDocumentID, compositeKey, strategy) as string;
  }

  /** Expose buildVectorMetadata for testing — now protected, so a direct `this.` call works */
  public testBuildVectorMetadata(
    embeddingItem: { __mj_compositeKey: string; EntityData: Record<string, unknown> },
    entityDocument: { ID: string; Entity: string },
    templateContent: { ID: string },
    entityInfo: { Icon?: string } | undefined,
    displayFields: MockField[],
    metadataConfig?: EntityDocumentMetadataConfig
  ): Record<string, string | number | boolean> {
    return (this as unknown as Record<string, CallableFunction>)['buildVectorMetadata'](
      embeddingItem, entityDocument, templateContent, entityInfo, displayFields, metadataConfig
    ) as Record<string, string | number | boolean>;
  }

  /** Expose the individually-overridable addSystemMetadata step */
  public testAddSystemMetadata(
    metadata: Record<string, string | number | boolean>,
    embeddingItem: { __mj_compositeKey: string },
    entityDocument: { ID: string; Entity: string },
    templateContent: { ID: string },
    explicit: boolean
  ): void {
    (this as unknown as Record<string, CallableFunction>)['addSystemMetadata'](
      metadata, embeddingItem, entityDocument, templateContent, explicit
    );
  }

  /** Expose the individually-overridable addEntityIconMetadata step */
  public testAddEntityIconMetadata(
    metadata: Record<string, string | number | boolean>,
    entityInfo: { Icon?: string } | undefined,
    metadataConfig: EntityDocumentMetadataConfig | undefined,
    explicit: boolean
  ): void {
    (this as unknown as Record<string, CallableFunction>)['addEntityIconMetadata'](metadata, entityInfo, metadataConfig, explicit);
  }

  /** Expose the individually-overridable addUpdatedAtMetadata step */
  public testAddUpdatedAtMetadata(
    metadata: Record<string, string | number | boolean>,
    record: Record<string, unknown>,
    metadataConfig: EntityDocumentMetadataConfig | undefined,
    explicit: boolean
  ): void {
    (this as unknown as Record<string, CallableFunction>)['addUpdatedAtMetadata'](metadata, record, metadataConfig, explicit);
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

    it('should honor an explicitly included uniqueidentifier field under "include" strategy', () => {
      const metadataConfig: EntityDocumentMetadataConfig = {
        fieldStrategy: 'include',
        fields: {
          Name: { included: true },
          RelatedID: { included: true },
        },
      };
      const fields = syncer.testGetDisplayFields(entityInfo, metadataConfig);
      const names = fields.map((f: MockField) => f.Name);
      expect(names).toEqual(['Name', 'RelatedID']);
    });

    it('should honor explicitly included PK and __mj_* fields under "include" strategy', () => {
      const metadataConfig: EntityDocumentMetadataConfig = {
        fieldStrategy: 'include',
        fields: {
          ID: { included: true },
          __mj_CreatedAt: { included: true },
        },
      };
      const fields = syncer.testGetDisplayFields(entityInfo, metadataConfig);
      const names = fields.map((f: MockField) => f.Name);
      expect(names).toEqual(['ID', '__mj_CreatedAt']);
    });

    it('should refuse explicitly included binary fields with a logged error (never a silent drop)', async () => {
      const core = await import('@memberjunction/core');
      const metadataConfig: EntityDocumentMetadataConfig = {
        fieldStrategy: 'include',
        fields: {
          Name: { included: true },
          BinaryData: { included: true },
        },
      };
      const fields = syncer.testGetDisplayFields(entityInfo, metadataConfig);
      const names = fields.map((f: MockField) => f.Name);
      expect(names).toEqual(['Name']);
      expect(core.LogError).toHaveBeenCalledWith(expect.stringContaining('BinaryData'));
    });

    it('should select exactly the listed fields under "explicit" strategy (same rules as include)', () => {
      const metadataConfig: EntityDocumentMetadataConfig = {
        fieldStrategy: 'explicit',
        fields: {
          Status: { included: true },
          RelatedID: { included: true },
        },
      };
      const fields = syncer.testGetDisplayFields(entityInfo, metadataConfig);
      const names = fields.map((f: MockField) => f.Name);
      expect(names).toEqual(['Status', 'RelatedID']);
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

  /* ---- buildVectorId ---- */
  describe('buildVectorId', () => {
    const DOC_ID = 'D0C00000-0000-0000-0000-000000000001';

    it('should produce the exact legacy SHA-1 formula under the "hash" strategy (back-compat)', () => {
      const compositeKey = 'ID|A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
      const expected = createHash('sha1').update(`${DOC_ID}_${compositeKey}`).digest('hex');
      expect(syncer.testBuildVectorId(DOC_ID, compositeKey, 'hash')).toBe(expected);
    });

    it('should produce a 40-char hex ID under "hash" that differs by entity document', () => {
      const compositeKey = 'ID|A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
      const id1 = syncer.testBuildVectorId(DOC_ID, compositeKey, 'hash');
      const id2 = syncer.testBuildVectorId('OTHER-DOC-ID', compositeKey, 'hash');
      expect(id1).toMatch(/^[0-9a-f]{40}$/);
      expect(id1).not.toBe(id2);
    });

    it('should use the raw PK value, lowercased, under "recordId" for a single-column UUID PK', () => {
      const id = syncer.testBuildVectorId(DOC_ID, 'ID|A1B2C3D4-E5F6-7890-ABCD-EF1234567890', 'recordId');
      expect(id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('should not depend on the entity document ID under "recordId" (portable IDs)', () => {
      const key = 'ID|A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
      expect(syncer.testBuildVectorId(DOC_ID, key, 'recordId'))
        .toBe(syncer.testBuildVectorId('OTHER-DOC-ID', key, 'recordId'));
    });

    it('should join composite PK values with "||" and pass non-UUID values through unchanged', () => {
      const id = syncer.testBuildVectorId(DOC_ID, 'Code|ABC-1||Region|WeSt', 'recordId');
      expect(id).toBe('ABC-1||WeSt');
    });

    it('should throw under "recordId" when the composite key is empty', () => {
      expect(() => syncer.testBuildVectorId(DOC_ID, '', 'recordId')).toThrow(/recordId/);
    });

    it('should throw under "recordId" when the ID exceeds the 512-byte provider limit', () => {
      const hugeValue = 'x'.repeat(600);
      expect(() => syncer.testBuildVectorId(DOC_ID, `Code|${hugeValue}`, 'recordId')).toThrow(/512/);
    });
  });

  /* ---- buildVectorMetadata ---- */
  describe('buildVectorMetadata', () => {
    const entityDocument = { ID: 'DOC-1', Entity: 'Content Items' };
    const templateContent = { ID: 'TPL-1' };
    const entityInfo = { Icon: 'fa-solid fa-file' };

    function makeEmbeddingItem(dataOverrides: Record<string, unknown> = {}) {
      return {
        __mj_compositeKey: 'ID|A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
        EntityData: {
          Name: 'Test Item',
          Status: 'Active',
          Score: '42',
          RelatedID: 'B1B2C3D4-E5F6-7890-ABCD-EF1234567890',
          __mj_UpdatedAt: '2026-07-01T00:00:00Z',
          ...dataOverrides,
        },
      };
    }

    it('should include all system keys by default (back-compat, no config)', () => {
      const displayFields = [makeField({ Name: 'Name' }), makeField({ Name: 'Status' })];
      const metadata = syncer.testBuildVectorMetadata(makeEmbeddingItem(), entityDocument, templateContent, entityInfo, displayFields);

      expect(metadata['RecordID']).toBe('ID|A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
      expect(metadata['Entity']).toBe('Content Items');
      expect(metadata['TemplateID']).toBe('TPL-1');
      expect(metadata['EntityIcon']).toBe('fa-solid fa-file');
      expect(metadata['__mj_UpdatedAt']).toBe('2026-07-01T00:00:00Z');
      expect(metadata['Name']).toBe('Test Item');
      expect(metadata['Status']).toBe('Active');
    });

    it('should keep system keys under "include" strategy (back-compat)', () => {
      const config: EntityDocumentMetadataConfig = {
        fieldStrategy: 'include',
        fields: { Name: { included: true } },
      };
      const displayFields = [makeField({ Name: 'Name' })];
      const metadata = syncer.testBuildVectorMetadata(makeEmbeddingItem(), entityDocument, templateContent, entityInfo, displayFields, config);

      expect(metadata['RecordID']).toBeDefined();
      expect(metadata['Entity']).toBe('Content Items');
      expect(metadata['TemplateID']).toBe('TPL-1');
      expect(metadata['EntityIcon']).toBe('fa-solid fa-file');
      expect(metadata['__mj_UpdatedAt']).toBeDefined();
    });

    it('should honor includeEntityIcon:false / includeUpdatedAt:false opt-outs (back-compat)', () => {
      const config: EntityDocumentMetadataConfig = {
        includeEntityIcon: false,
        includeUpdatedAt: false,
      };
      const metadata = syncer.testBuildVectorMetadata(makeEmbeddingItem(), entityDocument, templateContent, entityInfo, [], config);

      expect(metadata['EntityIcon']).toBeUndefined();
      expect(metadata['__mj_UpdatedAt']).toBeUndefined();
      // Unconditional keys remain under non-explicit strategies
      expect(metadata['RecordID']).toBeDefined();
      expect(metadata['Entity']).toBeDefined();
      expect(metadata['TemplateID']).toBeDefined();
    });

    it('should contain EXACTLY the configured fields under "explicit" — no system keys', () => {
      const config: EntityDocumentMetadataConfig = {
        fieldStrategy: 'explicit',
        fields: {
          Status: { included: true },
          RelatedID: { included: true },
        },
      };
      const displayFields = [
        makeField({ Name: 'Status' }),
        makeField({ Name: 'RelatedID', Type: 'uniqueidentifier' }),
      ];
      const metadata = syncer.testBuildVectorMetadata(makeEmbeddingItem(), entityDocument, templateContent, entityInfo, displayFields, config);

      expect(Object.keys(metadata).sort()).toEqual(['RelatedID', 'Status']);
    });

    it('should flip EntityIcon / __mj_UpdatedAt to opt-in under "explicit"', () => {
      const config: EntityDocumentMetadataConfig = {
        fieldStrategy: 'explicit',
        includeEntityIcon: true,
        includeUpdatedAt: true,
      };
      const metadata = syncer.testBuildVectorMetadata(makeEmbeddingItem(), entityDocument, templateContent, entityInfo, [], config);

      expect(Object.keys(metadata).sort()).toEqual(['EntityIcon', '__mj_UpdatedAt']);
      expect(metadata['RecordID']).toBeUndefined();
      expect(metadata['Entity']).toBeUndefined();
      expect(metadata['TemplateID']).toBeUndefined();
    });

    it('should normalize uniqueidentifier metadata values to lowercase for cross-platform filters', () => {
      const config: EntityDocumentMetadataConfig = {
        fieldStrategy: 'explicit',
        fields: { RelatedID: { included: true } },
      };
      const displayFields = [makeField({ Name: 'RelatedID', Type: 'uniqueidentifier' })];
      const metadata = syncer.testBuildVectorMetadata(makeEmbeddingItem(), entityDocument, templateContent, entityInfo, displayFields, config);

      expect(metadata['RelatedID']).toBe('b1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('should still store numeric SQL types as numbers and truncate long strings', () => {
      const config: EntityDocumentMetadataConfig = {
        fieldStrategy: 'explicit',
        fields: {
          Score: { included: true },
          Name: { included: true, truncationLimit: 4 },
        },
      };
      const displayFields = [
        makeField({ Name: 'Score', Type: 'int' }),
        makeField({ Name: 'Name', MaxLength: -1 }),
      ];
      const metadata = syncer.testBuildVectorMetadata(makeEmbeddingItem(), entityDocument, templateContent, entityInfo, displayFields, config);

      expect(metadata['Score']).toBe(42);
      expect(metadata['Name']).toBe('Test');
    });

    it('should skip null field values', () => {
      const config: EntityDocumentMetadataConfig = {
        fieldStrategy: 'explicit',
        fields: { Status: { included: true } },
      };
      const displayFields = [makeField({ Name: 'Status' })];
      const item = makeEmbeddingItem({ Status: null });
      const metadata = syncer.testBuildVectorMetadata(item, entityDocument, templateContent, entityInfo, displayFields, config);

      expect(metadata['Status']).toBeUndefined();
      expect(Object.keys(metadata)).toEqual([]);
    });
  });

  /* ---- decomposed buildVectorMetadata steps, tested individually ---- */
  describe('buildVectorMetadata decomposed steps', () => {
    const entityDocument = { ID: 'DOC-1', Entity: 'Content Items' };
    const templateContent = { ID: 'TPL-1' };

    describe('addSystemMetadata', () => {
      it('should set RecordID / Entity / TemplateID when not explicit', () => {
        const metadata: Record<string, string | number | boolean> = {};
        syncer.testAddSystemMetadata(metadata, { __mj_compositeKey: 'ID|abc' }, entityDocument, templateContent, false);
        expect(metadata).toEqual({ RecordID: 'ID|abc', Entity: 'Content Items', TemplateID: 'TPL-1' });
      });

      it('should add nothing when explicit', () => {
        const metadata: Record<string, string | number | boolean> = {};
        syncer.testAddSystemMetadata(metadata, { __mj_compositeKey: 'ID|abc' }, entityDocument, templateContent, true);
        expect(metadata).toEqual({});
      });
    });

    describe('addEntityIconMetadata', () => {
      it('should include the icon by default when not explicit', () => {
        const metadata: Record<string, string | number | boolean> = {};
        syncer.testAddEntityIconMetadata(metadata, { Icon: 'fa-file' }, undefined, false);
        expect(metadata['EntityIcon']).toBe('fa-file');
      });

      it('should omit the icon by default when explicit', () => {
        const metadata: Record<string, string | number | boolean> = {};
        syncer.testAddEntityIconMetadata(metadata, { Icon: 'fa-file' }, undefined, true);
        expect(metadata['EntityIcon']).toBeUndefined();
      });

      it('should include the icon under explicit when includeEntityIcon:true is set', () => {
        const metadata: Record<string, string | number | boolean> = {};
        syncer.testAddEntityIconMetadata(metadata, { Icon: 'fa-file' }, { includeEntityIcon: true }, true);
        expect(metadata['EntityIcon']).toBe('fa-file');
      });
    });

    describe('addUpdatedAtMetadata', () => {
      it('should include __mj_UpdatedAt by default when not explicit', () => {
        const metadata: Record<string, string | number | boolean> = {};
        syncer.testAddUpdatedAtMetadata(metadata, { __mj_UpdatedAt: '2026-01-01T00:00:00Z' }, undefined, false);
        expect(metadata['__mj_UpdatedAt']).toBe('2026-01-01T00:00:00Z');
      });

      it('should omit __mj_UpdatedAt by default when explicit', () => {
        const metadata: Record<string, string | number | boolean> = {};
        syncer.testAddUpdatedAtMetadata(metadata, { __mj_UpdatedAt: '2026-01-01T00:00:00Z' }, undefined, true);
        expect(metadata['__mj_UpdatedAt']).toBeUndefined();
      });
    });
  });

  /* ---- proof that the protected decomposition is genuinely overridable ---- */
  describe('buildVectorMetadata subclass overrides', () => {
    const entityDocument = { ID: 'DOC-1', Entity: 'Content Items' };
    const templateContent = { ID: 'TPL-1' };
    const entityInfo = { Icon: 'fa-solid fa-file' };

    it('lets a subclass override one step (EntityIcon) without touching the others', () => {
      class CustomIconSyncer extends TestableSyncer {
        protected addEntityIconMetadata(
          metadata: Record<string, string | number | boolean>,
          _entityInfo: unknown,
          _metadataConfig: EntityDocumentMetadataConfig | undefined,
          _explicit: boolean
        ): void {
          metadata['EntityIcon'] = 'custom-icon-override';
        }
      }

      const customSyncer = new CustomIconSyncer();
      const metadata = customSyncer.testBuildVectorMetadata(
        { __mj_compositeKey: 'ID|abc', EntityData: { __mj_UpdatedAt: '2026-01-01T00:00:00Z' } },
        entityDocument,
        templateContent,
        entityInfo,
        [],
      );

      // The overridden step's output wins...
      expect(metadata['EntityIcon']).toBe('custom-icon-override');
      // ...while the un-overridden steps still ran normally, untouched by the subclass.
      expect(metadata['Entity']).toBe('Content Items');
      expect(metadata['RecordID']).toBe('ID|abc');
      expect(metadata['TemplateID']).toBe('TPL-1');
      expect(metadata['__mj_UpdatedAt']).toBe('2026-01-01T00:00:00Z');
    });
  });
});
