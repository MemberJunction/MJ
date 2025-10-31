/**
 * Circuit breaker pattern implementation for vendor health management
 *
 * Implements the circuit breaker pattern to prevent cascading failures and allow
 * services time to recover. The circuit has three states:
 *
 * - **Closed**: Normal operation, requests pass through
 * - **Open**: Service is failing, requests are rejected immediately
 * - **Half-Open**: Testing if service has recovered
 *
 * State transitions:
 * - Closed → Open: After threshold consecutive failures
 * - Open → Half-Open: After cooldown period
 * - Half-Open → Closed: After threshold consecutive successes
 * - Half-Open → Open: On any failure during testing
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   cooldownMS: 60000,        // Stay open for 60s
 *   halfOpenTestMS: 120000,   // Test after 2min
 *   failureThreshold: 5,      // Open after 5 failures
 *   successThreshold: 3       // Close after 3 successes
 * });
 *
 * // Check if requests should be allowed
 * if (breaker.canAttempt()) {
 *   try {
 *     await makeRequest();
 *     breaker.recordSuccess();
 *   } catch (error) {
 *     breaker.recordFailure();
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
    /**
     * Current circuit state
     */
    private state: CircuitState = CircuitState.Closed;

    /**
     * Configuration options
     */
    private config: CircuitBreakerConfig;

    /**
     * Count of consecutive failures (resets on success)
     */
    private consecutiveFailures: number = 0;

    /**
     * Count of consecutive successes in Half-Open state
     */
    private consecutiveSuccesses: number = 0;

    /**
     * Timestamp when circuit was opened
     */
    private openedAt: number | null = null;

    /**
     * Timestamp when circuit entered Half-Open state
     */
    private halfOpenedAt: number | null = null;

    /**
     * Timer for automatic state transitions
     */
    private stateTransitionTimer: NodeJS.Timeout | null = null;

    /**
     * Event listeners for state changes
     */
    private listeners: Map<CircuitBreakerEvent, Array<(event: CircuitBreakerEventData) => void>> = new Map();

    /**
     * Creates a circuit breaker
     *
     * @param config - Circuit breaker configuration
     */
    constructor(config: CircuitBreakerConfig) {
        this.validateConfig(config);
        this.config = config;
    }

    /**
     * Check if a request attempt should be allowed
     *
     * @returns True if request can proceed
     */
    public canAttempt(): boolean {
        this.updateState();

        switch (this.state) {
            case CircuitState.Closed:
                return true;

            case CircuitState.Open:
                // Check if cooldown period has elapsed
                if (this.openedAt != null) {
                    const elapsed = Date.now() - this.openedAt;
                    if (elapsed >= this.config.cooldownMS) {
                        this.transitionToHalfOpen();
                        return true;
                    }
                }
                return false;

            case CircuitState.HalfOpen:
                // Allow one test request at a time in half-open state
                return true;

            default:
                return false;
        }
    }

    /**
     * Record a successful request
     */
    public recordSuccess(): void {
        this.consecutiveFailures = 0;

        switch (this.state) {
            case CircuitState.Closed:
                // Normal operation, do nothing
                break;

            case CircuitState.HalfOpen:
                this.consecutiveSuccesses++;
                if (this.consecutiveSuccesses >= this.config.successThreshold) {
                    this.transitionToClosed();
                }
                break;

            case CircuitState.Open:
                // Shouldn't happen, but if it does, transition to half-open
                this.transitionToHalfOpen();
                break;
        }
    }

    /**
     * Record a failed request
     */
    public recordFailure(): void {
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;

        switch (this.state) {
            case CircuitState.Closed:
                if (this.consecutiveFailures >= this.config.failureThreshold) {
                    this.transitionToOpen();
                }
                break;

            case CircuitState.HalfOpen:
                // Any failure in half-open state immediately opens circuit
                this.transitionToOpen();
                break;

            case CircuitState.Open:
                // Already open, update opened timestamp to extend cooldown
                this.openedAt = Date.now();
                break;
        }
    }

    /**
     * Get current circuit state
     *
     * @returns Current state
     */
    public getState(): CircuitState {
        this.updateState();
        return this.state;
    }

    /**
     * Get circuit statistics
     *
     * @returns Statistics about circuit state
     */
    public getStatistics(): CircuitBreakerStatistics {
        this.updateState();

        return {
            state: this.state,
            consecutiveFailures: this.consecutiveFailures,
            consecutiveSuccesses: this.consecutiveSuccesses,
            openedAt: this.openedAt,
            halfOpenedAt: this.halfOpenedAt,
            timeInCurrentState: this.getTimeInCurrentState(),
            config: { ...this.config }
        };
    }

    /**
     * Manually force circuit to open state
     *
     * Used for manual intervention or testing.
     */
    public forceOpen(): void {
        if (this.state !== CircuitState.Open) {
            this.transitionToOpen();
        }
    }

    /**
     * Manually force circuit to closed state
     *
     * Used for manual recovery or testing.
     */
    public forceClosed(): void {
        if (this.state !== CircuitState.Closed) {
            this.transitionToClosed();
        }
    }

    /**
     * Reset circuit to initial closed state
     *
     * Clears all counters and timers.
     */
    public reset(): void {
        this.clearTimer();
        this.state = CircuitState.Closed;
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.openedAt = null;
        this.halfOpenedAt = null;

        this.emitEvent('reset', {
            state: this.state,
            timestamp: Date.now()
        });
    }

    /**
     * Add event listener
     *
     * @param event - Event type to listen for
     * @param callback - Callback function
     */
    public on(event: CircuitBreakerEvent, callback: (data: CircuitBreakerEventData) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    /**
     * Remove event listener
     *
     * @param event - Event type
     * @param callback - Callback function to remove
     */
    public off(event: CircuitBreakerEvent, callback: (data: CircuitBreakerEventData) => void): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Clean up resources
     */
    public destroy(): void {
        this.clearTimer();
        this.listeners.clear();
    }

    /**
     * Transition to Open state
     *
     * @private
     */
    private transitionToOpen(): void {
        this.clearTimer();
        this.state = CircuitState.Open;
        this.openedAt = Date.now();
        this.consecutiveSuccesses = 0;
        this.halfOpenedAt = null;

        this.emitEvent('opened', {
            state: this.state,
            timestamp: this.openedAt,
            consecutiveFailures: this.consecutiveFailures
        });

        // Schedule transition to half-open
        if (this.config.halfOpenTestMS > this.config.cooldownMS) {
            const delay = this.config.halfOpenTestMS;
            this.stateTransitionTimer = setTimeout(() => {
                if (this.state === CircuitState.Open) {
                    this.transitionToHalfOpen();
                }
            }, delay);
        }
    }

    /**
     * Transition to Half-Open state
     *
     * @private
     */
    private transitionToHalfOpen(): void {
        this.clearTimer();
        this.state = CircuitState.HalfOpen;
        this.halfOpenedAt = Date.now();
        this.consecutiveSuccesses = 0;

        this.emitEvent('halfOpened', {
            state: this.state,
            timestamp: this.halfOpenedAt,
            timeSinceOpened: this.openedAt ? this.halfOpenedAt - this.openedAt : null
        });
    }

    /**
     * Transition to Closed state
     *
     * @private
     */
    private transitionToClosed(): void {
        this.clearTimer();
        const previousState = this.state;
        this.state = CircuitState.Closed;
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.openedAt = null;
        this.halfOpenedAt = null;

        this.emitEvent('closed', {
            state: this.state,
            timestamp: Date.now(),
            previousState,
            consecutiveSuccesses: this.consecutiveSuccesses
        });
    }

    /**
     * Update state based on elapsed time
     *
     * @private
     */
    private updateState(): void {
        if (this.state === CircuitState.Open && this.openedAt != null) {
            const elapsed = Date.now() - this.openedAt;
            if (elapsed >= this.config.halfOpenTestMS) {
                this.transitionToHalfOpen();
            }
        }
    }

    /**
     * Get time spent in current state
     *
     * @returns Milliseconds in current state
     * @private
     */
    private getTimeInCurrentState(): number {
        const now = Date.now();

        switch (this.state) {
            case CircuitState.Open:
                return this.openedAt != null ? now - this.openedAt : 0;

            case CircuitState.HalfOpen:
                return this.halfOpenedAt != null ? now - this.halfOpenedAt : 0;

            default:
                return 0;
        }
    }

    /**
     * Clear state transition timer
     *
     * @private
     */
    private clearTimer(): void {
        if (this.stateTransitionTimer != null) {
            clearTimeout(this.stateTransitionTimer);
            this.stateTransitionTimer = null;
        }
    }

    /**
     * Emit event to listeners
     *
     * @param event - Event type
     * @param data - Event data
     * @private
     */
    private emitEvent(event: CircuitBreakerEvent, data: CircuitBreakerEventData): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            for (const callback of callbacks) {
                try {
                    callback(data);
                } catch (error) {
                    // Swallow errors in event handlers to prevent cascade
                    console.error(`Error in circuit breaker event handler for ${event}:`, error);
                }
            }
        }
    }

    /**
     * Validate configuration
     *
     * @param config - Configuration to validate
     * @private
     */
    private validateConfig(config: CircuitBreakerConfig): void {
        if (config.cooldownMS <= 0) {
            throw new Error('cooldownMS must be positive');
        }
        if (config.halfOpenTestMS <= 0) {
            throw new Error('halfOpenTestMS must be positive');
        }
        if (config.halfOpenTestMS < config.cooldownMS) {
            throw new Error('halfOpenTestMS must be >= cooldownMS');
        }
        if (config.failureThreshold <= 0) {
            throw new Error('failureThreshold must be positive');
        }
        if (config.successThreshold <= 0) {
            throw new Error('successThreshold must be positive');
        }
    }
}

/**
 * Circuit breaker state
 */
export enum CircuitState {
    /**
     * Normal operation, requests pass through
     */
    Closed = 'Closed',

    /**
     * Service is failing, requests are rejected
     */
    Open = 'Open',

    /**
     * Testing if service has recovered
     */
    HalfOpen = 'HalfOpen'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    /**
     * Time to stay in Open state before testing (milliseconds)
     */
    cooldownMS: number;

    /**
     * Time before transitioning to Half-Open state (milliseconds)
     * Must be >= cooldownMS
     */
    halfOpenTestMS: number;

    /**
     * Number of consecutive failures before opening circuit
     */
    failureThreshold: number;

    /**
     * Number of consecutive successes in Half-Open before closing circuit
     */
    successThreshold: number;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStatistics {
    /**
     * Current state
     */
    state: CircuitState;

    /**
     * Consecutive failures (resets on success)
     */
    consecutiveFailures: number;

    /**
     * Consecutive successes in Half-Open state
     */
    consecutiveSuccesses: number;

    /**
     * Timestamp when opened (null if not open)
     */
    openedAt: number | null;

    /**
     * Timestamp when entered Half-Open (null if not half-open)
     */
    halfOpenedAt: number | null;

    /**
     * Time spent in current state (milliseconds)
     */
    timeInCurrentState: number;

    /**
     * Circuit configuration
     */
    config: CircuitBreakerConfig;
}

/**
 * Circuit breaker event types
 */
export type CircuitBreakerEvent = 'opened' | 'closed' | 'halfOpened' | 'reset';

/**
 * Circuit breaker event data
 */
export interface CircuitBreakerEventData {
    /**
     * State after event
     */
    state: CircuitState;

    /**
     * Event timestamp
     */
    timestamp: number;

    /**
     * Additional event-specific data
     */
    [key: string]: unknown;
}
