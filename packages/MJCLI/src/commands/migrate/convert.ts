import { Command, Flags } from '@oclif/core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  convertFile,
  getRulesForDialects,
  createConversionStats,
  deduplicateEntityFieldSequences,
  convertMigration,
  IncrementalBaker,
  BakeApplyError,
} from '@memberjunction/sql-converter';
import type {
  BatchConverterConfig,
  BatchConverterResult,
  ConversionStats,
  MigrationConversionResult,
  BakedMigrationResult,
  BakerWorkingDB,
} from '@memberjunction/sql-converter';
import { MJPostgresTranspiler, type BitColumnRef } from '@memberjunction/sqlglot-ts';
// Type-only import: erased at runtime, so the heavy codegen-lib value graph is NOT loaded
// by a plain `convert --split` — only the dynamic import() inside buildBaker() loads it.
import type { DataSourceResult } from '@memberjunction/codegen-lib';

/**
 * MJ core's schema — where the boolean columns an Open App migration seeds (EntityField.AllowsNull
 * and friends) actually live. The app's own schema is read from `--schema`.
 */
const MJ_CORE_SCHEMA = '__mj';

/**
 * The fields runSplit consumes from a per-migration conversion, shared by the transpile-only
 * path (`convertMigration` → no `mode`) and the inline-baking path (`IncrementalBaker` → carries
 * `mode`). An INTERSECTION (not a bare `Pick`) because `MigrationConversionResult` has no `mode`
 * field — the baker's `mode`/`reconciliation` are optional here (issue #3252 Phase 4b).
 */
type ConvertedShape = Pick<MigrationConversionResult, 'status' | 'pgSQL' | 'unhandled' | 'handProcedural'> & {
  mode?: BakedMigrationResult['mode'];
  reconciliation?: MigrationConversionResult['reconciliation'];
};

/**
 * Decide how to write and gate one per-migration conversion result (issue #3252 Phase 4d).
 * Pure — no I/O — so the write/halt policy is unit-testable apart from the oclif command.
 *
 * - `writeAsNeedsHand`: a needs-hand-authoring file OR any bake-mode `gap-no-bake` result is
 *   written `<name>.pg.sql.needs-hand` (never a discoverable `.pg.sql`), so an incomplete
 *   migration stays visibly unconverted. A non-bake `converted`+unhandled file keeps the
 *   existing behavior (a discoverable `.pg.sql` with embedded gap comments).
 * - `isGap`: needs-hand, any unhandled statement, or a bake `gap-no-bake` — anything that must
 *   fail the run unless `--allow-gaps` (which is disallowed in bake mode, 4f).
 * - `haltBake`: gated on the baker's `mode`, NOT on `isGap`. Only `mode === 'gap-no-bake'` means the
 *   working DB was NOT advanced past this migration (a gappy FORWARD migration the baker refused to
 *   apply); halting there stops later bakes from running against a stale schema. A baseline the baker
 *   exempts to `mode: 'baked'` despite a `needs-hand-authoring` status (its pre-seeded metadata made
 *   the capture complete — IncrementalBaker baseline path) DID advance the DB, so it must be written
 *   `.needs-hand` and reported as a gap yet must NOT halt — otherwise every subsequent migration is
 *   blocked from baking at the baseline. Keying off `status`/`unhandled` would wrongly halt it.
 */
export function decideConvertWrite(
  // Strongly typed via ConvertedShape — `status` is MigrationConversionResult['status'] and `mode`
  // is BakedMigrationResult['mode'], NOT `string`. Widening either to `string` would let an invalid
  // state compile and bypass the write/halt policy below (issue #3252 code review — Standards 2).
  result: Pick<ConvertedShape, 'status' | 'unhandled' | 'mode'>,
  bakeCodegen: boolean,
): { isGap: boolean; writeAsNeedsHand: boolean; haltBake: boolean } {
  const isNoBakeGate = result.mode === 'gap-no-bake';
  const writeAsNeedsHand = result.status === 'needs-hand-authoring' || isNoBakeGate;
  const isGap = writeAsNeedsHand || result.unhandled.length > 0;
  return { isGap, writeAsNeedsHand, haltBake: bakeCodegen && isNoBakeGate };
}

/**
 * Build the `.needs-hand` file body for a conversion FAILURE (issue #3252 review P2 / Phase 4e).
 * Pure — no I/O — so the "never emit a bare stub over a useful artifact" policy is unit-testable.
 *
 * A bake working-DB apply/capture failure carries the already-transpiled body (via BakeApplyError):
 * the transpiled DDL is the expensive artifact, so it is PRESERVED under a failure banner for a
 * human to finish. Any other failure (missing transpiler, pre-transpile infra) has no body — a
 * blank/whitespace `preservedBody` falls back to the plain hand-author stub with no misleading
 * "preserved DDL below" banner over nothing.
 */
export function buildConversionFailureArtifact(sourceFile: string, message: string, preservedBody: string): string {
  const preserved = preservedBody.trim();
  if (!preserved) {
    return `-- CONVERSION FAILED for ${sourceFile}\n-- ${message}\n-- Hand-author the PostgreSQL form, then rename to .pg.sql.\n`;
  }
  return (
    `-- CONVERSION FAILED (working-DB apply/capture) for ${sourceFile}\n-- ${message}\n` +
    `-- The transpiled DDL below is PRESERVED for hand-finishing; complete it, then rename to .pg.sql.\n\n` +
    `${preserved}\n`
  );
}

/**
 * Decide whether a legacy (non---split) convert run fails, and with what message (issue #3857).
 * Pure — no I/O — so the exit policy is unit-testable apart from the oclif command.
 *
 * A GAP is a marker comment the converter wrote into the output where it knowingly could not
 * produce SQL (`-- Could not parse: @RoleID …`). Unlike an ERROR — a throw the converter caught —
 * a gap leaves the batch counted as converted, so before this gate the legacy path reported
 * `Files: 1 (1 OK, 0 errors)` and exited 0 over a file PostgreSQL rejects, and nothing short of
 * applying it to a real PG database caught it.
 *
 * Errors always fail. Gaps fail too, unless the caller explicitly accepts them with --allow-gaps
 * (which until now had effect only on the --split path).
 */
export function decideLegacyConvertExit(args: {
  errorCount: number;
  gapCount: number;
  gapFileCount: number;
  allowGaps: boolean;
}): { fail: true; message: string } | { fail: false; message: null } {
  const reasons: string[] = [];
  if (args.errorCount > 0) reasons.push(`errors in ${args.errorCount} file(s)`);
  const gapsFail = args.gapCount > 0 && !args.allowGaps;
  if (gapsFail) reasons.push(`${args.gapCount} conversion gap(s) in ${args.gapFileCount} file(s)`);
  if (reasons.length === 0) return { fail: false, message: null };

  const advice = gapsFail
    ? ' A gap is a marker comment (e.g. "-- Could not parse: …") left where the converter could not ' +
      'produce SQL — PostgreSQL will reject the output. Resolve the gaps (rewrite the source migration ' +
      'declaratively, hand-author the PG form, or fix the converter rule), or pass --allow-gaps to ' +
      'accept them for now.'
    : '';
  return { fail: true, message: `Conversion completed with ${reasons.join(' and ')}.${advice}` };
}

/**
 * CLI command to discover and convert T-SQL migrations to PostgreSQL.
 *
 * Scans the SQL Server migrations directory, identifies files that don't
 * have a corresponding .pg.sql counterpart in the PG migrations directory,
 * and converts them.
 *
 * Two strategies:
 * - `--split` (split-and-regenerate, the standard path): classify content by the
 *   generator that produced it, transpile only hand-written DDL via the AST dialect
 *   (sqlglot `mj_postgres.py`), drop CodeGen objects (regenerated by `mj codegen`)
 *   and mj-sync metadata (re-seeded by `mj sync push`), and surface every gap loudly.
 *   Requires Python 3 with sqlglot (`pip install sqlglot`; set MJ_SQLGLOT_PYTHON if
 *   not `python3` on PATH).
 * - default (legacy): the regex-based BatchConverter rule pipeline, which converts
 *   everything including appended CodeGen output. Retained for compatibility.
 *
 * Usage:
 *   mj migrate convert --split                       # Standard split-and-regenerate conversion
 *   mj migrate convert --split --file V20260401__foo.sql
 *   mj migrate convert --split --dry-run
 *   mj migrate convert                               # Legacy regex pipeline
 */
export default class MigrateConvert extends Command {
  static description = 'Convert T-SQL migrations to PostgreSQL';

  static examples = [
    '<%= config.bin %> migrate convert --split',
    '<%= config.bin %> migrate convert --split --dry-run',
    '<%= config.bin %> migrate convert --split --file V202604060452__v5.24.x__KnowledgeHub.sql',
    '<%= config.bin %> migrate convert --source-dir ./migrations/v5 --output-dir ./migrations-pg/v5',
    '<%= config.bin %> migrate convert --verbose',
  ];

  static flags = {
    'source-dir': Flags.string({
      description: 'Source T-SQL migrations directory',
      default: './migrations/v5',
    }),
    'output-dir': Flags.string({
      description: 'Output PG migrations directory',
      default: './migrations-pg/v5',
    }),
    file: Flags.string({
      description: 'Convert a specific file (filename only, looked up in source-dir)',
    }),
    schema: Flags.string({
      description: 'Target schema name',
      default: '__mj',
    }),
    'core-schema': Flags.string({
      description:
        "MJ core schema substituted for ${mjSchema} (default __mj). Distinct from --schema, which is the app's OWN schema: an Open App migration references core as ${mjSchema} and itself as ${flyway:defaultSchema}, and for every app those differ.",
      default: '__mj',
    }),
    'dry-run': Flags.boolean({
      description: 'Show what would be converted without writing files',
      default: false,
    }),
    'no-header': Flags.boolean({
      description: 'Skip PG header (extensions, schema, implicit cast)',
      default: false,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show per-statement progress',
      default: false,
    }),
    split: Flags.boolean({
      description:
        'Split-and-regenerate (the standard path): transpile only hand-written DDL via the AST ' +
        'dialect; CodeGen objects are regenerated by `mj codegen` and mj-sync metadata re-seeded ' +
        'by `mj sync push`; every conversion gap is surfaced and fails the run unless --allow-gaps.',
      default: false,
    }),
    'allow-gaps': Flags.boolean({
      description:
        'Exit 0 even when migrations have conversion gaps — with --split: hand-authoring needed or ' +
        'unhandled statements; on the legacy path: "-- Could not parse" / "-- ERROR converting batch" ' +
        'markers in the output. Gaps are still embedded as comments and listed in the summary.',
      default: false,
    }),
    'bake-codegen': Flags.boolean({
      description:
        'With --split: bake native PG CodeGen objects inline per migration (Path C), so the set ' +
        'deploys with `mj migrate` alone — no `mj codegen` step. Requires a LIVE working PG database ' +
        '(DB_PLATFORM=postgresql + PG_* env, same as `mj codegen`) seeded to the state just BEFORE ' +
        'the migrations being converted (typically the latest baseline); the converter brings it ' +
        'forward in committed order as it bakes. Not compatible with --dry-run.',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MigrateConvert);

    if (flags['bake-codegen']) {
      if (!flags.split) this.error('--bake-codegen requires --split.');
      if (flags['dry-run']) this.error('--bake-codegen mutates a live working DB and is incompatible with --dry-run.');
      // A baked set must deploy standalone via `mj migrate` alone, so it cannot ship with
      // accepted gaps — `--allow-gaps` contradicts the bake contract (issue #3252 Phase 4f).
      if (flags['allow-gaps'])
        this.error('--bake-codegen produces standalone migrations and cannot accept gaps; --allow-gaps is incompatible. Resolve the gaps and re-run.');
    }

    if (flags.split) {
      await this.runSplit(flags);
      return;
    }

    const sourceDir = path.resolve(flags['source-dir']);
    const outputDir = path.resolve(flags['output-dir']);

    // Verify directories exist
    if (!fs.existsSync(sourceDir)) {
      this.error(`Source directory not found: ${sourceDir}`);
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      this.log(`Created output directory: ${outputDir}`);
    }

    // Load conversion rules
    const rules = getRulesForDialects('tsql', 'postgres');
    if (rules.length === 0) {
      this.error('No conversion rules found for tsql -> postgres');
    }

    // Discover migrations
    const unconverted = this.discoverUnconverted(sourceDir, outputDir, flags.file);

    if (unconverted.length === 0) {
      this.log('All migrations are already converted. Nothing to do.');
      return;
    }

    this.log(`Found ${unconverted.length} migration(s) to convert:\n`);
    for (const m of unconverted) {
      this.log(`  ${m.SourceFile} → ${m.OutputFile}`);
    }

    if (flags['dry-run']) {
      this.log('\nDry run — no files written.');
      return;
    }

    this.log('');

    // Convert each file
    let successCount = 0;
    let errorCount = 0;
    const gapFiles: string[] = [];
    const totalStats: ConversionStats = createConversionStats();

    for (const migration of unconverted) {
      this.log(`Converting: ${migration.SourceFile}`);

      const config: BatchConverterConfig = {
        Source: path.join(sourceDir, migration.SourceFile),
        SourceIsFile: true,
        OutputFile: path.join(outputDir, migration.OutputFile),
        Rules: rules,
        Schema: flags.schema,
        SourceDialect: 'tsql',
        TargetDialect: 'postgres',
        IncludeHeader: !flags['no-header'],
        EnablePostProcess: true,
        OnProgress: flags.verbose ? (msg: string) => this.log(`  ${msg}`) : undefined,
      };

      const result: BatchConverterResult = convertFile(config);
      this.mergeStats(totalStats, result.Stats);

      if (result.Stats.Errors > 0) {
        errorCount++;
        this.logToStderr(`  ERRORS: ${result.Stats.Errors} in ${migration.SourceFile}`);
        for (const err of result.Stats.ErrorBatches) {
          this.logToStderr(`    ${err.substring(0, 200)}`);
        }
      }
      // Gaps are listed the same way errors are — the whole point of issue #3857 is that a file
      // the converter knowingly could not finish must not be reported as "OK".
      if (result.Stats.Gaps > 0) {
        gapFiles.push(migration.SourceFile);
        this.logToStderr(`  GAPS: ${result.Stats.Gaps} unconverted statement(s) in ${migration.SourceFile}`);
        for (const gap of result.Stats.GapBatches) {
          this.logToStderr(`    ${gap.substring(0, 200)}`);
        }
      }
      if (result.Stats.Errors === 0 && result.Stats.Gaps === 0) {
        successCount++;
        this.log(`  OK (${result.Stats.Converted} batches, ${result.Stats.TotalBatches - result.Stats.Converted} skipped)`);
      }
    }

    // Print summary
    this.log('');
    this.log('=== Conversion Summary ===');
    this.log(`  Files:       ${unconverted.length} (${successCount} OK, ${errorCount} errors, ${gapFiles.length} with gaps)`);
    this.log(`  Batches:     ${totalStats.TotalBatches} total, ${totalStats.Converted} converted, ${totalStats.Skipped} skipped, ${totalStats.Errors} errors, ${totalStats.Gaps} gaps`);
    this.log(`  Tables:      ${totalStats.TablesCreated}`);
    this.log(`  Views:       ${totalStats.ViewsCreated}`);
    this.log(`  Procedures:  ${totalStats.ProceduresConverted}`);
    this.log(`  Functions:   ${totalStats.FunctionsConverted}`);
    this.log(`  Triggers:    ${totalStats.TriggersConverted}`);
    this.log(`  Indexes:     ${totalStats.IndexesCreated}`);
    this.log(`  Inserts:     ${totalStats.InsertsConverted}`);
    this.log(`  Grants:      ${totalStats.GrantsConverted}`);

    // Post-conversion: deduplicate EntityField Sequence values across files
    // to prevent UQ_EntityField_EntityID_Sequence violations on PG
    this.log('\nRunning EntityField Sequence deduplication...');
    const dedupResult = deduplicateEntityFieldSequences(outputDir);
    if (dedupResult.totalCollisions > 0) {
      this.log(`  Fixed ${dedupResult.totalCollisions} sequence collision(s) across ${dedupResult.fixes.length} INSERT(s):`);
      for (const fix of dedupResult.fixes) {
        this.log(`    ${fix.file} line ${fix.line}: ${fix.originalSequence} → ${fix.newSequence}`);
      }
    } else {
      this.log(`  No collisions found (${dedupResult.totalInserts} EntityField INSERTs scanned).`);
    }

    // Gate LAST, after the sequence dedup fixup. `this.error` throws, and the files are already
    // written: gating before the fixup would leave every output un-deduped, and a re-run skips
    // them (they now have a .pg.sql counterpart), so the fixup would never get another chance.
    // Errors gate here as they always did; gaps now gate too unless --allow-gaps (issue #3857).
    const exit = decideLegacyConvertExit({
      errorCount,
      gapCount: totalStats.Gaps,
      gapFileCount: gapFiles.length,
      allowGaps: flags['allow-gaps'],
    });
    if (exit.fail) {
      this.error(exit.message);
    }
  }

  /**
   * Split-and-regenerate conversion (the standard path). Classification routes
   * content by the generator that produced it; the AST dialect transpiles what's
   * kept. Contract: nothing is dropped silently —
   * - needs-hand migrations are written as `<name>.pg.sql.needs-hand` (NOT a
   *   discoverable `.pg.sql`, so the migration stays visibly unconverted until a
   *   human finishes it) and fail the run;
   * - statements the dialect couldn't emit are embedded as gap comments in the
   *   output, listed in the summary, and fail the run unless --allow-gaps.
   *
   * See plans/pg-migration-architecture/SPLIT_AND_REGENERATE_PROPOSAL.md.
   */
  private async runSplit(flags: {
    'source-dir': string;
    'output-dir': string;
    file?: string;
    schema: string;
    'dry-run': boolean;
    'no-header': boolean;
    'allow-gaps': boolean;
    'bake-codegen': boolean;
  }): Promise<void> {
    const sourceDir = path.resolve(flags['source-dir']);
    const outputDir = path.resolve(flags['output-dir']);
    if (!fs.existsSync(sourceDir)) this.error(`Source directory not found: ${sourceDir}`);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const unconverted = this.discoverUnconverted(sourceDir, outputDir, flags.file);
    if (unconverted.length === 0) {
      this.log('All migrations are already converted. Nothing to do.');
      return;
    }

    const transpiler = await this.buildTranspiler(sourceDir);

    // Select the per-migration conversion: inline-baking (live DB, CodeGen baked natively) or
    // the default transpile-only path (CodeGen regenerated by `mj codegen` at deploy).
    const bakeCodegen = flags['bake-codegen'];
    const baker = bakeCodegen ? await this.buildBaker(transpiler, flags.schema, flags['core-schema']) : null;
    const convertOne = (sql: string, fileName: string): Promise<ConvertedShape> =>
      baker
        ? baker.bakeMigration(sql, fileName)
        : convertMigration(sql, fileName, {
            schema: flags.schema,
            coreSchema: flags['core-schema'],
            includeHeader: !flags['no-header'],
            transpiler,
          });
    if (bakeCodegen) this.log(`\nInline CodeGen baking ENABLED — bringing the working DB forward as each migration bakes.`);

    const converted: string[] = [];
    const regenReseed: string[] = [];
    const needsHand: { file: string; routines: string[] }[] = [];
    const withUnhandled: { file: string; count: number }[] = [];
    const gapReport: {
      sourceFile: string;
      outputFile: string;
      status: string;
      handProcedural: string[];
      unhandled: { kind: string; snippet: string }[];
    }[] = [];

    // Set when a bake-mode gap or a conversion failure halts the batch: the working DB was
    // NOT advanced past this migration, so later bakes must not run against a stale schema.
    let halted: { file: string; reason: string } | null = null;

    for (const m of unconverted) {
      const sql = fs.readFileSync(path.join(sourceDir, m.SourceFile), 'utf8');
      let result: ConvertedShape;
      try {
        result = await convertOne(sql, m.SourceFile);
      } catch (err) {
        // NEVER `this.error` with zero artifacts (issue #3252 Phase 4e). Whatever threw
        // (missing transpiler, a working-DB apply/capture failure in bake mode, infra), write
        // a .needs-hand file carrying the error + record the gap, THEN halt after the loop.
        const msg = err instanceof Error ? err.message : String(err);
        const failName = `${m.OutputFile}.needs-hand`;
        const failPath = path.join(outputDir, failName);
        // A bake working-DB apply/capture failure carries the already-transpiled body (issue #3252
        // review P2): preserve it under a failure banner so a human can finish it, instead of
        // discarding the useful artifact for a bare stub. Other failures have no body → plain stub.
        const preserved = err instanceof BakeApplyError ? err.transpiledBody : '';
        const failBody = buildConversionFailureArtifact(m.SourceFile, msg, preserved);
        // Same "never clobber on re-run" guard as the normal write path — a human may have
        // started hand-authoring the file from a prior failed run; don't overwrite their work.
        if (!flags['dry-run'] && !fs.existsSync(failPath)) {
          fs.writeFileSync(failPath, failBody);
        }
        gapReport.push({
          sourceFile: m.SourceFile,
          outputFile: failName,
          status: 'conversion-failed',
          handProcedural: [],
          unhandled: [{ kind: 'CONVERSION-ERROR', snippet: msg.slice(0, 300) }],
        });
        withUnhandled.push({ file: m.SourceFile, count: 1 });
        halted = { file: m.SourceFile, reason: msg };
        break;
      }

      const decision = decideConvertWrite(result, bakeCodegen);
      // A needs-hand / gap-no-bake migration is NEVER written as a discoverable .pg.sql — that
      // would mark it converted forever and let Skyway apply an incomplete file. The .needs-hand
      // artifact carries the transpiled DDL + gap comments for a human (or LLM pass) to finish.
      const outName = decision.writeAsNeedsHand ? `${m.OutputFile}.needs-hand` : m.OutputFile;
      const outPath = path.join(outputDir, outName);
      if (!flags['dry-run']) {
        if (decision.writeAsNeedsHand && fs.existsSync(outPath)) {
          // Someone may be mid-edit on the artifact — never clobber it on a re-run.
          this.warn(`${outName} already exists — not overwritten (delete it to regenerate).`);
        } else {
          fs.writeFileSync(outPath, result.pgSQL);
        }
      }

      // Bucket by the WRITE decision, not the raw status: a bake-mode `gap-no-bake` file can
      // carry status 'converted' yet is written .needs-hand and halts, so it must be summarized
      // as a gap, never counted as a clean transpile (issue #3252 — summary honesty).
      if (decision.writeAsNeedsHand) {
        needsHand.push({ file: m.SourceFile, routines: result.handProcedural });
      } else if (result.status === 'reseed-or-regen-only') {
        regenReseed.push(m.SourceFile);
      } else {
        converted.push(m.SourceFile);
      }
      if (result.unhandled.length > 0) {
        withUnhandled.push({ file: m.SourceFile, count: result.unhandled.length });
      }
      if (decision.isGap) {
        gapReport.push({
          sourceFile: m.SourceFile,
          outputFile: outName,
          status: result.status,
          handProcedural: result.handProcedural,
          unhandled: result.unhandled,
        });
      }

      // Halt-at-first-gap in bake mode (issue #3252 Phase 4d): the working DB was not advanced
      // past this migration, so continuing would bake later migrations against a stale schema.
      if (decision.haltBake) {
        halted = { file: m.SourceFile, reason: 'conversion gap — the working DB was not advanced past this migration' };
        break;
      }
    }

    // The consolidated gap artifact — everything a build engineer (or an LLM pass they
    // drive) needs to finish the conversion, in one machine-readable file.
    if (!flags['dry-run']) {
      const reportPath = path.join(outputDir, 'conversion-gaps.report.json');
      if (gapReport.length > 0) {
        fs.writeFileSync(
          reportPath,
          JSON.stringify({ generatedAt: new Date().toISOString(), sourceDir, gaps: gapReport }, null, 2),
        );
        this.log(`\nGap report written: ${reportPath}`);
      } else if (fs.existsSync(reportPath)) {
        fs.unlinkSync(reportPath); // clean run — stale report would misreport state
      }
    }

    this.printSplitSummary(converted, regenReseed, needsHand, withUnhandled, flags['dry-run'], bakeCodegen);

    // A halt (bake-mode gap or a conversion failure) ALWAYS ends the run non-zero, BEFORE the
    // unconditional `process.exit(0)` below — otherwise a bake run could exit 0 despite a gap
    // (issue #3252 Phase 4d, MAJOR-2). this.error throws a CLIError → non-zero exit.
    if (halted) {
      this.error(
        `Halted at ${halted.file}: ${halted.reason}. Resolve the gap (see conversion-gaps.report.json ` +
          'and the .needs-hand file), apply the finished .pg.sql to the working DB, then re-run ' +
          '(already-converted files are skipped).',
      );
    }

    const gapCount = needsHand.length + withUnhandled.length;
    if (gapCount > 0 && !flags['allow-gaps']) {
      // In bake mode the working DB pools are open; this.error → oclif force-exits anyway.
      this.error(
        `${needsHand.length} migration(s) need hand-authoring and ${withUnhandled.length} have ` +
          'unhandled statements. Resolve the gaps (conversion-gaps.report.json + comments in the ' +
          'output files), or pass --allow-gaps to accept them for now.',
      );
    }

    // setupDataSource() opened pg pools that keep the event loop alive, and CodeGenConnection
    // exposes no close(). Mirror the `mj codegen` command (runCodeGen.ts) and exit explicitly so
    // the CLI terminates after a clean bake.
    if (bakeCodegen) process.exit(0);
  }

  /**
   * Construct the AST transpiler with the cross-file BIT/BOOLEAN column registry
   * collected from the baselines (they declare the core tables, e.g. User.IsActive),
   * so per-file transpiles can coerce 1/0 → TRUE/FALSE in seed INSERTs that target
   * tables defined outside the migration being converted. Fails fast with install
   * guidance when Python/sqlglot is unavailable.
   */
  private async buildTranspiler(sourceDir: string): Promise<MJPostgresTranspiler> {
    const probe = new MJPostgresTranspiler();
    try {
      await probe.preflight();
    } catch (err) {
      this.error(err instanceof Error ? err.message : String(err));
    }

    // Only the LATEST baseline feeds the cross-file BIT registry. A baseline is a full
    // cumulative schema snapshot, so the newest one already contains every current
    // table's BIT columns; older baselines only add stale/dropped columns. Collecting
    // from ALL baselines both (a) bloats the registry with dead entries and (b) — since
    // it is passed to the sqlglot subprocess as the MJ_EXTRA_BIT_COLS *environment
    // variable* — pushes past the OS single-arg/env limit (Linux MAX_ARG_STRLEN, 128 KB)
    // once enough baselines accumulate, making every spawn fail with `spawn E2BIG`.
    // (Threshold first crossed at v5.46: 5 baselines = 4060 entries ≈ 134 KB. Latest
    // baseline alone ≈ 1023 entries ≈ 34 KB.)
    const baselines = fs
      .readdirSync(sourceDir)
      .filter((f) => /^B\d.*\.sql$/.test(f) && !f.endsWith('.pg.sql') && !f.endsWith('.pg-only.sql'))
      .sort();
    const latestBaseline = baselines.at(-1);
    const bitColumns: BitColumnRef[] = [];
    if (latestBaseline) {
      try {
        const cols = await probe.collectBitColumns(fs.readFileSync(path.join(sourceDir, latestBaseline), 'utf8'));
        bitColumns.push(...cols);
      } catch (err) {
        // A baseline that fails bit-column collection degrades 1/0→TRUE/FALSE
        // coercion for tables it declares — warn loudly, don't proceed silently.
        this.warn(`Bit-column collection failed for ${latestBaseline}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return new MJPostgresTranspiler({ extraBitColumns: bitColumns });
  }

  /**
   * Build the inline-baking driver: connect to the live working PG database (the same
   * config/env `mj codegen` uses) and wire its apply / metadata-refresh / per-entity capture
   * into an IncrementalBaker.
   *
   * The codegen engine + data-provider stack is heavy and only this opt-in path needs it, so
   * the value graph is loaded with a dynamic import here (Rule 8 case 3 — bundle-size deferral;
   * codegen-lib + core are declared MJCLI deps) to keep a plain `convert --split` light. The
   * matching `import type` at the top is erased at runtime, so it does not defeat the deferral.
   */
  private async buildBaker(transpiler: MJPostgresTranspiler, schema: string, coreSchema: string): Promise<IncrementalBaker> {
    const { RunCodeGenBase, SQLCodeGenBase, initializeConfig, dbPlatform, configInfo } = await import('@memberjunction/codegen-lib');

    if (dbPlatform() !== 'postgresql') {
      this.error('--bake-codegen requires DB_PLATFORM=postgresql with PG_* connection env (the working DB CodeGen objects are captured from).');
    }
    initializeConfig(process.cwd());

    let ds: DataSourceResult;
    try {
      ds = await new RunCodeGenBase().setupDataSource();
    } catch (err) {
      this.error(
        `--bake-codegen could not connect/load metadata from the working PG database: ${err instanceof Error ? err.message : String(err)}. ` +
          'Seed the working DB to the baseline (its __mj views + metadata must exist) before baking.',
      );
    }

    // Seed the BIT/BOOLEAN registry from the LIVE catalog (issue #3839).
    //
    // buildTranspiler() collects BIT columns from the migration set's own baseline, which declares
    // the app's tables and never MJ core's. A migration that seeds `__mj.EntityField` therefore had
    // no type information for AllowsNull / IsVirtual / IsPrimaryKey, so BIT 0/1 reached a
    // PostgreSQL BOOLEAN column and the apply failed with
    //   column "AllowsNull" is of type boolean but expression is of type integer
    // which — because the bake applies as it advances — halted the whole chain.
    //
    // The working database is authoritative and version-correct, which a checked-in column map is
    // not: the copies in the bizapps repos are generated against core 5.37 and already miss columns
    // that exist in 6.x. Failure to read the catalog degrades coercion rather than stopping the
    // run, so it warns loudly instead of aborting.
    try {
      const { rows } = await ds.connection.query(
        `SELECT table_name, column_name
           FROM information_schema.columns
          WHERE data_type = 'boolean' AND table_schema = ANY($1::text[])`,
        [[MJ_CORE_SCHEMA, schema]],
      );
      // The dialect's registry keys are LOWERCASED [table, column] pairs.
      const catalogBitCols: BitColumnRef[] = rows.map((r: { table_name: string; column_name: string }) => [
        r.table_name.toLowerCase(),
        r.column_name.toLowerCase(),
      ]);
      transpiler.addExtraBitColumns(catalogBitCols);
      if (catalogBitCols.length === 0) {
        this.warn('No boolean columns found in the working database — bit/boolean coercion will rely on the baseline registry alone.');
      }
    } catch (err) {
      this.warn(
        `Could not read boolean columns from the working database (${err instanceof Error ? err.message : String(err)}). ` +
          'Seed INSERT/UPDATE values targeting core boolean columns may not be coerced.',
      );
    }

    const sqlGen = new SQLCodeGenBase();
    const db: BakerWorkingDB = {
      apply: async (sql: string) => {
        await ds.connection.query(sql);
      },
      refreshMetadata: async () => {
        await ds.provider.Refresh();
      },
      captureEntity: async (name: string) => {
        const entity = ds.provider.EntityByName(name);
        if (!entity) throw new Error(`--bake-codegen: entity not found in working-DB metadata: ${name}`);
        const r = await sqlGen.generateSingleEntitySQLToSeparateFiles({
          pool: ds.connection,
          entity,
          directory: os.tmpdir(), // inert — writeFiles is false
          onlyPermissions: false,
          writeFiles: false,
          skipExecution: false, // execute → keep the working DB current for later migrations
        });
        return { sql: r.sql ?? '', permissionsSQL: r.permissionsSQL ?? '' };
      },
      // The full CodeGen entity set — mirrors sql_codegen.ts's baseline filter
      // (`IncludeInAPI`, minus configured excludeSchemas). Per-object guards
      // (VirtualEntity / AllowCreate|Update|DeleteAPI / spXGenerated) live inside
      // generateSingleEntitySQLToSeparateFiles, so this only gates at the entity level.
      // Provider order is name-sorted (PostProcessEntityMetadata), matching a full run.
      listBakeableEntities: async () => {
        const excluded = new Set((configInfo.excludeSchemas ?? []).map((s: string) => s.toLowerCase()));
        return ds.provider.Entities
          .filter((e) => e.IncludeInAPI && !excluded.has(e.SchemaName.toLowerCase()))
          .map((e) => e.Name);
      },
    };
    return new IncrementalBaker({ transpiler, db, schema, coreSchema });
  }

  /** Print the split-and-regenerate run summary and the mandatory next steps. */
  private printSplitSummary(
    converted: string[],
    regenReseed: string[],
    needsHand: { file: string; routines: string[] }[],
    withUnhandled: { file: string; count: number }[],
    dryRun: boolean,
    bakeCodegen = false,
  ): void {
    this.log(`\n=== Split-and-Regenerate Summary${bakeCodegen ? ' (inline CodeGen baking)' : ''} ===`);
    this.log(`  transpiled (DDL):        ${converted.length}`);
    const regenNote = bakeCodegen ? 'CodeGen baked inline; metadata via mj sync push' : 'handled by mj codegen + mj sync push';
    this.log(`  regen/reseed only:       ${regenReseed.length}  (${regenNote})`);
    this.log(`  needs hand-authoring:    ${needsHand.length}`);
    this.log(`  with unhandled stmts:    ${withUnhandled.length}`);
    if (dryRun) this.log('  (dry run — no files written)');

    if (needsHand.length > 0) {
      this.logToStderr('\n  ⚠ Hand-written procedural SQL — written as .needs-hand files; finish and rename to .pg.sql:');
      for (const h of needsHand) this.logToStderr(`    ${h.file} — ${h.routines.slice(0, 5).join(', ')}`);
    }
    if (withUnhandled.length > 0) {
      this.logToStderr('\n  ⚠ Statements the AST transpiler could not emit (embedded as comments in the output):');
      for (const u of withUnhandled) this.logToStderr(`    ${u.file} — ${u.count} statement(s)`);
    }

    this.log('\nNext steps to complete the PG migration set (run against a fresh PG database):');
    if (bakeCodegen) {
      this.log('  1. resolve any gaps above (hand-author or LLM last-mile, then rename .needs-hand)');
      this.log('  2. mj migrate                  # apply DDL + inline-baked CodeGen objects (no codegen step)');
      this.log('  3. mj sync push                # re-seed mj-sync metadata');
      this.log('  4. schema/row-count diff vs a fresh SQL Server build to confirm parity');
    } else {
      this.log('  1. resolve any gaps above (hand-author or LLM last-mile, then rename .needs-hand)');
      this.log('  2. mj migrate                  # apply the transpiled DDL (.pg.sql)');
      this.log('  3. mj codegen                  # regenerate CodeGen SQL objects natively (DB_PLATFORM=postgresql)');
      this.log('  4. mj sync push                # re-seed mj-sync metadata');
      this.log('  5. schema/row-count diff vs a fresh SQL Server build to confirm parity');
    }
  }

  /**
   * Discovers T-SQL migrations that don't have a corresponding PG counterpart.
   *
   * A T-SQL file like `V202604060452__v5.24.x__Foo.sql` maps to
   * `V202604060452__v5.24.x__Foo.pg.sql` in the output directory; a `.pg-only.sql`
   * variant also counts as a counterpart (manual PG-specific override). Counterpart
   * presence is the only filter — baselines (B__) convert like any other file when
   * their `.pg.sql` is missing (statement-mode classification handles them).
   * `.needs-hand` artifacts are deliberately NOT counterparts: a migration stays
   * unconverted until its gaps are resolved and the file is renamed to `.pg.sql`.
   */
  private discoverUnconverted(
    sourceDir: string,
    outputDir: string,
    specificFile: string | undefined,
  ): Array<{ SourceFile: string; OutputFile: string }> {
    const sourceFiles = fs.readdirSync(sourceDir)
      .filter((f: string) => f.endsWith('.sql') && !f.endsWith('.pg.sql') && !f.endsWith('.pg-only.sql'))
      .sort();

    if (specificFile && !sourceFiles.includes(specificFile)) {
      this.error(`--file ${specificFile} not found in ${sourceDir}`);
    }

    const outputFiles = new Set(
      fs.readdirSync(outputDir)
        .filter((f: string) => f.endsWith('.pg.sql') || f.endsWith('.pg-only.sql'))
    );

    const unconverted: Array<{ SourceFile: string; OutputFile: string }> = [];

    for (const sourceFile of sourceFiles) {
      // If a specific file was requested, only convert that one
      if (specificFile && sourceFile !== specificFile) {
        continue;
      }

      // Generate expected PG filename: replace .sql with .pg.sql
      const pgFileName = sourceFile.replace(/\.sql$/, '.pg.sql');

      // Check if PG version already exists
      if (!outputFiles.has(pgFileName)) {
        // Also check if a .pg-only.sql variant exists (manual PG-specific override)
        const pgOnlyFileName = sourceFile.replace(/\.sql$/, '.pg-only.sql');
        if (!outputFiles.has(pgOnlyFileName)) {
          unconverted.push({
            SourceFile: sourceFile,
            OutputFile: pgFileName,
          });
        }
      }
    }

    return unconverted;
  }

  private mergeStats(target: ConversionStats, source: ConversionStats): void {
    target.TotalBatches += source.TotalBatches;
    target.Converted += source.Converted;
    target.Skipped += source.Skipped;
    target.Errors += source.Errors;
    target.TablesCreated += source.TablesCreated;
    target.ViewsCreated += source.ViewsCreated;
    target.ProceduresConverted += source.ProceduresConverted;
    target.FunctionsConverted += source.FunctionsConverted;
    target.TriggersConverted += source.TriggersConverted;
    target.IndexesCreated += source.IndexesCreated;
    target.InsertsConverted += source.InsertsConverted;
    target.GrantsConverted += source.GrantsConverted;
    target.FKConstraints += source.FKConstraints;
    target.CheckConstraints += source.CheckConstraints;
    target.CommentsConverted += source.CommentsConverted;
    target.Gaps += source.Gaps;
    target.ErrorBatches.push(...source.ErrorBatches);
    target.SkippedBatches.push(...source.SkippedBatches);
    target.GapBatches.push(...source.GapBatches);
  }
}
