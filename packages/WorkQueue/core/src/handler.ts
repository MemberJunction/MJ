import type { WorkJson, WorkMessage } from './envelope';

export interface WorkProgress {
    /** 0..100 */
    Percent?: number;
    /** ≤ 500 chars */
    Message?: string;
    /** Small; persisted by the Database transport only. */
    Checkpoint?: WorkJson;
}

export interface WorkLogger {
    Info(message: string, data?: Record<string, WorkJson>): void;
    Warn(message: string, data?: Record<string, WorkJson>): void;
    Error(message: string, error?: Error, data?: Record<string, WorkJson>): void;
}

/** Why a handler was asked to stop; the value of `WorkContext.Signal.reason` once aborted. */
export type WorkAbortReason = 'Cancelled' | 'LeaseLost' | 'MaxProcessingSeconds' | 'Shutdown';

export interface WorkContext {
    readonly SubscriptionName: string;
    /** Database: WorkQueueDelivery.ID; SQS: SQS MessageId */
    readonly DeliveryID: string;
    /** 1-based */
    readonly Attempt: number;
    readonly MaxAttempts: number;
    readonly IsReplay: boolean;
    /** Aborted with a `WorkAbortReason` when an operator cancels, the lease is lost, the cap is hit, or the host stops. */
    readonly Signal: AbortSignal;
    /**
     * Renews the lease and records progress. Resolves false once the lease is lost or the delivery is cancelled
     * (spec 03 §7); the handler must stop. A transient transport failure does not resolve false: it is retried on
     * the next tick while the lease horizon has not passed.
     */
    Heartbeat(progress?: WorkProgress): Promise<boolean>;
    readonly Log: WorkLogger;
}

export type WorkOutcome =
    | { Kind: 'Complete' }
    | { Kind: 'Retry'; DelaySeconds?: number; Reason?: string }
    | { Kind: 'DeadLetter'; Reason: string };

export const Outcome = {
    Complete(): WorkOutcome {
        return { Kind: 'Complete' };
    },
    Retry(reason?: string, delaySeconds?: number): WorkOutcome {
        const outcome: { Kind: 'Retry'; DelaySeconds?: number; Reason?: string } = { Kind: 'Retry' };
        if (reason !== undefined) {
            outcome.Reason = reason;
        }
        if (delaySeconds !== undefined) {
            outcome.DelaySeconds = delaySeconds;
        }
        return outcome;
    },
    DeadLetter(reason: string): WorkOutcome {
        return { Kind: 'DeadLetter', Reason: reason };
    },
};

/** Core handler interface — external (e.g. Lambda) handlers implement this directly. */
export interface WorkHandler<TPayload extends WorkJson = WorkJson> {
    Handle(message: WorkMessage<TPayload>, context: WorkContext): Promise<WorkOutcome>;
}

/** Logger that discards everything; the default where no logger is supplied. */
export const NULL_WORK_LOGGER: WorkLogger = {
    Info: () => undefined,
    Warn: () => undefined,
    Error: () => undefined,
};
