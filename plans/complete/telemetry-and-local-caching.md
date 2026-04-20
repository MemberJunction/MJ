# Telemetry Manager and Local Caching System

## Overview

This document outlines two complementary performance optimization features for MemberJunction:

1. **TelemetryManager** - A lightweight instrumentation system for tracking operation performance, detecting patterns, and surfacing optimization opportunities
2. **CacheLocal** - A client-side caching mechanism for RunView/RunQuery that uses timestamp-based validation to avoid redundant data fetches

These features work together: telemetry identifies where caching would help most, and caching reduces the load that telemetry would otherwise track.

## Part 1: TelemetryManager

### Package Location

**Recommendation: `@memberjunction/global`**

The TelemetryManager should be lightweight enough to live in MJGlobal alongside WarningManager. Benefits:
- Available to ALL MJ packages without additional dependencies
- Consistent with WarningManager pattern
- Single global instance across the entire application
- No circular dependency issues

The core class will be minimal - most of the "weight" comes from the data it collects, not the code itself.

### Telemetry Levels and Categories

Using union types instead of enums (per MJ style guide - better tree-shaking and simpler exports):

```typescript
// Telemetry detail levels
export type TelemetryLevel = 'off' | 'basic' | 'standard' | 'verbose' | 'debug';

// Numeric mapping for level comparisons
export const TelemetryLevelValue: Record<TelemetryLevel, number> = {
    'off': 0,
    'basic': 1,        // Timing only (operation, elapsed ms)
    'standard': 2,     // Timing + key params (entity, filter, etc.)
    'verbose': 3,      // + stack traces (cleaned)
    'debug': 4         // + memory snapshots before/after
};

// Telemetry categories
export type TelemetryCategory =
    | 'RunView'
    | 'RunQuery'
    | 'Engine'
    | 'Network'
    | 'AI'
    | 'Cache'
    | 'Custom';
```

### Configuration

#### User Settings Storage

Telemetry settings are stored per-client in the local storage provider (not database) because:
- Settings needed before user authentication/DB access
- Different clients may want different settings (dev machine vs production)
- Avoids DB round-trip just to check if telemetry is enabled
- Fast synchronous access

```typescript
export interface TelemetrySettings {
    enabled: boolean;                              // Global on/off
    level: TelemetryLevel;                         // Default level
    categoryOverrides: Partial<Record<TelemetryCategory, {
        enabled: boolean;
        level?: TelemetryLevel;
    }>>;
    autoTrim: {
        enabled: boolean;                          // Default: false
        maxEvents?: number;                        // Max events to keep
        maxAgeMs?: number;                         // Max age before eviction
    };
    duplicateDetection: {
        enabled: boolean;                          // Default: true
        windowMs: number;                          // Time window for grouping
    };
}

// Storage key
const TELEMETRY_SETTINGS_KEY = '__MJ_TELEMETRY_SETTINGS__';
```

#### Default Configuration

```typescript
const DEFAULT_SETTINGS: TelemetrySettings = {
    enabled: false,                                // Off by default
    level: TelemetryLevel.Standard,
    categoryOverrides: {},
    autoTrim: {
        enabled: false,
        maxEvents: 10000,
        maxAgeMs: 30 * 60 * 1000                   // 30 minutes
    },
    duplicateDetection: {
        enabled: true,
        windowMs: 60 * 1000                        // 1 minute
    }
};
```

### Core Interfaces

```typescript
export interface TelemetryEvent {
    id: string;                                    // UUID
    category: TelemetryCategory;
    operation: string;                             // e.g., 'RunView.Execute'
    fingerprint: string;                           // Hash for duplicate detection

    // Timing
    startTime: number;                             // performance.now() or Date.now()
    endTime?: number;
    elapsedMs?: number;

    // Context
    userId?: string;
    params: Record<string, unknown>;               // Operation-specific params
    tags?: string[];                               // Custom grouping tags

    // Optional detailed info (based on level)
    stackTrace?: string;                           // Cleaned stack trace
    memoryBefore?: MemorySnapshot;
    memoryAfter?: MemorySnapshot;

    // Hierarchy
    parentEventId?: string;                        // For nested operations
}

export interface MemorySnapshot {
    heapUsed: number;
    heapTotal: number;
    timestamp: number;
}

export interface TelemetryPattern {
    fingerprint: string;
    category: TelemetryCategory;
    operation: string;
    sampleParams: Record<string, unknown>;         // Params from first occurrence

    // Aggregates
    count: number;
    totalElapsedMs: number;
    avgElapsedMs: number;
    minElapsedMs: number;
    maxElapsedMs: number;

    // Call site tracking
    callerLocations: Map<string, number>;          // Stack trace -> count

    // Timing
    firstSeen: number;
    lastSeen: number;
    windowStartTime: number;
}
```

### TelemetryManager Implementation

```typescript
export class TelemetryManager extends BaseSingleton<TelemetryManager> {
    private _settings: TelemetrySettings;
    private _events: TelemetryEvent[] = [];
    private _patterns: Map<string, TelemetryPattern> = new Map();
    private _activeEvents: Map<string, TelemetryEvent> = new Map();

    constructor() {
        super();
        this._settings = this.loadSettings();
    }

    // ========== Configuration ==========

    public get Settings(): TelemetrySettings {
        return { ...this._settings };
    }

    public UpdateSettings(settings: Partial<TelemetrySettings>): void {
        this._settings = { ...this._settings, ...settings };
        this.saveSettings();
    }

    public get IsEnabled(): boolean {
        return this._settings.enabled;
    }

    public SetEnabled(enabled: boolean): void {
        this._settings.enabled = enabled;
        this.saveSettings();
    }

    public IsCategoryEnabled(category: TelemetryCategory): boolean {
        if (!this._settings.enabled) return false;
        const override = this._settings.categoryOverrides[category];
        return override?.enabled ?? true;
    }

    public GetLevelForCategory(category: TelemetryCategory): TelemetryLevel {
        const override = this._settings.categoryOverrides[category];
        return override?.level ?? this._settings.level;
    }

    // ========== Event Recording ==========

    public StartEvent(
        category: TelemetryCategory,
        operation: string,
        params: Record<string, unknown>,
        userId?: string
    ): string | null {
        if (!this.IsCategoryEnabled(category)) return null;

        const level = this.GetLevelForCategory(category);
        const event: TelemetryEvent = {
            id: this.generateId(),
            category,
            operation,
            fingerprint: this.generateFingerprint(category, operation, params),
            startTime: performance.now(),
            userId,
            params: level >= TelemetryLevel.Standard ? params : {},
            stackTrace: level >= TelemetryLevel.Verbose ? this.captureStackTrace() : undefined,
            memoryBefore: level >= TelemetryLevel.Debug ? this.captureMemory() : undefined
        };

        this._activeEvents.set(event.id, event);
        return event.id;
    }

    public EndEvent(eventId: string): TelemetryEvent | null {
        const event = this._activeEvents.get(eventId);
        if (!event) return null;

        this._activeEvents.delete(eventId);

        event.endTime = performance.now();
        event.elapsedMs = event.endTime - event.startTime;

        const level = this.GetLevelForCategory(event.category);
        if (level >= TelemetryLevel.Debug) {
            event.memoryAfter = this.captureMemory();
        }

        this._events.push(event);
        this.updatePattern(event);
        this.trimIfNeeded();

        return event;
    }

    // Convenience method for synchronous operations
    public RecordEvent(
        category: TelemetryCategory,
        operation: string,
        params: Record<string, unknown>,
        elapsedMs: number,
        userId?: string
    ): void {
        if (!this.IsCategoryEnabled(category)) return;

        const level = this.GetLevelForCategory(category);
        const event: TelemetryEvent = {
            id: this.generateId(),
            category,
            operation,
            fingerprint: this.generateFingerprint(category, operation, params),
            startTime: performance.now() - elapsedMs,
            endTime: performance.now(),
            elapsedMs,
            userId,
            params: level >= TelemetryLevel.Standard ? params : {},
            stackTrace: level >= TelemetryLevel.Verbose ? this.captureStackTrace() : undefined
        };

        this._events.push(event);
        this.updatePattern(event);
        this.trimIfNeeded();
    }

    // ========== Pattern Detection ==========

    private updatePattern(event: TelemetryEvent): void {
        if (!this._settings.duplicateDetection.enabled) return;

        let pattern = this._patterns.get(event.fingerprint);
        const now = performance.now();

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

    // ========== Queries ==========

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

    public GetDuplicates(minCount: number = 2): TelemetryPattern[] {
        return this.GetPatterns({ minCount, sortBy: 'count' });
    }

    // ========== Utilities ==========

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateFingerprint(
        category: TelemetryCategory,
        operation: string,
        params: Record<string, unknown>
    ): string {
        // Category-specific fingerprinting
        let keyParams: Record<string, unknown>;

        switch (category) {
            case TelemetryCategory.RunView:
                keyParams = {
                    entity: (params.EntityName as string)?.toLowerCase().trim(),
                    filter: (params.ExtraFilter as string)?.toLowerCase().trim(),
                    orderBy: (params.OrderBy as string)?.toLowerCase().trim(),
                    resultType: params.ResultType
                };
                break;
            case TelemetryCategory.RunQuery:
                keyParams = {
                    query: (params.SQL as string)?.toLowerCase().trim()
                };
                break;
            case TelemetryCategory.Engine:
                keyParams = {
                    engine: params.engineClass,
                    operation: params.operation
                };
                break;
            default:
                keyParams = params;
        }

        return `${category}:${operation}:${JSON.stringify(keyParams)}`;
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
        if (typeof performance !== 'undefined' && (performance as any).memory) {
            const mem = (performance as any).memory;
            return {
                heapUsed: mem.usedJSHeapSize,
                heapTotal: mem.totalJSHeapSize,
                timestamp: Date.now()
            };
        }

        return { heapUsed: 0, heapTotal: 0, timestamp: Date.now() };
    }

    private trimIfNeeded(): void {
        if (!this._settings.autoTrim.enabled) return;

        const { maxEvents, maxAgeMs } = this._settings.autoTrim;
        const now = performance.now();

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
            const stored = localStorage.getItem(TELEMETRY_SETTINGS_KEY);
            if (stored) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
            }
        } catch {
            // Ignore storage errors
        }
        return { ...DEFAULT_SETTINGS };
    }

    private saveSettings(): void {
        try {
            localStorage.setItem(TELEMETRY_SETTINGS_KEY, JSON.stringify(this._settings));
        } catch {
            // Ignore storage errors
        }
    }

    // ========== Clear/Reset ==========

    public Clear(): void {
        this._events = [];
        this._patterns.clear();
        this._activeEvents.clear();
    }

    public ClearPatterns(): void {
        this._patterns.clear();
    }
}
```

### Telemetry Analyzers - Extensible Rule System

The telemetry system includes a pluggable analyzer framework that can detect optimization opportunities across categories. This enables:
1. **Cross-category correlation** - "RunView for entity already loaded by an Engine"
2. **Pattern-based suggestions** - "Same entity queried 10x with different filters - consider an Engine"
3. **Extensibility** - Custom analyzers can be registered for domain-specific rules

#### Analyzer Interfaces

```typescript
// Pluggable analyzer interface
export interface TelemetryAnalyzer {
    /** Unique name for this analyzer */
    name: string;
    /** Category for grouping warnings in UI */
    category: string;
    /** Analyze an event and optionally return a warning */
    analyze(event: TelemetryEvent, context: TelemetryAnalyzerContext): TelemetryInsight | null;
}

export interface TelemetryAnalyzerContext {
    /** Recent events (last N or time window) */
    recentEvents: TelemetryEvent[];
    /** Aggregated patterns */
    patterns: Map<string, TelemetryPattern>;
    /** Access to engine registry for cross-referencing */
    getEngineLoadedEntities(): Map<string, string[]>;  // entity -> engines that loaded it
}

export type TelemetryInsightSeverity = 'info' | 'warning' | 'optimization';

export interface TelemetryInsight {
    id: string;
    severity: TelemetryInsightSeverity;
    analyzerName: string;
    category: string;
    title: string;
    message: string;
    suggestion: string;
    relatedEventIds: string[];
    /** Entity name if relevant */
    entityName?: string;
    /** Additional context for UI display */
    metadata?: Record<string, unknown>;
    timestamp: number;
}
```

#### Built-in Analyzers

```typescript
/**
 * Detects when RunView is called for an entity already loaded by an engine.
 * Suggests using the engine's cached data instead.
 */
class EngineOverlapAnalyzer implements TelemetryAnalyzer {
    name = 'EngineOverlapAnalyzer';
    category = 'Optimization';

    analyze(event: TelemetryEvent, context: TelemetryAnalyzerContext): TelemetryInsight | null {
        if (event.category !== 'RunView') return null;

        const entityName = event.params.EntityName as string;
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

        const entityName = event.params.EntityName as string;
        if (!entityName) return null;

        // Count distinct RunViews for same entity in recent events
        const entityEvents = context.recentEvents.filter(
            e => e.category === 'RunView' && e.params.EntityName === entityName
        );

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

    private readonly SEQUENCE_THRESHOLD_MS = 100;  // Events within 100ms are "sequential"

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
            return {
                id: `parallel-${event.id}`,
                severity: 'performance',
                analyzerName: this.name,
                category: this.category,
                title: 'Sequential Queries Could Be Parallelized',
                message: `${allEvents.length} RunView calls executed sequentially`,
                suggestion: `Use RunViews (batch) to execute these queries in parallel for better performance`,
                relatedEventIds: allEvents.map(e => e.id),
                metadata: {
                    entities: allEvents.map(e => e.params.EntityName)
                },
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
            return {
                id: `duplicate-${event.fingerprint}-${Date.now()}`,
                severity: 'warning',
                analyzerName: this.name,
                category: this.category,
                title: 'Duplicate RunView Detected',
                entityName: event.params.EntityName as string,
                message: `Identical RunView (${event.params.EntityName}, same filter/orderBy) called ${pattern.count} times`,
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
```

#### TelemetryManager Analyzer Integration

```typescript
// Additional TelemetryManager methods for analyzer support
export class TelemetryManager extends BaseSingleton<TelemetryManager> {
    private _analyzers: TelemetryAnalyzer[] = [];
    private _insights: TelemetryInsight[] = [];
    private _insightDedupeWindow: Map<string, number> = new Map();  // key -> last emit time

    // Register built-in analyzers on construction
    constructor() {
        super();
        this._settings = this.loadSettings();
        this.registerBuiltInAnalyzers();
    }

    private registerBuiltInAnalyzers(): void {
        this.RegisterAnalyzer(new EngineOverlapAnalyzer());
        this.RegisterAnalyzer(new SameEntityMultipleCallsAnalyzer());
        this.RegisterAnalyzer(new ParallelizationOpportunityAnalyzer());
        this.RegisterAnalyzer(new DuplicateRunViewAnalyzer());
    }

    public RegisterAnalyzer(analyzer: TelemetryAnalyzer): void {
        this._analyzers.push(analyzer);
    }

    public UnregisterAnalyzer(name: string): void {
        this._analyzers = this._analyzers.filter(a => a.name !== name);
    }

    public GetAnalyzers(): TelemetryAnalyzer[] {
        return [...this._analyzers];
    }

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

    // Called after EndEvent to run analyzers
    private runAnalyzers(event: TelemetryEvent): void {
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
                // This will be available when running in MJCore context
                if (typeof globalThis !== 'undefined' && (globalThis as any).__MJ_ENGINE_REGISTRY__) {
                    return (globalThis as any).__MJ_ENGINE_REGISTRY__.GetEntityLoadTracking();
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

        if (lastEmit && now - lastEmit < 30000) {  // 30 second dedupe window
            return false;
        }

        this._insightDedupeWindow.set(dedupeKey, now);
        return true;
    }

    private emitInsightWarning(insight: TelemetryInsight): void {
        // Emit through WarningManager for console output
        WarningManager.Instance.RecordTelemetryInsight(insight);
    }

    public ClearInsights(): void {
        this._insights = [];
        this._insightDedupeWindow.clear();
    }
}
```

#### WarningManager Integration

```typescript
// New method in WarningManager for telemetry insights
public RecordTelemetryInsight(insight: TelemetryInsight): void {
    if (this.config.DisableWarnings) return;

    const severityIcon = {
        'info': 'ℹ️',
        'warning': '⚠️',
        'optimization': '💡'
    }[insight.severity];

    const message = `${severityIcon} [Telemetry/${insight.category}] ${insight.title}\n` +
        `   ${insight.message}\n` +
        `   💡 ${insight.suggestion}`;

    // Queue for debounced output
    this.queueTelemetryWarning(insight, message);
}
```

### Integration Points

#### RunView Integration

```typescript
// In RunView class
public async RunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
    const eventId = TelemetryManager.Instance.StartEvent(
        TelemetryCategory.RunView,
        'RunView.Execute',
        {
            EntityName: params.EntityName,
            ExtraFilter: params.ExtraFilter,
            OrderBy: params.OrderBy,
            ResultType: params.ResultType,
            MaxRows: params.MaxRows
        },
        contextUser?.ID
    );

    try {
        const result = await this.executeRunView(params, contextUser);
        return result;
    } finally {
        if (eventId) {
            TelemetryManager.Instance.EndEvent(eventId);
        }
    }
}
```

#### BaseEngine Integration

```typescript
// In BaseEngine
public async Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void> {
    const eventId = TelemetryManager.Instance.StartEvent(
        TelemetryCategory.Engine,
        `${this.constructor.name}.Config`,
        { forceRefresh, engineClass: this.constructor.name },
        contextUser?.ID
    );

    try {
        await this.internalConfig(forceRefresh, contextUser);
    } finally {
        if (eventId) {
            TelemetryManager.Instance.EndEvent(eventId);
        }
    }
}
```

#### AI Inference Integration

```typescript
// In AI providers
public async GetCompletion(params: CompletionParams): Promise<CompletionResult> {
    const eventId = TelemetryManager.Instance.StartEvent(
        TelemetryCategory.AI,
        'LLM.GetCompletion',
        {
            model: params.model,
            promptTokens: params.messages.length,
            maxTokens: params.maxTokens
        }
    );

    try {
        const result = await this.provider.complete(params);
        return result;
    } finally {
        if (eventId) {
            TelemetryManager.Instance.EndEvent(eventId);
        }
    }
}
```

### Server-to-Client Transport

#### GraphQL Resolver

```typescript
// New resolver for telemetry data
@Resolver()
export class TelemetryResolver {
    @Query(() => TelemetrySnapshot)
    async GetServerTelemetry(
        @Ctx() ctx: AppContext,
        @Arg('filter', { nullable: true }) filter?: TelemetryFilterInput
    ): Promise<TelemetrySnapshot> {
        // Authorization check - admin only
        if (!ctx.user?.IsAdmin) {
            throw new Error('Telemetry access requires admin privileges');
        }

        const tm = TelemetryManager.Instance;
        return {
            events: tm.GetEvents(filter),
            patterns: tm.GetPatterns(filter),
            settings: tm.Settings
        };
    }

    @Mutation(() => Boolean)
    async UpdateServerTelemetrySettings(
        @Ctx() ctx: AppContext,
        @Arg('settings') settings: TelemetrySettingsInput
    ): Promise<boolean> {
        if (!ctx.user?.IsAdmin) {
            throw new Error('Telemetry configuration requires admin privileges');
        }

        TelemetryManager.Instance.UpdateSettings(settings);
        return true;
    }
}
```

### Performance Dashboard Integration

The existing System Diagnostics dashboard can be extended with a Performance Monitor tab:

```typescript
// Performance monitor view modes
export type PerfViewMode = 'live' | 'patterns' | 'duplicates' | 'timeline';

// Dashboard would display:
// - Real-time event stream (live mode)
// - Pattern aggregations with duplicate detection
// - Timeline visualization of operations
// - Drill-down into specific patterns to see call sites
// - Filters by category, operation, time range
// - Toggle to show server telemetry (fetched via GraphQL)
```

---

## Part 2: CacheLocal for RunView/RunQuery

### Concept

A client-side caching mechanism that:
1. Stores query results in IndexedDB
2. Uses `__mj_UpdatedAt` timestamps to validate cache freshness
3. Avoids full data transfer when cache is still valid

### Interface

```typescript
export interface RunViewParams {
    EntityName: string;
    ExtraFilter?: string;
    OrderBy?: string;
    ResultType?: 'simple' | 'entity_object';
    MaxRows?: number;

    // New caching options
    CacheLocal?: boolean;                          // Enable local caching
    MaxLocalDate?: string;                         // ISO timestamp of cached data
    CacheTTLMs?: number;                           // Optional: max cache age regardless of server
}

export interface RunViewResult<T> {
    Success: boolean;
    Results: T[];
    TotalRowCount: number;
    ErrorMessage?: string;

    // New cache-related fields
    CacheHit?: boolean;                            // True if served from cache
    MaxUpdatedAt?: string;                         // Latest __mj_UpdatedAt from results
    CacheFingerprint?: string;                     // For cache storage key
}
```

### Cache Fingerprint Generation

```typescript
function generateCacheFingerprint(params: RunViewParams): string {
    const normalized = {
        e: params.EntityName.toLowerCase().trim(),
        f: (params.ExtraFilter || '').toLowerCase().trim(),
        o: (params.OrderBy || '').toLowerCase().trim(),
        r: params.ResultType || 'simple',
        m: params.MaxRows ?? -1
    };

    // Simple hash - could use MD5 for production
    return btoa(JSON.stringify(normalized)).replace(/[^a-zA-Z0-9]/g, '');
}
```

### Server-Side Changes

```typescript
// In GraphQL resolver for RunView
async RunView(params: RunViewParams, contextUser: UserInfo): Promise<RunViewResult> {
    // If CacheLocal requested, check freshness first
    if (params.CacheLocal && params.MaxLocalDate) {
        const freshness = await this.checkFreshness(params);

        if (freshness.isValid) {
            return {
                Success: true,
                Results: [],
                TotalRowCount: 0,
                CacheHit: true,
                MaxUpdatedAt: freshness.maxUpdatedAt
            };
        }
    }

    // Normal query execution
    const results = await this.executeQuery(params);

    return {
        Success: true,
        Results: results.rows,
        TotalRowCount: results.totalCount,
        CacheHit: false,
        MaxUpdatedAt: results.maxUpdatedAt
    };
}

private async checkFreshness(params: RunViewParams): Promise<{ isValid: boolean; maxUpdatedAt: string }> {
    const entityInfo = this.metadata.EntityByName(params.EntityName);

    // Check if entity has __mj_UpdatedAt
    if (!entityInfo.Fields.find(f => f.Name === '__mj_UpdatedAt')) {
        return { isValid: false, maxUpdatedAt: '' };
    }

    // Quick MAX query
    const sql = `SELECT MAX(__mj_UpdatedAt) as MaxDate FROM ${entityInfo.BaseView}`;
    if (params.ExtraFilter) {
        sql += ` WHERE ${params.ExtraFilter}`;
    }

    const result = await this.dataSource.query(sql);
    const maxUpdatedAt = result[0]?.MaxDate;

    if (!maxUpdatedAt) {
        return { isValid: false, maxUpdatedAt: '' };
    }

    const serverDate = new Date(maxUpdatedAt).getTime();
    const clientDate = new Date(params.MaxLocalDate!).getTime();

    return {
        isValid: serverDate <= clientDate,
        maxUpdatedAt
    };
}
```

### Client-Side Cache Manager

```typescript
export interface CacheEntry {
    fingerprint: string;
    entityName: string;
    params: RunViewParams;
    results: unknown[];
    maxUpdatedAt: string;
    cachedAt: number;
    accessCount: number;
    lastAccessedAt: number;
    sizeBytes: number;
}

export interface CacheManagerConfig {
    enabled: boolean;
    maxSizeBytes: number;                          // Default: 50MB
    maxSizePercent?: number;                       // Alternative: % of available
    maxEntries: number;                            // Default: 1000
    defaultTTLMs: number;                          // Default: 5 minutes
    evictionPolicy: 'lru' | 'lfu' | 'fifo';       // Default: 'lru'
}

export class LocalCacheManager extends BaseSingleton<LocalCacheManager> {
    private _db: IDBDatabase | null = null;
    private _config: CacheManagerConfig;
    private _stats: CacheStats = { hits: 0, misses: 0, evictions: 0 };

    private readonly DB_NAME = '__MJ_CACHE__';
    private readonly STORE_NAME = 'runview_cache';

    // ========== Initialization ==========

    public async Initialize(): Promise<void> {
        if (!this.isIndexedDBAvailable()) {
            this.warnUnavailable('IndexedDB not available');
            return;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this._db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'fingerprint' });
                    store.createIndex('entityName', 'entityName', { unique: false });
                    store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
                    store.createIndex('cachedAt', 'cachedAt', { unique: false });
                }
            };
        });
    }

    // ========== Cache Operations ==========

    public async Get(fingerprint: string): Promise<CacheEntry | null> {
        if (!this._db) return null;

        return new Promise((resolve, reject) => {
            const tx = this._db!.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.get(fingerprint);

            request.onsuccess = () => {
                const entry = request.result as CacheEntry | undefined;
                if (entry) {
                    // Update access stats
                    entry.accessCount++;
                    entry.lastAccessedAt = Date.now();
                    store.put(entry);
                    this._stats.hits++;
                } else {
                    this._stats.misses++;
                }
                resolve(entry || null);
            };

            request.onerror = () => reject(request.error);
        });
    }

    public async Set(
        fingerprint: string,
        params: RunViewParams,
        results: unknown[],
        maxUpdatedAt: string
    ): Promise<void> {
        if (!this._db) return;

        const sizeBytes = this.estimateSize(results);

        // Check memory pressure
        if (await this.isUnderMemoryPressure(sizeBytes)) {
            await this.evict(sizeBytes);
        }

        const entry: CacheEntry = {
            fingerprint,
            entityName: params.EntityName,
            params,
            results,
            maxUpdatedAt,
            cachedAt: Date.now(),
            accessCount: 1,
            lastAccessedAt: Date.now(),
            sizeBytes
        };

        return new Promise((resolve, reject) => {
            const tx = this._db!.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.put(entry);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    public async Invalidate(fingerprint: string): Promise<void> {
        if (!this._db) return;

        return new Promise((resolve, reject) => {
            const tx = this._db!.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.delete(fingerprint);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    public async InvalidateEntity(entityName: string): Promise<void> {
        if (!this._db) return;

        const tx = this._db!.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        const index = store.index('entityName');
        const request = index.openCursor(IDBKeyRange.only(entityName));

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ========== Eviction ==========

    private async evict(neededBytes: number): Promise<void> {
        const entries = await this.getAllEntries();

        // Sort by eviction policy
        switch (this._config.evictionPolicy) {
            case 'lru':
                entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
                break;
            case 'lfu':
                entries.sort((a, b) => a.accessCount - b.accessCount);
                break;
            case 'fifo':
                entries.sort((a, b) => a.cachedAt - b.cachedAt);
                break;
        }

        let freedBytes = 0;
        const toDelete: string[] = [];

        for (const entry of entries) {
            if (freedBytes >= neededBytes) break;
            toDelete.push(entry.fingerprint);
            freedBytes += entry.sizeBytes;
            this._stats.evictions++;
        }

        for (const fp of toDelete) {
            await this.Invalidate(fp);
        }
    }

    private async isUnderMemoryPressure(additionalBytes: number): Promise<boolean> {
        const currentSize = await this.getTotalSize();
        return (currentSize + additionalBytes) > this._config.maxSizeBytes;
    }

    // ========== Warnings Integration ==========

    private warnUnavailable(reason: string): void {
        WarningManager.Instance.RecordWarning(
            'LocalCacheManager',
            `CacheLocal unavailable: ${reason}. Falling back to direct fetch.`,
            WarningCategory.Performance
        );
    }

    private isIndexedDBAvailable(): boolean {
        return typeof indexedDB !== 'undefined';
    }

    private estimateSize(obj: unknown): number {
        return new Blob([JSON.stringify(obj)]).size;
    }
}
```

### RunView Integration

```typescript
// In RunView class
public async RunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
    // Check if caching requested and available
    if (params.CacheLocal) {
        const cacheResult = await this.tryServeFromCache(params);
        if (cacheResult) {
            return cacheResult;
        }
    }

    // Execute normal query (with MaxLocalDate if caching)
    const result = await this.executeRunView(params, contextUser);

    // Store in cache if requested and successful
    if (params.CacheLocal && result.Success && !result.CacheHit) {
        await this.storeInCache(params, result);
    }

    return result;
}

private async tryServeFromCache<T>(params: RunViewParams): Promise<RunViewResult<T> | null> {
    const fingerprint = generateCacheFingerprint(params);
    const cached = await LocalCacheManager.Instance.Get(fingerprint);

    if (!cached) return null;

    // Check TTL
    if (params.CacheTTLMs) {
        const age = Date.now() - cached.cachedAt;
        if (age > params.CacheTTLMs) {
            await LocalCacheManager.Instance.Invalidate(fingerprint);
            return null;
        }
    }

    // Set MaxLocalDate for freshness check
    params.MaxLocalDate = cached.maxUpdatedAt;

    // Server will return CacheHit: true if still fresh
    // Otherwise returns new data
    return null;  // Continue to server with MaxLocalDate set
}

private async storeInCache<T>(params: RunViewParams, result: RunViewResult<T>): Promise<void> {
    if (!result.MaxUpdatedAt) return;

    const fingerprint = generateCacheFingerprint(params);
    await LocalCacheManager.Instance.Set(
        fingerprint,
        params,
        result.Results,
        result.MaxUpdatedAt
    );
}
```

### LocalCacheManager - Unified Cache Abstraction

A higher-level caching abstraction in MJCore that:
1. Wraps `ILocalStorageProvider` for actual storage
2. Maintains an internal registry of all cached items
3. Provides typed methods for datasets, RunViews, and RunQueries
4. Handles all cache metadata (timestamps, access counts, sizes) automatically

**Location**: `@memberjunction/core`

**Rationale**: Instead of having callers manually register with a separate `CacheRegistry`, `LocalCacheManager` is the single point of control for all caching. The registry is internal - callers just use `Set`/`Get` methods and everything else happens automatically.

#### Cache Entry Types

```typescript
export type CacheEntryType = 'dataset' | 'runview' | 'runquery';

export interface CacheEntryInfo {
    key: string;                          // Storage key
    type: CacheEntryType;
    name: string;                         // Dataset name, Entity name, query ID
    fingerprint?: string;                 // For RunView/RunQuery deduplication
    params?: Record<string, unknown>;     // Original params (expandable in UI)
    cachedAt: number;                     // Cache timestamp
    lastAccessedAt: number;               // Last read
    accessCount: number;                  // Hit count
    sizeBytes: number;                    // Approximate size
    maxUpdatedAt?: string;                // Server timestamp for freshness check
    expiresAt?: number;                   // Optional TTL expiry
}

export interface CacheStats {
    totalEntries: number;
    totalSizeBytes: number;
    byType: Record<CacheEntryType, { count: number; sizeBytes: number }>;
    oldestEntry: number;
    newestEntry: number;
    hits: number;
    misses: number;
}
```

#### LocalCacheManager Implementation

```typescript
export class LocalCacheManager extends BaseSingleton<LocalCacheManager> {
    private _storageProvider: ILocalStorageProvider | null = null;
    private _registry: Map<string, CacheEntryInfo> = new Map();
    private _initialized: boolean = false;
    private _stats = { hits: 0, misses: 0 };

    private readonly REGISTRY_KEY = '__MJ_CACHE_REGISTRY__';

    // ========== Initialization ==========

    /**
     * Initialize the cache manager. Called during app startup after
     * ProviderBase is available.
     */
    public async Initialize(storageProvider: ILocalStorageProvider): Promise<void> {
        if (this._initialized) return;

        this._storageProvider = storageProvider;
        await this.loadRegistry();
        this._initialized = true;
    }

    public get IsInitialized(): boolean {
        return this._initialized;
    }

    // ========== Dataset Caching ==========

    public async SetDataset(
        name: string,
        itemFilters: DatasetItemFilterType[] | undefined,
        dataset: DatasetResultType,
        keyPrefix: string
    ): Promise<void> {
        const key = this.buildDatasetKey(name, itemFilters, keyPrefix);
        const value = JSON.stringify(dataset);

        await this._storageProvider!.SetItem(key, value);
        await this._storageProvider!.SetItem(key + '_date', dataset.LatestUpdateDate.toISOString());

        this.registerEntry({
            key,
            type: 'dataset',
            name,
            cachedAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 1,
            sizeBytes: value.length,
            maxUpdatedAt: dataset.LatestUpdateDate.toISOString()
        });
    }

    public async GetDataset(
        name: string,
        itemFilters: DatasetItemFilterType[] | undefined,
        keyPrefix: string
    ): Promise<DatasetResultType | null> {
        const key = this.buildDatasetKey(name, itemFilters, keyPrefix);
        const value = await this._storageProvider!.GetItem(key);

        if (value) {
            this.recordAccess(key);
            this._stats.hits++;
            return JSON.parse(value);
        }

        this._stats.misses++;
        return null;
    }

    public async GetDatasetTimestamp(
        name: string,
        itemFilters: DatasetItemFilterType[] | undefined,
        keyPrefix: string
    ): Promise<Date | null> {
        const key = this.buildDatasetKey(name, itemFilters, keyPrefix);
        const dateStr = await this._storageProvider!.GetItem(key + '_date');
        return dateStr ? new Date(dateStr) : null;
    }

    public async ClearDataset(
        name: string,
        itemFilters: DatasetItemFilterType[] | undefined,
        keyPrefix: string
    ): Promise<void> {
        const key = this.buildDatasetKey(name, itemFilters, keyPrefix);
        await this._storageProvider!.Remove(key);
        await this._storageProvider!.Remove(key + '_date');
        this.unregisterEntry(key);
    }

    // ========== RunView Caching ==========

    public async SetRunViewResult(
        fingerprint: string,
        params: RunViewParams,
        results: unknown[],
        maxUpdatedAt: string
    ): Promise<void> {
        const value = JSON.stringify({ results, maxUpdatedAt });

        await this._storageProvider!.SetItem(fingerprint, value);

        this.registerEntry({
            key: fingerprint,
            type: 'runview',
            name: params.EntityName,
            fingerprint,
            params: {
                EntityName: params.EntityName,
                ExtraFilter: params.ExtraFilter,
                OrderBy: params.OrderBy,
                ResultType: params.ResultType,
                MaxRows: params.MaxRows
            },
            cachedAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 1,
            sizeBytes: value.length,
            maxUpdatedAt
        });
    }

    public async GetRunViewResult(fingerprint: string): Promise<{ results: unknown[]; maxUpdatedAt: string } | null> {
        const value = await this._storageProvider!.GetItem(fingerprint);

        if (value) {
            this.recordAccess(fingerprint);
            this._stats.hits++;
            return JSON.parse(value);
        }

        this._stats.misses++;
        return null;
    }

    // ========== RunQuery Caching (similar pattern) ==========

    public async SetRunQueryResult(fingerprint: string, sql: string, results: unknown[], maxUpdatedAt: string): Promise<void> {
        // Similar to SetRunViewResult with type: 'runquery'
    }

    public async GetRunQueryResult(fingerprint: string): Promise<{ results: unknown[]; maxUpdatedAt: string } | null> {
        // Similar to GetRunViewResult
    }

    // ========== Registry Queries (for Dashboard) ==========

    public GetAllEntries(): CacheEntryInfo[] {
        return [...this._registry.values()];
    }

    public GetEntriesByType(type: CacheEntryType): CacheEntryInfo[] {
        return this.GetAllEntries().filter(e => e.type === type);
    }

    public GetStats(): CacheStats {
        const entries = this.GetAllEntries();
        const byType: Record<CacheEntryType, { count: number; sizeBytes: number }> = {
            dataset: { count: 0, sizeBytes: 0 },
            runview: { count: 0, sizeBytes: 0 },
            runquery: { count: 0, sizeBytes: 0 }
        };

        for (const entry of entries) {
            byType[entry.type].count++;
            byType[entry.type].sizeBytes += entry.sizeBytes;
        }

        const timestamps = entries.map(e => e.cachedAt);
        return {
            totalEntries: entries.length,
            totalSizeBytes: entries.reduce((sum, e) => sum + e.sizeBytes, 0),
            byType,
            oldestEntry: timestamps.length ? Math.min(...timestamps) : 0,
            newestEntry: timestamps.length ? Math.max(...timestamps) : 0,
            hits: this._stats.hits,
            misses: this._stats.misses
        };
    }

    // ========== Bulk Operations ==========

    public async ClearByType(type: CacheEntryType): Promise<number> {
        const entries = this.GetEntriesByType(type);
        for (const entry of entries) {
            await this._storageProvider!.Remove(entry.key);
            if (entry.type === 'dataset') {
                await this._storageProvider!.Remove(entry.key + '_date');
            }
            this._registry.delete(entry.key);
        }
        await this.persistRegistry();
        return entries.length;
    }

    public async ClearAll(): Promise<number> {
        const count = this._registry.size;
        for (const entry of this._registry.values()) {
            await this._storageProvider!.Remove(entry.key);
            if (entry.type === 'dataset') {
                await this._storageProvider!.Remove(entry.key + '_date');
            }
        }
        this._registry.clear();
        await this.persistRegistry();
        return count;
    }

    // ========== Internal ==========

    private buildDatasetKey(name: string, itemFilters: DatasetItemFilterType[] | undefined, keyPrefix: string): string {
        const filterKey = itemFilters
            ? '{' + itemFilters.map(f => `"${f.ItemCode}":"${f.Filter}"`).join(',') + '}'
            : '';
        return keyPrefix + '__DATASET__' + name + filterKey;
    }

    private registerEntry(entry: CacheEntryInfo): void {
        this._registry.set(entry.key, entry);
        this.persistRegistry();
    }

    private unregisterEntry(key: string): void {
        this._registry.delete(key);
        this.persistRegistry();
    }

    private recordAccess(key: string): void {
        const entry = this._registry.get(key);
        if (entry) {
            entry.lastAccessedAt = Date.now();
            entry.accessCount++;
            // Don't persist on every access - could batch this
        }
    }

    private async loadRegistry(): Promise<void> {
        try {
            const stored = await this._storageProvider!.GetItem(this.REGISTRY_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as CacheEntryInfo[];
                this._registry = new Map(parsed.map(e => [e.key, e]));
            }
        } catch {
            this._registry.clear();
        }
    }

    private async persistRegistry(): Promise<void> {
        try {
            const data = JSON.stringify(this.GetAllEntries());
            await this._storageProvider!.SetItem(this.REGISTRY_KEY, data);
        } catch {
            // Ignore persistence errors
        }
    }
}
```

#### Migration: Rewiring ProviderBase (Phase 2)

After `LocalCacheManager` is implemented, `ProviderBase` methods will be simplified:

```typescript
// Before (current implementation)
public async CacheDataset(datasetName: string, itemFilters: DatasetItemFilterType[], dataset: DatasetResultType): Promise<void> {
    const ls = this.LocalStorageProvider;
    if (ls) {
        const key = this.GetDatasetCacheKey(datasetName, itemFilters);
        const val = JSON.stringify(dataset);
        await ls.SetItem(key, val);
        const dateKey = key + '_date';
        const dateVal = dataset.LatestUpdateDate.toISOString();
        await ls.SetItem(dateKey, dateVal);
    }
}

// After (using LocalCacheManager)
public async CacheDataset(datasetName: string, itemFilters: DatasetItemFilterType[], dataset: DatasetResultType): Promise<void> {
    await LocalCacheManager.Instance.SetDataset(
        datasetName,
        itemFilters,
        dataset,
        this.LocalStoragePrefix + ProviderBase.localStorageRootKey + this.InstanceConnectionString
    );
}
```

This provides:
- Automatic registry maintenance
- Access tracking
- Size tracking
- Single source of truth for all cached data

#### Dashboard Integration

The System Diagnostics dashboard gets a new "Local Cache" tab displaying:
- Summary stats (total entries, total size, breakdown by type, hit/miss ratio)
- Filterable table of all cached items with columns:
  - Type (icon: dataset/view/query)
  - Name
  - Params (expandable)
  - Size
  - Age
  - Last Accessed
  - Access Count
- Actions: View details, Invalidate individual, Clear by type, Clear all

### Fallback Behavior

When CacheLocal cannot be used, queue warnings instead of flooding console:

```typescript
// New warning category
export enum WarningCategory {
    // ... existing categories
    CacheUnavailable = 'CacheUnavailable'
}

// In LocalCacheManager or RunView
if (params.CacheLocal && !this.canUseCache(params)) {
    WarningManager.Instance.RecordWarning(
        'CacheLocal',
        `Cannot cache ${params.EntityName}: ${reason}`,
        WarningCategory.CacheUnavailable
    );
    // Continue with normal fetch
}
```

Reasons for fallback:
- Entity lacks `__mj_UpdatedAt` field
- IndexedDB unavailable
- Memory pressure exceeded threshold
- Cache storage error

---

## Implementation Phases

### Phase 1: TelemetryManager Core
1. Implement TelemetryManager in MJGlobal
2. Add telemetry levels and categories
3. Implement local storage for settings
4. Add pattern detection and duplicate tracking

### Phase 2: Integration Points
1. Add telemetry to RunView
2. Add telemetry to RunQuery
3. Add telemetry to BaseEngine
4. Add telemetry to AI providers

### Phase 3: Dashboard
1. Add Performance Monitor tab to System Diagnostics
2. Implement live event stream view
3. Implement pattern/duplicate analysis view
4. Add filtering and drill-down capabilities

### Phase 4: Server Transport
1. Add GraphQL resolver for server telemetry
2. Implement admin authorization
3. Add UI toggle to view client vs server telemetry

### Phase 5: LocalCacheManager Core
1. Implement LocalCacheManager singleton in MJCore
2. Add typed methods for datasets (matching existing ProviderBase API)
3. Add internal registry with stats tracking
4. Add initialization during app startup lifecycle

### Phase 6: LocalCacheManager Integration
1. Rewire ProviderBase.CacheDataset/GetCachedDataset to use LocalCacheManager
2. Add "Local Cache" tab to System Diagnostics dashboard
3. Display stats, entries, hit/miss ratio, and management actions
4. Add WarningManager integration for cache fallbacks

### Phase 7: CacheLocal Integration
1. Add CacheLocal params to RunView
2. Implement server-side freshness check
3. Add cache fingerprinting
4. Integrate with RunViews (batch)

### Phase 8: Engine-Level Caching
1. Enable CacheLocal by default for engine config loads
2. Add cache invalidation on entity changes
3. Performance testing and tuning

---

## Success Metrics

### TelemetryManager
- Can identify top 10 most-called RunViews in real-time
- Can detect duplicate entity loads from multiple call sites
- Provides actionable data for optimization decisions
- Minimal overhead when enabled (<5% performance impact)
- Zero overhead when disabled

### CacheLocal
- Reduces redundant data transfer by 50%+ for stable entities
- Sub-millisecond cache hit response time
- Graceful fallback with batched warnings
- Memory usage stays within configured limits

---

## Open Questions

1. **Telemetry in Production**: Should telemetry be available in production, or dev-only?
2. **Cache Invalidation**: Should entity saves automatically invalidate related caches?
3. **Cross-Tab Cache**: How to handle cache consistency across browser tabs?
4. **Service Worker**: Could a service worker improve cache performance?
5. **Compression**: Should cached data be compressed in IndexedDB?
