import { Command, Flags } from '@oclif/core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IncrementalBaker } from '@memberjunction/sql-converter';
import type { BakerWorkingDB } from '@memberjunction/sql-converter';
import { MJPostgresTranspiler } from '@memberjunction/sqlglot-ts';
// Type-only: erased at runtime so a non-bake CLI invocation never loads the heavy codegen graph.
import type { DataSourceResult } from '@memberjunction/codegen-lib';

/**
 * Re-bake the post-baseline PG migration set with INLINE NATIVE CodeGen (Path C), so the set
 * deploys with `mj migrate` alone — no `mj codegen` step.
 *
 * Unlike `convert --bake-codegen` (which bakes UNCONVERTED migrations forward), `rebake` re-bakes
 * migrations that already have a committed `.pg.sql`: it advances a live working DB by applying
 * each migration's known-good committed file in order (which keeps dependent views consistent and
 * registers new entities), then captures native CodeGen read-only and writes the baked file. A
 * migration with a transpile gap (unhandled statement / hand-procedural) keeps its committed file.
 *
 * Requires a LIVE working PG database (DB_PLATFORM=postgresql + PG_* env, as `mj codegen`) seeded
 * to the latest baseline; the command brings it forward as it re-bakes.
 */
export default class MigrateRebake extends Command {
  static description = 'Re-bake the post-baseline PG migration set with inline native CodeGen';

  static examples = [
    '<%= config.bin %> migrate rebake',
    '<%= config.bin %> migrate rebake --baseline-floor V202605291452 --dry-run',
  ];

  static flags = {
    'source-dir': Flags.string({ description: 'Source T-SQL migrations directory', default: './migrations/v5' }),
    'output-dir': Flags.string({ description: 'PG migrations directory (committed files read here + baked output written here)', default: './migrations-pg/v5' }),
    schema: Flags.string({ description: 'Target schema name', default: '__mj' }),
    'baseline-floor': Flags.string({ description: 'Re-bake migrations strictly AFTER this version key (default: the latest B* in output-dir)' }),
    'dry-run': Flags.boolean({ description: 'Report what would be re-baked without writing files', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MigrateRebake);
    const sourceDir = path.resolve(flags['source-dir']);
    const outputDir = path.resolve(flags['output-dir']);
    if (!fs.existsSync(sourceDir)) this.error(`Source directory not found: ${sourceDir}`);
    if (!fs.existsSync(outputDir)) this.error(`Output directory not found: ${outputDir}`);

    const floor = flags['baseline-floor'] ?? this.latestBaselineFloor(outputDir);
    this.log(`Re-baking migrations after baseline floor: ${floor}`);

    const migrations = this.postBaselineMigrations(sourceDir, floor);
    if (migrations.length === 0) {
      this.log('No post-baseline migrations to re-bake.');
      return;
    }
    this.log(`${migrations.length} post-baseline migration(s) to re-bake.\n`);

    const transpiler = await this.buildTranspiler(sourceDir);
    const { baker, dispose } = await this.buildBaker(transpiler, flags.schema);

    const summary = { baked: [] as string[], preserved: [] as string[], skipped: [] as string[] };
    try {
      for (const m of migrations) {
        const ssSql = fs.readFileSync(path.join(sourceDir, m.source), 'utf8');
        const committedPath = this.committedCounterpart(outputDir, m.outName, m.source);
        if (!committedPath) {
          this.warn(`${m.source}: no committed PG counterpart in output-dir — skipped (use convert --bake-codegen for new migrations).`);
          summary.skipped.push(m.source);
          continue;
        }
        // mj-sync metadata is owned by `mj sync push`, not CodeGen — preserve it verbatim.
        if (/Metadata_Sync/i.test(m.source)) {
          summary.preserved.push(m.source);
          this.log(`  kept    ${m.source}  (metadata-sync — committed preserved)`);
          continue;
        }
        const committed = fs.readFileSync(committedPath, 'utf8');
        try {
          const result = await baker.bakeMigration(ssSql, m.source, committed);
          if (result.mode === 'baked') {
            if (!flags['dry-run']) fs.writeFileSync(committedPath, result.pgSQL);
            summary.baked.push(m.source);
            this.log(`  baked   ${m.source}  (E(M)=${result.affectedEntities.length})`);
          } else {
            summary.preserved.push(m.source); // transpile gap — committed left in place
            this.log(`  kept    ${m.source}  (transpile gap — committed preserved)`);
          }
        } catch (err) {
          // Advancing or capturing this migration failed (e.g. a committed file that only applies
          // under Skyway). Keep the committed file as-is and carry on so one migration can't abort
          // the whole re-bake; the working DB simply lacks this migration's (non-schema) change.
          summary.preserved.push(m.source);
          this.warn(`${m.source}: re-bake failed (${err instanceof Error ? err.message : String(err)}) — committed preserved.`);
        }
      }
    } finally {
      await dispose();
    }

    this.log('\n=== Re-bake Summary ===');
    this.log(`  baked native:        ${summary.baked.length}`);
    this.log(`  preserved committed: ${summary.preserved.length}`);
    this.log(`  skipped (no PG):     ${summary.skipped.length}`);
    if (flags['dry-run']) this.log('  (dry run — no files written)');
    this.log('\nDeploy: mj migrate  +  mj sync push   (no mj codegen step)');

    // setupDataSource opened pg pools that keep the event loop alive; mirror `mj codegen`.
    process.exit(0);
  }

  /** Highest `B<version>__...` baseline in the output dir → its version key is the floor. */
  private latestBaselineFloor(outputDir: string): string {
    const baselines = fs.readdirSync(outputDir).filter((f) => /^B\d.*\.pg\.sql$/.test(f)).sort();
    if (baselines.length === 0) this.error('No baseline (B*.pg.sql) found in output-dir; pass --baseline-floor.');
    return baselines[baselines.length - 1].split('__')[0]; // e.g. "B202605291452" → compared lexically below
  }

  /** SS V-migrations whose version key sorts strictly after the floor (committed order). */
  private postBaselineMigrations(sourceDir: string, floor: string): Array<{ source: string; outName: string }> {
    const floorKey = floor.replace(/^B/, 'V'); // baseline keys start with B; migrations with V
    return fs
      .readdirSync(sourceDir)
      .filter((f) => /^V.*\.sql$/.test(f) && !f.endsWith('.pg.sql') && !f.endsWith('.pg-only.sql'))
      .filter((f) => f.split('__')[0] > floorKey)
      .sort()
      .map((source) => ({ source, outName: source.replace(/\.sql$/, '.pg.sql') }));
  }

  /** Committed PG counterpart: `.pg.sql` preferred, else a hand-authored `.pg-only.sql`. */
  private committedCounterpart(outputDir: string, outName: string, source: string): string | null {
    const pg = path.join(outputDir, outName);
    if (fs.existsSync(pg)) return pg;
    const pgOnly = path.join(outputDir, source.replace(/\.sql$/, '.pg-only.sql'));
    return fs.existsSync(pgOnly) ? pgOnly : null;
  }

  /** AST transpiler with the cross-file BIT-column registry from the baselines (see convert.ts). */
  private async buildTranspiler(sourceDir: string): Promise<MJPostgresTranspiler> {
    const probe = new MJPostgresTranspiler();
    try {
      await probe.preflight();
    } catch (err) {
      this.error(err instanceof Error ? err.message : String(err));
    }
    const baselines = fs.readdirSync(sourceDir).filter((f) => /^B\d.*\.sql$/.test(f) && !f.endsWith('.pg.sql') && !f.endsWith('.pg-only.sql')).sort();
    const bitColumns: string[] = [];
    for (const b of baselines) {
      try {
        bitColumns.push(...(await probe.collectBitColumns(fs.readFileSync(path.join(sourceDir, b), 'utf8'))));
      } catch (err) {
        this.warn(`Bit-column collection failed for ${b}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return new MJPostgresTranspiler({ extraBitColumns: bitColumns });
  }

  /**
   * Wire the working-DB capabilities to a live PG connection. The codegen engine is loaded with a
   * dynamic import (Rule 8 case 3 — heavy module, opt-in path only); the matching `import type` is
   * erased at runtime so it does not defeat the deferral.
   */
  private async buildBaker(
    transpiler: MJPostgresTranspiler,
    schema: string,
  ): Promise<{ baker: IncrementalBaker; dispose: () => Promise<void> }> {
    const { RunCodeGenBase, SQLCodeGenBase, initializeConfig, dbPlatform } = await import('@memberjunction/codegen-lib');
    const { Metadata } = await import('@memberjunction/core');

    if (dbPlatform() !== 'postgresql') {
      this.error('migrate rebake requires DB_PLATFORM=postgresql with PG_* connection env (the working DB CodeGen is captured from).');
    }
    initializeConfig(process.cwd());

    let ds: DataSourceResult;
    try {
      ds = await new RunCodeGenBase().setupDataSource();
    } catch (err) {
      this.error(
        `migrate rebake could not connect/load metadata from the working PG database: ${err instanceof Error ? err.message : String(err)}. ` +
          'Seed the working DB to the latest baseline before re-baking.',
      );
    }
    this.log(`  working DB: ${ds.connectionInfo}\n`);

    const sqlGen = new SQLCodeGenBase();
    const md = new Metadata();
    const db: BakerWorkingDB = {
      // Committed files may still carry the `${flyway:defaultSchema}` macro (Skyway substitutes it
      // at deploy); raw pg.query can't, so substitute before applying to advance the working DB.
      apply: async (sql: string) => { await ds.connection.query(sql.replaceAll('${flyway:defaultSchema}', schema)); },
      refreshMetadata: async () => { await ds.provider.Refresh(); },
      captureEntity: async (name: string) => {
        const entity = md.EntityByName(name);
        if (!entity) throw new Error(`migrate rebake: entity not found in working-DB metadata: ${name}`);
        const r = await sqlGen.generateSingleEntitySQLToSeparateFiles({
          pool: ds.connection,
          entity,
          directory: os.tmpdir(),
          onlyPermissions: false,
          writeFiles: false,
          skipExecution: true, // READ-ONLY: capture only; the committed file advances the working DB
        });
        return { sql: r.sql ?? '', permissionsSQL: r.permissionsSQL ?? '' };
      },
    };
    return { baker: new IncrementalBaker({ transpiler, db, schema }), dispose: async () => {} };
  }
}
