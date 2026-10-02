/**
 * @fileoverview Parameter and result types for `AIRerankerRunner`.
 *
 * @module @memberjunction/ai-reranker
 */

import type { UserInfo } from '@memberjunction/core';
import type { RerankParams, RerankResponse } from '@memberjunction/ai';
import type { MJAIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Parameters for `AIRerankerRunner.RunRerank`: the driver's own `RerankParams` (query, documents,
 * topK, options), plus what the runner needs to choose a model and record the run.
 */
export interface AIRerankParams extends RerankParams {
    /** The user the run is made and recorded for. Required. */
    ContextUser: UserInfo;

    /**
     * Pins the reranker model by ID, as `AIDecisionRunner` does with `override.modelId`. Failover then
     * stays within that model's vendors.
     */
    ModelID?: string;

    /**
     * The `MJ: AI Prompts` row whose bindings choose the model and whose failover settings apply.
     * Defaults to the `Default Rerank` prompt.
     */
    PromptID?: string;

    /**
     * The prompt a prompt-backed candidate runs, in place of the one its model-vendor `APIName` names:
     * the chat prompt of an `LLMReranker`, or the decision prompt of a `DecisionReranker`.
     * `RerankerService.RerankNotes` passes `RerankerConfiguration.rerankPromptID` here.
     */
    ChatPromptID?: string;

    /** A parent `MJ: AI Prompt Runs` row, recorded as this run's `ParentID`. */
    ParentRunID?: string;

    /**
     * The agent run this rerank belongs to. `MJ: AI Prompt Runs` has no agent-run column, so it is
     * recorded in the row's `Messages`.
     */
    AgentRunID?: string;
}

/**
 * The result of `AIRerankerRunner.RunRerank`. The runner never throws: every failure is
 * `Success: false` with an `ErrorMessage`.
 */
export interface AIRerankRunResult {
    /** Whether the documents were reranked. */
    Success: boolean;

    /** Why the rerank failed, when it did. */
    ErrorMessage?: string;

    /** The driver's response, ranked by relevance. Absent when no model was called. */
    Response?: RerankResponse;

    /** The `MJ: AI Prompt Runs` row for this call. Absent when the call never reached a model. */
    PromptRunID?: string;

    /**
     * The run row itself, as the runner holds it. Its `TotalCost` and token rollups include the prompt
     * runs of a prompt-backed driver once its queued finalize has run, so an agent step can carry it
     * as its `PromptRun` and the agent run counts the rerank. Absent when `PromptRunID` is.
     */
    PromptRun?: MJAIPromptRunEntityExtended;

    /** The model that answered after any failover, or the last one tried when the call failed. */
    ModelID?: string;

    /** The name of that model. */
    ModelName?: string;

    /** The driver class of that model. */
    DriverClass?: string;

    /** Wall-clock time for the whole call, in milliseconds. */
    ExecutionTimeMS: number;
}
