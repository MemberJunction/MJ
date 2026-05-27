import { Command, Flags } from '@oclif/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ora from 'ora-classic';
import chalk from 'chalk';

import { resolveConnection, isTty } from '../../baseline/cli-helpers';
import { openConnection } from '../../baseline/connection';
import { introspectMssql } from '../../baseline/introspector-mssql';
import { introspectPostgres } from '../../baseline/introspector-postgres';
import { dumpTables } from '../../baseline/data-dumper';
import { compareSnapshots } from '../../baseline/comparator';
import { renderJson, renderMarkdown } from '../../baseline/report';
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
    const useSpinner = isTty();
    const spinner = useSpinner ? ora() : null;

    const phase = (text: string) => {
      if (spinner) { spinner.text = text; if (!spinner.isSpinning) spinner.start(); }
      else this.log(`• ${text}`);
    };
    const succeed = (text: string) => spinner ? spinner.succeed(text) : this.log(`✓ ${text}`);
    const fail = (text: string) => spinner ? spinner.fail(text) : this.logToStderr(`✗ ${text}`);

    const leftParams = resolveConnection({ database: flags.left }, dialect);
    const rightParams = resolveConnection({ database: flags.right }, dialect);

    phase(`Connecting (${leftParams.database} & ${rightParams.database})`);
    const left = await openConnection(leftParams);
    const right = await openConnection(rightParams);
    succeed(`Connected to both databases`);

    try {
      phase(`Introspecting ${leftParams.database}`);
      const leftSnapshot = dialect === 'mssql'
        ? await introspectMssql(left)
        : await introspectPostgres(left);
      succeed(`${leftParams.database}: ${leftSnapshot.tables.length} tables, ${leftSnapshot.views.length} views`);

      phase(`Introspecting ${rightParams.database}`);
      const rightSnapshot = dialect === 'mssql'
        ? await introspectMssql(right)
        : await introspectPostgres(right);
      succeed(`${rightParams.database}: ${rightSnapshot.tables.length} tables, ${rightSnapshot.views.length} views`);

      const rowMode = flags['row-compare'] as RowCompareMode;
      let leftDumps = [] as Awaited<ReturnType<typeof dumpTables>>;
      let rightDumps = [] as Awaited<ReturnType<typeof dumpTables>>;
      if (rowMode !== 'none' && rowMode !== 'counts') {
        if (dialect !== 'mssql') {
          this.warn('row data dump streaming optimised for MSSQL; PG path uses cursor fallback.');
        }
        phase(`Dumping rows (left)`);
        leftDumps = await dumpTables(left, leftSnapshot.tables, { excludedTables: new Set() });
        succeed(`Dumped ${leftDumps.reduce((s, d) => s + d.rowCount, 0).toLocaleString()} rows from ${leftParams.database}`);
        phase(`Dumping rows (right)`);
        rightDumps = await dumpTables(right, rightSnapshot.tables, { excludedTables: new Set() });
        succeed(`Dumped ${rightDumps.reduce((s, d) => s + d.rowCount, 0).toLocaleString()} rows from ${rightParams.database}`);
      }

      phase('Comparing');
      const report = compareSnapshots({
        left: { snapshot: leftSnapshot, data: leftDumps, label: leftParams.database },
        right: { snapshot: rightSnapshot, data: rightDumps, label: rightParams.database },
        options: {
          rowCompareMode: rowMode,
          rowHashAlgo: flags['row-hash-algo'] as RowHashAlgo,
          ignorePattern: flags.ignore ? new RegExp(flags.ignore, 'i') : undefined,
          rowDiffSampleLimit: flags['sample-limit'],
        },
      });
      report.isClean ? succeed('Comparison complete: CLEAN') : fail(`Comparison complete: ${report.summary.objectsWithDiffs} object diff(s), ${report.summary.totalRowDiffs} row diff(s)`);

      if (flags.out) {
        fs.mkdirSync(flags.out, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const jsonPath = path.resolve(flags.out, `baseline-compare-${stamp}.json`);
        const mdPath = path.resolve(flags.out, `baseline-compare-${stamp}.md`);
        fs.writeFileSync(jsonPath, renderJson(report), 'utf8');
        fs.writeFileSync(mdPath, renderMarkdown(report), 'utf8');
        this.log('');
        this.log(chalk.dim(`  Reports: ${jsonPath}`));
        this.log(chalk.dim(`           ${mdPath}`));
      } else {
        process.stdout.write(renderMarkdown(report));
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
