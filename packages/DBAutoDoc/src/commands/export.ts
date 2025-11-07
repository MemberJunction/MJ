/**
 * Export command - Generate SQL and Markdown documentation
 */

import { Command, Flags } from '@oclif/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigLoader } from '../utils/config-loader.js';
import { StateManager } from '../state/StateManager.js';
import { SQLGenerator } from '../generators/SQLGenerator.js';
import { MarkdownGenerator } from '../generators/MarkdownGenerator.js';
import { ReportGenerator } from '../generators/ReportGenerator.js';
import { DatabaseConnection } from '../database/DatabaseConnection.js';

export default class Export extends Command {
  static description = 'Export documentation as SQL and/or Markdown';

  static examples = [
    '$ db-auto-doc export --sql',
    '$ db-auto-doc export --markdown',
    '$ db-auto-doc export --sql --markdown --apply'
  ];

  static flags = {
    sql: Flags.boolean({ description: 'Generate SQL script' }),
    markdown: Flags.boolean({ description: 'Generate Markdown documentation' }),
    report: Flags.boolean({ description: 'Generate analysis report' }),
    apply: Flags.boolean({ description: 'Apply SQL to database', default: false }),
    'approved-only': Flags.boolean({ description: 'Only export approved items', default: false }),
    'confidence-threshold': Flags.number({ description: 'Minimum confidence threshold', default: 0 })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Export);
    const spinner = ora();

    try {
      // Load configuration and state
      spinner.start('Loading configuration and state');
      const config = await ConfigLoader.load('./config.json');
      const stateManager = new StateManager(config.output.stateFile);
      const state = await stateManager.load();

      if (!state) {
        throw new Error('No state file found. Run "db-auto-doc analyze" first.');
      }

      spinner.succeed('State loaded');

      // Ensure output directory exists
      const outputDir = path.dirname(config.output.sqlFile);
      await fs.mkdir(outputDir, { recursive: true });

      // Generate SQL
      if (flags.sql) {
        spinner.start('Generating SQL script');
        const sqlGen = new SQLGenerator();
        const sql = sqlGen.generate(state, {
          approvedOnly: flags['approved-only'],
          confidenceThreshold: flags['confidence-threshold']
        });

        await fs.writeFile(config.output.sqlFile, sql, 'utf-8');
        spinner.succeed(`SQL script saved to ${config.output.sqlFile}`);

        // Apply to database if requested
        if (flags.apply) {
          spinner.start('Applying SQL to database');
          const db = new DatabaseConnection(config.database);
          await db.connect();

          const result = await db.query(sql);
          await db.close();

          if (result.success) {
            spinner.succeed('SQL applied successfully');
          } else {
            spinner.fail(`SQL application failed: ${result.errorMessage}`);
          }
        }
      }

      // Generate Markdown
      if (flags.markdown) {
        spinner.start('Generating Markdown documentation');
        const mdGen = new MarkdownGenerator();
        const markdown = mdGen.generate(state);

        await fs.writeFile(config.output.markdownFile, markdown, 'utf-8');
        spinner.succeed(`Markdown documentation saved to ${config.output.markdownFile}`);
      }

      // Generate Report
      if (flags.report) {
        spinner.start('Generating analysis report');
        const reportGen = new ReportGenerator(stateManager);
        const report = reportGen.generate(state);

        const reportPath = path.join(outputDir, 'analysis-report.md');
        await fs.writeFile(reportPath, report, 'utf-8');
        spinner.succeed(`Analysis report saved to ${reportPath}`);
      }

      this.log(chalk.green('\n✓ Export complete!'));

    } catch (error) {
      spinner.fail('Export failed');
      this.error((error as Error).message);
    }
  }
}
