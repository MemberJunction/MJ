/** The consumer's receive-time guard dead-letters at DeliveryAttempt > MaxAttempts + RECEIVE_GUARD_MARGIN. */
export const RECEIVE_GUARD_MARGIN = 2;
/** Subscription dead-letter policy maxDeliveryAttempts = MaxAttempts + REDRIVE_MARGIN — a crash-loop backstop behind the guard. */
export const REDRIVE_MARGIN = 5;
