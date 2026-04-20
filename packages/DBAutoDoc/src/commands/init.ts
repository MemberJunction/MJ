/**
 * Init command - Initialize new project
 */

import { Command } from '@oclif/core';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { ConfigLoader } from '../utils/config-loader.js';
import { DatabaseConnection } from '../database/Database.js';

export default class Init extends Command {
  static description = 'Initialize a new DBAutoDoc project';

  static examples = ['$ db-auto-doc init'];

  async run(): Promise<void> {
    this.log(chalk.blue('DBAutoDoc Initialization\n'));

    // Database configuration
    const dbAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'server',
        message: 'SQL Server host:',
        default: 'localhost'
      },
      {
        type: 'input',
        name: 'database',
        message: 'Database name:',
        validate: (input: string) => input.length > 0 || 'Database name is required'
      },
      {
        type: 'input',
        name: 'user',
        message: 'Username:',
        default: 'sa'
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        mask: '*'
      },
      {
        type: 'confirm',
        name: 'encrypt',
        message: 'Use encryption?',
        default: true
      },
      {
        type: 'confirm',
        name: 'trustServerCertificate',
        message: 'Trust server certificate?',
        default: false
      }
    ]);

    // Test connection
    this.log(chalk.yellow('\nTesting database connection...'));
    const dbConfig = {
      provider: 'sqlserver' as const,
      host: dbAnswers.server,
      database: dbAnswers.database,
      user: dbAnswers.user,
      password: dbAnswers.password,
      encrypt: dbAnswers.encrypt,
      trustServerCertificate: dbAnswers.trustServerCertificate
    };
    const db = new DatabaseConnection(dbConfig);
    const testResult = await db.test();
    await db.close();

    if (!testResult.success) {
      this.error(`Connection failed: ${testResult.message}`);
      return;
    }

    this.log(chalk.green('✓ Database connection successful!\n'));

    // AI configuration
    const aiAnswers = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: 'AI Provider:',
        choices: ['gemini', 'openai', 'anthropic', 'groq', 'mistral', 'vertex', 'azure', 'cerebras', 'openrouter', 'xai', 'bedrock'],
        default: 'gemini',
        loop: false
      },
      {
        type: 'input',
        name: 'model',
        message: 'Model name:',
        default: (answers: any) => {
          if (answers.provider === 'gemini') return 'gemini-3-flash-preview';
          if (answers.provider === 'openai') return 'gpt-4-turbo-preview';
          if (answers.provider === 'anthropic') return 'claude-3-opus-20240229';
          if (answers.provider === 'groq') return 'mixtral-8x7b-32768';
          if (answers.provider === 'mistral') return 'mistral-small-latest';
          if (answers.provider === 'vertex') return 'gemini-1.5-flash';
          if (answers.provider === 'azure') return 'gpt-4';
          if (answers.provider === 'cerebras') return 'llama-3.1-8b';
          if (answers.provider === 'openrouter') return 'anthropic/claude-3-opus';
          if (answers.provider === 'xai') return 'grok-2';
          if (answers.provider === 'bedrock') return 'anthropic.claude-3-sonnet-20240229-v1:0';
          return '';
        }
      },
      {
        type: 'password',
        name: 'apiKey',
        message: 'API Key:',
        mask: '*',
        validate: (input: string) => input.length > 0 || 'API key is required'
      }
    ]);

    // Optional seed context
    const contextAnswers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addContext',
        message: 'Add seed context for better analysis?',
        default: true
      },
      {
        type: 'input',
        name: 'overallPurpose',
        message: 'Database overall purpose (e.g., "E-commerce platform"):',
        when: (answers: any) => answers.addContext
      },
      {
        type: 'input',
        name: 'businessDomains',
        message: 'Business domains (comma-separated, e.g., "Sales, Inventory, Billing"):',
        when: (answers: any) => answers.addContext
      },
      {
        type: 'input',
        name: 'industryContext',
        message: 'Industry context (e.g., "Healthcare", "Finance"):',
        when: (answers: any) => answers.addContext
      }
    ]);

    // Sample query generation options
    const queryAnswers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableSampleQueries',
        message: 'Generate sample queries for each table?',
        default: false
      },
      {
        type: 'number',
        name: 'queriesPerTable',
        message: 'Number of queries to generate per table:',
        default: 5,
        when: (answers: any) => answers.enableSampleQueries,
        validate: (input: number) => input > 0 || 'Must be greater than 0'
      },
      {
        type: 'number',
        name: 'maxTables',
        message: 'Max number of tables to generate queries for (0 = all tables):',
        default: 10,
        when: (answers: any) => answers.enableSampleQueries,
        validate: (input: number) => input >= 0 || 'Must be 0 or greater'
      },
      {
        type: 'number',
        name: 'tokenBudget',
        message: 'Token budget for query generation (0 = unlimited):',
        default: 100000,
        when: (answers: any) => answers.enableSampleQueries,
        validate: (input: number) => input >= 0 || 'Must be 0 or greater'
      },
      {
        type: 'number',
        name: 'maxExecutionTime',
        message: 'Max execution time for query validation (ms):',
        default: 30000,
        when: (answers: any) => answers.enableSampleQueries
      }
    ]);

    // Create configuration
    const config = ConfigLoader.createDefault();

    // Update with user inputs
    config.database = {
      server: dbAnswers.server,
      port: 1433,
      database: dbAnswers.database,
      user: dbAnswers.user,
      password: dbAnswers.password,
      encrypt: dbAnswers.encrypt,
      trustServerCertificate: dbAnswers.trustServerCertificate,
      connectionTimeout: 30000
    };

    config.ai = {
      provider: aiAnswers.provider as any,
      model: aiAnswers.model,
      apiKey: aiAnswers.apiKey,
      temperature: 0.1,
      maxTokens: 4000
    };

    if (contextAnswers.addContext) {
      (config as unknown as Record<string, unknown>)['seedContext'] = {
        overallPurpose: contextAnswers.overallPurpose || undefined,
        businessDomains: contextAnswers.businessDomains
          ? contextAnswers.businessDomains.split(',').map((d: string) => d.trim())
          : undefined,
        industryContext: contextAnswers.industryContext || undefined
      };
    }

    // Add sample query generation config if enabled
    if (queryAnswers.enableSampleQueries) {
      config.analysis.sampleQueryGeneration = {
        enabled: true,
        queriesPerTable: queryAnswers.queriesPerTable || 5,
        maxExecutionTime: queryAnswers.maxExecutionTime || 30000,
        includeMultiQueryPatterns: true,
        validateAlignment: true,
        tokenBudget: queryAnswers.tokenBudget !== undefined ? queryAnswers.tokenBudget : 100000,
        maxRowsInSample: 10,
        maxTables: queryAnswers.maxTables !== undefined ? queryAnswers.maxTables : 10
      };
    }

    // Output directory configuration
    const outputAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'outputDir',
        message: 'Output directory for analysis results:',
        default: './output'
      }
    ]);

    // Set output directory
    config.output.outputDir = outputAnswers.outputDir;

    // Save configuration
    await ConfigLoader.save(config, './config.json');

    this.log(chalk.green('\n✓ Configuration saved to config.json'));
    this.log(chalk.blue('\nNext steps:'));
    this.log('  1. Run: db-auto-doc analyze');
    this.log('  2. Run: db-auto-doc export --sql --markdown');
  }
}
