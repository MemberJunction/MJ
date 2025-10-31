import { ModelExecutionPool } from './ModelExecutionPool';
import { VendorHealthTracker, VendorHealthInfo } from './VendorHealthTracker';
import {
    PooledExecutionTask,
    PooledExecutionResult,
    PoolConfig,
    PoolMemberConfig,
    PoolStatistics
} from '@memberjunction/ai-core-plus';
import { Metadata, RunView, UserInfo, LogStatus, LogError } from '@memberjunction/core';

/**
 * Global singleton manager for all model execution pools
 *
 * Coordinates pooling across the entire server instance. This class:
 * - Creates and manages pools per model
 * - Provides centralized health tracking
 * - Handles server startup/shutdown
 * - Exposes monitoring and statistics
 *
 * **Singleton Pattern**: Only one instance exists per server process.
 *
 * @example
 * ```typescript
 * // Get singleton instance
 * const poolManager = ModelPoolManager.getInstance();
 *
 * // Initialize on server startup
 * await poolManager.initialize();
 *
 * // Execute request through pool
 * const result = await poolManager.executeRequest(task);
 *
 * // Get statistics
 * const stats = poolManager.getPoolStatistics();
 *
 * // Shutdown gracefully
 * await poolManager.shutdown();
 * ```
 */
export class ModelPoolManager {
    /**
     * Singleton instance
     */
    private static instance: ModelPoolManager | null = null;

    /**
     * All model pools (one per model that has pooling configured)
     */
    private pools: Map<string, ModelExecutionPool> = new Map();

    /**
     * Global health tracker (shared across all pools)
     */
    private healthTracker: VendorHealthTracker;

    /**
     * Whether manager has been initialized
     */
    private initialized: boolean = false;

    /**
     * Metadata instance for database access
     */
    private metadata: Metadata;

    /**
     * User context for database operations
     */
    private contextUser?: UserInfo;

    /**
     * Private constructor (singleton pattern)
     */
    private constructor() {
        this.healthTracker = new VendorHealthTracker();
        this.metadata = new Metadata();
    }

    /**
     * Get singleton instance
     *
     * Creates instance on first call, returns existing instance thereafter.
     *
     * @returns ModelPoolManager instance
     */
    public static getInstance(): ModelPoolManager {
        if (!ModelPoolManager.instance) {
            ModelPoolManager.instance = new ModelPoolManager();
        }
        return ModelPoolManager.instance;
    }

    /**
     * Initialize pool manager
     *
     * Should be called during server startup to prepare pooling system.
     *
     * @param contextUser - User context for database access
     */
    public async initialize(contextUser?: UserInfo): Promise<void> {
        if (this.initialized) {
            LogStatus('ModelPoolManager already initialized');
            return;
        }

        this.contextUser = contextUser;

        LogStatus('Initializing ModelPoolManager...');

        try {
            // Initialize health tracker
            await this.healthTracker.initialize();

            // Preload pool configurations (optional - pools are lazy-loaded by default)
            // await this.loadAllPoolConfigurations();

            this.initialized = true;
            LogStatus('ModelPoolManager initialized successfully');

        } catch (error) {
            LogError(`Failed to initialize ModelPoolManager: ${error.message}`);
            throw error;
        }
    }

    /**
     * Execute a request through the pooling system
     *
     * Routes request to appropriate model pool, creating pool if needed.
     *
     * @param task - Execution task
     * @returns Execution result
     */
    public async executeRequest(task: PooledExecutionTask): Promise<PooledExecutionResult> {
        if (!this.initialized) {
            throw new Error('ModelPoolManager not initialized. Call initialize() first.');
        }

        // Get or create pool for this model
        const pool = await this.getOrCreatePool(task.modelId);

        // Execute through pool
        return await pool.executeRequest(task);
    }

    /**
     * Get or create a pool for a model
     *
     * Pools are lazily created on first use.
     *
     * @param modelId - Model identifier
     * @returns Model execution pool
     */
    public async getOrCreatePool(modelId: string): Promise<ModelExecutionPool> {
        // Return existing pool if available
        if (this.pools.has(modelId)) {
            return this.pools.get(modelId)!;
        }

        // Load pool configuration
        const config = await this.loadPoolConfigForModel(modelId);

        if (!config) {
            throw new Error(`No pool configuration found for model ${modelId}`);
        }

        // Create new pool
        const pool = new ModelExecutionPool(config, this.healthTracker);
        await pool.initialize(this.contextUser);

        this.pools.set(modelId, pool);

        LogStatus(`Created execution pool for model ${modelId}`);

        return pool;
    }

    /**
     * Get pool for a model (if it exists)
     *
     * @param modelId - Model identifier
     * @returns Pool instance, or null if not created yet
     */
    public getPool(modelId: string): ModelExecutionPool | null {
        return this.pools.get(modelId) || null;
    }

    /**
     * Get vendor health status
     *
     * @param vendorId - Vendor identifier
     * @returns Health info, or null if unknown
     */
    public getVendorHealth(vendorId: string): VendorHealthInfo | null {
        return this.healthTracker.getHealthStatus(vendorId);
    }

    /**
     * Get health status for all vendors
     *
     * @returns Map of vendor IDs to health info
     */
    public getAllVendorHealth(): Map<string, VendorHealthInfo> {
        return this.healthTracker.getAllHealthStatus();
    }

    /**
     * Get statistics for all pools
     *
     * Useful for monitoring and dashboards.
     *
     * @returns Array of pool statistics
     */
    public getPoolStatistics(): PoolStatistics[] {
        const stats: PoolStatistics[] = [];

        for (const [modelId, pool] of this.pools.entries()) {
            stats.push(pool.getStatistics());
        }

        return stats;
    }

    /**
     * Get statistics for specific pool
     *
     * @param modelId - Model identifier
     * @returns Pool statistics, or null if pool doesn't exist
     */
    public getPoolStatisticsForModel(modelId: string): PoolStatistics | null {
        const pool = this.pools.get(modelId);
        return pool ? pool.getStatistics() : null;
    }

    /**
     * Check if pooling is configured for a model
     *
     * @param modelId - Model identifier
     * @returns True if pool configuration exists
     */
    public async hasPoolConfiguration(modelId: string): Promise<boolean> {
        const config = await this.loadPoolConfigForModel(modelId);
        return config != null;
    }

    /**
     * Gracefully shutdown all pools
     *
     * Drains queues and waits for active requests to complete.
     * Should be called during server shutdown.
     *
     * @param timeoutMS - Maximum time to wait for completion (default 30s)
     */
    public async shutdown(timeoutMS: number = 30000): Promise<void> {
        if (!this.initialized) {
            return;
        }

        LogStatus('Shutting down ModelPoolManager...');

        const shutdownPromises = Array.from(this.pools.values()).map(pool =>
            pool.shutdown(timeoutMS)
        );

        await Promise.all(shutdownPromises);

        // Cleanup health tracker
        this.healthTracker.destroy();

        this.pools.clear();
        this.initialized = false;

        LogStatus('ModelPoolManager shutdown complete');
    }

    /**
     * Reset all pools and health state
     *
     * Used for testing. Should not be used in production.
     */
    public reset(): void {
        this.pools.clear();
        this.healthTracker.reset();
        this.initialized = false;
    }

    /**
     * Load pool configuration for a specific model
     *
     * Queries database for pool configuration and member details.
     *
     * @param modelId - Model identifier
     * @returns Pool configuration, or null if not configured
     * @private
     */
    private async loadPoolConfigForModel(modelId: string): Promise<PoolConfig | null> {
        const rv = new RunView();

        // Load pool configuration
        const poolResult = await rv.RunView<AIModelVendorPoolEntityType>({
            EntityName: 'AI Model Vendor Pools',
            ExtraFilter: `ModelID='${modelId}' AND IsActive=1`,
            ResultType: 'entity_object'
        }, this.contextUser);

        if (!poolResult.Success || !poolResult.Results || poolResult.Results.length === 0) {
            return null;
        }

        const poolEntity = poolResult.Results[0];

        // Load pool members
        const membersResult = await rv.RunView<AIModelVendorPoolMemberEntityType>({
            EntityName: 'AI Model Vendor Pool Members',
            ExtraFilter: `PoolID='${poolEntity.ID}' AND IsActive=1`,
            OrderBy: 'Priority ASC',
            ResultType: 'entity_object'
        }, this.contextUser);

        if (!membersResult.Success) {
            throw new Error(`Failed to load pool members: ${membersResult.ErrorMessage}`);
        }

        const members: PoolMemberConfig[] = (membersResult.Results || []).map(m => ({
            vendorId: m.VendorID,
            priority: m.Priority,
            weight: m.Weight || undefined,
            maxParallelRequests: m.MaxParallelRequests || undefined,
            isActive: m.IsActive
        }));

        return {
            poolId: poolEntity.ID,
            modelId: poolEntity.ModelID,
            name: poolEntity.Name,
            maxWaitTimeMS: poolEntity.MaxWaitTimeMS,
            maxParallelRequests: poolEntity.MaxParallelRequests,
            loadBalancingStrategy: poolEntity.LoadBalancingStrategy as any,
            isActive: poolEntity.IsActive,
            members
        };
    }

    /**
     * Load all pool configurations
     *
     * Preloads all pool configurations during initialization.
     * Optional - pools can be lazy-loaded instead.
     *
     * @private
     */
    private async loadAllPoolConfigurations(): Promise<void> {
        const rv = new RunView();

        const result = await rv.RunView<AIModelVendorPoolEntityType>({
            EntityName: 'AI Model Vendor Pools',
            ExtraFilter: 'IsActive=1',
            ResultType: 'entity_object'
        }, this.contextUser);

        if (!result.Success) {
            LogError(`Failed to load pool configurations: ${result.ErrorMessage}`);
            return;
        }

        for (const poolEntity of result.Results || []) {
            try {
                await this.getOrCreatePool(poolEntity.ModelID);
            } catch (error) {
                LogError(`Failed to create pool for model ${poolEntity.ModelID}: ${error.message}`);
            }
        }
    }
}

/**
 * Simplified type for AIModelVendorPool entity
 *
 * Actual entity will be generated by CodeGen after migration runs.
 */
interface AIModelVendorPoolEntityType {
    ID: string;
    ModelID: string;
    Name: string;
    MaxWaitTimeMS: number;
    MaxParallelRequests: number | null;
    LoadBalancingStrategy: string;
    IsActive: boolean;
}

/**
 * Simplified type for AIModelVendorPoolMember entity
 *
 * Actual entity will be generated by CodeGen after migration runs.
 */
interface AIModelVendorPoolMemberEntityType {
    ID: string;
    PoolID: string;
    VendorID: string;
    Priority: number;
    Weight: number | null;
    MaxParallelRequests: number | null;
    IsActive: boolean;
}
