import type { ScoreAnswer, ScoreQuestion } from '@memberjunction/ai';
import type { MJRubricEvaluationEntity } from '@memberjunction/core-entities';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import type { EvaluationAgentRunner } from './AgentRubricEvaluator.js';
import type { RubricSubjectContent } from './content.js';
import type { RubricCriterionTemplateData, RubricPromptData } from './promptData.js';
import type { RubricEvaluatorOutput } from './RubricEvaluator.js';

/** The value stored in `RubricEvaluation.EvaluatorType`. */
export type RubricEvaluatorType = MJRubricEvaluationEntity['EvaluatorType'];

/** A JSON value an evaluator may keep in its settings or its run metadata. */
export type RubricJsonValue = string | number | boolean | null | RubricJsonValue[] | { [key: string]: RubricJsonValue };

/** SinglePass asks once for the whole rubric. PerCriterion asks once per leaf. */
export type RubricPromptMode = 'SinglePass' | 'PerCriterion';

/** Which prompt chooses the model for an LLM evaluation: the evaluator prompt, or the judge. */
export type RubricModelSelection = 'System' | 'Judge';

/**
 * Settings for one evaluation. They come from an agent-rubric link's EvaluatorConfig, a test's
 * evaluator block, or the caller. Each evaluator reads the fields it understands and ignores the rest.
 */
export interface RubricEvaluatorSettings {
    /**
     * The swappable prompt, by `MJ: AI Prompts` ID. Wins over PromptName. For LLM it is the
     * **judge**: the child prompt rendered into the evaluator prompt's `judgePrompt` slot
     * (default `Rubric Evaluator - Default Judge`). For Decision it is the decision prompt
     * whose bindings choose the model (default `Default Decision`).
     */
    PromptID?: string;
    /** The swappable prompt by name, when no PromptID is set. */
    PromptName?: string;
    /**
     * LLM only. The parent evaluator prompt, which owns the reply contract the engine parses.
     * Default `Rubric Evaluator`. Replace it only with a prompt that returns the same JSON.
     */
    SystemPromptID?: string;
    /** LLM only. The parent evaluator prompt by name. */
    SystemPromptName?: string;
    /** The prompt that renders one criterion as text, for LLM and Decision. Default `Rubric Criterion`. */
    CriterionPromptID?: string;
    /** The criterion prompt by name. */
    CriterionPromptName?: string;
    /** LLM only. `System` (default): the evaluator prompt's bindings choose the model. `Judge`: the judge's do. */
    ModelSelection?: RubricModelSelection;
    /** Pins the model. Otherwise the choosing prompt's model bindings choose. */
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
    /** What the call cost, when the runner reports it. */
    Cost?: number | null;
}

/**
 * One evaluator prompt call: the parent prompt, the judge composed into its `judgePrompt` slot,
 * the template data both render, and the subject as its own user message.
 */
export interface RubricPromptRequest {
    Prompt: RubricPromptRef;
    Judge?: RubricPromptRef;
    Data: RubricPromptData;
    Subject: string;
    /** Pins the model. Otherwise the choosing prompt's model bindings choose. */
    ModelID?: string;
    /** Which prompt's bindings choose the model: the evaluator prompt (System, the default) or the judge. */
    ModelSelection?: RubricModelSelection;
    /** How long to wait for the model, in milliseconds. A call that runs over fails. */
    TimeoutMS?: number;
}

/**
 * The prompt system, as the rubric evaluators use it. Every call goes through AIPromptRunner, so
 * templates come from the prompt rows in the database: swap a prompt and the next evaluation uses it.
 */
export interface RubricPromptService {
    /** Renders the parent with the judge in its slot, sends it with the subject, and returns the reply. */
    Run(input: RubricPromptRequest): Promise<RubricPromptOutput>;
    /** Renders the criterion prompt once per item, with no model call. Output order matches input order. */
    RenderCriteria(input: { Prompt: RubricPromptRef; Items: RubricCriterionTemplateData[] }): Promise<string[]>;
    /** The composed system prompt Run would send, with no model call. For previews and checks. */
    Preview(input: Omit<RubricPromptRequest, 'Subject' | 'ModelID' | 'ModelSelection' | 'TimeoutMS'>): Promise<string>;
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
