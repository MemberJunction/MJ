/**
 * @fileoverview The stage contract — outcomes, failures, and the per-record context.
 *
 * Named after MemberJunction's Work Queue handler contract (`Signal`, `Log`, transient vs fatal errors) so a
 * future Record Set Processing → Work Queue bridge is a thin adapter rather than a change to any stage.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { AccessArtifact } from './access/BaseAccessDriver.js';

/** How a stage finished with one record. */
export type StageOutcomeStatus = 'Complete' | 'Failed' | 'Skipped' | 'Retry';

/** The result of running a stage on one record. Build these with {@link Outcome}. */
export class StageOutcome {
    public readonly Status: StageOutcomeStatus;
    /** Why, when the status is anything but `Complete`. Surfaces on the run's detail row. */
    public readonly Message: string | null;
    /** Whether a later attempt could succeed. */
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
    /** This will never succeed: malformed content, a permanent 404. */
    Fatal(message: string): StageOutcome {
        return new StageOutcome('Failed', message, false);
    },
    /** This might succeed later: a timeout, a rate limit, a cancellation. */
    Retry(message: string): StageOutcome {
        return new StageOutcome('Retry', message, true);
    },
} as const;

/** A failure that could succeed on a later attempt. */
export class TransientStageError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'TransientStageError';
    }
}

/** A failure that will never succeed. */
export class FatalStageError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'FatalStageError';
    }
}

/** What a stage is handed alongside the working record. */
export interface StageContext {
    ContextUser: UserInfo;
    /** The owning provider. Use it for all data access rather than `new Metadata()`. */
    Provider: IMetadataProvider;
    /** Configuration carried by the run (`Options` on the Record Process). */
    Configuration: Record<string, unknown>;
    /**
     * Whether this run is a test (`DryRun`). The processor withholds working-record commits, and
     * stages that perform direct side effects (durable-copy storage, tag/attribute row writes,
     * embedding model calls, vector store writes/deletes, and dependent-deletion marking) check
     * this flag to skip those external writes while still running read-only routing and validation.
     */
    IsTest: boolean;
    /**
     * Fires when the stage's time budget runs out. A stage doing long work checks it where stopping is
     * safe and returns {@link Outcome.Retry}.
     */
    Signal: AbortSignal;
    /** Report progress on long work; it lands on the record's live status row. */
    ReportProgress(message: string): void;
    Log: StageLogger;
    /**
     * The source's access artifact, acquired once per run through {@link BaseAccessDriver} and shared by
     * every stage. Null when the source needs none.
     */
    ResolveAccess(contentSourceID: string): Promise<AccessArtifact | null>;
}

/** The logging surface a stage is given. */
export interface StageLogger {
    Info(message: string, detail?: Record<string, unknown>): void;
    Warning(message: string, detail?: Record<string, unknown>): void;
    Error(message: string, detail?: Record<string, unknown>): void;
}
