/**
 * @fileoverview Core contract for Agent Pipelines — a server-side dataflow the agent authors and
 * the server runs, so intermediate values never enter the LLM context window.
 *
 * The pipe carries a {@link PipeValue} (a JSON value), PowerShell-style, NOT a string: stages bind
 * to object properties instead of re-parsing text. Capabilities (Actions / artifact tools) are
 * effectful async stages behind {@link PipelineInvocable}; pure operators (where/select/sort/…) are
 * synchronous value→value functions; `map`/`let` are control constructs handled by the executor.
 *
 * @module @memberjunction/ai-agents
 */

/** A JSON value — the medium that flows between pipeline stages. */
export type PipeValue = null | boolean | number | string | PipeValue[] | { [key: string]: PipeValue };

/** Which substrate produced a step. DB persistence collapses operator/map/let to 'Transform'. */
export type PipelineProviderKind = 'Action' | 'ArtifactTool' | 'Transform';

/** Pointer from a step back to its underlying log (polymorphic by substrate). */
export interface PipelineStepLogRef {
    providerKind: PipelineProviderKind;
    /** ActionExecutionLog row ID for Action steps; undefined otherwise. */
    actionExecutionLogId?: string;
    /** Truncated text preview of the step's output, for steps with no DB log. */
    preview?: string;
}

/** Result of invoking a single capability stage. */
export interface PipelineStepResult {
    output: PipeValue;
    success: boolean;
    error?: string;
    logRef: PipelineStepLogRef;
}

/**
 * A capability stage — an Action or artifact tool. Effectful + async. The executor resolves
 * templating and `pipeInto` into `params` before calling `invoke`; the raw upstream `input` is
 * passed too for providers that want it.
 */
export interface PipelineInvocable {
    readonly toolName: string;
    readonly providerKind: PipelineProviderKind;
    /** Whether this can be a pipeline's first stage (produces data without upstream). */
    readonly isSource: boolean;
    invoke(input: PipeValue, params: Record<string, unknown>): Promise<PipelineStepResult>;
}

/** A pure operator — value in, value out. May throw (executor catches and reports the stage). */
export interface PipelineOperator {
    readonly name: string;
    readonly description: string;
    /** JSON-schema-ish arg description for the tool docs. */
    readonly argsHint: string;
    apply(input: PipeValue, args: unknown): PipeValue;
}

/**
 * One stage of a pipeline, exactly one verb key + its args, e.g. `{ "where": "Balance > 0" }`,
 * `{ "tool": "Run View", "with": {...}, "pipeInto": "Body" }`, `{ "map": { "as": "row", "do": [...] } }`.
 */
export interface PipelineStage {
    [verb: string]: unknown;
}

/** Per-stage record emitted by the executor; persisted in the pipeline `Tool` run-step's `OutputData`. */
export interface PipelineStepRecord {
    index: number;
    toolName: string;
    providerKind: PipelineProviderKind;
    inputSize: number;
    outputSize: number;
    durationMs: number;
    success: boolean;
    error?: string;
    logRef: PipelineStepLogRef;
    /** Non-fatal hint surfaced to the agent (e.g. a stage that filtered a non-empty array to empty). */
    diagnostic?: string;
}

/** Outcome of executing a whole pipeline. */
export interface PipelineExecutionResult {
    success: boolean;
    /** The final stage's value — the ONLY thing returned to the LLM. Null when the pipeline failed. */
    finalOutput: PipeValue | null;
    steps: PipelineStepRecord[];
    /** Agent-facing error message when the pipeline failed (never includes a piped value). */
    error?: string;
    /** 0-based index of the failing top-level stage; `steps[failedStepIndex]` is its record. */
    failedStepIndex?: number;
    /** Sum of intermediate output byte sizes that never reached the LLM. */
    contextBytesSaved: number;
    /** Self-correction hint when the pipeline succeeded but a stage zeroed out a non-empty array. */
    diagnostic?: string;
}
