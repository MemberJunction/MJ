import { Command, Flags } from '@oclif/core';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ora from 'ora-classic';
import chalk from 'chalk';

import { ResolveConnection, IsTty } from '../../baseline/cli-helpers';
import { OpenConnection } from '../../baseline/connection';
import { IntrospectMssql } from '../../baseline/introspector-mssql';
import { IntrospectPostgres } from '../../baseline/introspector-postgres';
import { DumpTables } from '../../baseline/data-dumper';
import { EmitBaselineTsql } from '../../baseline/emitter';
import { CompareSnapshots } from '../../baseline/comparator';
import { RenderJson, RenderMarkdown } from '../../baseline/report';
import {
  BaselineFilename,
  ComputeAutoBaselineStamp,
  DiscoverMigrationsSourceDir,
  FindLatestVersionedMigration,
} from '../../baseline/util';

export default class BaselineRoundtrip extends Command {
  static description =
    'Build a baseline from a V-stack database, apply it to a fresh DB, and prove byte-equivalence.';

  static examples = [
    '<%= config.bin %> <%= command.id %> --source MJ_BL_Stack --target MJ_BL_New                          # auto: within-major',
    '<%= config.bin %> <%= command.id %> --baseline-version 6.0 --source MJ_BL_Stack --target MJ_BL_New   # explicit major-boundary',
    '<%= config.bin %> <%= command.id %> --source-dir ./migrations/v5 --source MJ_BL_Stack --target MJ_BL_New',
  ];

  static flags = {
    'baseline-version': Flags.string({
      description:
        'Major.Minor version stamp. Omit to auto-detect from --source-dir (within-major rebaseline).',
    }),
    'source-dir': Flags.string({
      description:
        'Migrations source directory used to auto-detect baseline version + timestamp when --baseline-version is omitted. ' +
        'Defaults to the highest migrations/v*/ near cwd.',
    }),
    'description': Flags.string({ description: 'Header description.', default: 'MemberJunction Baseline' }),
    'dialect': Flags.string({
      description: 'Dialect to test. PG path runs the converter via /pg-migrate first.',
      options: ['mssql', 'postgres'],
      default: 'mssql',
    }),
    'source': Flags.string({
      description: 'Database name with the V-stack already applied (used as comparison gold standard).',
      required: true,
    }),
    'target': Flags.string({
      description: 'Empty database name to apply the new baseline to.',
      required: true,
    }),
    'out': Flags.string({ description: 'Output directory for baseline file + reports.', default: '.' }),
    'apply-cmd': Flags.string({
      description: 'Command template to apply the baseline. Tokens: {file} {database}. Defaults to sqlcmd.',
    }),
    'row-compare': Flags.string({
      description: 'Row compare mode passed to the comparator.',
      options: ['full', 'hash', 'counts', 'none'],
      default: 'full',
    }),
    'fail-on-diff': Flags.boolean({ default: true }),
    'keep-target': Flags.boolean({
      description: 'Do not drop the target database after run (useful for debugging diffs).',
      default: false,
    }),
    'verbose': Flags.boolean({ default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BaselineRoundtrip);
    const { baselineVersion, generatedAtUtc, autoSource } = this.resolveVersionAndStamp(flags);
    if (autoSource) {
      this.log(chalk.dim(`  Auto-detected baseline: v${baselineVersion}.x (from ${autoSource.filename})`));
      this.log(chalk.dim(`  Auto timestamp        : ${autoSource.timestamp} + 1m`));
    }
    const dialect = flags.dialect as 'mssql' | 'postgres';
    const useSpinner = IsTty();
    const spinner = useSpinner ? ora() : null;
    const phase = (text: string) => { if (spinner) { spinner.text = text; if (!spinner.isSpinning) spinner.start(); } else this.log(`• ${text}`); };
    const succeed = (text: string) => spinner ? spinner.succeed(text) : this.log(`✓ ${text}`);
    const fail = (text: string) => spinner ? spinner.fail(text) : this.logToStderr(`✗ ${text}`);

    const sourceParams = ResolveConnection({ database: flags.source }, 'mssql');
    fs.mkdirSync(flags.out, { recursive: true });

    // 1. Introspect source + dump rows
    phase(`Connecting to ${sourceParams.Database} (gold)`);
    const sourceDb = await OpenConnection(sourceParams);
    let sourceSnapshot;
    let sourceDumps;
    try {
      succeed(`Connected to ${sourceParams.Database}`);
      phase('Introspecting gold database');
      sourceSnapshot = await IntrospectMssql(sourceDb);
      succeed(`Gold: ${sourceSnapshot.tables.length} tables`);
      phase('Dumping all rows from gold');
      sourceDumps = await DumpTables(sourceDb, sourceSnapshot.tables, { ExcludedTables: new Set() });
      succeed(`Gold: dumped ${sourceDumps.reduce((s, d) => s + d.rowCount, 0).toLocaleString()} rows`);
    } finally {
      await sourceDb.close();
    }

    // 2. Emit baseline
    phase('Emitting baseline SQL');
    const sql = EmitBaselineTsql({
      Snapshot: sourceSnapshot,
      DataDumps: sourceDumps,
      Options: {
        baselineVersion,
        description: flags.description,
        generatedAtUtc,
        includeData: true,
        excludedDataTables: new Set(['flyway_schema_history', 'dbo.flyway_schema_history']),
        batchSize: 1000,
      },
    });
    const filename = BaselineFilename({ generatedAtUtc, baselineVersion });
    const baselinePath = path.resolve(flags.out, filename);
    fs.writeFileSync(baselinePath, sql, 'utf8');
    succeed(`Baseline emitted: ${baselinePath}`);

    // 3. (PG only) convert the just-emitted baseline to PostgreSQL through the
    //    SAME rule-based BatchConverter every migration uses. `mj migrate convert`
    //    discovers by --source-dir/--file and writes `<baseline>.pg.sql` into
    //    --output-dir, so we point all three at the baseline we emitted in step 2.
    //    (Earlier this called nonexistent `--input/--output` flags, which always
    //    failed — hence the old "stub, run /pg-migrate manually" note.)
    let applyPath = baselinePath;
    if (dialect === 'postgres') {
      phase('Converting baseline to Postgres via mj migrate convert');
      const pgPath = baselinePath.replace(/\.sql$/, '.pg.sql');
      const outDir = path.dirname(baselinePath);
      // Remove any stale output so migrate convert (which skips files that already
      // have a .pg.sql) always re-converts the freshly emitted baseline.
      fs.rmSync(pgPath, { force: true });
      const result = spawnSync(
        'mj',
        ['migrate', 'convert', '--source-dir', outDir, '--output-dir', outDir, '--file', filename],
        { stdio: 'inherit' },
      );
      if (result.status !== 0) {
        fail('PG conversion failed — fix the converter rule and re-run, or run /pg-migrate for the full pipeline.');
        throw new Error('PG conversion failed');
      }
      succeed(`PG baseline written: ${pgPath}`);
      applyPath = pgPath;
    }

    // 4. Apply baseline to target
    const targetParams = ResolveConnection({ database: flags.target }, dialect);
    phase(`Applying baseline to ${targetParams.Database}`);
    const applyResult = applyBaseline(applyPath, targetParams, flags['apply-cmd']);
    if (applyResult.status !== 0) {
      fail(`Apply failed (exit ${applyResult.status})`);
      throw new Error('Baseline apply failed');
    }
    succeed(`Applied baseline to ${targetParams.Database}`);

    // 5. Compare target vs source
    phase('Re-introspecting target for comparison');
    const targetDb = await OpenConnection(targetParams);
    let report;
    try {
      const targetSnapshot = dialect === 'mssql'
        ? await IntrospectMssql(targetDb)
        : await IntrospectPostgres(targetDb);
      const targetDumps = await DumpTables(targetDb, targetSnapshot.Tables, { ExcludedTables: new Set() });
      succeed(`Target: ${targetSnapshot.Tables.length} tables, ${targetDumps.reduce((s, d) => s + d.RowCount, 0).toLocaleString()} rows`);

      phase('Comparing snapshots');
      report = CompareSnapshots({
        Left: { snapshot: sourceSnapshot, data: sourceDumps, label: sourceParams.Database },
        Right: { snapshot: targetSnapshot, data: targetDumps, label: targetParams.Database },
        Options: {
          RowCompareMode: flags['row-compare'] as 'full' | 'hash' | 'counts' | 'none',
          RowHashAlgo: 'sha256',
          IgnorePattern: /^flyway_schema_history$/i,
          RowDiffSampleLimit: 100,
        },
      });
      report.isClean
        ? succeed('Comparison: CLEAN ✓ baseline matches V-stack end-state')
        : fail(`Comparison: ${report.summary.objectsWithDiffs} object diffs, ${report.summary.totalRowDiffs} row diffs`);
    } finally {
      await targetDb.close();
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.resolve(flags.out, `baseline-compare-${stamp}.json`);
    const mdPath = path.resolve(flags.out, `baseline-compare-${stamp}.md`);
    fs.writeFileSync(jsonPath, RenderJson(report), 'utf8');
    fs.writeFileSync(mdPath, RenderMarkdown(report), 'utf8');
    this.log('');
    this.log(chalk.bold(report.isClean ? chalk.green('ROUNDTRIP CLEAN ✓') : chalk.red('ROUNDTRIP HAS DIFFS ✗')));
    this.log(chalk.dim(`  Baseline : ${baselinePath}`));
    this.log(chalk.dim(`  Reports  : ${jsonPath}`));
    this.log(chalk.dim(`             ${mdPath}`));

    if (flags['fail-on-diff'] && !report.isClean) {
      this.exit(2);
    }
  }

  /** Same logic as in `BaselineBuild`: explicit version → now; otherwise auto-detect. */
  private resolveVersionAndStamp(flags: {
    'baseline-version'?: string;
    'source-dir'?: string;
  }): {
    baselineVersion: string;
    generatedAtUtc: Date;
    autoSource: { filename: string; timestamp: string } | null;
  } {
    const explicit = flags['baseline-version'];
    if (explicit) {
      if (!/^\d+\.\d+$/.test(explicit)) {
        this.error(`--baseline-version must be Major.Minor (got "${explicit}")`);
      }
      return { baselineVersion: explicit, generatedAtUtc: new Date(), autoSource: null };
    }
    const sourceDir = flags['source-dir'] ?? DiscoverMigrationsSourceDir(process.cwd());
    if (!sourceDir) {
      this.error(
        'No --baseline-version provided and could not auto-discover a migrations directory. ' +
          'Pass --source-dir or --baseline-version.',
      );
    }
    const latest = FindLatestVersionedMigration(sourceDir);
    if (!latest) {
      this.error(
        `No V-files found in ${sourceDir}. Pass --baseline-version explicitly or point --source-dir at a folder with V<ts>__v<Major>.<Minor>...sql migrations.`,
      );
    }
    const { generatedAtUtc } = ComputeAutoBaselineStamp(latest.Timestamp);
    return {
      baselineVersion: latest.MajorMinor,
      generatedAtUtc,
      autoSource: { filename: latest.Filename, timestamp: latest.Timestamp },
    };
  }
}

function applyBaseline(file: string, params: ReturnType<typeof ResolveConnection>, applyCmd?: string): { status: number | null } {
  if (applyCmd) {
    const cmd = applyCmd.replace('{file}', file).replace('{database}', params.Database);
    const result = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
    return { status: result.status };
  }
  if (params.Dialect === 'mssql') {
    const args = [
      '-S', `${params.Host},${params.port ?? 1433}`,
      '-U', params.User,
      '-P', params.Password,
      '-d', params.Database,
      '-i', file,
      '-b',
    ];
    if (params.trustServerCertificate) args.push('-C');
    const result = spawnSync('sqlcmd', args, { stdio: 'inherit' });
    return { status: result.status };
  } else {
    const env = { ...process.env, PGPASSWORD: params.Password };
    const args = [
      '-h', params.Host,
      '-p', String(params.port ?? 5432),
      '-U', params.User,
      '-d', params.Database,
      '-v', 'ON_ERROR_STOP=1',
      '-f', file,
    ];
    const result = spawnSync('psql', args, { stdio: 'inherit', env });
    return { status: result.status };
  }
}
