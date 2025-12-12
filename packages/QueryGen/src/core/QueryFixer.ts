/**
 * QueryFixer - Fixes SQL queries that fail execution
 *
 * Uses the SQL Query Fixer AI prompt to analyze errors and generate
 * corrected SQL queries with updated metadata.
 */

import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptEntityExtended } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { extractErrorMessage } from '../utils/error-handlers';
import {
  GeneratedQuery,
  EntityMetadataForPrompt,
  BusinessQuestion,
} from '../data/schema';
import { PROMPT_SQL_QUERY_FIXER } from '../prompts/PromptNames';

/**
 * QueryFixer class
 * Fixes SQL queries that fail to execute
 */
export class QueryFixer {
  constructor(private contextUser: UserInfo) {}

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
        originalSQL: query.sql,
        errorMessage,
        parameters: query.parameters,
        selectClause: query.selectClause,
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
      originalSQL: string;
      errorMessage: string;
      parameters: GeneratedQuery['parameters'];
      selectClause: GeneratedQuery['selectClause'];
      entityMetadata: EntityMetadataForPrompt[];
      userQuestion: string;
      description: string;
    }
  ): Promise<GeneratedQuery> {
    const promptRunner = new AIPromptRunner();
    const result = await promptRunner.ExecutePrompt({
      prompt,
      data: promptData,
      contextUser: this.contextUser,
    });

    if (!result || !result.success) {
      throw new Error(
        `AI prompt execution failed: ${result?.errorMessage || 'Unknown error'}`
      );
    }

    return this.parsePromptResult(result.result);
  }

  /**
   * Parse and validate AI prompt result
   * Ensures fixed query has all required properties
   */
  private parsePromptResult(resultData: unknown): GeneratedQuery {
    if (!resultData || typeof resultData !== 'object') {
      throw new Error('Invalid AI response: expected object');
    }

    const result = resultData as Partial<
      GeneratedQuery & { changesSummary: string }
    >;

    // Check for required properties
    if (!result.sql || typeof result.sql !== 'string') {
      throw new Error('Invalid AI response: sql property missing or invalid');
    }

    if (!Array.isArray(result.selectClause)) {
      throw new Error('Invalid AI response: selectClause must be an array');
    }

    if (!Array.isArray(result.parameters)) {
      throw new Error('Invalid AI response: parameters must be an array');
    }

    if (!result.changesSummary || typeof result.changesSummary !== 'string') {
      throw new Error(
        'Invalid AI response: changesSummary property missing or invalid'
      );
    }

    console.log(`Query fix applied: ${result.changesSummary}`);

    return {
      sql: result.sql,
      selectClause: result.selectClause,
      parameters: result.parameters,
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

    // Validate selectClause array
    if (!Array.isArray(query.selectClause) || query.selectClause.length === 0) {
      throw new Error('Fixed query must have at least one output field');
    }
  }
}
