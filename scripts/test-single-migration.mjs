import pg from 'pg';
import { readFileSync } from 'fs';

const file = process.argv[2];
if (!file) { console.log('Usage: node test-single-migration.mjs <file>'); process.exit(1); }

const pool = new pg.Pool({
  host: process.env.PG_HOST ?? 'localhost',
  port: parseInt(process.env.PG_PORT ?? '5432', 10),
  user: process.env.PG_USERNAME ?? 'postgres',
  password: process.env.PG_PASSWORD ?? '',
  database: process.env.PG_DATABASE ?? 'mj_pg_ci_test',
  max: 1,
});

let sql = readFileSync(file, 'utf-8');
sql = sql.replaceAll('${flyway:defaultSchema}', '__mj');

try {
  await pool.query(sql);
  console.log('SUCCESS');
} catch (e) {
  console.log('FAIL at position ' + e.position + ': ' + e.message.substring(0, 200));
  if (e.position) {
    const pos = parseInt(e.position);
    const context = sql.substring(Math.max(0, pos - 100), pos + 100);
    console.log('\nContext:\n' + context);
  }
}
await pool.end();
