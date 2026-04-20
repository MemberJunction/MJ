/**
 * @fileoverview Rate limiting utility for MCP tool calls
 *
 * Implements token bucket style rate limiting with request queuing.
 * When limits are exceeded, requests are queued rather than immediately rejected.
 *
 * @module @memberjunction/ai-mcp-client/RateLimiter
 */

import { LogStatus } from '@memberjunction/core';
import type { RateLimitConfig, RateLimitState, QueuedRequest } from './types.js';

/**
 * Unique ID generator for queued requests
 */
let requestIdCounter = 0;
function generateRequestId(): string {
    return `req_${Date.now()}_${++requestIdCounter}`;
}

/**
 * RateLimiter manages request rates for MCP server connections.
 *
 * Features:
 * - Per-minute and per-hour limits
 * - Request queuing when limits exceeded
 * - Automatic queue processing when capacity available
 * - Configurable queue timeout
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({ perMinute: 60, perHour: 1000 });
 *
 * // Wait for rate limit to allow request
 * await limiter.acquire();
 *
 * // Make the request...
 * ```
 */
export class RateLimiter {
    /** Rate limit configuration */
    private readonly config: RateLimitConfig;

    /** Current rate limit state */
    private readonly state: RateLimitState;

    /** Queue of pending requests */
    private readonly queue: QueuedRequest[];

    /** Timer for processing queue */
    private queueTimer: ReturnType<typeof setInterval> | null = null;

    /** Default max wait time in queue (5 minutes) */
    private static readonly DEFAULT_MAX_WAIT_MS = 5 * 60 * 1000;

    /** Queue processing interval (1 second) */
    private static readonly QUEUE_PROCESS_INTERVAL = 1000;

    /**
     * Creates a new RateLimiter instance
     *
     * @param config - Rate limit configuration
     */
    constructor(config: RateLimitConfig) {
        this.config = { ...config };
        this.state = {
            minuteRequests: [],
            hourRequests: []
        };
        this.queue = [];
    }

    /**
     * Acquires a slot for making a request.
     * If rate limits are exceeded, the request is queued.
     *
     * @param maxWaitMs - Maximum time to wait in queue (default: 5 minutes)
     * @returns Promise that resolves when the request can proceed
     * @throws Error if request times out in queue
     */
    async acquire(maxWaitMs: number = RateLimiter.DEFAULT_MAX_WAIT_MS): Promise<void> {
        // Clean up old timestamps
        this.cleanupOldTimestamps();

        const { perMinute, perHour } = this.config;
        LogStatus(`[RateLimiter] acquire() - config: perMinute=${perMinute}, perHour=${perHour}, minuteRequests=${this.state.minuteRequests.length}, hourRequests=${this.state.hourRequests.length}`);

        // Check if we can proceed immediately
        if (this.canProceed()) {
            LogStatus(`[RateLimiter] acquire() - proceeding immediately`);
            this.recordRequest();
            return;
        }

        // Queue the request
        LogStatus(`[RateLimiter] acquire() - rate limit exceeded, queuing request`);
        return this.enqueueRequest(maxWaitMs);
    }

    /**
     * Checks if a request can proceed without hitting rate limits
     *
     * @returns true if request can proceed
     */
    canProceed(): boolean {
        this.cleanupOldTimestamps();

        const { perMinute, perHour } = this.config;

        // Check minute limit (0 or undefined means no limit)
        if (perMinute !== undefined && perMinute > 0 && this.state.minuteRequests.length >= perMinute) {
            return false;
        }

        // Check hour limit (0 or undefined means no limit)
        if (perHour !== undefined && perHour > 0 && this.state.hourRequests.length >= perHour) {
            return false;
        }

        return true;
    }

    /**
     * Gets the current rate limit status
     *
     * @returns Current usage and limits
     */
    getStatus(): {
        minuteUsage: number;
        minuteLimit: number | undefined;
        hourUsage: number;
        hourLimit: number | undefined;
        queueLength: number;
    } {
        this.cleanupOldTimestamps();

        return {
            minuteUsage: this.state.minuteRequests.length,
            minuteLimit: this.config.perMinute,
            hourUsage: this.state.hourRequests.length,
            hourLimit: this.config.perHour,
            queueLength: this.queue.length
        };
    }

    /**
     * Gets the estimated wait time in milliseconds
     *
     * @returns Estimated wait time, or 0 if no wait needed
     */
    getEstimatedWaitMs(): number {
        this.cleanupOldTimestamps();

        if (this.canProceed()) {
            return 0;
        }

        const now = Date.now();
        let waitMs = 0;

        // Check minute limit (0 or undefined means no limit)
        if (this.config.perMinute !== undefined && this.config.perMinute > 0 &&
            this.state.minuteRequests.length >= this.config.perMinute) {
            const oldestMinute = this.state.minuteRequests[0];
            if (oldestMinute !== undefined) {
                const minuteWait = (oldestMinute + 60000) - now;
                waitMs = Math.max(waitMs, minuteWait);
            }
        }

        // Check hour limit (0 or undefined means no limit)
        if (this.config.perHour !== undefined && this.config.perHour > 0 &&
            this.state.hourRequests.length >= this.config.perHour) {
            const oldestHour = this.state.hourRequests[0];
            if (oldestHour !== undefined) {
                const hourWait = (oldestHour + 3600000) - now;
                waitMs = Math.max(waitMs, hourWait);
            }
        }

        // Add queue wait time
        if (this.queue.length > 0) {
            // Rough estimate: each queued request takes about 1 second
            waitMs += this.queue.length * 1000;
        }

        return Math.max(0, waitMs);
    }

    /**
     * Clears all rate limit state and queue
     */
    reset(): void {
        this.state.minuteRequests = [];
        this.state.hourRequests = [];

        // Reject all queued requests
        while (this.queue.length > 0) {
            const request = this.queue.shift();
            if (request) {
                request.reject(new Error('Rate limiter reset'));
            }
        }

        this.stopQueueProcessor();
    }

    /**
     * Destroys the rate limiter and cleans up resources
     */
    destroy(): void {
        this.reset();
    }

    /**
     * Updates the rate limit configuration
     *
     * @param config - New configuration
     */
    updateConfig(config: Partial<RateLimitConfig>): void {
        if (config.perMinute !== undefined) {
            this.config.perMinute = config.perMinute;
        }
        if (config.perHour !== undefined) {
            this.config.perHour = config.perHour;
        }
    }

    /**
     * Records a request timestamp
     */
    private recordRequest(): void {
        const now = Date.now();
        this.state.minuteRequests.push(now);
        this.state.hourRequests.push(now);
    }

    /**
     * Cleans up timestamps outside the sliding window
     */
    private cleanupOldTimestamps(): void {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const oneHourAgo = now - 3600000;

        // Remove timestamps older than 1 minute
        while (this.state.minuteRequests.length > 0 &&
               this.state.minuteRequests[0] !== undefined &&
               this.state.minuteRequests[0] < oneMinuteAgo) {
            this.state.minuteRequests.shift();
        }

        // Remove timestamps older than 1 hour
        while (this.state.hourRequests.length > 0 &&
               this.state.hourRequests[0] !== undefined &&
               this.state.hourRequests[0] < oneHourAgo) {
            this.state.hourRequests.shift();
        }
    }

    /**
     * Enqueues a request to wait for rate limit capacity
     *
     * @param maxWaitMs - Maximum time to wait
     * @returns Promise that resolves when request can proceed
     */
    private enqueueRequest(maxWaitMs: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const request: QueuedRequest = {
                id: generateRequestId(),
                resolve: () => {
                    this.recordRequest();
                    resolve();
                },
                reject,
                queuedAt: new Date(),
                maxWaitMs
            };

            this.queue.push(request);
            this.startQueueProcessor();
        });
    }

    /**
     * Starts the queue processor if not already running
     */
    private startQueueProcessor(): void {
        if (this.queueTimer !== null) {
            return;
        }

        this.queueTimer = setInterval(() => {
            this.processQueue();
        }, RateLimiter.QUEUE_PROCESS_INTERVAL);
    }

    /**
     * Stops the queue processor
     */
    private stopQueueProcessor(): void {
        if (this.queueTimer !== null) {
            clearInterval(this.queueTimer);
            this.queueTimer = null;
        }
    }

    /**
     * Processes the request queue
     */
    private processQueue(): void {
        if (this.queue.length === 0) {
            this.stopQueueProcessor();
            return;
        }

        this.cleanupOldTimestamps();
        const now = Date.now();

        // Process expired requests first
        while (this.queue.length > 0) {
            const request = this.queue[0];
            if (!request) break;

            const waitTime = now - request.queuedAt.getTime();

            // Check if request has timed out
            if (waitTime >= request.maxWaitMs) {
                this.queue.shift();
                request.reject(new Error(`Rate limit queue timeout after ${waitTime}ms`));
                continue;
            }

            // Check if we can process the request
            if (this.canProceed()) {
                this.queue.shift();
                request.resolve();
            }

            // Only process one request per tick
            break;
        }

        // Stop processor if queue is empty
        if (this.queue.length === 0) {
            this.stopQueueProcessor();
        }
    }
}

/**
 * RateLimiterRegistry manages rate limiters for multiple connections
 */
export class RateLimiterRegistry {
    /** Map of connection ID to rate limiter */
    private readonly limiters: Map<string, RateLimiter> = new Map();

    /**
     * Gets or creates a rate limiter for a connection
     *
     * @param connectionId - Connection identifier
     * @param config - Rate limit configuration (used when creating new limiter)
     * @returns Rate limiter for the connection
     */
    getOrCreate(connectionId: string, config: RateLimitConfig): RateLimiter {
        let limiter = this.limiters.get(connectionId);

        if (!limiter) {
            limiter = new RateLimiter(config);
            this.limiters.set(connectionId, limiter);
        }

        return limiter;
    }

    /**
     * Gets an existing rate limiter for a connection
     *
     * @param connectionId - Connection identifier
     * @returns Rate limiter or undefined if not found
     */
    get(connectionId: string): RateLimiter | undefined {
        return this.limiters.get(connectionId);
    }

    /**
     * Updates the configuration for a connection's rate limiter
     *
     * @param connectionId - Connection identifier
     * @param config - New configuration
     */
    updateConfig(connectionId: string, config: Partial<RateLimitConfig>): void {
        const limiter = this.limiters.get(connectionId);
        if (limiter) {
            limiter.updateConfig(config);
        }
    }

    /**
     * Removes and destroys a rate limiter for a connection
     *
     * @param connectionId - Connection identifier
     */
    remove(connectionId: string): void {
        const limiter = this.limiters.get(connectionId);
        if (limiter) {
            limiter.destroy();
            this.limiters.delete(connectionId);
        }
    }

    /**
     * Clears all rate limiters
     */
    clear(): void {
        for (const limiter of this.limiters.values()) {
            limiter.destroy();
        }
        this.limiters.clear();
    }

    /**
     * Gets the number of active rate limiters
     */
    get size(): number {
        return this.limiters.size;
    }
}
