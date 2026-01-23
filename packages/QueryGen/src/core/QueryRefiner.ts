/**
 * QueryRefiner - Iteratively improves queries based on evaluation feedback
 *
 * Uses evaluation and refinement AI prompts to assess if queries answer
 * the business question correctly and improve them through iterations.
 */

import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { UserInfo, LogStatus } from '@memberjunction/core';
import { extractErrorMessage } from '../utils/error-handlers';
import {
  GeneratedQuery,
  BusinessQuestion,
  EntityMetadataForPrompt,
  RefinedQuery,
  QueryEvaluation,
  QueryTestResult,
} from '../data/schema';
import { QueryTester } from './QueryTester';
import { PROMPT_QUERY_EVALUATOR, PROMPT_QUERY_REFINER } from '../prompts/PromptNames';
import { QueryGenConfig } from '../cli/config';
import { executePromptWithOverrides } from '../utils/prompt-helpers';

/**
 * QueryRefiner class
 * Iteratively refines queries based on evaluation feedback
 */
export class QueryRefiner {
  private entityMetadata: EntityMetadataForPrompt[] = [];

  constructor(
    private tester: QueryTester,
    private contextUser: UserInfo,
    private config: QueryGenConfig
  ) {}

  /**
   * Refine a query through evaluation and improvement iterations
   *
   * Loops up to maxRefinements times, testing and evaluating each iteration.
   * Returns when query passes evaluation or max refinements reached.
   *
   * @param query - Initial generated query
   * @param businessQuestion - Original business question
   * @param entityMetadata - Entity metadata for refinement
   * @param maxRefinements - Maximum refinement iterations (default: 3)
   * @returns Refined query with test results and evaluation
   */
  async refineQuery(
    query: GeneratedQuery,
    businessQuestion: BusinessQuestion,
    entityMetadata: EntityMetadataForPrompt[],
    maxRefinements: number = 3
  ): Promise<RefinedQuery> {
    // Store entity metadata for use in evaluation
    this.entityMetadata = entityMetadata;

    let currentQuery = query;
    let refinementCount = 0;

    // Track the last successfully tested query and its results
    let lastWorkingQuery = query;
    let lastWorkingTestResult: QueryTestResult | null = null;
    let lastWorkingEvaluation: QueryEvaluation | null = null;

    // Ensure AIEngine is configured
    await this.configureAIEngine();

    while (refinementCount < maxRefinements) {
      // 1. Test the current query
      let testResult: QueryTestResult;
      try {
        testResult = await this.testCurrentQuery(currentQuery);
        // Success! Save this as our last working version
        lastWorkingQuery = currentQuery;
        lastWorkingTestResult = testResult;
      } catch (error: unknown) {
        // Query broke during refinement - revert to last working version
        if (this.config.verbose) {
          LogStatus(`Refinement produced broken query: ${extractErrorMessage(error, 'Refinement Test')}. Reverting to last working version.`);
        }

        // If we have a previous working version, use that
        if (lastWorkingTestResult && lastWorkingEvaluation) {
          return this.buildSuccessResult(
            lastWorkingQuery,
            lastWorkingTestResult,
            lastWorkingEvaluation,
            refinementCount
          );
        }

        // No previous working version - throw the error
        throw error;
      }

      // 2. Evaluate if it answers the question
      const evaluation = await this.evaluateQuery(
        currentQuery,
        businessQuestion,
        testResult
      );
      lastWorkingEvaluation = evaluation;

      // 3. If evaluation passes, we're done!
      if (this.shouldStopRefining(evaluation)) {
        return this.buildSuccessResult(
          currentQuery,
          testResult,
          evaluation,
          refinementCount
        );
      }

      // 4. Refine the query based on suggestions
      refinementCount++;
      if (this.config.verbose) {
        LogStatus(`Refinement iteration ${refinementCount}/${maxRefinements}`);
      }

      currentQuery = await this.performRefinement(
        currentQuery,
        businessQuestion,
        evaluation,
        entityMetadata
      );
    }

    // Reached max refinements - return best attempt
    // Use the last successfully tested query
    if (lastWorkingTestResult && lastWorkingEvaluation) {
      return {
        query: lastWorkingQuery,
        testResult: lastWorkingTestResult,
        evaluation: lastWorkingEvaluation,
        refinementCount,
        reachedMaxRefinements: true,
      };
    }

    // Fallback: try to build final result with current query
    return await this.buildFinalResult(
      currentQuery,
      businessQuestion,
      refinementCount
    );
  }

  /**
   * Configure AIEngine for prompt execution
   * Ensures engine is ready before running prompts
   */
  private async configureAIEngine(): Promise<void> {
    try {
      const aiEngine = AIEngine.Instance;
      await aiEngine.Config(false, this.contextUser);
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error, 'AIEngine Configuration'));
    }
  }

  /**
   * Test current query using QueryTester
   * Throws if query testing fails
   */
  private async testCurrentQuery(query: GeneratedQuery): Promise<QueryTestResult> {
    const testResult = await this.tester.testQuery(query);

    if (!testResult.success) {
      throw new Error(
        `Query testing failed after ${testResult.attempts} attempts: ${testResult.error}`
      );
    }

    return testResult;
  }

  /**
   * Determine if refinement should stop based on evaluation
   * Stops if query answers question and doesn't need refinement
   */
  private shouldStopRefining(evaluation: QueryEvaluation): boolean {
    return evaluation.answersQuestion && !evaluation.needsRefinement;
  }

  /**
   * Build success result when refinement loop completes successfully
   */
  private buildSuccessResult(
    query: GeneratedQuery,
    testResult: QueryTestResult,
    evaluation: QueryEvaluation,
    refinementCount: number
  ): RefinedQuery {
    return {
      query,
      testResult,
      evaluation,
      refinementCount,
    };
  }

  /**
   * Build final result when max refinements reached
   * Re-tests and re-evaluates final query
   */
  private async buildFinalResult(
    query: GeneratedQuery,
    businessQuestion: BusinessQuestion,
    refinementCount: number
  ): Promise<RefinedQuery> {
    const testResult = await this.tester.testQuery(query);
    const evaluation = await this.evaluateQuery(
      query,
      businessQuestion,
      testResult
    );

    return {
      query,
      testResult,
      evaluation,
      refinementCount,
      reachedMaxRefinements: true,
    };
  }

  /**
   * Evaluate if query answers the business question correctly
   * Uses Query Result Evaluator AI prompt
   *
   * @param query - Query to evaluate
   * @param businessQuestion - Original business question
   * @param testResult - Test execution results with sample data
   * @returns Evaluation with confidence and suggestions
   */
  private async evaluateQuery(
    query: GeneratedQuery,
    businessQuestion: BusinessQuestion,
    testResult: QueryTestResult
  ): Promise<QueryEvaluation> {
    try {
      const aiEngine = AIEngine.Instance;
      const prompt = this.findPromptByName(aiEngine, PROMPT_QUERY_EVALUATOR);

      // Limit sample results to first 10 rows for efficiency
      const sampleResults = testResult.sampleRows?.slice(0, 10) || [];

      const promptData = {
        userQuestion: businessQuestion.userQuestion,
        description: businessQuestion.description,
        technicalDescription: businessQuestion.technicalDescription,
        entityMetadata: this.entityMetadata,
        generatedSQL: query.sql,
        parameters: query.parameters,
        sampleResults,
      };

      const evaluation = await this.executePrompt<QueryEvaluation>(
        prompt,
        promptData
      );

      this.logEvaluation(evaluation);
      return evaluation;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error, 'QueryRefiner.evaluateQuery'));
    }
  }

  /**
   * Refine query based on evaluation feedback
   * Uses Query Refiner AI prompt
   *
   * @param query - Current query to refine
   * @param businessQuestion - Original business question
   * @param evaluation - Evaluation feedback
   * @param entityMetadata - Entity metadata for refinement
   * @returns Refined query with improvements
   */
  private async performRefinement(
    query: GeneratedQuery,
    businessQuestion: BusinessQuestion,
    evaluation: QueryEvaluation,
    entityMetadata: EntityMetadataForPrompt[]
  ): Promise<GeneratedQuery> {
    try {
      const aiEngine = AIEngine.Instance;
      const prompt = this.findPromptByName(aiEngine, PROMPT_QUERY_REFINER);

      const promptData = {
        userQuestion: businessQuestion.userQuestion,
        description: businessQuestion.description,
        currentSQL: query.sql,
        evaluationFeedback: evaluation,
        entityMetadata,
      };

      const refinedQuery = await this.executePrompt<
        GeneratedQuery & { improvementsSummary: string }
      >(prompt, promptData);

      if (this.config.verbose) {
        LogStatus(`Refinements applied: ${refinedQuery.improvementsSummary}`);
      }

      return {
        queryName: refinedQuery.queryName,
        sql: refinedQuery.sql,
        parameters: refinedQuery.parameters,
      };
    } catch (error: unknown) {
      throw new Error(
        extractErrorMessage(error, 'QueryRefiner.performRefinement')
      );
    }
  }

  /**
   * Find prompt by name in AIEngine cache
   * Throws if prompt not found
   */
  private findPromptByName(
    aiEngine: AIEngine,
    promptName: string
  ): AIPromptEntityExtended {
    const prompt = aiEngine.Prompts.find((p) => p.Name === promptName);
    if (!prompt) {
      throw new Error(`Prompt '${promptName}' not found in AIEngine cache`);
    }
    return prompt;
  }

  /**
   * Execute AI prompt and parse result
   * Generic method for any prompt type
   */
  private async executePrompt<T>(
    prompt: AIPromptEntityExtended,
    promptData: Record<string, unknown>
  ): Promise<T> {
    const result = await executePromptWithOverrides<T>(
      prompt,
      promptData,
      this.contextUser,
      this.config
    );

    if (!result || !result.success) {
      throw new Error(
        `AI prompt execution failed: ${result?.errorMessage || 'Unknown error'}`
      );
    }

    if (!result.result) {
      throw new Error('AI prompt returned no result');
    }

    return result.result;
  }

  /**
   * Log evaluation results for debugging
   */
  private logEvaluation(evaluation: QueryEvaluation): void {
    if (!this.config.verbose) return;

    LogStatus(
      `Evaluation: answersQuestion=${evaluation.answersQuestion}, ` +
        `confidence=${evaluation.confidence}, ` +
        `needsRefinement=${evaluation.needsRefinement}`
    );

    if (evaluation.reasoning) {
      LogStatus(`Reasoning: ${evaluation.reasoning}`);
    }

    if (evaluation.suggestions.length > 0) {
      LogStatus(`Suggestions: ${evaluation.suggestions.join('; ')}`);
    }
  }
}
