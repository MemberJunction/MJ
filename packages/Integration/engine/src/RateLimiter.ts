/**
 * Adaptive, per-key token-bucket rate limiter (plan.md §7 — "peak-aware rate limiting").
 *
 * Each key (an IntegrationID) owns an independent token bucket that refills continuously
 * at an *effective* rate and caps at a burst capacity. `Acquire(key)` waits until at
 * least one token is available, then consumes it — letting the engine push a source to
 * its real limits while never exceeding them.
 *
 * The "adaptive" part is classic AIMD (Additive-Increase / Multiplicative-Decrease), the
 * same control law TCP congestion control uses:
 *   - `ReportThrottle(key, retryAfterMs?)` — the source signalled a 429 / rate-limit header.
 *     We MULTIPLICATIVELY cut the effective rate (×`ThrottleBackoffFactor`, default 0.5) and,
 *     if a Retry-After was given, FREEZE refills for that long so in-flight tokens drain.
 *   - `ReportSuccess(key)` — sustained success. We ADDITIVELY nudge the effective rate back up
 *     (+`SuccessRampPerCall`) but never past the configured ceiling (`TokensPerSec`). This finds
 *     the highest safe throughput and re-discovers it after the source recovers.
 *
 * Deterministic + testable: the clock (`now`) and the wait primitive (`sleep`) are injected
 * via constructor options. Production defaults to wall-clock + a real `setTimeout`; tests pass
 * fakes so NO real timers are involved and behaviour is fully reproducible.
 *
 * Pure: no DB, no network, no MJ metadata. The engine owns ONE instance and routes every
 * outbound source call through `Acquire` / `ReportThrottle` / `ReportSuccess`.
 */

/** Returns the current time in milliseconds (injectable for deterministic tests). */
export type NowFn = () => number;

/** Resolves after `ms` milliseconds (injectable for deterministic tests). */
export type SleepFn = (ms: number) => Promise<void>;

/** Construction options for {@link RateLimiter}. All fields optional; sensible defaults applied. */
export interface RateLimiterOptions {
    /**
     * Ceiling refill rate in tokens per second — the steady-state target a key ramps back
     * toward and never exceeds. Also the rate a fresh key starts at. Default: 10.
     */
    TokensPerSec?: number;
    /** Bucket capacity (max tokens that can accumulate) — the allowed burst size. Default: `TokensPerSec`. */
    Burst?: number;
    /**
     * Multiplicative-decrease factor applied to the effective rate on each throttle signal
     * (0 < f < 1). Default: 0.5 (halve the rate, like TCP).
     */
    ThrottleBackoffFactor?: number;
    /**
     * Additive-increase amount (tokens/sec) added to the effective rate on each success,
     * clamped to `TokensPerSec`. Default: `TokensPerSec / 10` (≈10 successes to fully recover).
     */
    SuccessRampPerCall?: number;
    /**
     * Floor the effective rate can be cut to by repeated throttles, so a key never fully stalls
     * (tokens/sec). Default: `TokensPerSec / 20`. Clamped to be > 0.
     */
    MinTokensPerSec?: number;
    /** Time source. Default: `Date.now`. */
    now?: NowFn;
    /** Wait primitive. Default: a real `setTimeout`-based sleep. */
    sleep?: SleepFn;
}

/** Read-only snapshot of a key's live limiter state — for tests, metrics, and debugging. */
export interface RateLimiterKeyState {
    /** Current available tokens (fractional). */
    Tokens: number;
    /** Current effective refill rate in tokens/sec (between `MinTokensPerSec` and `TokensPerSec`). */
    EffectiveTokensPerSec: number;
    /** Bucket capacity (burst). */
    Burst: number;
    /** Epoch ms until which refills are frozen by a Retry-After (0 = not frozen). */
    FrozenUntil: number;
}

/** Internal mutable per-key bucket. Not exported — callers see {@link RateLimiterKeyState}. */
interface Bucket {
    tokens: number;
    effectiveRate: number;
    lastRefillMs: number;
    frozenUntilMs: number;
}

const DEFAULT_TOKENS_PER_SEC = 10;
const DEFAULT_BACKOFF_FACTOR = 0.5;

/**
 * Adaptive per-key token-bucket rate limiter. See file header for the full design.
 * One instance per engine; keys are IntegrationIDs (or any stable string).
 */
export class RateLimiter {
    private readonly tokensPerSec: number;
    private readonly burst: number;
    private readonly throttleBackoffFactor: number;
    private readonly successRampPerCall: number;
    private readonly minTokensPerSec: number;
    private readonly nowFn: NowFn;
    private readonly sleepFn: SleepFn;
    private readonly buckets = new Map<string, Bucket>();

    constructor(options: RateLimiterOptions = {}) {
        this.tokensPerSec = positive(options.TokensPerSec, DEFAULT_TOKENS_PER_SEC);
        this.burst = positive(options.Burst, this.tokensPerSec);
        this.throttleBackoffFactor = clamp01Exclusive(options.ThrottleBackoffFactor, DEFAULT_BACKOFF_FACTOR);
        this.successRampPerCall = positive(options.SuccessRampPerCall, this.tokensPerSec / 10);
        this.minTokensPerSec = Math.min(positive(options.MinTokensPerSec, this.tokensPerSec / 20), this.tokensPerSec);
        this.nowFn = options.now ?? (() => Date.now());
        this.sleepFn = options.sleep ?? realSleep;
    }

    /**
     * Waits until a token is available for `key`, then consumes exactly one. Returns the
     * number of milliseconds spent waiting (0 if a token was immediately available) — useful
     * for the engine to surface "we are being held back" telemetry.
     */
    public async Acquire(key: string): Promise<number> {
        const startMs = this.nowFn();
        // Loop because the computed wait may land just before a refill tick (fractional rounding),
        // or a concurrent Acquire on the same key may have taken the token we were waiting for.
        for (;;) {
            const bucket = this.getBucket(key);
            this.refill(bucket);
            if (bucket.tokens >= 1) {
                bucket.tokens -= 1;
                return this.nowFn() - startMs;
            }
            await this.sleepFn(this.waitMsForToken(bucket));
        }
    }

    /**
     * Multiplicative decrease: the source threw a 429 / rate-limit signal for `key`. Cuts the
     * effective rate by `ThrottleBackoffFactor` (floored at `MinTokensPerSec`) and, when a
     * Retry-After is supplied, freezes refills for that long so the bucket drains.
     */
    public ReportThrottle(key: string, retryAfterMs?: number): void {
        const bucket = this.getBucket(key);
        this.refill(bucket);
        bucket.effectiveRate = Math.max(this.minTokensPerSec, bucket.effectiveRate * this.throttleBackoffFactor);
        if (retryAfterMs != null && retryAfterMs > 0) {
            bucket.frozenUntilMs = this.nowFn() + retryAfterMs;
            bucket.tokens = 0; // honour the source's "do not call until then"
        }
    }

    /**
     * Additive increase: a call for `key` succeeded. Nudges the effective rate up by
     * `SuccessRampPerCall`, never above the configured `TokensPerSec` ceiling (AIMD recovery).
     */
    public ReportSuccess(key: string): void {
        const bucket = this.getBucket(key);
        this.refill(bucket);
        bucket.effectiveRate = Math.min(this.tokensPerSec, bucket.effectiveRate + this.successRampPerCall);
    }

    /** Returns a read-only snapshot of `key`'s state (refilled to "now"). Creates the bucket if absent. */
    public GetState(key: string): RateLimiterKeyState {
        const bucket = this.getBucket(key);
        this.refill(bucket);
        return {
            Tokens: bucket.tokens,
            EffectiveTokensPerSec: bucket.effectiveRate,
            Burst: this.burst,
            FrozenUntil: bucket.frozenUntilMs,
        };
    }

    /** Drops all per-key state. Mainly for tests and engine teardown. */
    public Reset(): void {
        this.buckets.clear();
    }

    /** Lazily creates a bucket starting full (one burst of tokens) at the ceiling rate. */
    private getBucket(key: string): Bucket {
        let bucket = this.buckets.get(key);
        if (!bucket) {
            bucket = {
                tokens: this.burst,
                effectiveRate: this.tokensPerSec,
                lastRefillMs: this.nowFn(),
                frozenUntilMs: 0,
            };
            this.buckets.set(key, bucket);
        }
        return bucket;
    }

    /**
     * Advances `bucket` to the current time: adds `effectiveRate × elapsedSeconds` tokens
     * (capped at burst). While frozen by a Retry-After, no time accrues toward refill — the
     * freeze interval is excluded so the bucket genuinely pauses, then resumes from the freeze end.
     */
    private refill(bucket: Bucket): void {
        const nowMs = this.nowFn();
        if (nowMs <= bucket.lastRefillMs) {
            return;
        }
        const accrualStartMs = this.accrualStart(bucket, nowMs);
        if (nowMs > accrualStartMs) {
            const elapsedSec = (nowMs - accrualStartMs) / 1000;
            bucket.tokens = Math.min(this.burst, bucket.tokens + elapsedSec * bucket.effectiveRate);
        }
        bucket.lastRefillMs = nowMs;
    }

    /** Earliest time tokens may start accruing again, accounting for any active freeze window. */
    private accrualStart(bucket: Bucket, nowMs: number): number {
        if (bucket.frozenUntilMs > bucket.lastRefillMs) {
            // Some/all of the elapsed window was frozen; accrual only counts from the freeze end.
            return Math.min(bucket.frozenUntilMs, nowMs);
        }
        return bucket.lastRefillMs;
    }

    /** Milliseconds until the next whole token, given the current (post-refill) deficit and freeze. */
    private waitMsForToken(bucket: Bucket): number {
        const nowMs = this.nowFn();
        const freezeRemainingMs = Math.max(0, bucket.frozenUntilMs - nowMs);
        const deficit = 1 - bucket.tokens;
        const refillMs = deficit > 0 ? Math.ceil((deficit / bucket.effectiveRate) * 1000) : 0;
        return Math.max(1, freezeRemainingMs + refillMs);
    }
}

/** Real wall-clock sleep — the only impure primitive, isolated here and overridden in tests. */
function realSleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Returns `value` if it is a finite positive number, else `fallback`. */
function positive(value: number | undefined, fallback: number): number {
    return value != null && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Returns `value` if it is a finite number strictly within (0, 1), else `fallback`. */
function clamp01Exclusive(value: number | undefined, fallback: number): number {
    return value != null && Number.isFinite(value) && value > 0 && value < 1 ? value : fallback;
}
