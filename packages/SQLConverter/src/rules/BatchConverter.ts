/**
 * BatchConverter — the main orchestrator for the rule-based conversion pipeline.
 *
 * This is the entry point for converting an entire SQL Server file to PostgreSQL.
 * It replaces the ConversionPipeline's sqlglot-based approach with a rule-based
 * approach ported from the Python conversion script.
 *
 * Pipeline: preprocess → split → sub-split → classify → convert → group → postprocess
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { classifyBatch } from './StatementClassifier.js';
import { subSplitCompoundBatch } from './SubSplitter.js';
import { postProcess } from './PostProcessor.js';
import type {
  IConversionRule, ConversionContext, ConversionStats,
  OutputGroups, StatementType,
} from './types.js';
import {
  createConversionContext, createConversionStats, createOutputGroups,
} from './types.js';

/** Batch type groupings for ordered output */
const TABLE_TYPES = new Set<StatementType>(['CREATE_TABLE', 'ALTER_TABLE', 'PK_CONSTRAINT', 'CREATE_INDEX', 'CONDITIONAL_DDL']);
const FK_TYPES = new Set<StatementType>(['FK_CONSTRAINT', 'CHECK_CONSTRAINT', 'UNIQUE_CONSTRAINT', 'ENABLE_CONSTRAINT']);
const VIEW_TYPES = new Set<StatementType>(['CREATE_VIEW']);
const FUNC_TYPES = new Set<StatementType>(['CREATE_PROCEDURE', 'CREATE_FUNCTION']);
const TRIGGER_TYPES = new Set<StatementType>(['CREATE_TRIGGER']);
const DATA_TYPES = new Set<StatementType>(['INSERT', 'UPDATE', 'DELETE']);
const GRANT_TYPES = new Set<StatementType>(['GRANT', 'REVOKE']);
const COMMENT_TYPES = new Set<StatementType>(['EXTENDED_PROPERTY']);

/** PostgreSQL file header */
const PG_HEADER = `-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER → BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only int→bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;

`;

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
export function convertFile(config: BatchConverterConfig): BatchConverterResult {
  const log = config.OnProgress ?? (() => {});
  const schema = config.Schema ?? '__mj';
  const sourceDialect = config.SourceDialect ?? 'tsql';
  const targetDialect = config.TargetDialect ?? 'postgres';
  const includeHeader = config.IncludeHeader ?? true;
  const enablePostProcess = config.EnablePostProcess ?? true;

  const stats = createConversionStats();
  const context = createConversionContext(sourceDialect, targetDialect, schema);
  const groups = createOutputGroups();

  // Read source
  log('Reading source SQL...');
  const rawSQL = config.SourceIsFile
    ? readFileSync(config.Source, 'utf-8')
    : config.Source;
  log(`  File size: ${rawSQL.length.toLocaleString()} bytes, ${rawSQL.split('\n').length.toLocaleString()} lines`);

  // Preprocess: replace Flyway placeholders
  log('Pre-processing (Flyway placeholders)...');
  const processedSQL = preprocess(rawSQL);

  // Split into batches on GO
  log('Splitting into batches...');
  const rawBatches = splitOnGo(processedSQL);

  // Sub-split compound batches
  const batches: string[] = [];
  for (const batch of rawBatches) {
    batches.push(...subSplitCompoundBatch(batch));
  }
  stats.TotalBatches = batches.length;
  log(`  Found ${stats.TotalBatches.toLocaleString()} batches`);

  // Classify and log distribution
  const classifications = new Map<string, number>();
  for (const batch of batches) {
    const bt = classifyBatch(batch);
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

  for (let i = 0; i < batches.length; i++) {
    const pct = Math.floor(((i + 1) * 100) / stats.TotalBatches);
    if (pct !== lastPct && pct % 10 === 0) {
      log(`  Progress: ${pct}% (${i + 1}/${stats.TotalBatches})`);
      lastPct = pct;
    }

    const batch = batches[i];
    const batchType = classifyBatch(batch);

    try {
      const result = convertBatch(batch, batchType, sortedRules, context, stats);
      if (result !== null) {
        routeToGroup(result, batchType, groups, batch);
        stats.Converted++;
      }
    } catch (err) {
      stats.Errors++;
      const errMsg = err instanceof Error ? err.message : String(err);
      stats.ErrorBatches.push(`Error in batch ${i + 1} (${batchType}): ${errMsg.slice(0, 100)}`);
      groups.Other.push(`\n-- ERROR converting batch ${i + 1} (${batchType}): ${errMsg.slice(0, 100)}\n`);
      groups.Other.push(`-- Original (first 200 chars): ${batch.slice(0, 200)}\n\n`);
    }
  }

  // Assemble output in proper order
  log('Assembling output...');
  const outputParts: string[] = [];

  if (includeHeader) {
    outputParts.push(PG_HEADER);
  }

  outputParts.push('\n-- ===================== DDL: Tables, PKs, Indexes =====================\n');
  outputParts.push(...groups.Tables);
  outputParts.push('\n-- ===================== Helper Functions (fn*) =====================\n');
  outputParts.push(...groups.HelperFunctions);
  outputParts.push('\n-- ===================== Views =====================\n');
  outputParts.push(...groups.Views);
  outputParts.push('\n-- ===================== Stored Procedures (sp*) =====================\n');
  outputParts.push(...groups.StoredProcedures);
  outputParts.push('\n-- ===================== Triggers =====================\n');
  outputParts.push(...groups.Triggers);
  outputParts.push('\n-- ===================== Data (INSERT/UPDATE/DELETE) =====================\n');
  outputParts.push(...groups.Data);
  outputParts.push('\n-- ===================== FK & CHECK Constraints =====================\n');
  outputParts.push(...groups.FKConstraints);
  outputParts.push('\n-- ===================== Grants =====================\n');
  outputParts.push(...groups.Grants);
  outputParts.push('\n-- ===================== Comments =====================\n');
  outputParts.push(...groups.Comments);
  if (groups.Other.length > 0) {
    outputParts.push('\n-- ===================== Other =====================\n');
    outputParts.push(...groups.Other);
  }

  // Post-process
  log('Post-processing...');
  let fullOutput = outputParts.join('\n');
  if (enablePostProcess) {
    fullOutput = postProcess(fullOutput);
  }

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

/** Replace Flyway placeholders with PG schema */
function preprocess(sql: string): string {
  return sql.replace(/\$\{flyway:defaultSchema\}/g, '__mj');
}

/** Split SQL on GO batch separators */
function splitOnGo(sql: string): string[] {
  const batches: string[] = [];
  const lines = sql.split('\n');
  let currentBatch: string[] = [];

  for (const line of lines) {
    const stripped = line.trim().toUpperCase();
    if (stripped === 'GO' || /^GO\s*(--.*)?$/i.test(stripped)) {
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
  // CONDITIONAL_DDL containing INSERT INTO should go to Data (not Tables) for correct FK ordering
  if (batchType === 'CONDITIONAL_DDL' && originalBatch && /\bINSERT\s+INTO\b/i.test(originalBatch) && !/\bALTER\s+TABLE\b/i.test(originalBatch)) {
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
  return `-- TODO: Review this batch\n${batch};\n`;
}

/** Update conversion statistics */
function updateStats(batchType: StatementType, stats: ConversionStats): void {
  switch (batchType) {
    case 'CREATE_TABLE': stats.TablesCreated++; break;
    case 'CREATE_VIEW': stats.ViewsCreated++; break;
    case 'CREATE_PROCEDURE': stats.ProceduresConverted++; break;
    case 'CREATE_FUNCTION': stats.FunctionsConverted++; break;
    case 'CREATE_TRIGGER': stats.TriggersConverted++; break;
    case 'INSERT': case 'UPDATE': case 'DELETE': stats.InsertsConverted++; break;
    case 'GRANT': case 'REVOKE': stats.GrantsConverted++; break;
    case 'FK_CONSTRAINT': stats.FKConstraints++; break;
    case 'CHECK_CONSTRAINT': stats.CheckConstraints++; break;
    case 'CREATE_INDEX': stats.IndexesCreated++; break;
    case 'EXTENDED_PROPERTY': stats.CommentsConverted++; break;
  }
}

/** Print a formatted conversion report */
export function printReport(stats: ConversionStats, log: (msg: string) => void): void {
  log('');
  log('='.repeat(70));
  log('CONVERSION REPORT');
  log('='.repeat(70));
  log(`Total batches:          ${stats.TotalBatches.toLocaleString()}`);
  log(`Converted:              ${stats.Converted.toLocaleString()}`);
  log(`Skipped:                ${stats.Skipped.toLocaleString()}`);
  log(`Errors:                 ${stats.Errors.toLocaleString()}`);
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

  if (stats.SkippedBatches.length > 0) {
    log(`\nSkipped (showing first 10 of ${stats.SkippedBatches.length}):`);
    for (const skip of stats.SkippedBatches.slice(0, 10)) {
      log(`  - ${skip}`);
    }
  }
}
