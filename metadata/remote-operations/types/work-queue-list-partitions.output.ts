/** One partition key's derived condition. */
export interface WorkQueuePartitionStateRow {
    PartitionKey: string;
    Condition: 'Idle' | 'InFlight' | 'Blocked';
    /** The head delivery: in flight, or dead-lettered when Blocked. */
    HeadDeliveryID: string | null;
    /** Deliveries waiting behind the head. */
    WaitingItems: number;
}

/** Output of `WorkQueue.ListPartitions`. */
export interface WorkQueueListPartitionsOutput {
    /** False when the subscription's transport cannot list partitions (AWS); items is then empty. */
    supported: boolean;
    items: WorkQueuePartitionStateRow[];
    nextCursor: string | null;
}
