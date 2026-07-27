import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Verifies the reverse-relationship availability gate in the GraphQL server generator — the fix for
 * "CodeGen for linked Open Apps".
 *
 * A reverse-relationship (child-array) field references the related entity's GraphQL type by BARE class
 * name, so it only compiles when that class is present in the file being generated. The class is present
 * iff the related entity is in the set of entities generated in this call — the ONE exception being a core
 * (`__mj`) related entity in a NON-core file, which is referenced via the `mj_core_schema_server_object_types.*`
 * namespace import and is therefore always available. `reverseRelatedTypeIsAvailable` encodes exactly that.
 *
 * These tests drive the pure decision helper directly. End-to-end wiring is proven by the live instance run
 * (base app `bizapps-common` linked with dependent `bizapps-tasks` that FKs into it: 20 cross-package refs +
 * TS2304 → 0 refs + clean build).
 */

vi.mock('@memberjunction/core', () => ({
  EntityInfo: class {},
  EntityFieldInfo: class {},
  EntityRelationshipInfo: class {},
  Metadata: class {
    get Entities() {
      return [];
    }
    EntityByName() {
      return undefined;
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
vi.mock('../Misc/util', () => ({
  makeDir: vi.fn(),
  sortBySequenceAndCreatedAt: (items: unknown[]) => [...items],
  sortRelatedEntities: (items: unknown[]) => [...items],
}));
vi.mock('../Config/config', () => ({ mjCoreSchema: '__mj', resolveEntityPackageName: () => 'pkg' }));

import { GraphQLServerGeneratorBase } from '../Misc/graphql_server_codegen';

// Expose the protected decision helper for direct assertion.
class Probe extends GraphQLServerGeneratorBase {
  public Available(relatedName: string, relatedSchema: string, generatedNames: string[], isInternal: boolean): boolean {
    const generatedSet = new Set(generatedNames.map((n) => n.trim().toLowerCase()));
    return this.reverseRelatedTypeIsAvailable(
      { Name: relatedName, SchemaName: relatedSchema } as never,
      generatedSet,
      isInternal,
    );
  }
}

describe('GraphQLServerGeneratorBase — reverseRelatedTypeIsAvailable', () => {
  let probe: Probe;
  beforeEach(() => {
    probe = new Probe();
  });

  it('EMITS a related entity whose class is generated in this file (in the set)', () => {
    expect(probe.Available('MJ_BizApps_Common: Person', '__mj_BizAppsCommon', ['MJ_BizApps_Common: Person'], false)).toBe(true);
  });

  it('DROPS a related entity that is NOT generated in this file (the linked-Open-App fix: the excluded dependent app is not in the set)', () => {
    // common's run generates only common entities; a tasks child is not in the set → its class is absent → drop.
    expect(probe.Available('MJ_BizApps_Tasks: Task Comment', '__mj_BizAppsTasks', ['MJ_BizApps_Common: Person'], false)).toBe(false);
  });

  it('matches the generated-set membership case-insensitively', () => {
    expect(probe.Available('  mj_BIZAPPS_common: person ', '__mj_BizAppsCommon', ['MJ_BizApps_Common: Person'], false)).toBe(true);
  });

  it('EMITS a core (__mj) related entity in a NON-core file even if not in the set (namespace-imported)', () => {
    expect(probe.Available('Users', '__mj', [], false)).toBe(true);
  });

  it('in the CORE pass (isInternal), a core child must be in the set (no namespace import of itself)', () => {
    expect(probe.Available('Users', '__mj', ['Users'], true)).toBe(true);
    expect(probe.Available('Users', '__mj', [], true)).toBe(false);
  });

  it('MONOLITH / multi-schema single app: cross-schema children are in the one generated set → EMITTED', () => {
    // one generated.ts containing several schemas' classes (string entityPackageName / multi-schema app).
    const set = ['Sales: Order', 'CRM: Contact', 'morecheese_members: Member', 'morecheese_orders: Order'];
    expect(probe.Available('CRM: Contact', 'CRM', set, false)).toBe(true);
    expect(probe.Available('morecheese_orders: Order', 'morecheese_orders', set, false)).toBe(true);
  });

  it('CO-GENERATED multi-app in one file: a cross-package child that IS in the set is EMITTED (the over-drop the package heuristic caused is gone)', () => {
    // a single instance-wide run that emits App A and App B classes into one generated.ts.
    const set = ['App A: Thing', 'App B: Other'];
    expect(probe.Available('App B: Other', 'app_b', set, false)).toBe(true);
  });
});
