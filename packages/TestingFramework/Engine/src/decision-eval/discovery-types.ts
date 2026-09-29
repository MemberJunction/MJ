/**
 * @fileoverview The Decision Eval shapes for the `agent-discovery` decision (plan Task 3.1): Sage's
 * pick of the agent that should handle a request, asked as one typed decision, and the
 * `semantic-search` baseline that measures what `Find Candidate Agents` ranked first.
 *
 * - **The corpus** is `corpus.jsonl` (one request per line) and `labels.jsonl` (one label per
 *   line, several sources per request). A label is `agent` (with the agent that should handle the
 *   request) or `none` (with why no specialist should: small talk, a question the conversation
 *   manager answers directly, or a multi-agent workflow).
 * - **A test** carries one request as its `InputDefinition` and its label as `ExpectedOutcomes`.
 *   Its `Configuration` pins the cell's model, or names the baseline, which makes no decision call.
 *
 * As in `types.ts`, every JSON shape is a Zod schema with its type inferred from it; the corpus
 * keys are the corpus's own (snake_case) and the test keys are the ones the suite generator writes.
 *
 * @module @memberjunction/testing-engine
 */

import { z } from 'zod';
import {
    DecisionEvalAnswerSummarySchema,
    DecisionEvalModelRecordSchema,
    DecisionEvalOracleSpecSchema,
    DecisionEvalSamplingSchema
} from './types';

/** The labels a discovery request can carry: an agent should handle it, or none should. */
export const DISCOVERY_EVAL_LABELS = ['agent', 'none'] as const;

/** A discovery label. */
export type DiscoveryEvalLabel = (typeof DISCOVERY_EVAL_LABELS)[number];

/**
 * Why no specialist agent should handle a request:
 * - `chat`: small talk;
 * - `direct`: a general question the conversation manager answers itself;
 * - `workflow`: a request that needs several agents, which the conversation manager plans.
 */
export const DISCOVERY_NONE_KINDS = ['chat', 'direct', 'workflow'] as const;

/** Why no specialist agent should handle a request. */
export type DiscoveryNoneKind = (typeof DISCOVERY_NONE_KINDS)[number];

/** The baselines a cell can run instead of the decision. */
export const DISCOVERY_EVAL_BASELINES = ['semantic-search'] as const;

/** A baseline. */
export type DiscoveryEvalBaseline = (typeof DISCOVERY_EVAL_BASELINES)[number];

/** What a run measured: the decision, or a baseline. */
export const DISCOVERY_EVAL_ARMS = ['decision', ...DISCOVERY_EVAL_BASELINES] as const;

/** What a run measured. */
export type DiscoveryEvalArm = (typeof DISCOVERY_EVAL_ARMS)[number];

/** The suite name when neither the matrix nor the command line gives one. */
export const DEFAULT_DISCOVERY_EVAL_SUITE_NAME = 'Decision Eval — Agent Discovery';

/** One request, as a corpus line records it. */
export const DiscoveryCorpusRequestSchema = z.object({
    id: z.string().uuid(),
    request: z.string().min(1),
    created_at: z.string().min(1)
});

/** One corpus request. */
export type DiscoveryCorpusRequest = z.infer<typeof DiscoveryCorpusRequestSchema>;

/** An `agent` label's own fields: the agent that should handle the request. */
const AgentLabelFields = { label: z.literal('agent'), agentId: z.string().uuid() };

/** A `none` label's own fields: why no specialist should. */
const NoneLabelFields = { label: z.literal('none'), kind: z.enum(DISCOVERY_NONE_KINDS) };

/** One label for a request, from one source. A request may have several, from different sources. */
export const DiscoveryCorpusLabelSchema = z.discriminatedUnion('label', [
    z.object({ id: z.string().uuid(), ...AgentLabelFields, source: z.string().min(1) }),
    z.object({ id: z.string().uuid(), ...NoneLabelFields, source: z.string().min(1) })
]);

/** One label line. */
export type DiscoveryCorpusLabel = z.infer<typeof DiscoveryCorpusLabelSchema>;

/** A label without its request ID and source: what the request should reach. */
export const DiscoveryLabelSchema = z.discriminatedUnion('label', [
    z.object(AgentLabelFields),
    z.object(NoneLabelFields)
]);

/** What a request should reach. */
export type DiscoveryLabel = z.infer<typeof DiscoveryLabelSchema>;

/** A discovery test's `Configuration`: the cell's model pinning, or its baseline. `null` reads as unset. */
export const DiscoveryEvalConfigSchema = z.object({
    decision: z.literal('agent-discovery'),
    /** Runs this baseline instead of the decision: no decision call is made. */
    baseline: z.enum(DISCOVERY_EVAL_BASELINES).nullish(),
    /** The decision prompt. Defaults to `Default Decision`, the prompt production's discovery asks. */
    promptName: z.string().min(1).nullish(),
    /** Pins the `MJ: AI Models` row that must answer. */
    modelId: z.string().uuid().nullish(),
    /** Pins the vendor. */
    vendorId: z.string().uuid().nullish(),
    /** Whether the runner may fail over. Defaults to false when the cell pins a model or vendor. */
    failover: z.boolean().nullish(),
    /** Requested sampling temperature. Recorded, not applied: see the driver. */
    temperature: z.number().nullish(),
    /** Requested sampling seed. Recorded, not applied: see the driver. */
    seed: z.number().int().nullish(),
    /** The oracles to run. */
    oracles: z.array(DecisionEvalOracleSpecSchema).min(1)
});

/** A discovery test's `Configuration`. */
export type DiscoveryEvalConfig = z.infer<typeof DiscoveryEvalConfigSchema>;

/** A discovery test's `InputDefinition`: the request, as the user typed it. */
export const DiscoveryEvalInputSchema = z.object({
    request: z.string().min(1)
});

/** A discovery test's `InputDefinition`. */
export type DiscoveryEvalInput = z.infer<typeof DiscoveryEvalInputSchema>;

/** A discovery test's `ExpectedOutcomes`: the request's label, and where the label came from. */
export const DiscoveryEvalExpectedSchema = z.discriminatedUnion('label', [
    z.object({ ...AgentLabelFields, labelSource: z.string().min(1) }),
    z.object({ ...NoneLabelFields, labelSource: z.string().min(1) })
]);

/** A discovery test's `ExpectedOutcomes`. */
export type DiscoveryEvalExpected = z.infer<typeof DiscoveryEvalExpectedSchema>;

/** How the decision arm's options were reached from the catalog. */
export const DiscoveryOptionsRecordSchema = z.object({
    /** How many options the Choice offered. */
    Count: z.number().int(),
    /** The most options the Choice may offer. */
    Limit: z.number().int(),
    /** The permitted, directly discoverable agents, minus the conversation manager. */
    CatalogSize: z.number().int(),
    /** Catalog agents left out for having no description. */
    WithoutDescription: z.number().int(),
    /** The decision model's declared option cap, or null. */
    DeclaredCap: z.number().nullable(),
    /** The option count before the semantic search narrowed it, or null when it did not. */
    NarrowedFrom: z.number().int().nullable()
});

/** How the decision arm's options were reached. */
export type DiscoveryOptionsRecord = z.infer<typeof DiscoveryOptionsRecordSchema>;

/** One agent the semantic search ranked, scored as `Find Candidate Agents` scores it. */
export const DiscoveryBaselineCandidateSchema = z.object({
    AgentId: z.string(),
    AgentName: z.string().nullable(),
    /** 1-based position in the search's results. */
    Rank: z.number().int(),
    /** The score the action reports: the larger of the semantic and lexical components, else the blended score. */
    Score: z.number(),
    Semantic: z.number().nullable(),
    Lexical: z.number().nullable(),
    /** Whether the action keeps it: semantic at or above the floor, or any lexical hit. */
    PassesFloor: z.boolean()
});

/** One ranked agent. */
export type DiscoveryBaselineCandidate = z.infer<typeof DiscoveryBaselineCandidateSchema>;

/** What the `semantic-search` baseline found. */
export const DiscoveryBaselineRecordSchema = z.object({
    /** The action's similarity floor. */
    Floor: z.number(),
    /** How many results the search was asked for. */
    TopK: z.number().int(),
    /** How many it returned. */
    Results: z.number().int(),
    /** The best-ranked candidate, floor or not, or null when the search returned none. */
    TopRanked: DiscoveryBaselineCandidateSchema.nullable(),
    /** The best-ranked candidate that passes the floor: the first row the action returns, or null when it returns none. */
    TopMatch: DiscoveryBaselineCandidateSchema.nullable()
});

/** What the baseline found. */
export type DiscoveryBaselineRecord = z.infer<typeof DiscoveryBaselineRecordSchema>;

/**
 * What a discovery run records as its `ActualOutput`. Both arms fill the shared fields:
 * - `ChosenAgentId`: the Choice's agent (decision), or the action's first row (baseline);
 * - `WouldInject`: whether production would suggest the agent: `JudgeDecisionDiscovery` at
 *   production's threshold (decision), or whether the action returns any row (baseline).
 */
export const DiscoveryEvalActualOutputSchema = z.object({
    Decision: z.literal('agent-discovery'),
    Arm: z.enum(DISCOVERY_EVAL_ARMS),
    /** The decision prompt, or null for the baseline. */
    PromptName: z.string().nullable(),
    /** The decision arm's options, or null. */
    Options: DiscoveryOptionsRecordSchema.nullable(),
    /** For an `agent` label: whether the labelled agent was among the options (decision) or the catalog (baseline). Null otherwise. */
    LabelledAgentOffered: z.boolean().nullable(),
    /** Every answer, summarized. The Choice keeps its full distribution, by agent ID. */
    Answers: z.record(DecisionEvalAnswerSummarySchema),
    ChosenAgentId: z.string().nullable(),
    ChosenAgentName: z.string().nullable(),
    /** The Choice's confidence, or null. */
    Confidence: z.number().nullable(),
    /** The Likelihood that a specialist agent should handle the request, or null. */
    AnyApplies: z.number().nullable(),
    /** Whether production would suggest the chosen agent, or null without a usable answer. */
    WouldInject: z.boolean().nullable(),
    /** The threshold `WouldInject` was judged at (decision arm), or null. */
    MinConfidence: z.number().nullable(),
    /** Why nothing would be injected, or null. */
    VerdictReason: z.string().nullable(),
    /** The baseline's ranking, or null for the decision arm. */
    Baseline: DiscoveryBaselineRecordSchema.nullable(),
    /** The model record (decision arm), or null. */
    Model: DecisionEvalModelRecordSchema.nullable(),
    Sampling: DecisionEvalSamplingSchema,
    /** Wall-clock time of the decision call, or of the search for the baseline, in milliseconds. */
    LatencyMs: z.number().nullable(),
    /** Whether the decision answered within production's discovery timeout, or null. */
    WithinProductionTimeout: z.boolean().nullable(),
    PromptRunId: z.string().nullable(),
    CostUSD: z.number().nullable(),
    /** Why the run produced no answer, or null. */
    Error: z.string().nullable()
});

/** What a discovery run records as its `ActualOutput`. */
export type DiscoveryEvalActualOutput = z.infer<typeof DiscoveryEvalActualOutputSchema>;

/**
 * The `discovery-label-match` oracle's `details`. `correct` is null when the run has no usable
 * answer to judge.
 */
export const DiscoveryLabelMatchDetailsSchema = z.object({
    arm: z.enum(DISCOVERY_EVAL_ARMS),
    label: z.enum(DISCOVERY_EVAL_LABELS),
    kind: z.enum(DISCOVERY_NONE_KINDS).nullable(),
    expectedAgentId: z.string().nullable(),
    chosenAgentId: z.string().nullable(),
    confidence: z.number().nullable(),
    anyApplies: z.number().nullable(),
    wouldInject: z.boolean().nullable(),
    /** The baseline's first row's score, or null. */
    topScore: z.number().nullable(),
    correct: z.boolean().nullable()
});

/** The `discovery-label-match` oracle's `details`. */
export type DiscoveryLabelMatchDetails = z.infer<typeof DiscoveryLabelMatchDetailsSchema>;

/** One agent in the catalog snapshot the corpus generator writes as `agents.json`. */
export const DiscoveryCatalogAgentSchema = z.object({
    ID: z.string().uuid(),
    Name: z.string(),
    Description: z.string()
});

/** One catalog agent. */
export type DiscoveryCatalogAgent = z.infer<typeof DiscoveryCatalogAgentSchema>;

/** `agents.json`: the discoverable agents a corpus was generated from, so a run can detect catalog drift. */
export const DiscoveryCatalogSnapshotSchema = z.object({
    created_at: z.string().min(1),
    /** The conversation manager the catalog excludes. */
    conversation_manager_id: z.string().uuid(),
    agents: z.array(DiscoveryCatalogAgentSchema)
});

/** `agents.json`. */
export type DiscoveryCatalogSnapshot = z.infer<typeof DiscoveryCatalogSnapshotSchema>;
