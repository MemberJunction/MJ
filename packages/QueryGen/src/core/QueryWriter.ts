/**
 * QueryWriter - Generates SQL query templates using AI with few-shot learning
 *
 * Uses the SQL Query Writer AI prompt to generate Nunjucks SQL templates
 * based on business questions and similar golden query examples.
 */

import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptEntityExtended } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { extractErrorMessage } from '../utils/error-handlers';
import { BusinessQuestion, GeneratedQuery, EntityMetadataForPrompt, GoldenQuery } from '../data/schema';
import { PROMPT_SQL_QUERY_WRITER } from '../prompts/PromptNames';

/**
 * QueryWriter class
 * Generates Nunjucks SQL query templates using AI with few-shot learning
 */
export class QueryWriter {
  constructor(private contextUser: UserInfo) {}

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
   * Execute the SQL Query Writer AI prompt
   * Parses JSON response and validates structure
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
   * Ensures query has all required properties
   */
  private parsePromptResult(resultData: unknown): GeneratedQuery {
    if (!resultData || typeof resultData !== 'object') {
      throw new Error('Invalid AI response: expected object');
    }

    const result = resultData as Partial<GeneratedQuery>;

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

    return result as GeneratedQuery;
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

    // Validate selectClause array
    if (!Array.isArray(query.selectClause) || query.selectClause.length === 0) {
      throw new Error('Generated query must have at least one output field');
    }

    // Validate each output field
    for (const field of query.selectClause) {
      this.validateOutputField(field);
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

    if (!p.sampleValue || typeof p.sampleValue !== 'string') {
      throw new Error(`Query parameter '${p.name}' must have a sampleValue`);
    }
  }

  /**
   * Validate a single output field
   * Ensures all required fields are present and valid
   */
  private validateOutputField(field: unknown): void {
    if (!field || typeof field !== 'object') {
      throw new Error('Query output field must be an object');
    }

    const f = field as Record<string, unknown>;

    if (!f.name || typeof f.name !== 'string') {
      throw new Error('Query output field must have a valid name');
    }

    if (!f.description || typeof f.description !== 'string') {
      throw new Error(`Query output field '${f.name}' must have a description`);
    }

    if (!f.type || typeof f.type !== 'string') {
      throw new Error(`Query output field '${f.name}' must have a valid type`);
    }

    if (typeof f.optional !== 'boolean') {
      throw new Error(`Query output field '${f.name}' must have optional boolean`);
    }
  }
}
