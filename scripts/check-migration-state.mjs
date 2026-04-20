/**
 * Compare migration history on SQL Server (MemberJunction) and PostgreSQL (mj_pg_codegen_test).
 * Non-destructive: just reads the skyway/flyway history tables.
 */

import sql from 'mssql';
import pg from 'pg';
import { readFileSync } from 'node:fs';

// Load env from mj-testing/fresh-install (current working creds) — not this repo's stale .env
const ENV_PATH = 'C:/Dev/mj-testing/fresh-install/.env';
const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).replace(/\r$/, '').replace(/^["']|["']$/g, '').trim()] : null;
    })
    .filter(Boolean)
);

const TARGET_PREFIXES = ['V202603131600', 'V202603131700', 'V202603131800', 'V202603151919'];

async function checkSQLServer() {
  console.log('\n=== SQL Server: MemberJunction ===');
  const pool = new sql.ConnectionPool({
    server: env.DB_HOST, port: parseInt(env.DB_PORT, 10), database: env.DB_DATABASE,
    user: env.CODEGEN_DB_USERNAME ?? env.DB_USERNAME,
    password: env.CODEGEN_DB_PASSWORD ?? env.DB_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
  });
  await pool.connect();
  try {
    const table = await pool.request().query(
      `SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME IN ('flyway_schema_history','skyway_schema_history')`
    );
    if (!table.recordset.length) {
      console.log('  No schema_history table found.');
      return;
    }
    const { TABLE_SCHEMA, TABLE_NAME } = table.recordset[0];
    console.log(`  History table: [${TABLE_SCHEMA}].[${TABLE_NAME}]`);

    const result = await pool.request().query(
      `SELECT TOP 5 version, description, script, success, installed_on
       FROM [${TABLE_SCHEMA}].[${TABLE_NAME}]
       ORDER BY installed_rank DESC`
    );
    console.log('  Most recent migrations:');
    for (const r of result.recordset) {
      console.log(`    ${r.success ? 'OK' : 'FAIL'} | ${r.version} | ${r.description}`);
    }

    // Check for the migrations of interest
    console.log('\n  Looking for migrations #37/#38/#39/#40:');
    for (const prefix of TARGET_PREFIXES) {
      const found = await pool.request().query(
        `SELECT success, description FROM [${TABLE_SCHEMA}].[${TABLE_NAME}] WHERE script LIKE '%${prefix}%'`
      );
      if (found.recordset.length) {
        const r = found.recordset[0];
        console.log(`    ${prefix}: ${r.success ? 'APPLIED OK' : 'FAILED'} — ${r.description}`);
      } else {
        console.log(`    ${prefix}: NOT YET APPLIED`);
      }
    }

    // Verify the actual data from migration #1600 and #1800 landed (sequence 100048 rows)
    console.log('\n  Checking if both Sequence 100048 rows exist:');
    const dataCheck = await pool.request().query(
      `SELECT ID, Name, Sequence FROM [__mj].[EntityField]
       WHERE EntityID = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND Sequence = 100048`
    );
    if (dataCheck.recordset.length === 0) {
      console.log('    No rows at Sequence 100048 (migrations not applied yet)');
    } else {
      for (const r of dataCheck.recordset) {
        console.log(`    ${r.ID} | Sequence=${r.Sequence} | Name=${r.Name}`);
      }
    }
  } finally {
    await pool.close();
  }
}

async function checkPG() {
  console.log('\n=== PostgreSQL: mj_pg_codegen_test ===');
  const pool = new pg.Pool({
    host: 'localhost', port: 5432, database: 'mj_pg_codegen_test',
    user: 'postgres', password: 'z2qXgNvvstcc', max: 1,
  });
  try {
    // Find any history table
    const tblResult = await pool.query(
      `SELECT table_schema, table_name FROM information_schema.tables
       WHERE table_name IN ('flyway_schema_history','skyway_schema_history')`
    );
    if (tblResult.rows.length === 0) {
      console.log('  No schema_history table found.');
    } else {
      const { table_schema, table_name } = tblResult.rows[0];
      console.log(`  History table: "${table_schema}"."${table_name}"`);
      const result = await pool.query(
        `SELECT version, description, script, success, installed_on
         FROM "${table_schema}"."${table_name}"
         ORDER BY installed_rank DESC LIMIT 5`
      );
      console.log('  Most recent migrations:');
      for (const r of result.rows) {
        console.log(`    ${r.success ? 'OK' : 'FAIL'} | ${r.version} | ${r.description}`);
      }
    }

    // Check whether the two Sequence 100048 rows exist (regardless of how they got there)
    console.log('\n  Checking if both Sequence 100048 rows exist:');
    const dataCheck = await pool.query(
      `SELECT "ID", "Name", "Sequence" FROM __mj."EntityField"
       WHERE "EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Sequence" = 100048`
    );
    if (dataCheck.rows.length === 0) {
      console.log('    No rows at Sequence 100048');
    } else {
      for (const r of dataCheck.rows) {
        console.log(`    ${r.ID} | Sequence=${r.Sequence} | Name=${r.Name}`);
      }
    }

    // Also count total EntityField rows to understand partial state
    const countResult = await pool.query(`SELECT COUNT(*) AS c FROM __mj."EntityField"`);
    console.log(`\n  Total EntityField rows: ${countResult.rows[0].c}`);
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('=== Migration state comparison: SQL Server vs PostgreSQL ===');
  console.log(`Target migrations: ${TARGET_PREFIXES.join(', ')}`);
  try {
    await checkSQLServer();
  } catch (err) {
    console.log('\nSQL Server check failed:', err.message);
  }
  try {
    await checkPG();
  } catch (err) {
    console.log('\nPG check failed:', err.message);
  }
}

main();
