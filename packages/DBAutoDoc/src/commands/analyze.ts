/**
 * Analyze command - Main analysis workflow
 */

import { Command } from '@oclif/core';
import * as path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { ConfigLoader } from '../utils/config-loader.js';
import { DatabaseConnection } from '../database/DatabaseConnection.js';
import { Introspector } from '../database/Introspector.js';
import { DataSampler } from '../database/DataSampler.js';
import { TopologicalSorter } from '../database/TopologicalSorter.js';
import { StateManager } from '../state/StateManager.js';
import { IterationTracker } from '../state/IterationTracker.js';
import { StateValidator } from '../state/StateValidator.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { AnalysisEngine } from '../core/AnalysisEngine.js';

export default class Analyze extends Command {
  static description = 'Analyze database and generate documentation';

  static examples = ['$ db-auto-doc analyze'];

  static flags = {};

  static args = {};

  async run(): Promise<void> {
    const spinner = ora();

    try {
      // Load configuration
      spinner.start('Loading configuration');
      const config = await ConfigLoader.load('./config.json');
      spinner.succeed('Configuration loaded');

      // Initialize state manager
      const stateManager = new StateManager(config.output.stateFile);
      let state = await stateManager.load();

      // Connect to database
      spinner.start('Connecting to database');
      const db = new DatabaseConnection(config.database);
      await db.connect();
      const testResult = await db.test();

      if (!testResult.success) {
        throw new Error(testResult.message);
      }
      spinner.succeed(`Connected to ${config.database.database}`);

      // Initialize state if needed
      if (!state) {
        state = stateManager.createInitialState(config.database.database, config.database.server);
      }

      // Introspect database
      spinner.start('Introspecting database schema');
      const introspector = new Introspector(db);
      const schemas = await introspector.getSchemas(config.schemas, config.tables);
      state.schemas = schemas;
      spinner.succeed(`Found ${schemas.length} schemas with ${schemas.reduce((sum, s) => sum + s.tables.length, 0)} tables`);

      // Analyze data
      spinner.start('Analyzing table data (cardinality, statistics)');
      const sampler = new DataSampler(db, config.analysis);
      for (const schema of schemas) {
        for (const table of schema.tables) {
          await sampler.analyzeTable(schema.name, table.name, table.columns);
        }
      }
      spinner.succeed('Data analysis complete');

      // Topological sort
      spinner.start('Computing dependency graph');
      const sorter = new TopologicalSorter();
      const { levels } = sorter.buildAndSort(schemas);
      spinner.succeed(`Dependency graph computed (${levels.length} levels)`);

      // Initialize analysis components
      const promptsDir = path.join(__dirname, '../../prompts');
      const promptEngine = new PromptEngine(config.ai, promptsDir);
      await promptEngine.initialize();

      const iterationTracker = new IterationTracker();
      const analysisEngine = new AnalysisEngine(config, promptEngine, stateManager, iterationTracker);

      // Create analysis run
      const run = stateManager.createAnalysisRun(state, config.ai.model);

      // Main iteration loop
      let converged = false;
      while (!converged && run.iterationsPerformed < config.analysis.convergence.maxIterations) {
        iterationTracker.incrementIteration(state, run);

        this.log(chalk.blue(`\n=== Iteration ${run.iterationsPerformed} ===`));

        // Process each level
        for (let levelNum = 0; levelNum < levels.length; levelNum++) {
          spinner.start(`Processing Level ${levelNum} (${levels[levelNum].length} tables)`);

          const triggers = await analysisEngine.processLevel(state, run, levelNum, levels[levelNum]);

          spinner.succeed(`Level ${levelNum} complete`);

          // Backpropagation
          if (triggers.length > 0 && config.analysis.backpropagation.enabled) {
            spinner.start(`Backpropagating ${triggers.length} insights`);
            await analysisEngine.executeBackpropagation(state, run, triggers);
            spinner.succeed('Backpropagation complete');
          }

          // Save state after each level
          await stateManager.save(state);
        }

        // Check convergence
        converged = analysisEngine.checkConvergence(state, run);

        if (converged) {
          this.log(chalk.green('\n✓ Analysis converged!'));
        } else {
          this.log(chalk.yellow('Not yet converged, continuing...'));
        }
      }

      // Sanity checks
      if (config.analysis.sanityChecks.schemaLevel) {
        spinner.start('Performing schema-level sanity checks');
        for (const schema of state.schemas) {
          await analysisEngine.performSchemaSanityCheck(state, run, schema);
        }
        spinner.succeed('Schema sanity checks complete');
      }

      if (config.analysis.sanityChecks.crossSchema && state.schemas.length > 1) {
        spinner.start('Performing cross-schema sanity check');
        await analysisEngine.performCrossSchemaSanityCheck(state, run);
        spinner.succeed('Cross-schema sanity check complete');
      }

      // Complete run
      if (!converged) {
        iterationTracker.completeRun(run, false, 'Max iterations reached');
      }

      // Save final state
      await stateManager.save(state);

      // Summary
      this.log(chalk.green('\n✓ Analysis complete!'));
      this.log(`  Iterations: ${run.iterationsPerformed}`);
      this.log(`  Tokens used: ${run.totalTokensUsed.toLocaleString()}`);
      this.log(`  Estimated cost: $${run.estimatedCost.toFixed(2)}`);
      this.log(`  State file: ${config.output.stateFile}`);

      // Close database
      await db.close();

    } catch (error) {
      spinner.fail('Analysis failed');
      this.error((error as Error).message);
    }
  }
}
