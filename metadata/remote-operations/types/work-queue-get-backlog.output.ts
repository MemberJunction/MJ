/** Output of `WorkQueue.GetBacklog` — the autoscaler metric for one subscription. */
export interface WorkQueueGetBacklogOutput {
    /** False when the subscription's transport cannot report a backlog (AWS — scale Lambda from the queue's own metrics). */
    supported: boolean;
    /** Pending deliveries that a worker could claim right now (partition rules applied). */
    claimable: number;
    /** Deliveries currently leased by a worker. */
    inFlight: number;
    /** claimable + inFlight — the value a scheduler should scale on. */
    total: number;
    /** True when either count hit its cap of 1000: the real backlog is at least this large. */
    capped: boolean;
}
