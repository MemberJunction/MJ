/** Input for `WorkQueue.ReplayDeadLetter`. */
export interface WorkQueueReplayDeadLetterInput {
    subscriptionName: string;
    /** A DeliveryID from WorkQueue.ListDeadLetters. */
    deliveryID: string;
    /** Optional operator note stored with the resolution; at most 1000 characters. */
    note?: string;
}
