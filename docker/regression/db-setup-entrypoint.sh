#!/bin/bash
# Database Setup Entrypoint — One-Shot Init Container
# Runs sequentially: create DB → install AssociationDB → migrate → codegen
# AssociationDB must be installed BEFORE migrations because the repeatable
# migration R__RefreshMetadata.sql regenerates views/procs for ALL entities
# in __mj metadata — including AssociationDB tables from prior runs.
# Exits 0 on success, non-zero on any failure.
set -e

echo ""
echo "  MJ Database Setup"
echo "  ─────────────────────────────────────────"
echo ""

DB_HOST="${DB_HOST:-sqlserver}"
DB_PORT="${DB_PORT:-1433}"
DB_NAME="${DB_DATABASE:-MemberJunction_Test}"
DB_USER="${DB_USERNAME:-sa}"

# ──────────────────────────────────────────────────────────────────────────────
# Step 1: Create the database if it doesn't exist
# ──────────────────────────────────────────────────────────────────────────────
echo "Step 1: Creating database if needed..."
node -e "
const sql = require('mssql');
(async () => {
  const pool = await sql.connect({
    server: '$DB_HOST',
    port: $DB_PORT,
    user: '$DB_USER',
    password: process.env.DB_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true }
  });
  const db = '$DB_NAME';
  const r = await pool.query(\`SELECT COUNT(*) as c FROM sys.databases WHERE name = '\${db}'\`);
  if (r.recordset[0].c === 0) {
    await pool.query(\`CREATE DATABASE [\${db}]\`);
    console.log('  Created database: ' + db);
  } else {
    console.log('  Database already exists: ' + db);
  }
  await pool.close();
})().catch(e => { console.error('  FATAL: Database creation failed:', e.message); process.exit(1); });
"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# Step 2: Install AssociationDB demo data (schema + data)
# Must run BEFORE migrations because R__RefreshMetadata.sql (repeatable migration)
# regenerates views/procs for all entities in __mj metadata. On a reused database,
# metadata from a prior run references AssociationDB tables — if those tables
# don't exist yet, the migration fails with "Invalid object name".
# ──────────────────────────────────────────────────────────────────────────────
echo "Step 2: Installing AssociationDB demo data..."
# Use Node.js mssql driver instead of sqlcmd to avoid mssql-tools18 cursor issues.
# Split the combined SQL on GO batch separators and execute each batch sequentially.
node -e "
const sql = require('mssql');
const fs = require('fs');
(async () => {
  const pool = await sql.connect({
    server: '$DB_HOST',
    port: $DB_PORT,
    database: '$DB_NAME',
    user: '$DB_USER',
    password: process.env.DB_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
    requestTimeout: 120000
  });

  const rawSql = fs.readFileSync('/app/Demos/AssociationDB/tmp/combined_build.sql', 'utf8');
  // Split on GO lines (case-insensitive, standalone on a line)
  const batches = rawSql.split(/^\s*GO\s*$/gim).filter(b => b.trim().length > 0);
  console.log('  Executing ' + batches.length + ' SQL batches...');

  let executed = 0;
  let errors = 0;
  for (const batch of batches) {
    try {
      await pool.request().query(batch);
      executed++;
    } catch (e) {
      errors++;
      if (errors <= 5) {
        console.error('  Batch error #' + errors + ': ' + e.message.substring(0, 200));
      }
    }
  }

  console.log('  Executed: ' + executed + '/' + batches.length + ' batches (' + errors + ' errors)');
  await pool.close();
  if (errors > batches.length / 2) {
    console.error('  FATAL: Too many batch errors');
    process.exit(1);
  }
})().catch(e => { console.error('  FATAL: ' + e.message); process.exit(1); });
"

# Verify AssociationDB was installed
node -e "
const sql = require('mssql');
(async () => {
  const pool = await sql.connect({
    server: '$DB_HOST',
    port: $DB_PORT,
    database: '$DB_NAME',
    user: '$DB_USER',
    password: process.env.DB_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true }
  });
  const r = await pool.query(\"SELECT COUNT(*) as c FROM AssociationDemo.Member\");
  console.log('  ✓ AssociationDB installed: ' + r.recordset[0].c + ' members');
  await pool.close();
})().catch(e => {
  console.error('  FATAL: AssociationDB verification failed:', e.message);
  console.error('  Check /tmp/associationdb_output.txt for details');
  process.exit(1);
});
"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# Step 3: Run Flyway migrations (MJ core schema)
# ──────────────────────────────────────────────────────────────────────────────
echo "Step 3: Running MJ migrations..."
npx mj migrate
echo "  ✓ Migrations complete"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# Step 4: Run CodeGen (generates entities, views, stored procs for all tables)
# ──────────────────────────────────────────────────────────────────────────────
echo "Step 4: Running CodeGen..."
npx mj codegen
echo "  ✓ CodeGen complete"
echo ""

echo "  ═══════════════════════════════════════════"
echo "  Database setup complete!"
echo "  Database: $DB_NAME"
echo "  Schema: __mj (MJ core) + AssociationDemo (demo data)"
echo "  ═══════════════════════════════════════════"
echo ""
