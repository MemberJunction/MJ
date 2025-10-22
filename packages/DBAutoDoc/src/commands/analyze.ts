import { Command, Flags } from '@oclif/core';
import ora from 'ora';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { DatabaseConnection } from '../database/connection';
import { StateManager } from '../state/state-manager';
import { SimpleAIClient as AIClient } from '../ai/simple-ai-client';
import { DatabaseAnalyzer } from '../analyzers/analyzer';

dotenv.config();

export default class Analyze extends Command {
  static description = 'Analyze database and generate documentation';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --interactive',
    '<%= config.bin %> <%= command.id %> --schemas dbo,sales',
  ];

  static flags = {
    interactive: Flags.boolean({
      description: 'Interactive mode',
      default: false,
    }),
    incremental: Flags.boolean({
      description: 'Only process new tables',
      default: false,
    }),
    schemas: Flags.string({
      description: 'Comma-separated schema list',
    }),
    batch: Flags.boolean({
      description: 'Non-interactive batch mode',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Analyze);

    this.log(chalk.blue.bold('\n📊 Analyzing Database\n'));

    try {
      // Check API key
      if (!process.env.AI_API_KEY || process.env.AI_API_KEY === 'your-api-key-here') {
        this.error('AI_API_KEY not set in .env file');
      }

      const connection = DatabaseConnection.fromEnv();
      const stateManager = new StateManager();

      // Test connection
      const connected = await connection.test();
      if (!connected) {
        this.error('Cannot connect to database');
      }

      // Load state
      const state = await stateManager.load(
        process.env.DB_SERVER || 'localhost',
        process.env.DB_DATABASE || 'master'
      );

      const aiClient = new AIClient();
      const analyzer = new DatabaseAnalyzer(connection, stateManager, aiClient);

      const schemas = flags.schemas ? flags.schemas.split(',') : undefined;

      await analyzer.analyze({
        schemas,
        incremental: flags.incremental,
        interactive: flags.interactive,
      });

      await connection.close();

      this.log(chalk.green('\n✅ Analysis complete!'));
      this.log('\nNext steps:');
      this.log('  - Review: db-auto-doc review');
      this.log('  - Export: db-auto-doc export');
    } catch (error: any) {
      this.error(error.message);
    }
  }
}
