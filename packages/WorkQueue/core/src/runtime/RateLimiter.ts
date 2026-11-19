import type { WorkJson, WorkMessage } from '../envelope';
import type { RateLimitConfig } from '../policy';

export type RateLimitDecision =
    | { Allowed: true }
    | { Allowed: false; RetryAfterMs: number };

const DEFAULT_RATE_LIMIT_KEY = '__default__';

/**
 * Extracts a rate-limiting grouping key from a message using `keyPath`.
 * Checks `Attributes[keyPath]` first, then traverses dot-separated `keyPath` in `Payload`,
 * falling back to `PartitionKey` and finally `'__default__'`.
 */
export function ExtractRateLimitKey(message: WorkMessage, keyPath?: string): string {
    if (keyPath !== undefined && keyPath.trim() !== '') {
        const trimmed = keyPath.trim();
        const attrValue = message.Attributes[trimmed];
        if (typeof attrValue === 'string' && attrValue.length > 0) {
            return attrValue;
        }
        const payloadValue = readPayloadPath(message.Payload, trimmed);
        if (payloadValue !== null) {
            return payloadValue;
        }
    }
    if (message.PartitionKey !== undefined && message.PartitionKey.length > 0) {
        return message.PartitionKey;
    }
    return DEFAULT_RATE_LIMIT_KEY;
}

function readPayloadPath(payload: WorkJson | undefined, path: string): string | null {
    if (payload === undefined || payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
    }
    let current: WorkJson = payload;
    for (const segment of path.split('.')) {
        if (current === null || typeof current !== 'object' || Array.isArray(current)) {
            return null;
        }
        if (!(segment in current)) {
            return null;
        }
        current = current[segment];
    }
    if (typeof current === 'string') {
        return current.length > 0 ? current : null;
    }
    if (typeof current === 'number' || typeof current === 'boolean') {
        return String(current);
    }
    return null;
}

/**
 * Per-key sliding-window rate limiter used by `ConsumerRuntime` to throttle deliveries
 * without dropping messages. Excess deliveries are deferred via `VisibleAt` / `DelaySeconds`.
 */
export class KeyedRateLimiter {
    private readonly windows = new Map<string, number[]>();

    constructor(private readonly config: RateLimitConfig) {}

    /** Attempts to acquire a slot for `key` at `nowMs`. */
    public TryAcquire(key: string, nowMs: number): RateLimitDecision {
        const windowStart = nowMs - this.config.WindowMs;
        const existing = this.windows.get(key) ?? [];
        const active = existing.filter((ts) => ts > windowStart);

        if (active.length >= this.config.MaxPerWindow) {
            this.windows.set(key, active);
            const oldest = active[0];
            const retryAfterMs = Math.max(1, oldest + this.config.WindowMs - nowMs);
            return { Allowed: false, RetryAfterMs: retryAfterMs };
        }

        active.push(nowMs);
        this.windows.set(key, active);
        return { Allowed: true };
    }

    /** Clears all tracked windows. */
    public Reset(): void {
        this.windows.clear();
    }
}
