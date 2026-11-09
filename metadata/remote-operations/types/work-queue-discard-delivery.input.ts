/** Input for `WorkQueue.DiscardDelivery`. */
export interface WorkQueueDiscardDeliveryInput {
    subscriptionName: string;
    /** A pending, dead-lettered or in-flight delivery. */
    deliveryID: string;
    /** Why the work is being dropped. Required; at most 1000 characters. */
    reason: string;
}
