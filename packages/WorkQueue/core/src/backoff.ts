import type { SubscriptionPolicy } from './policy';

/** Largest exponent applied, so 2^n never overflows before clamping. */
const MAX_EXPONENT = 30;

/**
 * Retry delay in seconds. A finite handler-supplied delay wins (rounded up, clamped to
 * [0, BackoffMaxSeconds]); otherwise full jitter: random(0, min(BackoffMax, BackoffBase × 2^(attempt−1))).
 */
export function ComputeBackoffSeconds(
    policy: SubscriptionPolicy,
    attempt: number,
    handlerDelaySeconds?: number,
    random: () => number = Math.random,
): number {
    const maxSeconds = Math.max(0, policy.BackoffMaxSeconds);
    if (handlerDelaySeconds !== undefined && Number.isFinite(handlerDelaySeconds)) {
        return clamp(Math.ceil(handlerDelaySeconds), 0, maxSeconds);
    }
    const exponent = Math.min(Math.max(0, Math.floor(attempt) - 1), MAX_EXPONENT);
    const ceiling = Math.min(maxSeconds, Math.max(0, policy.BackoffBaseSeconds) * Math.pow(2, exponent));
    return clamp(Math.round(clamp(random(), 0, 1) * ceiling), 0, ceiling);
}

/** Upper bound on the heartbeat interval, whatever the lease length (spec 03 §3.2, F3). */
export const HEARTBEAT_INTERVAL_MAX_SECONDS = 30;

/**
 * min(LeaseSeconds / 3, 30) seconds. The cadence is decoupled from lease length: a consumer guide lease of 15-20
 * minutes must not mean a cancel or a lost lease goes unnoticed for 5-7 minutes. Each extension still grants a
 * full LeaseSeconds.
 */
export function HeartbeatIntervalSeconds(policy: SubscriptionPolicy): number {
    return Math.min(Math.max(0, policy.LeaseSeconds) / 3, HEARTBEAT_INTERVAL_MAX_SECONDS);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
