/** The consumer's receive-time guard dead-letters at DeliveryCount > MaxAttempts + RECEIVE_GUARD_MARGIN (03 §5.1). */
export const RECEIVE_GUARD_MARGIN = 2;
/** Subscription MaxDeliveryCount = MaxAttempts + MAX_DELIVERY_MARGIN — the crash-loop backstop behind the guard. */
export const MAX_DELIVERY_MARGIN = 5;
/** Service Bus caps a lock at five minutes; LeaseSeconds above it cannot be honoured (09a, C3). */
export const SERVICE_BUS_MAX_LOCK_SECONDS = 300;
