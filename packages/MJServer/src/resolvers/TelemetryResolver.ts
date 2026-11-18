import { Arg, Ctx, Field, InputType, Int, ObjectType, Query, Resolver, Float } from 'type-graphql';
import { AppContext } from '../types.js';
import {
    TelemetryManager,
    TelemetryCategory,
    TelemetryInsightSeverity,
    AuthorizationEvaluator,
} from '@memberjunction/core';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';
import { GetReadOnlyProvider } from '../util.js';

// ============================================================================
// GraphQL Types for TelemetryEvent
// ============================================================================

@ObjectType()
export class MemorySnapshotGQL {
    @Field(() => Float)
    heapUsed: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    heapTotal: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    timestamp: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

@ObjectType()
export class TelemetryEventGQL {
    @Field(() => String)
    id: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    category: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    operation: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    fingerprint: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    startTime: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float, { nullable: true })
    endTime?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float, { nullable: true })
    elapsedMs?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    userId?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    params: string; // JSON stringified — case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => [String], { nullable: true })
    tags?: string[];  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    stackTrace?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => MemorySnapshotGQL, { nullable: true })
    memoryBefore?: MemorySnapshotGQL;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => MemorySnapshotGQL, { nullable: true })
    memoryAfter?: MemorySnapshotGQL;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    parentEventId?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

// ============================================================================
// GraphQL Types for TelemetryPattern
// ============================================================================

@ObjectType()
export class CallerLocationGQL {
    @Field(() => String)
    location: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int)
    count: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

@ObjectType()
export class TelemetryPatternGQL {
    @Field(() => String)
    fingerprint: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    category: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    operation: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    sampleParams: string; // JSON stringified — case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int)
    count: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    totalElapsedMs: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    avgElapsedMs: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    minElapsedMs: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    maxElapsedMs: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => [CallerLocationGQL])
    callerLocations: CallerLocationGQL[];  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    firstSeen: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    lastSeen: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    windowStartTime: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

// ============================================================================
// GraphQL Types for TelemetryInsight
// ============================================================================

@ObjectType()
export class TelemetryInsightGQL {
    @Field(() => String)
    id: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    severity: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    analyzerName: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    category: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    title: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    message: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    suggestion: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => [String])
    relatedEventIds: string[];  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    entityName?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    metadata?: string; // JSON stringified — case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    timestamp: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

// ============================================================================
// GraphQL Types for Statistics
// ============================================================================

@ObjectType()
export class CategoryStatsGQL {
    @Field(() => String)
    category: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int)
    events: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float)
    avgMs: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

@ObjectType()
export class TelemetryStatsGQL {
    @Field(() => Int)
    totalEvents: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int)
    totalPatterns: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int)
    totalInsights: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int)
    activeEvents: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => [CategoryStatsGQL])
    byCategory: CategoryStatsGQL[];  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

// ============================================================================
// GraphQL Types for Settings
// ============================================================================

@ObjectType()
export class CategoryOverrideGQL {
    @Field(() => String)
    category: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Boolean)
    enabled: boolean;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    level?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

@ObjectType()
export class AutoTrimSettingsGQL {
    @Field(() => Boolean)
    enabled: boolean;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int, { nullable: true })
    maxEvents?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int, { nullable: true })
    maxAgeMs?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

@ObjectType()
export class DuplicateDetectionSettingsGQL {
    @Field(() => Boolean)
    enabled: boolean;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int)
    windowMs: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

@ObjectType()
export class AnalyzerSettingsGQL {
    @Field(() => Boolean)
    enabled: boolean;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int)
    dedupeWindowMs: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

@ObjectType()
export class TelemetrySettingsGQL {
    @Field(() => Boolean)
    enabled: boolean;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    level: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => [CategoryOverrideGQL])
    categoryOverrides: CategoryOverrideGQL[];  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => AutoTrimSettingsGQL)
    autoTrim: AutoTrimSettingsGQL;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => DuplicateDetectionSettingsGQL)
    duplicateDetection: DuplicateDetectionSettingsGQL;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => AnalyzerSettingsGQL)
    analyzers: AnalyzerSettingsGQL;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

// ============================================================================
// Input Types
// ============================================================================

@InputType()
export class TelemetryEventFilterInput {
    @Field(() => String, { nullable: true })
    category?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    operation?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float, { nullable: true })
    minElapsedMs?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Float, { nullable: true })
    since?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int, { nullable: true })
    limit?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

@InputType()
export class TelemetryPatternFilterInput {
    @Field(() => String, { nullable: true })
    category?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int, { nullable: true })
    minCount?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    sortBy?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

@InputType()
export class TelemetryInsightFilterInput {
    @Field(() => String, { nullable: true })
    severity?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    category?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    entityName?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => Int, { nullable: true })
    limit?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

// ============================================================================
// Resolver
// ============================================================================

@Resolver()
export class TelemetryResolver {
    /**
     * Enforces that the caller is an authenticated, non-scope-limited user who holds either
     * Owner privileges or the `'Diagnostics: Run Sessions'` authorization.
     */
    private requireDiagnosticsAccess(context: AppContext): void {
        const user = context?.userPayload?.userRecord;
        if (!user || IsScopeLimitedPrincipal(user)) {
            throw new Error('Access denied: server telemetry requires an authenticated non-scope-limited user.');
        }
        if (user.Type?.trim().toLowerCase() === 'owner') {
            return;
        }
        const authorizations = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true })?.Authorizations ?? [];
        const diagAuth = authorizations.find(
            (a) => a.Name?.trim().toLowerCase() === 'diagnostics: run sessions'
        );
        if (diagAuth) {
            const evaluator = new AuthorizationEvaluator();
            if (evaluator.UserCanExecuteWithAncestors(diagAuth, user, authorizations)) {
                return;
            }
        }
        throw new Error('Access denied: server telemetry requires Owner privileges or the "Diagnostics: Run Sessions" authorization.');
    }

    /**
     * Get telemetry settings
     * Requires Owner privileges or 'Diagnostics: Run Sessions' authorization
     */
    @Query(() => TelemetrySettingsGQL)
    GetServerTelemetrySettings(@Ctx() context: AppContext): TelemetrySettingsGQL {
        this.requireDiagnosticsAccess(context);
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
    GetServerTelemetryStats(@Ctx() context: AppContext): TelemetryStatsGQL {
        this.requireDiagnosticsAccess(context);
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
        @Ctx() context: AppContext,
        @Arg('filter', () => TelemetryEventFilterInput, { nullable: true }) filter?: TelemetryEventFilterInput
    ): TelemetryEventGQL[] {
        this.requireDiagnosticsAccess(context);
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
        @Ctx() context: AppContext,
        @Arg('filter', () => TelemetryPatternFilterInput, { nullable: true }) filter?: TelemetryPatternFilterInput
    ): TelemetryPatternGQL[] {
        this.requireDiagnosticsAccess(context);
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
        @Ctx() context: AppContext,
        @Arg('filter', () => TelemetryInsightFilterInput, { nullable: true }) filter?: TelemetryInsightFilterInput
    ): TelemetryInsightGQL[] {
        this.requireDiagnosticsAccess(context);
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
        @Ctx() context: AppContext,
        @Arg('minCount', () => Int, { defaultValue: 2 }) minCount: number
    ): TelemetryPatternGQL[] {
        this.requireDiagnosticsAccess(context);
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
    GetServerTelemetryActiveEvents(@Ctx() context: AppContext): TelemetryEventGQL[] {
        this.requireDiagnosticsAccess(context);
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
