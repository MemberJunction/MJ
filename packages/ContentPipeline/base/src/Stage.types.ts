/**
 * @fileoverview The stage contract — outcomes, failures, and the per-record context.
 *
 * These types are deliberately shaped as a structural superset of MemberJunction's Work Queue
 * handler contract (`WorkContext` / `WorkOutcome` / `TransientWorkError` / `FatalWorkError` in
 * `@memberjunction/work-queue-core`). The queue packages are not on `next`, so nothing here imports
 * them; the mapping is 1:1 and documented in this package's README, so the Record-Set-Processing →
 * Work Queue bridge, whenever it is written, is a thin adapter rather than a change to any stage.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { UserInfo, IMetadataProvider } from '@memberjunction/core';

/** How a stage finished with one record. */
export type StageOutcomeStatus = 'Complete' | 'Failed' | 'Skipped' | 'Retry';

/**
 * The result of running a stage on one record.
 *
 * Construct these through the {@link Outcome} helpers rather than by hand, so the status and the
 * retry semantics cannot drift apart.
 */
export class StageOutcome {
    /** How the stage finished. */
    public readonly Status: StageOutcomeStatus;

    /** Why, when the status is anything but `Complete`. Surfaces on the run's detail row. */
    public readonly Message: string | null;

    /**
     * Whether this failure can succeed on a later attempt.
     *
     * Only meaningful for `Failed` and `Retry`. A fatal failure is never retried; a transient one
     * is retried with backoff in queue scope, and not at all in filter scope, which does not retry.
     */
    public readonly IsTransient: boolean;

    constructor(status: StageOutcomeStatus, message: string | null = null, isTransient = false) {
        this.Status = status;
        this.Message = message;
        this.IsTransient = isTransient;
    }
}

/** Builders for the outcomes a stage returns. */
export const Outcome = {
    /** The stage did its work. */
    Complete(message: string | null = null): StageOutcome {
        return new StageOutcome('Complete', message);
    },
    /** The stage declined this record for a genuine reason — not a failure. */
    Skipped(message: string): StageOutcome {
        return new StageOutcome('Skipped', message);
    },
    /** This will never succeed: malformed content, a permanent 404, a validation failure. */
    Fatal(message: string): StageOutcome {
        return new StageOutcome('Failed', message, false);
    },
    /** This might succeed later: a timeout, a rate limit, a database blip. */
    Retry(message: string): StageOutcome {
        return new StageOutcome('Retry', message, true);
    },
} as const;

/**
 * A failure a stage believes could succeed on a later attempt.
 *
 * Maps to the queue's `TransientWorkError`. In queue scope this is retried with backoff up to the
 * subscription's maximum attempts; in filter scope it is final, because filter scope does not retry.
 */
export class TransientStageError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'TransientStageError';
    }
}

/**
 * A failure that will never succeed. Maps to the queue's `FatalWorkError`. Never retried; the
 * record's status field for this stage is committed `Failed` and the queue dead-letters it.
 */
export class FatalStageError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'FatalStageError';
    }
}

/** Where a stage's records came from, which is what decides retry semantics. */
export type StageScope = 'Filter' | 'Queue';

/**
 * What a stage is handed alongside the working record.
 *
 * Every member that has a Work Queue counterpart carries the same name and meaning, so a stage
 * written against this context behaves identically once the queue supplies the real values. Under
 * Record Set Processing the queue-shaped members take their degenerate values — `Attempt` and
 * `MaxAttempts` are 1, `IsReplay` is false, and `Signal` fires at page boundaries rather than in
 * flight, because Record Set Processing's cancel handshake is per-checkpoint.
 */
export interface StageContext {
    /** The acting user. */
    ContextUser: UserInfo;

    /**
     * The owning provider. Use this for all data access rather than `new Metadata()`, per MJ's
     * multi-provider rule.
     */
    Provider: IMetadataProvider;

    /** Configuration carried by the source or the run. */
    Configuration: Record<string, unknown>;

    /**
     * Whether this run is a test.
     *
     * A stage's logic never branches on whether its output will be committed — that is the
     * processor's business. What a stage legitimately does with this is record something a live run
     * would never want at full volume: the actual extracted text, a full structural-detection
     * breakdown.
     */
    IsTest: boolean;

    /** Where this run's records came from. `Filter` never retries. */
    Scope: StageScope;

    /** Which attempt this is, 1-based. Always 1 in filter scope. */
    Attempt: number;

    /** The most attempts this record gets. Always 1 in filter scope. */
    MaxAttempts: number;

    /** True when the queue is re-delivering a record. Always false in filter scope. */
    IsReplay: boolean;

    /**
     * Fires when an operator asks the run to stop.
     *
     * A stage whose work on one record can run long checks this at points where stopping is safe
     * and returns {@link Outcome.Retry} rather than throwing. A stage that never checks it runs to
     * completion — cancellation cannot stop work the code does not pause for.
     */
    Signal: AbortSignal;

    /**
     * Report progress on long work. Free to call as often as a stage likes; this is how a
     * long-running record becomes visible while it is still running.
     */
    ReportProgress(message: string): void;

    /** Structured logging bound to this record's run. */
    Log: StageLogger;

}

/** The logging surface a stage is given. Mirrors the queue's `WorkContext.Log`. */
export interface StageLogger {
    Info(message: string, detail?: Record<string, unknown>): void;
    Warning(message: string, detail?: Record<string, unknown>): void;
    Error(message: string, detail?: Record<string, unknown>): void;
}

/** True on the final attempt, which is what decides whether a transient failure is final. */
export function IsFinalAttempt(context: StageContext): boolean {
    return context.Scope === 'Filter' || context.Attempt >= context.MaxAttempts;
}
