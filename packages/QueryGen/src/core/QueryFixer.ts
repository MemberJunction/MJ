/**
 * QueryFixer - Fixes SQL queries that fail execution
 *
 * Uses the SQL Query Fixer AI prompt to analyze errors and generate
 * corrected SQL queries with updated metadata.
 */

import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { UserInfo, LogStatus } from '@memberjunction/core';
import { extractErrorMessage } from '../utils/error-handlers';
import {
  GeneratedQuery,
  EntityMetadataForPrompt,
  BusinessQuestion,
} from '../data/schema';
import { PROMPT_SQL_QUERY_FIXER } from '../prompts/PromptNames';
import { QueryGenConfig } from '../cli/config';
import { executePromptWithOverrides } from '../utils/prompt-helpers';

/**
 * QueryFixer class
 * Fixes SQL queries that fail to execute
 */
export class QueryFixer {
  constructor(
    private contextUser: UserInfo,
    private config: QueryGenConfig
  ) {}

  /**
   * Fix a SQL query that failed to execute
   * Uses AI to analyze the error and generate a corrected query
   *
   * @param query - The query that failed
   * @param errorMessage - The error message from execution
   * @param entityMetadata - Entity metadata for context
   * @param businessQuestion - Original business question for context
   * @returns Corrected SQL query with updated metadata
   */
  async fixQuery(
    query: GeneratedQuery,
    errorMessage: string,
    entityMetadata: EntityMetadataForPrompt[],
    businessQuestion: BusinessQuestion
  ): Promise<GeneratedQuery> {
    try {
      // Ensure AIEngine is configured
      const aiEngine = AIEngine.Instance;
      await aiEngine.Config(false, this.contextUser);

      // Find the SQL Query Fixer prompt
      const prompt = this.findPromptByName(aiEngine, PROMPT_SQL_QUERY_FIXER);

      // Prepare prompt data
      const promptData = {
        queryName: query.queryName,
        originalSQL: query.sql,
        errorMessage,
        parameters: query.parameters,
        entityMetadata,
        userQuestion: businessQuestion.userQuestion,
        description: businessQuestion.description,
      };

      // Execute AI prompt to fix the query
      const fixedQuery = await this.executePrompt(prompt, promptData);

      // Validate the fixed query structure
      this.validateFixedQuery(fixedQuery);

      return fixedQuery;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error, 'QueryFixer.fixQuery'));
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
   * Execute the SQL Query Fixer AI prompt
   * Parses JSON response and validates structure
   */
  private async executePrompt(
    prompt: AIPromptEntityExtended,
    promptData: {
      queryName: string;
      originalSQL: string;
      errorMessage: string;
      parameters: GeneratedQuery['parameters'];
      entityMetadata: EntityMetadataForPrompt[];
      userQuestion: string;
      description: string;
    }
  ): Promise<GeneratedQuery> {
    // The SQL Query Fixer template returns { newSQL, reasoning }
    const result = await executePromptWithOverrides<{
      newSQL: string;
      reasoning: string;
    }>(prompt, promptData, this.contextUser, this.config);

    if (!result || !result.success) {
      throw new Error(
        `AI prompt execution failed: ${result?.errorMessage || 'Unknown error'}`
      );
    }

    if (!result.result) {
      throw new Error('AI prompt returned no result');
    }

    // Log the reasoning
    if (this.config.verbose && result.result.reasoning) {
      LogStatus(`Query fix reasoning: ${result.result.reasoning}`);
    }

    // Return GeneratedQuery format, preserving original parameters and queryName
    return {
      queryName: promptData.queryName,
      sql: result.result.newSQL,
      parameters: promptData.parameters,
    };
  }

  /**
   * Validate fixed query structure
   * Ensures query has proper metadata
   *
   * @param query - Fixed query to validate
   * @throws Error if query structure is invalid
   */
  private validateFixedQuery(query: GeneratedQuery): void {
    // Validate SQL is present
    if (!query.sql || query.sql.trim().length === 0) {
      throw new Error('Fixed query has empty SQL');
    }

    // Validate parameters array
    if (!Array.isArray(query.parameters)) {
      throw new Error('Fixed query parameters must be an array');
    }
  }
}
