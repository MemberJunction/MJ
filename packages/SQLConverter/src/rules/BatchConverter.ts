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
import { classifyBatch } from './StatementClassifier.js';
import { subSplitCompoundBatch } from './SubSplitter.js';
import { postProcess } from './PostProcessor.js';
import { getHeaderBuilder } from './DialectHeaderBuilder.js';
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
const DATA_TYPES = new Set<StatementType>(['INSERT', 'UPDATE', 'DELETE', 'EXEC_BLOCK']);
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
  const processedSQL = preprocess(rawSQL, schema);

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

  // Inject hand-written PG blocks for complex migration patterns
  // (cursor + dynamic SQL + temp procedures that can't be auto-converted)
  injectTempProcReplacements(processedSQL, groups);

  // Assemble output in proper order
  log('Assembling output...');
  const outputParts: string[] = [];

  if (includeHeader) {
    const headerBuilder = getHeaderBuilder(targetDialect);
    if (headerBuilder) {
      outputParts.push(headerBuilder.BuildHeader(schema));
    }
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

/** Replace Flyway placeholders with target schema */
function preprocess(sql: string, schema: string): string {
  return sql.replace(/\$\{flyway:defaultSchema\}/g, schema);
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
    case 'INSERT': case 'UPDATE': case 'DELETE': case 'EXEC_BLOCK': stats.InsertsConverted++; break;
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
