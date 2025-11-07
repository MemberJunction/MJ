/**
 * Init command - Initialize new project
 */

import { Command } from '@oclif/core';
import * as inquirer from 'inquirer';
import chalk from 'chalk';
import { ConfigLoader } from '../utils/config-loader.js';
import { DatabaseConnection } from '../database/DatabaseConnection.js';

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
    const db = new DatabaseConnection(dbAnswers);
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
        choices: ['openai', 'anthropic', 'groq']
      },
      {
        type: 'input',
        name: 'model',
        message: 'Model name:',
        default: (answers: any) => {
          if (answers.provider === 'openai') return 'gpt-4-turbo-preview';
          if (answers.provider === 'anthropic') return 'claude-3-opus-20240229';
          if (answers.provider === 'groq') return 'mixtral-8x7b-32768';
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
      config['seedContext' as any] = {
        overallPurpose: contextAnswers.overallPurpose || undefined,
        businessDomains: contextAnswers.businessDomains
          ? contextAnswers.businessDomains.split(',').map((d: string) => d.trim())
          : undefined,
        industryContext: contextAnswers.industryContext || undefined
      };
    }

    // Save configuration
    await ConfigLoader.save(config, './config.json');

    this.log(chalk.green('\n✓ Configuration saved to config.json'));
    this.log(chalk.blue('\nNext steps:'));
    this.log('  1. Run: db-auto-doc analyze');
    this.log('  2. Run: db-auto-doc export --sql --markdown');
  }
}
