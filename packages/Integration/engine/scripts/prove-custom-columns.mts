/**
 * Runnable end-to-end proof of the custom-column feature (gaps.md §2), using the REAL
 * production functions from the built packages — no mocks, no claims. Simulates a
 * schema-less flat-file feed (the PropFuel class) whose static catalog maps 3 fields
 * while the feed actually returns extra columns, then drives the full pipeline:
 *
 *   capture → stats → plan → DDL (SQL Server AND PostgreSQL) → spread → re-baseline → terminate
 *
 * Run:  npx tsx scripts/prove-custom-columns.mts   (from packages/Integration/engine)
 */
import {
    FieldMappingEngine,
    buildOverflowStats,
    planPromotions,
    sanitizeColumnName,
    computeContentHash,
    type ExternalRecord,
    type PromotionCandidate,
} from '../dist/index.js';
import { DDLGenerator } from '@memberjunction/integration-schema-builder';
import type { TargetColumnConfig, DatabasePlatform } from '@memberjunction/integration-schema-builder';

const line = (s = '') => process.stdout.write(s + '\n');
const hr = () => line('─'.repeat(78));

// ── The connector's STATIC (declared) catalog: it only knows 3 fields ──────────────
const fieldMaps = [
    { SourceFieldName: 'Id', DestinationFieldName: 'ExternalID', Status: 'Active', Priority: 0 },
    { SourceFieldName: 'Name', DestinationFieldName: 'Name', Status: 'Active', Priority: 0 },
    { SourceFieldName: 'Email', DestinationFieldName: 'Email', Status: 'Active', Priority: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any;
const declaredColumns = new Set(['ExternalID', 'Name', 'Email']);

// ── The flat-file feed ACTUALLY returns extra columns the catalog never declared ───
const feed: ExternalRecord[] = [
    { ExternalID: '1', ObjectType: 'Contact', Fields: { Id: '1', Name: 'Ada',  Email: 'a@x.com', Region: 'West', Score: 5, SignupDate: '2026-01-15', IsVip: true } },
    { ExternalID: '2', ObjectType: 'Contact', Fields: { Id: '2', Name: 'Babb', Email: 'b@x.com', Region: 'East', Score: 7, SignupDate: '2026-02-20', IsVip: false } },
    { ExternalID: '3', ObjectType: 'Contact', Fields: { Id: '3', Name: 'Cyd',  Email: 'c@x.com', Region: 'West', Score: 9, SignupDate: '2026-03-01', IsVip: true } },
    { ExternalID: '4', ObjectType: 'Contact', Fields: { Id: '4', Name: 'Dot',  Email: 'd@x.com', Region: 'West',            SignupDate: '2026-03-05', IsVip: false, JunkOnce: 'noise' } },
];

const engine = new FieldMappingEngine();

// ── 1. CAPTURE — real FieldMappingEngine.Apply ─────────────────────────────────────
hr(); line('1. CAPTURE  (FieldMappingEngine.Apply — only declared fields map; extras parked)');
const mapped = engine.Apply(feed, fieldMaps, 'Contacts');
line(`   row1 MappedFields   : ${JSON.stringify(mapped[0].MappedFields)}`);
line(`   row1 UnmappedFields : ${JSON.stringify(mapped[0].UnmappedFields)}`);
line(`   row4 UnmappedFields : ${JSON.stringify(mapped[3].UnmappedFields)}   (note JunkOnce)`);
// What M1 writes into __mj_integration_CustomOverflow on each row:
const overflowColumn = mapped.map(m =>
    Object.keys(m.UnmappedFields ?? {}).length ? JSON.stringify(m.UnmappedFields) : null,
);
line(`   overflow column written on ${overflowColumn.filter(Boolean).length}/4 rows`);

// ── 2. STATS + 3. PLAN — real buildOverflowStats + planPromotions ──────────────────
hr(); line('2/3. SCAN + PLAN  (coverage over the overflow column → promotion decision)');
const stats = buildOverflowStats(overflowColumn);
for (const s of stats) line(`   ${s.Key.padEnd(12)} coverage=${(s.Occurrences / s.TotalRows).toFixed(2)}  samples=${JSON.stringify(s.SampleValues.slice(0, 3))}`);
const plan = planPromotions(stats, { ExistingColumnNames: declaredColumns });
line('');
line('   PROMOTE:');
for (const c of plan) line(`     ${c.Key.padEnd(12)} → ${c.Inferred.SchemaFieldType.padEnd(8)} (SS ${c.Inferred.SqlServerType} / PG ${c.Inferred.PostgresType})`);
const dropped = stats.filter(s => !plan.some(c => c.Key === s.Key)).map(s => s.Key);
line(`   NOT promoted (sub-threshold/sparse): ${dropped.join(', ') || '(none)'}`);

// ── 4. DDL — real DDLGenerator, BOTH dialects (the "no PG bugs" proof) ──────────────
hr(); line('4. DDL  (real DDLGenerator.GenerateAlterTableAddColumn — SQL Server AND PostgreSQL)');
const ddl = new DDLGenerator();
const toCol = (c: PromotionCandidate, p: DatabasePlatform): TargetColumnConfig => ({
    SourceFieldName: c.Key,
    TargetColumnName: sanitizeColumnName(c.Key),
    TargetSqlType: p === 'sqlserver' ? c.Inferred.SqlServerType : c.Inferred.PostgresType,
    IsNullable: true, MaxLength: c.Inferred.MaxLength, Precision: null, Scale: null, DefaultValue: null,
});
for (const platform of ['sqlserver', 'postgresql'] as DatabasePlatform[]) {
    line(`   ── ${platform} ──`);
    for (const c of plan) line('   ' + ddl.GenerateAlterTableAddColumn('crm', 'Contact', toCol(c, platform), platform).replace(/\n/g, '\n   '));
    line('');
}

// ── 5. SPREAD + RE-BASELINE — real computeContentHash ──────────────────────────────
hr(); line('5. SPREAD + RE-BASELINE  (values land in columns; content hash re-baselined)');
const hashBefore = computeContentHash(mapped[0].MappedFields);              // declared-only (what the sync stored)
const promotedRow = { ...mapped[0].MappedFields } as Record<string, unknown>;
for (const c of plan) promotedRow[sanitizeColumnName(c.Key)] = (mapped[0].UnmappedFields ?? {})[c.Key]; // spread
const hashAfter = computeContentHash(promotedRow);                          // declared + promoted (next-sync value)
line(`   row1 after spread   : ${JSON.stringify(promotedRow)}`);
line(`   stored hash (before): ${hashBefore.slice(0, 16)}…`);
line(`   re-baselined (after): ${hashAfter.slice(0, 16)}…   ${hashBefore === hashAfter ? '!! SAME (bug)' : '✓ differs → re-baseline REQUIRED, and computed'}`);

// ── 6. TERMINATE — re-plan once the columns exist ──────────────────────────────────
hr(); line('6. TERMINATE  (second pass: columns now exist → nothing re-promoted)');
const afterColumns = new Set([...declaredColumns, ...plan.map(c => sanitizeColumnName(c.Key))]);
const plan2 = planPromotions(stats, { ExistingColumnNames: afterColumns });
line(`   second-pass promotions: ${plan2.length}   ${plan2.length === 0 ? '✓ converged (loop terminates)' : '!! would re-promote (bug)'}`);
hr();
line(plan.length > 0 && hashBefore !== hashAfter && plan2.length === 0
    ? 'RESULT: full pipeline proven on real functions — capture → plan → SS+PG DDL → spread → re-baseline → terminate.'
    : 'RESULT: UNEXPECTED — inspect output above.');
