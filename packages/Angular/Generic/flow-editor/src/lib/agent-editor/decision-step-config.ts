import {
  FLOW_DECISION_KEY_PATTERN,
  ReadFlowDecisionStepConfiguration,
  type FlowDecisionStepConfiguration,
  type TaskGraphDecisionQuestion
} from '@memberjunction/ai-core-plus';

/**
 * What a Decision step's configuration says, for an editor that has to show a half-written one.
 *
 * The runtime reader (`ReadFlowDecisionStepConfiguration`) refuses a configuration with any problem,
 * which is right for running it and wrong for editing it: a new step has no questions yet, and its
 * author still needs to see and change its key. So the editor reads through the runtime first and,
 * only when the runtime refuses, falls back to the parts that parse. Whether the step can run is
 * still the runtime's answer alone.
 */

/** A question key is held to the step key's shape, so `decisions.<key>.<question>` is always plain dots. */
export const DECISION_QUESTION_KEY_PATTERN = FLOW_DECISION_KEY_PATTERN;

/**
 * A Decision step's configuration as the runtime reads it or, when the runtime refuses it, the parts
 * that parse. `null` when the column holds no JSON object at all.
 *
 * @param json the step's `Configuration` column
 */
export function ReadEditableDecisionConfig(json: string | null | undefined): FlowDecisionStepConfiguration | null {
  const read = ReadFlowDecisionStepConfiguration(json);
  if ('Config' in read) return read.Config;

  const parsed = parseJSONObject(json);
  if (!parsed) return null;
  const state = parsed['state'];
  return {
    key: typeof parsed['key'] === 'string' ? parsed['key'] : '',
    ...(typeof state === 'string' ? { state } : {}),
    questions: readQuestions(parsed['questions'])
  };
}

/**
 * The key a Decision step's configuration stores, whether or not the runtime can read the rest of it.
 *
 * Uniqueness is judged on this: a step whose other settings are unfinished still holds its key, and
 * giving a second step the same key would merge their conditions the moment the first is finished.
 */
export function ReadDecisionStepKey(json: string | null | undefined): string | null {
  const key = parseJSONObject(json)?.['key'];
  return typeof key === 'string' ? key : null;
}

/** The stored questions that are objects. Anything else cannot be edited as a question, so it is dropped from view. */
function readQuestions(value: unknown): Record<string, TaskGraphDecisionQuestion> {
  if (!isJSONObject(value)) return {};
  const questions: Record<string, TaskGraphDecisionQuestion> = {};
  for (const [key, question] of Object.entries(value)) {
    if (isJSONObject(question) && typeof question['kind'] === 'string') {
      questions[key] = question as TaskGraphDecisionQuestion;
    }
  }
  return questions;
}

/** The column as a JSON object, or `null` when it is empty, not JSON, or not an object. */
function parseJSONObject(json: string | null | undefined): Record<string, unknown> | null {
  if (!json?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return isJSONObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isJSONObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
