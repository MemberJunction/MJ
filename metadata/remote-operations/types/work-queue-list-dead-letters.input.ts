/** Input for `WorkQueue.ListDeadLetters`. */
export interface WorkQueueListDeadLettersInput {
    /** The subscription to read (case-insensitive). */
    subscriptionName: string;
    /** The nextCursor of a previous page. Omit for the first page. */
    cursor?: string;
    /** 1–500; default 50. */
    pageSize?: number;
}
