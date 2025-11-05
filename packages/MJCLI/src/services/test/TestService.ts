import fs from 'fs/promises';
import path from 'path';
import { EvalRunner } from './EvalRunner';
import { EvalValidator } from './EvalValidator';
import { EvalReporter } from './EvalReporter';
import {
  EvalDefinition,
  EvalRunOptions,
  EvalExecutionResult,
  EvalValidationResult,
  EvalFileInfo,
  EvalListOptions,
} from './types';

/**
 * Main orchestration service for the testing framework
 */
export class TestService {
  private runner: EvalRunner;
  private validator: EvalValidator;
  private reporter: EvalReporter;

  constructor(databaseUrl?: string) {
    this.runner = new EvalRunner(databaseUrl);
    this.validator = new EvalValidator();
    this.reporter = new EvalReporter();
  }

  /**
   * List available evals
   */
  async listEvals(directory: string, options: EvalListOptions = {}): Promise<EvalFileInfo[]> {
    return this.runner.discoverEvals(directory, options);
  }

  /**
   * Validate eval files
   */
  async validateEvals(directory: string, verbose: boolean = false): Promise<EvalValidationResult> {
    return this.validator.validateDirectory({
      directory,
      verbose,
      check_sql: false, // Don't validate SQL by default (requires database)
    });
  }

  /**
   * Run evals
   */
  async runEvals(directory: string, options: EvalRunOptions): Promise<EvalExecutionResult[]> {
    // First validate if not dry run
    if (!options.dry_run) {
      const validationResult = await this.validateEvals(directory, options.verbose);

      if (!validationResult.is_valid) {
        throw new Error(
          `Validation failed with ${validationResult.errors.length} errors. ` +
          `Fix errors before running evals, or use --dry-run to test without validation.`
        );
      }
    }

    // Run evals
    return this.runner.runEvals(directory, options);
  }

  /**
   * Get eval definition
   */
  async getEvalDefinition(filePath: string): Promise<EvalDefinition> {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Save results to file
   */
  async saveResults(results: EvalExecutionResult[], outputPath: string): Promise<void> {
    const json = JSON.stringify(results, null, 2);
    await fs.writeFile(outputPath, json, 'utf-8');
  }

  /**
   * Load results from file
   */
  async loadResults(inputPath: string): Promise<EvalExecutionResult[]> {
    const content = await fs.readFile(inputPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Get reporter instance
   */
  getReporter(): EvalReporter {
    return this.reporter;
  }
}

/**
 * Export singleton for convenience
 */
let testService: TestService | null = null;

export function getTestService(databaseUrl?: string): TestService {
  if (!testService) {
    testService = new TestService(databaseUrl);
  }
  return testService;
}

export function resetTestService(): void {
  testService = null;
}
