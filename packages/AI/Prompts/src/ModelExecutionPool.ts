import { PriorityQueue } from './PriorityQueue';
import { VendorAPIKeyPool, KeyStatistics } from './VendorAPIKeyPool';
import { VendorHealthTracker, VendorHealthStatus } from './VendorHealthTracker';
import {
    PooledExecutionTask,
    PooledExecutionResult,
    QueuedTask,
    PoolConfig,
    PoolMemberConfig,
    VendorKeySelection,
    LoadBalancingStrategy,
    PoolStatistics,
    VendorStatistics
} from '@memberjunction/ai-core-plus';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';

/**
 * Manages execution queue and vendor selection for a single AI model
 *
 * This class handles:
 * - Queuing requests when at capacity
 * - Selecting vendors/keys using load balancing strategies
 * - Tracking active requests and capacity
 * - Collecting execution statistics
 *
 * Each model has its own independent pool with separate queue and capacity tracking.
 *
 * @example
 * ```typescript
 * const config = await loadPoolConfig(modelId);
 * const pool = new ModelExecutionPool(config, healthTracker);
 * await pool.initialize();
 *
 * const result = await pool.executeRequest(task);
 * ```
 */
export class ModelExecutionPool {
    /**
     * Pool configuration
     */
    private config: PoolConfig;

    /**
     * Health tracker (shared across all pools)
     */
    private healthTracker: VendorHealthTracker;

    /**
     * Priority queue for pending requests
     */
    private queue: PriorityQueue<QueuedTask>;

    /**
     * Vendor API key pools (one per vendor in pool)
     */
    private vendorPools: Map<string, VendorAPIKeyPool> = new Map();

    /**
     * Number of currently active requests
     */
    private activeRequests: number = 0;

    /**
     * Whether queue processing is running
     */
    private isProcessing: boolean = false;

    /**
     * Pool statistics
     */
    private stats: PoolStatsTracker;

    /**
     * Round-robin index for vendor selection
     */
    private roundRobinIndex: number = 0;

    /**
     * Whether pool has been initialized
     */
    private initialized: boolean = false;

    /**
     * User context for database operations
     */
    private contextUser?: UserInfo;

    /**
     * Creates a model execution pool
     *
     * @param config - Pool configuration
     * @param healthTracker - Shared health tracker
     */
    constructor(config: PoolConfig, healthTracker: VendorHealthTracker) {
        this.config = config;
        this.healthTracker = healthTracker;
        this.queue = new PriorityQueue<QueuedTask>();
        this.stats = new PoolStatsTracker(config);
    }

    /**
     * Initialize pool by loading vendor key pools
     *
     * @param contextUser - User context for database access
     */
    public async initialize(contextUser?: UserInfo): Promise<void> {
        if (this.initialized) {
            return;
        }

        this.contextUser = contextUser;

        // Initialize vendor API key pools for each member
        for (const member of this.config.members) {
            if (!member.isActive) {
                continue;
            }

            const vendorPool = new VendorAPIKeyPool(member.vendorId);
            await vendorPool.initialize(contextUser);

            this.vendorPools.set(member.vendorId, vendorPool);
        }

        this.initialized = true;
        LogStatus(`ModelExecutionPool initialized for model ${this.config.modelId} with ${this.vendorPools.size} vendors`);
    }

    /**
     * Execute a request (queue if at capacity)
     *
     * @param task - Execution task
     * @returns Execution result
     */
    public async executeRequest(task: PooledExecutionTask): Promise<PooledExecutionResult> {
        if (!this.initialized) {
            throw new Error('ModelExecutionPool not initialized');
        }

        // Check cancellation
        if (task.cancellationToken?.aborted) {
            return this.createCancelledResult(task, 'user_requested');
        }

        // Check if we have capacity
        const hasCapacity = this.hasCapacity();

        if (hasCapacity) {
            // Execute immediately
            return await this.executeTaskNow(task);
        } else {
            // Enqueue and wait
            return await this.enqueueAndWait(task);
        }
    }

    /**
     * Check if pool has available capacity
     *
     * @returns True if requests can be accepted
     */
    public hasCapacity(): boolean {
        if (this.config.maxParallelRequests == null) {
            return true;  // Unlimited
        }
        return this.activeRequests < this.config.maxParallelRequests;
    }

    /**
     * Get current queue length
     *
     * @returns Number of queued requests
     */
    public getQueueLength(): number {
        return this.queue.size();
    }

    /**
     * Get number of active requests
     *
     * @returns Active request count
     */
    public getActiveRequestCount(): number {
        return this.activeRequests;
    }

    /**
     * Get pool statistics
     *
     * @returns Current statistics
     */
    public getStatistics(): PoolStatistics {
        const vendorStats: VendorStatistics[] = [];

        for (const [vendorId, vendorPool] of this.vendorPools.entries()) {
            const keyStats = vendorPool.getKeyStatistics();
            const healthStatus = this.healthTracker.getHealthStatus(vendorId);

            const totalRequests = keyStats.reduce((sum, k) => sum + k.usedRPM, 0);
            const availableCapacity = vendorPool.getAggregateCapacity();
            const totalCapacity = keyStats.reduce((sum, k) => sum + (k.limitTPM || 0), 0);

            vendorStats.push({
                vendorId,
                vendorName: `Vendor ${vendorId}`, // Would load from DB in full implementation
                activeRequests: vendorPool.getTotalActiveRequests(),
                totalRequests,
                successfulRequests: 0, // Would track in full implementation
                failedRequests: 0,
                averageExecutionMS: 0,
                healthStatus: healthStatus?.status || VendorHealthStatus.Healthy,
                activeKeyCount: vendorPool.getActiveKeyCount(),
                availableCapacityPercent: totalCapacity > 0
                    ? (availableCapacity.availableTPM / totalCapacity) * 100
                    : 100
            });
        }

        return {
            modelId: this.config.modelId,
            poolId: this.config.poolId,
            poolName: this.config.name,
            queueLength: this.queue.size(),
            activeRequests: this.activeRequests,
            maxParallelRequests: this.config.maxParallelRequests,
            totalProcessed: this.stats.totalProcessed,
            totalSucceeded: this.stats.totalSucceeded,
            totalFailed: this.stats.totalFailed,
            totalCancelled: this.stats.totalCancelled,
            averageQueueWaitMS: this.stats.getAverageQueueWait(),
            averageExecutionMS: this.stats.getAverageExecutionTime(),
            uptimeMS: Date.now() - this.stats.startTime,
            vendorStats
        };
    }

    /**
     * Graceful shutdown
     *
     * Drains queue and waits for active requests to complete.
     *
     * @param timeoutMS - Maximum time to wait for completion
     */
    public async shutdown(timeoutMS: number): Promise<void> {
        LogStatus(`Shutting down pool for model ${this.config.modelId}...`);

        const startTime = Date.now();

        // Drain queue with timeout errors
        while (this.queue.size() > 0) {
            const task = this.queue.dequeue();
            if (task) {
                clearTimeout(task.timeoutHandle);
                task.reject(new Error('Pool shutting down'));
            }
        }

        // Wait for active requests to complete (with timeout)
        while (this.activeRequests > 0 && (Date.now() - startTime) < timeoutMS) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        LogStatus(`Pool for model ${this.config.modelId} shutdown complete`);
    }

    /**
     * Execute task immediately (capacity available)
     *
     * @param task - Task to execute
     * @returns Execution result
     * @private
     */
    private async executeTaskNow(task: PooledExecutionTask): Promise<PooledExecutionResult> {
        this.activeRequests++;
        const startTime = Date.now();

        try {
            // Select vendor and key
            const selection = await this.selectVendorAndKey(task);

            if (!selection) {
                throw new Error('No healthy vendor available with capacity');
            }

            // Execute using the provided executor callback
            const promptResult = await task.executor(selection.vendorId, selection.apiKeyValue);

            const executionTimeMS = Date.now() - startTime;

            // Convert AIPromptRunResult to PooledExecutionResult
            const result: PooledExecutionResult = {
                task,
                success: promptResult.success,
                rawResult: promptResult.rawResult,
                parsedResult: promptResult.result,
                errorMessage: promptResult.errorMessage,
                executionTimeMS,
                tokensUsed: promptResult.tokensUsed || task.estimatedTokens,
                vendorId: selection.vendorId,
                apiKeyId: selection.apiKeyId,
                startTime: new Date(startTime),
                endTime: new Date(),
                queueWaitTimeMS: 0
            };

            // Track success/failure
            if (promptResult.success) {
                this.stats.recordSuccess(executionTimeMS);
                this.healthTracker.recordSuccess(selection.vendorId, selection.apiKeyId);
            } else {
                this.stats.recordFailure(executionTimeMS);
                // Don't record as health error here - the executor already handled error analysis
            }

            // Record usage
            const vendorPool = this.vendorPools.get(selection.vendorId);
            if (vendorPool) {
                const actualTokens = promptResult.tokensUsed || task.estimatedTokens;
                vendorPool.recordUsage(selection.apiKeyId, actualTokens, 1);
                vendorPool.decrementActiveRequests(selection.apiKeyId);
            }

            return result;

        } catch (error) {
            // Track failure
            this.stats.recordFailure(Date.now() - startTime);

            throw error;

        } finally {
            this.activeRequests--;

            // Process queue if items waiting
            if (this.queue.size() > 0) {
                this.processQueue();
            }
        }
    }

    /**
     * Enqueue task and wait for capacity
     *
     * @param task - Task to enqueue
     * @returns Execution result (when capacity becomes available)
     * @private
     */
    private async enqueueAndWait(task: PooledExecutionTask): Promise<PooledExecutionResult> {
        return new Promise((resolve, reject) => {
            const queuedAt = Date.now();

            // Create timeout
            const timeoutHandle = setTimeout(() => {
                this.queue.remove(queuedTask);
                this.stats.recordCancellation();
                reject(new Error(`Queue timeout after ${task.timeout}ms`));
            }, task.timeout);

            // Create queued task wrapper
            const queuedTask: QueuedTask = {
                ...task,
                queuedAt,
                timeoutHandle,
                resolve: (result) => {
                    clearTimeout(timeoutHandle);
                    const waitTime = Date.now() - queuedAt;
                    this.stats.recordQueueWait(waitTime);
                    result.queueWaitTimeMS = waitTime;
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeoutHandle);
                    reject(error);
                }
            };

            // Add to queue
            this.queue.enqueue(queuedTask);

            // Notify progress
            if (task.onProgress) {
                task.onProgress({
                    taskId: task.taskId,
                    phase: 'queued',
                    message: 'Request queued',
                    queuePosition: this.queue.size()
                });
            }

            // Start processing if not already running
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    /**
     * Process queued tasks
     *
     * Continuously processes queue while capacity is available.
     *
     * @private
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.size() > 0 && this.hasCapacity()) {
            const queuedTask = this.queue.dequeue();
            if (!queuedTask) {
                break;
            }

            // Execute in background (don't await)
            this.executeTaskNow(queuedTask)
                .then(result => queuedTask.resolve(result))
                .catch(error => queuedTask.reject(error));
        }

        this.isProcessing = false;
    }

    /**
     * Select best vendor and API key for this request
     *
     * @param task - Task to select vendor for
     * @returns Vendor/key selection, or null if none available
     * @private
     */
    private async selectVendorAndKey(task: PooledExecutionTask): Promise<VendorKeySelection | null> {
        // Get active, healthy members
        const healthyMembers = this.config.members.filter(member => {
            return member.isActive && this.healthTracker.isHealthy(member.vendorId);
        });

        if (healthyMembers.length === 0) {
            return null;
        }

        // Apply load balancing strategy
        const selectedMember = this.applyLoadBalancingStrategy(healthyMembers, task);

        // Get vendor's API key pool
        const vendorPool = this.vendorPools.get(selectedMember.vendorId);
        if (!vendorPool) {
            return null;
        }

        // Select available API key
        const selectedKey = vendorPool.selectAvailableKey(task.estimatedTokens, 1);
        if (!selectedKey) {
            return null;  // No capacity
        }

        // Increment active requests
        vendorPool.incrementActiveRequests(selectedKey.id);

        return {
            vendorId: selectedMember.vendorId,
            apiKeyId: selectedKey.id,
            vendorName: `Vendor ${selectedMember.vendorId}`,
            apiKeyValue: selectedKey.value,
            apiKeyName: selectedKey.name
        };
    }

    /**
     * Apply configured load balancing strategy
     *
     * @param members - Available pool members
     * @param task - Task to select for
     * @returns Selected member
     * @private
     */
    private applyLoadBalancingStrategy(
        members: PoolMemberConfig[],
        task: PooledExecutionTask
    ): PoolMemberConfig {

        switch (this.config.loadBalancingStrategy) {
            case 'RoundRobin':
                return this.selectRoundRobin(members);

            case 'LeastBusy':
                return this.selectLeastBusy(members);

            case 'Weighted':
                return this.selectWeighted(members);

            case 'Random':
                return members[Math.floor(Math.random() * members.length)];

            case 'Priority':
            default:
                return this.selectByPriority(members);
        }
    }

    /**
     * Select by priority (lowest number = highest priority)
     *
     * @param members - Available members
     * @returns Highest priority member
     * @private
     */
    private selectByPriority(members: PoolMemberConfig[]): PoolMemberConfig {
        return members.reduce((highest, current) =>
            current.priority < highest.priority ? current : highest
        );
    }

    /**
     * Select using round-robin
     *
     * @param members - Available members
     * @returns Next member in rotation
     * @private
     */
    private selectRoundRobin(members: PoolMemberConfig[]): PoolMemberConfig {
        const sorted = [...members].sort((a, b) => a.priority - b.priority);
        const index = this.roundRobinIndex % sorted.length;
        this.roundRobinIndex++;
        return sorted[index];
    }

    /**
     * Select least busy vendor
     *
     * @param members - Available members
     * @returns Member with fewest active requests
     * @private
     */
    private selectLeastBusy(members: PoolMemberConfig[]): PoolMemberConfig {
        return members.reduce((least, current) => {
            const leastPool = this.vendorPools.get(least.vendorId);
            const currentPool = this.vendorPools.get(current.vendorId);

            const leastActive = leastPool?.getTotalActiveRequests() || 0;
            const currentActive = currentPool?.getTotalActiveRequests() || 0;

            return currentActive < leastActive ? current : least;
        });
    }

    /**
     * Select using weighted distribution
     *
     * @param members - Available members
     * @returns Weighted random selection
     * @private
     */
    private selectWeighted(members: PoolMemberConfig[]): PoolMemberConfig {
        const totalWeight = members.reduce((sum, m) => sum + (m.weight || 1), 0);
        const random = Math.random() * totalWeight;

        let cumulative = 0;
        for (const member of members) {
            cumulative += (member.weight || 1);
            if (random <= cumulative) {
                return member;
            }
        }

        return members[members.length - 1];
    }

    /**
     * Create cancelled result
     *
     * @param task - Cancelled task
     * @param reason - Cancellation reason
     * @returns Cancelled result
     * @private
     */
    private createCancelledResult(
        task: PooledExecutionTask,
        reason: 'user_requested' | 'timeout' | 'error' | 'capacity'
    ): PooledExecutionResult {
        this.stats.recordCancellation();

        return {
            task,
            success: false,
            errorMessage: `Request cancelled: ${reason}`,
            executionTimeMS: 0,
            vendorId: '',
            apiKeyId: '',
            startTime: new Date(),
            endTime: new Date(),
            cancelled: true,
            cancellationReason: reason
        };
    }
}

/**
 * Pool statistics tracker
 *
 * @private
 */
class PoolStatsTracker {
    public totalProcessed: number = 0;
    public totalSucceeded: number = 0;
    public totalFailed: number = 0;
    public totalCancelled: number = 0;
    public startTime: number = Date.now();

    private queueWaitTimes: number[] = [];
    private executionTimes: number[] = [];

    constructor(private config: PoolConfig) {}

    public recordSuccess(executionTimeMS: number): void {
        this.totalProcessed++;
        this.totalSucceeded++;
        this.executionTimes.push(executionTimeMS);

        // Keep only last 1000 samples
        if (this.executionTimes.length > 1000) {
            this.executionTimes.shift();
        }
    }

    public recordFailure(executionTimeMS: number): void {
        this.totalProcessed++;
        this.totalFailed++;
        this.executionTimes.push(executionTimeMS);

        if (this.executionTimes.length > 1000) {
            this.executionTimes.shift();
        }
    }

    public recordCancellation(): void {
        this.totalProcessed++;
        this.totalCancelled++;
    }

    public recordQueueWait(waitTimeMS: number): void {
        this.queueWaitTimes.push(waitTimeMS);

        if (this.queueWaitTimes.length > 1000) {
            this.queueWaitTimes.shift();
        }
    }

    public getAverageQueueWait(): number {
        if (this.queueWaitTimes.length === 0) {
            return 0;
        }
        const sum = this.queueWaitTimes.reduce((a, b) => a + b, 0);
        return sum / this.queueWaitTimes.length;
    }

    public getAverageExecutionTime(): number {
        if (this.executionTimes.length === 0) {
            return 0;
        }
        const sum = this.executionTimes.reduce((a, b) => a + b, 0);
        return sum / this.executionTimes.length;
    }
}
