/**
 * QueryWriter - Generates SQL query templates using AI with few-shot learning
 *
 * Uses the SQL Query Writer AI prompt to generate Nunjucks SQL templates
 * based on business questions and similar golden query examples.
 */

import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { UserInfo, LogStatus } from '@memberjunction/core';
import { QueryGenConfig } from '../cli/config';
import { extractErrorMessage } from '../utils/error-handlers';
import { executePromptWithOverrides } from '../utils/prompt-helpers';
import { BusinessQuestion, GeneratedQuery, EntityMetadataForPrompt, GoldenQuery } from '../data/schema';
import { PROMPT_SQL_QUERY_WRITER } from '../prompts/PromptNames';

/**
 * QueryWriter class
 * Generates Nunjucks SQL query templates using AI with few-shot learning
 */
export class QueryWriter {
  constructor(
    private contextUser: UserInfo,
    private config: QueryGenConfig
  ) {}

  /**
   * Generate SQL query template for a business question
   * Uses few-shot learning with similar golden query examples
   *
   * @param businessQuestion - Business question to answer with SQL
   * @param entityMetadata - Available entity metadata for query
   * @param fewShotExamples - Similar golden queries for few-shot learning
   * @returns Generated SQL query with parameters and output schema
   */
  async generateQuery(
    businessQuestion: BusinessQuestion,
    entityMetadata: EntityMetadataForPrompt[],
    fewShotExamples: GoldenQuery[]
  ): Promise<GeneratedQuery> {
    try {
      // Ensure AIEngine is configured
      const aiEngine = AIEngine.Instance;
      await aiEngine.Config(false, this.contextUser);

      // Find the SQL Query Writer prompt
      const prompt = this.findPromptByName(aiEngine, PROMPT_SQL_QUERY_WRITER);

      // Prepare prompt data
      const promptData = {
        userQuestion: businessQuestion.userQuestion,
        description: businessQuestion.description,
        technicalDescription: businessQuestion.technicalDescription,
        entityMetadata,
        fewShotExamples,
      };

      // Execute AI prompt
      const generatedQuery = await this.executePrompt(prompt, promptData);

      // Validate the generated query structure
      this.validateGeneratedQuery(generatedQuery);

      return generatedQuery;
    } catch (error: unknown) {
      throw new Error(
        extractErrorMessage(error, 'QueryWriter.generateQuery')
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
   * Execute the SQL Query Writer AI prompt with retry logic for validation failures
   * Parses JSON response and validates structure, retrying with feedback if validation fails
   */
  private async executePrompt(
    prompt: AIPromptEntityExtended,
    promptData: {
      userQuestion: string;
      description: string;
      technicalDescription: string;
      entityMetadata: EntityMetadataForPrompt[];
      fewShotExamples: GoldenQuery[];
    }
  ): Promise<GeneratedQuery> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    let lastResult: GeneratedQuery | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Execute AI prompt
        const result = await executePromptWithOverrides<GeneratedQuery>(
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

        lastResult = result.result;

        // Validate the generated query structure
        // This will throw if validation fails
        this.validateGeneratedQuery(lastResult);

        // Validation passed, return the query
        return lastResult;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          throw new Error(
            `Query generation failed after ${maxRetries + 1} attempts: ${lastError.message}`
          );
        }

        // Log retry attempt
        if (this.config.verbose) {
          LogStatus(`⚠️ Query validation failed on attempt ${attempt + 1}/${maxRetries + 1}: ${lastError.message}`);
          LogStatus(`   Retrying with validation feedback...`);
        }

        // Add validation feedback to the prompt data for next attempt
        // This helps the LLM correct its mistakes
        promptData = {
          ...promptData,
          // Add feedback about what went wrong
          validationFeedback: `Previous attempt failed validation: ${lastError.message}. Please correct this issue.`,
        } as typeof promptData & { validationFeedback: string };
      }
    }

    // Should never reach here due to throw in loop, but TypeScript needs this
    throw lastError || new Error('Query generation failed');
  }

  /**
   * Validate generated query structure
   * Ensures query has proper SQL template syntax and valid metadata
   *
   * @param query - Generated query to validate
   * @throws Error if query structure is invalid
   */
  private validateGeneratedQuery(query: GeneratedQuery): void {
    // Validate SQL is present
    if (!query.sql || query.sql.trim().length === 0) {
      throw new Error('Generated query has empty SQL');
    }

    // Validate SQL contains base view references (not raw tables)
    if (!this.usesBaseViews(query.sql)) {
      throw new Error('Generated SQL must use base views (vw*), not raw tables');
    }

    // Validate parameters array
    if (!Array.isArray(query.parameters)) {
      throw new Error('Generated query parameters must be an array');
    }

    // Validate each parameter
    for (const param of query.parameters) {
      this.validateParameter(param);
    }
  }

  /**
   * Check if SQL uses base views (vw* pattern)
   * Basic heuristic: looks for view names in FROM and JOIN clauses
   */
  private usesBaseViews(sql: string): boolean {
    // Look for view patterns like [schema].[vw...] or FROM vw...
    const viewPattern = /\b(FROM|JOIN)\s+(\[\w+\]\.)?\[?vw\w+\]?/i;
    return viewPattern.test(sql);
  }

  /**
   * Validate a single query parameter
   * Ensures all required fields are present and valid
   */
  private validateParameter(param: unknown): void {
    if (!param || typeof param !== 'object') {
      throw new Error('Query parameter must be an object');
    }

    const p = param as Record<string, unknown>;

    if (!p.name || typeof p.name !== 'string') {
      throw new Error('Query parameter must have a valid name');
    }

    if (!p.type || typeof p.type !== 'string') {
      throw new Error(`Query parameter '${p.name}' must have a valid type`);
    }

    if (typeof p.isRequired !== 'boolean') {
      throw new Error(`Query parameter '${p.name}' must have isRequired boolean`);
    }

    if (!p.description || typeof p.description !== 'string') {
      throw new Error(`Query parameter '${p.name}' must have a description`);
    }

    if (!Array.isArray(p.usage)) {
      throw new Error(`Query parameter '${p.name}' must have usage array`);
    }

    // sampleValue is required and can be string, number, boolean, or array depending on parameter type
    if (p.sampleValue === undefined || p.sampleValue === null || p.sampleValue === '') {
      throw new Error(`Query parameter '${p.name}' must have a sampleValue`);
    }
  }

}
