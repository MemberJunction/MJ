/**
 * One-shot DB bring-up for the regression test stack:
 *
 *   1. CREATE DATABASE if it doesn't already exist
 *   2. Install the AssociationDB demo schema + data (split on GO, exec via mssql)
 *   3. Verify the install by counting Member rows (skippable)
 *
 * This script consolidates what was previously two scripts (db-create.cjs +
 * install-association-db.cjs) since both entrypoints (db-setup, form-gen)
 * always invoke them in this order.
 *
 * We use the mssql driver — not sqlcmd — because mssql-tools18 has cursor
 * issues on this build of the demo SQL.
 *
 * Environment flags (used by form-gen-entrypoint.sh, which only needs the
 * schema and doesn't care about row counts):
 *   SKIP_VERIFY=true            — skip the AssociationDemo.Member row count check
 *   FORCE_FAIL_THRESHOLD=disabled — accept >50% batch errors instead of fatal-exiting
 */

const fs = require('fs');
const { sql, connect } = require('./lib/db.cjs');

const SQL_PATH = '/app/Demos/AssociationDB/tmp/combined_build.sql';

async function createDatabase() {
    const pool = await connect({ withDatabase: false });
    try {
        const db = process.env.DB_DATABASE || 'MemberJunction_Test';
        const r = await pool.request()
            .input('name', sql.NVarChar, db)
            .query('SELECT COUNT(*) AS c FROM sys.databases WHERE name = @name');
        if (r.recordset[0].c === 0) {
            await pool.query(`CREATE DATABASE [${db}]`);
            console.log(`  Created database: ${db}`);
        } else {
            console.log(`  Database already exists: ${db}`);
        }
    } finally {
        await pool.close().catch(() => {});
    }
}

async function installAssociationDb() {
    const pool = await connect();
    try {
        const rawSql = fs.readFileSync(SQL_PATH, 'utf8');
        // Split on GO lines (case-insensitive, standalone on a line)
        const batches = rawSql.split(/^\s*GO\s*$/gim).filter(b => b.trim().length > 0);
        console.log(`  Executing ${batches.length} SQL batches...`);

        let executed = 0;
        let errors = 0;
        for (const batch of batches) {
            try {
                await pool.request().query(batch);
                executed++;
            } catch (e) {
                errors++;
                if (errors <= 5) {
                    console.error(`  Batch error #${errors}: ${e.message.substring(0, 200)}`);
                }
            }
        }

        console.log(`  Executed: ${executed}/${batches.length} batches (${errors} errors)`);

        if (process.env.FORCE_FAIL_THRESHOLD !== 'disabled' && errors > batches.length / 2) {
            throw new Error('Too many batch errors');
        }

        if (process.env.SKIP_VERIFY !== 'true') {
            const r = await pool.query('SELECT COUNT(*) AS c FROM AssociationDemo.Member');
            console.log(`  ✓ AssociationDB installed: ${r.recordset[0].c} members`);
        }
    } finally {
        await pool.close().catch(() => {});
    }
}

(async () => {
    await createDatabase();
    await installAssociationDb();
})().catch(e => {
    console.error('  FATAL:', e.message);
    process.exit(1);
});
