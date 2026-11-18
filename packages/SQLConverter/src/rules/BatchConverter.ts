/**
 * BatchConverter -- the main orchestrator for the rule-based conversion pipeline.
 *
 * Converts SQL files between dialects using a pluggable, rule-based approach.
 * Header generation is delegated to DialectHeaderBuilder implementations so
 * each target dialect can provide its own setup preamble.
 *
 * Pipeline: preprocess -> split -> sub-split -> classify -> convert -> group -> postprocess
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ClassifyBatch, SP_REFRESHVIEW_CALL, DescribeRefreshView } from './StatementClassifier.js';
import { SubSplitCompoundBatch } from './SubSplitter.js';
import { InlineScalarSelectVariables } from './ScalarVariableInliner.js';
import { StripComments } from './ExpressionHelpers.js';
import { PostProcess } from './PostProcessor.js';
import { FindBracketIdentifiersInDollarBlocks } from './ExpressionHelpers.js';
import { GetHeaderBuilder } from './DialectHeaderBuilder.js';
import { CollectTSQLBitColumns, MergeTableColumns } from './BitColumnRegistry.js';
import type { TableColumnRegistry } from './BitColumnRegistry.js';
import type {
  IConversionRule, ConversionContext, ConversionStats,
  OutputGroups, StatementType,
} from './types.js';
import {
  CreateConversionContext, CreateConversionStats, CreateOutputGroups, CONVERSION_GAP_MARKERS, GAP_MARKER_BATCH_ERROR,
  GAP_MARKER_MISSING_SAVES, GAP_MARKER_EXEC_SKIPPED,
} from './types.js';

/** Batch type groupings for ordered output */
const TABLE_TYPES = new Set<StatementType>(['CREATE_TABLE', 'ALTER_TABLE', 'PK_CONSTRAINT', 'CREATE_INDEX', 'DROP_INDEX', 'CONDITIONAL_DDL']);
const FK_TYPES = new Set<StatementType>(['FK_CONSTRAINT', 'CHECK_CONSTRAINT', 'UNIQUE_CONSTRAINT', 'ENABLE_CONSTRAINT']);
const VIEW_TYPES = new Set<StatementType>(['CREATE_VIEW']);
const FUNC_TYPES = new Set<StatementType>(['CREATE_PROCEDURE', 'CREATE_FUNCTION']);
const TRIGGER_TYPES = new Set<StatementType>(['CREATE_TRIGGER']);
const DATA_TYPES = new Set<StatementType>(['INSERT', 'UPDATE', 'DELETE', 'EXEC_BLOCK', 'DECLARE_DML_BLOCK']);
const GRANT_TYPES = new Set<StatementType>(['GRANT', 'REVOKE']);
const COMMENT_TYPES = new Set<StatementType>(['EXTENDED_PROPERTY']);

/** Configuration for the batch converter */
export interface BatchConverterConfig {
  /** Input SQL file path or raw SQL string */
  Source: string;
  /** Whether Source is a file path (true) or raw SQL string (false) */
  SourceIsFile: boolean;
  /** Output file path (optional) */
  OutputFile?: string;
  /** Conversion rules to apply */
  Rules: IConversionRule[];
  /** Target schema name (default: '__mj') */
  Schema?: string;
  /** Source dialect (default: 'tsql') */
  SourceDialect?: string;
  /** Target dialect (default: 'postgres') */
  TargetDialect?: string;
  /** Progress callback */
  OnProgress?: (message: string) => void;
  /** Include PG header with extensions, schema, and implicit cast */
  IncludeHeader?: boolean;
  /** Enable post-processing pass (default: true) */
  EnablePostProcess?: boolean;
  /**
   * Run-wide column registry (#5016). When given, its columns seed this file's conversion context
   * (so a view comparing a boolean column of a table created by an earlier file converts `= 1` to
   * `= TRUE`), and this file's own tables and BIT columns are added to it afterwards for the files
   * that follow. Build it with {@link CollectTSQLBitColumns} from the latest baseline.
   */
  TableColumns?: TableColumnRegistry;
}

/** Result of batch conversion */
export interface BatchConverterResult {
  Stats: ConversionStats;
  OutputSQL: string;
  OutputFile?: string;
}

/**
 * Convert a SQL Server file to PostgreSQL using the rule-based pipeline.
 */
export function ConvertFile(config: BatchConverterConfig): BatchConverterResult {
  const log = config.OnProgress ?? (() => {});
  const schema = config.Schema ?? '__mj';
  const sourceDialect = config.SourceDialect ?? 'tsql';
  const targetDialect = config.TargetDialect ?? 'postgres';
  const includeHeader = config.IncludeHeader ?? true;
  const enablePostProcess = config.EnablePostProcess ?? true;

  const stats = CreateConversionStats();
  const context = CreateConversionContext(sourceDialect, targetDialect, schema);
  const groups = CreateOutputGroups();

  // Read source
  log('Reading source SQL...');
  const rawSQL = config.SourceIsFile
    ? readFileSync(config.Source, 'utf-8')
    : config.Source;
  log(`  File size: ${rawSQL.length.toLocaleString()} bytes, ${rawSQL.split('\n').length.toLocaleString()} lines`);

  // Seed the context with the run's columns and this file's own BIT columns (CREATE TABLE and
  // ALTER TABLE … ADD), so a statement earlier in the file than the ALTER, or a later file, sees them.
  if (config.TableColumns) MergeTableColumns(context.TableColumns, config.TableColumns);
  CollectTSQLBitColumns(rawSQL, context.TableColumns);

  // Detect DDL changes (ALTER TABLE, CREATE TABLE) — used by ViewRule to decide
  // whether DROP CASCADE is needed (column lists may change) or just CREATE OR REPLACE
  context.HasDDLChanges = /\b(ALTER\s+TABLE|CREATE\s+TABLE)\b/i.test(rawSQL);

  // Preprocess: replace Flyway placeholders
  log('Pre-processing (Flyway placeholders)...');
  const processedSQL = preprocess(rawSQL, schema);

  // Split into batches on GO
  log('Splitting into batches...');
  const rawBatches = splitOnGo(processedSQL);

  // Sub-split compound batches
  const batches: string[] = [];
  for (const batch of rawBatches) {
    // Inline mid-batch `DECLARE @X = (SELECT ...)` variables first: sub-splitting separates the
    // declaration from the statements that read it (issue #5364 item 4).
    batches.push(...SubSplitCompoundBatch(InlineScalarSelectVariables(batch)));
  }
  stats.TotalBatches = batches.length;
  log(`  Found ${stats.TotalBatches.toLocaleString()} batches`);

  // Classify and log distribution
  const classifications = new Map<string, number>();
  for (const batch of batches) {
    const bt = ClassifyBatch(batch);
    classifications.set(bt, (classifications.get(bt) ?? 0) + 1);
  }
  log('  Batch classification:');
  for (const [bt, count] of [...classifications.entries()].sort()) {
    log(`    ${bt}: ${count}`);
  }

  // Sort rules by priority
  const sortedRules = [...config.Rules].sort((a, b) => a.Priority - b.Priority);

  // Convert each batch
  log('Converting batches...');
  let lastPct = -1;
  // Tables an earlier batch deletes rows from, for keeping a later unique index after the delete.
  const deletedFrom = new Set<string>();

  for (let i = 0; i < batches.length; i++) {
    const pct = Math.floor(((i + 1) * 100) / stats.TotalBatches);
    if (pct !== lastPct && pct % 10 === 0) {
      log(`  Progress: ${pct}% (${i + 1}/${stats.TotalBatches})`);
      lastPct = pct;
    }

    const batch = batches[i];
    const batchType = ClassifyBatch(batch);

    try {
      const result = convertBatch(batch, batchType, sortedRules, context, stats);
      if (result !== null) {
        if (createsUniqueIndexOnDeletedTable(result, deletedFrom)) {
          groups.Data.push(result);
        } else {
          routeToGroup(result, batchType, groups, batch);
        }
        for (const table of deletedTables(result)) deletedFrom.add(table);
        stats.Converted++;
      }
    } catch (err) {
      stats.Errors++;
      const errMsg = err instanceof Error ? err.message : String(err);
      stats.ErrorBatches.push(`Error in batch ${i + 1} (${batchType}): ${errMsg.slice(0, 100)}`);
      groups.Other.push(`\n${GAP_MARKER_BATCH_ERROR} ${i + 1} (${batchType}): ${errMsg.slice(0, 100)}\n`);
      groups.Other.push(`-- Original (first 200 chars): ${batch.slice(0, 200)}\n\n`);
    }
  }

  // Hand this file's columns to the files that follow in the run.
  if (config.TableColumns) MergeTableColumns(config.TableColumns, context.TableColumns);

  // Inject hand-written PG blocks for complex migration patterns
  // (cursor + dynamic SQL + temp procedures that can't be auto-converted)
  injectTempProcReplacements(processedSQL, groups);

  // Topologically sort views so dependencies come before dependents.
  // Required because DROP VIEW ... CASCADE can cascade-drop a view that was
  // already created earlier in the file. Sorting ensures we process leaves first.
  if (groups.Views.length > 1) {
    groups.Views = topologicallySortViews(groups.Views, schema);
  }

  // Assemble output in proper order
  log('Assembling output...');
  const outputParts: string[] = [];

  if (includeHeader) {
    const headerBuilder = GetHeaderBuilder(targetDialect);
    if (headerBuilder) {
      outputParts.push(headerBuilder.BuildHeader(schema));
    }
  }

  // Only emit section headers for groups that have content.
  // Sections that come AFTER Data are flagged to receive a preamble flushing
  // pending trigger events. The Data section's INSERT/UPDATE/DELETE statements
  // can fire deferred constraint triggers or accumulate pending row events;
  // a subsequent ALTER TABLE (FK & CHECK Constraints) on the same table then
  // fails with "cannot ALTER TABLE ... because it has pending trigger events".
  // `SET CONSTRAINTS ALL IMMEDIATE;` forces deferred constraint checks to run
  // immediately, which also flushes the queue.
  const flushPreamble = '\n-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.\nSET CONSTRAINTS ALL IMMEDIATE;\n';
  const sections: { header: string; items: string[]; flushBefore?: boolean }[] = [
    { header: 'DDL: Tables, PKs, Indexes', items: groups.Tables },
    { header: 'Helper Functions (fn*)', items: groups.HelperFunctions },
    { header: 'Views', items: groups.Views },
    { header: 'Stored Procedures (sp*)', items: groups.StoredProcedures },
    { header: 'Triggers', items: groups.Triggers },
    { header: 'Data (INSERT/UPDATE/DELETE)', items: groups.Data },
    { header: 'FK & CHECK Constraints', items: groups.FKConstraints, flushBefore: true },
    { header: 'Grants', items: groups.Grants },
    { header: 'Comments', items: groups.Comments },
    { header: 'Other', items: groups.Other },
  ];
  const dataHasContent = groups.Data.length > 0;
  for (const section of sections) {
    if (section.items.length > 0) {
      outputParts.push(`\n-- ===================== ${section.header} =====================\n`);
      if (section.flushBefore && dataHasContent) outputParts.push(flushPreamble);
      outputParts.push(...section.items);
    }
  }

  // Post-process
  log('Post-processing...');
  let fullOutput = outputParts.join('\n');
  if (enablePostProcess) {
    fullOutput = PostProcess(fullOutput);
  }

  // Scan the ASSEMBLED output for gap markers before it is written. Done here rather than
  // at each emission site so a gap from ANY rule — present or future — is counted: rules
  // return their marker as an ordinary string, so nothing else in this pipeline can tell
  // that the batch it just counted as `Converted` is unusable SQL (issue #3857).
  fullOutput = restoreCoreSchemaPlaceholder(fullOutput);
  fullOutput = appendMissingSavesMarker(rawSQL, fullOutput);
  recordOutputGaps(fullOutput, stats);

  // Write output
  if (config.OutputFile) {
    log(`Writing ${config.OutputFile}...`);
    mkdirSync(dirname(config.OutputFile), { recursive: true });
    writeFileSync(config.OutputFile, fullOutput, 'utf-8');
  }

  log(`  Output size: ${fullOutput.length.toLocaleString()} bytes, ${fullOutput.split('\n').length.toLocaleString()} lines`);

  return {
    Stats: stats,
    OutputSQL: fullOutput,
    OutputFile: config.OutputFile,
  };
}

/** @deprecated Use {@link ConvertFile}. */
export function convertFile(config: BatchConverterConfig): BatchConverterResult {
  return ConvertFile(config);
}

/**
 * Record every conversion gap present in the assembled output (see CONVERSION_GAP_MARKERS).
 *
 * A gap is not an error: the rule that hit it returned a comment instead of throwing, so the
 * batch was counted as converted and the file was reported clean. Counting the markers is what
 * makes the file's unusability visible to the caller — and doing it on the finished text keeps
 * it independent of which rule produced the gap.
 */
function recordOutputGaps(output: string, stats: ConversionStats): void {
  for (const line of output.split('\n')) {
    if (!CONVERSION_GAP_MARKERS.some(marker => line.includes(marker))) continue;
    stats.Gaps++;
    stats.GapBatches.push(line.trim().slice(0, 200));
  }
  // A T-SQL bracket identifier left inside a dollar-quoted block carries no marker, but the
  // line cannot run on PostgreSQL either (#6074)
  for (const line of FindBracketIdentifiersInDollarBlocks(output)) {
    stats.Gaps++;
    stats.GapBatches.push(`${GAP_BRACKET_IN_DOLLAR_BLOCK} ${line}`.slice(0, 200));
  }
}

/** The `GapBatches` prefix of a line that kept a T-SQL bracket identifier inside a dollar-quoted block. */
const GAP_BRACKET_IN_DOLLAR_BLOCK = 'T-SQL bracket identifier left in a dollar-quoted block:';

/**
 * Stand-in for an Open App's `${mjSchema}` core-schema placeholder while the rules run (#5543).
 * The placeholder is not an identifier, so a core call `EXEC [${mjSchema}].spUpdateEntityField …`
 * matched none of the classifier's EXEC patterns and was skipped. Word characters only, so it
 * classifies and converts like any schema name; {@link restoreCoreSchemaPlaceholder} puts the
 * placeholder back, and the Open App installer substitutes it at apply time (decision pg.1, A).
 */
export const CORE_SCHEMA_SENTINEL = '__mj_core_schema_placeholder__';

/** Replace Flyway placeholders with target schema, and protect `${mjSchema}` used as a schema qualifier. */
function preprocess(sql: string, schema: string): string {
  return sql
    .replace(/\$\{flyway:defaultSchema\}/g, schema)
    // `[${mjSchema}].x` and `${mjSchema}.x` only: a name BUILT from the placeholder
    // (`[${mjSchema}_BizAppsCommon]`) is not the core schema and keeps its own handling.
    .replace(/\[\$\{mjSchema\}\](?=\s*\.)/g, () => `[${CORE_SCHEMA_SENTINEL}]`)
    .replace(/\$\{mjSchema\}(?=\s*\.)/g, () => CORE_SCHEMA_SENTINEL);
}

/** Put the `${mjSchema}` placeholder back wherever the rules emitted the sentinel. */
function restoreCoreSchemaPlaceholder(sql: string): string {
  return sql
    .replaceAll(`"${CORE_SCHEMA_SENTINEL}"`, () => '${mjSchema}')
    .replaceAll(`[${CORE_SCHEMA_SENTINEL}]`, () => '${mjSchema}')
    .replaceAll(CORE_SCHEMA_SENTINEL, () => '${mjSchema}');
}

/** An mj-sync log announces each save with a `-- Save <entity>…` line above its block. */
const SAVE_MARKER = /^[ \t]*-- Save\b/;

/**
 * The note mj-sync writes under a save that changed no fields. Such a save has no SQL, so it
 * is not expected in the output.
 */
const NO_OP_SAVE_NOTE = 'saved with no field changes; nothing to replay';

/**
 * Compare the saves an mj-sync log announces with the saves present in the output. Any
 * shortfall means saves were lost with no marker of their own (issue #6097, where a
 * post-processing regex deleted 278 of 279 saves and the run still passed), so a gap marker
 * naming the counts is appended for the gap scan to count.
 */
function appendMissingSavesMarker(source: string, output: string): string {
  const sourceLines = source.split('\n');
  const announced =
    sourceLines.filter(line => SAVE_MARKER.test(line)).length -
    sourceLines.filter(line => line.includes(NO_OP_SAVE_NOTE)).length;
  if (announced <= 0) return output;
  const kept = countConvertedSaves(output) + countSkippedExecBlocks(output);
  if (kept >= announced) return output;
  return `${output}\n${GAP_MARKER_MISSING_SAVES}: the source announces ${announced} save(s), the output holds ${kept}\n`;
}

/**
 * Saves the converter kept: a `-- Save` line whose following lines, past blanks and other
 * comments, reach a `DO $mj$` block (ExecBlockRule keeps a block's leading comments above it).
 * Another `-- Save` line first means this one has no block.
 */
function countConvertedSaves(output: string): number {
  const lines = output.split('\n');
  let kept = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!SAVE_MARKER.test(lines[i])) continue;
    let next = i + 1;
    while (next < lines.length && !SAVE_MARKER.test(lines[next]) && isBlankOrComment(lines[next])) next++;
    if (lines[next]?.trim() === 'DO $mj$') kept++;
  }
  return kept;
}

function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('--');
}

function countSkippedExecBlocks(output: string): number {
  return output.split('\n').filter(line => line.startsWith(GAP_MARKER_EXEC_SKIPPED)).length;
}

/** True when `lines` hold only blanks and comments, the last comment being a `-- Save` line. */
function endsWithSaveAnnouncement(lines: string[]): boolean {
  if (!lines.every(isBlankOrComment)) return false;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() !== '') return SAVE_MARKER.test(lines[i]);
  }
  return false;
}

/** Split SQL on GO batch separators */
function splitOnGo(sql: string): string[] {
  const batches: string[] = [];
  const lines = sql.split('\n');
  let currentBatch: string[] = [];

  for (const line of lines) {
    const stripped = line.trim().toUpperCase();
    if (stripped === 'GO' || /^GO\s*(--.*)?$/i.test(stripped)) {
      // Older mj-sync logs put a `GO` between a `-- Save` line and its block. Keep that
      // comment-only batch with the next one, so the save stays above the block it announces.
      if (endsWithSaveAnnouncement(currentBatch)) continue;
      const batch = currentBatch.join('\n').trim();
      if (batch.length > 0) batches.push(batch);
      currentBatch = [];
    } else {
      currentBatch.push(line);
    }
  }

  const lastBatch = currentBatch.join('\n').trim();
  if (lastBatch.length > 0) batches.push(lastBatch);

  return batches;
}

/** Convert a single batch using the matching rules */
function convertBatch(
  batch: string,
  batchType: StatementType,
  rules: IConversionRule[],
  context: ConversionContext,
  stats: ConversionStats,
): string | null {
  // Handle skip types
  if (batchType.startsWith('SKIP')) {
    stats.Skipped++;
    if (!['SKIP_SESSION', 'SKIP_ERROR', 'SKIP_PRINT', 'SKIP_SQLSERVER', 'SKIP_NOCHECK'].includes(batchType)) {
      stats.SkippedBatches.push(`${batchType}: ${batch.slice(0, 80)}...`);
    }
    return null;
  }

  // sp_refreshview: no PostgreSQL equivalent. A named warning, not a gap — the run still passes —
  // and a comment in the output where the call stood (issue #5649).
  if (batchType === 'REFRESH_VIEW') {
    stats.Skipped++;
    const views = [...batch.matchAll(SP_REFRESHVIEW_CALL)].map(m => m[1]);
    const lines = views.map(v => DescribeRefreshView(v));
    stats.Warnings.push(...lines);
    return lines.map(l => `-- WARNING: ${l}`).join('\n') + '\n';
  }

  // Comment-only: pass through
  if (batchType === 'COMMENT_ONLY') {
    stats.Skipped++;
    return batch + '\n';
  }

  // Find matching rules
  const matchingRules = rules.filter(r => r.AppliesTo.includes(batchType));

  if (matchingRules.length === 0) {
    // No rule matches — handle UNKNOWN and other types
    return handleUnknownBatch(batch, batchType, stats);
  }

  let sql = batch;

  // PreProcess phase
  for (const rule of matchingRules) {
    if (rule.PreProcess) {
      sql = rule.PreProcess(sql, context);
    }
  }

  // Find if any rule bypasses sqlglot
  const bypassRule = matchingRules.find(r => r.BypassSqlglot);
  if (bypassRule?.PostProcess) {
    sql = bypassRule.PostProcess(sql, batch, context);
  } else {
    // No bypass — run remaining PostProcess rules
    for (const rule of matchingRules) {
      if (rule.PostProcess && !rule.BypassSqlglot) {
        sql = rule.PostProcess(sql, batch, context);
      }
    }
  }

  // Track created object names for downstream grant filtering
  // Only track if the output is actual SQL (not a skip/comment)
  trackCreatedObject(batch, batchType, sql, context);

  // Update stats
  updateStats(batchType, stats);

  return sql;
}

/** Extract and track the name of a created function/view for downstream grant filtering */
function trackCreatedObject(
  batch: string, batchType: StatementType, convertedSQL: string, context: ConversionContext,
): void {
  // Don't track objects that were skipped during conversion
  if (convertedSQL.startsWith('-- SKIPPED')) return;

  if (batchType === 'CREATE_PROCEDURE' || batchType === 'CREATE_FUNCTION') {
    const match = batch.match(/CREATE\s+(?:PROC(?:EDURE)?|FUNCTION)\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?/i);
    if (match) {
      context.CreatedFunctions.add(match[1]);
    }
  } else if (batchType === 'CREATE_VIEW') {
    const match = batch.match(/CREATE\s+(?:OR\s+ALTER\s+)?VIEW\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?/i);
    if (match) {
      context.CreatedViews.add(match[1]);
    }
  }
}

/** Route converted batch to the appropriate output group */
function routeToGroup(result: string, batchType: StatementType, groups: OutputGroups, originalBatch?: string): void {
  // A guarded block that only touches data (INSERT/UPDATE/DELETE, or a RAISERROR assertion about
  // data) goes to Data, not Tables, so it runs after the DDL and in order with the other data
  // statements — an assertion that a seeded row exists must not run before the seed (issue #5364).
  if (batchType === 'CONDITIONAL_DDL' && originalBatch && isDataOnlyGuard(originalBatch)) {
    groups.Data.push(result);
    return;
  }
  // ALTER TABLE ALTER COLUMN SET NOT NULL must run AFTER backfill UPDATEs,
  // so route to Data group instead of Tables group.
  if (batchType === 'ALTER_TABLE' && /ALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL/i.test(result)) {
    groups.Data.push(result);
    return;
  }
  // ALTER TABLE ALTER COLUMN SET DEFAULT should also go to Data group
  // (often paired with ADD COLUMN NULL + UPDATE + SET NOT NULL + SET DEFAULT)
  if (batchType === 'ALTER_TABLE' && /ALTER\s+COLUMN\s+\S+\s+SET\s+DEFAULT/i.test(result)) {
    groups.Data.push(result);
    return;
  }
  if (TABLE_TYPES.has(batchType)) {
    groups.Tables.push(result);
  } else if (FK_TYPES.has(batchType)) {
    groups.FKConstraints.push(result);
  } else if (VIEW_TYPES.has(batchType)) {
    groups.Views.push(result);
  } else if (FUNC_TYPES.has(batchType)) {
    if (batchType === 'CREATE_FUNCTION') {
      groups.HelperFunctions.push(result);
    } else {
      groups.StoredProcedures.push(result);
    }
  } else if (TRIGGER_TYPES.has(batchType)) {
    groups.Triggers.push(result);
  } else if (DATA_TYPES.has(batchType)) {
    groups.Data.push(result);
  } else if (GRANT_TYPES.has(batchType)) {
    groups.Grants.push(result);
  } else if (COMMENT_TYPES.has(batchType)) {
    groups.Comments.push(result);
  } else {
    groups.Other.push(result);
  }
}

/** `schema.table` → `table`, unquoted and lower-cased, for comparing table references. */
function tableKey(ref: string): string {
  return (ref.split('.').pop() ?? ref).replace(/["[\]]/g, '').toLowerCase();
}

/** The tables a converted batch deletes rows from (`DELETE FROM t …`), as {@link tableKey}s. */
function deletedTables(sql: string): string[] {
  return [...StripComments(sql).matchAll(/\bDELETE\s+FROM\s+([^\s(;]+)/gi)].map(m => tableKey(m[1]));
}

/**
 * True when a converted batch creates a unique index on a table an earlier batch deleted rows
 * from. The output puts DDL before data, which would build the index before the delete that
 * removes the duplicates it forbids (the ListDetail clean-up of v5.48), and the index fails. Such
 * an index goes with the data instead, so it keeps its source order after the delete.
 */
function createsUniqueIndexOnDeletedTable(sql: string, deletedFrom: Set<string>): boolean {
  if (deletedFrom.size === 0) return false;
  const code = StripComments(sql);
  for (const m of code.matchAll(/\bCREATE\s+UNIQUE\s+(?:\w+\s+)?INDEX\b[^;]*?\bON\s+([^\s(;]+)\s*\(/gi)) {
    if (deletedFrom.has(tableKey(m[1]))) return true;
  }
  return false;
}

/** True when a conditional batch's statements are data changes or data assertions, with no DDL. */
function isDataOnlyGuard(batch: string): boolean {
  const code = StripComments(batch);
  if (/\bALTER\s+TABLE\b/i.test(code)) return false;
  if (/\bINSERT\s+INTO\b/i.test(code)) return true;
  return /\b(?:UPDATE|DELETE\s+FROM|RAISERROR)\b/i.test(code) && !/\b(?:CREATE|DROP|ALTER)\s+\w/i.test(code);
}

/** Handle UNKNOWN batch types with basic conversion */
function handleUnknownBatch(batch: string, batchType: StatementType, stats: ConversionStats): string | null {
  const upper = batch.toUpperCase().trim();

  if (!batch.trim()) return null;
  if (upper.startsWith('PRINT')) { stats.Skipped++; return null; }
  if (/^SET\s+NOEXEC\s/i.test(upper)) { stats.Skipped++; return null; }
  if (upper.includes('SYS.') || upper.includes('INFORMATION_SCHEMA')) { stats.Skipped++; return null; }

  // DENY statements — not supported in PG
  if (batchType === 'DENY') {
    stats.Skipped++;
    stats.SkippedBatches.push(`DENY: ${batch.slice(0, 80)}...`);
    return `-- DENY not supported in PG: ${batch.slice(0, 80)}...\n`;
  }

  stats.Skipped++;
  stats.SkippedBatches.push(`UNKNOWN: ${batch.slice(0, 80)}...`);
  return `-- NOTE: unrecognized batch type (${batchType}) — passed through as-is\n${batch};\n`;
}

/** Update conversion statistics */
function updateStats(batchType: StatementType, stats: ConversionStats): void {
  switch (batchType) {
    case 'CREATE_TABLE': stats.TablesCreated++; break;
    case 'CREATE_VIEW': stats.ViewsCreated++; break;
    case 'CREATE_PROCEDURE': stats.ProceduresConverted++; break;
    case 'CREATE_FUNCTION': stats.FunctionsConverted++; break;
    case 'CREATE_TRIGGER': stats.TriggersConverted++; break;
    case 'INSERT': case 'UPDATE': case 'DELETE': case 'EXEC_BLOCK': case 'DECLARE_DML_BLOCK': stats.InsertsConverted++; break;
    case 'GRANT': case 'REVOKE': stats.GrantsConverted++; break;
    case 'FK_CONSTRAINT': stats.FKConstraints++; break;
    case 'CHECK_CONSTRAINT': stats.CheckConstraints++; break;
    case 'CREATE_INDEX': stats.IndexesCreated++; break;
    case 'EXTENDED_PROPERTY': stats.CommentsConverted++; break;
  }
}

/**
 * Detect migrations that use temp procedures with cursors and dynamic SQL
 * (patterns too complex for auto-conversion) and inject hand-written PG
 * DO blocks as replacements.
 *
 * Currently handles:
 *   - Entity name reference fix migration (cursor over temp table doing
 *     REPLACE on JSON columns via dynamic SQL + sp_executesql)
 */
function injectTempProcReplacements(sql: string, groups: OutputGroups): void {
  // Detect: temp procedure doing cursor-based REPLACE on entity name patterns
  const procMatch = sql.match(/CREATE\s+PROCEDURE\s+#(\w+)\s/i);
  if (!procMatch) return;

  const procName = procMatch[1];

  // Extract EXEC calls to this temp procedure: EXEC #ProcName 'schema', 'table', 'column'
  const execRegex = new RegExp(
    `EXEC\\s+#${procName}\\s+'([^']+)'\\s*,\\s*'([^']+)'\\s*,\\s*'([^']+)'`,
    'gi'
  );
  const targets: Array<{ schema: string; table: string; column: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = execRegex.exec(sql)) !== null) {
    targets.push({ schema: m[1], table: m[2], column: m[3] });
  }
  if (targets.length === 0) return;

  // Detect the temp table used by the procedure
  const tempTableMatch = sql.match(/CREATE\s+TABLE\s+#(\w+)/i);
  if (!tempTableMatch) return;
  const tempTable = tempTableMatch[1];

  // Detect JSON key patterns from the procedure body (e.g., "Entity", "EntityName", "entity", "entityName")
  const keyPatterns = extractJsonKeyPatterns(sql);
  if (keyPatterns.length === 0) return;

  // Build the VALUES list for the table/column targets
  const valuesStr = targets
    .map(t => `        ('${t.schema}', '${t.table}', '${t.column}')`)
    .join(',\n');

  // Build the REPLACE blocks for each JSON key pattern
  const replaceBlocks = keyPatterns
    .map(
      (key, idx) => `
            -- Pattern ${idx + 1}: "${key}":"OldName"
            EXECUTE format(
                'UPDATE %I.%I SET %I = REPLACE(%I, $1, $2) WHERE %I LIKE $3',
                tbl_rec.schema_name, tbl_rec.table_name,
                tbl_rec.column_name, tbl_rec.column_name, tbl_rec.column_name
            ) USING
                '"${key}":"' || map_rec."OldName" || '"',
                '"${key}":"' || map_rec."NewName" || '"',
                '%"${key}":"' || map_rec."OldName" || '"%';
            GET DIAGNOSTICS v_update_count = ROW_COUNT;
            v_total := v_total + v_update_count;`
    )
    .join('\n');

  const doBlock = `
-- PG equivalent of T-SQL cursor + dynamic SQL procedure (#${procName}).
-- Loops through entity name mappings and replaces old names with new names
-- in JSON configuration columns across multiple tables.
DO $$
DECLARE
    tbl_rec RECORD;
    map_rec RECORD;
    v_update_count INTEGER;
    v_total INTEGER;
BEGIN
    FOR tbl_rec IN
        SELECT * FROM (VALUES
${valuesStr}
        ) AS t(schema_name, table_name, column_name)
    LOOP
        -- Check if column exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = tbl_rec.schema_name
              AND table_name = tbl_rec.table_name
              AND column_name = tbl_rec.column_name
        ) THEN
            RAISE NOTICE '  SKIPPED: %.%.% does not exist', tbl_rec.schema_name, tbl_rec.table_name, tbl_rec.column_name;
            CONTINUE;
        END IF;

        v_total := 0;
        FOR map_rec IN SELECT "OldName", "NewName" FROM "${tempTable}" LOOP
${replaceBlocks}
        END LOOP;

        RAISE NOTICE '  %.%.%: Updated % rows', tbl_rec.schema_name, tbl_rec.table_name, tbl_rec.column_name, v_total;
    END LOOP;
END $$;
`;

  groups.Data.push(doBlock);
  groups.Data.push(`\nDROP TABLE IF EXISTS "${tempTable}";\n`);
}

/** Extract JSON key patterns from the procedure body.
 *  Looks for REPLACE patterns like: ''"Entity":"'' + @pOld
 *  (T-SQL uses doubled single quotes '' inside string literals) */
function extractJsonKeyPatterns(sql: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  // Match 1-2 single quotes, then "Key":"  then 1-2 single quotes, then + @p
  const pattern = /'{1,2}"(\w+)":"'{1,2}\s*\+\s*@p/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(sql)) !== null) {
    const key = m[1];
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Topologically sort view blocks so dependencies come before dependents.
 * Uses Kahn's algorithm. Needed because DROP VIEW ... CASCADE can cascade-drop
 * a view that was already created earlier in the file.
 */
function topologicallySortViews(views: string[], schema: string): string[] {
  const parsed = views.map((block, idx) => {
    const nameMatch = block.match(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:\w+\.)?"?(\w+)"?/i);
    const viewName = nameMatch ? nameMatch[1].toLowerCase() : `__unnamed_${idx}`;
    const deps = new Set<string>();
    const refRegex = new RegExp(`(?:FROM|JOIN)\\s+(?:${schema}\\.)?(?:"(vw\\w+)"|(vw\\w+))`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = refRegex.exec(block)) !== null) {
      const dep = (m[1] || m[2]).toLowerCase();
      if (dep !== viewName) deps.add(dep);
    }
    return { block, viewName, deps };
  });

  const nameToIndex = new Map<string, number>();
  parsed.forEach((v, i) => nameToIndex.set(v.viewName, i));

  const inDegree = new Array(parsed.length).fill(0);
  const adjList: number[][] = parsed.map(() => []);

  for (let i = 0; i < parsed.length; i++) {
    for (const dep of parsed[i].deps) {
      const depIdx = nameToIndex.get(dep);
      if (depIdx !== undefined) {
        adjList[depIdx].push(i);
        inDegree[i]++;
      }
    }
  }

  const queue: number[] = [];
  for (let i = 0; i < inDegree.length; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(parsed[node].block);
    for (const neighbor of adjList[node]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }

  // Cycle fallback: append remaining in original order
  if (sorted.length < parsed.length) {
    const sortedSet = new Set(sorted);
    for (const v of parsed) {
      if (!sortedSet.has(v.block)) sorted.push(v.block);
    }
  }

  return sorted;
}

/** Print a formatted conversion report */
export function PrintReport(stats: ConversionStats, log: (msg: string) => void): void {
  log('');
  log('='.repeat(70));
  log('CONVERSION REPORT');
  log('='.repeat(70));
  log(`Total batches:          ${stats.TotalBatches.toLocaleString()}`);
  log(`Converted:              ${stats.Converted.toLocaleString()}`);
  log(`Skipped:                ${stats.Skipped.toLocaleString()}`);
  log(`Errors:                 ${stats.Errors.toLocaleString()}`);
  log(`Gaps (unconverted SQL): ${stats.Gaps.toLocaleString()}`);
  log('');
  log('Object counts:');
  log(`  Tables created:       ${stats.TablesCreated}`);
  log(`  Views created:        ${stats.ViewsCreated}`);
  log(`  Procedures converted: ${stats.ProceduresConverted}`);
  log(`  Functions converted:  ${stats.FunctionsConverted}`);
  log(`  Triggers converted:   ${stats.TriggersConverted}`);
  log(`  Inserts converted:    ${stats.InsertsConverted}`);
  log(`  Grants converted:     ${stats.GrantsConverted}`);
  log(`  FK constraints:       ${stats.FKConstraints}`);
  log(`  Check constraints:    ${stats.CheckConstraints}`);
  log(`  Indexes created:      ${stats.IndexesCreated}`);
  log(`  Comments converted:   ${stats.CommentsConverted}`);

  if (stats.ErrorBatches.length > 0) {
    log(`\nErrors (${stats.ErrorBatches.length}):`);
    for (const err of stats.ErrorBatches.slice(0, 20)) {
      log(`  - ${err}`);
    }
    if (stats.ErrorBatches.length > 20) {
      log(`  ... and ${stats.ErrorBatches.length - 20} more`);
    }
  }

  if (stats.GapBatches.length > 0) {
    log(`\nGaps — statements the converter could not produce (${stats.GapBatches.length}):`);
    for (const gap of stats.GapBatches.slice(0, 20)) {
      log(`  - ${gap}`);
    }
    if (stats.GapBatches.length > 20) {
      log(`  ... and ${stats.GapBatches.length - 20} more`);
    }
  }

  if (stats.SkippedBatches.length > 0) {
    log(`\nSkipped (showing first 10 of ${stats.SkippedBatches.length}):`);
    for (const skip of stats.SkippedBatches.slice(0, 10)) {
      log(`  - ${skip}`);
    }
  }
}

/** @deprecated Use {@link PrintReport}. */
export function printReport(stats: ConversionStats, log: (msg: string) => void): void {
  return PrintReport(stats, log);
}
