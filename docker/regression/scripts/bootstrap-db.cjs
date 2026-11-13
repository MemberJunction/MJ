/**
 * Creates the regression test database (DB_DATABASE, default MemberJunction_Test)
 * when it does not exist yet. Used by db-setup-entrypoint.sh and form-gen-entrypoint.sh.
 *
 * The demo data comes later, from the Open Apps' database step (scripts/open-apps.cjs).
 */

const { sql, connect } = require('./lib/db.cjs');

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

createDatabase().catch(e => {
    console.error('  FATAL:', e.message);
    process.exit(1);
});
