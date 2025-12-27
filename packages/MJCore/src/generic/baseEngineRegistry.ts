import { BaseSingleton } from '@memberjunction/global';
import { LogError } from './logging';
import { BaseEntity } from './baseEntity';

/**
 * Information about a registered engine instance
 */
export interface EngineRegistrationInfo {
    /**
     * The constructor/class name of the engine
     */
    className: string;
    /**
     * Reference to the engine instance
     */
    instance: unknown;
    /**
     * When the engine was registered
     */
    registeredAt: Date;
    /**
     * When the engine was last loaded/configured
     */
    lastLoadedAt: Date | null;
    /**
     * Whether the engine is currently loaded
     */
    isLoaded: boolean;
    /**
     * Estimated memory usage in bytes (if calculable)
     */
    estimatedMemoryBytes: number;
    /**
     * Number of data items loaded in the engine
     */
    itemCount: number;
}

/**
 * Memory statistics for all registered engines
 */
export interface EngineMemoryStats {
    /**
     * Total number of registered engines
     */
    totalEngines: number;
    /**
     * Number of engines that are currently loaded
     */
    loadedEngines: number;
    /**
     * Total estimated memory across all engines
     */
    totalEstimatedMemoryBytes: number;
    /**
     * Per-engine breakdown
     */
    engineStats: EngineRegistrationInfo[];
}

/**
 * BaseEngineRegistry is a central registry for tracking all BaseEngine instances.
 *
 * It provides:
 * - Registration and tracking of engine singletons
 * - Memory usage estimation across all engines
 * - Cross-engine data sharing coordination
 * - Bulk operations (refresh all, invalidate all)
 *
 * @example
 * ```typescript
 * // Register an engine (typically done automatically by BaseEngine)
 * BaseEngineRegistry.Instance.RegisterEngine(MyEngine.Instance);
 *
 * // Get memory stats
 * const stats = BaseEngineRegistry.Instance.GetMemoryStats();
 * console.log(`Total engines: ${stats.totalEngines}`);
 * console.log(`Total memory: ${(stats.totalEstimatedMemoryBytes / 1024 / 1024).toFixed(2)} MB`);
 * ```
 */
export class BaseEngineRegistry extends BaseSingleton<BaseEngineRegistry> {
    private _engines: Map<string, EngineRegistrationInfo> = new Map();

    /**
     * Returns the singleton instance of BaseEngineRegistry
     */
    public static get Instance(): BaseEngineRegistry {
        return super.getInstance<BaseEngineRegistry>();
    }

    /**
     * Register an engine instance with the registry.
     * This is typically called automatically by BaseEngine during Config().
     *
     * @param engine - The engine instance to register
     * @param className - Optional class name override (uses constructor name by default)
     */
    public RegisterEngine(engine: unknown, className?: string): void {
        const name = className || (engine as object).constructor.name;

        const existingInfo = this._engines.get(name);
        if (existingInfo) {
            // Update existing registration
            existingInfo.instance = engine;
            existingInfo.lastLoadedAt = new Date();
            existingInfo.isLoaded = this.CheckEngineLoaded(engine);
            // NOTE: Memory/item counts are computed lazily in GetMemoryStats() to avoid
            // blocking during registration. Don't compute them here.
        } else {
            // New registration - use placeholder values, computed lazily in GetMemoryStats()
            this._engines.set(name, {
                className: name,
                instance: engine,
                registeredAt: new Date(),
                lastLoadedAt: this.CheckEngineLoaded(engine) ? new Date() : null,
                isLoaded: this.CheckEngineLoaded(engine),
                estimatedMemoryBytes: 0, // Computed lazily
                itemCount: 0 // Computed lazily
            });
        }
    }

    /**
     * Unregister an engine from the registry
     *
     * @param engine - The engine instance to unregister
     */
    public UnregisterEngine(engine: unknown): void {
        const name = (engine as object).constructor.name;
        this._engines.delete(name);
    }

    /**
     * Get a registered engine by class name
     *
     * @param className - The class name of the engine
     * @returns The engine instance or null if not found
     */
    public GetEngine<T>(className: string): T | null {
        const info = this._engines.get(className);
        return info ? (info.instance as T) : null;
    }

    /**
     * Get all registered engines
     *
     * @returns Array of all registered engine instances
     */
    public GetAllEngines(): unknown[] {
        return Array.from(this._engines.values()).map(info => info.instance);
    }

    /**
     * Get registration info for a specific engine
     *
     * @param className - The class name of the engine
     * @returns The registration info or null if not found
     */
    public GetEngineInfo(className: string): EngineRegistrationInfo | null {
        return this._engines.get(className) || null;
    }

    /**
     * Get memory statistics for all registered engines
     *
     * @returns Memory statistics object
     */
    public GetMemoryStats(): EngineMemoryStats {
        // Update all engine stats first
        for (const [name, info] of this._engines) {
            info.isLoaded = this.CheckEngineLoaded(info.instance);
            info.estimatedMemoryBytes = this.EstimateEngineMemory(info.instance);
            info.itemCount = this.CountEngineItems(info.instance);
        }

        const engineStats = Array.from(this._engines.values());

        return {
            totalEngines: engineStats.length,
            loadedEngines: engineStats.filter(e => e.isLoaded).length,
            totalEstimatedMemoryBytes: engineStats.reduce((sum, e) => sum + e.estimatedMemoryBytes, 0),
            engineStats: engineStats.map(e => ({ ...e })) // Return copies
        };
    }

    /**
     * Refresh all loaded engines
     *
     * @returns Number of engines refreshed
     */
    public async RefreshAllEngines(): Promise<number> {
        let refreshed = 0;

        for (const [name, info] of this._engines) {
            if (info.isLoaded && this.HasRefreshMethod(info.instance)) {
                try {
                    await (info.instance as { RefreshAllItems: () => Promise<void> }).RefreshAllItems();
                    info.lastLoadedAt = new Date();
                    info.estimatedMemoryBytes = this.EstimateEngineMemory(info.instance);
                    info.itemCount = this.CountEngineItems(info.instance);
                    refreshed++;
                } catch (error) {
                    LogError(`Failed to refresh engine ${name}: ${error}`);
                }
            }
        }

        return refreshed;
    }

    /**
     * Notify the registry that an engine has been loaded/configured
     *
     * @param engine - The engine that was loaded
     */
    public NotifyEngineLoaded(engine: unknown): void {
        const name = (engine as object).constructor.name;
        const info = this._engines.get(name);
        if (info) {
            info.lastLoadedAt = new Date();
            info.isLoaded = true;
            // NOTE: Memory/item counts are computed lazily in GetMemoryStats() to avoid
            // blocking during engine load. Don't compute them here.
        } else {
            // Auto-register if not already registered
            this.RegisterEngine(engine);
        }
    }

    /**
     * Get a list of all engine class names
     */
    public GetEngineNames(): string[] {
        return Array.from(this._engines.keys());
    }

    /**
     * Check if an engine is registered
     */
    public IsRegistered(className: string): boolean {
        return this._engines.has(className);
    }

    /**
     * Clear all registrations (use with caution, primarily for testing)
     */
    public Reset(): void {
        this._engines.clear();
    }

    /**
     * Check if an engine is loaded by looking for a 'Loaded' property
     */
    private CheckEngineLoaded(engine: unknown): boolean {
        if (engine && typeof engine === 'object' && 'Loaded' in engine) {
            return Boolean((engine as { Loaded: boolean }).Loaded);
        }
        return false;
    }

    /**
     * Check if an engine has a RefreshAllItems method
     */
    private HasRefreshMethod(engine: unknown): boolean {
        return engine &&
               typeof engine === 'object' &&
               'RefreshAllItems' in engine &&
               typeof (engine as { RefreshAllItems: unknown }).RefreshAllItems === 'function';
    }

    /**
     * Estimate memory usage of an engine by examining its data properties
     */
    private EstimateEngineMemory(engine: unknown): number {
        if (!engine || typeof engine !== 'object') return 0;

        let totalBytes = 0;

        // Check for _dataMap (BaseEngine pattern)
        const engineObj = engine as Record<string, unknown>;
        if ('_dataMap' in engineObj) {
            const dataMap = engineObj._dataMap as Map<string, { data: unknown[] }>;
            if (dataMap && dataMap instanceof Map) {
                for (const [key, value] of dataMap) {
                    if (value && Array.isArray(value.data)) {
                        totalBytes += this.EstimateArraySize(value.data);
                    }
                }
            }
        }

        // Check for Configs (BaseEngine pattern)
        if ('Configs' in engineObj && Array.isArray(engineObj.Configs)) {
            const configs = engineObj.Configs as Array<{ PropertyName: string }>;
            for (const config of configs) {
                const propName = config.PropertyName;
                if (propName && propName in engineObj) {
                    const propValue = engineObj[propName];
                    if (Array.isArray(propValue)) {
                        totalBytes += this.EstimateArraySize(propValue);
                    }
                }
            }
        }

        return totalBytes;
    }

    /**
     * Count the number of data items in an engine
     */
    private CountEngineItems(engine: unknown): number {
        if (!engine || typeof engine !== 'object') return 0;

        let totalItems = 0;
        const engineObj = engine as Record<string, unknown>;

        // Check for _dataMap (BaseEngine pattern)
        if ('_dataMap' in engineObj) {
            const dataMap = engineObj._dataMap as Map<string, { data: unknown[] }>;
            if (dataMap && dataMap instanceof Map) {
                for (const [key, value] of dataMap) {
                    if (value && Array.isArray(value.data)) {
                        totalItems += value.data.length;
                    }
                }
            }
        }

        return totalItems;
    }

    /**
     * Estimate the size of an array in bytes using a fast heuristic.
     * Avoids JSON.stringify which blocks the event loop and is slow on large objects.
     *
     * This uses a sampling approach: estimate based on first few items and extrapolate.
     */
    private EstimateArraySize(arr: unknown[]): number {
        if (arr.length === 0) return 0;

        // For very small arrays, we can measure them directly
        if (arr.length <= 3) {
            return this.EstimateSingleItemSize(arr[0]) * arr.length;
        }

        // For larger arrays, sample first few items and extrapolate
        const sampleSize = Math.min(3, arr.length);
        let sampleTotal = 0;
        for (let i = 0; i < sampleSize; i++) {
            sampleTotal += this.EstimateSingleItemSize(arr[i]);
        }
        const avgItemSize = sampleTotal / sampleSize;
        return Math.round(avgItemSize * arr.length);
    }

    /**
     * Estimate size of a single item without using JSON.stringify
     */
    private EstimateSingleItemSize(item: unknown): number {
        if (item === null || item === undefined) return 8;

        const type = typeof item;
        switch (type) {
            case 'string':
                return (item as string).length * 2;
            case 'number':
                return 8;
            case 'boolean':
                return 4;
            case 'object': {
                // For BaseEntity objects, use GetAll() to get plain field values
                // This avoids serializing methods and internal properties
                let obj: Record<string, unknown>;
                if (item instanceof BaseEntity) {
                    obj = item.GetAll();
                } else {
                    obj = item as Record<string, unknown>;
                }

                const keys = Object.keys(obj);
                // Estimate: key name size + ~50 bytes per property on average
                let size = 0;
                for (const key of keys) {
                    size += key.length * 2 + 50;
                }
                return Math.max(size, 200); // Minimum 200 bytes per object
            }
            default:
                return 100; // Default estimate for other types
        }
    }
}
