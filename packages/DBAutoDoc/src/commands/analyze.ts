/**
 * Analyze command - Main analysis workflow
 */

import { Command } from '@oclif/core';
import * as path from 'path';
import * as fs from 'fs/promises';
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
import { SQLGenerator } from '../generators/SQLGenerator.js';
import { MarkdownGenerator } from '../generators/MarkdownGenerator.js';

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

      // Create run folder immediately
      if (!config.output.outputDir) {
        throw new Error('output.outputDir must be specified in config');
      }
      const runFolder = await this.createRunFolder(config.output.outputDir);
      const stateFilePath = path.join(runFolder, 'state.json');

      // Initialize state manager with run-specific path
      const stateManager = new StateManager(stateFilePath);
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

      // Start timing for guardrails
      analysisEngine.startAnalysis();

      // Create analysis run with AI config parameters
      const run = stateManager.createAnalysisRun(
        state,
        config.ai.model,
        config.ai.provider,
        config.ai.temperature || 0.1,
        undefined, // topP - not currently in config
        undefined  // topK - not currently in config
      );

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

          // Dependency-level sanity check
          if (config.analysis.sanityChecks.dependencyLevel && levels[levelNum].length > 0) {
            spinner.start(`Performing dependency-level sanity check (Level ${levelNum})`);
            const hasMaterialIssues = await analysisEngine.performDependencyLevelSanityCheck(
              state,
              run,
              levelNum,
              levels[levelNum]
            );
            if (hasMaterialIssues) {
              spinner.warn(`Found issues at Level ${levelNum} - will refine in next iteration`);
            } else {
              spinner.succeed(`Dependency-level sanity check passed (Level ${levelNum})`);
            }
          }

          // Backpropagation
          if (triggers.length > 0 && config.analysis.backpropagation.enabled) {
            spinner.start(`Backpropagating ${triggers.length} insights`);
            await analysisEngine.executeBackpropagation(state, run, triggers);
            spinner.succeed('Backpropagation complete');
          }

          // Update summary and save state after each level
          stateManager.updateSummary(state);
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
        let schemaIssuesFound = false;
        for (const schema of state.schemas) {
          const hasMaterialIssues = await analysisEngine.performSchemaLevelSanityCheck(state, run, schema);
          if (hasMaterialIssues) {
            schemaIssuesFound = true;
          }
        }
        if (schemaIssuesFound) {
          spinner.warn('Schema-level sanity checks found issues - see warnings');
        } else {
          spinner.succeed('Schema-level sanity checks passed');
        }
      }

      if (config.analysis.sanityChecks.crossSchema && state.schemas.length > 1) {
        spinner.start('Performing cross-schema sanity check');
        const hasMaterialIssues = await analysisEngine.performCrossSchemaSanityCheck(state, run);
        if (hasMaterialIssues) {
          spinner.warn('Cross-schema sanity check found issues - see warnings');
        } else {
          spinner.succeed('Cross-schema sanity check passed');
        }
      }

      // Complete run
      if (!converged) {
        iterationTracker.completeRun(run, false, 'Max iterations reached');
      }

      // Final summary update
      stateManager.updateSummary(state);
      await stateManager.save(state);

      // Export SQL and Markdown
      spinner.start('Exporting documentation files');

      const sqlGen = new SQLGenerator();
      const sql = sqlGen.generate(state, {});
      const sqlPath = path.join(runFolder, 'extended-props.sql');
      await fs.writeFile(sqlPath, sql, 'utf-8');

      const mdGen = new MarkdownGenerator();
      const markdown = mdGen.generate(state);
      const mdPath = path.join(runFolder, 'summary.md');
      await fs.writeFile(mdPath, markdown, 'utf-8');

      spinner.succeed('Exported documentation files');

      // Summary
      this.log(chalk.green('\n✓ Analysis complete!'));
      this.log(`  Iterations: ${run.iterationsPerformed}`);
      this.log(`  Tokens used: ${run.totalTokensUsed.toLocaleString()}`);
      this.log(`  Estimated cost: $${run.estimatedCost.toFixed(2)}`);
      this.log(`  Output folder: ${runFolder}`);
      this.log(`  Files:`);
      this.log(`    - state.json`);
      this.log(`    - extended-props.sql`);
      this.log(`    - summary.md`);

      // Close database
      await db.close();

    } catch (error) {
      spinner.fail('Analysis failed');
      this.error((error as Error).message);
    }
  }

  /**
   * Create run-numbered folder for this analysis run
   */
  private async createRunFolder(outputDir: string): Promise<string> {
    await fs.mkdir(outputDir, { recursive: true });

    // Determine next run number by looking for run-N folders
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    const runNumbers = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const match = e.name.match(/^run-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);

    const nextRunNumber = runNumbers.length > 0 ? Math.max(...runNumbers) + 1 : 1;
    const runFolder = path.join(outputDir, `run-${nextRunNumber}`);

    // Create run folder
    await fs.mkdir(runFolder, { recursive: true });

    return runFolder;
  }
}
