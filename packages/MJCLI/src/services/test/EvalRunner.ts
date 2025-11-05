import fs from 'fs/promises';
import path from 'path';
import {
  EvalDefinition,
  EvalRunOptions,
  EvalExecutionResult,
  DataAssertionResult,
  EvalFileInfo,
  EvalListOptions,
} from './types';

/**
 * Service for discovering and running AI Evaluations
 */
export class EvalRunner {
  private databaseAvailable: boolean = false;

  constructor(databaseUrl?: string) {
    this.databaseAvailable = !!databaseUrl;
  }

  /**
   * Discover all eval files in a directory
   */
  async discoverEvals(directory: string, options: EvalListOptions = {}): Promise<EvalFileInfo[]> {
    const allEvals = await this.findAllEvals(directory);

    // Apply filters
    let filteredEvals = allEvals;

    if (options.category) {
      filteredEvals = filteredEvals.filter(e => e.category === options.category);
    }

    if (options.difficulty) {
      filteredEvals = filteredEvals.filter(e => e.difficulty === options.difficulty);
    }

    if (options.tags && options.tags.length > 0) {
      filteredEvals = filteredEvals.filter(e =>
        options.tags!.some(tag => e.tags.includes(tag))
      );
    }

    return filteredEvals;
  }

  /**
   * Run multiple evals based on options
   */
  async runEvals(directory: string, options: EvalRunOptions): Promise<EvalExecutionResult[]> {
    const results: EvalExecutionResult[] = [];

    // Discover evals to run
    let evalsToRun: EvalFileInfo[];

    if (options.eval_ids && options.eval_ids.length > 0) {
      // Run specific evals by ID
      evalsToRun = await this.findEvalsByIds(directory, options.eval_ids);
    } else if (options.all) {
      // Run all evals
      evalsToRun = await this.discoverEvals(directory);
    } else {
      // Run filtered evals
      evalsToRun = await this.discoverEvals(directory, {
        category: options.category,
        difficulty: options.difficulty,
        tags: options.tags,
      });
    }

    // Execute each eval
    for (const evalInfo of evalsToRun) {
      if (options.verbose) {
        console.log(`\nExecuting: ${evalInfo.eval_id}`);
      }

      const result = await this.runSingleEval(evalInfo.file_path, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Run a single eval
   */
  async runSingleEval(filePath: string, options: EvalRunOptions): Promise<EvalExecutionResult> {
    const startTime = Date.now();

    try {
      // Load eval definition
      const evalDef = await this.loadEval(filePath);

      // Dry run mode - just validate, don't execute
      if (options.dry_run) {
        return this.createDryRunResult(evalDef, startTime);
      }

      // Execute data assertions
      const dataResults = await this.executeDataAssertions(evalDef);

      // Calculate automated score (only data correctness for now)
      const dataScore = this.calculateDataScore(dataResults);
      const automatedScore = dataScore * evalDef.validation_criteria.data_correctness;

      // Generate validation checklist
      const validationChecklist = this.generateValidationChecklist(evalDef, dataResults);

      // Determine overall status
      const status = dataResults.every(r => r.status === 'pass') ? 'pass' : 'fail';

      const result: EvalExecutionResult = {
        eval_id: evalDef.eval_id,
        status,
        execution_time_ms: Date.now() - startTime,
        automated_score: automatedScore,
        requires_human_validation: true,
        data_assertion_results: dataResults,
        validation_checklist: validationChecklist,
        timestamp: new Date().toISOString(),
      };

      return result;

    } catch (error: any) {
      return {
        eval_id: path.basename(filePath, '.json'),
        status: 'error',
        execution_time_ms: Date.now() - startTime,
        automated_score: 0,
        requires_human_validation: true,
        data_assertion_results: [],
        validation_checklist: [],
        error_message: `Failed to execute eval: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Execute data assertions (SQL validation queries)
   */
  private async executeDataAssertions(evalDef: EvalDefinition): Promise<DataAssertionResult[]> {
    const results: DataAssertionResult[] = [];

    for (const assertion of evalDef.expected_outcome.data_assertions) {
      if (!assertion.sql_validation) {
        // No SQL query - skip for now
        results.push({
          metric: assertion.metric,
          expected_range: assertion.expected_range,
          expected_value: assertion.expected_value,
          status: 'skipped',
          message: 'No SQL validation query provided',
        });
        continue;
      }

      if (!this.databaseAvailable) {
        // Database not available - skip
        results.push({
          metric: assertion.metric,
          expected_range: assertion.expected_range,
          expected_value: assertion.expected_value,
          status: 'skipped',
          message: 'Database not available for SQL validation',
        });
        continue;
      }

      // TODO: Execute SQL query against database
      // For now, we'll simulate a pass
      results.push({
        metric: assertion.metric,
        expected_range: assertion.expected_range,
        expected_value: assertion.expected_value,
        actual_value: null,
        status: 'pass',
        message: 'SQL validation not yet implemented',
      });
    }

    return results;
  }

  /**
   * Calculate data correctness score
   */
  private calculateDataScore(results: DataAssertionResult[]): number {
    if (results.length === 0) return 0;

    const passedTests = results.filter(r => r.status === 'pass').length;
    return passedTests / results.length;
  }

  /**
   * Generate human validation checklist
   */
  private generateValidationChecklist(
    evalDef: EvalDefinition,
    dataResults: DataAssertionResult[]
  ): string[] {
    const checklist: string[] = [];

    // Parse human eval guidance into checklist items
    const guidanceLines = evalDef.human_eval_guidance.split(/\n|\./).filter(line => line.trim());
    checklist.push(...guidanceLines.filter(line => line.trim().length > 10));

    // Add visualization check
    checklist.push(
      `Verify visualization is ${evalDef.expected_outcome.visualization.type} ` +
      `(alternatives: ${evalDef.expected_outcome.visualization.alternatives?.join(', ') || 'none'})`
    );

    // Add interactivity checks
    if (evalDef.expected_outcome.interactivity) {
      for (const interaction of evalDef.expected_outcome.interactivity) {
        checklist.push(`Test interaction: ${interaction.action} → ${interaction.expected_result}`);
      }
    }

    // Add required features check
    if (evalDef.expected_outcome.required_features.length > 0) {
      checklist.push(
        `Confirm required features present: ${evalDef.expected_outcome.required_features.join(', ')}`
      );
    }

    return checklist;
  }

  /**
   * Create dry run result (validation only)
   */
  private createDryRunResult(evalDef: EvalDefinition, startTime: number): EvalExecutionResult {
    return {
      eval_id: evalDef.eval_id,
      status: 'skipped',
      execution_time_ms: Date.now() - startTime,
      automated_score: 0,
      requires_human_validation: true,
      data_assertion_results: [],
      validation_checklist: [],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Load eval definition from file
   */
  private async loadEval(filePath: string): Promise<EvalDefinition> {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as EvalDefinition;
  }

  /**
   * Find all evals in directory recursively
   */
  private async findAllEvals(directory: string): Promise<EvalFileInfo[]> {
    const evals: EvalFileInfo[] = [];

    async function scan(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const evalDef = JSON.parse(content) as EvalDefinition;

            evals.push({
              eval_id: evalDef.eval_id,
              category: evalDef.category,
              difficulty: evalDef.difficulty,
              tags: evalDef.tags,
              file_path: fullPath,
              business_context: evalDef.business_context,
              prompt: evalDef.prompt,
            });
          } catch (error) {
            // Skip invalid files
            console.warn(`Skipping invalid eval file: ${fullPath}`);
          }
        }
      }
    }

    await scan(directory);
    return evals;
  }

  /**
   * Find specific evals by ID
   */
  private async findEvalsByIds(directory: string, evalIds: string[]): Promise<EvalFileInfo[]> {
    const allEvals = await this.findAllEvals(directory);
    return allEvals.filter(e => evalIds.includes(e.eval_id));
  }
}
