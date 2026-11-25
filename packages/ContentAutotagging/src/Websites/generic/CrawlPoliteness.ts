/**
 * @fileoverview {@link CrawlPoliteness} — reading a site without tripping its rate limit.
 *
 * A site behind a CDN rate limit answers a burst with 429. Fetched once, every page of that burst is lost, and
 * with it every link those pages held. So, per host, for one crawl:
 * - a 429 (or a 503 that carries `Retry-After`) is retried, up to `MaxRetries` times, after the longer of the
 *   wait it asks for and an exponential backoff with jitter, capped at `MaxBackoffMs`;
 * - meanwhile the host is paused: every other fetch to it waits too, instead of meeting the limit alone;
 * - from then on the host is paced: its fetches start at least `LimitedIntervalMs` apart, doubling with each
 *   further limit (up to `MaxBackoffMs`), so parallel fetches take turns rather than resuming as the burst that
 *   tripped it.
 * A host that never limited the crawl is not slowed at all. A 503 without `Retry-After` is usually a block, not
 * a pause, so it is not retried here.
 *
 * @module @memberjunction/content-autotagging
 */

/** How the crawl backs off a host that rate-limits it. Every field is optional. */
export interface CrawlPolitenessOptions {
    /** How many times a rate-limited fetch is retried before the crawl moves on. Default 3. */
    MaxRetries?: number;
    /** The first backoff wait, in ms; it doubles with each retry (with jitter). Default 2000. */
    BackoffMs?: number;
    /** The longest any single wait or pacing interval may be, in ms. Default 60000. */
    MaxBackoffMs?: number;
    /** The pacing interval a host gets once it has rate-limited the crawl, in ms. Default 1000. */
    LimitedIntervalMs?: number;
}

/** Retries of a rate-limited fetch when the source sets none. */
export const DEFAULT_CRAWL_MAX_RETRIES = 3; // enough to ride out a typical CDN window without stalling a walk
/** First backoff wait when the source sets none, in ms. */
export const DEFAULT_CRAWL_BACKOFF_MS = 2_000; // 2s, doubled per retry: 2s, 4s, 8s
/** Cap on any one wait when the source sets none, in ms. */
export const DEFAULT_CRAWL_MAX_BACKOFF_MS = 60_000; // a minute; longer than that and the run's deadline is the better judge
/** Pacing interval for a limited host when the source sets none, in ms. */
export const DEFAULT_CRAWL_LIMITED_INTERVAL_MS = 1_000; // one request a second to a host that has limited us

/** Wait for `ms`, or less when the signal aborts. */
export type CrawlSleep = (ms: number, signal: AbortSignal) => Promise<void>;

/** The default {@link CrawlSleep}: a timer that the signal cuts short. */
export const AbortableSleep: CrawlSleep = (ms, signal) =>
    new Promise<void>((resolve) => {
        if (ms <= 0 || signal.aborted) {
            resolve();
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal.addEventListener('abort', onAbort, { once: true });
    });

/** The wait a `Retry-After` header asks for, in ms (seconds or an HTTP date), or undefined when absent or unreadable. */
export function RetryAfterMs(header: string | null | undefined, now: number = Date.now()): number | undefined {
    const value = header?.trim();
    if (!value) {
        return undefined;
    }
    if (/^\d+(\.\d+)?$/.test(value)) {
        return Number(value) * 1000;
    }
    const date = Date.parse(value);
    return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** Whether a response is the host asking the crawl to slow down, and how long it asked to wait. */
export function RateLimitOf(status: number, headers: Readonly<Record<string, string>> | undefined): { Limited: boolean; RetryAfterMs?: number } {
    const retryAfter = RetryAfterMs(headers?.['retry-after']);
    return { Limited: status === 429 || (status === 503 && retryAfter !== undefined), RetryAfterMs: retryAfter };
}

/** Per-host pauses and pacing for one crawl. */
export class CrawlPoliteness {
    private readonly pausedUntil = new Map<string, number>();
    private readonly nextStart = new Map<string, number>();
    private readonly interval = new Map<string, number>();

    constructor(
        private readonly options: CrawlPolitenessOptions = {},
        private readonly sleep: CrawlSleep = AbortableSleep,
        private readonly now: () => number = Date.now,
        private readonly random: () => number = Math.random,
    ) {}

    /** How many retries a limited fetch gets. */
    public get MaxRetries(): number {
        return this.nonNegative(this.options.MaxRetries, DEFAULT_CRAWL_MAX_RETRIES);
    }

    /** Whether this host has limited the crawl (and so is paced). */
    public IsPaced(host: string): boolean {
        return this.nextStart.has(host);
    }

    /**
     * Wait until a fetch to `host` may start: past the host's pause, then (for a paced host) its turn. Taking a
     * turn has no await between the check and the write, so two parallel fetches never take the same one.
     */
    public async WaitTurn(host: string, signal: AbortSignal): Promise<void> {
        while (!signal.aborted) {
            const now = this.now();
            const paused = (this.pausedUntil.get(host) ?? 0) - now;
            const next = this.nextStart.get(host);
            if (paused <= 0 && (next === undefined || next <= now)) {
                if (next !== undefined) {
                    this.nextStart.set(host, now + (this.interval.get(host) ?? this.limitedInterval()));
                }
                return;
            }
            await this.sleep(Math.max(paused, (next ?? 0) - now), signal);
        }
    }

    /**
     * The host limited a fetch (its `attempt`th, from 0): pause it for the longer of what it asked and the
     * backoff, and pace it from now on, more slowly with each limit. Returns the pause chosen, in ms.
     */
    public OnLimited(host: string, retryAfterMs: number | undefined, attempt: number): number {
        const cap = this.maxBackoff();
        // Never sooner than the backoff, even when Retry-After says 0: the burst is what got the crawl limited.
        const wait = Math.min(cap, Math.max(retryAfterMs ?? 0, this.backoff(attempt)));
        this.pausedUntil.set(host, Math.max(this.pausedUntil.get(host) ?? 0, this.now() + wait));
        const previous = this.interval.get(host);
        this.interval.set(host, previous === undefined ? this.limitedInterval() : Math.min(cap, previous * 2));
        if (!this.nextStart.has(host)) {
            this.nextStart.set(host, 0);
        }
        return wait;
    }

    /** 1x, 2x, 4x… the base wait, each scaled by 0.5–1.5 so parallel fetches do not retry in step. */
    private backoff(attempt: number): number {
        return this.nonNegative(this.options.BackoffMs, DEFAULT_CRAWL_BACKOFF_MS) * 2 ** attempt * (0.5 + this.random());
    }

    private maxBackoff(): number {
        return this.nonNegative(this.options.MaxBackoffMs, DEFAULT_CRAWL_MAX_BACKOFF_MS);
    }

    private limitedInterval(): number {
        return this.nonNegative(this.options.LimitedIntervalMs, DEFAULT_CRAWL_LIMITED_INTERVAL_MS);
    }

    private nonNegative(value: number | undefined, fallback: number): number {
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
    }
}
