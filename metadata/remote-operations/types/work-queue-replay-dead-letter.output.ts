/** Output of `WorkQueue.ReplayDeadLetter`. */
export interface WorkQueueReplayDeadLetterOutput {
    /** False when the subscription's transport cannot replay a single dead letter. */
    supported: boolean;
    /** False when the delivery does not exist or is not dead-lettered. */
    replayed: boolean;
}
