/** The consumer's receive-time guard dead-letters at ReceiveCount > MaxAttempts + RECEIVE_GUARD_MARGIN (03 §5.1). */
export const RECEIVE_GUARD_MARGIN = 2;
/** Queue redrive policy: maxReceiveCount = MaxAttempts + REDRIVE_MARGIN — a crash-loop backstop behind the guard. */
export const REDRIVE_MARGIN = 5;
