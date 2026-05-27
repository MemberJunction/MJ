import { Command, Flags } from '@oclif/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ora from 'ora-classic';
import chalk from 'chalk';

import { resolveConnection, isTty } from '../../baseline/cli-helpers';
import { openConnection } from '../../baseline/connection';
import { introspectMssql } from '../../baseline/introspector-mssql';
import { dumpTables } from '../../baseline/data-dumper';
import { emitBaselineTsql } from '../../baseline/emitter';
import {
  baselineFilename,
  computeAutoBaselineStamp,
  discoverMigrationsSourceDir,
  findLatestVersionedMigration,
} from '../../baseline/util';

export default class BaselineBuild extends Command {
  static description = 'Generate a deterministic baseline SQL script from the END-STATE of a migrated MSSQL database.';

  static examples = [
    '<%= config.bin %> <%= command.id %> --out ./migrations/v5/                          # auto: within-major rebaseline',
    '<%= config.bin %> <%= command.id %> --source-dir ./migrations/v5 --out ./migrations/v5/',
    '<%= config.bin %> <%= command.id %> --baseline-version 6.0 --out ./migrations/v6/  # explicit major-boundary',
    '<%= config.bin %> <%= command.id %> --baseline-version 5.32 --database MJ_BL_Stack --out /tmp/baseline/',
  ];

  static flags = {
    'baseline-version': Flags.string({
      description:
        'Baseline version stamp in Major.Minor format (literal x is appended for patch, matching the V-file convention). ' +
        'Omit to auto-detect from --source-dir (within-major rebaseline mode).',
    }),
    'source-dir': Flags.string({
      description:
        'Migrations source directory (e.g. ./migrations/v5). Used to auto-detect the next baseline ' +
        'version + timestamp when --baseline-version is omitted. Defaults to the highest migrations/v*/ ' +
        'directory walked up from cwd.',
    }),
    'description': Flags.string({
      description: 'Human-readable description embedded in the file header.',
      default: 'MemberJunction Baseline',
    }),
    'database': Flags.string({
      description: 'Override database name (host/user/password come from MJ config).',
    }),
    'out': Flags.string({
      description: 'Output directory. Filename is auto-generated.',
      default: '.',
    }),
    'exclude-data': Flags.string({
      description: 'Comma-separated list of tables (schema-qualified or not) to skip data dump for.',
      default: '',
    }),
    'batch-size': Flags.integer({
      description: 'Rows per INSERT batch.',
      default: 1000,
    }),
    'no-data': Flags.boolean({
      description: 'Emit schema only, no data inserts.',
      default: false,
    }),
    'verbose': Flags.boolean({
      description: 'Print per-object progress.',
      default: false,
    }),
    'dry-run': Flags.boolean({
      description: 'Print to stdout instead of writing a file.',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BaselineBuild);

    const { baselineVersion, generatedAtUtc, autoSource } = this.resolveVersionAndStamp(flags);

    const connectionParams = resolveConnection({ database: flags.database }, 'mssql');

    const excludedDataTables = new Set<string>(
      flags['exclude-data']
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .map((s) => (s.includes('.') ? s : `dbo.${s}`)),
    );
    excludedDataTables.add('flyway_schema_history');
    excludedDataTables.add('dbo.flyway_schema_history');

    const useSpinner = isTty();
    const spinner = useSpinner ? ora() : null;

    const phase = (text: string) => {
      if (spinner) {
        spinner.text = text;
        if (!spinner.isSpinning) spinner.start();
      } else {
        this.log(`• ${text}`);
      }
    };
    const succeed = (text: string) => spinner ? spinner.succeed(text) : this.log(`✓ ${text}`);
    const fail = (text: string) => spinner ? spinner.fail(text) : this.logToStderr(`✗ ${text}`);

    const startedAt = Date.now();
    if (autoSource) {
      this.log(chalk.dim(`  Auto-detected baseline: v${baselineVersion}.x (from ${autoSource.filename})`));
      this.log(chalk.dim(`  Auto timestamp        : ${autoSource.timestamp} + 1m`));
    }
    phase(`Connecting to ${connectionParams.database}@${connectionParams.host}`);
    const db = await openConnection(connectionParams);

    try {
      succeed(`Connected to ${connectionParams.database}`);

      phase(`Introspecting schema`);
      const snapshot = await introspectMssql(db, {
        onPhase: (p) => { if (flags.verbose) this.log(`  - ${p}`); },
      });
      succeed(
        `Introspected ${snapshot.tables.length} tables, ` +
        `${snapshot.views.length} views, ` +
        `${snapshot.procedures.length} procs, ` +
        `${snapshot.functions.length} functions`,
      );

      const dumps = flags['no-data'] ? [] : await (async () => {
        phase(`Dumping table data (every row, every column)`);
        const result = await dumpTables(
          db,
          snapshot.tables,
          { excludedTables: excludedDataTables },
          {
            onTable: (table, count) => {
              if (flags.verbose) this.log(`    ${table.schema}.${table.name}: ${count} rows`);
              else if (spinner) spinner.text = `Dumping ${table.schema}.${table.name} (${count} rows)`;
            },
          },
        );
        const totalRows = result.reduce((sum, d) => sum + d.rowCount, 0);
        succeed(`Dumped ${totalRows.toLocaleString()} rows across ${result.length} tables`);
        return result;
      })();

      phase('Emitting baseline SQL');
      const sql = emitBaselineTsql({
        snapshot,
        dataDumps: dumps,
        options: {
          baselineVersion,
          description: flags.description,
          generatedAtUtc,
          includeData: !flags['no-data'],
          excludedDataTables,
          batchSize: flags['batch-size'],
        },
      });
      succeed(`Emitted ${sql.length.toLocaleString()} bytes of T-SQL`);

      if (flags['dry-run']) {
        process.stdout.write(sql);
        return;
      }

      const filename = baselineFilename({ generatedAtUtc, baselineVersion });
      fs.mkdirSync(flags.out, { recursive: true });
      const fullPath = path.resolve(flags.out, filename);
      fs.writeFileSync(fullPath, sql, 'utf8');
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      this.log('');
      this.log(chalk.green(`✓ Baseline written: ${fullPath}`));
      this.log(chalk.dim(`  Generated in ${elapsed}s`));
    } catch (err) {
      fail(`Build failed: ${(err as Error).message}`);
      throw err;
    } finally {
      await db.close();
    }
  }

  /**
   * Decide the baseline version + filename timestamp.
   *
   * - **Explicit mode**: caller passes `--baseline-version 6.0`. Timestamp = now (UTC).
   * - **Auto / within-major mode**: caller omits `--baseline-version`. Scan
   *   `--source-dir` (or auto-discover one) for the latest V-file; new baseline
   *   inherits its `Major.Minor` and uses `latestVTimestamp + 1 minute` so the
   *   B-file always sorts after the V-stack it succeeds.
   */
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
