import type { ScoreAnswer, ScoreQuestion } from '@memberjunction/ai';
import type { MJRubricEvaluationEntity } from '@memberjunction/core-entities';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import type { EvaluationAgentRunner } from './AgentRubricEvaluator.js';
import type { RubricSubjectContent } from './content.js';
import type { RubricEvaluatorOutput } from './RubricEvaluator.js';

/** The value stored in `RubricEvaluation.EvaluatorType`. */
export type RubricEvaluatorType = MJRubricEvaluationEntity['EvaluatorType'];

/** A JSON value an evaluator may keep in its settings or its run metadata. */
export type RubricJsonValue = string | number | boolean | null | RubricJsonValue[] | { [key: string]: RubricJsonValue };

/** SinglePass asks once for the whole rubric. PerCriterion asks once per leaf. */
export type RubricPromptMode = 'SinglePass' | 'PerCriterion';

/** The rubric, and the subject in a separate user message. */
export interface RubricEvaluatorMessages {
    system: string;
    user: string;
}

/**
 * Settings for one evaluation. They come from an agent-rubric link's EvaluatorConfig, a test's
 * evaluator block, or the caller. Each evaluator reads the fields it understands and ignores the rest.
 */
export interface RubricEvaluatorSettings {
    /** The `MJ: AI Prompts` row to run. Wins over PromptName. */
    PromptID?: string;
    /** The prompt to run by name, when no PromptID is set. Each evaluator has a default. */
    PromptName?: string;
    /** Pins the model. Otherwise the prompt's own model bindings choose. */
    ModelID?: string;
    /** The agent an Agent evaluator runs. Recorded with the evaluation. */
    AgentID?: string;
    /** LLM only. SinglePass when omitted. */
    Mode?: RubricPromptMode;
    /** LLM only. Runs the rubric this many times and keeps each criterion's median level. */
    Samples?: number;
    /** Settings for a custom evaluator, keyed by its evaluator name. */
    Extensions?: Record<string, RubricJsonValue>;
}

/** Names a prompt by id or by name. */
export interface RubricPromptRef {
    ID?: string;
    Name?: string;
}

/** One chat prompt run. `PromptRunID` is the `MJ: AI Prompt Runs` row it wrote, when there is one. */
export interface RubricPromptOutput {
    Text: string;
    PromptRunID?: string | null;
}

/** Runs a chat prompt through the prompt system: model selection, failover, and a prompt run row. */
export interface RubricPromptService {
    Run(input: { Prompt: RubricPromptRef; Messages: RubricEvaluatorMessages; ModelID?: string }): Promise<RubricPromptOutput>;
}

/** The answers to one decision call, by question key. */
export interface RubricDecisionOutput {
    Answers: Record<string, ScoreAnswer>;
    PromptRunID?: string | null;
}

/** Asks a Decision-type model typed Score questions about the subject, all in one call. */
export interface RubricDecisionService {
    Decide(input: { Prompt: RubricPromptRef; State: string; Questions: Record<string, ScoreQuestion>; ModelID?: string }): Promise<RubricDecisionOutput>;
}

/**
 * What the engine lends an evaluator. A host supplies the ones it has. An evaluator that needs one
 * that is missing throws, and the engine records a Failed evaluation with that message.
 */
export interface RubricEvaluatorServices {
    Prompts?: RubricPromptService;
    Decisions?: RubricDecisionService;
    Agent?: EvaluationAgentRunner;
}

/** Everything one evaluation run can read. */
export interface RubricEvaluatorContext {
    Version: RubricVersionSnapshot;
    Content: RubricSubjectContent;
    Subject: { entityName: string; recordId: string };
    Settings: RubricEvaluatorSettings;
    Services: RubricEvaluatorServices;
}

/**
 * The scored output, plus provenance the engine stores on the evaluation: the prompt or agent run
 * that produced it, and run details that land in `RubricEvaluation.Metadata`.
 */
export interface RubricEvaluatorRun extends RubricEvaluatorOutput {
    aiPromptRunId?: string | null;
    aiAgentRunId?: string | null;
    metadata?: Record<string, RubricJsonValue>;
}
