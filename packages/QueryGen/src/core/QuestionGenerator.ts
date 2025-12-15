/**
 * QuestionGenerator - Generates business questions for entity groups using AI
 *
 * Uses the Business Question Generator AI prompt to create 1-2 meaningful
 * business questions per entity group that can be answered with SQL.
 */

import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptEntityExtended } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { QueryGenConfig } from '../cli/config';
import { extractErrorMessage } from '../utils/error-handlers';
import { formatEntityGroupForPrompt } from '../utils/entity-helpers';
import { executePromptWithOverrides } from '../utils/prompt-helpers';
import { EntityGroup, BusinessQuestion } from '../data/schema';
import { PROMPT_BUSINESS_QUESTION_GENERATOR } from '../prompts/PromptNames';

/**
 * Result structure from Business Question Generator AI prompt
 */
interface QuestionGeneratorResult {
  questions: BusinessQuestion[];
}

/**
 * QuestionGenerator class
 * Generates domain-specific business questions using AI
 */
export class QuestionGenerator {
  constructor(
    private contextUser: UserInfo,
    private config: QueryGenConfig
  ) {}

  /**
   * Generate business questions for an entity group
   * Uses AI to create 1-2 meaningful questions per entity group
   *
   * @param entityGroup - Entity group to generate questions for
   * @returns Array of validated business questions
   */
  async generateQuestions(entityGroup: EntityGroup): Promise<BusinessQuestion[]> {
    try {
      // Ensure AIEngine is configured
      const aiEngine = AIEngine.Instance;
      await aiEngine.Config(false, this.contextUser);

      // Find the Business Question Generator prompt
      const prompt = this.findPromptByName(aiEngine, PROMPT_BUSINESS_QUESTION_GENERATOR);

      // Format entity group for prompt
      const entityMetadata = formatEntityGroupForPrompt(entityGroup);

      // Execute AI prompt
      const result = await this.executePrompt(prompt, entityMetadata);

      // Validate and filter questions
      const validQuestions = this.validateQuestions(result.questions, entityGroup);

      return validQuestions;
    } catch (error: unknown) {
      throw new Error(
        extractErrorMessage(error, 'QuestionGenerator.generateQuestions')
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
   * Execute the AI prompt with model/vendor overrides
   * Parses JSON response and validates structure
   */
  private async executePrompt(
    prompt: AIPromptEntityExtended,
    entityMetadata: unknown
  ): Promise<QuestionGeneratorResult> {
    const result = await executePromptWithOverrides<QuestionGeneratorResult>(
      prompt,
      { entityGroupMetadata: entityMetadata },
      this.contextUser,
      this.config
    );

    if (!result || !result.success) {
      throw new Error(`AI prompt execution failed: ${result?.errorMessage || 'Unknown error'}`);
    }

    if (!result.result) {
      throw new Error('AI prompt returned no result');
    }

    return result.result;
  }


  /**
   * Validate and filter business questions
   * Removes low-quality or unanswerable questions
   *
   * @param questions - Raw questions from AI
   * @param entityGroup - Entity group for validation context
   * @returns Filtered array of valid questions
   */
  private validateQuestions(
    questions: BusinessQuestion[],
    entityGroup: EntityGroup
  ): BusinessQuestion[] {
    const entityNames = new Set(entityGroup.entities.map((e) => e.Name));

    return questions.filter((q) => {
      // Must have required fields
      if (!this.hasRequiredFields(q)) {
        return false;
      }

      // Must reference entities in the group
      if (!this.referencesGroupEntities(q, entityNames)) {
        return false;
      }

      // Must not be overly generic
      if (this.isTooGeneric(q)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Check if question has all required fields
   */
  private hasRequiredFields(question: BusinessQuestion): boolean {
    return !!(
      question.userQuestion &&
      question.description &&
      question.technicalDescription &&
      question.complexity &&
      Array.isArray(question.entities) &&
      question.entities.length > 0
    );
  }

  /**
   * Check if question references entities in the group
   */
  private referencesGroupEntities(
    question: BusinessQuestion,
    entityNames: Set<string>
  ): boolean {
    return question.entities.some((entityName) => entityNames.has(entityName));
  }

  /**
   * Check if question is too generic to be useful
   */
  private isTooGeneric(question: BusinessQuestion): boolean {
    const genericPatterns = [
      /show\s+me\s+all/i,
      /list\s+all/i,
      /get\s+all/i,
      /display\s+all/i,
      /^what\s+is/i,
    ];

    return genericPatterns.some((pattern) =>
      pattern.test(question.userQuestion)
    );
  }
}
