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
import { DatabaseConnection } from '../database/Database.js';

export default class Export extends Command {
  static description = 'Export documentation as SQL and/or Markdown';

  static examples = [
    '$ db-auto-doc export --state-file=./db-doc-state.json',
    '$ db-auto-doc export --sql',
    '$ db-auto-doc export --markdown',
    '$ db-auto-doc export --sql --markdown --apply'
  ];

  static flags = {
    'state-file': Flags.string({ description: 'Path to state JSON file', char: 's' }),
    'output-dir': Flags.string({ description: 'Output directory for generated files', char: 'o' }),
    sql: Flags.boolean({ description: 'Generate SQL script' }),
    markdown: Flags.boolean({ description: 'Generate Markdown documentation' }),
    report: Flags.boolean({ description: 'Generate analysis report' }),
    apply: Flags.boolean({ description: 'Apply SQL to database', default: false }),
    'approved-only': Flags.boolean({ description: 'Only export approved items', default: false }),
    'confidence-threshold': Flags.string({ description: 'Minimum confidence threshold', default: '0' })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Export);
    const spinner = ora();

    try {
      // Determine state file path
      let stateFilePath: string;
      let outputDir: string;
      let config: any = null;

      if (flags['state-file']) {
        // Direct state file mode - no config needed
        stateFilePath = path.resolve(flags['state-file']);
        outputDir = flags['output-dir']
          ? path.resolve(flags['output-dir'])
          : path.dirname(stateFilePath);
      } else {
        // Config-based mode (original behavior)
        spinner.start('Loading configuration');
        config = await ConfigLoader.load('./config.json');
        spinner.succeed('Configuration loaded');
        stateFilePath = config.output.stateFile;
        outputDir = path.dirname(config.output.sqlFile);
      }

      // Load state
      spinner.start('Loading state');
      const stateManager = new StateManager(stateFilePath);
      const state = await stateManager.load();

      if (!state) {
        throw new Error(`No state file found at ${stateFilePath}. Run "db-auto-doc analyze" first.`);
      }

      spinner.succeed('State loaded');

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Default to SQL + Markdown if no specific format flags provided
      const generateSQL = flags.sql || (!flags.sql && !flags.markdown && !flags.report);
      const generateMarkdown = flags.markdown || (!flags.sql && !flags.markdown && !flags.report);

      // Generate SQL
      if (generateSQL) {
        spinner.start('Generating SQL script');
        const sqlGen = new SQLGenerator();
        const sql = sqlGen.generate(state, {
          approvedOnly: flags['approved-only'],
          confidenceThreshold: parseFloat(flags['confidence-threshold'])
        });

        const sqlPath = path.join(outputDir, 'extended-props.sql');
        await fs.writeFile(sqlPath, sql, 'utf-8');
        spinner.succeed(`SQL script saved to ${sqlPath}`);

        // Apply to database if requested
        if (flags.apply) {
          if (!config) {
            this.warn('--apply requires a config file. Skipping database application.');
          } else {
            spinner.start('Applying SQL to database');
            const dbConfig = {
              provider: (config.database.provider as 'sqlserver' | 'mysql' | 'postgresql' | 'oracle') || 'sqlserver',
              host: config.database.server,
              port: config.database.port,
              database: config.database.database,
              user: config.database.user,
              password: config.database.password,
              encrypt: config.database.encrypt,
              trustServerCertificate: config.database.trustServerCertificate
            };
            const db = new DatabaseConnection(dbConfig);
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
      }

      // Generate Markdown
      if (generateMarkdown) {
        spinner.start('Generating Markdown documentation');
        const mdGen = new MarkdownGenerator();
        const markdown = mdGen.generate(state);

        const mdPath = path.join(outputDir, 'summary.md');
        await fs.writeFile(mdPath, markdown, 'utf-8');
        spinner.succeed(`Markdown documentation saved to ${mdPath}`);
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
