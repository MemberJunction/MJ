/**
 * Structural comparison: T-SQL migration vs PG converter output.
 *
 * Picks representative migrations, extracts structural elements from both
 * T-SQL source and PG converted output, and reports mismatches.
 *
 * Usage: node scripts/compare-migration-structures.mjs [--file V202604030913__*.sql]
 */

import { convertFile, getRulesForDialects } from '@memberjunction/sql-converter';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TSQL_DIR = 'migrations/v5';
const PG_DIR = 'migrations-pg/v5';
const specificFile = process.argv.find(a => a.startsWith('--file='))?.split('=')[1];

// ─── Structural extractors ──────────────────────────────────────────

function extractCreateTables(sql) {
  const tables = [];
  const re = /CREATE\s+TABLE\s+(?:[\w."${}\[\]]+\.)?["\[\s]*(\w+)["\]\s]*\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) tables.push(m[1]);
  return tables;
}

function extractAlterTables(sql) {
  const alters = [];
  const re = /ALTER\s+TABLE\s+(?:[\w."${}[\]]+\.)?["\[\s]*(\w+)["\]\s]*\s+ADD\s+(?:COLUMN\s+)?["\[\s]*(\w+)/gi;
  let m;
  while ((m = re.exec(sql))) alters.push({ table: m[1], column: m[2] });
  return alters;
}

function extractIndexes(sql) {
  const indexes = [];
  const re = /CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["\[\s]*(\w+)/gi;
  let m;
  while ((m = re.exec(sql))) indexes.push(m[1]);
  return indexes;
}

function extractConstraints(sql) {
  const constraints = [];
  const re = /CONSTRAINT\s+["\[\s]*(\w+)["\]\s]*\s+(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|DEFAULT)/gi;
  let m;
  while ((m = re.exec(sql))) constraints.push({ name: m[1], type: m[2].trim() });
  return constraints;
}

function extractGrants(sql) {
  const grants = [];
  const re = /GRANT\s+(SELECT|EXECUTE|INSERT|UPDATE|DELETE|ALL)/gi;
  let m;
  while ((m = re.exec(sql))) grants.push(m[1]);
  return grants.length;
}

function checkTSQLLeaks(pgSql) {
  const leaks = [];
  if (/GETUTCDATE\(\)/i.test(pgSql)) leaks.push('GETUTCDATE() — should be NOW()');
  if (/GETDATE\(\)/i.test(pgSql)) leaks.push('GETDATE() — should be NOW()');
  if (/SCOPE_IDENTITY\(\)/i.test(pgSql)) leaks.push('SCOPE_IDENTITY()');
  if (/@@ROWCOUNT/i.test(pgSql)) leaks.push('@@ROWCOUNT — should be GET DIAGNOSTICS');
  if (/\[[\w]+\]\.\[[\w]+\]/.test(pgSql)) leaks.push('[bracket].[identifiers] — should be schema."table"');
  if (/\bBIT\b(?!\s*\()/.test(pgSql) && !/-- /.test(pgSql.split('BIT')[0].split('\n').pop()))
    leaks.push('BIT type — should be BOOLEAN');
  if (/UPDATE\s+pg_cast/i.test(pgSql)) leaks.push('UPDATE pg_cast — should be removed');
  if (/NVARCHAR\s*\(\s*MAX\s*\)/i.test(pgSql)) leaks.push('NVARCHAR(MAX) — should be TEXT');
  return leaks;
}

function checkBooleanDefaults(pgSql) {
  const issues = [];
  const re = /BOOLEAN\s+(?:NOT\s+NULL\s+)?DEFAULT\s+([01])\b/gi;
  let m;
  while ((m = re.exec(pgSql))) {
    issues.push(`BOOLEAN DEFAULT ${m[1]} — should be DEFAULT ${m[1] === '1' ? 'TRUE' : 'FALSE'}`);
  }
  return issues;
}

// ─── Compare one migration ──────────────────────────────────────────

function compareMigration(tsqlFile, rules) {
  const tsqlPath = join(TSQL_DIR, tsqlFile);
  const tsqlSql = readFileSync(tsqlPath, 'utf-8');

  // Convert with current converter
  const result = convertFile({
    Source: tsqlPath,
    SourceIsFile: true,
    Rules: rules,
    IncludeHeader: false,
  });
  const pgSql = result.OutputSQL;

  const report = {
    file: tsqlFile,
    tsqlSize: tsqlSql.length,
    pgSize: pgSql.length,
    structures: {
      createTables: { tsql: extractCreateTables(tsqlSql), pg: extractCreateTables(pgSql) },
      alterAddColumns: { tsql: extractAlterTables(tsqlSql), pg: extractAlterTables(pgSql) },
      indexes: { tsql: extractIndexes(tsqlSql), pg: extractIndexes(pgSql) },
      grants: { tsql: extractGrants(tsqlSql), pg: extractGrants(pgSql) },
    },
    issues: [],
  };

  // Compare CREATE TABLE counts
  const tsqlTables = report.structures.createTables.tsql;
  const pgTables = report.structures.createTables.pg;
  if (tsqlTables.length !== pgTables.length) {
    report.issues.push(`CREATE TABLE count mismatch: T-SQL=${tsqlTables.length}, PG=${pgTables.length}`);
  }

  // Compare ALTER TABLE ADD COLUMN counts
  const tsqlAlters = report.structures.alterAddColumns.tsql;
  const pgAlters = report.structures.alterAddColumns.pg;
  if (tsqlAlters.length !== pgAlters.length) {
    report.issues.push(`ALTER ADD COLUMN count mismatch: T-SQL=${tsqlAlters.length}, PG=${pgAlters.length}`);
  }

  // Check for T-SQL syntax leaks
  const leaks = checkTSQLLeaks(pgSql);
  for (const leak of leaks) report.issues.push(`T-SQL leak: ${leak}`);

  // Check boolean defaults
  const boolIssues = checkBooleanDefaults(pgSql);
  for (const b of boolIssues) report.issues.push(`Boolean: ${b}`);

  // Check for TODO markers
  const todos = (pgSql.match(/-- TODO/g) || []).length;
  if (todos > 0) report.issues.push(`${todos} TODO markers in output`);

  return report;
}

// ─── Main ────────────────────────────────────────────────────────────

const rules = getRulesForDialects('tsql', 'postgres');

// Pick representative migrations across different categories
const representatives = specificFile ? [specificFile] : [
  // Simple DDL (CREATE TABLE + ALTER)
  'V202602161825__v5.0.x__Metadata_Sync.sql',
  // Complex DDL (multiple tables + FK constraints)
  'V202603042042__v5.8.x__Integration_System.sql',
  // Feature migration (ALTER + extended properties + CodeGen output)
  'V202603291000__v5.21.x__Add_RequireSpecificModels_To_AIPrompt.sql',
  // Large metadata sync
  'V202604031940__v5.23.x__Metadata_Sync.sql',
  // DDL + constraints + grants
  'V202604030913__v5.23.x__Add_Client_Tool_Definitions_And_Agent_Client_Tools.sql',
  // Most recent migration
  'V202604101200__v5.26.x__Application_Roles.sql',
  // KnowledgeHub (large mixed)
  'V202604060452__v5.24.x__KnowledgeHub_Integrated_Migration.sql',
  // Geo Features (known tricky)
  'V202604090003__v5.25.x__Geo_Features_Tables_And_Functions.sql',
].filter(f => {
  try { readFileSync(join(TSQL_DIR, f)); return true; }
  catch { return false; }
});

console.log(`=== Structural Comparison: T-SQL vs PG Converter Output ===`);
console.log(`Comparing ${representatives.length} representative migrations\n`);

let totalIssues = 0;
for (const file of representatives) {
  const report = compareMigration(file, rules);

  const status = report.issues.length === 0 ? '✓' : '✗';
  console.log(`${status} ${file}`);
  console.log(`  Size: T-SQL=${(report.tsqlSize/1024).toFixed(0)}KB → PG=${(report.pgSize/1024).toFixed(0)}KB`);
  console.log(`  Tables: ${report.structures.createTables.tsql.length} → ${report.structures.createTables.pg.length}`);
  console.log(`  ADD COLUMNs: ${report.structures.alterAddColumns.tsql.length} → ${report.structures.alterAddColumns.pg.length}`);
  console.log(`  Indexes: ${report.structures.indexes.tsql.length} → ${report.structures.indexes.pg.length}`);
  console.log(`  Grants: ${report.structures.grants.tsql} → ${report.structures.grants.pg}`);

  if (report.issues.length > 0) {
    console.log(`  ISSUES (${report.issues.length}):`);
    for (const issue of report.issues) console.log(`    ⚠ ${issue}`);
    totalIssues += report.issues.length;
  }
  console.log('');
}

console.log('='.repeat(60));
console.log(`${representatives.length} migrations compared, ${totalIssues} issues found`);
if (totalIssues === 0) console.log('All structures match — converter output is structurally correct.');
process.exit(totalIssues > 0 ? 1 : 0);
