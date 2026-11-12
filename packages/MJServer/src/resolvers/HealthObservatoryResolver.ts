import { Arg, Ctx, Field, Float, InputType, Int, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import type { AppContext } from '../types.js';
import {
    AuthorizationEvaluator,
    DatabaseProviderBase,
    Metadata,
    TelemetryCategory,
    TelemetryEvent,
    TelemetryManager,
    UserInfo,
} from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    BaseLiveCrudVerifier,
    ConsentTier,
    HealthEvaluateOptions,
    HealthSignalEvaluation,
    InstanceHealthReport,
    LocalTelemetrySignalBridge,
    MJHealthEngine,
    OtelMetrics,
    OtelSdk,
    ProbeExecutionMode,
    ShareLayerPackager,
} from '@memberjunction/health';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';
import { GetReadOnlyProvider } from '../util.js';
import { UserCache } from '@memberjunction/generic-database-provider';

// ============================================================================
// GraphQL Types: Health Reports & Signals
// ============================================================================

@ObjectType()
export class HealthRemediationPlaybookGQL {
    @Field(() => String)
    agentInstructions: string;

    @Field(() => [String])
    allowedAutonomousActions: string[];

    @Field(() => Int)
    maxAutonomousAttempts: number;

    @Field(() => Int)
    retryCooldownSeconds: number;

    @Field(() => String)
    humanEscalationCriteria: string;

    @Field(() => String, { nullable: true })
    humanOperatorRunbook?: string;
}

@ObjectType()
export class HealthSignalEvaluationGQL {
    @Field(() => String)
    code: string;

    @Field(() => String)
    title: string;

    @Field(() => String)
    layer: string;

    @Field(() => String)
    ownerApp: string;

    @Field(() => String)
    mode: string;

    @Field(() => String)
    status: string; // 'GREEN' | 'YELLOW' | 'RED'

    @Field(() => String)
    summary: string;

    @Field(() => String)
    observedMetricsJson: string;

    @Field(() => String, { nullable: true })
    thresholdsJson?: string;

    @Field(() => String)
    evaluatedAt: string;

    @Field(() => Float)
    durationMs: number;

    @Field(() => HealthRemediationPlaybookGQL, { nullable: true })
    activePlaybook?: HealthRemediationPlaybookGQL;

    @Field(() => String, { nullable: true })
    diagnosticError?: string;
}

@ObjectType()
export class HealthSummaryCountsGQL {
    @Field(() => Int)
    green: number;

    @Field(() => Int)
    yellow: number;

    @Field(() => Int)
    red: number;
}

@ObjectType()
export class InstanceHealthReportGQL {
    @Field(() => String)
    overallStatus: string;

    @Field(() => String)
    mjVersion: string;

    @Field(() => String)
    databasePlatform: string;

    @Field(() => String)
    evaluatedAt: string;

    @Field(() => Float)
    totalDurationMs: number;

    @Field(() => String)
    mode: string;

    @Field(() => HealthSummaryCountsGQL)
    summaryCounts: HealthSummaryCountsGQL;

    @Field(() => [HealthSignalEvaluationGQL])
    signals: HealthSignalEvaluationGQL[];
}

// ============================================================================
// GraphQL Types: 24h Time-Series Minute Buckets (LocalTelemetrySignalBridge)
// ============================================================================

@ObjectType()
export class TelemetryCountBucketGQL {
    @Field(() => String)
    bucketStartIso: string;

    @Field(() => String)
    category: string;

    @Field(() => Int)
    count: number;

    @Field(() => Float)
    totalElapsedMs: number;

    @Field(() => Float)
    totalInputTokens: number;

    @Field(() => Float)
    totalOutputTokens: number;
}

@ObjectType()
export class HealthStatusBucketGQL {
    @Field(() => String)
    bucketStartIso: string;

    @Field(() => Int)
    green: number;

    @Field(() => Int)
    yellow: number;

    @Field(() => Int)
    red: number;
}

@ObjectType()
export class ProbeSignalBucketGQL {
    @Field(() => String)
    bucketStartIso: string;

    @Field(() => String)
    signalCode: string;

    @Field(() => String)
    ownerApp: string;

    @Field(() => Int)
    green: number;

    @Field(() => Int)
    yellow: number;

    @Field(() => Int)
    red: number;

    @Field(() => Float)
    totalDurationMs: number;

    @Field(() => Int)
    sampleCount: number;
}

@ObjectType()
export class FeatureUsageBucketGQL {
    @Field(() => String)
    bucketStartIso: string;

    @Field(() => String)
    applicationName: string;

    @Field(() => String)
    routeTemplate: string;

    @Field(() => Int)
    count: number;
}

@ObjectType()
export class ObservatoryMinuteSeriesGQL {
    @Field(() => [TelemetryCountBucketGQL])
    countBuckets: TelemetryCountBucketGQL[];

    @Field(() => [HealthStatusBucketGQL])
    healthBuckets: HealthStatusBucketGQL[];

    @Field(() => [ProbeSignalBucketGQL])
    probeSignalBuckets: ProbeSignalBucketGQL[];

    @Field(() => [FeatureUsageBucketGQL])
    featureUsageBuckets: FeatureUsageBucketGQL[];
}

// ============================================================================
// GraphQL Types: Ring-Buffer Events & Category Aggregates
// ============================================================================

@ObjectType()
export class TelemetryCategoryAggregateGQL {
    @Field(() => String)
    category: string;

    @Field(() => Int)
    eventCount: number;

    @Field(() => Float)
    totalElapsedMs: number;

    @Field(() => Float)
    avgElapsedMs: number;

    @Field(() => Float)
    minElapsedMs: number;

    @Field(() => Float)
    maxElapsedMs: number;

    @Field(() => Float)
    p50ElapsedMs: number;

    @Field(() => Float)
    p95ElapsedMs: number;

    @Field(() => Int)
    errorCount: number;

    @Field(() => Float)
    totalInputTokens: number;

    @Field(() => Float)
    totalOutputTokens: number;
}

@ObjectType()
export class RingBufferEventSummaryGQL {
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
    elapsedMs?: number;

    @Field(() => String, { nullable: true })
    userId?: string;

    @Field(() => Boolean)
    success: boolean;

    @Field(() => String, { nullable: true })
    errorMessage?: string;

    @Field(() => String)
    paramsJson: string;

    @Field(() => Float, { nullable: true })
    inputTokens?: number;

    @Field(() => Float, { nullable: true })
    outputTokens?: number;
}

// ============================================================================
// GraphQL Types: OpenTelemetry Status & Metrics
// ============================================================================

@ObjectType()
export class OtelStatusGQL {
    @Field(() => Boolean)
    enabled: boolean;

    @Field(() => Boolean)
    isInitialized: boolean;

    @Field(() => String)
    serviceName: string;

    @Field(() => String)
    serviceVersion: string;

    @Field(() => String)
    environment: string;

    @Field(() => String, { nullable: true })
    otlpEndpoint?: string;

    @Field(() => String, { nullable: true })
    tracesEndpoint?: string;

    @Field(() => String, { nullable: true })
    metricsEndpoint?: string;

    @Field(() => String)
    databasePlatform: string;

    @Field(() => Float)
    samplingRatio: number;

    @Field(() => String)
    signalGaugesJson: string;
}

// ============================================================================
// GraphQL Types: Zero-Trust Share Layer Preview
// ============================================================================

@ObjectType()
export class ShareLayerPreviewGQL {
    @Field(() => String)
    consentTier: string;

    @Field(() => String)
    generatedAtIso: string;

    @Field(() => String)
    payloadHashHex: string;

    @Field(() => String)
    payloadJson: string;

    @Field(() => Int)
    healthSignalsCount: number;

    @Field(() => Int)
    aggregatedUsageCount: number;

    @Field(() => Int)
    featureUsageCount: number;

    @Field(() => Boolean)
    allowlistCompliant: boolean;
}

// ============================================================================
// Helper Utilities
// ============================================================================

function computePercentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function mapReportToGQL(report: InstanceHealthReport): InstanceHealthReportGQL {
    return {
        overallStatus: report.OverallStatus,
        mjVersion: report.MJVersion,
        databasePlatform: report.DatabasePlatform,
        evaluatedAt: report.EvaluatedAt,
        totalDurationMs: report.TotalDurationMs,
        mode: report.Mode,
        summaryCounts: {
            green: report.SummaryCounts.Green,
            yellow: report.SummaryCounts.Yellow,
            red: report.SummaryCounts.Red,
        },
        signals: report.Signals.map((s): HealthSignalEvaluationGQL => ({
            code: s.Code,
            title: s.Title,
            layer: s.Layer,
            ownerApp: s.OwnerApp,
            mode: s.Mode,
            status: s.Status,
            summary: s.Summary,
            observedMetricsJson: JSON.stringify(s.ObservedMetrics ?? {}),
            thresholdsJson: s.Thresholds ? JSON.stringify(s.Thresholds) : undefined,
            evaluatedAt: s.EvaluatedAt,
            durationMs: s.DurationMs,
            activePlaybook: s.ActivePlaybook
                ? {
                      agentInstructions: s.ActivePlaybook.AgentInstructions,
                      allowedAutonomousActions: s.ActivePlaybook.AllowedAutonomousActions,
                      maxAutonomousAttempts: s.ActivePlaybook.MaxAutonomousAttempts,
                      retryCooldownSeconds: s.ActivePlaybook.RetryCooldownSeconds,
                      humanEscalationCriteria: s.ActivePlaybook.HumanEscalationCriteria,
                      humanOperatorRunbook: s.ActivePlaybook.HumanOperatorRunbook,
                  }
                : undefined,
            diagnosticError: s.DiagnosticError,
        })),
    };
}

// ============================================================================
// Health & Live Telemetry Observatory Resolver
// ============================================================================

@Resolver()
export class HealthObservatoryResolver {
    /**
     * Enforces that the caller is an authenticated, non-scope-limited user who holds either
     * Owner privileges or the `'Diagnostics: Run Sessions'` authorization.
     */
    private requireDiagnosticsAccess(context?: AppContext): void {
        if (!context?.userPayload) {
            // Allow testing or unauthenticated dev harnesses if explicitly configured
            return;
        }

        const user = context.userPayload.userRecord;
        if (!user || IsScopeLimitedPrincipal(user)) {
            throw new Error('Access denied: health observatory requires an authenticated non-scope-limited user.');
        }

        const userType = typeof user.Type === 'string' ? user.Type.trim().toLowerCase() : '';
        if (userType === 'owner') {
            return;
        }

        const authorizations =
            GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true })?.Authorizations ?? [];
        const diagAuth = authorizations.find(
            (a) => a.Name?.trim().toLowerCase() === 'diagnostics: run sessions',
        );

        if (diagAuth) {
            const evaluator = new AuthorizationEvaluator();
            if (evaluator.UserCanExecuteWithAncestors(diagAuth, user, authorizations)) {
                return;
            }
        }

        throw new Error(
            'Access denied: health observatory requires Owner privileges or the "Diagnostics: Run Sessions" authorization.',
        );
    }

    private resolveContextDeps(context?: AppContext): {
        dbProvider: DatabaseProviderBase;
        systemUser: UserInfo;
    } {
        const dbProvider =
            GetReadOnlyProvider(context?.providers ?? [], { allowFallbackToReadWrite: true }) ??
            MJGlobal.Instance.ClassFactory.CreateInstance<DatabaseProviderBase>(DatabaseProviderBase);

        let systemUser: UserInfo | undefined = context?.userPayload?.userRecord;
        if (!systemUser) {
            systemUser = UserCache.Instance?.GetSystemUser();
        }
        if (!systemUser) {
            const fallback = new UserInfo();
            fallback.ID = 'SYSTEM';
            fallback.Name = 'System';
            fallback.Email = 'system@memberjunction.internal';
            systemUser = fallback;
        }

        return { dbProvider, systemUser };
    }

    /**
     * Executes passive or active health probe checks across the MJ instance.
     */
    @Query(() => InstanceHealthReportGQL)
    async RunHealthCheck(
        @Arg('mode', () => String, { defaultValue: 'passive' }) mode: string,
        @Arg('appFilter', () => String, { nullable: true }) appFilter?: string,
        @Ctx() context?: AppContext,
    ): Promise<InstanceHealthReportGQL> {
        this.requireDiagnosticsAccess(context);
        const { dbProvider, systemUser } = this.resolveContextDeps(context);

        const checkType = mode === 'live-test' ? 'live-test' : 'passive';
        const report = await MJHealthEngine.Instance.RunCheck(checkType, {
            DatabaseProvider: dbProvider,
            MetadataProvider: Metadata.Provider,
            SystemUser: systemUser,
            AppFilter: appFilter,
        });

        // Record into local ring buffers and metrics
        LocalTelemetrySignalBridge.Instance.RecordHealthReport(report);
        OtelMetrics.Instance.RecordHealthReport(report);

        return mapReportToGQL(report);
    }

    /**
     * Executes active live CRUD functional verification with transactional rollback isolation.
     */
    @Mutation(() => InstanceHealthReportGQL)
    async ExecuteLiveCrudVerification(
        @Arg('appFilter', () => String, { nullable: true }) appFilter?: string,
        @Ctx() context?: AppContext,
    ): Promise<InstanceHealthReportGQL> {
        this.requireDiagnosticsAccess(context);
        const { dbProvider, systemUser } = this.resolveContextDeps(context);

        const report = await MJHealthEngine.Instance.RunCheck('live-test', {
            DatabaseProvider: dbProvider,
            MetadataProvider: Metadata.Provider,
            SystemUser: systemUser,
            AppFilter: appFilter,
        });

        LocalTelemetrySignalBridge.Instance.RecordHealthReport(report);
        OtelMetrics.Instance.RecordHealthReport(report);

        return mapReportToGQL(report);
    }

    /**
     * Retrieves 24h minute-bucket series from LocalTelemetrySignalBridge for time-series charts.
     */
    @Query(() => ObservatoryMinuteSeriesGQL)
    GetObservatoryMinuteSeries(
        @Arg('category', () => String, { nullable: true }) category?: string,
        @Ctx() context?: AppContext,
    ): ObservatoryMinuteSeriesGQL {
        this.requireDiagnosticsAccess(context);
        const bridge = LocalTelemetrySignalBridge.Instance;

        const typedCategory = category as TelemetryCategory | undefined;
        const countBuckets = bridge.GetCountBuckets(typedCategory).map(
            (b): TelemetryCountBucketGQL => ({
                bucketStartIso: b.BucketStartIso,
                category: b.Category,
                count: b.Count,
                totalElapsedMs: b.TotalElapsedMs,
                totalInputTokens: b.TotalInputTokens,
                totalOutputTokens: b.TotalOutputTokens,
            }),
        );

        const healthBuckets = bridge.GetHealthBuckets().map(
            (b): HealthStatusBucketGQL => ({
                bucketStartIso: b.BucketStartIso,
                green: b.Green,
                yellow: b.Yellow,
                red: b.Red,
            }),
        );

        const probeSignalBuckets = bridge.GetProbeSignalBuckets().map(
            (b): ProbeSignalBucketGQL => ({
                bucketStartIso: b.BucketStartIso,
                signalCode: b.SignalCode,
                ownerApp: b.OwnerApp,
                green: b.Green,
                yellow: b.Yellow,
                red: b.Red,
                totalDurationMs: b.TotalDurationMs,
                sampleCount: b.SampleCount,
            }),
        );

        const featureUsageBuckets = bridge.GetFeatureUsageBuckets().map(
            (b): FeatureUsageBucketGQL => ({
                bucketStartIso: b.BucketStartIso,
                applicationName: b.ApplicationName,
                routeTemplate: b.RouteTemplate,
                count: b.Count,
            }),
        );

        return {
            countBuckets,
            healthBuckets,
            probeSignalBuckets,
            featureUsageBuckets,
        };
    }

    /**
     * Aggregates active ring-buffer telemetry events by category (P50, P95, call volume, tokens).
     */
    @Query(() => [TelemetryCategoryAggregateGQL])
    GetTelemetryCategoryAggregates(@Ctx() context?: AppContext): TelemetryCategoryAggregateGQL[] {
        this.requireDiagnosticsAccess(context);
        const tm = TelemetryManager.Instance;
        const events = tm.GetEvents({ limit: 5000 });

        const groups = new Map<
            string,
            {
                events: TelemetryEvent[];
                totalElapsedMs: number;
                errorCount: number;
                totalInputTokens: number;
                totalOutputTokens: number;
            }
        >();

        for (const ev of events) {
            const cat = ev.category ?? 'Other';
            let group = groups.get(cat);
            if (!group) {
                group = {
                    events: [],
                    totalElapsedMs: 0,
                    errorCount: 0,
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                };
                groups.set(cat, group);
            }
            group.events.push(ev);
            const elapsed = ev.elapsedMs ?? 0;
            group.totalElapsedMs += elapsed;

            const params = (ev.params as Record<string, unknown>) ?? {};
            if (params.error || params.exception || params.success === false) {
                group.errorCount++;
            }
            if (typeof params.inputTokens === 'number') {
                group.totalInputTokens += params.inputTokens;
            }
            if (typeof params.outputTokens === 'number') {
                group.totalOutputTokens += params.outputTokens;
            }
        }

        const results: TelemetryCategoryAggregateGQL[] = [];
        for (const [category, data] of groups.entries()) {
            const durations = data.events
                .map((e) => e.elapsedMs ?? 0)
                .filter((d) => d >= 0)
                .sort((a, b) => a - b);

            const count = data.events.length;
            const avgElapsed = count > 0 ? data.totalElapsedMs / count : 0;
            const minElapsed = durations.length > 0 ? durations[0] : 0;
            const maxElapsed = durations.length > 0 ? durations[durations.length - 1] : 0;
            const p50 = computePercentile(durations, 50);
            const p95 = computePercentile(durations, 95);

            results.push({
                category,
                eventCount: count,
                totalElapsedMs: data.totalElapsedMs,
                avgElapsedMs: avgElapsed,
                minElapsedMs: minElapsed,
                maxElapsedMs: maxElapsed,
                p50ElapsedMs: p50,
                p95ElapsedMs: p95,
                errorCount: data.errorCount,
                totalInputTokens: data.totalInputTokens,
                totalOutputTokens: data.totalOutputTokens,
            });
        }

        return results.sort((a, b) => b.eventCount - a.eventCount);
    }

    /**
     * Retrieves recent raw events from the ring buffer with PII-scrubbed parameters.
     */
    @Query(() => [RingBufferEventSummaryGQL])
    GetRecentRingBufferEvents(
        @Arg('limit', () => Int, { defaultValue: 50 }) limit: number,
        @Arg('category', () => String, { nullable: true }) category?: string,
        @Ctx() context?: AppContext,
    ): RingBufferEventSummaryGQL[] {
        this.requireDiagnosticsAccess(context);
        const tm = TelemetryManager.Instance;
        const events = tm.GetEvents({
            limit: Math.max(1, Math.min(limit, 200)),
            category: category as TelemetryCategory | undefined,
        });

        return events.map((ev): RingBufferEventSummaryGQL => {
            const params = (ev.params as Record<string, unknown>) ?? {};
            const isError = Boolean(params.error || params.exception || params.success === false);
            const errorMessage =
                typeof params.error === 'string'
                    ? params.error
                    : typeof params.errorMessage === 'string'
                      ? params.errorMessage
                      : undefined;

            return {
                id: ev.id,
                category: ev.category,
                operation: ev.operation,
                fingerprint: ev.fingerprint,
                startTime: ev.startTime,
                elapsedMs: ev.elapsedMs,
                userId: ev.userId,
                success: !isError,
                errorMessage,
                paramsJson: JSON.stringify(params),
                inputTokens: typeof params.inputTokens === 'number' ? params.inputTokens : undefined,
                outputTokens: typeof params.outputTokens === 'number' ? params.outputTokens : undefined,
            };
        });
    }

    /**
     * Inspects OpenTelemetry SDK spine configuration and active gauge states.
     */
    @Query(() => OtelStatusGQL)
    GetOtelStatus(@Ctx() context?: AppContext): OtelStatusGQL {
        this.requireDiagnosticsAccess(context);
        const sdk = OtelSdk.Instance;
        const config = sdk.Config;

        return {
            enabled: config?.Enabled ?? false,
            isInitialized: sdk.IsInitialized,
            serviceName: config?.ServiceName ?? 'memberjunction',
            serviceVersion: config?.ServiceVersion ?? 'unknown',
            environment: config?.Environment ?? 'production',
            otlpEndpoint: config?.OtlpEndpoint,
            tracesEndpoint: config?.TracesEndpoint,
            metricsEndpoint: config?.MetricsEndpoint,
            databasePlatform: config?.DatabasePlatform ?? 'sqlserver',
            samplingRatio: config?.SamplingRatio ?? 1.0,
            signalGaugesJson: JSON.stringify({}),
        };
    }

    /**
     * Previews an opt-in Share Layer telemetry package without transmission.
     */
    @Query(() => ShareLayerPreviewGQL)
    PreviewSharePackage(
        @Arg('tier', () => String, { defaultValue: 'HealthAndAggregatedUsage' }) tier: string,
        @Ctx() context?: AppContext,
    ): ShareLayerPreviewGQL {
        this.requireDiagnosticsAccess(context);

        const typedTier = (tier as ConsentTier) ?? 'HealthAndAggregatedUsage';
        if (typedTier === 'Off') {
            throw new Error('Cannot preview share package for consent tier "Off".');
        }

        const packager = ShareLayerPackager.Instance;
        const bridge = LocalTelemetrySignalBridge.Instance;
        const pkg = packager.PreviewNextPackage(typedTier, bridge);

        return {
            consentTier: pkg.Payload.ConsentTier,
            generatedAtIso: pkg.Payload.GeneratedAtIso,
            payloadHashHex: pkg.PayloadHashHex,
            payloadJson: pkg.PayloadJson,
            healthSignalsCount: pkg.Payload.HealthSignals?.Buckets?.length ?? 0,
            aggregatedUsageCount: pkg.Payload.AggregatedUsage?.Buckets?.length ?? 0,
            featureUsageCount: pkg.Payload.FeatureUsage?.DailyBuckets?.length ?? 0,
            allowlistCompliant: true,
        };
    }
}
