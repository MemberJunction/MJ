/**
 * MigrationConverter — the split-and-regenerate conversion of a single SQL Server
 * migration into its PostgreSQL `.pg.sql` counterpart.
 *
 * See `plans/pg-migration-architecture/SPLIT_AND_REGENERATE_PROPOSAL.md`.
 *
 * It does NOT try to translate everything. Content is routed by which generator
 * produced it:
 *   - Category A (CodeGen objects)      → DROPPED; regenerated natively by `mj codegen` on PG.
 *   - Category M (mj-sync metadata)     → DROPPED; re-seeded by `mj sync push` on PG.
 *   - Category B (regular hand DDL/DML) → transpiled via the AST dialect (sqlglot `mj_postgres.py`).
 *   - Category C (hand-written procedural SQL) → schema DDL still transpiled; the
 *     procedural routines are surfaced as NEEDS-HAND-AUTHORING gaps.
 *
 * The contract of this module is **nothing is dropped silently**: every statement
 * either (a) lands in the transpiled output, (b) is dropped because a generator
 * reproduces it natively on PG (counted + named in `notes`/`droppedObjects`), or
 * (c) is surfaced as a gap (`unhandled` / `handProcedural`, embedded as comments in
 * the output). Gap consumers — a human build engineer or an LLM last-mile pass —
 * work from those artifacts.
 *
 * Classification (TypeScript, this file + MigrationSplitter/MigrationStatementSplitter)
 * is deliberately separated from transpilation (the Python AST dialect), bridged by
 * the `TSQLToPGTranspiler` interface so classification stays unit-testable without
 * a Python runtime.
 */
import { splitMigration, type MigrationSplitResult, type MigrationRegionKind } from './MigrationSplitter.js';
import { splitByStatement, type StatementBatch, type StatementKind } from './MigrationStatementSplitter.js';

export type ConversionStatus =
  /** Category-B content was transpiled into `pgSQL`. */
  | 'converted'
  /** File is purely regenerated/re-seeded — no DDL to translate; `pgSQL` is a marker only. */
  | 'reseed-or-regen-only'
  /** File contains hand-written procedural SQL — transpiled DDL is emitted, but a human must author the routines. */
  | 'needs-hand-authoring';

/** One statement the AST transpiler refused to emit — a reported gap. */
export interface UnhandledStatement {
  /** What the dialect saw (e.g. 'Command', 'Declare', 'sys-guard'). */
  kind: string;
  /** The offending T-SQL (possibly truncated by the dialect). */
  snippet: string;
}

/** Result of transpiling kept T-SQL to PostgreSQL. */
export interface MJTranspileResult {
  /** The emitted PostgreSQL statements, in order. */
  sql: string[];
  /** Per-statement T-SQL the transpiler refused to emit — the gap report. */
  unhandled: UnhandledStatement[];
}

/**
 * The transpiler seam between classification (TS) and AST transpilation (Python
 * sqlglot dialect). Production implementation: `MJPostgresTranspiler` in
 * `@memberjunction/sqlglot-ts`. Tests inject a stub.
 */
export interface TSQLToPGTranspiler {
  transpile(tsql: string): Promise<MJTranspileResult>;
}

/**
 * The kept (T-SQL, NOT yet transpiled) content of a migration after classification —
 * codegen objects and mj-sync metadata dropped, hand-procedural flagged. This is the
 * single source of truth for what survives the split; `convertMigration` consumes it.
 */
export interface KeptTSQL {
  fileName: string;
  status: ConversionStatus;
  /** The kept SQL-Server SQL to transpile. '' when nothing to keep. */
  tsql: string;
  /** Hand-written routines that need a human PG version (names/evidence). */
  handProcedural: string[];
  /** Names of objects dropped for native regeneration (audit trail; statement mode). */
  droppedObjects: string[];
  /** Human-readable notes describing what was dropped/kept and why. */
  notes: string[];
  /** The underlying banner split (boundary, regions, routing) for transparency. */
  split: MigrationSplitResult;
  /** Lines of Category-A CodeGen output dropped (regenerated natively instead). */
  droppedCodeGenLines: number;
}

export interface MigrationConversionResult {
  fileName: string;
  status: ConversionStatus;
  /** The `.pg.sql` body to write. For `reseed-or-regen-only` this is a marker comment. */
  pgSQL: string;
  /** The underlying split (boundary, regions, routing) for transparency/reporting. */
  split: MigrationSplitResult;
  /** Lines of Category-A CodeGen output dropped (regenerated natively instead). */
  droppedCodeGenLines: number;
  /** Per-statement T-SQL the AST dialect refused to emit — also embedded as gap comments in `pgSQL`. */
  unhandled: UnhandledStatement[];
  /** Hand-written routines needing a human PG version — also embedded as gap comments. */
  handProcedural: string[];
  /** Names of objects dropped as codegen-regenerated (audit trail). */
  droppedObjects: string[];
  /** Human-readable notes describing what happened to each category. */
  notes: string[];
}

export interface ConvertMigrationOptions {
  /** Target schema substituted for `${flyway:defaultSchema}` in the output (default '__mj'). */
  schema?: string;
  /** Emit the standard `.pg.sql` provenance header (default true). */
  includeHeader?: boolean;
  /**
   * The AST transpiler. Required whenever the migration has kept T-SQL to translate;
   * pure regen/reseed files convert without it.
   */
  transpiler?: TSQLToPGTranspiler;
}

/** Statement kinds that survive statement-mode classification and flow to the transpiler. */
const STATEMENT_MODE_KEEP: ReadonlySet<StatementKind> = new Set<StatementKind>([
  'schema-ddl',
  'comment',
  'role-setup',
  // Unclassifiable batches are NEVER silently dropped — the AST transpiler either
  // emits them or reports them in `unhandled`.
  'unknown',
  // Hand routines stay in the stream too: the dialect transpiles any plain DDL around
  // them and routes the routine bodies to `unhandled`, while we flag the file.
  'hand-procedural',
]);

/** Classify a migration and return the kept T-SQL to transpile — the single classification entry point. */
export function extractKeptTSQL(sql: string, fileName: string): KeptTSQL {
  const split = splitMigration(sql, fileName);
  const droppedCodeGenLines = split.codeGenBlock ? split.codeGenBlock.split('\n').length : 0;

  // Baselines and old-style migrations have NO banner but DO contain generated
  // objects (squashed snapshots). Banner-based splitting can't separate them — use
  // statement-level classification instead.
  const stmts = splitByStatement(sql);
  const isUnbanneredSnapshot =
    split.boundaryMethod === 'no-codegen-block' && stmts.some((s) => s.kind === 'codegen-object');
  if (isUnbanneredSnapshot) {
    return classifyStatementMode(split, stmts, droppedCodeGenLines);
  }

  return classifyBannerMode(split, droppedCodeGenLines);
}

/** Banner-split path: feature migrations with (or without) a CodeGen block. */
function classifyBannerMode(split: MigrationSplitResult, droppedCodeGenLines: number): KeptTSQL {
  const has = (k: MigrationRegionKind) => split.handAuthoredRegions.some((r) => r.kind === k);
  const handProcedural =
    split.routing === 'needs-hand-authoring'
      ? split.handAuthoredRegions
          .filter((r) => r.kind === 'hand-procedural')
          .map((r) => `${r.evidence}@${r.line}`)
      : [];

  // Transpile when there is real schema DDL, data DML that isn't an mj-sync seed, or
  // hand-procedural content (whose surrounding DDL must still be emitted — the dialect
  // routes the routine bodies themselves to `unhandled`).
  const translatable =
    handProcedural.length > 0 || has('schema-ddl') || (has('data-dml') && !has('metadata-sync'));

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
  // this recovery makes the bannered case match — and applies to needs-hand files too
  // (e.g. IsComputed_To_EntityField, whose registration rows sit below the banner).
  const recovered = split.codeGenBlock ? recoverEntityRegistrationInserts(split.codeGenBlock) : '';
  const baseTsql = translatable ? split.handAuthored : '';
  const tsql = recovered ? (baseTsql ? `${baseTsql}\nGO\n${recovered}` : recovered) : baseTsql;

  const notes = regenReseedNotes(split, droppedCodeGenLines);
  if (recovered) {
    notes.push('Recovered entity-registration INSERTs from the dropped CodeGen block (no PG-side introspection recreates them).');
  }

  return {
    fileName: split.fileName,
    status: handProcedural.length > 0 ? 'needs-hand-authoring' : tsql ? 'converted' : 'reseed-or-regen-only',
    tsql,
    handProcedural,
    droppedObjects: [],
    notes,
    split,
    droppedCodeGenLines,
  };
}

/** Statement-mode path: unbannered snapshots (baselines) classified per GO batch. */
function classifyStatementMode(
  split: MigrationSplitResult,
  stmts: StatementBatch[],
  droppedCodeGenLines: number,
): KeptTSQL {
  // BASELINES keep their metadata DML: a baseline is the system's point-in-time
  // metadata source of truth — codegen can't even boot on a fresh PG database without
  // Entity/EntityField rows, and `mj sync push` only owns the curated subset. Dropping
  // the seed here is what forced fresh installs to depend on an external fixture DB.
  // Non-baseline unbannered files keep the drop: their seeds ARE reproduced by sync push.
  const isBaseline = /^B\d/.test(split.fileName);
  const kept = stmts.filter(
    (s) => STATEMENT_MODE_KEEP.has(s.kind) || (isBaseline && s.kind === 'metadata-dml'),
  );
  const hand = stmts.filter((s) => s.kind === 'hand-procedural');
  const unknown = stmts.filter((s) => s.kind === 'unknown');
  const droppedRegen = stmts.filter((s) => s.kind === 'codegen-object' || s.kind === 'grant');
  const droppedMeta = isBaseline ? [] : stmts.filter((s) => s.kind === 'metadata-dml');

  const notes = [
    `Statement-mode (unbannered snapshot): kept ${kept.length} batches ` +
      `(schema DDL/comments/roles${isBaseline ? '/metadata seed' : ''}, ${unknown.length} unclassified → transpiler decides), ` +
      `dropped ${droppedRegen.length} CodeGen objects/grants (regenerated by \`mj codegen\`)` +
      (isBaseline ? '.' : ` and ${droppedMeta.length} metadata DML batches (re-seeded by \`mj sync push\`).`),
  ];
  if (hand.length > 0) {
    notes.push(
      `⚠ ${hand.length} hand-written routine(s) need a human PG version: ` +
        hand.map((h) => h.evidence).slice(0, 20).join(', '),
    );
  }

  return {
    fileName: split.fileName,
    status: hand.length > 0 ? 'needs-hand-authoring' : 'converted',
    tsql: kept.map((s) => s.sql).join('\nGO\n'),
    handProcedural: hand.map((h) => h.evidence),
    droppedObjects: droppedRegen.map((s) => s.evidence),
    notes,
    split,
    droppedCodeGenLines: droppedRegen.concat(droppedMeta).reduce((n, s) => n + s.sql.split('\n').length, 0),
  };
}

/**
 * Convert one SQL Server migration to its PG form via split-and-regenerate.
 * No file I/O — the caller decides whether/where to write `pgSQL`.
 *
 * Classification comes from `extractKeptTSQL` (the single source of truth);
 * transpilation goes through `options.transpiler` (the AST dialect). Throws when
 * kept T-SQL exists but no transpiler was provided — content is never dropped
 * because a backend was missing.
 */
export async function convertMigration(
  sql: string,
  fileName: string,
  options: ConvertMigrationOptions = {},
): Promise<MigrationConversionResult> {
  const kept = extractKeptTSQL(sql, fileName);

  if (!kept.tsql.trim()) {
    return {
      fileName: kept.fileName,
      status: kept.status,
      pgSQL: regenOnlyMarker(kept),
      split: kept.split,
      droppedCodeGenLines: kept.droppedCodeGenLines,
      unhandled: [],
      handProcedural: kept.handProcedural,
      droppedObjects: kept.droppedObjects,
      notes: kept.notes,
    };
  }

  if (!options.transpiler) {
    throw new Error(
      `convertMigration: ${fileName} has kept T-SQL to translate but no transpiler was provided. ` +
        'Pass options.transpiler (e.g. MJPostgresTranspiler from @memberjunction/sqlglot-ts).',
    );
  }

  const transpiled = await options.transpiler.transpile(kept.tsql);
  const schema = options.schema ?? '__mj';
  const pgSQL = assemblePgSQL(kept, transpiled, schema, options.includeHeader ?? true);

  return {
    fileName: kept.fileName,
    status: kept.status,
    pgSQL,
    split: kept.split,
    droppedCodeGenLines: kept.droppedCodeGenLines,
    unhandled: transpiled.unhandled,
    handProcedural: kept.handProcedural,
    droppedObjects: kept.droppedObjects,
    notes: kept.notes,
  };
}

/** Assemble the final `.pg.sql` text: header, gap comments, transpiled body. */
function assemblePgSQL(
  kept: KeptTSQL,
  transpiled: MJTranspileResult,
  schema: string,
  includeHeader: boolean,
): string {
  const parts: string[] = [];
  if (includeHeader) parts.push(pgHeader(kept.fileName));

  const gaps = gapComments(kept.handProcedural, transpiled.unhandled);
  if (gaps) parts.push(gaps);

  const body = transpiled.sql
    .map((s) => (s.trim().endsWith(';') ? s : `${s};`))
    .join('\n\n');
  parts.push(body);

  // Committed .pg.sql files use the literal schema (Flyway placeholder substitution
  // is not relied on for PG). Replace both the macro and the dialect's internal
  // sentinel, should it ever leak.
  return parts
    .join('\n\n')
    .replaceAll('${flyway:defaultSchema}', schema)
    .replaceAll('__mj_flyway_default_schema__', schema)
    .concat('\n');
}

/** The standard committed-`.pg.sql` provenance header. */
function pgHeader(fileName: string): string {
  return [
    '-- ============================================================================',
    `-- MemberJunction PostgreSQL Migration — ${fileName}`,
    '-- Generated by the split-and-regenerate pipeline (AST dialect transpile of',
    '-- hand-written DDL; CodeGen objects regenerated natively; metadata re-seeded).',
    '-- ============================================================================',
    '',
    'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
    'CREATE SCHEMA IF NOT EXISTS __mj;',
    'SET search_path TO __mj, public;',
    'SET standard_conforming_strings = on;',
  ].join('\n');
}

/**
 * Render the gap report as SQL comments embedded at the top of the output, so a
 * reviewer (human or LLM last-mile pass) sees exactly what still needs authoring.
 * This is the loud counterpart to the legacy pipeline's silent drops.
 */
function gapComments(handProcedural: string[], unhandled: UnhandledStatement[]): string {
  if (handProcedural.length === 0 && unhandled.length === 0) return '';
  const lines: string[] = ['-- ╔══ CONVERSION GAPS — resolve before relying on this migration ══╗'];
  if (handProcedural.length > 0) {
    lines.push(`-- NEEDS HAND-AUTHORING (${handProcedural.length} hand-written routine(s)):`);
    for (const h of handProcedural) lines.push(`--   • ${h}`);
    lines.push('--   Author the PostgreSQL equivalent of each routine and add it below.');
  }
  if (unhandled.length > 0) {
    lines.push(`-- UNHANDLED BY THE AST TRANSPILER (${unhandled.length} statement(s)):`);
    unhandled.forEach((u, i) => {
      const snippet = u.snippet.replace(/\s+/g, ' ').trim();
      const truncated = snippet.length > 300 ? `${snippet.slice(0, 300)} …[truncated]` : snippet;
      lines.push(`--   [${i + 1}] (${u.kind}) ${truncated}`);
    });
    lines.push('--   Each statement above was REPORTED, not silently dropped — port it manually.');
  }
  lines.push('-- ╚════════════════════════════════════════════════════════════════╝');
  return lines.join('\n');
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

/** Marker `.pg.sql` body for files with nothing to translate. */
function regenOnlyMarker(kept: KeptTSQL): string {
  const lines = [`-- ${kept.fileName} — no DDL to translate.`];
  if (kept.split.codeGenBlock) lines.push('-- CodeGen objects are regenerated natively via `mj codegen` on PG.');
  if (kept.split.handAuthoredRegions.some((r) => r.kind === 'metadata-sync')) {
    lines.push('-- Metadata is re-seeded via `mj sync push` against PG.');
  }
  lines.push('');
  return lines.join('\n');
}
