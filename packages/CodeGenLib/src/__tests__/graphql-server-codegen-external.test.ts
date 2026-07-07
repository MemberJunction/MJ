import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

/**
 * Verifies the External-Data-Source gating in the GraphQL server resolver generator (H4).
 *
 * External entities have no MJ base view, so the generator MUST NOT emit `SELECT * FROM <baseView>`
 * for them — that would ship a resolver that throws at runtime. This test drives the real generator
 * with mocked metadata and asserts:
 *   - the single-record resolver routes through LoadExternalRecordByKey (not SELECT *),
 *   - the All<Entity> query is skipped (comment, no SELECT *),
 *   - a relationship to an external related entity is skipped (comment, no SELECT *),
 *   - a normal (non-external) entity is UNCHANGED (still emits SELECT * for All + relationships).
 *
 * The generator only depends on @memberjunction/core + @memberjunction/sql-dialect, so it mocks
 * cleanly with no database — same seam as entity-subclass-codegen.test.ts.
 */

// Controllable metadata "database" the mocked Metadata provider reads from.
const metadataEntities: unknown[] = [];

vi.mock('@memberjunction/core', () => ({
  EntityInfo: class {},
  EntityFieldInfo: class {},
  EntityRelationshipInfo: class {},
  Metadata: class {
    get Entities() {
      return metadataEntities;
    }
    EntityByName(name: string) {
      return (metadataEntities as Array<{ Name: string }>).find((e) => e.Name.toLowerCase() === name.toLowerCase());
    }
  },
  getGraphQLTypeNameBase: (e: { ClassName?: string; CodeName?: string }) => e.ClassName ?? e.CodeName ?? 'X',
  TypeScriptTypeFromSQLType: (t: string) => t,
  TypeScriptTypeFromSQLTypeWithNullableOption: (t: string) => t,
}));

vi.mock('@memberjunction/sql-dialect', () => ({
  IsBinarySQLType: () => false,
  IsBooleanSQLType: () => false,
  IsCurrencySQLType: () => false,
  IsDateSQLType: () => false,
  IsFloatSQLType: () => false,
  IsStringSQLType: () => false,
  IsUuidSQLType: () => false,
}));

vi.mock('../Misc/status_logging', () => ({ logError: vi.fn(), logStatus: vi.fn() }));
vi.mock('../Config/config', () => ({ mjCoreSchema: '__mj', resolveEntityPackageName: () => 'pkg' }));
vi.mock('../Misc/util', () => ({
  makeDir: vi.fn(),
  sortBySequenceAndCreatedAt: (items: unknown[]) => [...items],
  sortRelatedEntities: (items: unknown[]) => [...items],
}));

import { GraphQLServerGeneratorBase } from '../Misc/graphql_server_codegen';

class TestableGenerator extends GraphQLServerGeneratorBase {
  public resolver(entity: unknown, typeName: string) {
    // (entity, serverGraphQLTypeName, excludeRelatedEntitiesExternalToSchema, isInternal)
    return this.generateServerGraphQLResolver(entity as never, typeName, false, true);
  }
}

const pk = (name: string) => ({ Name: name, CodeName: name, GraphQLType: 'String', TSType: 'string' });

const makeEntity = (over: Record<string, unknown>) => ({
  Name: 'Demo Orders',
  CodeName: 'DemoOrders',
  ClassName: 'DemoOrders',
  BaseView: 'vwDemoOrders',
  SchemaName: 'ext',
  ExternalDataSourceID: null,
  AllowAllRowsAPI: true,
  AllowCreateAPI: false,
  AllowUpdateAPI: false,
  AuditRecordAccess: false,
  CustomResolverAPI: false,
  PrimaryKeys: [pk('id')],
  FirstPrimaryKey: pk('id'),
  RelatedEntities: [],
  Fields: [],
  ...over,
});

describe('GraphQLServerGeneratorBase — external-data-source gating (H4)', () => {
  let gen: TestableGenerator;
  beforeEach(() => {
    gen = new TestableGenerator();
    metadataEntities.length = 0;
  });

  describe('external entity', () => {
    it('routes the single-record resolver through LoadExternalRecordByKey (no SELECT *)', () => {
      const out = gen.resolver(makeEntity({ ExternalDataSourceID: 'ds-1', AllowAllRowsAPI: false }), 'DemoOrders_');
      expect(out).toContain('LoadExternalRecordByKey');
      expect(out).not.toContain('SELECT * FROM');
    });

    it('skips the All<Entity> query (comment, never a base-view SELECT)', () => {
      const out = gen.resolver(makeEntity({ ExternalDataSourceID: 'ds-1', AllowAllRowsAPI: true }), 'DemoOrders_');
      expect(out).toContain('AllDemoOrders() intentionally not generated');
      expect(out).not.toContain('async AllDemoOrders(');
      expect(out).not.toContain('SELECT * FROM');
    });

    it('skips a relationship whose RELATED entity is external (comment, no SELECT *)', () => {
      metadataEntities.push({ Name: 'Ext Line Items', IncludeInAPI: true, ExternalDataSourceID: 'ds-1', SchemaName: 'ext' });
      const out = gen.resolver(
        makeEntity({
          ExternalDataSourceID: 'ds-1',
          AllowAllRowsAPI: false,
          RelatedEntities: [{ RelatedEntity: 'Ext Line Items', Type: 'One To Many', RelatedEntityJoinField: 'order_id' }],
        }),
        'DemoOrders_',
      );
      expect(out).toContain('Relationship to Ext Line Items not generated: related entity is external');
      expect(out).not.toContain('SELECT * FROM');
    });
  });

  describe('normal (non-external) entity is unchanged', () => {
    it('still emits the All<Entity> base-view query', () => {
      const out = gen.resolver(makeEntity({ ExternalDataSourceID: null, AllowAllRowsAPI: true }), 'DemoOrders_');
      expect(out).toContain('async AllDemoOrders(');
      expect(out).toContain('SELECT * FROM');
      expect(out).not.toContain('intentionally not generated');
    });

    it('still generates a relationship resolver to a non-external related entity', () => {
      metadataEntities.push({
        Name: 'Line Items', IncludeInAPI: true, ExternalDataSourceID: null, SchemaName: 'ext',
        CodeName: 'LineItems', ClassName: 'LineItems', BaseView: 'vwLineItems', BaseTableCodeName: 'LineItems',
        PrimaryKeys: [pk('id')], FirstPrimaryKey: pk('id'),
      });
      const out = gen.resolver(
        makeEntity({
          ExternalDataSourceID: null,
          AllowAllRowsAPI: false,
          RelatedEntities: [{ RelatedEntity: 'Line Items', Type: 'One To Many', RelatedEntityJoinField: 'order_id' }],
        }),
        'DemoOrders_',
      );
      expect(out).not.toContain('not generated: related entity is external');
    });
  });
});
