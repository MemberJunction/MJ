import { Command, Flags } from '@oclif/core';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ora from 'ora-classic';
import chalk from 'chalk';

import { resolveConnection, isTty } from '../../baseline/cli-helpers';
import { openConnection } from '../../baseline/connection';
import { introspectMssql } from '../../baseline/introspector-mssql';
import { introspectPostgres } from '../../baseline/introspector-postgres';
import { dumpTables } from '../../baseline/data-dumper';
import { emitBaselineTsql } from '../../baseline/emitter';
import { compareSnapshots } from '../../baseline/comparator';
import { renderJson, renderMarkdown } from '../../baseline/report';
import {
  baselineFilename,
  computeAutoBaselineStamp,
  discoverMigrationsSourceDir,
  findLatestVersionedMigration,
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
    const useSpinner = isTty();
    const spinner = useSpinner ? ora() : null;
    const phase = (text: string) => { if (spinner) { spinner.text = text; if (!spinner.isSpinning) spinner.start(); } else this.log(`• ${text}`); };
    const succeed = (text: string) => spinner ? spinner.succeed(text) : this.log(`✓ ${text}`);
    const fail = (text: string) => spinner ? spinner.fail(text) : this.logToStderr(`✗ ${text}`);

    const sourceParams = resolveConnection({ database: flags.source }, 'mssql');
    fs.mkdirSync(flags.out, { recursive: true });

    // 1. Introspect source + dump rows
    phase(`Connecting to ${sourceParams.database} (gold)`);
    const sourceDb = await openConnection(sourceParams);
    let sourceSnapshot;
    let sourceDumps;
    try {
      succeed(`Connected to ${sourceParams.database}`);
      phase('Introspecting gold database');
      sourceSnapshot = await introspectMssql(sourceDb);
      succeed(`Gold: ${sourceSnapshot.tables.length} tables`);
      phase('Dumping all rows from gold');
      sourceDumps = await dumpTables(sourceDb, sourceSnapshot.tables, { excludedTables: new Set() });
      succeed(`Gold: dumped ${sourceDumps.reduce((s, d) => s + d.rowCount, 0).toLocaleString()} rows`);
    } finally {
      await sourceDb.close();
    }

    // 2. Emit baseline
    phase('Emitting baseline SQL');
    const sql = emitBaselineTsql({
      snapshot: sourceSnapshot,
      dataDumps: sourceDumps,
      options: {
        baselineVersion,
        description: flags.description,
        generatedAtUtc,
        includeData: true,
        excludedDataTables: new Set(['flyway_schema_history', 'dbo.flyway_schema_history']),
        batchSize: 1000,
      },
    });
    const filename = baselineFilename({ generatedAtUtc, baselineVersion });
    const baselinePath = path.resolve(flags.out, filename);
    fs.writeFileSync(baselinePath, sql, 'utf8');
    succeed(`Baseline emitted: ${baselinePath}`);

    // 3. (PG only) convert via /pg-migrate toolchain — currently delegated to a
    //    stub `mj migrate convert` invocation; user must run /pg-migrate manually
    //    to refine. We try the CLI command first.
    let applyPath = baselinePath;
    if (dialect === 'postgres') {
      phase('Converting baseline to Postgres via mj migrate convert');
      const pgPath = baselinePath.replace(/\.sql$/, '.pg.sql');
      const result = spawnSync('mj', ['migrate', 'convert', '--input', baselinePath, '--output', pgPath], {
        stdio: 'inherit',
      });
      if (result.status !== 0) {
        fail('PG conversion failed — run /pg-migrate manually for richer conversion.');
        throw new Error('PG conversion failed');
      }
      succeed(`PG baseline written: ${pgPath}`);
      applyPath = pgPath;
    }

    // 4. Apply baseline to target
    const targetParams = resolveConnection({ database: flags.target }, dialect);
    phase(`Applying baseline to ${targetParams.database}`);
    const applyResult = applyBaseline(applyPath, targetParams, flags['apply-cmd']);
    if (applyResult.status !== 0) {
      fail(`Apply failed (exit ${applyResult.status})`);
      throw new Error('Baseline apply failed');
    }
    succeed(`Applied baseline to ${targetParams.database}`);

    // 5. Compare target vs source
    phase('Re-introspecting target for comparison');
    const targetDb = await openConnection(targetParams);
    let report;
    try {
      const targetSnapshot = dialect === 'mssql'
        ? await introspectMssql(targetDb)
        : await introspectPostgres(targetDb);
      const targetDumps = await dumpTables(targetDb, targetSnapshot.tables, { excludedTables: new Set() });
      succeed(`Target: ${targetSnapshot.tables.length} tables, ${targetDumps.reduce((s, d) => s + d.rowCount, 0).toLocaleString()} rows`);

      phase('Comparing snapshots');
      report = compareSnapshots({
        left: { snapshot: sourceSnapshot, data: sourceDumps, label: sourceParams.database },
        right: { snapshot: targetSnapshot, data: targetDumps, label: targetParams.database },
        options: {
          rowCompareMode: flags['row-compare'] as 'full' | 'hash' | 'counts' | 'none',
          rowHashAlgo: 'sha256',
          ignorePattern: /^flyway_schema_history$/i,
          rowDiffSampleLimit: 100,
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
    fs.writeFileSync(jsonPath, renderJson(report), 'utf8');
    fs.writeFileSync(mdPath, renderMarkdown(report), 'utf8');
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
    const sourceDir = flags['source-dir'] ?? discoverMigrationsSourceDir(process.cwd());
    if (!sourceDir) {
      this.error(
        'No --baseline-version provided and could not auto-discover a migrations directory. ' +
          'Pass --source-dir or --baseline-version.',
      );
    }
    const latest = findLatestVersionedMigration(sourceDir);
    if (!latest) {
      this.error(
        `No V-files found in ${sourceDir}. Pass --baseline-version explicitly or point --source-dir at a folder with V<ts>__v<Major>.<Minor>...sql migrations.`,
      );
    }
    const { generatedAtUtc } = computeAutoBaselineStamp(latest.timestamp);
    return {
      baselineVersion: latest.majorMinor,
      generatedAtUtc,
      autoSource: { filename: latest.filename, timestamp: latest.timestamp },
    };
  }
}

function applyBaseline(file: string, params: ReturnType<typeof resolveConnection>, applyCmd?: string): { status: number | null } {
  if (applyCmd) {
    const cmd = applyCmd.replace('{file}', file).replace('{database}', params.database);
    const result = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
    return { status: result.status };
  }
  if (params.dialect === 'mssql') {
    const args = [
      '-S', `${params.host},${params.port ?? 1433}`,
      '-U', params.user,
      '-P', params.password,
      '-d', params.database,
      '-i', file,
      '-b',
    ];
    if (params.trustServerCertificate) args.push('-C');
    const result = spawnSync('sqlcmd', args, { stdio: 'inherit' });
    return { status: result.status };
  } else {
    const env = { ...process.env, PGPASSWORD: params.password };
    const args = [
      '-h', params.host,
      '-p', String(params.port ?? 5432),
      '-U', params.user,
      '-d', params.database,
      '-v', 'ON_ERROR_STOP=1',
      '-f', file,
    ];
    const result = spawnSync('psql', args, { stdio: 'inherit', env });
    return { status: result.status };
  }
}
