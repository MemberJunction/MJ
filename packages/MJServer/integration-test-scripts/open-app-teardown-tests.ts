/**
 * open-app-teardown-tests.ts — live integration test for the Open-App metadata teardown seam.
 *
 * Codifies the exact scenario the PR's manual validation proved (so it guards the seam forever):
 * a *used* app whose entity has an orphaned `RecordChange` (a NOT-NULL FK to `__mj.Entity`) plus a
 * link-less, fixed-GUID nav `Application`. It then drives the REAL exported `RemoveAppEntityMetadata`
 * (the same code path `mj app remove` calls) and asserts:
 *   - OAT1: the FK-graph cascade removes ALL of the app's metadata — Entity, EntityField, SchemaInfo,
 *           AND the blocking `RecordChange` the old hardcoded-list path under-deleted (which would
 *           otherwise FK-block the Entity delete).
 *   - OAT2: the migration-declared, link-less `Application` is removed (Solution 2), and it can then
 *           be re-created with the SAME fixed GUID without a `PK_Application` collision (the reinstall
 *           path this fix unblocks).
 *
 * This exercises the OpenApp engine × SQLDialect × data-provider seam end-to-end against a real DB.
 * Deterministic (no model calls). Seeds + deletes ALL its own throwaway rows (self-cleaning `finally`).
 *
 * Runs on whatever DB the harness resolves (SQL Server in CI). The teardown itself is dialect-driven;
 * this suite is bootstrapped via the mssql-based harness, so it runs on SQL Server. PostgreSQL parity
 * of the cascade is covered by the parametrized unit tests + the PR's direct-provider PG validation.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/open-app-teardown-tests.ts
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import { randomUUID } from 'node:crypto';
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI } from './lib/ai-bootstrap';
import type { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { RemoveAppEntityMetadata } from '@memberjunction/open-app-engine';

const MJ_SCHEMA = '__mj';
// A unique, throwaway "app" schema NAME (metadata only — no real DB schema is created/dropped here;
// RemoveAppEntityMetadata only clears `__mj` metadata rows + Applications, not the app's own schema).
const TAG = `${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
const APP_SCHEMA = `oa_teardown_it_${TAG}`;
const ENTITY_ID = randomUUID();
const FIELD_ID = randomUUID();
const RC_ID = randomUUID();
const APP_ID = randomUUID(); // link-less nav Application — fixed for the PK-collision re-create test

async function main(): Promise<void> {
  const { user, provider } = await bootstrapAI();
  const db = provider as SQLServerDataProvider;
  const d = db.Dialect;
  const suite = new TestRunner('Open-App metadata teardown (FK-graph cascade + Application cleanup)');

  // dialect-quoted helpers so the seed/asserts read cleanly (and are dialect-portable-ready)
  const T = (t: string): string => d.QuoteSchema(MJ_SCHEMA, t);
  const lit = (v: string): string => d.QuoteStringLiteral(v);
  const exec = (sql: string) => db.ExecuteSQL<Record<string, unknown>>(sql);
  const count = async (table: string, where: string): Promise<number> => {
    const rows = await exec(`SELECT COUNT(*) AS n FROM ${T(table)} WHERE ${where}`);
    return rows && rows[0] ? Number(rows[0].n) : 0;
  };

  // ── seed a used app: SchemaInfo + Entity + EntityField + a blocking RecordChange + a link-less App ──
  await exec(
    `INSERT INTO ${T('SchemaInfo')} (ID, SchemaName, EntityIDMin, EntityIDMax) ` +
    `VALUES (${lit(randomUUID())}, ${lit(APP_SCHEMA)}, 990000, 990999)`,
  );
  await exec(
    `INSERT INTO ${T('Entity')} (ID, Name, SchemaName, BaseTable, BaseView) ` +
    `VALUES (${lit(ENTITY_ID)}, ${lit(`OA Teardown IT ${TAG}: Widget`)}, ${lit(APP_SCHEMA)}, 'Widget', 'vwWidgets')`,
  );
  await exec(
    `INSERT INTO ${T('EntityField')} (ID, EntityID, Sequence, Name, Type) ` +
    `VALUES (${lit(FIELD_ID)}, ${lit(ENTITY_ID)}, 1, 'ID', 'uniqueidentifier')`,
  );
  // The dependent the old hardcoded list MISSES — a NOT-NULL FK RecordChange.EntityID -> Entity.
  await exec(
    `INSERT INTO ${T('RecordChange')} (ID, EntityID, RecordID, UserID, Type, Source, ChangedAt, ChangesJSON, ChangesDescription, FullRecordJSON, Status, CreatedAt, UpdatedAt) ` +
    `VALUES (${lit(RC_ID)}, ${lit(ENTITY_ID)}, 'widget-1', ${lit(user.ID)}, 'Create', 'Internal', SYSDATETIMEOFFSET(), '{}', 'teardown IT', '{}', 'Complete', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
  );
  await exec(
    `INSERT INTO ${T('Application')} (ID, Name, Path) ` +
    `VALUES (${lit(APP_ID)}, ${lit(`OA Teardown IT ${TAG}`)}, '/oa-teardown-it')`,
  );

  let failures = 0;
  try {
    suite.Test('OAT1: FK-graph teardown clears all metadata incl. the blocking RecordChange', async () => {
      // sanity: everything seeded
      AssertEqual(await count('Entity', `SchemaName = ${lit(APP_SCHEMA)}`), 1, 'seed: 1 entity');
      AssertEqual(await count('RecordChange', `EntityID = ${lit(ENTITY_ID)}`), 1, 'seed: 1 recordchange');

      const result = await RemoveAppEntityMetadata(APP_SCHEMA, user, undefined, provider, {
        DatabaseProvider: db,
        MJCoreSchema: MJ_SCHEMA,
        DeclaredApplicationIds: [APP_ID], // link-less nav App → declared-id path (Solution 2)
      });
      Assert(result.Success, `RemoveAppEntityMetadata failed: ${result.ErrorMessage}`);

      AssertEqual(await count('Entity', `SchemaName = ${lit(APP_SCHEMA)}`), 0, 'Entity rows cleared');
      AssertEqual(await count('EntityField', `EntityID = ${lit(ENTITY_ID)}`), 0, 'EntityField rows cleared');
      AssertEqual(await count('RecordChange', `EntityID = ${lit(ENTITY_ID)}`), 0, 'blocking RecordChange cleared');
      AssertEqual(await count('SchemaInfo', `SchemaName = ${lit(APP_SCHEMA)}`), 0, 'SchemaInfo cleared');
    });

    suite.Test('OAT2: link-less Application removed → re-create with same GUID has no PK collision', async () => {
      AssertEqual(await count('Application', `ID = ${lit(APP_ID)}`), 0, 'declared link-less Application removed');
      // Re-insert the SAME fixed GUID — the reinstall path this fix unblocks. Would throw on PK collision.
      await exec(
        `INSERT INTO ${T('Application')} (ID, Name, Path) ` +
        `VALUES (${lit(APP_ID)}, ${lit(`OA Teardown IT ${TAG}`)}, '/oa-teardown-it')`,
      );
      AssertEqual(await count('Application', `ID = ${lit(APP_ID)}`), 1, 're-created Application present (no PK collision)');
    });

    failures = await suite.Run();
  } finally {
    // Self-cleaning: remove anything still present (order respects FKs: children before parents).
    const safe = async (sql: string): Promise<void> => { try { await exec(sql); } catch { /* best-effort */ } };
    await safe(`DELETE FROM ${T('RecordChange')} WHERE EntityID = ${lit(ENTITY_ID)}`);
    await safe(`DELETE FROM ${T('EntityField')} WHERE EntityID = ${lit(ENTITY_ID)}`);
    await safe(`DELETE FROM ${T('Entity')} WHERE ID = ${lit(ENTITY_ID)}`);
    await safe(`DELETE FROM ${T('SchemaInfo')} WHERE SchemaName = ${lit(APP_SCHEMA)}`);
    await safe(`DELETE FROM ${T('Application')} WHERE ID = ${lit(APP_ID)}`);
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Bootstrap/error:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(2);
});
