/**
 * @fileoverview Type definitions for agent decision requests and results.
 *
 * Decisions allow agents to ask typed questions evaluated inline by a fast
 * decision model at zero turn cost. Answers arrive on the next turn.
 *
 * @module @memberjunction/ai-core-plus
 * @author MemberJunction.com
 * @since 2.132.0
 */

/** One typed question for the decision model. Write instructions and descriptions as full sentences: the model reads them, never the keys. */
export type AgentDecisionQuestion =
  | { kind: 'Likelihood'; instructions: string }                                                        // yes/no -> probability of yes
  | { kind: 'Choice'; instructions: string; options: Array<{ value: string; description: string }> }    // pick one (2..255 options)
  | { kind: 'Score'; instructions: string; levels: string[] };                                          // ordered rubric, lowest first (2..10 levels), each level a description

/** A request for a decision, answered by a fast decision model without an LLM turn. The answers arrive on the next turn. */
export interface AgentDecisionRequest {
  /** Names this request. The answers come back under it. */
  id: string;
  /** What the questions are about. Either literal text, or a path into the payload starting "payload." (for example "payload.ticket"). */
  state?: string;
  /** Ask the same questions of each item of a payload array, one decision per item (for example "payload.tickets"). Use instead of `state`. */
  forEachItemIn?: string;
  /** The questions, keyed by a short label for code. */
  questions: Record<string, AgentDecisionQuestion>;
}

/** The answers to one decision request, as injected on the next turn. */
export interface AgentDecisionResult {
  /** The ID of the decision request these answers correspond to. */
  id: string;
  /** Whether the decision execution succeeded. */
  success: boolean;
  /** Error message if the decision execution failed. */
  error?: string;
  /** Number of items skipped if forEachItemIn exceeded decisionsMaxItems cap. */
  skippedCount?: number;
  /** Per question: a Likelihood's probability, or a Choice/Score value with its confidence. One entry per item when forEachItemIn was used. */
  answers?: Record<string, AgentDecisionAnswerSummary> | Array<Record<string, AgentDecisionAnswerSummary>>;
}

/** Summary of an answer to an individual decision question. */
export interface AgentDecisionAnswerSummary {
  /** A Likelihood's probability of yes. */
  probability?: number;
  /** A Choice's option value, or a Score's position from 0 (lowest level). */
  value?: string | number;
  /** How confident the model is in `value` (0..1). */
  confidence?: number;
}

/** Ends the run after this step without another LLM turn, when a fast decision model confirms the step's results are good. */
export interface AgentFinishIf {
  /** One to three yes/no questions about what the step's results show; each must be a confident yes. */
  questions: string[];
  /** The final reply to the user if every question passes. Write it as your final message. */
  message: string;
}

