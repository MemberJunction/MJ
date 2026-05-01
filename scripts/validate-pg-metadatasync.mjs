/**
 * B2 Validation: MetadataSync PostgreSQL initialization + transaction lifecycle.
 *
 * Exercises the code paths we just added to `MetadataSync/src/lib/provider-utils.ts`:
 *   1. initializeProvider({dbPlatform:'postgresql',...}) → PostgreSQLDataProvider
 *   2. refreshUserCacheFromPG populates UserCache
 *   3. getSystemUser() resolves the System user with Developer role
 *   4. Transaction Begin/Commit + Begin/Rollback via the generic DatabaseProviderBase API
 *   5. cleanupProvider() closes pg.Pool cleanly
 *
 * This is not a full push/pull cycle — that still requires a DB with the full migration
 * set applied. It is the intermediate proof that the structural change works end-to-end.
 *
 * Prerequisites:
 *   - `mj_pg_codegen_test` exists with migrations 1-36 of the v5 PG set applied
 *   - __mj.User, __mj.Role, __mj.UserRole tables populated (script seeds them idempotently)
 */

import pg from 'pg';
import { initializeProvider, cleanupProvider, getSystemUser, getDataProvider } from '../packages/MetadataSync/dist/lib/provider-utils.js';

const DB_CONFIG = {
  dbHost: process.env.PG_HOST ?? 'localhost',
  dbPort: parseInt(process.env.PG_PORT ?? '5432', 10),
  dbDatabase: process.env.PG_DATABASE ?? 'mj_pg_codegen_test',
  dbUsername: process.env.PG_USERNAME ?? 'postgres',
  dbPassword: process.env.PG_PASSWORD ?? '',
  mjCoreSchema: '__mj',
  dbPlatform: 'postgresql',
};

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEVELOPER_ROLE_ID = '00000000-0000-0000-0000-000000000002';
const USER_ROLE_ID = '00000000-0000-0000-0000-000000000003';

async function seedSystemUser() {
  // Direct pg.Pool — independent of the provider we're testing
  const pool = new pg.Pool({
    host: DB_CONFIG.dbHost, port: DB_CONFIG.dbPort,
    user: DB_CONFIG.dbUsername, password: DB_CONFIG.dbPassword,
    database: DB_CONFIG.dbDatabase, max: 1,
  });
  try {
    // Reuse an existing Developer role if one exists (migrations seed roles).
    const existing = await pool.query(`SELECT "ID" FROM __mj."Role" WHERE "Name" = 'Developer' LIMIT 1`);
    const roleId = existing.rows.length > 0 ? existing.rows[0].ID : DEVELOPER_ROLE_ID;
    if (existing.rows.length === 0) {
      await pool.query(`
        INSERT INTO __mj."Role" ("ID", "Name", "Description")
        VALUES ($1, 'Developer', 'Full developer access')
      `, [roleId]);
    }

    await pool.query(`
      INSERT INTO __mj."User" ("ID", "Name", "Email", "Type", "IsActive", "LinkedRecordType")
      VALUES ($1, 'System', 'system@memberjunction.local', 'User', TRUE, 'None')
      ON CONFLICT ("ID") DO UPDATE SET "IsActive" = TRUE;
    `, [SYSTEM_USER_ID]);

    // UserRole: idempotent via existence check (no unique key on UserID+RoleID by default)
    const existingUR = await pool.query(
      `SELECT "ID" FROM __mj."UserRole" WHERE "UserID" = $1 AND "RoleID" = $2 LIMIT 1`,
      [SYSTEM_USER_ID, roleId]
    );
    if (existingUR.rows.length === 0) {
      await pool.query(`
        INSERT INTO __mj."UserRole" ("ID", "UserID", "RoleID")
        VALUES ($1, $2, $3)
      `, [USER_ROLE_ID, SYSTEM_USER_ID, roleId]);
    }
    console.log(`Seed: System user (${SYSTEM_USER_ID}) + Developer role (${roleId}) linked.`);
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('=== B2 Validation: MetadataSync PostgreSQL initialization ===\n');

  let passed = 0, failed = 0;
  const report = (label, ok, detail = '') => {
    console.log(`  ${ok ? 'OK' : 'FAIL'}: ${label}${detail ? ' — ' + detail : ''}`);
    ok ? passed++ : failed++;
  };

  try {
    console.log('[setup] Seeding System user...');
    await seedSystemUser();
    console.log('');

    console.log('[1] initializeProvider with dbPlatform=postgresql');
    const provider = await initializeProvider(DB_CONFIG);
    report('provider returned', !!provider, provider?.constructor?.name ?? 'null');

    console.log('\n[2] getDataProvider() returns same instance');
    const p2 = getDataProvider();
    report('identity match', p2 === provider);

    console.log('\n[3] UserCache populated from vwUsers/vwUserRoles');
    let sysUser = null;
    try {
      sysUser = getSystemUser();
      report('System user resolved', !!sysUser, sysUser?.ID);
      report('System user has Developer role', sysUser?.UserRoles?.some(r => r.Role?.trim().toLowerCase() === 'developer') ?? false);
    } catch (err) {
      report('System user resolved', false, err.message);
    }

    console.log('\n[4] Transaction lifecycle — BeginTransaction / CommitTransaction');
    try {
      await provider.BeginTransaction();
      await provider.CommitTransaction();
      report('begin+commit', true);
    } catch (err) {
      report('begin+commit', false, err.message);
    }

    console.log('\n[5] Transaction lifecycle — BeginTransaction / RollbackTransaction');
    try {
      await provider.BeginTransaction();
      await provider.RollbackTransaction();
      report('begin+rollback', true);
    } catch (err) {
      report('begin+rollback', false, err.message);
    }

    console.log('\n[6] cleanupProvider closes pool without error');
    try {
      await cleanupProvider();
      report('cleanup', true);
    } catch (err) {
      report('cleanup', false, err.message);
    }

    console.log(`\n=== ${passed} passed, ${failed} failed ===`);
    process.exit(failed === 0 ? 0 : 1);
  } catch (err) {
    console.error('Fatal:', err);
    try { await cleanupProvider(); } catch { /* ignore */ }
    process.exit(1);
  }
}

main();
