/**
 * TelemetryManager - Lightweight instrumentation system for tracking operation performance,
 * detecting patterns, and surfacing optimization opportunities.
 *
 * Features:
 * - Session-level event tracking for RunView, RunQuery, Engine, AI, Cache operations
 * - Pattern detection for identifying duplicate calls and optimization opportunities
 * - Pluggable analyzer system for custom analysis rules
 * - WarningManager integration for debounced console output
 * - Configurable via local storage for per-client settings
 * - Strongly-typed parameter interfaces for each telemetry category
 *
 * @example
 * ```typescript
 * const tm = TelemetryManager.Instance;
 *
 * // Enable telemetry
 * tm.SetEnabled(true);
 *
 * // Track a RunView operation with typed params
 * const eventId = tm.StartEvent('RunView', 'ProviderBase.RunView', {
 *     EntityName: 'Users',
 *     ExtraFilter: 'IsActive = 1',
 *     ResultType: 'entity_object'
 * });
 * // ... perform operation
 * tm.EndEvent(eventId, { cacheHit: false, resultCount: 50 });
 *
 * // Get patterns for analysis
 * const patterns = tm.GetPatterns({ category: 'RunView', minCount: 2 });
 * ```
 */

import { BaseSingleton, GetGlobalObjectStore, WarningManager } from '@memberjunction/global';

// ============================================================================
// TYPES - Using union types per MJ style guide
// ============================================================================

/**
 * Telemetry detail levels - controls what information is captured
 */
export type TelemetryLevel = 'off' | 'basic' | 'standard' | 'verbose' | 'debug';

/**
 * Numeric mapping for level comparisons
 */
export const TelemetryLevelValue: Record<TelemetryLevel, number> = {
    'off': 0,
    'basic': 1,        // Timing only (operation, elapsed ms)
    'standard': 2,     // Timing + key params (entity, filter, etc.)
    'verbose': 3,      // + stack traces (cleaned)
    'debug': 4         // + memory snapshots before/after
};

/**
 * Categories of operations that can be tracked
 */
export type TelemetryCategory =
    | 'RunView'
    | 'RunQuery'
    | 'Engine'
    | 'Network'
    | 'AI'
    | 'Cache'
    | 'Custom';

/**
 * Severity levels for telemetry insights
 */
export type TelemetryInsightSeverity = 'info' | 'warning' | 'optimization';

// ============================================================================
// STRONGLY-TYPED PARAMETER INTERFACES
// ============================================================================

/**
 * Result type for RunView operations
 */
export type RunViewResultType = 'simple' | 'entity_object' | 'count_only';

/**
 * Telemetry params for a single RunView operation.
 * Maps to core properties of RunViewParams.
 */
export interface TelemetryRunViewParams {
    /** Entity name being queried */
    EntityName?: string;
    /** View ID if running a saved view */
    ViewID?: string;
    /** View name if running a saved view */
    ViewName?: string;
    /** SQL WHERE clause filter */
    ExtraFilter?: string;
    /** SQL ORDER BY clause */
    OrderBy?: string;
    /** Type of result to return */
    ResultType?: RunViewResultType;
    /** Maximum rows to return */
    MaxRows?: number;
    /** Starting row for pagination */
    StartRow?: number;
    /** Whether to cache locally */
    CacheLocal?: boolean;
    /** Internal marker for engine-initiated calls */
    _fromEngine?: boolean;
    /** Whether result was served from cache (set after operation completes) */
    cacheHit?: boolean;
}

/**
 * Telemetry params for batch RunViews operation.
 * Used when multiple views are executed in a single call.
 */
export interface TelemetryRunViewsBatchParams {
    /** Number of views in the batch */
    BatchSize: number;
    /** Entity names being queried in the batch */
    Entities: string[];
    /** Internal marker for engine-initiated calls */
    _fromEngine?: boolean;
}

/**
 * Telemetry params for a single RunQuery operation.
 * Maps to core properties of RunQueryParams.
 */
export interface TelemetryRunQueryParams {
    /** Query ID if running by ID */
    QueryID?: string;
    /** Query name if running by name */
    QueryName?: string;
    /** Category path for the query */
    CategoryPath?: string;
    /** Category ID for the query */
    CategoryID?: string;
    /** Maximum rows to return */
    MaxRows?: number;
    /** Starting row for pagination */
    StartRow?: number;
    /** Whether to cache locally */
    CacheLocal?: boolean;
    /** Whether parameters were provided */
    HasParameters?: boolean;
    /** Whether result was served from cache (set after operation completes) */
    cacheHit?: boolean;
}

/**
 * Telemetry params for batch RunQueries operation.
 * Used when multiple queries are executed in a single call.
 */
export interface TelemetryRunQueriesBatchParams {
    /** Number of queries in the batch */
    BatchSize: number;
    /** Query names/IDs in the batch */
    Queries: string[];
}

/**
 * Engine operation types
 */
export type EngineOperationType = 'Config' | 'Load' | 'AdditionalLoading' | 'Refresh' | 'initial' | 'refresh';

/**
 * Telemetry params for Engine operations.
 * Tracks engine lifecycle and loading events.
 */
export interface TelemetryEngineParams {
    /** Name of the engine class */
    engineClass: string;
    /** Type of engine operation */
    operation: EngineOperationType;
    /** Number of entities loaded (if applicable) */
    entityCount?: number;
    /** Number of configs being loaded */
    configCount?: number;
    /** Entity names being loaded */
    entityNames?: string[];
    /** Dataset names being loaded */
    datasetNames?: string[];
}

/**
 * Telemetry params for AI operations.
 * Tracks AI model invocations and token usage.
 */
export interface TelemetryAIParams {
    /** AI Model ID */
    modelID?: string;
    /** AI Model name */
    modelName?: string;
    /** Prompt ID if using a saved prompt */
    promptID?: string;
    /** Prompt name if using a saved prompt */
    promptName?: string;
    /** Number of input tokens */
    inputTokens?: number;
    /** Number of output tokens */
    outputTokens?: number;
    /** AI operation type */
    operationType?: 'chat' | 'embedding' | 'classification' | 'summary';
}

/**
 * Cache operation types
 */
export type CacheOperationType = 'get' | 'set' | 'invalidate' | 'validate';

/**
 * Cache status results
 */
export type CacheStatusType = 'hit' | 'miss' | 'stale' | 'current';

/**
 * Telemetry params for Cache operations.
 * Tracks cache hits, misses, and validation.
 */
export interface TelemetryCacheParams {
    /** Type of cache (local or server) */
    cacheType: 'local' | 'server';
    /** Cache operation being performed */
    operation: CacheOperationType;
    /** Entity name (if applicable) */
    entityName?: string;
    /** Cache fingerprint for identification */
    fingerprint?: string;
    /** Result status of the cache operation */
    status?: CacheStatusType;
}

/**
 * Telemetry params for Network operations.
 * Tracks API calls and network requests.
 */
export interface TelemetryNetworkParams {
    /** HTTP method */
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    /** Request URL or endpoint */
    url?: string;
    /** Response status code */
    statusCode?: number;
    /** Request size in bytes */
    requestSize?: number;
    /** Response size in bytes */
    responseSize?: number;
}

/**
 * Telemetry params for Custom operations.
 * Allows arbitrary key-value pairs for custom tracking.
 */
export interface TelemetryCustomParams {
    /** Custom operation name */
    operationName?: string;
    /** Any additional custom data */
    [key: string]: unknown;
}

/**
 * Union type of all telemetry param types.
 * Used for type-safe fingerprint generation and event creation.
 */
export type TelemetryParamsUnion =
    | TelemetryRunViewParams
    | TelemetryRunViewsBatchParams
    | TelemetryRunQueryParams
    | TelemetryRunQueriesBatchParams
    | TelemetryEngineParams
    | TelemetryAIParams
    | TelemetryCacheParams
    | TelemetryNetworkParams
    | TelemetryCustomParams;

/**
 * Map of category to its param type for type inference
 */
export interface TelemetryCategoryParamsMap {
    RunView: TelemetryRunViewParams | TelemetryRunViewsBatchParams;
    RunQuery: TelemetryRunQueryParams | TelemetryRunQueriesBatchParams;
    Engine: TelemetryEngineParams;
    AI: TelemetryAIParams;
    Cache: TelemetryCacheParams;
    Network: TelemetryNetworkParams;
    Custom: TelemetryCustomParams;
}

// ============================================================================
// CONFIGURATION INTERFACES
// ============================================================================

/**
 * Configuration for the telemetry system
 */
export interface TelemetrySettings {
    /** Global on/off switch */
    enabled: boolean;
    /** Default detail level for all categories */
    level: TelemetryLevel;
    /** Per-category overrides */
    categoryOverrides: Partial<Record<TelemetryCategory, {
        enabled: boolean;
        level?: TelemetryLevel;
    }>>;
    /** Auto-trim settings for memory management */
    autoTrim: {
        enabled: boolean;
        maxEvents?: number;
        maxAgeMs?: number;
    };
    /** Duplicate detection settings */
    duplicateDetection: {
        enabled: boolean;
        windowMs: number;
    };
    /** Analyzer settings */
    analyzers: {
        enabled: boolean;
        dedupeWindowMs: number;
    };
}

/**
 * Memory snapshot for detailed tracking
 */
export interface MemorySnapshot {
    heapUsed: number;
    heapTotal: number;
    timestamp: number;
}

/**
 * A single telemetry event
 */
export interface TelemetryEvent<T extends TelemetryParamsUnion = TelemetryParamsUnion> {
    /** Unique event ID */
    id: string;
    /** Category of operation */
    category: TelemetryCategory;
    /** Specific operation name (e.g., 'RunView.Execute') */
    operation: string;
    /** Hash for duplicate detection */
    fingerprint: string;

    // Timing
    startTime: number;
    endTime?: number;
    elapsedMs?: number;

    // Context
    userId?: string;
    params: T;
    tags?: string[];

    // Optional detailed info (based on level)
    stackTrace?: string;
    memoryBefore?: MemorySnapshot;
    memoryAfter?: MemorySnapshot;

    // Hierarchy
    parentEventId?: string;
}

/**
 * Aggregated pattern for a specific operation fingerprint
 */
export interface TelemetryPattern {
    fingerprint: string;
    category: TelemetryCategory;
    operation: string;
    sampleParams: TelemetryParamsUnion;

    // Aggregates
    count: number;
    totalElapsedMs: number;
    avgElapsedMs: number;
    minElapsedMs: number;
    maxElapsedMs: number;

    // Call site tracking
    callerLocations: Map<string, number>;

    // Timing
    firstSeen: number;
    lastSeen: number;
    windowStartTime: number;
}

/**
 * Insight generated by an analyzer
 */
export interface TelemetryInsight {
    id: string;
    severity: TelemetryInsightSeverity;
    analyzerName: string;
    category: string;
    title: string;
    message: string;
    suggestion: string;
    relatedEventIds: string[];
    entityName?: string;
    metadata?: Record<string, unknown>;
    timestamp: number;
}

/**
 * Context provided to analyzers
 */
export interface TelemetryAnalyzerContext {
    /** Recent events (last N or time window) */
    recentEvents: TelemetryEvent[];
    /** Aggregated patterns */
    patterns: Map<string, TelemetryPattern>;
    /** Access to engine registry for cross-referencing */
    getEngineLoadedEntities(): Map<string, string[]>;
}

/**
 * Interface for pluggable analyzers
 */
export interface TelemetryAnalyzer {
    /** Unique name for this analyzer */
    name: string;
    /** Category for grouping warnings in UI */
    category: string;
    /** Analyze an event and optionally return an insight */
    analyze(event: TelemetryEvent, context: TelemetryAnalyzerContext): TelemetryInsight | null;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if params represent a batch RunViews operation
 */
export function isBatchRunViewParams(params: TelemetryParamsUnion): params is TelemetryRunViewsBatchParams {
    return typeof params === 'object' &&
           params !== null &&
           'Entities' in params &&
           Array.isArray((params as TelemetryRunViewsBatchParams).Entities);
}

/**
 * Type guard to check if params represent a single RunView operation
 */
export function isSingleRunViewParams(params: TelemetryParamsUnion): params is TelemetryRunViewParams {
    return typeof params === 'object' &&
           params !== null &&
           !isBatchRunViewParams(params) &&
           ('EntityName' in params || 'ViewID' in params || 'ViewName' in params);
}

/**
 * Type guard to check if params represent a single RunQuery operation
 */
export function isSingleRunQueryParams(params: TelemetryParamsUnion): params is TelemetryRunQueryParams {
    return typeof params === 'object' &&
           params !== null &&
           !isBatchRunQueryParams(params) &&
           ('QueryID' in params || 'QueryName' in params);
}

/**
 * Type guard to check if params represent a batch RunQueries operation
 */
export function isBatchRunQueryParams(params: TelemetryParamsUnion): params is TelemetryRunQueriesBatchParams {
    return typeof params === 'object' &&
           params !== null &&
           'Queries' in params &&
           Array.isArray((params as TelemetryRunQueriesBatchParams).Queries);
}

/**
 * Type guard to check if params represent an Engine operation
 */
export function isEngineParams(params: TelemetryParamsUnion): params is TelemetryEngineParams {
    return typeof params === 'object' &&
           params !== null &&
           'engineClass' in params &&
           'operation' in params;
}

/**
 * Type guard to check if params represent an AI operation
 */
export function isAIParams(params: TelemetryParamsUnion): params is TelemetryAIParams {
    return typeof params === 'object' &&
           params !== null &&
           ('modelID' in params || 'modelName' in params || 'promptID' in params);
}

/**
 * Type guard to check if params represent a Cache operation
 */
export function isCacheParams(params: TelemetryParamsUnion): params is TelemetryCacheParams {
    return typeof params === 'object' &&
           params !== null &&
           'cacheType' in params &&
           'operation' in params;
}

/**
 * Type guard to check if params represent a Network operation
 */
export function isNetworkParams(params: TelemetryParamsUnion): params is TelemetryNetworkParams {
    return typeof params === 'object' &&
           params !== null &&
           ('method' in params || 'url' in params || 'statusCode' in params);
}

// ============================================================================
// BUILT-IN ANALYZERS
// ============================================================================

/**
 * Detects when RunView is called for an entity already loaded by an engine.
 * Suggests using the engine's cached data instead.
 *
 * Note: Skips RunView calls marked with _fromEngine=true, as these are
 * engine-initiated calls (e.g., BaseEngine loading its config entities).
 */
class EngineOverlapAnalyzer implements TelemetryAnalyzer {
    name = 'EngineOverlapAnalyzer';
    category = 'Optimization';

    analyze(event: TelemetryEvent, context: TelemetryAnalyzerContext): TelemetryInsight | null {
        if (event.category !== 'RunView') return null;

        const params = event.params as TelemetryRunViewParams | TelemetryRunViewsBatchParams;

        // Skip engine-initiated RunView calls to avoid false positives
        if (params._fromEngine) return null;

        // Only check single RunView operations, not batches
        if (!isSingleRunViewParams(params)) return null;

        const entityName = params.EntityName;
        if (!entityName) return null;

        const loadedEntities = context.getEngineLoadedEntities();
        const engines = loadedEntities.get(entityName);

        if (engines && engines.length > 0) {
            return {
                id: `engine-overlap-${event.id}`,
                severity: 'optimization',
                analyzerName: this.name,
                category: this.category,
                title: 'Entity Already in Engine',
                entityName,
                message: `RunView for "${entityName}" called, but this entity is already loaded by: ${engines.join(', ')}`,
                suggestion: `Consider using ${engines[0]} cached data instead of a separate RunView call`,
                relatedEventIds: [event.id],
                timestamp: Date.now()
            };
        }
        return null;
    }
}

/**
 * Detects when the same entity is queried multiple times with different filters.
 * Suggests creating an engine to centralize access.
 */
class SameEntityMultipleCallsAnalyzer implements TelemetryAnalyzer {
    name = 'SameEntityMultipleCallsAnalyzer';
    category = 'Optimization';

    analyze(event: TelemetryEvent, context: TelemetryAnalyzerContext): TelemetryInsight | null {
        if (event.category !== 'RunView') return null;

        const params = event.params as TelemetryRunViewParams | TelemetryRunViewsBatchParams;
        if (!isSingleRunViewParams(params)) return null;

        const entityName = params.EntityName;
        if (!entityName) return null;

        // Count distinct RunViews for same entity in recent events
        const entityEvents = context.recentEvents.filter(e => {
            if (e.category !== 'RunView') return false;
            const p = e.params as TelemetryRunViewParams | TelemetryRunViewsBatchParams;
            return isSingleRunViewParams(p) && p.EntityName === entityName;
        });

        // Get unique fingerprints (different filter/orderBy combinations)
        const uniqueFingerprints = new Set(entityEvents.map(e => e.fingerprint));

        if (uniqueFingerprints.size >= 3) {
            return {
                id: `multi-call-${entityName}-${Date.now()}`,
                severity: 'optimization',
                analyzerName: this.name,
                category: this.category,
                title: 'Multiple Queries for Same Entity',
                entityName,
                message: `Entity "${entityName}" queried ${entityEvents.length} times with ${uniqueFingerprints.size} different filter combinations`,
                suggestion: `Consider creating a dedicated engine to load and cache ${entityName} data centrally`,
                relatedEventIds: entityEvents.map(e => e.id),
                metadata: {
                    totalCalls: entityEvents.length,
                    uniqueVariations: uniqueFingerprints.size
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
}

/**
 * Detects sequential RunView calls that could be batched with RunViews.
 */
class ParallelizationOpportunityAnalyzer implements TelemetryAnalyzer {
    name = 'ParallelizationOpportunityAnalyzer';
    category = 'Performance';

    private readonly SEQUENCE_THRESHOLD_MS = 100;

    analyze(event: TelemetryEvent, context: TelemetryAnalyzerContext): TelemetryInsight | null {
        if (event.category !== 'RunView') return null;

        // Find RunView events that completed just before this one started
        const recentSequential = context.recentEvents.filter(e => {
            if (e.category !== 'RunView') return false;
            if (e.id === event.id) return false;
            if (!e.endTime) return false;
            // Check if previous event ended shortly before this one started
            const gap = event.startTime - e.endTime;
            return gap >= 0 && gap < this.SEQUENCE_THRESHOLD_MS;
        });

        if (recentSequential.length >= 2) {
            const allEvents = [...recentSequential, event];
            const entities = allEvents.map(e => {
                const p = e.params as TelemetryRunViewParams | TelemetryRunViewsBatchParams;
                return isSingleRunViewParams(p) ? p.EntityName : 'batch';
            });

            return {
                id: `parallel-${event.id}`,
                severity: 'optimization',
                analyzerName: this.name,
                category: this.category,
                title: 'Sequential Queries Could Be Parallelized',
                message: `${allEvents.length} RunView calls executed sequentially`,
                suggestion: `Use RunViews (batch) to execute these queries in parallel for better performance`,
                relatedEventIds: allEvents.map(e => e.id),
                metadata: { entities },
                timestamp: Date.now()
            };
        }
        return null;
    }
}

/**
 * Detects exact duplicate RunView calls (same fingerprint).
 */
class DuplicateRunViewAnalyzer implements TelemetryAnalyzer {
    name = 'DuplicateRunViewAnalyzer';
    category = 'Redundancy';

    analyze(event: TelemetryEvent, context: TelemetryAnalyzerContext): TelemetryInsight | null {
        if (event.category !== 'RunView') return null;

        const pattern = context.patterns.get(event.fingerprint);
        if (pattern && pattern.count >= 2) {
            const params = event.params as TelemetryRunViewParams | TelemetryRunViewsBatchParams;

            // Handle both single RunView (EntityName) and batch RunViews (Entities array)
            const entityName = isSingleRunViewParams(params)
                ? params.EntityName || 'Unknown'
                : isBatchRunViewParams(params)
                    ? params.Entities.join(', ')
                    : 'Unknown';

            return {
                id: `duplicate-${event.fingerprint}-${Date.now()}`,
                severity: 'warning',
                analyzerName: this.name,
                category: this.category,
                title: 'Duplicate RunView Detected',
                entityName,
                message: `Identical RunView (${entityName}, same filter/orderBy) called ${pattern.count} times`,
                suggestion: `Cache the result or use an engine to avoid redundant database queries`,
                relatedEventIds: [event.id],
                metadata: {
                    callCount: pattern.count,
                    totalTimeMs: pattern.totalElapsedMs,
                    avgTimeMs: pattern.avgElapsedMs
                },
                timestamp: Date.now()
            };
        }
        return null;
    }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TELEMETRY_SETTINGS_KEY = '__MJ_TELEMETRY_SETTINGS__';

const DEFAULT_SETTINGS: TelemetrySettings = {
    enabled: false,
    level: 'standard',
    categoryOverrides: {},
    autoTrim: {
        enabled: true,
        maxEvents: 10000,
        maxAgeMs: 30 * 60 * 1000  // 30 minutes
    },
    duplicateDetection: {
        enabled: true,
        windowMs: 60 * 1000  // 1 minute
    },
    analyzers: {
        enabled: true,
        dedupeWindowMs: 30000  // 30 seconds
    }
};

// ============================================================================
// TELEMETRY MANAGER
// ============================================================================

/**
 * Singleton manager for telemetry tracking and analysis.
 *
 * Provides:
 * - Event recording for various operation types with strongly-typed parameters
 * - Pattern detection for identifying optimization opportunities
 * - Pluggable analyzer system for custom rules
 * - Integration with WarningManager for console output
 */
export class TelemetryManager extends BaseSingleton<TelemetryManager> {
    private _settings: TelemetrySettings;
    private _events: TelemetryEvent[] = [];
    private _patterns: Map<string, TelemetryPattern> = new Map();
    private _activeEvents: Map<string, TelemetryEvent> = new Map();

    // Analyzer infrastructure
    private _analyzers: TelemetryAnalyzer[] = [];
    private _insights: TelemetryInsight[] = [];
    private _insightDedupeWindow: Map<string, number> = new Map();

    /**
     * Returns the singleton instance of TelemetryManager
     */
    public static get Instance(): TelemetryManager {
        return super.getInstance<TelemetryManager>();
    }

    protected constructor() {
        super();
        this._settings = this.loadSettings();
        this.registerBuiltInAnalyzers();
    }

    // ========== CONFIGURATION ==========

    /**
     * Get a copy of current settings
     */
    public get Settings(): TelemetrySettings {
        return { ...this._settings };
    }

    /**
     * Update telemetry settings
     */
    public UpdateSettings(settings: Partial<TelemetrySettings>): void {
        this._settings = { ...this._settings, ...settings };
        this.saveSettings();
    }

    /**
     * Check if telemetry is globally enabled
     */
    public get IsEnabled(): boolean {
        return this._settings.enabled;
    }

    /**
     * Enable or disable telemetry globally
     */
    public SetEnabled(enabled: boolean): void {
        this._settings.enabled = enabled;
        this.saveSettings();
    }

    /**
     * Check if a specific category is enabled
     */
    public IsCategoryEnabled(category: TelemetryCategory): boolean {
        if (!this._settings.enabled) return false;
        const override = this._settings.categoryOverrides[category];
        return override?.enabled ?? true;
    }

    /**
     * Get the telemetry level for a specific category
     */
    public GetLevelForCategory(category: TelemetryCategory): TelemetryLevel {
        const override = this._settings.categoryOverrides[category];
        return override?.level ?? this._settings.level;
    }

    /**
     * Get the numeric value for a telemetry level
     */
    public GetLevelValue(level: TelemetryLevel): number {
        return TelemetryLevelValue[level];
    }

    // ========== EVENT RECORDING WITH STRONG TYPING ==========

    /**
     * Start tracking a RunView event
     */
    public StartEvent(
        category: 'RunView',
        operation: string,
        params: TelemetryRunViewParams | TelemetryRunViewsBatchParams,
        userId?: string
    ): string | null;

    /**
     * Start tracking a RunQuery event
     */
    public StartEvent(
        category: 'RunQuery',
        operation: string,
        params: TelemetryRunQueryParams | TelemetryRunQueriesBatchParams,
        userId?: string
    ): string | null;

    /**
     * Start tracking an Engine event
     */
    public StartEvent(
        category: 'Engine',
        operation: string,
        params: TelemetryEngineParams,
        userId?: string
    ): string | null;

    /**
     * Start tracking an AI event
     */
    public StartEvent(
        category: 'AI',
        operation: string,
        params: TelemetryAIParams,
        userId?: string
    ): string | null;

    /**
     * Start tracking a Cache event
     */
    public StartEvent(
        category: 'Cache',
        operation: string,
        params: TelemetryCacheParams,
        userId?: string
    ): string | null;

    /**
     * Start tracking a Network event
     */
    public StartEvent(
        category: 'Network',
        operation: string,
        params: TelemetryNetworkParams,
        userId?: string
    ): string | null;

    /**
     * Start tracking a Custom event
     */
    public StartEvent(
        category: 'Custom',
        operation: string,
        params: TelemetryCustomParams,
        userId?: string
    ): string | null;

    /**
     * Start tracking an event. Returns event ID for later completion, or null if disabled.
     * Uses strongly-typed params based on the category.
     */
    public StartEvent<C extends TelemetryCategory>(
        category: C,
        operation: string,
        params: TelemetryCategoryParamsMap[C],
        userId?: string
    ): string | null {
        if (!this.IsCategoryEnabled(category)) return null;

        const level = this.GetLevelForCategory(category);
        const levelValue = this.GetLevelValue(level);

        const event: TelemetryEvent = {
            id: this.generateId(),
            category,
            operation,
            fingerprint: this.generateFingerprint(category, params),
            startTime: this.getTimestamp(),
            userId,
            params: levelValue >= TelemetryLevelValue['standard'] ? params : ({} as TelemetryParamsUnion),
            stackTrace: levelValue >= TelemetryLevelValue['verbose'] ? this.captureStackTrace() : undefined,
            memoryBefore: levelValue >= TelemetryLevelValue['debug'] ? this.captureMemory() : undefined
        };

        this._activeEvents.set(event.id, event);
        return event.id;
    }

    /**
     * Complete an event that was started with StartEvent
     * @param eventId - The event ID returned from StartEvent
     * @param additionalParams - Optional additional parameters to merge into the event's params
     *                           Useful for adding context like cacheHit, resultCount, etc.
     */
    public EndEvent(eventId: string | null, additionalParams?: Record<string, unknown>): TelemetryEvent | null {
        if (!eventId) return null;

        const event = this._activeEvents.get(eventId);
        if (!event) return null;

        this._activeEvents.delete(eventId);

        // Merge additional params if provided
        if (additionalParams) {
            event.params = { ...event.params, ...additionalParams } as TelemetryParamsUnion;
        }

        event.endTime = this.getTimestamp();
        event.elapsedMs = event.endTime - event.startTime;

        const level = this.GetLevelForCategory(event.category);
        if (this.GetLevelValue(level) >= TelemetryLevelValue['debug']) {
            event.memoryAfter = this.captureMemory();
        }

        this._events.push(event);
        this.updatePattern(event);
        this.runAnalyzers(event);
        this.trimIfNeeded();

        return event;
    }

    /**
     * Record a completed RunView event directly
     */
    public RecordEvent(
        category: 'RunView',
        operation: string,
        params: TelemetryRunViewParams | TelemetryRunViewsBatchParams,
        elapsedMs: number,
        userId?: string
    ): void;

    /**
     * Record a completed RunQuery event directly
     */
    public RecordEvent(
        category: 'RunQuery',
        operation: string,
        params: TelemetryRunQueryParams | TelemetryRunQueriesBatchParams,
        elapsedMs: number,
        userId?: string
    ): void;

    /**
     * Record a completed Engine event directly
     */
    public RecordEvent(
        category: 'Engine',
        operation: string,
        params: TelemetryEngineParams,
        elapsedMs: number,
        userId?: string
    ): void;

    /**
     * Record a completed AI event directly
     */
    public RecordEvent(
        category: 'AI',
        operation: string,
        params: TelemetryAIParams,
        elapsedMs: number,
        userId?: string
    ): void;

    /**
     * Record a completed Cache event directly
     */
    public RecordEvent(
        category: 'Cache',
        operation: string,
        params: TelemetryCacheParams,
        elapsedMs: number,
        userId?: string
    ): void;

    /**
     * Record a completed Network event directly
     */
    public RecordEvent(
        category: 'Network',
        operation: string,
        params: TelemetryNetworkParams,
        elapsedMs: number,
        userId?: string
    ): void;

    /**
     * Record a completed Custom event directly
     */
    public RecordEvent(
        category: 'Custom',
        operation: string,
        params: TelemetryCustomParams,
        elapsedMs: number,
        userId?: string
    ): void;

    /**
     * Convenience method for recording a completed event directly with strong typing
     */
    public RecordEvent<C extends TelemetryCategory>(
        category: C,
        operation: string,
        params: TelemetryCategoryParamsMap[C],
        elapsedMs: number,
        userId?: string
    ): void {
        if (!this.IsCategoryEnabled(category)) return;

        const level = this.GetLevelForCategory(category);
        const levelValue = this.GetLevelValue(level);
        const now = this.getTimestamp();

        const event: TelemetryEvent = {
            id: this.generateId(),
            category,
            operation,
            fingerprint: this.generateFingerprint(category, params),
            startTime: now - elapsedMs,
            endTime: now,
            elapsedMs,
            userId,
            params: levelValue >= TelemetryLevelValue['standard'] ? params : ({} as TelemetryParamsUnion),
            stackTrace: levelValue >= TelemetryLevelValue['verbose'] ? this.captureStackTrace() : undefined
        };

        this._events.push(event);
        this.updatePattern(event);
        this.runAnalyzers(event);
        this.trimIfNeeded();
    }

    // ========== PATTERN DETECTION ==========

    private updatePattern(event: TelemetryEvent): void {
        if (!this._settings.duplicateDetection.enabled) return;

        let pattern = this._patterns.get(event.fingerprint);
        const now = this.getTimestamp();

        if (!pattern) {
            pattern = {
                fingerprint: event.fingerprint,
                category: event.category,
                operation: event.operation,
                sampleParams: event.params,
                count: 0,
                totalElapsedMs: 0,
                avgElapsedMs: 0,
                minElapsedMs: Infinity,
                maxElapsedMs: 0,
                callerLocations: new Map(),
                firstSeen: now,
                lastSeen: now,
                windowStartTime: now
            };
            this._patterns.set(event.fingerprint, pattern);
        }

        // Reset window if expired
        if (now - pattern.windowStartTime > this._settings.duplicateDetection.windowMs) {
            pattern.count = 0;
            pattern.totalElapsedMs = 0;
            pattern.callerLocations.clear();
            pattern.windowStartTime = now;
        }

        // Update stats
        pattern.count++;
        pattern.lastSeen = now;
        if (event.elapsedMs != null) {
            pattern.totalElapsedMs += event.elapsedMs;
            pattern.avgElapsedMs = pattern.totalElapsedMs / pattern.count;
            pattern.minElapsedMs = Math.min(pattern.minElapsedMs, event.elapsedMs);
            pattern.maxElapsedMs = Math.max(pattern.maxElapsedMs, event.elapsedMs);
        }

        // Track call sites
        if (event.stackTrace) {
            const location = this.extractCallerLocation(event.stackTrace);
            pattern.callerLocations.set(
                location,
                (pattern.callerLocations.get(location) || 0) + 1
            );
        }
    }

    // ========== QUERIES ==========

    /**
     * Get events matching the filter criteria
     */
    public GetEvents(filter?: {
        category?: TelemetryCategory;
        operation?: string;
        minElapsedMs?: number;
        since?: number;
        limit?: number;
    }): TelemetryEvent[] {
        let results = [...this._events];

        if (filter?.category) {
            results = results.filter(e => e.category === filter.category);
        }
        if (filter?.operation) {
            results = results.filter(e => e.operation === filter.operation);
        }
        if (filter?.minElapsedMs != null) {
            results = results.filter(e => (e.elapsedMs ?? 0) >= filter.minElapsedMs!);
        }
        if (filter?.since != null) {
            results = results.filter(e => e.startTime >= filter.since!);
        }
        if (filter?.limit) {
            results = results.slice(-filter.limit);
        }

        return results;
    }

    /**
     * Get patterns matching the filter criteria
     */
    public GetPatterns(filter?: {
        category?: TelemetryCategory;
        minCount?: number;
        sortBy?: 'count' | 'totalTime' | 'avgTime';
    }): TelemetryPattern[] {
        let results = [...this._patterns.values()];

        if (filter?.category) {
            results = results.filter(p => p.category === filter.category);
        }
        if (filter?.minCount != null) {
            results = results.filter(p => p.count >= filter.minCount!);
        }

        const sortBy = filter?.sortBy ?? 'count';
        results.sort((a, b) => {
            switch (sortBy) {
                case 'count': return b.count - a.count;
                case 'totalTime': return b.totalElapsedMs - a.totalElapsedMs;
                case 'avgTime': return b.avgElapsedMs - a.avgElapsedMs;
            }
        });

        return results;
    }

    /**
     * Get patterns with duplicate calls (count >= minCount)
     */
    public GetDuplicates(minCount: number = 2): TelemetryPattern[] {
        return this.GetPatterns({ minCount, sortBy: 'count' });
    }

    /**
     * Get active events that haven't completed yet
     */
    public GetActiveEvents(): TelemetryEvent[] {
        return [...this._activeEvents.values()];
    }

    // ========== ANALYZER SYSTEM ==========

    private registerBuiltInAnalyzers(): void {
        this.RegisterAnalyzer(new EngineOverlapAnalyzer());
        this.RegisterAnalyzer(new SameEntityMultipleCallsAnalyzer());
        this.RegisterAnalyzer(new ParallelizationOpportunityAnalyzer());
        this.RegisterAnalyzer(new DuplicateRunViewAnalyzer());
    }

    /**
     * Register a custom analyzer
     */
    public RegisterAnalyzer(analyzer: TelemetryAnalyzer): void {
        this._analyzers.push(analyzer);
    }

    /**
     * Unregister an analyzer by name
     */
    public UnregisterAnalyzer(name: string): void {
        this._analyzers = this._analyzers.filter(a => a.name !== name);
    }

    /**
     * Get all registered analyzers
     */
    public GetAnalyzers(): TelemetryAnalyzer[] {
        return [...this._analyzers];
    }

    /**
     * Get insights matching the filter criteria
     */
    public GetInsights(filter?: {
        severity?: TelemetryInsightSeverity;
        category?: string;
        entityName?: string;
        limit?: number;
    }): TelemetryInsight[] {
        let results = [...this._insights];

        if (filter?.severity) {
            results = results.filter(i => i.severity === filter.severity);
        }
        if (filter?.category) {
            results = results.filter(i => i.category === filter.category);
        }
        if (filter?.entityName) {
            results = results.filter(i => i.entityName === filter.entityName);
        }
        if (filter?.limit) {
            results = results.slice(-filter.limit);
        }

        return results;
    }

    private runAnalyzers(event: TelemetryEvent): void {
        if (!this._settings.analyzers.enabled) return;

        const context = this.buildAnalyzerContext();

        for (const analyzer of this._analyzers) {
            try {
                const insight = analyzer.analyze(event, context);
                if (insight && this.shouldEmitInsight(insight)) {
                    this._insights.push(insight);
                    this.emitInsightWarning(insight);
                }
            } catch (error) {
                // Don't let analyzer errors break telemetry
                console.warn(`Telemetry analyzer ${analyzer.name} error:`, error);
            }
        }
    }

    private buildAnalyzerContext(): TelemetryAnalyzerContext {
        return {
            recentEvents: this._events.slice(-1000),
            patterns: this._patterns,
            getEngineLoadedEntities: () => {
                // Integration with BaseEngineRegistry
                const g = GetGlobalObjectStore();
                if (g && g.__MJ_ENGINE_REGISTRY__) {
                    return g.__MJ_ENGINE_REGISTRY__.GetEntityLoadTracking?.() || new Map();
                }
                return new Map();
            }
        };
    }

    private shouldEmitInsight(insight: TelemetryInsight): boolean {
        // Dedupe similar insights within a time window
        const dedupeKey = `${insight.analyzerName}:${insight.entityName || ''}:${insight.title}`;
        const lastEmit = this._insightDedupeWindow.get(dedupeKey);
        const now = Date.now();

        if (lastEmit && now - lastEmit < this._settings.analyzers.dedupeWindowMs) {
            return false;
        }

        this._insightDedupeWindow.set(dedupeKey, now);
        return true;
    }

    private emitInsightWarning(insight: TelemetryInsight): void {
        // Emit through WarningManager for console output
        this.recordTelemetryInsightToWarningManager(insight);
    }

    /**
     * Record a telemetry insight to the warning manager for debounced output
     */
    private recordTelemetryInsightToWarningManager(insight: TelemetryInsight): void {
        const config = WarningManager.Instance.GetConfig();
        if (config.DisableWarnings) return;

        const severityIcon = {
            'info': 'ℹ️',
            'warning': '⚠️',
            'optimization': '💡'
        }[insight.severity];

        const message = `${severityIcon} [Telemetry/${insight.category}] ${insight.title}\n` +
            `   ${insight.message}\n` +
            `   💡 ${insight.suggestion}`;

        // Use console.info for telemetry insights to distinguish from warnings
        console.info(message);
    }

    // ========== FINGERPRINT GENERATION WITH TYPE GUARDS ==========

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * Generate a fingerprint for duplicate detection using type guards
     */
    private generateFingerprint(
        category: TelemetryCategory,
        params: TelemetryParamsUnion
    ): string {
        let keyParams: Record<string, unknown>;

        switch (category) {
            case 'RunView':
                keyParams = this.generateRunViewFingerprint(params as TelemetryRunViewParams | TelemetryRunViewsBatchParams);
                break;
            case 'RunQuery':
                keyParams = this.generateRunQueryFingerprint(params as TelemetryRunQueryParams);
                break;
            case 'Engine':
                keyParams = this.generateEngineFingerprint(params as TelemetryEngineParams);
                break;
            case 'AI':
                keyParams = this.generateAIFingerprint(params as TelemetryAIParams);
                break;
            case 'Cache':
                keyParams = this.generateCacheFingerprint(params as TelemetryCacheParams);
                break;
            case 'Network':
                keyParams = this.generateNetworkFingerprint(params as TelemetryNetworkParams);
                break;
            default:
                keyParams = params as Record<string, unknown>;
        }

        return `${category}:${JSON.stringify(keyParams)}`;
    }

    /**
     * Generate fingerprint for RunView operations
     */
    private generateRunViewFingerprint(params: TelemetryRunViewParams | TelemetryRunViewsBatchParams): Record<string, unknown> {
        if (isBatchRunViewParams(params)) {
            // Batch operation - create fingerprint from sorted entity list
            const sortedEntities = [...params.Entities]
                .map(e => e?.toLowerCase().trim())
                .filter(Boolean)
                .sort();
            // Use a hash for long entity lists to keep fingerprint manageable
            const entityKey = sortedEntities.length > 5
                ? this.simpleHash(sortedEntities.join('|'))
                : sortedEntities.join('|');
            return {
                batch: true,
                batchSize: params.BatchSize,
                entities: entityKey
            };
        } else {
            // Single operation
            return {
                entity: params.EntityName?.toLowerCase().trim(),
                filter: params.ExtraFilter?.toLowerCase().trim(),
                orderBy: params.OrderBy?.toLowerCase().trim(),
                resultType: params.ResultType
            };
        }
    }

    /**
     * Generate fingerprint for RunQuery operations
     */
    private generateRunQueryFingerprint(params: TelemetryRunQueryParams | TelemetryRunQueriesBatchParams): Record<string, unknown> {
        if (isBatchRunQueryParams(params)) {
            // Batch operation - create fingerprint from sorted query list
            const sortedQueries = [...params.Queries]
                .map(q => q?.toLowerCase().trim())
                .filter(Boolean)
                .sort();
            const queryKey = sortedQueries.length > 5
                ? this.simpleHash(sortedQueries.join('|'))
                : sortedQueries.join('|');
            return {
                batch: true,
                batchSize: params.BatchSize,
                queries: queryKey
            };
        } else {
            return {
                queryId: params.QueryID,
                queryName: params.QueryName?.toLowerCase().trim(),
                categoryPath: params.CategoryPath?.toLowerCase().trim()
            };
        }
    }

    /**
     * Generate fingerprint for Engine operations
     */
    private generateEngineFingerprint(params: TelemetryEngineParams): Record<string, unknown> {
        return {
            engine: params.engineClass,
            operation: params.operation
        };
    }

    /**
     * Generate fingerprint for AI operations
     */
    private generateAIFingerprint(params: TelemetryAIParams): Record<string, unknown> {
        return {
            modelId: params.modelID,
            modelName: params.modelName?.toLowerCase().trim(),
            promptId: params.promptID,
            promptName: params.promptName?.toLowerCase().trim(),
            operationType: params.operationType
        };
    }

    /**
     * Generate fingerprint for Cache operations
     */
    private generateCacheFingerprint(params: TelemetryCacheParams): Record<string, unknown> {
        return {
            cacheType: params.cacheType,
            operation: params.operation,
            entityName: params.entityName?.toLowerCase().trim(),
            fingerprint: params.fingerprint
        };
    }

    /**
     * Generate fingerprint for Network operations
     */
    private generateNetworkFingerprint(params: TelemetryNetworkParams): Record<string, unknown> {
        return {
            method: params.method,
            url: params.url
        };
    }

    /**
     * Simple hash function for creating short fingerprints from long strings.
     * Not cryptographic, just for deduplication purposes.
     */
    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        // Convert to hex and ensure positive
        return (hash >>> 0).toString(16);
    }

    private captureStackTrace(): string {
        const stack = new Error().stack || '';
        return this.cleanStackTrace(stack);
    }

    private cleanStackTrace(stack: string): string {
        const lines = stack.split('\n');
        return lines
            .filter(line => {
                // Filter out noise
                if (line.includes('TelemetryManager')) return false;
                if (line.includes('node_modules')) return false;
                if (line.includes('webpack')) return false;
                if (line.includes('zone.js')) return false;
                if (line.includes('<anonymous>')) return false;
                return true;
            })
            .slice(0, 10)  // Limit depth
            .join('\n');
    }

    private extractCallerLocation(stack: string): string {
        const lines = stack.split('\n');
        // Return first meaningful line
        return lines[0] || 'unknown';
    }

    private captureMemory(): MemorySnapshot {
        // Node.js
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const mem = process.memoryUsage();
            return {
                heapUsed: mem.heapUsed,
                heapTotal: mem.heapTotal,
                timestamp: Date.now()
            };
        }

        // Browser (Chrome only)
        if (typeof performance !== 'undefined') {
            const perfWithMemory = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } };
            if (perfWithMemory.memory) {
                return {
                    heapUsed: perfWithMemory.memory.usedJSHeapSize,
                    heapTotal: perfWithMemory.memory.totalJSHeapSize,
                    timestamp: Date.now()
                };
            }
        }

        return { heapUsed: 0, heapTotal: 0, timestamp: Date.now() };
    }

    private getTimestamp(): number {
        // Use performance.now() if available for better precision
        if (typeof performance !== 'undefined' && performance.now) {
            return performance.now();
        }
        return Date.now();
    }

    private trimIfNeeded(): void {
        if (!this._settings.autoTrim.enabled) return;

        const { maxEvents, maxAgeMs } = this._settings.autoTrim;
        const now = this.getTimestamp();

        // Trim by age
        if (maxAgeMs) {
            this._events = this._events.filter(e => now - e.startTime < maxAgeMs);
        }

        // Trim by count
        if (maxEvents && this._events.length > maxEvents) {
            this._events = this._events.slice(-maxEvents);
        }
    }

    private loadSettings(): TelemetrySettings {
        try {
            // Use localStorage if available (browser), otherwise use global store
            if (typeof localStorage !== 'undefined') {
                const stored = localStorage.getItem(TELEMETRY_SETTINGS_KEY);
                if (stored) {
                    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
                }
            }
        } catch {
            // Ignore storage errors
        }
        return { ...DEFAULT_SETTINGS };
    }

    private saveSettings(): void {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(TELEMETRY_SETTINGS_KEY, JSON.stringify(this._settings));
            }
        } catch {
            // Ignore storage errors
        }
    }

    // ========== CLEAR / RESET ==========

    /**
     * Clear all recorded events and patterns
     */
    public Clear(): void {
        this._events = [];
        this._patterns.clear();
        this._activeEvents.clear();
    }

    /**
     * Clear only patterns (keeps events)
     */
    public ClearPatterns(): void {
        this._patterns.clear();
    }

    /**
     * Clear insights
     */
    public ClearInsights(): void {
        this._insights = [];
        this._insightDedupeWindow.clear();
    }

    /**
     * Reset everything including settings
     */
    public Reset(): void {
        this.Clear();
        this.ClearInsights();
        this._settings = { ...DEFAULT_SETTINGS };
        this.saveSettings();
    }

    // ========== STATISTICS ==========

    /**
     * Get summary statistics
     */
    public GetStats(): {
        totalEvents: number;
        totalPatterns: number;
        totalInsights: number;
        activeEvents: number;
        byCategory: Record<TelemetryCategory, { events: number; avgMs: number }>;
    } {
        const byCategory: Record<TelemetryCategory, { events: number; totalMs: number }> = {
            RunView: { events: 0, totalMs: 0 },
            RunQuery: { events: 0, totalMs: 0 },
            Engine: { events: 0, totalMs: 0 },
            Network: { events: 0, totalMs: 0 },
            AI: { events: 0, totalMs: 0 },
            Cache: { events: 0, totalMs: 0 },
            Custom: { events: 0, totalMs: 0 }
        };

        for (const event of this._events) {
            byCategory[event.category].events++;
            byCategory[event.category].totalMs += event.elapsedMs || 0;
        }

        const byCategoryWithAvg: Record<TelemetryCategory, { events: number; avgMs: number }> = {} as Record<TelemetryCategory, { events: number; avgMs: number }>;
        for (const cat of Object.keys(byCategory) as TelemetryCategory[]) {
            const data = byCategory[cat];
            byCategoryWithAvg[cat] = {
                events: data.events,
                avgMs: data.events > 0 ? data.totalMs / data.events : 0
            };
        }

        return {
            totalEvents: this._events.length,
            totalPatterns: this._patterns.size,
            totalInsights: this._insights.length,
            activeEvents: this._activeEvents.size,
            byCategory: byCategoryWithAvg
        };
    }
}
