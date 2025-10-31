import { CircuitBreaker, CircuitState, CircuitBreakerConfig } from './CircuitBreaker';
import { AIErrorInfo, AIErrorType } from '@memberjunction/ai';
import { LogError, LogStatus } from '@memberjunction/core';

/**
 * Tracks vendor health with error-specific recovery strategies
 *
 * Manages health states for AI vendors with sophisticated error analysis and
 * recovery strategies. Different error types trigger different recovery mechanisms:
 *
 * - **Network errors**: Health checks with ping and test requests
 * - **Service errors (500/503)**: Circuit breaker pattern
 * - **Rate limits**: Temporary state, not considered unhealthy
 * - **Authentication errors**: Manual intervention required
 *
 * All state is in-memory and resets on server restart.
 *
 * @example
 * ```typescript
 * const tracker = new VendorHealthTracker();
 * await tracker.initialize();
 *
 * // Record an error
 * const strategy = await tracker.recordError(vendorId, apiKeyId, errorInfo);
 *
 * // Check health before making request
 * if (tracker.isHealthy(vendorId)) {
 *   // Proceed with request
 * }
 *
 * // Record success
 * tracker.recordSuccess(vendorId, apiKeyId);
 * ```
 */
export class VendorHealthTracker {
    /**
     * In-memory health state for each vendor
     */
    private healthState: Map<string, VendorHealthInfo> = new Map();

    /**
     * Circuit breakers for each vendor
     */
    private circuitBreakers: Map<string, CircuitBreaker> = new Map();

    /**
     * Timers for scheduled health checks
     */
    private healthCheckTimers: Map<string, NodeJS.Timeout> = new Map();

    /**
     * Whether tracker has been initialized
     */
    private initialized: boolean = false;

    /**
     * Initialize the health tracker
     *
     * Called during server startup to prepare the tracker for use.
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        LogStatus('Initializing VendorHealthTracker...');

        this.healthState.clear();
        this.circuitBreakers.clear();
        this.clearAllHealthCheckTimers();

        this.initialized = true;
        LogStatus('VendorHealthTracker initialized');
    }

    /**
     * Record an error and determine recovery strategy
     *
     * Analyzes the error type and updates vendor health state accordingly.
     * Different error types trigger different recovery strategies.
     *
     * @param vendorId - Vendor that experienced the error
     * @param apiKeyId - API key that was used (if applicable)
     * @param errorInfo - Analyzed error information
     * @returns Recovery strategy to use
     */
    public async recordError(
        vendorId: string,
        apiKeyId: string | undefined,
        errorInfo: AIErrorInfo
    ): Promise<ErrorRecoveryStrategy> {

        const strategy = this.determineRecoveryStrategy(errorInfo);
        const health = this.getOrCreateHealthInfo(vendorId);

        // Update failure tracking
        health.consecutiveFailures++;
        health.consecutiveSuccesses = 0;
        health.lastFailedRequest = new Date();
        health.lastError = errorInfo;

        // Apply strategy-specific logic
        switch (strategy) {
            case ErrorRecoveryStrategy.HealthCheckRequired:
                this.updateStatus(vendorId, VendorHealthStatus.NetworkUnreachable);
                await this.scheduleHealthCheck(vendorId, {
                    cooldownMS: 30000,      // Wait 30s before first check
                    retryInterval: 60000,   // Check every 60s after that
                    maxAttempts: 10         // Give up after 10 attempts (10 minutes)
                });
                break;

            case ErrorRecoveryStrategy.CircuitBreaker:
                this.updateStatus(vendorId, VendorHealthStatus.ServiceError);
                this.openCircuit(vendorId, {
                    cooldownMS: 60000,          // Disable for 60s
                    halfOpenTestMS: 120000,     // Try one request after 2min
                    failureThreshold: 5,        // Open after 5 consecutive failures
                    successThreshold: 3         // Close after 3 consecutive successes
                });
                break;

            case ErrorRecoveryStrategy.ManualIntervention:
                this.updateStatus(vendorId, VendorHealthStatus.AuthenticationFailed);
                LogError(`Vendor ${vendorId} requires manual intervention: ${errorInfo.errorType}`);
                // TODO: Integrate with notification system
                break;

            case ErrorRecoveryStrategy.ImmediateRetry:
                if (errorInfo.errorType === 'RateLimit') {
                    this.updateStatus(vendorId, VendorHealthStatus.RateLimited);
                }
                // Don't disable vendor, rate limiter will handle backoff
                break;

            case ErrorRecoveryStrategy.BackoffRetry:
                this.updateStatus(vendorId, VendorHealthStatus.Degraded);
                break;
        }

        return strategy;
    }

    /**
     * Record a successful request
     *
     * Updates health state and potentially closes circuit breakers.
     *
     * @param vendorId - Vendor that completed successfully
     * @param apiKeyId - API key that was used (if applicable)
     */
    public recordSuccess(vendorId: string, apiKeyId: string | undefined): void {
        const health = this.getOrCreateHealthInfo(vendorId);

        health.consecutiveSuccesses++;
        health.consecutiveFailures = 0;
        health.lastSuccessfulRequest = new Date();

        // Check circuit breaker state
        const circuit = this.circuitBreakers.get(vendorId);
        if (circuit) {
            circuit.recordSuccess();

            // If circuit closed, mark vendor as healthy
            if (circuit.getState() === CircuitState.Closed) {
                this.updateStatus(vendorId, VendorHealthStatus.Healthy);
            }
        } else if (health.status !== VendorHealthStatus.Healthy) {
            // No circuit breaker, but was degraded - recover
            this.updateStatus(vendorId, VendorHealthStatus.Healthy);
        }
    }

    /**
     * Check if vendor is healthy enough to use
     *
     * Considers vendor healthy if:
     * - Status is Healthy, Degraded, or RateLimited
     * - Circuit breaker (if present) is not Open
     *
     * @param vendorId - Vendor to check
     * @returns True if vendor can be used
     */
    public isHealthy(vendorId: string): boolean {
        const health = this.healthState.get(vendorId);

        // Unknown vendors are assumed healthy
        if (!health) {
            return true;
        }

        // Check health status
        const statusHealthy =
            health.status === VendorHealthStatus.Healthy ||
            health.status === VendorHealthStatus.Degraded ||
            health.status === VendorHealthStatus.RateLimited;

        if (!statusHealthy) {
            return false;
        }

        // Check circuit breaker if present
        const circuit = this.circuitBreakers.get(vendorId);
        if (circuit) {
            return circuit.canAttempt();
        }

        return true;
    }

    /**
     * Get current health status for a vendor
     *
     * @param vendorId - Vendor to query
     * @returns Health info, or null if vendor is unknown
     */
    public getHealthStatus(vendorId: string): VendorHealthInfo | null {
        return this.healthState.get(vendorId) || null;
    }

    /**
     * Get health status for all vendors
     *
     * @returns Map of vendor IDs to health info
     */
    public getAllHealthStatus(): Map<string, VendorHealthInfo> {
        return new Map(this.healthState);
    }

    /**
     * Manually mark vendor as healthy
     *
     * Used for manual recovery or testing.
     *
     * @param vendorId - Vendor to mark healthy
     */
    public markHealthy(vendorId: string): void {
        const health = this.getOrCreateHealthInfo(vendorId);
        health.consecutiveFailures = 0;
        this.updateStatus(vendorId, VendorHealthStatus.Healthy);

        // Close circuit breaker if present
        const circuit = this.circuitBreakers.get(vendorId);
        if (circuit) {
            circuit.forceClosed();
        }

        // Cancel any pending health checks
        const timer = this.healthCheckTimers.get(vendorId);
        if (timer) {
            clearTimeout(timer);
            this.healthCheckTimers.delete(vendorId);
        }
    }

    /**
     * Manually mark vendor as unhealthy
     *
     * Used for manual intervention or testing.
     *
     * @param vendorId - Vendor to mark unhealthy
     * @param status - Health status to set
     */
    public markUnhealthy(vendorId: string, status: VendorHealthStatus): void {
        this.updateStatus(vendorId, status);

        // Open circuit breaker if present
        const circuit = this.circuitBreakers.get(vendorId);
        if (circuit) {
            circuit.forceOpen();
        }
    }

    /**
     * Reset all health state
     *
     * Clears all health information and circuit breakers.
     * Used for testing or manual reset.
     */
    public reset(): void {
        this.healthState.clear();
        this.circuitBreakers.forEach(circuit => circuit.destroy());
        this.circuitBreakers.clear();
        this.clearAllHealthCheckTimers();
    }

    /**
     * Cleanup resources
     */
    public destroy(): void {
        this.reset();
        this.initialized = false;
    }

    /**
     * Determine recovery strategy based on error type
     *
     * @param errorInfo - Analyzed error information
     * @returns Appropriate recovery strategy
     * @private
     */
    private determineRecoveryStrategy(errorInfo: AIErrorInfo): ErrorRecoveryStrategy {
        switch (errorInfo.errorType) {
            case 'NetworkError':
                return ErrorRecoveryStrategy.HealthCheckRequired;

            case 'ServiceUnavailable':
            case 'InternalServerError':
                return ErrorRecoveryStrategy.CircuitBreaker;

            case 'Authentication':
            case 'NoCredit':
                return ErrorRecoveryStrategy.ManualIntervention;

            case 'RateLimit':
                return ErrorRecoveryStrategy.ImmediateRetry;

            case 'InvalidRequest':
            case 'ContextLengthExceeded':
                // Request-specific errors, not vendor health issues
                return ErrorRecoveryStrategy.ImmediateRetry;

            default:
                return ErrorRecoveryStrategy.BackoffRetry;
        }
    }

    /**
     * Update vendor health status
     *
     * @param vendorId - Vendor to update
     * @param status - New health status
     * @private
     */
    private updateStatus(vendorId: string, status: VendorHealthStatus): void {
        const health = this.getOrCreateHealthInfo(vendorId);
        const previousStatus = health.status;
        health.status = status;
        health.lastHealthCheck = new Date();

        if (previousStatus !== status) {
            LogStatus(`Vendor ${vendorId} health changed: ${previousStatus} → ${status}`);
        }
    }

    /**
     * Get or create health info for vendor
     *
     * @param vendorId - Vendor ID
     * @returns Health info object
     * @private
     */
    private getOrCreateHealthInfo(vendorId: string): VendorHealthInfo {
        if (!this.healthState.has(vendorId)) {
            this.healthState.set(vendorId, {
                vendorId,
                status: VendorHealthStatus.Healthy,
                lastHealthCheck: new Date(),
                lastSuccessfulRequest: new Date(),
                lastFailedRequest: null,
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                recoveryAttempts: 0,
                lastError: null
            });
        }
        return this.healthState.get(vendorId)!;
    }

    /**
     * Open circuit breaker for vendor
     *
     * @param vendorId - Vendor to apply circuit breaker to
     * @param config - Circuit breaker configuration
     * @private
     */
    private openCircuit(vendorId: string, config: CircuitBreakerConfig): void {
        let circuit = this.circuitBreakers.get(vendorId);

        if (!circuit) {
            circuit = new CircuitBreaker(config);
            this.circuitBreakers.set(vendorId, circuit);

            // Listen for state changes
            circuit.on('closed', () => {
                LogStatus(`Circuit breaker closed for vendor ${vendorId}`);
                this.updateStatus(vendorId, VendorHealthStatus.Healthy);
            });

            circuit.on('opened', () => {
                LogStatus(`Circuit breaker opened for vendor ${vendorId}`);
            });
        }

        // Record failure in circuit
        circuit.recordFailure();
    }

    /**
     * Schedule periodic health checks for vendor
     *
     * @param vendorId - Vendor to check
     * @param config - Health check configuration
     * @private
     */
    private async scheduleHealthCheck(
        vendorId: string,
        config: {
            cooldownMS: number;
            retryInterval: number;
            maxAttempts: number;
        }
    ): Promise<void> {
        // Clear existing timer if any
        const existingTimer = this.healthCheckTimers.get(vendorId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const health = this.getOrCreateHealthInfo(vendorId);

        // Initial cooldown before first check
        const timer = setTimeout(async () => {
            await this.performHealthCheck(vendorId, config);
        }, config.cooldownMS);

        this.healthCheckTimers.set(vendorId, timer);
    }

    /**
     * Perform a health check for a vendor
     *
     * @param vendorId - Vendor to check
     * @param config - Health check configuration
     * @private
     */
    private async performHealthCheck(
        vendorId: string,
        config: {
            retryInterval: number;
            maxAttempts: number;
        }
    ): Promise<void> {
        const health = this.getOrCreateHealthInfo(vendorId);
        health.recoveryAttempts++;

        LogStatus(`Performing health check for vendor ${vendorId} (attempt ${health.recoveryAttempts}/${config.maxAttempts})`);

        // In a full implementation, this would:
        // 1. Ping the vendor endpoint
        // 2. Call health check endpoint if available
        // 3. Try a minimal API request
        //
        // For now, we'll simulate a simple check
        const recovered = await this.simulateHealthCheck(vendorId);

        if (recovered) {
            LogStatus(`Vendor ${vendorId} health check succeeded - marking healthy`);
            this.updateStatus(vendorId, VendorHealthStatus.Healthy);
            health.recoveryAttempts = 0;
            this.healthCheckTimers.delete(vendorId);
        } else if (health.recoveryAttempts >= config.maxAttempts) {
            LogError(`Vendor ${vendorId} health check failed after ${config.maxAttempts} attempts`);
            health.recoveryAttempts = 0;
            this.healthCheckTimers.delete(vendorId);
        } else {
            // Schedule next check
            const timer = setTimeout(async () => {
                await this.performHealthCheck(vendorId, config);
            }, config.retryInterval);

            this.healthCheckTimers.set(vendorId, timer);
        }
    }

    /**
     * Simulate a health check
     *
     * In production, this would make actual network requests.
     * For now, we'll assume vendor recovers after a few attempts.
     *
     * @param vendorId - Vendor to check
     * @returns True if vendor is healthy
     * @private
     */
    private async simulateHealthCheck(vendorId: string): Promise<boolean> {
        const health = this.getOrCreateHealthInfo(vendorId);

        // Simulate recovery after 3 attempts
        return health.recoveryAttempts >= 3;
    }

    /**
     * Clear all health check timers
     *
     * @private
     */
    private clearAllHealthCheckTimers(): void {
        for (const timer of this.healthCheckTimers.values()) {
            clearTimeout(timer);
        }
        this.healthCheckTimers.clear();
    }
}

/**
 * Vendor health status
 */
export enum VendorHealthStatus {
    /**
     * Operating normally
     */
    Healthy = 'Healthy',

    /**
     * Some failures occurring, still usable
     */
    Degraded = 'Degraded',

    /**
     * At rate limit capacity (temporary, not unhealthy)
     */
    RateLimited = 'RateLimited',

    /**
     * Network unreachable
     */
    NetworkUnreachable = 'NetworkUnreachable',

    /**
     * Service errors (500/503)
     */
    ServiceError = 'ServiceError',

    /**
     * Authentication failed
     */
    AuthenticationFailed = 'AuthenticationFailed',

    /**
     * Circuit breaker is open
     */
    CircuitOpen = 'CircuitOpen',

    /**
     * Manually disabled by administrator
     */
    Disabled = 'Disabled'
}

/**
 * Error recovery strategy
 */
export enum ErrorRecoveryStrategy {
    /**
     * Transient error, try again immediately
     */
    ImmediateRetry = 'ImmediateRetry',

    /**
     * Wait then retry with exponential backoff
     */
    BackoffRetry = 'BackoffRetry',

    /**
     * Perform health checks before retrying
     */
    HealthCheckRequired = 'HealthCheckRequired',

    /**
     * Use circuit breaker pattern
     */
    CircuitBreaker = 'CircuitBreaker',

    /**
     * Requires manual intervention (admin must fix)
     */
    ManualIntervention = 'ManualIntervention'
}

/**
 * Vendor health information
 */
export interface VendorHealthInfo {
    /**
     * Vendor identifier
     */
    vendorId: string;

    /**
     * Current health status
     */
    status: VendorHealthStatus;

    /**
     * Last health check timestamp
     */
    lastHealthCheck: Date;

    /**
     * Last successful request timestamp
     */
    lastSuccessfulRequest: Date;

    /**
     * Last failed request timestamp
     */
    lastFailedRequest: Date | null;

    /**
     * Consecutive failures (resets on success)
     */
    consecutiveFailures: number;

    /**
     * Consecutive successes (resets on failure)
     */
    consecutiveSuccesses: number;

    /**
     * Number of recovery attempts made
     */
    recoveryAttempts: number;

    /**
     * Last error encountered
     */
    lastError: AIErrorInfo | null;
}
