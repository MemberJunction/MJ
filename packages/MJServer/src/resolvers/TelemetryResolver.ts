import { Arg, Ctx, Field, InputType, Int, ObjectType, Query, Resolver, Float } from 'type-graphql';
import { AppContext } from '../types.js';
import {
    TelemetryManager,
    TelemetryCategory,
    TelemetryInsightSeverity
} from '@memberjunction/core';

// ============================================================================
// GraphQL Types for TelemetryEvent
// ============================================================================

@ObjectType()
export class MemorySnapshotGQL {
    @Field(() => Float)
    heapUsed: number;

    @Field(() => Float)
    heapTotal: number;

    @Field(() => Float)
    timestamp: number;
}

@ObjectType()
export class TelemetryEventGQL {
    @Field(() => String)
    id: string;

    @Field(() => String)
    category: string;

    @Field(() => String)
    operation: string;

    @Field(() => String)
    fingerprint: string;

    @Field(() => Float)
    startTime: number;

    @Field(() => Float, { nullable: true })
    endTime?: number;

    @Field(() => Float, { nullable: true })
    elapsedMs?: number;

    @Field(() => String, { nullable: true })
    userId?: string;

    @Field(() => String)
    params: string; // JSON stringified

    @Field(() => [String], { nullable: true })
    tags?: string[];

    @Field(() => String, { nullable: true })
    stackTrace?: string;

    @Field(() => MemorySnapshotGQL, { nullable: true })
    memoryBefore?: MemorySnapshotGQL;

    @Field(() => MemorySnapshotGQL, { nullable: true })
    memoryAfter?: MemorySnapshotGQL;

    @Field(() => String, { nullable: true })
    parentEventId?: string;
}

// ============================================================================
// GraphQL Types for TelemetryPattern
// ============================================================================

@ObjectType()
export class CallerLocationGQL {
    @Field(() => String)
    location: string;

    @Field(() => Int)
    count: number;
}

@ObjectType()
export class TelemetryPatternGQL {
    @Field(() => String)
    fingerprint: string;

    @Field(() => String)
    category: string;

    @Field(() => String)
    operation: string;

    @Field(() => String)
    sampleParams: string; // JSON stringified

    @Field(() => Int)
    count: number;

    @Field(() => Float)
    totalElapsedMs: number;

    @Field(() => Float)
    avgElapsedMs: number;

    @Field(() => Float)
    minElapsedMs: number;

    @Field(() => Float)
    maxElapsedMs: number;

    @Field(() => [CallerLocationGQL])
    callerLocations: CallerLocationGQL[];

    @Field(() => Float)
    firstSeen: number;

    @Field(() => Float)
    lastSeen: number;

    @Field(() => Float)
    windowStartTime: number;
}

// ============================================================================
// GraphQL Types for TelemetryInsight
// ============================================================================

@ObjectType()
export class TelemetryInsightGQL {
    @Field(() => String)
    id: string;

    @Field(() => String)
    severity: string;

    @Field(() => String)
    analyzerName: string;

    @Field(() => String)
    category: string;

    @Field(() => String)
    title: string;

    @Field(() => String)
    message: string;

    @Field(() => String)
    suggestion: string;

    @Field(() => [String])
    relatedEventIds: string[];

    @Field(() => String, { nullable: true })
    entityName?: string;

    @Field(() => String, { nullable: true })
    metadata?: string; // JSON stringified

    @Field(() => Float)
    timestamp: number;
}

// ============================================================================
// GraphQL Types for Statistics
// ============================================================================

@ObjectType()
export class CategoryStatsGQL {
    @Field(() => String)
    category: string;

    @Field(() => Int)
    events: number;

    @Field(() => Float)
    avgMs: number;
}

@ObjectType()
export class TelemetryStatsGQL {
    @Field(() => Int)
    totalEvents: number;

    @Field(() => Int)
    totalPatterns: number;

    @Field(() => Int)
    totalInsights: number;

    @Field(() => Int)
    activeEvents: number;

    @Field(() => [CategoryStatsGQL])
    byCategory: CategoryStatsGQL[];
}

// ============================================================================
// GraphQL Types for Settings
// ============================================================================

@ObjectType()
export class CategoryOverrideGQL {
    @Field(() => String)
    category: string;

    @Field(() => Boolean)
    enabled: boolean;

    @Field(() => String, { nullable: true })
    level?: string;
}

@ObjectType()
export class AutoTrimSettingsGQL {
    @Field(() => Boolean)
    enabled: boolean;

    @Field(() => Int, { nullable: true })
    maxEvents?: number;

    @Field(() => Int, { nullable: true })
    maxAgeMs?: number;
}

@ObjectType()
export class DuplicateDetectionSettingsGQL {
    @Field(() => Boolean)
    enabled: boolean;

    @Field(() => Int)
    windowMs: number;
}

@ObjectType()
export class AnalyzerSettingsGQL {
    @Field(() => Boolean)
    enabled: boolean;

    @Field(() => Int)
    dedupeWindowMs: number;
}

@ObjectType()
export class TelemetrySettingsGQL {
    @Field(() => Boolean)
    enabled: boolean;

    @Field(() => String)
    level: string;

    @Field(() => [CategoryOverrideGQL])
    categoryOverrides: CategoryOverrideGQL[];

    @Field(() => AutoTrimSettingsGQL)
    autoTrim: AutoTrimSettingsGQL;

    @Field(() => DuplicateDetectionSettingsGQL)
    duplicateDetection: DuplicateDetectionSettingsGQL;

    @Field(() => AnalyzerSettingsGQL)
    analyzers: AnalyzerSettingsGQL;
}

// ============================================================================
// Input Types
// ============================================================================

@InputType()
export class TelemetryEventFilterInput {
    @Field(() => String, { nullable: true })
    category?: string;

    @Field(() => String, { nullable: true })
    operation?: string;

    @Field(() => Float, { nullable: true })
    minElapsedMs?: number;

    @Field(() => Float, { nullable: true })
    since?: number;

    @Field(() => Int, { nullable: true })
    limit?: number;
}

@InputType()
export class TelemetryPatternFilterInput {
    @Field(() => String, { nullable: true })
    category?: string;

    @Field(() => Int, { nullable: true })
    minCount?: number;

    @Field(() => String, { nullable: true })
    sortBy?: string;
}

@InputType()
export class TelemetryInsightFilterInput {
    @Field(() => String, { nullable: true })
    severity?: string;

    @Field(() => String, { nullable: true })
    category?: string;

    @Field(() => String, { nullable: true })
    entityName?: string;

    @Field(() => Int, { nullable: true })
    limit?: number;
}

// ============================================================================
// Resolver
// ============================================================================

@Resolver()
export class TelemetryResolver {
    /**
     * Get telemetry settings
     * Accessible to any authenticated user - telemetry data is not sensitive
     */
    @Query(() => TelemetrySettingsGQL)
    GetServerTelemetrySettings(@Ctx() _context: AppContext): TelemetrySettingsGQL {
        const tm = TelemetryManager.Instance;
        const settings = tm.Settings;

        // Convert categoryOverrides map to array
        const categoryOverrides: CategoryOverrideGQL[] = [];
        if (settings.categoryOverrides) {
            for (const [category, override] of Object.entries(settings.categoryOverrides)) {
                if (override) {
                    categoryOverrides.push({
                        category,
                        enabled: override.enabled,
                        level: override.level
                    });
                }
            }
        }

        return {
            enabled: settings.enabled,
            level: settings.level,
            categoryOverrides,
            autoTrim: {
                enabled: settings.autoTrim.enabled,
                maxEvents: settings.autoTrim.maxEvents,
                maxAgeMs: settings.autoTrim.maxAgeMs
            },
            duplicateDetection: {
                enabled: settings.duplicateDetection.enabled,
                windowMs: settings.duplicateDetection.windowMs
            },
            analyzers: {
                enabled: settings.analyzers.enabled,
                dedupeWindowMs: settings.analyzers.dedupeWindowMs
            }
        };
    }

    /**
     * Get telemetry statistics
     */
    @Query(() => TelemetryStatsGQL)
    GetServerTelemetryStats(@Ctx() _context: AppContext): TelemetryStatsGQL {
        const tm = TelemetryManager.Instance;
        const stats = tm.GetStats();

        const byCategory: CategoryStatsGQL[] = Object.entries(stats.byCategory).map(
            ([category, data]) => ({
                category,
                events: data.events,
                avgMs: data.avgMs
            })
        );

        return {
            totalEvents: stats.totalEvents,
            totalPatterns: stats.totalPatterns,
            totalInsights: stats.totalInsights,
            activeEvents: stats.activeEvents,
            byCategory
        };
    }

    /**
     * Get telemetry events with optional filtering
     */
    @Query(() => [TelemetryEventGQL])
    GetServerTelemetryEvents(
        @Ctx() _context: AppContext,
        @Arg('filter', () => TelemetryEventFilterInput, { nullable: true }) filter?: TelemetryEventFilterInput
    ): TelemetryEventGQL[] {
        const tm = TelemetryManager.Instance;

        const events = tm.GetEvents({
            category: filter?.category as TelemetryCategory | undefined,
            operation: filter?.operation,
            minElapsedMs: filter?.minElapsedMs ?? undefined,
            since: filter?.since ?? undefined,
            limit: filter?.limit ?? undefined
        });

        return events.map(e => ({
            id: e.id,
            category: e.category,
            operation: e.operation,
            fingerprint: e.fingerprint,
            startTime: e.startTime,
            endTime: e.endTime,
            elapsedMs: e.elapsedMs,
            userId: e.userId,
            params: JSON.stringify(e.params),
            tags: e.tags,
            stackTrace: e.stackTrace,
            memoryBefore: e.memoryBefore,
            memoryAfter: e.memoryAfter,
            parentEventId: e.parentEventId
        }));
    }

    /**
     * Get telemetry patterns with optional filtering
     */
    @Query(() => [TelemetryPatternGQL])
    GetServerTelemetryPatterns(
        @Ctx() _context: AppContext,
        @Arg('filter', () => TelemetryPatternFilterInput, { nullable: true }) filter?: TelemetryPatternFilterInput
    ): TelemetryPatternGQL[] {
        const tm = TelemetryManager.Instance;

        const patterns = tm.GetPatterns({
            category: filter?.category as TelemetryCategory | undefined,
            minCount: filter?.minCount ?? undefined,
            sortBy: filter?.sortBy as 'count' | 'totalTime' | 'avgTime' | undefined
        });

        return patterns.map(p => {
            // Convert Map to array
            const callerLocations: CallerLocationGQL[] = [];
            p.callerLocations.forEach((count, location) => {
                callerLocations.push({ location, count });
            });

            return {
                fingerprint: p.fingerprint,
                category: p.category,
                operation: p.operation,
                sampleParams: JSON.stringify(p.sampleParams),
                count: p.count,
                totalElapsedMs: p.totalElapsedMs,
                avgElapsedMs: p.avgElapsedMs,
                minElapsedMs: p.minElapsedMs === Infinity ? 0 : p.minElapsedMs,
                maxElapsedMs: p.maxElapsedMs,
                callerLocations,
                firstSeen: p.firstSeen,
                lastSeen: p.lastSeen,
                windowStartTime: p.windowStartTime
            };
        });
    }

    /**
     * Get telemetry insights with optional filtering
     */
    @Query(() => [TelemetryInsightGQL])
    GetServerTelemetryInsights(
        @Ctx() _context: AppContext,
        @Arg('filter', () => TelemetryInsightFilterInput, { nullable: true }) filter?: TelemetryInsightFilterInput
    ): TelemetryInsightGQL[] {
        const tm = TelemetryManager.Instance;

        const insights = tm.GetInsights({
            severity: filter?.severity as TelemetryInsightSeverity | undefined,
            category: filter?.category,
            entityName: filter?.entityName,
            limit: filter?.limit ?? undefined
        });

        return insights.map(i => ({
            id: i.id,
            severity: i.severity,
            analyzerName: i.analyzerName,
            category: i.category,
            title: i.title,
            message: i.message,
            suggestion: i.suggestion,
            relatedEventIds: i.relatedEventIds,
            entityName: i.entityName,
            metadata: i.metadata ? JSON.stringify(i.metadata) : undefined,
            timestamp: i.timestamp
        }));
    }

    /**
     * Get duplicate patterns (patterns with count >= threshold)
     */
    @Query(() => [TelemetryPatternGQL])
    GetServerTelemetryDuplicates(
        @Ctx() _context: AppContext,
        @Arg('minCount', () => Int, { defaultValue: 2 }) minCount: number
    ): TelemetryPatternGQL[] {
        const tm = TelemetryManager.Instance;
        const patterns = tm.GetDuplicates(minCount);

        return patterns.map(p => {
            const callerLocations: CallerLocationGQL[] = [];
            p.callerLocations.forEach((count, location) => {
                callerLocations.push({ location, count });
            });

            return {
                fingerprint: p.fingerprint,
                category: p.category,
                operation: p.operation,
                sampleParams: JSON.stringify(p.sampleParams),
                count: p.count,
                totalElapsedMs: p.totalElapsedMs,
                avgElapsedMs: p.avgElapsedMs,
                minElapsedMs: p.minElapsedMs === Infinity ? 0 : p.minElapsedMs,
                maxElapsedMs: p.maxElapsedMs,
                callerLocations,
                firstSeen: p.firstSeen,
                lastSeen: p.lastSeen,
                windowStartTime: p.windowStartTime
            };
        });
    }

    /**
     * Get currently active (in-progress) events
     */
    @Query(() => [TelemetryEventGQL])
    GetServerTelemetryActiveEvents(@Ctx() _context: AppContext): TelemetryEventGQL[] {
        const tm = TelemetryManager.Instance;
        const events = tm.GetActiveEvents();

        return events.map(e => ({
            id: e.id,
            category: e.category,
            operation: e.operation,
            fingerprint: e.fingerprint,
            startTime: e.startTime,
            endTime: e.endTime,
            elapsedMs: e.elapsedMs,
            userId: e.userId,
            params: JSON.stringify(e.params),
            tags: e.tags,
            stackTrace: e.stackTrace,
            memoryBefore: e.memoryBefore,
            memoryAfter: e.memoryAfter,
            parentEventId: e.parentEventId
        }));
    }

    // Note: Server telemetry settings are configured via mj.config.cjs and cannot be changed at runtime.
    // Use the telemetry config section in mj.config.cjs to enable/disable or change the level.
    // Example:
    //   telemetry: {
    //     enabled: true,
    //     level: 'standard'  // 'minimal' | 'standard' | 'verbose' | 'debug'
    //   }
    // Or set MJ_TELEMETRY_ENABLED=false environment variable to disable.
}
