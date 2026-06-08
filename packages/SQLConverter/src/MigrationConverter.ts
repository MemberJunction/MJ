/**
 * MigrationConverter — the split-and-regenerate conversion of a single SQL Server
 * migration into its PostgreSQL `.pg.sql` counterpart.
 *
 * See `plans/pg-migration-architecture/SPLIT_AND_REGENERATE_PROPOSAL.md`.
 *
 * It does NOT try to translate everything. It uses `MigrationSplitter` to route
 * content by which generator produced it:
 *   - Category A (CodeGen objects)      → DROPPED; regenerated natively by `mj codegen` on PG.
 *   - Category M (mj-sync metadata)     → DROPPED; re-seeded by `mj sync push` on PG.
 *   - Category B (regular hand DDL/DML) → transpiled via the existing rule pipeline.
 *   - Category C (hand-written procedural SQL) → file is flagged for human authoring.
 *
 * The output `.pg.sql` therefore contains only the transpiled Category-B content
 * (plus a header documenting what was regenerated/re-seeded). The assemble step
 * (apply DDL → `mj codegen` → `mj sync push` → diff) lives in the pipeline driver,
 * not here.
 */
import { splitMigration, type MigrationSplitResult } from './MigrationSplitter.js';
import { splitByStatement, type StatementBatch } from './MigrationStatementSplitter.js';
import { convertFile, getTSQLToPostgresRules } from './rules/index.js';
import type { ConversionStats } from './rules/types.js';

export type ConversionStatus =
  /** Category-B content was transpiled into `pgSQL`. */
  | 'converted'
  /** File is purely regenerated/re-seeded — no DDL to translate; `pgSQL` is a marker only. */
  | 'reseed-or-regen-only'
  /** File contains hand-written procedural SQL — needs a human-authored `.pg.sql`. */
  | 'needs-hand-authoring';

export interface MigrationConversionResult {
  fileName: string;
  status: ConversionStatus;
  /** The `.pg.sql` body to write. For non-`converted` statuses this is a marker comment. */
  pgSQL: string;
  /** The underlying split (boundary, regions, routing) for transparency/reporting. */
  split: MigrationSplitResult;
  /** Conversion stats from the rule pipeline, when Category-B content was transpiled. */
  conversionStats?: ConversionStats;
  /** Lines of Category-A CodeGen output dropped (regenerated natively instead). */
  droppedCodeGenLines: number;
  /** Human-readable notes describing what happened to each category. */
  notes: string[];
}

export interface ConvertMigrationOptions {
  /** Target schema for the rule pipeline (default '__mj'). */
  schema?: string;
  /** Emit the standard `.pg.sql` provenance header (default true). */
  includeHeader?: boolean;
}

/**
 * Convert one SQL Server migration to its PG form via split-and-regenerate.
 * Pure function — no I/O. The caller decides whether/where to write `pgSQL`.
 */
export function convertMigration(
  sql: string,
  fileName: string,
  options: ConvertMigrationOptions = {},
): MigrationConversionResult {
  const split = splitMigration(sql, fileName);
  const droppedCodeGenLines = split.codeGenBlock ? split.codeGenBlock.split('\n').length : 0;

  // Baselines and old-style migrations have NO banner but DO contain generated
  // objects (squashed snapshots). Banner-based splitting can't separate them — use
  // statement-level classification instead (keep tables/indexes/comments, drop the
  // codegen/metadata, flag hand-written routines).
  const stmts = splitByStatement(sql);
  const isUnbanneredSnapshot =
    split.boundaryMethod === 'no-codegen-block' && stmts.some((s) => s.kind === 'codegen-object');
  if (isUnbanneredSnapshot) {
    return buildStatementModeResult(split, stmts, options);
  }

  if (split.routing === 'needs-hand-authoring') {
    return buildHandAuthoringResult(split, droppedCodeGenLines);
  }

  const has = (k: string) => split.handAuthoredRegions.some((r) => r.kind === k);
  // Transpile when there is real schema DDL, or data DML that isn't an mj-sync seed.
  // Otherwise the file is entirely CodeGen objects and/or mj-sync metadata → regen/reseed.
  const translatable = has('schema-ddl') || (has('data-dml') && !has('metadata-sync'));
  if (!translatable) {
    return buildRegenOnlyResult(split, droppedCodeGenLines);
  }

  return buildConvertedResult(split, droppedCodeGenLines, options);
}

/** Statement-mode (baseline / unbannered snapshot): keep tables/indexes/comments, drop the rest. */
function buildStatementModeResult(
  split: MigrationSplitResult,
  stmts: StatementBatch[],
  options: ConvertMigrationOptions,
): MigrationConversionResult {
  const KEEP = new Set(['schema-ddl', 'comment', 'role-setup']);
  const kept = stmts.filter((s) => KEEP.has(s.kind));
  const handProc = stmts.filter((s) => s.kind === 'hand-procedural');
  const dropped = stmts.filter((s) => !KEEP.has(s.kind) && s.kind !== 'hand-procedural');

  // Transpile the kept DDL/comments through the rule pipeline in one pass.
  const converted = convertFile({
    Source: kept.map((s) => s.sql).join('\nGO\n'),
    SourceIsFile: false,
    Rules: getTSQLToPostgresRules(),
    Schema: options.schema ?? '__mj',
    SourceDialect: 'tsql',
    TargetDialect: 'postgres',
    IncludeHeader: options.includeHeader ?? true,
    EnablePostProcess: true,
  });

  const notes = [
    `Statement-mode (unbannered snapshot): kept ${kept.length} schema/comment batches, ` +
      `dropped ${dropped.length} (CodeGen objects/grants/metadata → regenerated by \`mj codegen\` + \`mj sync push\`).`,
  ];
  if (handProc.length > 0) {
    notes.push(
      `⚠ ${handProc.length} hand-written routine(s) need a human PG version: ` +
        handProc.map((h) => h.evidence).slice(0, 20).join(', '),
    );
  }

  return {
    fileName: split.fileName,
    status: handProc.length > 0 ? 'needs-hand-authoring' : 'converted',
    pgSQL: converted.OutputSQL,
    split,
    conversionStats: converted.Stats,
    droppedCodeGenLines: dropped.reduce((n, s) => n + s.sql.split('\n').length, 0),
    notes,
  };
}

/** File has hand-written procedural SQL — do not auto-translate; flag it. */
function buildHandAuthoringResult(
  split: MigrationSplitResult,
  droppedCodeGenLines: number,
): MigrationConversionResult {
  const proc = split.handAuthoredRegions.filter((r) => r.kind === 'hand-procedural');
  const evidence = proc.map((p) => `${p.evidence} @ line ${p.line}`).join(', ');
  return {
    fileName: split.fileName,
    status: 'needs-hand-authoring',
    pgSQL: needsHandAuthoringMarker(split.fileName, evidence),
    split,
    droppedCodeGenLines,
    notes: [
      `Contains hand-written procedural SQL (${evidence}) — requires a human-authored .pg.sql.`,
      ...regenReseedNotes(split, droppedCodeGenLines),
    ],
  };
}

/** File is purely regenerated objects and/or re-seeded metadata — no DDL to translate. */
function buildRegenOnlyResult(
  split: MigrationSplitResult,
  droppedCodeGenLines: number,
): MigrationConversionResult {
  return {
    fileName: split.fileName,
    status: 'reseed-or-regen-only',
    pgSQL: regenOnlyMarker(split.fileName, split),
    split,
    droppedCodeGenLines,
    notes: regenReseedNotes(split, droppedCodeGenLines),
  };
}

/** File has regular hand DDL/DML — transpile it through the existing rule pipeline. */
function buildConvertedResult(
  split: MigrationSplitResult,
  droppedCodeGenLines: number,
  options: ConvertMigrationOptions,
): MigrationConversionResult {
  const converted = convertFile({
    Source: split.handAuthored,
    SourceIsFile: false,
    Rules: getTSQLToPostgresRules(),
    Schema: options.schema ?? '__mj',
    SourceDialect: 'tsql',
    TargetDialect: 'postgres',
    IncludeHeader: options.includeHeader ?? true,
    EnablePostProcess: true,
  });

  const notes = regenReseedNotes(split, droppedCodeGenLines);
  if (split.routing === 'transpile-plus-reseed') {
    notes.push(
      'File mixes regular DDL with mj-sync metadata; the metadata blocks were transpiled ' +
        'by the rule pipeline. Future optimization: strip them and re-seed via `mj sync push`.',
    );
  }

  return {
    fileName: split.fileName,
    status: 'converted',
    pgSQL: converted.OutputSQL,
    split,
    conversionStats: converted.Stats,
    droppedCodeGenLines,
    notes,
  };
}

/** Notes describing the dropped Category-A / re-seeded Category-M content. */
function regenReseedNotes(split: MigrationSplitResult, droppedCodeGenLines: number): string[] {
  const notes: string[] = [];
  if (droppedCodeGenLines > 0) {
    notes.push(`Dropped ${droppedCodeGenLines} lines of CodeGen output — regenerated natively via \`mj codegen\` on PG.`);
  }
  if (split.handAuthoredRegions.some((r) => r.kind === 'metadata-sync')) {
    notes.push('Contains mj-sync metadata — re-seeded via `mj sync push` against PG.');
  }
  return notes;
}

function needsHandAuthoringMarker(fileName: string, evidence: string): string {
  return [
    `-- NEEDS HAND-AUTHORING: ${fileName}`,
    `-- This migration contains hand-written procedural SQL (${evidence}).`,
    '-- The split-and-regenerate pipeline does not translate procedural SQL automatically.',
    '-- Author the PostgreSQL equivalent of the CREATE PROCEDURE/FUNCTION/TRIGGER body here.',
    '',
  ].join('\n');
}

function regenOnlyMarker(fileName: string, split: MigrationSplitResult): string {
  const lines = [`-- ${fileName} — no DDL to translate.`];
  if (split.codeGenBlock) lines.push('-- CodeGen objects are regenerated natively via `mj codegen` on PG.');
  if (split.handAuthoredRegions.some((r) => r.kind === 'metadata-sync')) {
    lines.push('-- Metadata is re-seeded via `mj sync push` against PG.');
  }
  lines.push('');
  return lines.join('\n');
}
