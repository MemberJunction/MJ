import { AIPromptParams, type AIModelRunResult } from '@memberjunction/ai-core-plus';
import type { DecisionQuestion, DecisionAnswer, DecisionMedia, DecisionResult } from '@memberjunction/ai';

/**
 * Parameters for `AIDecisionRunner.ExecuteDecision`. Extends `AIPromptParams` for the fields the
 * runner base already reads (prompt, contextUser, data, templateData, override, configurationId,
 * cancellationToken, credentialId, verbose). Chat-only fields are ignored.
 */
export class AIDecisionParams extends AIPromptParams {
  /**
   * The state the questions are asked about. When set it is used as-is and the prompt's template is
   * not rendered. Keep it to what the questions need: decision models degrade on irrelevant state.
   */
  public State?: string | Record<string, unknown>;

  /** The typed questions, answered together in one call. Required. */
  public Questions: Record<string, DecisionQuestion> = {};

  /**
   * Media the questions are also asked about (an image, a recording, a PDF), read with the state as
   * one input. Only models whose driver reads every item's type are tried; the others are skipped
   * with failover. The run row records each item's type, MIME type and URI or size, never its data.
   */
  public Media?: DecisionMedia[];
}

/**
 * The result of `AIDecisionRunner.ExecuteDecision`. The inherited members carry the outcome, the
 * run row, timing, tokens, cost and the model that answered.
 */
export interface AIDecisionRunResult extends AIModelRunResult {
  /** The answers by question key. Empty on failure, so a caller never acts on partial answers. */
  Answers: Record<string, DecisionAnswer>;

  /** The driver's own result, including `Usage` and the vendor's `ResolvedModel` version. */
  DecisionResult?: DecisionResult;

  /** The driver class that answered, or was selected when the call failed. */
  DriverClass?: string;
}
