/**
 * @fileoverview **Shared agent-run-step field helpers** — the single source of truth for how an
 * `MJ: AI Agent Run Steps` row is populated at start and at finalize.
 *
 * These are deliberately **pure field-population functions** (no save, no I/O, no instance state): the
 * caller owns entity creation (`GetEntityObject` + `NewRecord`) and its own persistence strategy
 * (`@memberjunction/ai-agents`'s `BaseAgent` fire-and-forgets a queued INSERT/UPDATE; other callers may
 * simply `await step.Save()`). What they share — and what lives here exactly once — is the **field
 * semantics**: which columns a started vs. a finalized step carries, the `Running → Completed/Failed`
 * transition, `StartedAt`/`CompletedAt`, the `TargetID` UUID guard, and the standard `OutputData` context
 * envelope (`success` / `durationMs` / `errorMessage`).
 *
 * Extracted so external producers of agent-run steps — e.g. `@memberjunction/computer-use-engine`, which
 * nests a child `Prompt` step per controller/judge prompt under a goal's parent step — reuse the same
 * shape instead of copy-pasting it out of `BaseAgent`.
 *
 * @module @memberjunction/ai-core-plus
 */

import { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';

/** The `StepType` union of `MJ: AI Agent Run Steps` (mirrors the generated entity). */
export type AgentRunStepType = MJAIAgentRunStepEntity['StepType'];

/** Matches a canonical UUID — `TargetID` is only stamped when the candidate is a real id. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Inputs for {@link initAgentRunStep} — the "started" field set of an agent run step. */
export interface InitAgentRunStepOptions {
    /** The owning `MJ: AI Agent Runs` id. */
    AgentRunID: string;
    /** Sequential step number within the run (1-based). */
    StepNumber: number;
    /** The kind of step (`Prompt`, `Tool`, `Sub-Agent`, …). */
    StepType: AgentRunStepType;
    /** Human-readable name (caller applies any hierarchy breadcrumb before passing it in). */
    StepName: string;
    /** Optional id of the targeted definition (AIPrompt.ID, AIAction.ID, AIAgent.ID, …). Stamped only when a valid UUID. */
    TargetID?: string | null;
    /** Optional id of the produced run-log (AIPromptRun.ID, ActionLog.ID, child AIAgentRun.ID, …). */
    TargetLogID?: string | null;
    /** Optional parent step id — set for child/iteration steps (loop bodies, goal sub-steps). */
    ParentID?: string | null;
    /** Optional pre-serialized input payload JSON. */
    InputData?: string | null;
    /** Optional pre-serialized start payload JSON. */
    PayloadAtStart?: string | null;
    /** Optional pre-serialized end payload JSON. */
    PayloadAtEnd?: string | null;
}

/**
 * Populates a **freshly created** (`GetEntityObject` + `NewRecord`) agent-run-step entity's "started"
 * fields. Pure — does not save, does not call `NewRecord` (the caller owns lifecycle). `TargetID` is only
 * stamped when it is a valid UUID (an invalid candidate is ignored, leaving the column null). Optional
 * payload/input fields are set only when provided, so the entity's `NewRecord` defaults are preserved
 * otherwise.
 *
 * @param step The new step entity to populate.
 * @param opts The started field values.
 */
export function initAgentRunStep(step: MJAIAgentRunStepEntity, opts: InitAgentRunStepOptions): void {
    step.AgentRunID = opts.AgentRunID;
    step.StepNumber = opts.StepNumber;
    step.StepType = opts.StepType;
    step.StepName = opts.StepName;
    if (opts.TargetID && UUID_REGEX.test(opts.TargetID)) {
        step.TargetID = opts.TargetID;
    }
    step.TargetLogID = opts.TargetLogID ?? null;
    step.ParentID = opts.ParentID ?? null;
    step.Status = 'Running';
    step.StartedAt = new Date();
    if (opts.InputData != null) {
        step.InputData = opts.InputData;
    }
    if (opts.PayloadAtStart != null) {
        step.PayloadAtStart = opts.PayloadAtStart;
    }
    if (opts.PayloadAtEnd != null) {
        step.PayloadAtEnd = opts.PayloadAtEnd;
    }
}

/** Inputs for {@link finalizeAgentRunStep} — the "completion" field set of an agent run step. */
export interface FinalizeAgentRunStepOptions {
    /** Whether the step succeeded — drives `Status` (`Completed`/`Failed`) and `Success`. */
    success: boolean;
    /** Optional failure detail (empty/undefined → `null`). */
    errorMessage?: string;
    /** Optional run-log id to stamp now (when not known at start — e.g. a prompt run id captured after execution). */
    targetLogID?: string | null;
    /** Optional output payload; wrapped in a standard `{ success, durationMs, errorMessage }` context envelope. */
    outputData?: Record<string, unknown> | null;
}

/**
 * Applies the completion state to an agent-run-step entity: `Status`, `CompletedAt`, `Success`,
 * `ErrorMessage`, an optional late `TargetLogID`, and (when `outputData` is supplied) an `OutputData`
 * envelope carrying `{ success, durationMs, errorMessage }` (duration measured from `StartedAt`). Pure —
 * the caller persists.
 *
 * @param step The step entity to finalize (must already have `StartedAt` set, i.e. been init'd).
 * @param opts The completion values.
 */
export function finalizeAgentRunStep(step: MJAIAgentRunStepEntity, opts: FinalizeAgentRunStepOptions): void {
    step.Status = opts.success ? 'Completed' : 'Failed';
    step.CompletedAt = new Date();
    step.Success = opts.success;
    step.ErrorMessage = opts.errorMessage || null;
    if (opts.targetLogID) {
        step.TargetLogID = opts.targetLogID;
    }
    if (opts.outputData) {
        step.OutputData = JSON.stringify({
            ...opts.outputData,
            context: {
                success: opts.success,
                durationMs: step.CompletedAt.getTime() - step.StartedAt.getTime(),
                errorMessage: opts.errorMessage,
            },
        });
    }
}
