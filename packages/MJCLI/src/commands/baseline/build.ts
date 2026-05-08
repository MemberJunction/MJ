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
import { baselineFilename } from '../../baseline/util';

export default class BaselineBuild extends Command {
  static description = 'Generate a deterministic baseline SQL script from the END-STATE of a migrated MSSQL database.';

  static examples = [
    '<%= config.bin %> <%= command.id %> --baseline-version 3.1 --out ./migrations/v6/',
    '<%= config.bin %> <%= command.id %> --baseline-version 3.1 --database MJ_BL_Stack --out /tmp/baseline/',
    '<%= config.bin %> <%= command.id %> --baseline-version 3.1 --exclude-data SystemLog,EventStream',
  ];

  static flags = {
    'baseline-version': Flags.string({
      description: 'Baseline version stamp in Major.Minor format (literal X is appended for patch).',
      required: true,
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

    if (!/^\d+\.\d+$/.test(flags['baseline-version'])) {
      this.error(`--baseline-version must be Major.Minor (got "${flags['baseline-version']}")`);
    }

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
      const generatedAtUtc = new Date();
      const sql = emitBaselineTsql({
        snapshot,
        dataDumps: dumps,
        options: {
          baselineVersion: flags['baseline-version'],
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

      const filename = baselineFilename({ generatedAtUtc, baselineVersion: flags['baseline-version'] });
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
}
