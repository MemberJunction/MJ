/**
 * @fileoverview The Decision Eval data shapes: the corpus a suite is generated from, and what a
 * `Decision Eval` test carries in its `Configuration`, `InputDefinition` and `ExpectedOutcomes`.
 *
 * Every shape that arrives as JSON (a corpus line, a label, a test record's JSON columns, a matrix)
 * is a Zod schema, and its TypeScript type is inferred from it, so the validation and the type
 * cannot drift apart. The corpus keys are the corpus's own (snake_case); the test keys are the
 * ones the suite generator writes.
 *
 * @module @memberjunction/testing-engine
 */

import { z } from 'zod';

/** The labels a corpus point can carry. `continue` means the previous agent should handle the message. */
export const DECISION_EVAL_LABELS = ['continue', 'switch', 'ambiguous'] as const;

/** A label: `continue` (the positive class), `switch`, or `ambiguous` (reported apart, never scored). */
export type DecisionEvalLabel = (typeof DECISION_EVAL_LABELS)[number];

/** The decisions the harness knows how to build. Conversation routing is the only one so far. */
export const DECISION_EVAL_DECISIONS = ['conversation-routing'] as const;

/** Which state a cell sends: the production text, or Phase −1's structured object. */
export const DECISION_EVAL_STATE_LAYOUTS = ['production', 'structured'] as const;

/** A state layout. */
export type DecisionEvalStateLayout = (typeof DECISION_EVAL_STATE_LAYOUTS)[number];

/** The label source the scorer uses unless told otherwise. */
export const DEFAULT_LABEL_SOURCE = 'construction';

/** The decision prompt a cell runs unless it names another. */
export const DEFAULT_DECISION_PROMPT_NAME = 'Default Decision';

/** One earlier conversation row, as a corpus point records it. */
export const DecisionCorpusHistoryRowSchema = z.object({
    id: z.string().uuid(),
    role: z.enum(['User', 'AI']),
    message: z.string(),
    agent_id: z.string().uuid().nullable(),
    agent_name: z.string().nullable(),
    created_at: z.string().min(1),
    status: z.string()
});

/** One artifact the previous agent produced, with its versions newest first. */
export const DecisionCorpusArtifactSchema = z.object({
    artifactId: z.string().uuid(),
    artifactName: z.string(),
    artifactType: z.string(),
    versions: z.array(z.object({
        versionId: z.string().uuid(),
        versionNumber: z.number().int(),
        versionName: z.string().nullable()
    }))
});

/**
 * One decision point: a user's new message, the agent that answered last, and the conversation
 * before it. The corpus's other fields (`fast_path`, `next_handler` and the two hindsight fields)
 * are not used, and parsing drops them, so they never reach a test record.
 */
export const DecisionCorpusPointSchema = z.object({
    id: z.string().uuid(),
    source: z.string(),
    conversation_id: z.string().uuid(),
    created_at: z.string().min(1),
    latest_message: z.string(),
    previous_agent: z.object({
        id: z.string().uuid(),
        name: z.string(),
        description: z.string()
    }),
    history: z.array(DecisionCorpusHistoryRowSchema),
    artifacts: z.array(DecisionCorpusArtifactSchema)
});

/** One decision point. */
export type DecisionCorpusPoint = z.infer<typeof DecisionCorpusPointSchema>;

/** One corpus history row. */
export type DecisionCorpusHistoryRow = z.infer<typeof DecisionCorpusHistoryRowSchema>;

/** One corpus artifact. */
export type DecisionCorpusArtifact = z.infer<typeof DecisionCorpusArtifactSchema>;

/** One label for a point, from one source. A point has several, from different sources. */
export const DecisionCorpusLabelSchema = z.object({
    id: z.string().uuid(),
    label: z.enum(DECISION_EVAL_LABELS),
    source: z.string().min(1),
    note: z.string()
});

/** One label line. */
export type DecisionCorpusLabel = z.infer<typeof DecisionCorpusLabelSchema>;

/** One oracle a Decision Eval test runs, as its `Configuration` lists it. */
export const DecisionEvalOracleSpecSchema = z.object({
    type: z.string().min(1),
    weight: z.number().nonnegative().optional(),
    config: z.record(z.unknown()).optional()
});

/**
 * A Decision Eval test's `Configuration`: which decision, which state layout, and the cell's model
 * pinning. `null` reads as unset, as mj-sync may write it.
 */
export const DecisionEvalConfigSchema = z.object({
    /** Which decision builder. */
    decision: z.enum(DECISION_EVAL_DECISIONS),
    /** `production` sends `BuildRoutingState`; `structured` sends `BuildRoutingStateStructured`. */
    stateLayout: z.enum(DECISION_EVAL_STATE_LAYOUTS),
    /** The decision prompt. Defaults to {@link DEFAULT_DECISION_PROMPT_NAME}. */
    promptName: z.string().min(1).nullish(),
    /** Pins the `MJ: AI Models` row that must answer. */
    modelId: z.string().uuid().nullish(),
    /** Pins the vendor. */
    vendorId: z.string().uuid().nullish(),
    /** Whether the runner may fail over. Defaults to false when the cell pins a model or vendor. */
    failover: z.boolean().nullish(),
    /** Requested sampling temperature. Recorded; see the driver for whether it reaches the model. */
    temperature: z.number().nullish(),
    /** Requested sampling seed. Recorded; see the driver for whether it reaches the model. */
    seed: z.number().int().nullish(),
    /** The oracles to run. */
    oracles: z.array(DecisionEvalOracleSpecSchema).min(1)
});

/** A Decision Eval test's `Configuration`. */
export type DecisionEvalConfig = z.infer<typeof DecisionEvalConfigSchema>;

/** A Decision Eval test's `InputDefinition`: one corpus point. */
export const DecisionEvalInputSchema = z.object({
    point: DecisionCorpusPointSchema
});

/** A Decision Eval test's `InputDefinition`. */
export type DecisionEvalInput = z.infer<typeof DecisionEvalInputSchema>;

/** A Decision Eval test's `ExpectedOutcomes`: the point's label, and where the label came from. */
export const DecisionEvalExpectedSchema = z.object({
    label: z.enum(DECISION_EVAL_LABELS),
    labelSource: z.string().min(1)
});

/** A Decision Eval test's `ExpectedOutcomes`. */
export type DecisionEvalExpected = z.infer<typeof DecisionEvalExpectedSchema>;

/** One answer, summarized: a Likelihood's probability, or a Choice's or Score's value, confidence and distribution. */
export const DecisionEvalAnswerSummarySchema = z.object({
    Kind: z.enum(['Likelihood', 'Choice', 'Score']),
    Probability: z.number().optional(),
    Value: z.union([z.string(), z.number()]).optional(),
    Confidence: z.number().optional(),
    Probabilities: z.record(z.number()).optional()
});

/** One summarized answer. */
export type DecisionEvalAnswerSummary = z.infer<typeof DecisionEvalAnswerSummarySchema>;

/** Which model a run was pinned to, which one answered, and whether they match. */
export const DecisionEvalModelRecordSchema = z.object({
    PinnedModelId: z.string().nullable(),
    PinnedVendorId: z.string().nullable(),
    FailoverAllowed: z.boolean(),
    AnsweredModelId: z.string().nullable(),
    AnsweredModelName: z.string().nullable(),
    AnsweredVendorId: z.string().nullable(),
    AnsweredVendorName: z.string().nullable(),
    DriverClass: z.string().nullable(),
    /** The vendor's resolved version, when the driver reports one. For `LLMDecision`, the chat model that answered. */
    ResolvedModel: z.string().nullable(),
    /** Null when nothing was pinned. */
    AnsweredByPinned: z.boolean().nullable(),
    /** True when a pinned run was answered by another model or vendor. */
    FailedOver: z.boolean()
});

/** The model record of one run. */
export type DecisionEvalModelRecord = z.infer<typeof DecisionEvalModelRecordSchema>;

/** The sampling a cell asked for, and whether the decision path applied it. */
export const DecisionEvalSamplingSchema = z.object({
    RequestedTemperature: z.number().nullable(),
    RequestedSeed: z.number().nullable(),
    Applied: z.boolean(),
    Note: z.string().nullable()
});

/** The sampling record of one run. */
export type DecisionEvalSampling = z.infer<typeof DecisionEvalSamplingSchema>;

/** What a Decision Eval run records as its `ActualOutput`. */
export const DecisionEvalActualOutputSchema = z.object({
    Decision: z.enum(DECISION_EVAL_DECISIONS),
    StateLayout: z.enum(DECISION_EVAL_STATE_LAYOUTS),
    PromptName: z.string(),
    /** Every answer, summarized. A Choice keeps its full distribution. */
    Answers: z.record(DecisionEvalAnswerSummarySchema),
    /** The `continues` Likelihood's raw probability, or null when there is none. */
    ContinuesProbability: z.number().nullable(),
    /** The agent Choice's value and confidence, or null. */
    Route: z.object({ Value: z.string(), Confidence: z.number() }).nullable(),
    /** What production would do with these answers (`InterpretRoutingAnswers`), or null without answers. */
    RoutingVerdict: z.enum(['Routed', 'SomeoneElse', 'KeptContinuity']).nullable(),
    Model: DecisionEvalModelRecordSchema,
    Sampling: DecisionEvalSamplingSchema,
    /** Wall-clock time of the one `ExecuteDecision` call, in milliseconds. */
    LatencyMs: z.number().nullable(),
    /** The `MJ: AI Prompt Runs` row the runner wrote. */
    PromptRunId: z.string().nullable(),
    /** The run's cost in USD, from the prompt run when it has one. */
    CostUSD: z.number().nullable(),
    /** Why the run produced no answers, or null. */
    Error: z.string().nullable()
});

/** What a Decision Eval run records as its `ActualOutput`. */
export type DecisionEvalActualOutput = z.infer<typeof DecisionEvalActualOutputSchema>;

/** The `decision-label-match` oracle's configuration, with its defaults. */
export const DecisionLabelMatchConfigSchema = z.object({
    /** The Likelihood whose probability is compared with the label. */
    question: z.string().min(1).default('continues'),
    /** The label that counts as the positive class. */
    positiveLabel: z.enum(['continue', 'switch']).default('continue'),
    /** A probability at or above it predicts the positive class. */
    threshold: z.number().min(0).max(1).default(0.5)
});

/** The `decision-label-match` oracle's configuration. */
export type DecisionLabelMatchConfig = z.infer<typeof DecisionLabelMatchConfigSchema>;

/**
 * The `decision-label-match` oracle's `details`. On an `ambiguous` label, which is advisory and
 * not scored, `positive`, `correct` and `brier` are null.
 */
export const DecisionLabelMatchDetailsSchema = z.object({
    probability: z.number().nullable(),
    label: z.enum(DECISION_EVAL_LABELS),
    positive: z.union([z.literal(0), z.literal(1)]).nullable(),
    correct: z.boolean().nullable(),
    brier: z.number().nullable()
});

/** The `decision-label-match` oracle's `details`. */
export type DecisionLabelMatchDetails = z.infer<typeof DecisionLabelMatchDetailsSchema>;

/**
 * Describes the first problem Zod found, as `path: message`.
 *
 * @param error The Zod error.
 */
export function DescribeZodError(error: z.ZodError): string {
    const issue = error.issues[0];
    if (!issue) {
        return 'invalid';
    }
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    const more = error.issues.length > 1 ? ` (and ${error.issues.length - 1} more)` : '';
    return `${path}: ${issue.message}${more}`;
}
