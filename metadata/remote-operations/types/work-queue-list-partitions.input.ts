/** Input for `WorkQueue.ListPartitions`. */
export interface WorkQueueListPartitionsInput {
    /** The subscription to read (case-insensitive). */
    subscriptionName: string;
    /** Only keys in this condition. Omit for every non-idle key. */
    condition?: 'Idle' | 'InFlight' | 'Blocked';
    /** The nextCursor of a previous page. Omit for the first page. */
    cursor?: string;
    /** 1–500; default 50. */
    pageSize?: number;
}
