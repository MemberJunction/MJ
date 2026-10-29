/** Thrown by a handler to dead-letter immediately (equivalent to returning Outcome.DeadLetter). */
export class FatalWorkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FatalWorkError';
    }
}

/** Thrown by a handler to retry, optionally after a delay (equivalent to Outcome.Retry). */
export class TransientWorkError extends Error {
    public readonly RetryAfterSeconds?: number;

    constructor(message: string, retryAfterSeconds?: number) {
        super(message);
        this.name = 'TransientWorkError';
        this.RetryAfterSeconds = retryAfterSeconds;
    }
}

/** Configuration problems (unknown topic, unsupported policy on a transport, invalid filter). */
export class WorkQueueConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WorkQueueConfigurationError';
    }
}
