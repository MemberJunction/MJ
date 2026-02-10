/**
 * Generate Queries command - Generate sample SQL queries from existing state
 */

import { Command, Flags } from '@oclif/core';
import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { ConfigLoader } from '../utils/config-loader.js';
import { DatabaseConnection } from '../database/Database.js';
import { AutoDocConnectionConfig } from '../types/driver.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { SampleQueryGenerator } from '../generators/SampleQueryGenerator.js';
import { DatabaseDocumentation } from '../types/state.js';
import { SampleQueryGenerationConfig } from '../types/sample-queries.js';
import { StateManager } from '../state/StateManager.js';

export default class GenerateQueries extends Command {
  static description = 'Generate sample SQL queries from existing analysis state';

  static examples = [
    '$ db-auto-doc generate-queries --from-state ./output/run-1/state.json',
    '$ db-auto-doc generate-queries --from-state ./output/run-1/state.json --queries-per-table 10',
    '$ db-auto-doc generate-queries --from-state ./output/run-1/state.json --max-execution-time 60000'
  ];

  static flags = {
    'from-state': Flags.string({
      description: 'Path to existing state.json file from previous analysis',
      required: true
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to config file (for database connection and AI settings)',
      default: './config.json'
    }),
    'queries-per-table': Flags.integer({
      description: 'Number of queries to generate per table',
      required: false
    }),
    'max-execution-time': Flags.integer({
      description: 'Maximum execution time for query validation (ms)',
      required: false
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(GenerateQueries);
    const spinner = ora();

    try {
      // Load configuration for database connection and AI settings
      spinner.start('Loading configuration');
      const config = await ConfigLoader.load(flags.config);
      spinner.succeed('Configuration loaded');

      // Load existing state
      spinner.start('Loading existing analysis state');
      const stateJson = await fs.readFile(flags['from-state'], 'utf-8');
      const state = JSON.parse(stateJson) as DatabaseDocumentation;
      spinner.succeed(`State loaded: ${state.schemas.length} schemas, ${state.schemas.reduce((sum, s) => sum + s.tables.length, 0)} tables`);

      // Connect to database
      spinner.start('Connecting to database');
      const driverConfig: AutoDocConnectionConfig = {
        provider: (config.database.provider as 'sqlserver' | 'mysql' | 'postgresql' | 'oracle') || 'sqlserver',
        host: config.database.server,
        port: config.database.port,
        database: config.database.database,
        user: config.database.user,
        password: config.database.password,
        encrypt: config.database.encrypt,
        trustServerCertificate: config.database.trustServerCertificate,
        connectionTimeout: config.database.connectionTimeout,
        requestTimeout: config.database.requestTimeout,
        maxConnections: config.database.maxConnections,
        minConnections: config.database.minConnections,
        idleTimeoutMillis: config.database.idleTimeoutMillis
      };

      const db = new DatabaseConnection(driverConfig);
      await db.connect();
      const testResult = await db.test();

      if (!testResult.success) {
        throw new Error(`Database connection failed: ${testResult.message}`);
      }
      spinner.succeed('Connected to database');

      // Initialize prompt engine
      spinner.start('Initializing AI prompt engine');
      const promptsDir = path.join(__dirname, '../../prompts');
      const promptEngine = new PromptEngine(config.ai, promptsDir);
      await promptEngine.initialize();
      spinner.succeed('Prompt engine ready');

      // Build query generation config
      const queryConfig: SampleQueryGenerationConfig = {
        enabled: true,
        queriesPerTable: flags['queries-per-table'] || config.analysis.sampleQueryGeneration?.queriesPerTable || 5,
        maxExecutionTime: flags['max-execution-time'] || config.analysis.sampleQueryGeneration?.maxExecutionTime || 30000,
        includeMultiQueryPatterns: config.analysis.sampleQueryGeneration?.includeMultiQueryPatterns !== false,
        validateAlignment: config.analysis.sampleQueryGeneration?.validateAlignment !== false,
        tokenBudget: config.analysis.sampleQueryGeneration?.tokenBudget || 100000,
        maxRowsInSample: config.analysis.sampleQueryGeneration?.maxRowsInSample || 10,
        maxTables: config.analysis.sampleQueryGeneration?.maxTables  // Optional, defaults to 10 in generator
      };

      // Use AI config from main settings
      const model = config.ai.model;
      const effortLevel = config.ai.effortLevel || 75;
      const maxTokens = config.ai.maxTokens || 16000;  // Use config value or default

      // Create StateManager for state file updates
      const stateManager = new StateManager(flags['from-state']);

      // Create generator
      spinner.start('Generating sample queries');
      const generator = new SampleQueryGenerator(
        queryConfig,
        promptEngine,
        db.getDriver(),
        model,
        stateManager,
        effortLevel,
        maxTokens
      );

      // Generate queries (will update state file incrementally)
      const result = await generator.generateQueries(state.schemas);

      await db.close();

      if (result.success) {
        spinner.succeed('Sample queries generated!');
        this.log(chalk.green('\n✓ Query generation complete!'));
        this.log(`  Total queries: ${result.summary.totalQueriesGenerated}`);
        this.log(`  Validated: ${result.summary.queriesValidated}`);
        this.log(`  Failed validation: ${result.summary.queriesFailed}`);
        this.log(`  Tokens used: ${result.summary.tokensUsed.toLocaleString()}`);
        this.log(`  Estimated cost: $${result.summary.estimatedCost.toFixed(2)}`);
        this.log(`  Average confidence: ${(result.summary.averageConfidence * 100).toFixed(1)}%`);
        this.log(`  Execution time: ${(result.summary.totalExecutionTime / 1000).toFixed(1)}s`);
        this.log(`\n  Queries saved to:`);
        this.log(`    - ${flags['from-state']} (state.sampleQueries)`);

        this.log(chalk.blue('\n  Query breakdown:'));
        this.log(`    By type:`);
        Object.entries(result.summary.queriesByType).forEach(([type, count]) => {
          this.log(`      ${type}: ${count}`);
        });
        this.log(`    By complexity:`);
        Object.entries(result.summary.queriesByComplexity).forEach(([complexity, count]) => {
          this.log(`      ${complexity}: ${count}`);
        });
      } else {
        spinner.fail('Query generation failed');
        this.error(result.errorMessage || 'Unknown error');
      }

    } catch (error) {
      spinner.fail('Command failed');
      this.error((error as Error).message);
    }
  }
}
