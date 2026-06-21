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

import { EntitySaveOptions, LogError } from '@memberjunction/core';
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
    /**
     * Optional completion timestamp. Capture it at the moment the step actually finished and pass it in,
     * so that re-applying this finalize later (e.g. the queue re-asserts it AFTER the INSERT lands) yields
     * the SAME `CompletedAt`/`durationMs` rather than drifting to "now". Defaults to `new Date()`.
     */
    completedAt?: Date;
}

/**
 * Applies the completion state to an agent-run-step entity: `Status`, `CompletedAt`, `Success`,
 * `ErrorMessage`, an optional late `TargetLogID`, and (when `outputData` is supplied) an `OutputData`
 * envelope carrying `{ success, durationMs, errorMessage }` (duration measured from `StartedAt`). Pure —
 * the caller persists. Idempotent: re-applying with the same `opts` (capture `completedAt`) is a no-op.
 *
 * @param step The step entity to finalize (must already have `StartedAt` set, i.e. been init'd).
 * @param opts The completion values.
 */
export function finalizeAgentRunStep(step: MJAIAgentRunStepEntity, opts: FinalizeAgentRunStepOptions): void {
    const completedAt = opts.completedAt ?? new Date();
    step.Status = opts.success ? 'Completed' : 'Failed';
    step.CompletedAt = completedAt;
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
                durationMs: completedAt.getTime() - step.StartedAt.getTime(),
                errorMessage: opts.errorMessage,
            },
        });
    }
}

/** Diagnostics returned by {@link AgentRunStepSaveQueue.Flush}. */
export interface AgentRunStepFlushResult {
    /** Saves that rejected (threw) OR resolved `false`. */
    failures: number;
    /** Saves that rejected (threw). */
    rejections: number;
}

/**
 * **Fire-and-forget save orchestration** for agent-run steps — the single source of truth for the
 * non-blocking persistence pattern (the machinery `BaseAgent` previously inlined). Keeps step writes OFF
 * the hot loop so a run that creates many steps (e.g. a goal-driven Computer Use loop with one prompt step
 * per iteration) never pays N synchronous DB round-trips on its critical path — which matters on slower
 * databases.
 *
 * - {@link Insert} fires a step's "started" INSERT **without awaiting**, tracking it so a later
 *   {@link QueueUpdate} chains *after* it (an UPDATE must never race ahead of its own INSERT).
 * - {@link QueueUpdate} chains a **force-persisted** UPDATE (`IgnoreDirtyState`) after the step's INSERT
 *   (and any prior queued UPDATE). Forcing is required because a finalize mutation applied while the INSERT
 *   is still in flight gets absorbed by the INSERT's post-save dirty-reset, leaving the new values only in
 *   memory (the "step stuck at Running / null TargetLogID" bug).
 * - {@link Flush} awaits every queued save (`allSettled`, so one failure doesn't shadow the rest), drains
 *   the queue (so a reused instance doesn't leak settled promises), and reports failure counts. Call it at
 *   run / goal finalize.
 *
 * Failures are logged, never thrown — persistence is observability and must not break the run.
 */
export class AgentRunStepSaveQueue {
    /** INSERT promise per step instance (stable key); a queued UPDATE chains after it. */
    private insertPromises = new WeakMap<MJAIAgentRunStepEntity, Promise<boolean>>();
    /** Latest queued UPDATE promise per step instance, so successive updates to the SAME step serialize. */
    private updatePromises = new Map<MJAIAgentRunStepEntity, Promise<boolean>>();
    /** Every save (insert + updates) for {@link Flush} to await; updates to DIFFERENT steps run concurrently. */
    private pending: Promise<boolean>[] = [];

    /**
     * Fires a step's "started" INSERT without awaiting (the caller continues immediately). The step's PK
     * must already be client-generated (`NewRecord`) so its id is valid before the INSERT lands.
     *
     * @param step The newly-initialized step entity to persist.
     */
    public Insert(step: MJAIAgentRunStepEntity): void {
        const insertPromise = this.save(step, 'insert');
        this.insertPromises.set(step, insertPromise);
        this.pending.push(insertPromise);
    }

    /**
     * Queues a fire-and-forget force-persisted UPDATE of a step, chained after the step's INSERT (and any
     * prior queued UPDATE) so it never races the INSERT.
     *
     * **Pass `applyMutation` for any field change made after the INSERT was fired.** It runs INSIDE the
     * post-insert continuation — i.e. AFTER the INSERT (and its `BaseEntity.finalizeSave` post-save reload,
     * which does `init()` + `SetMany(insertedRow)`) has landed. Mutating the shared entity BEFORE the INSERT
     * resolves is unsafe: the reload reverts the early mutation, and the force-persisted UPDATE then writes
     * the stale (pre-mutation) values — the "step stuck at Running / null TargetLogID" race. Applying the
     * mutation here guarantees it survives. (Mirrors `ActionEngine.finalizeActionLog`.)
     *
     * Calling with no `applyMutation` (fields already mutated and guaranteed not racing an in-flight INSERT)
     * stays valid for backward compatibility.
     *
     * @param step The step entity.
     * @param applyMutation Optional mutation applied post-INSERT, immediately before the UPDATE save.
     */
    public QueueUpdate(step: MJAIAgentRunStepEntity, applyMutation?: (step: MJAIAgentRunStepEntity) => void): void {
        const previous = this.updatePromises.get(step) ?? this.insertPromises.get(step) ?? Promise.resolve(true);
        const current = previous.then(() => {
            if (applyMutation) {
                try {
                    applyMutation(step);
                } catch (err) {
                    LogError(`applyMutation threw before agent run step update ${step.ID || '(unsaved)'}: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
            return this.save(step, 'update');
        });
        this.updatePromises.set(step, current);
        this.pending.push(current);
    }

    /**
     * Awaits every queued save (success OR failure), drains the queue, and returns failure diagnostics.
     *
     * @returns The count of failed/rejected saves.
     */
    public async Flush(): Promise<AgentRunStepFlushResult> {
        const pending = this.pending;
        this.pending = [];
        this.updatePromises.clear();
        if (pending.length === 0) {
            return { failures: 0, rejections: 0 };
        }
        const settled = await Promise.allSettled(pending);
        let rejections = 0;
        let falses = 0;
        for (const result of settled) {
            if (result.status === 'rejected') {
                rejections++;
                LogError(`Pending step save rejected: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
            } else if (result.value === false) {
                falses++;
            }
        }
        return { failures: rejections + falses, rejections };
    }

    /** Saves one step: normal INSERT, or a force-persisted (`IgnoreDirtyState`) UPDATE. Logs, never throws. */
    private async save(step: MJAIAgentRunStepEntity, phase: 'insert' | 'update'): Promise<boolean> {
        try {
            let options: EntitySaveOptions | undefined;
            if (phase === 'update') {
                options = new EntitySaveOptions();
                options.IgnoreDirtyState = true;
            }
            const ok = await step.Save(options);
            if (!ok) {
                LogError(`Failed to ${phase} agent run step record ${step.ID || '(unsaved)'}: ${step.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            return ok;
        } catch (err) {
            LogError(`Error on ${phase} of agent run step record ${step.ID || '(unsaved)'}: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }
}
