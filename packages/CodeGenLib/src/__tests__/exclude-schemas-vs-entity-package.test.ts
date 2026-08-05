/**
 * Regression tests for issue #3457 — pins the DIFFERENCE between the two mechanisms an Open App
 * install writes into the host's `mj.config.cjs`.
 *
 * The installer used to write BOTH `entityPackageName` and `excludeSchemas` for every app. These
 * tests exist to keep the reason that was wrong from being forgotten:
 *
 *   `entityPackageName` suppresses FILE GENERATION only — entity subclasses, GraphQL ObjectTypes,
 *   Angular components (`runCodeGen.runFileGenerationPhase` -> `localNonCoreEntities`).
 *
 *   `excludeSchemas` additionally suppresses entity DISCOVERY — it is compiled into the WHERE
 *   clause of the `createNewEntities()` query, so an excluded schema's tables can never become
 *   entities at all.
 *
 * An app that ships raw DDL and relies on the host's CodeGen to register its entities (the
 * contract in the Open App README, "Migration Content") is therefore silently destroyed by the
 * second and correctly served by the first.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { configInfo, getExternalEntitySchemas, DEFAULT_CODEGEN_CONFIG } from '../Config/config';
import type { ConfigInfo } from '../Config/config';

const APP_SCHEMA = '__mj_BizAppsCaliber';

/** Exposes the protected filter builder that `createNewEntities()` appends to its query. */
class Probe extends ManageMetadataBase {
  public discoveryFilter(): string {
    return this.createExcludeTablesAndSchemasFilter('');
  }
}

/** Mirrors the `localNonCoreEntities` computation in `runCodeGen.runFileGenerationPhase`. */
function localNonCoreEntities<T extends { SchemaName: string }>(entities: T[], config: ConfigInfo): T[] {
  const externalSchemas = getExternalEntitySchemas(config).map((s) => s.toLowerCase());
  return externalSchemas.length > 0
    ? entities.filter((e) => !externalSchemas.includes(e.SchemaName.toLowerCase()))
    : entities;
}

describe('excludeSchemas vs entityPackageName (issue #3457)', () => {
  let savedSchemas: string[];
  let savedTables: ConfigInfo['excludeTables'];

  beforeEach(() => {
    savedSchemas = [...(configInfo.excludeSchemas ?? [])];
    savedTables = [...(configInfo.excludeTables ?? [])];
  });
  afterEach(() => {
    configInfo.excludeSchemas = savedSchemas;
    configInfo.excludeTables = savedTables;
  });

  describe('excludeSchemas gates entity DISCOVERY', () => {
    it('compiles the schema into the createNewEntities() WHERE clause — no entity can ever be created', () => {
      configInfo.excludeSchemas = ['sys', 'staging', APP_SCHEMA];
      expect(new Probe().discoveryFilter()).toContain(`[SchemaName] <> '${APP_SCHEMA}'`);
    });

    it('leaves the schema discoverable when it is NOT excluded', () => {
      configInfo.excludeSchemas = ['sys', 'staging'];
      expect(new Probe().discoveryFilter()).not.toContain(APP_SCHEMA);
    });
  });

  describe('entityPackageName alone still suppresses duplicate emission', () => {
    it('drops the app schema from localNonCoreEntities with excludeSchemas untouched', () => {
      // Duplicate ObjectTypes crash the API at boot ("Schema must contain uniquely named types"),
      // so this is the guarantee that must survive removing the excludeSchemas write.
      const config = { entityPackageName: { [APP_SCHEMA]: '@caliber/app-entities' } } as unknown as ConfigInfo;
      const entities = [
        { SchemaName: APP_SCHEMA, Name: 'Caliber Candidates' },
        { SchemaName: 'dbo', Name: 'Host Thing' },
      ];
      expect(localNonCoreEntities(entities, config).map((e) => e.Name)).toEqual(['Host Thing']);
    });

    it('matches the schema case-insensitively (DB casing need not match the config key)', () => {
      const config = { entityPackageName: { [APP_SCHEMA]: '@caliber/app-entities' } } as unknown as ConfigInfo;
      const entities = [{ SchemaName: APP_SCHEMA.toUpperCase(), Name: 'Caliber Candidates' }];
      expect(localNonCoreEntities(entities, config)).toEqual([]);
    });

    it('is a no-op for a plain-string entityPackageName (non-OpenApp hosts keep every entity)', () => {
      const config = { entityPackageName: 'mj_generatedentities' } as unknown as ConfigInfo;
      const entities = [{ SchemaName: 'dbo', Name: 'Host Thing' }];
      expect(localNonCoreEntities(entities, config)).toHaveLength(1);
    });
  });

  describe("the excludeSchemas write's original justification was already covered", () => {
    it('excludes flyway_schema_history across ALL schemas by default, without excludeSchemas', () => {
      // The write was added to stop app-owned flyway_schema_history becoming an entity, but the
      // default excludeTables has covered that (in every schema) since well before it landed.
      configInfo.excludeSchemas = ['sys', 'staging'];
      configInfo.excludeTables = [...DEFAULT_CODEGEN_CONFIG.excludeTables];
      const sql = new Probe().discoveryFilter();
      expect(sql).toContain(`[TableName] = 'flyway_schema_history'`);
      expect(sql).not.toContain(APP_SCHEMA);
    });
  });
});
