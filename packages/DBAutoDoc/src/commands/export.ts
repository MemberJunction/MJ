import { Command, Flags } from '@oclif/core';
import { confirm } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StateManager } from '../state/state-manager';
import { SQLGenerator } from '../generators/sql-generator';
import { MarkdownGenerator } from '../generators/markdown-generator';
import { DatabaseConnection } from '../database/connection';

export default class Export extends Command {
  static description = 'Generate output files (SQL scripts, markdown documentation)';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --format sql',
    '<%= config.bin %> <%= command.id %> --format markdown --output ./docs',
    '<%= config.bin %> <%= command.id %> --execute --approved-only',
  ];

  static flags = {
    format: Flags.string({
      description: 'Output format',
      options: ['sql', 'markdown', 'all'],
      default: 'all',
    }),
    output: Flags.string({
      description: 'Output directory',
      default: './docs',
    }),
    'approved-only': Flags.boolean({
      description: 'Only export approved items',
      default: false,
    }),
    execute: Flags.boolean({
      description: 'Execute SQL script (apply to database)',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Export);

    this.log(chalk.blue.bold('\n📤 Exporting Documentation\n'));

    try {
      const stateManager = new StateManager();
      const state = await stateManager.load();

      const outputDir = flags.output;
      await fs.mkdir(outputDir, { recursive: true });

      if (flags.format === 'sql' || flags.format === 'all') {
        const sqlGen = new SQLGenerator();
        const sql = sqlGen.generate(state, {
          approvedOnly: flags['approved-only'],
        });

        const sqlPath = path.join(outputDir, 'extended-properties.sql');
        await fs.writeFile(sqlPath, sql);
        this.log(chalk.green(`✓ Generated SQL: ${sqlPath}`));

        if (flags.execute) {
          const confirmed = await confirm({
            message: chalk.yellow('Execute SQL script? This will modify your database.'),
            default: false,
          });

          if (confirmed) {
            const connection = DatabaseConnection.fromEnv();
            const spinner = ora('Executing SQL...').start();

            try {
              await connection.query(sql);
              spinner.succeed('SQL executed successfully');
            } catch (error) {
              spinner.fail('SQL execution failed');
              throw error;
            }

            await connection.close();
          }
        }
      }

      if (flags.format === 'markdown' || flags.format === 'all') {
        const mdGen = new MarkdownGenerator();
        const markdown = mdGen.generate(state);

        const mdPath = path.join(outputDir, 'database-documentation.md');
        await fs.writeFile(mdPath, markdown);
        this.log(chalk.green(`✓ Generated Markdown: ${mdPath}`));
      }

      this.log(chalk.green('\n✅ Export complete!'));
    } catch (error: any) {
      this.error(error.message);
    }
  }
}
