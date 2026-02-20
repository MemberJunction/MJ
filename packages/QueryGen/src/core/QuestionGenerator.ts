/**
 * QuestionGenerator - Generates business questions for entity groups using AI
 *
 * Uses the Business Question Generator AI prompt to create 1-2 meaningful
 * business questions per entity group that can be answered with SQL.
 */

import { AIEngine } from '@memberjunction/aiengine';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { UserInfo, LogStatus } from '@memberjunction/core';
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
      const totalGenerated = result.questions.length;
      const validQuestions = this.validateQuestions(result.questions, entityGroup);

      // Log if questions were filtered out
      if (this.config.verbose && totalGenerated > validQuestions.length) {
        LogStatus(
          `QuestionGenerator: Filtered out ${totalGenerated - validQuestions.length} of ${totalGenerated} questions for ${entityGroup.primaryEntity.Name}`
        );
      }

      // Warn if no valid questions generated
      if (validQuestions.length === 0 && totalGenerated > 0) {
        LogStatus(
          `⚠️  QuestionGenerator: All ${totalGenerated} generated questions were filtered out for ${entityGroup.primaryEntity.Name}`
        );
      }

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
  ): MJAIPromptEntityExtended {
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
    prompt: MJAIPromptEntityExtended,
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
   * Corrects entity name casing to match exact entity group names
   *
   * @param questions - Raw questions from AI
   * @param entityGroup - Entity group for validation context
   * @returns Filtered array of valid questions with corrected entity names
   */
  private validateQuestions(
    questions: BusinessQuestion[],
    entityGroup: EntityGroup
  ): BusinessQuestion[] {
    // Create case-insensitive lookup map: lowercase -> exact entity name
    // Also map BaseView names to correct entity names (in case LLM returns view names)
    const entityNameLookup = new Map<string, string>();
    for (const entity of entityGroup.entities) {
      // Map entity name (case-insensitive)
      entityNameLookup.set(entity.Name.toLowerCase(), entity.Name);

      // Map base view name to entity name (case-insensitive) as backup
      if (entity.BaseView) {
        entityNameLookup.set(entity.BaseView.toLowerCase(), entity.Name);
      }
    }

    return questions
      .filter((q) => {
        // Must have required fields
        if (!this.hasRequiredFields(q)) {
          if (this.config.verbose) {
            LogStatus(`  ❌ Filtered: Missing required fields - "${q.userQuestion?.substring(0, 60)}..."`);
          }
          return false;
        }

        // Must reference entities in the group (by name or base view)
        if (!this.referencesGroupEntities(q, entityNameLookup)) {
          if (this.config.verbose) {
            LogStatus(`  ❌ Filtered: Doesn't reference group entities - "${q.userQuestion.substring(0, 60)}..." (references: ${q.entities.join(', ')})`);
          }
          return false;
        }

        return true;
      })
      .map((q) => {
        // Correct entity name casing to match exact entity group names
        const correctedEntities = q.entities.map((entityName) => {
          const exactName = entityNameLookup.get(entityName.toLowerCase());
          return exactName || entityName; // Use exact name if found, otherwise keep original
        });

        return {
          ...q,
          entities: correctedEntities
        };
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
   * Uses case-insensitive matching to handle minor casing differences
   * Also accepts base view names as valid references
   */
  private referencesGroupEntities(
    question: BusinessQuestion,
    entityNameLookup: Map<string, string>
  ): boolean {
    return question.entities.some((entityName) =>
      entityNameLookup.has(entityName.toLowerCase())
    );
  }

}
