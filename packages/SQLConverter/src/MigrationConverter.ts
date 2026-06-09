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

/**
 * The kept (T-SQL, NOT yet transpiled) content of a migration after classification —
 * codegen objects and mj-sync metadata dropped, hand-procedural flagged. This is the
 * input handed to the AST dialect (`mj_postgres.py`) for transpilation, keeping
 * classification (TS) and transpilation (AST) cleanly separated.
 */
export interface KeptTSQL {
  fileName: string;
  status: ConversionStatus;
  /** The kept SQL-Server SQL to transpile (schema DDL + comments). '' when nothing to keep. */
  tsql: string;
  /** Hand-written routines that need a human PG version (names). */
  handProcedural: string[];
}

/** Classify a migration and return the kept T-SQL to transpile — the AST-path entry point. */
export function extractKeptTSQL(sql: string, fileName: string): KeptTSQL {
  const split = splitMigration(sql, fileName);
  const stmts = splitByStatement(sql);
  const isUnbanneredSnapshot =
    split.boundaryMethod === 'no-codegen-block' && stmts.some((s) => s.kind === 'codegen-object');

  if (isUnbanneredSnapshot) {
    const KEEP = new Set(['schema-ddl', 'comment', 'role-setup']);
    const kept = stmts.filter((s) => KEEP.has(s.kind)).map((s) => s.sql);
    const hand = stmts.filter((s) => s.kind === 'hand-procedural').map((s) => s.evidence);
    return {
      fileName,
      status: hand.length ? 'needs-hand-authoring' : 'converted',
      tsql: kept.join('\nGO\n'),
      handProcedural: hand,
    };
  }

  if (split.routing === 'needs-hand-authoring') {
    const hand = split.handAuthoredRegions.filter((r) => r.kind === 'hand-procedural').map((r) => `${r.evidence}@${r.line}`);
    return { fileName, status: 'needs-hand-authoring', tsql: split.handAuthored, handProcedural: hand };
  }

  const has = (k: string) => split.handAuthoredRegions.some((r) => r.kind === k);
  const translatable = has('schema-ddl') || (has('data-dml') && !has('metadata-sync'));

  // Recover entity-REGISTRATION INSERTs from the dropped CodeGen block. On SQL Server,
  // CodeGen's schema-introspection sprocs (spUpdateExistingEntitiesFromSchema, …) recreate
  // these rows from the live schema, so dropping them is safe. PostgreSQL has no such
  // sprocs (they're T-SQL-only), so a new entity's registration rows have NO other source:
  // dropping them leaves the entity absent from metadata and `mj codegen` then emits no
  // view/sproc for it. The AST transpiler already KEEPS these INSERTs (its _METADATA_TABLES
  // matcher is disabled for exactly this reason) — but a file whose CodeGen output sits
  // below an explicit `-- CODE GEN RUN` banner (e.g. KnowledgeHub) never gets them to the
  // transpiler, because the splitter routes the whole post-banner block to codeGenBlock.
  // Files with no banner (e.g. Magic_Link) keep these registration INSERTs inline already;
  // this recovery makes the bannered case match. Scope is the registration table set that
  // survives in the no-banner path — NOT base-table seed rows or generated views/sprocs.
  const recovered = split.codeGenBlock ? recoverEntityRegistrationInserts(split.codeGenBlock) : '';
  const baseTsql = translatable ? split.handAuthored : '';
  const tsql = recovered ? (baseTsql ? `${baseTsql}\nGO\n${recovered}` : recovered) : baseTsql;

  return {
    fileName,
    status: tsql ? 'converted' : 'reseed-or-regen-only',
    tsql,
    handProcedural: [],
  };
}

/**
 * The CodeGen-emitted entity-registration tables. These define a new entity in MJ metadata
 * and have no schema-introspection equivalent on PostgreSQL, so they must survive the split.
 * Deliberately excludes base-table seed rows (e.g. the entity's own sample data) and any
 * generated views/sprocs/grants — those ARE regenerated by `mj codegen` on PG.
 */
const ENTITY_REGISTRATION_TABLES = [
  'Entity',
  'EntityField',
  'EntityFieldValue',
  'ApplicationEntity',
  'EntityRelationship',
  'EntityPermission',
];

/**
 * Pull every `INSERT INTO ${flyway:defaultSchema}.<RegistrationTable> …` statement out of a
 * dropped CodeGen block, in original order, and return them GO-separated for the transpiler.
 */
function recoverEntityRegistrationInserts(codeGenBlock: string): string {
  const tableAlt = ENTITY_REGISTRATION_TABLES.join('|');
  const qualifiedTable = String.raw`\[?\$\{flyway:defaultSchema\}\]?\s*\.\s*\[?(?:${tableAlt})\]?\b`;
  // Two CodeGen shapes target a registration table:
  //   (a) a bare `INSERT INTO <schema>.<RegTable> …` (the Entity / ApplicationEntity rows), and
  //   (b) an idempotent `IF NOT EXISTS (SELECT … FROM <schema>.<RegTable> …) BEGIN INSERT … END`
  //       guard (the EntityField / EntityFieldValue / EntityRelationship rows).
  // The AST transpiler keeps both (its metadata-drop matcher is disabled and it lowers the
  // IF-EXISTS-BEGIN guard to a PG DO block), so recovering either form is sufficient.
  const headRe = new RegExp(
    String.raw`^\s*(?:INSERT\s+INTO\s+${qualifiedTable}` +
      String.raw`|IF\s+(?:NOT\s+)?EXISTS\s*\([^)]*\b(?:${tableAlt})\b)`,
    'i',
  );
  // Classify by our own head-regex against the comment-stripped SQL, NOT the splitter's
  // `kind`: a CodeGen registration statement is preceded by `-- CODE GEN RUN` + a `/* … */`
  // provenance comment, which the statement splitter doesn't strip, so it lands as 'unknown'
  // rather than 'metadata-dml'. We only emit batches whose first real keyword targets a
  // registration table, so misclassification upstream doesn't cause us to miss or over-keep.
  return splitByStatement(codeGenBlock)
    .filter((s) => headRe.test(stripLeadingCommentsAndNoise(s.sql)))
    .map((s) => truncateAtGeneratedObject(s.sql))
    .join('\nGO\n');
}

/**
 * A registration GO-batch can have a generated-object section (a view/sproc regeneration)
 * appended without a `GO` separator — CodeGen emits the EntityField inserts and the
 * `----- BASE VIEW FOR ENTITY …` / `IF OBJECT_ID(...,'V') DROP VIEW … CREATE VIEW …` block
 * back-to-back in one batch. `splitByStatement` only splits on `GO`, so the whole thing
 * arrives as one statement. Keep only the registration prefix: truncate at the first
 * generated-object boundary (the CodeGen ruler banner, an OBJECT_ID view-existence guard,
 * or a bare DROP/CREATE VIEW/FUNCTION/PROC/TRIGGER / GRANT). Those objects are regenerated
 * natively by `mj codegen` on PG, so dropping them here is exactly what we want.
 */
function truncateAtGeneratedObject(batch: string): string {
  const boundary = batch.search(
    /(?:^|\n)\s*(?:-----+\s*BASE (?:VIEW|TABLE)\b|IF\s+OBJECT_ID\s*\(|DROP\s+VIEW\b|CREATE\s+(?:OR\s+(?:ALTER|REPLACE)\s+)?(?:VIEW|FUNCTION|PROC(?:EDURE)?|TRIGGER)\b|GRANT\b)/i,
  );
  return boundary === -1 ? batch : batch.slice(0, boundary);
}

/** Strip leading `--` / `/* … *​/` comments, PRINT, and blank lines so the first real keyword is visible. */
function stripLeadingCommentsAndNoise(batch: string): string {
  let s = batch;
  let changed = true;
  while (changed) {
    changed = false;
    const trimmed = s.replace(/^\s+/, '');
    if (trimmed.startsWith('--')) {
      s = trimmed.replace(/^--[^\n]*\n?/, '');
      changed = true;
    } else if (trimmed.startsWith('/*')) {
      const end = trimmed.indexOf('*/');
      s = end === -1 ? '' : trimmed.slice(end + 2);
      changed = true;
    } else if (/^PRINT\b/i.test(trimmed)) {
      s = trimmed.replace(/^PRINT[^\n]*\n?/i, '');
      changed = true;
    } else {
      s = trimmed;
    }
  }
  return s;
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
