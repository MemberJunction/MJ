import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the organic-key packing logic in SkipSDK.
 *
 * The packing helpers (`packSingleSkipOrganicKey`, `packSingleSkipOrganicKeyRelatedEntity`,
 * and the organic-key block inside `packSingleSkipEntityInfo`) are private methods on the
 * SkipSDK class and the SDK module pulls in a large dependency graph (mssql, http, MJ
 * config, AI engine, rxjs). To keep these as focused unit tests we mock every transitive
 * dependency aggressively and reach the private methods via bracket notation.
 */

// ---- Mutable state shared with the @memberjunction/core mock ----------------

const mockMetadataEntities: Array<{ ID: string; Name: string; SchemaName: string; BaseView: string }> = [];

// ---- Module mocks (must be defined before importing skip-sdk) ---------------

vi.mock('@memberjunction/core', () => ({
  LogStatus: vi.fn(),
  LogError: vi.fn(),
  Metadata: class {
    static get Provider() {
      return { Entities: mockMetadataEntities };
    }
  },
  RunQuery: class {},
  EntityInfo: class {},
  EntityFieldInfo: class {},
  EntityRelationshipInfo: class {},
  EntityOrganicKeyInfo: class {},
  EntityOrganicKeyRelatedEntityInfo: class {},
  UserInfo: class {},
}));

vi.mock('@memberjunction/global', () => ({
  CopyScalarsAndArrays: (o: unknown) => o,
  // The packing helpers compare entity IDs with UUIDsEqual; for the test we
  // can use simple string equality.
  UUIDsEqual: (a: string, b: string) => a === b,
}));

vi.mock('@memberjunction/ai', () => ({
  GetAIAPIKey: vi.fn(() => 'test-key'),
}));

vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: { Instance: { Config: () => Promise.resolve() } },
}));

vi.mock('@memberjunction/data-context', () => ({
  DataContext: class {},
}));

vi.mock('mssql', () => ({
  default: {},
  ConnectionPool: class {},
}));

vi.mock('http', () => ({ request: vi.fn() }));
vi.mock('https', () => ({ request: vi.fn() }));
vi.mock('zlib', () => ({ gzip: vi.fn(), createGunzip: vi.fn() }));

vi.mock('rxjs', () => ({
  BehaviorSubject: class {
    private value: unknown;
    constructor(initial: unknown) { this.value = initial; }
    next(v: unknown) { this.value = v; }
    pipe() { return this; }
  },
}));
vi.mock('rxjs/operators', () => ({ take: vi.fn() }));

// Skip SDK pulls server config and a couple of resolver internals; stub all of them.
vi.mock('../config.js', () => ({
  configInfo: { askSkip: { chatURL: '', apiKey: '', orgID: '', organizationInfo: '' } },
  baseUrl: '',
  publicUrl: '',
  graphqlPort: 4000,
  graphqlRootPath: '/graphql',
  apiKey: '',
}));

vi.mock('../index.js', () => ({
  getDbType: vi.fn(() => 'mssql'),
}));

vi.mock('../resolvers/GetDataResolver.js', () => ({
  registerAccessToken: vi.fn(),
  GetDataAccessToken: vi.fn(),
}));

// ---- Imports under test (must come AFTER vi.mock calls) ---------------------

import { SkipSDK } from '../agents/skip-sdk';
import type { SkipEntityOrganicKeyInfo } from '@memberjunction/skip-types';

// ---- Helpers to fabricate runtime-shaped MJ organic key objects -------------

function makeOrganicKey(overrides: Record<string, unknown> = {}) {
  const base = {
    ID: 'ok-1',
    EntityID: 'ent-source',
    Name: 'EmailMatch',
    Description: 'Match members across systems by email address',
    MatchFieldNames: 'EmailAddress',
    NormalizationStrategy: 'LowerCaseTrim' as const,
    CustomNormalizationExpression: null,
    Sequence: 0,
    Status: 'Active' as const,
    RelatedEntities: [] as unknown[],
  };
  const merged = { ...base, ...overrides };
  Object.defineProperty(merged, 'MatchFieldNamesArray', {
    get() {
      return this.MatchFieldNames ? this.MatchFieldNames.split(',').map((f: string) => f.trim()) : [];
    },
  });
  return merged;
}

function makeOrganicKeyRelatedEntity(overrides: Record<string, unknown> = {}) {
  const base = {
    ID: 'okre-1',
    EntityOrganicKeyID: 'ok-1',
    RelatedEntityID: 'ent-target',
    RelatedEntityFieldNames: null as string | null,
    TransitiveObjectName: null as string | null,
    TransitiveObjectMatchFieldNames: null as string | null,
    TransitiveObjectOutputFieldName: null as string | null,
    RelatedEntityJoinFieldName: null as string | null,
    DisplayName: null as string | null,
    Sequence: 0,
  };
  const merged = { ...base, ...overrides };
  Object.defineProperty(merged, 'IsDirectMatch', {
    get() { return this.RelatedEntityFieldNames != null; },
  });
  Object.defineProperty(merged, 'IsTransitiveMatch', {
    get() { return this.TransitiveObjectName != null; },
  });
  Object.defineProperty(merged, 'RelatedEntityFieldNamesArray', {
    get() {
      return this.RelatedEntityFieldNames ? this.RelatedEntityFieldNames.split(',').map((f: string) => f.trim()) : [];
    },
  });
  Object.defineProperty(merged, 'TransitiveObjectMatchFieldNamesArray', {
    get() {
      return this.TransitiveObjectMatchFieldNames ? this.TransitiveObjectMatchFieldNames.split(',').map((f: string) => f.trim()) : [];
    },
  });
  return merged;
}

// Bracket-notation accessors so the tests can reach private methods without
// adopting a // @ts-expect-error per call site.
type SkipSDKPrivate = SkipSDK & {
  packSingleSkipOrganicKey: (ok: unknown) => SkipEntityOrganicKeyInfo | null;
  packSingleSkipOrganicKeyRelatedEntity: (re: unknown) => unknown | null;
};

describe('SkipSDK organic key packing', () => {
  let sdk: SkipSDKPrivate;

  beforeEach(() => {
    mockMetadataEntities.length = 0;
    sdk = new SkipSDK() as SkipSDKPrivate;
  });

  describe('packSingleSkipOrganicKeyRelatedEntity', () => {
    it('should pack a direct-match related entity using metadata for schema/baseView', () => {
      mockMetadataEntities.push({ ID: 'ent-target', Name: 'Members', SchemaName: 'ym', BaseView: 'vwMembers' });
      const re = makeOrganicKeyRelatedEntity({
        ID: 'okre-direct',
        RelatedEntityID: 'ent-target',
        RelatedEntityFieldNames: 'EmailAddress',
        DisplayName: 'Members by Email',
        Sequence: 1,
      });

      const result = sdk['packSingleSkipOrganicKeyRelatedEntity'](re) as Record<string, unknown> | null;
      expect(result).not.toBeNull();
      expect(result!.id).toBe('okre-direct');
      expect(result!.relatedEntityName).toBe('Members');
      expect(result!.relatedEntitySchemaName).toBe('ym');
      expect(result!.relatedEntityBaseView).toBe('vwMembers');
      expect(result!.isDirectMatch).toBe(true);
      expect(result!.isTransitiveMatch).toBe(false);
      expect(result!.relatedEntityFieldNames).toEqual(['EmailAddress']);
      expect(result!.transitiveObjectName).toBeUndefined();
    });

    it('should pack a transitive-match related entity through a bridge view', () => {
      mockMetadataEntities.push({ ID: 'ent-target', Name: 'Members', SchemaName: 'ym', BaseView: 'vwMembers' });
      const re = makeOrganicKeyRelatedEntity({
        RelatedEntityID: 'ent-target',
        TransitiveObjectName: 'ym.vwAcronymToMember',
        TransitiveObjectMatchFieldNames: 'Acronym',
        TransitiveObjectOutputFieldName: 'MemberID',
        RelatedEntityJoinFieldName: 'ID',
      });

      const result = sdk['packSingleSkipOrganicKeyRelatedEntity'](re) as Record<string, unknown> | null;
      expect(result).not.toBeNull();
      expect(result!.isDirectMatch).toBe(false);
      expect(result!.isTransitiveMatch).toBe(true);
      expect(result!.relatedEntityFieldNames).toBeUndefined();
      expect(result!.transitiveObjectName).toBe('ym.vwAcronymToMember');
      expect(result!.transitiveObjectMatchFieldNames).toEqual(['Acronym']);
      expect(result!.transitiveObjectOutputFieldName).toBe('MemberID');
      expect(result!.relatedEntityJoinFieldName).toBe('ID');
    });

    it('should return null when the related entity is not in metadata', () => {
      // mockMetadataEntities is empty
      const re = makeOrganicKeyRelatedEntity({
        RelatedEntityID: 'ent-missing',
        RelatedEntityFieldNames: 'EmailAddress',
      });

      const result = sdk['packSingleSkipOrganicKeyRelatedEntity'](re);
      expect(result).toBeNull();
    });
  });

  describe('packSingleSkipOrganicKey', () => {
    beforeEach(() => {
      mockMetadataEntities.push({ ID: 'ent-target', Name: 'Members', SchemaName: 'ym', BaseView: 'vwMembers' });
    });

    it('should pack a basic organic key with parsed match field names', () => {
      const ok = makeOrganicKey({
        ID: 'ok-acronym',
        Name: 'AcronymMatch',
        MatchFieldNames: 'MemberOrganization',
        Sequence: 5,
        RelatedEntities: [makeOrganicKeyRelatedEntity({ RelatedEntityID: 'ent-target', RelatedEntityFieldNames: 'EmailAddress' })],
      });

      const result = sdk['packSingleSkipOrganicKey'](ok);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ok-acronym');
      expect(result!.name).toBe('AcronymMatch');
      expect(result!.matchFieldNames).toEqual(['MemberOrganization']);
      expect(result!.normalizationStrategy).toBe('LowerCaseTrim');
      expect(result!.sequence).toBe(5);
      expect(result!.relatedEntities).toHaveLength(1);
    });

    it('should preserve a custom normalization expression', () => {
      const ok = makeOrganicKey({
        NormalizationStrategy: 'Custom',
        CustomNormalizationExpression: 'REPLACE(LOWER({{FieldName}}), \' \', \'\')',
      });

      const result = sdk['packSingleSkipOrganicKey'](ok);
      expect(result!.normalizationStrategy).toBe('Custom');
      expect(result!.customNormalizationExpression).toBe('REPLACE(LOWER({{FieldName}}), \' \', \'\')');
    });

    it('should drop related entities that cannot be resolved against metadata', () => {
      const ok = makeOrganicKey({
        RelatedEntities: [
          makeOrganicKeyRelatedEntity({ ID: 're-good', RelatedEntityID: 'ent-target', RelatedEntityFieldNames: 'EmailAddress' }),
          makeOrganicKeyRelatedEntity({ ID: 're-bad', RelatedEntityID: 'ent-missing', RelatedEntityFieldNames: 'EmailAddress' }),
        ],
      });

      const result = sdk['packSingleSkipOrganicKey'](ok);
      expect(result!.relatedEntities).toHaveLength(1);
      expect(result!.relatedEntities[0].id).toBe('re-good');
    });
  });
});
