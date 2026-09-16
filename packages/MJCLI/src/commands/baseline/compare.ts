import { Command, Flags } from '@oclif/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ora from 'ora-classic';
import chalk from 'chalk';

import { ResolveConnection, IsTty } from '../../baseline/cli-helpers';
import { OpenConnection } from '../../baseline/connection';
import { IntrospectMssql } from '../../baseline/introspector-mssql';
import { IntrospectPostgres } from '../../baseline/introspector-postgres';
import { DumpTables } from '../../baseline/data-dumper';
import { CompareSnapshots } from '../../baseline/comparator';
import { RenderJson, RenderMarkdown } from '../../baseline/report';
import type { RowCompareMode, RowHashAlgo } from '../../baseline/types';

export default class BaselineCompare extends Command {
  static description = 'Deterministically compare two databases object-by-object and row-by-row.';

  static examples = [
    '<%= config.bin %> <%= command.id %> --left MJ_BL_Stack --right MJ_BL_New',
    '<%= config.bin %> <%= command.id %> --left A --right B --row-compare counts',
    '<%= config.bin %> <%= command.id %> --left A --right B --fail-on-diff --out ./diffs/',
  ];

  static flags = {
    'left': Flags.string({ description: 'Left database name (override).', required: true }),
    'right': Flags.string({ description: 'Right database name (override).', required: true }),
    'dialect': Flags.string({
      description: 'Dialect of both DBs (must match).',
      options: ['mssql', 'postgres'],
      default: 'mssql',
    }),
    'row-compare': Flags.string({
      description: 'Row comparison mode.',
      options: ['full', 'hash', 'counts', 'none'],
      default: 'full',
    }),
    'row-hash-algo': Flags.string({
      description: 'Hash algorithm when --row-compare hash.',
      options: ['sha256', 'md5', 'checksum_agg'],
      default: 'sha256',
    }),
    'ignore': Flags.string({
      description: 'Regex of object names to skip.',
      default: '^flyway_schema_history$',
    }),
    'sample-limit': Flags.integer({
      description: 'Maximum row diffs to capture per table.',
      default: 100,
    }),
    'out': Flags.string({ description: 'Directory to write JSON + Markdown reports.' }),
    'fail-on-diff': Flags.boolean({ description: 'Exit non-zero if any diff is found.', default: false }),
    'verbose': Flags.boolean({ description: 'Print per-phase progress.', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BaselineCompare);
    const dialect = flags.dialect as 'mssql' | 'postgres';
    const useSpinner = IsTty();
    const spinner = useSpinner ? ora() : null;

    const phase = (text: string) => {
      if (spinner) { spinner.text = text; if (!spinner.isSpinning) spinner.start(); }
      else this.log(`• ${text}`);
    };
    const succeed = (text: string) => spinner ? spinner.succeed(text) : this.log(`✓ ${text}`);
    const fail = (text: string) => spinner ? spinner.fail(text) : this.logToStderr(`✗ ${text}`);

    const leftParams = ResolveConnection({ database: flags.left }, dialect);
    const rightParams = ResolveConnection({ database: flags.right }, dialect);

    phase(`Connecting (${leftParams.Database} & ${rightParams.Database})`);
    const left = await OpenConnection(leftParams);
    const right = await OpenConnection(rightParams);
    succeed(`Connected to both databases`);

    try {
      phase(`Introspecting ${leftParams.Database}`);
      const leftSnapshot = dialect === 'mssql'
        ? await IntrospectMssql(left)
        : await IntrospectPostgres(left);
      succeed(`${leftParams.Database}: ${leftSnapshot.Tables.length} tables, ${leftSnapshot.Views.length} views`);

      phase(`Introspecting ${rightParams.Database}`);
      const rightSnapshot = dialect === 'mssql'
        ? await IntrospectMssql(right)
        : await IntrospectPostgres(right);
      succeed(`${rightParams.Database}: ${rightSnapshot.Tables.length} tables, ${rightSnapshot.Views.length} views`);

      const rowMode = flags['row-compare'] as RowCompareMode;
      let leftDumps = [] as Awaited<ReturnType<typeof DumpTables>>;
      let rightDumps = [] as Awaited<ReturnType<typeof DumpTables>>;
      if (rowMode !== 'none' && rowMode !== 'counts') {
        if (dialect !== 'mssql') {
          this.warn('row data dump streaming optimised for MSSQL; PG path uses cursor fallback.');
        }
        phase(`Dumping rows (left)`);
        leftDumps = await DumpTables(left, leftSnapshot.Tables, { ExcludedTables: new Set() });
        succeed(`Dumped ${leftDumps.reduce((s, d) => s + d.RowCount, 0).toLocaleString()} rows from ${leftParams.Database}`);
        phase(`Dumping rows (right)`);
        rightDumps = await DumpTables(right, rightSnapshot.Tables, { ExcludedTables: new Set() });
        succeed(`Dumped ${rightDumps.reduce((s, d) => s + d.RowCount, 0).toLocaleString()} rows from ${rightParams.Database}`);
      }

      phase('Comparing');
      const report = CompareSnapshots({
        Left: { snapshot: leftSnapshot, data: leftDumps, label: leftParams.Database },
        Right: { snapshot: rightSnapshot, data: rightDumps, label: rightParams.Database },
        Options: {
          RowCompareMode: rowMode,
          RowHashAlgo: flags['row-hash-algo'] as RowHashAlgo,
          IgnorePattern: flags.ignore ? new RegExp(flags.ignore, 'i') : undefined,
          RowDiffSampleLimit: flags['sample-limit'],
        },
      });
      report.isClean ? succeed('Comparison complete: CLEAN') : fail(`Comparison complete: ${report.summary.objectsWithDiffs} object diff(s), ${report.summary.totalRowDiffs} row diff(s)`);

      if (flags.out) {
        fs.mkdirSync(flags.out, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const jsonPath = path.resolve(flags.out, `baseline-compare-${stamp}.json`);
        const mdPath = path.resolve(flags.out, `baseline-compare-${stamp}.md`);
        fs.writeFileSync(jsonPath, RenderJson(report), 'utf8');
        fs.writeFileSync(mdPath, RenderMarkdown(report), 'utf8');
        this.log('');
        this.log(chalk.dim(`  Reports: ${jsonPath}`));
        this.log(chalk.dim(`           ${mdPath}`));
      } else {
        process.stdout.write(RenderMarkdown(report));
      }

      if (flags['fail-on-diff'] && !report.isClean) {
        this.exit(2);
      }
    } finally {
      await left.close();
      await right.close();
    }
  }
}
