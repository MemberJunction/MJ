import { BaseSingleton, GetGlobalObjectStore, WarningManager } from '@memberjunction/global';
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
     * Cache of estimated bytes per row for each entity type.
     * This avoids re-sampling the same entity type multiple times during a session.
     */
    private _entitySizeCache: Map<string, number> = new Map();

    /**
     * Tracks which engines have loaded which entities.
     * Key: entity name, Value: Set of engine class names
     */
    private _entityLoadTracking: Map<string, Set<string>> = new Map();

    /**
     * Tracks which engine instances have already recorded their entity loads.
     * Uses WeakSet so engine instances can be garbage collected when no longer in use.
     * This prevents false positive warnings when a subclass and base class share the same singleton.
     */
    private _recordedEngineInstances: WeakSet<object> = new WeakSet();

    /**
     * Returns the singleton instance of BaseEngineRegistry
     */
    public static get Instance(): BaseEngineRegistry {
        return super.getInstance<BaseEngineRegistry>();
    }

    protected constructor() {
        super();
        // Register this instance in the global store for TelemetryManager access
        // This allows TelemetryAnalyzers to query loaded entities without circular dependencies
        const g = GetGlobalObjectStore();
        if (g) {
            g.__MJ_ENGINE_REGISTRY__ = {
                GetEntityLoadTracking: () => this.GetEntityLoadTrackingMap()
            };
        }
    }

    /**
     * Returns the entity load tracking data as a Map suitable for TelemetryAnalyzerContext.
     * Key: entity name, Value: array of engine class names that have loaded this entity.
     */
    public GetEntityLoadTrackingMap(): Map<string, string[]> {
        const result = new Map<string, string[]>();
        for (const [entityName, engines] of this._entityLoadTracking) {
            result.set(entityName, Array.from(engines));
        }
        return result;
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
     * Default bytes per row when we can't sample (fallback)
     */
    private static readonly DEFAULT_BYTES_PER_ROW = 500;

    /**
     * Estimate the size of an array in bytes by sampling the first row.
     * Uses a cache to avoid re-sampling the same entity type multiple times.
     */
    private EstimateArraySize(arr: unknown[]): number {
        if (arr.length === 0) return 0;

        const firstItem = arr[0];
        const bytesPerRow = this.GetBytesPerRow(firstItem);
        return arr.length * bytesPerRow;
    }

    /**
     * Get the estimated bytes per row for an item, using cache when possible.
     */
    private GetBytesPerRow(item: unknown): number {
        if (!item || typeof item !== 'object') {
            return BaseEngineRegistry.DEFAULT_BYTES_PER_ROW;
        }

        // Try to get entity name for caching
        let entityName: string | null = null;
        if (item instanceof BaseEntity) {
            entityName = item.EntityInfo?.Name || null;
        }

        // Check cache first
        if (entityName && this._entitySizeCache.has(entityName)) {
            return this._entitySizeCache.get(entityName)!;
        }

        // Sample this item to estimate size
        const estimatedSize = this.SampleItemSize(item);

        // Cache the result if we have an entity name
        if (entityName) {
            this._entitySizeCache.set(entityName, estimatedSize);
        }

        return estimatedSize;
    }

    /**
     * Sample a single item to estimate its size in bytes.
     * For BaseEntity objects, uses GetAll() to get plain field values.
     */
    private SampleItemSize(item: unknown): number {
        if (!item || typeof item !== 'object') {
            return BaseEngineRegistry.DEFAULT_BYTES_PER_ROW;
        }

        try {
            // Get plain object representation
            let obj: Record<string, unknown>;
            if (item instanceof BaseEntity) {
                obj = item.GetAll();
            } else {
                obj = item as Record<string, unknown>;
            }

            // Sum up the size of all values
            let totalBytes = 0;
            for (const key of Object.keys(obj)) {
                // Key name size (UTF-16)
                totalBytes += key.length * 2;
                // Value size
                totalBytes += this.EstimateValueSize(obj[key]);
            }

            // Minimum of 100 bytes per object for overhead
            return Math.max(totalBytes, 100);
        } catch {
            return BaseEngineRegistry.DEFAULT_BYTES_PER_ROW;
        }
    }

    /**
     * Estimate the size of a single value in bytes.
     */
    private EstimateValueSize(value: unknown): number {
        if (value === null || value === undefined) {
            return 8;
        }

        switch (typeof value) {
            case 'string':
                return (value as string).length * 2; // UTF-16
            case 'number':
                return 8;
            case 'boolean':
                return 4;
            case 'object':
                if (value instanceof Date) {
                    return 8;
                }
                // For nested objects/arrays, use a rough estimate
                return 50;
            default:
                return 8;
        }
    }

    /**
     * Clear the entity size cache (useful if schema changes)
     */
    public ClearSizeCache(): void {
        this._entitySizeCache.clear();
    }

    // ========================================================================
    // ENTITY LOAD TRACKING - Detects redundant loading across engines
    // ========================================================================

    /**
     * Records that an engine has loaded a specific entity.
     * If another engine has already loaded this entity, a warning is queued.
     *
     * @param engineClassName - The class name of the engine loading the entity
     * @param entityName - The name of the entity being loaded
     */
    public RecordEntityLoad(engineClassName: string, entityName: string): void {
        if (!this._entityLoadTracking.has(entityName)) {
            this._entityLoadTracking.set(entityName, new Set());
        }

        const engines = this._entityLoadTracking.get(entityName)!;
        engines.add(engineClassName);

        // If 2+ engines have loaded this entity, emit a warning
        if (engines.size >= 2) {
            WarningManager.Instance.RecordRedundantLoadWarning(
                entityName,
                Array.from(engines)
            );
        }
    }

    /**
     * Records that an engine has loaded multiple entities.
     * Convenience method for batch recording.
     * Uses instance identity to prevent false positives when a subclass and base class
     * share the same singleton (e.g., AIEngine extends AIEngineBase).
     *
     * @param engine - The engine instance that loaded the entities
     * @param entityNames - Array of entity names being loaded
     */
    public RecordEntityLoads(engine: object, entityNames: string[]): void {
        // Skip if this exact instance has already recorded its entity loads
        // This prevents false positive warnings for inheritance hierarchies
        // where AIEngine.Instance === AIEngineBase.Instance (same singleton)
        if (this._recordedEngineInstances.has(engine)) {
            return;
        }
        this._recordedEngineInstances.add(engine);

        const engineClassName = engine.constructor.name;
        for (const entityName of entityNames) {
            this.RecordEntityLoad(engineClassName, entityName);
        }
    }

    /**
     * Gets a list of engines that have loaded a specific entity.
     *
     * @param entityName - The name of the entity
     * @returns Array of engine class names that have loaded this entity
     */
    public GetEnginesLoadingEntity(entityName: string): string[] {
        const engines = this._entityLoadTracking.get(entityName);
        return engines ? Array.from(engines) : [];
    }

    /**
     * Gets all entities that have been loaded by multiple engines.
     *
     * @returns Map of entity name to array of engine class names
     */
    public GetRedundantlyLoadedEntities(): Map<string, string[]> {
        const result = new Map<string, string[]>();
        for (const [entityName, engines] of this._entityLoadTracking) {
            if (engines.size >= 2) {
                result.set(entityName, Array.from(engines));
            }
        }
        return result;
    }

    /**
     * Clears entity load tracking data.
     * Useful for testing or when engines are being reconfigured.
     */
    public ClearEntityLoadTracking(): void {
        this._entityLoadTracking.clear();
    }
}
