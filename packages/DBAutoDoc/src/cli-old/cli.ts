#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DatabaseConnection } from '../database/connection';
import { StateManager } from '../state/state-manager';
import { SimpleAIClient as AIClient } from '../ai/simple-ai-client';
import { DatabaseAnalyzer } from '../analyzers/analyzer';
import { SQLGenerator } from '../generators/sql-generator';
import { MarkdownGenerator } from '../generators/markdown-generator';
import { StateFile, createEmptyStateFile } from '../types/state-file';

dotenv.config();

const program = new Command();

program
  .name('sqlserver-doc')
  .description('AI-powered SQL Server database documentation generator')
  .version('1.0.0');

/**
 * INIT command - initialize new project
 */
program
  .command('init')
  .description('Initialize new documentation project')
  .option('--interactive', 'Interactive setup', true)
  .action(async (options) => {
    console.log(chalk.blue.bold('\n🚀 SQL Server Documentation Generator\n'));

    try {
      let server: string;
      let database: string;
      let user: string;
      let password: string;

      if (options.interactive) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'server',
            message: 'Database server:',
            default: 'localhost',
          },
          {
            type: 'input',
            name: 'database',
            message: 'Database name:',
            validate: (input) => (input ? true : 'Database name required'),
          },
          {
            type: 'input',
            name: 'user',
            message: 'Username:',
            default: 'sa',
          },
          {
            type: 'password',
            name: 'password',
            message: 'Password:',
            mask: '*',
          },
        ]);

        server = answers.server;
        database = answers.database;
        user = answers.user;
        password = answers.password;
      } else {
        server = process.env.DB_SERVER || 'localhost';
        database = process.env.DB_DATABASE || '';
        user = process.env.DB_USER || 'sa';
        password = process.env.DB_PASSWORD || '';
      }

      // Test connection
      const spinner = ora('Testing database connection...').start();

      const connection = new DatabaseConnection({
        server,
        database,
        user,
        password,
        encrypt: true,
        trustServerCertificate: true,
      });

      const connected = await connection.test();

      if (!connected) {
        spinner.fail('Connection failed');
        process.exit(1);
      }

      spinner.succeed('Connection successful');

      // Create .env file
      const envPath = path.join(process.cwd(), '.env');
      const envContent = `
# Database Connection
DB_SERVER=${server}
DB_DATABASE=${database}
DB_USER=${user}
DB_PASSWORD=${password}
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true

# AI Configuration
AI_PROVIDER=openai
AI_MODEL=gpt-4
AI_API_KEY=your-api-key-here
`.trim();

      await fs.writeFile(envPath, envContent);
      console.log(chalk.green('✓ Created .env file'));

      // Create state file
      const stateManager = new StateManager();
      await stateManager.reset(server, database);
      console.log(chalk.green('✓ Created db-doc-state.json'));

      // Ask seed questions
      if (options.interactive) {
        const seedAnswers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'addSeed',
            message: 'Would you like to provide seed context?',
            default: true,
          },
        ]);

        if (seedAnswers.addSeed) {
          const contextAnswers = await inquirer.prompt([
            {
              type: 'input',
              name: 'purpose',
              message: 'Overall database purpose:',
            },
            {
              type: 'input',
              name: 'domains',
              message: 'Business domains (comma-separated):',
            },
          ]);

          const state = stateManager.getState();
          state.seedContext = {
            overallPurpose: contextAnswers.purpose,
            businessDomains: contextAnswers.domains.split(',').map((d: string) => d.trim()),
          };
          await stateManager.save();

          console.log(chalk.green('✓ Saved seed context'));
        }
      }

      console.log(chalk.green.bold('\n✅ Initialization complete!\n'));
      console.log('Next steps:');
      console.log('  1. Edit .env and add your AI API key');
      console.log('  2. Run: sqlserver-doc analyze --interactive');

      await connection.close();
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

/**
 * ANALYZE command - analyze database
 */
program
  .command('analyze')
  .description('Analyze database and generate documentation')
  .option('--interactive', 'Interactive mode')
  .option('--incremental', 'Only process new tables')
  .option('--schemas <schemas>', 'Comma-separated schema list')
  .option('--batch', 'Non-interactive batch mode')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n📊 Analyzing Database\n'));

    try {
      // Load environment
      dotenv.config();

      // Check API key
      if (!process.env.AI_API_KEY || process.env.AI_API_KEY === 'your-api-key-here') {
        console.error(chalk.red('Error: AI_API_KEY not set in .env file'));
        process.exit(1);
      }

      const connection = DatabaseConnection.fromEnv();
      const stateManager = new StateManager();

      // Load or create state
      const connected = await connection.test();
      if (!connected) {
        console.error(chalk.red('Error: Cannot connect to database'));
        process.exit(1);
      }

      const state = await stateManager.load(
        process.env.DB_SERVER || 'localhost',
        process.env.DB_DATABASE || 'master'
      );

      const aiClient = new AIClient();
      const analyzer = new DatabaseAnalyzer(connection, stateManager, aiClient);

      const schemas = options.schemas ? options.schemas.split(',') : undefined;

      await analyzer.analyze({
        schemas,
        incremental: options.incremental,
        interactive: options.interactive,
      });

      await connection.close();

      console.log(chalk.green('\n✅ Analysis complete!'));
      console.log('\nNext steps:');
      console.log('  - Review: sqlserver-doc review');
      console.log('  - Export: sqlserver-doc export --format=sql');
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

/**
 * REVIEW command - review generated documentation
 */
program
  .command('review')
  .description('Review and approve AI-generated documentation')
  .option('--schema <schema>', 'Review specific schema')
  .option('--unapproved-only', 'Only show unapproved items')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n📝 Review Documentation\n'));

    try {
      const stateManager = new StateManager();
      const state = await stateManager.load();

      const unapproved = stateManager.getUnapprovedTables(options.schema);

      if (unapproved.length === 0) {
        console.log(chalk.green('✅ All tables approved!'));
        return;
      }

      console.log(`Found ${unapproved.length} unapproved tables\n`);

      for (const { schema, table } of unapproved) {
        const schemaState = state.schemas[schema];
        const tableState = schemaState.tables[table];

        console.log(chalk.cyan.bold(`\n${schema}.${table}`));
        console.log('─'.repeat(50));

        if (tableState.aiGenerated) {
          console.log(chalk.white('Description:'));
          console.log(tableState.aiGenerated.description);
          console.log('');
          console.log(
            chalk.gray(`Confidence: ${(tableState.aiGenerated.confidence * 100).toFixed(0)}%`)
          );
        }

        const answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'Action:',
            choices: [
              { name: 'Approve', value: 'approve' },
              { name: 'Add notes', value: 'notes' },
              { name: 'Skip', value: 'skip' },
              { name: 'Exit review', value: 'exit' },
            ],
          },
        ]);

        if (answer.action === 'exit') {
          break;
        }

        if (answer.action === 'approve') {
          stateManager.approveTable(schema, table);
          console.log(chalk.green('✓ Approved'));
        }

        if (answer.action === 'notes') {
          const notesAnswer = await inquirer.prompt([
            {
              type: 'input',
              name: 'notes',
              message: 'Enter notes:',
            },
          ]);

          stateManager.addTableNotes(schema, table, notesAnswer.notes);
          console.log(chalk.green('✓ Notes added'));
        }
      }

      await stateManager.save();
      console.log(chalk.green('\n✅ Review complete!'));
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

/**
 * EXPORT command - generate output files
 */
program
  .command('export')
  .description('Generate output files')
  .option('--format <format>', 'sql|markdown|all', 'all')
  .option('--output <path>', 'Output directory', './docs')
  .option('--approved-only', 'Only export approved items')
  .option('--execute', 'Execute SQL script')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n📤 Exporting Documentation\n'));

    try {
      const stateManager = new StateManager();
      const state = await stateManager.load();

      const outputDir = options.output;
      await fs.mkdir(outputDir, { recursive: true });

      if (options.format === 'sql' || options.format === 'all') {
        const sqlGen = new SQLGenerator();
        const sql = sqlGen.generate(state, {
          approvedOnly: options.approvedOnly,
        });

        const sqlPath = path.join(outputDir, 'extended-properties.sql');
        await fs.writeFile(sqlPath, sql);
        console.log(chalk.green(`✓ Generated SQL: ${sqlPath}`));

        if (options.execute) {
          const answer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: chalk.yellow('Execute SQL script? This will modify your database.'),
              default: false,
            },
          ]);

          if (answer.confirm) {
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

      if (options.format === 'markdown' || options.format === 'all') {
        const mdGen = new MarkdownGenerator();
        const markdown = mdGen.generate(state);

        const mdPath = path.join(outputDir, 'database-documentation.md');
        await fs.writeFile(mdPath, markdown);
        console.log(chalk.green(`✓ Generated Markdown: ${mdPath}`));
      }

      console.log(chalk.green('\n✅ Export complete!'));
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

/**
 * RESET command
 */
program
  .command('reset')
  .description('Reset state file')
  .option('--all', 'Reset entire state file')
  .action(async (options) => {
    if (options.all) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: chalk.yellow('Reset entire state file? This cannot be undone.'),
          default: false,
        },
      ]);

      if (answer.confirm) {
        const stateManager = new StateManager();
        await stateManager.reset(
          process.env.DB_SERVER || 'localhost',
          process.env.DB_DATABASE || 'master'
        );
        console.log(chalk.green('✅ State file reset'));
      }
    }
  });

program.parse();
