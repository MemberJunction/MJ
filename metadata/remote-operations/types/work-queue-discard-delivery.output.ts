/** Output of `WorkQueue.DiscardDelivery`. */
export interface WorkQueueDiscardDeliveryOutput {
    /** False when the transport cannot discard this kind of delivery (for example any SQS message). */
    supported: boolean;
    /** True when the delivery is now Discarded, or (for an in-flight delivery) its cancel was recorded. */
    discarded: boolean;
    /**
     * True when the delivery was in flight: CancelRequestedAt is set, the running handler's next heartbeat (30 s at
     * most) aborts it with reason 'Cancelled', and the row becomes Discarded when the handler acknowledges — or at
     * lease expiry if its worker is gone (03 §7).
     */
    cancelRequested: boolean;
}
