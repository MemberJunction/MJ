// Ad-hoc SQL query runner for dupe-detection debugging.
// Reads DB creds from the repo-root .env (no secrets in this file).
// Usage (from repo root): node packages/AI/Vectors/Dupe/scripts/q.cjs "SELECT ..."
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  // This file lives at packages/AI/Vectors/Dupe/scripts/ — repo root is five levels up.
  const envPath = path.resolve(__dirname, '../../../../../.env');
  const txt = fs.readFileSync(envPath, 'utf8');
  const get = (k) => {
    const m = txt.match(new RegExp('^' + k + '\\s*=\\s*(.+)$', 'm'));
    if (!m) return undefined;
    return m[1].trim().replace(/^['"]|['"]$/g, '');
  };
  return {
    host: get('DB_HOST'),
    port: parseInt(get('DB_PORT'), 10),
    user: get('DB_USERNAME'),
    password: get('DB_PASSWORD'),
    database: get('DB_DATABASE'),
  };
}

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Provide a SQL query as arg.');
    process.exit(1);
  }
  const e = loadEnv();
  const pool = await sql.connect({
    server: e.host,
    port: e.port,
    user: e.user,
    password: e.password,
    database: e.database,
    options: { trustServerCertificate: true, encrypt: false },
    requestTimeout: 120000,
  });
  const result = await pool.request().query(query);
  for (const rs of result.recordsets) {
    console.log(JSON.stringify(rs, null, 2));
    console.log('--- rows: ' + rs.length + ' ---');
  }
  await pool.close();
}
main().catch((err) => { console.error(err); process.exit(1); });
