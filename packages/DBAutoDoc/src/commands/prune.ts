/**
 * Prune command - Standalone PK/FK pruning on existing state
 */

import { Command, Flags } from '@oclif/core';
import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'fs';
import * as readline from 'readline';
import { ConfigLoader } from '../utils/config-loader.js';
import { AnalysisEngine } from '../core/AnalysisEngine.js';
import { StateManager } from '../state/StateManager.js';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { PromptEngine } from '../prompts/PromptEngine.js';
import { IterationTracker } from '../state/IterationTracker.js';
import { DatabaseDocumentation, AnalysisRun } from '../types/state.js';

export default class Prune extends Command {
  static description = 'Run PK/FK pruning on an existing state file without re-running analysis';

  static examples = [
    '$ db-auto-doc prune --state ./output/run-1/state.json --config ./config.json',
    '$ db-auto-doc prune --state ./output/run-1/state.json --config ./config.json --pk-only',
    '$ db-auto-doc prune --state ./output/run-1/state.json --config ./config.json --fk-only',
    '$ db-auto-doc prune --state ./output/run-1/state.json --config ./config.json --silent'
  ];

  static flags = {
    state: Flags.string({
      char: 's',
      description: 'Path to existing state.json file',
      required: true
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to config file',
      default: './config.json'
    }),
    silent: Flags.boolean({
      description: 'Skip interactive confirmation, apply all pruning proposals automatically',
      default: false
    }),
    'pk-only': Flags.boolean({
      description: 'Only prune primary keys',
      default: false
    }),
    'fk-only': Flags.boolean({
      description: 'Only prune foreign keys',
      default: false
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Prune);
    const spinner = ora();

    try {
      // Load config
      spinner.start('Loading configuration');
      const config = await ConfigLoader.load(flags.config);
      spinner.succeed('Configuration loaded');

      // Load state
      spinner.start('Loading state file');
      if (!fs.existsSync(flags.state)) {
        this.error(`State file not found: ${flags.state}`);
      }
      const stateContent = fs.readFileSync(flags.state, 'utf-8');
      const state: DatabaseDocumentation = JSON.parse(stateContent);
      spinner.succeed(`State loaded: ${state.schemas?.length || 0} schemas`);

      // Create engine components
      const stateManager = new StateManager(flags.state);
      const promptsDir = path.join(__dirname, '../../prompts');
      const promptEngine = new PromptEngine(config.ai, promptsDir);
      const iterationTracker = new IterationTracker();
      await promptEngine.initialize();
      const analysisEngine = new AnalysisEngine(config, promptEngine, stateManager, iterationTracker);

      // Create a minimal run object for tracking
      const run: AnalysisRun = {
        runId: 'prune-' + Date.now(),
        startedAt: new Date().toISOString(),
        status: 'in_progress',
        levelsProcessed: 0,
        iterationsPerformed: 0,
        backpropagationCount: 0,
        sanityCheckCount: 0,
        converged: false,
        modelUsed: config.ai.model,
        vendor: config.ai.provider || 'gemini',
        temperature: config.ai.temperature || 0.1,
        totalTokensUsed: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCost: 0,
        warnings: [],
        errors: [],
        processingLog: [],
        sanityChecks: []
      };

      let pkResults = { removed: 0, kept: 0 };
      let fkResults = { removed: 0, kept: 0 };

      // PK pruning
      if (!flags['fk-only'] && state.phases.keyDetection) {
        spinner.start('Running PK pruning...');
        const { locked: pkLocked, unlocked: pkUnlocked } = analysisEngine.lockInterimPKGroundTruth(state);
        spinner.succeed(`PK ground truth: ${pkLocked} locked, ${pkUnlocked} unlocked`);

        if (pkUnlocked > 0) {
          pkResults = await analysisEngine.prunePrimaryKeys(state, run);
          this.log(chalk.yellow(`  PK pruning: ${pkResults.removed} removed, ${pkResults.kept} kept`));
        } else {
          this.log(chalk.green('  No unlocked PKs to prune'));
        }
      }

      // FK pruning
      if (!flags['pk-only'] && state.phases.keyDetection) {
        spinner.start('Running FK pruning...');
        const { locked: fkLocked, unlocked: fkUnlocked } = analysisEngine.lockInterimGroundTruth(state);
        spinner.succeed(`FK ground truth: ${fkLocked} locked, ${fkUnlocked} unlocked`);

        if (fkUnlocked > 0) {
          fkResults = await analysisEngine.pruneForeignKeys(state, run);
          this.log(chalk.yellow(`  FK pruning: ${fkResults.removed} removed, ${fkResults.kept} kept`));
        } else {
          this.log(chalk.green('  No unlocked FKs to prune'));
        }
      }

      // Summary
      this.log('');
      this.log(chalk.bold('Pruning Summary:'));
      this.log(`  PKs: ${pkResults.removed} removed, ${pkResults.kept} kept`);
      this.log(`  FKs: ${fkResults.removed} removed, ${fkResults.kept} kept`);

      // Interactive confirmation (unless --silent)
      if (!flags.silent && (pkResults.removed > 0 || fkResults.removed > 0)) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(resolve => {
          rl.question(chalk.cyan('\nApply these changes? (Y/N): '), resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'y') {
          this.log(chalk.red('Changes discarded.'));
          return;
        }
      }

      // Save updated state
      spinner.start('Saving updated state');
      stateManager.updateSummary(state);
      fs.writeFileSync(flags.state, JSON.stringify(state, null, 2));
      spinner.succeed(`State saved to ${flags.state}`);

      this.log(chalk.green('\n✓ Pruning complete!'));

    } catch (error) {
      spinner.fail('Pruning failed');
      this.error((error as Error).message);
    }
  }
}
