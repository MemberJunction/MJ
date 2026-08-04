/**
 * Import a .bacpac into the regression SQL Server so MJExplorer can be tested
 * against a real MJ database instead of a built-from-scratch one.
 *
 * Runs inside the db-setup container (which has `sqlpackage` on PATH via the
 * bacpac compose overlay → amd64). Selected by db-setup-entrypoint.sh when
 * BACPAC_FILE is set.
 *
 * Steps:
 *   1. Validate BACPAC_FILE exists.
 *   2. Drop DB_DATABASE if it already exists (SqlPackage Import requires the
 *      target NOT to exist — guards reruns without `down -v`).
 *   3. SqlPackage /Action:Import into DB_DATABASE.
 *   4. If BACPAC_UPGRADE is on (default), guard that the imported DB carries a
 *      flyway_schema_history table — without it, `mj migrate` would mis-baseline
 *      a populated __mj schema. Abort with a clear message if missing.
 *
 * Connection comes from DB_* env (shared with the rest of db-setup). Exit 0 on
 * success, non-zero on any failure (db-setup runs under `set -e`).
 */
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { sql, connect } = require('./lib/db.cjs');

const BACPAC_FILE = process.env.BACPAC_FILE;
const DB_DATABASE = process.env.DB_DATABASE || 'MemberJunction_Test';
const DB_HOST = process.env.DB_HOST || 'sqlserver';
const DB_PORT = process.env.DB_PORT || '1433';
const DB_USERNAME = process.env.DB_USERNAME || 'sa';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const CORE_SCHEMA = process.env.MJ_CORE_SCHEMA || '__mj';
const UPGRADE = (process.env.BACPAC_UPGRADE || 'true').toLowerCase() !== 'false';

function fail(msg) {
    console.error(`  ✗ ${msg}`);
    process.exit(1);
}

async function dropIfExists() {
    const pool = await connect({ withDatabase: false });
    try {
        // Force single-user to evict any sessions, then drop.
        await pool.request().batch(
            `IF DB_ID('${DB_DATABASE}') IS NOT NULL
             BEGIN
                 ALTER DATABASE [${DB_DATABASE}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                 DROP DATABASE [${DB_DATABASE}];
             END`
        );
        console.log(`  ✓ Ensured target database [${DB_DATABASE}] does not pre-exist`);
    } finally {
        await pool.close();
    }
}

function runImport() {
    console.log(`  Importing ${BACPAC_FILE} → ${DB_HOST},${DB_PORT}/${DB_DATABASE} ...`);
    const args = [
        '/Action:Import',
        `/SourceFile:${BACPAC_FILE}`,
        `/TargetServerName:${DB_HOST},${DB_PORT}`,
        `/TargetDatabaseName:${DB_DATABASE}`,
        `/TargetUser:${DB_USERNAME}`,
        `/TargetPassword:${DB_PASSWORD}`,
        '/TargetTrustServerCertificate:True',
    ];
    const res = spawnSync('sqlpackage', args, { stdio: 'inherit' });
    if (res.error) fail(`Failed to launch sqlpackage: ${res.error.message}`);
    if (res.status !== 0) fail(`sqlpackage Import exited with code ${res.status}`);
    console.log('  ✓ Bacpac import complete');
}

async function guardMigrationHistory() {
    const pool = await connect();
    try {
        const r = await pool.request().query(
            `SELECT
                (SELECT COUNT(*) FROM sys.schemas WHERE name = '${CORE_SCHEMA}') AS coreSchema,
                (SELECT COUNT(*) FROM sys.tables WHERE name = 'flyway_schema_history') AS history`
        );
        const { coreSchema, history } = r.recordset[0];
        if (coreSchema > 0 && history === 0) {
            fail(
                `Imported DB has the [${CORE_SCHEMA}] schema but no flyway_schema_history table.\n` +
                `  Upgrading it with 'mj migrate' would mis-baseline a populated schema. Either:\n` +
                `    - re-run with --bacpac-no-upgrade (test the DB as-is, no migrate/codegen), or\n` +
                `    - supply a bacpac exported from a Flyway/Skyway-managed MJ instance (includes history).`
            );
        }
        console.log(`  ✓ Migration history present (safe to upgrade)`);
    } finally {
        await pool.close();
    }
}

async function main() {
    console.log('Importing bacpac...');
    if (!BACPAC_FILE) fail('BACPAC_FILE is not set');
    if (!fs.existsSync(BACPAC_FILE)) fail(`BACPAC_FILE not found: ${BACPAC_FILE}`);

    await dropIfExists();
    runImport();
    if (UPGRADE) {
        await guardMigrationHistory();
    } else {
        console.log('  · Upgrade disabled (BACPAC_UPGRADE=false) — skipping migrate/codegen downstream');
    }
}

main().catch((err) => fail(err.message ?? String(err)));
