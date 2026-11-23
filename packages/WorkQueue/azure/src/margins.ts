/** The consumer's receive-time guard dead-letters at DeliveryCount > MaxAttempts + RECEIVE_GUARD_MARGIN. */
export const RECEIVE_GUARD_MARGIN = 2;
/** Subscription maxDeliveryCount = MaxAttempts + REDRIVE_MARGIN — a crash-loop backstop behind the guard. */
export const REDRIVE_MARGIN = 5;
