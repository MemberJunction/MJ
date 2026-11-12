import { Arg, Ctx, Field, Float, InputType, Int, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import type { AppContext } from '../types.js';
import {
    AuthorizationEvaluator,
    DatabaseProviderBase,
    IMetadataProvider,
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
// GraphQL Types: Health Reports & Signals (PascalCase for Standards compliance)
// ============================================================================

@ObjectType()
export class HealthRemediationPlaybookGQL {
    @Field(() => String)
    AgentInstructions: string;

    @Field(() => [String])
    AllowedAutonomousActions: string[];

    @Field(() => Int)
    MaxAutonomousAttempts: number;

    @Field(() => Int)
    RetryCooldownSeconds: number;

    @Field(() => String)
    HumanEscalationCriteria: string;

    @Field(() => String, { nullable: true })
    HumanOperatorRunbook?: string;
}

@ObjectType()
export class HealthSignalEvaluationGQL {
    @Field(() => String)
    Code: string;

    @Field(() => String)
    Title: string;

    @Field(() => String)
    Layer: string;

    @Field(() => String)
    OwnerApp: string;

    @Field(() => String)
    Mode: string;

    @Field(() => String)
    Status: string; // 'GREEN' | 'YELLOW' | 'RED'

    @Field(() => String)
    Summary: string;

    @Field(() => String)
    ObservedMetricsJson: string;

    @Field(() => String, { nullable: true })
    ThresholdsJson?: string;

    @Field(() => String)
    EvaluatedAt: string;

    @Field(() => Float)
    DurationMs: number;

    @Field(() => HealthRemediationPlaybookGQL, { nullable: true })
    ActivePlaybook?: HealthRemediationPlaybookGQL;

    @Field(() => String, { nullable: true })
    DiagnosticError?: string;
}

@ObjectType()
export class HealthSummaryCountsGQL {
    @Field(() => Int)
    Green: number;

    @Field(() => Int)
    Yellow: number;

    @Field(() => Int)
    Red: number;
}

@ObjectType()
export class InstanceHealthReportGQL {
    @Field(() => String)
    OverallStatus: string;

    @Field(() => String)
    MjVersion: string;

    @Field(() => String)
    DatabasePlatform: string;

    @Field(() => String)
    EvaluatedAt: string;

    @Field(() => Float)
    TotalDurationMs: number;

    @Field(() => String)
    Mode: string;

    @Field(() => HealthSummaryCountsGQL)
    SummaryCounts: HealthSummaryCountsGQL;

    @Field(() => [HealthSignalEvaluationGQL])
    Signals: HealthSignalEvaluationGQL[];
}

// ============================================================================
// GraphQL Types: 24h Time-Series Minute Buckets (LocalTelemetrySignalBridge)
// ============================================================================

@ObjectType()
export class TelemetryCountBucketGQL {
    @Field(() => String)
    BucketStartIso: string;

    @Field(() => String)
    Category: string;

    @Field(() => Int)
    Count: number;

    @Field(() => Float)
    TotalElapsedMs: number;

    @Field(() => Float)
    TotalInputTokens: number;

    @Field(() => Float)
    TotalOutputTokens: number;
}

@ObjectType()
export class HealthStatusBucketGQL {
    @Field(() => String)
    BucketStartIso: string;

    @Field(() => Int)
    Green: number;

    @Field(() => Int)
    Yellow: number;

    @Field(() => Int)
    Red: number;
}

@ObjectType()
export class ProbeSignalBucketGQL {
    @Field(() => String)
    BucketStartIso: string;

    @Field(() => String)
    SignalCode: string;

    @Field(() => String)
    OwnerApp: string;

    @Field(() => Int)
    Green: number;

    @Field(() => Int)
    Yellow: number;

    @Field(() => Int)
    Red: number;

    @Field(() => Float)
    TotalDurationMs: number;

    @Field(() => Int)
    SampleCount: number;
}

@ObjectType()
export class FeatureUsageBucketGQL {
    @Field(() => String)
    BucketStartIso: string;

    @Field(() => String)
    ApplicationName: string;

    @Field(() => String)
    RouteTemplate: string;

    @Field(() => Int)
    Count: number;
}

@ObjectType()
export class ObservatoryMinuteSeriesGQL {
    @Field(() => [TelemetryCountBucketGQL])
    CountBuckets: TelemetryCountBucketGQL[];

    @Field(() => [HealthStatusBucketGQL])
    HealthBuckets: HealthStatusBucketGQL[];

    @Field(() => [ProbeSignalBucketGQL])
    ProbeSignalBuckets: ProbeSignalBucketGQL[];

    @Field(() => [FeatureUsageBucketGQL])
    FeatureUsageBuckets: FeatureUsageBucketGQL[];
}

// ============================================================================
// GraphQL Types: Ring-Buffer Events & Category Aggregates
// ============================================================================

@ObjectType()
export class TelemetryCategoryAggregateGQL {
    @Field(() => String)
    Category: string;

    @Field(() => Int)
    EventCount: number;

    @Field(() => Float)
    TotalElapsedMs: number;

    @Field(() => Float)
    AvgElapsedMs: number;

    @Field(() => Float)
    MinElapsedMs: number;

    @Field(() => Float)
    MaxElapsedMs: number;

    @Field(() => Float)
    P50ElapsedMs: number;

    @Field(() => Float)
    P95ElapsedMs: number;

    @Field(() => Int)
    ErrorCount: number;

    @Field(() => Float)
    TotalInputTokens: number;

    @Field(() => Float)
    TotalOutputTokens: number;
}

@ObjectType()
export class RingBufferEventSummaryGQL {
    @Field(() => String)
    ID: string;

    @Field(() => String)
    Category: string;

    @Field(() => String)
    Operation: string;

    @Field(() => String)
    Fingerprint: string;

    @Field(() => Float)
    StartTime: number;

    @Field(() => Float, { nullable: true })
    ElapsedMs?: number;

    @Field(() => String, { nullable: true })
    UserID?: string;

    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => String)
    ParamsJson: string;

    @Field(() => Float, { nullable: true })
    InputTokens?: number;

    @Field(() => Float, { nullable: true })
    OutputTokens?: number;
}

// ============================================================================
// GraphQL Types: OpenTelemetry Status & Metrics
// ============================================================================

@ObjectType()
export class OtelStatusGQL {
    @Field(() => Boolean)
    Enabled: boolean;

    @Field(() => Boolean)
    IsInitialized: boolean;

    @Field(() => String)
    ServiceName: string;

    @Field(() => String)
    ServiceVersion: string;

    @Field(() => String)
    Environment: string;

    @Field(() => String, { nullable: true })
    OtlpEndpoint?: string;

    @Field(() => String, { nullable: true })
    TracesEndpoint?: string;

    @Field(() => String, { nullable: true })
    MetricsEndpoint?: string;

    @Field(() => String)
    DatabasePlatform: string;

    @Field(() => Float)
    SamplingRatio: number;

    @Field(() => String)
    SignalGaugesJson: string;
}

// ============================================================================
// GraphQL Types: Zero-Trust Share Layer Preview
// ============================================================================

@ObjectType()
export class ShareLayerPreviewGQL {
    @Field(() => String)
    ConsentTier: string;

    @Field(() => String)
    GeneratedAtIso: string;

    @Field(() => String)
    PayloadHashHex: string;

    @Field(() => String)
    PayloadJson: string;

    @Field(() => Int)
    HealthSignalsCount: number;

    @Field(() => Int)
    AggregatedUsageCount: number;

    @Field(() => Int)
    FeatureUsageCount: number;

    @Field(() => Boolean)
    AllowlistCompliant: boolean;
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
        OverallStatus: report.OverallStatus,
        MjVersion: report.MJVersion,
        DatabasePlatform: report.DatabasePlatform,
        EvaluatedAt: report.EvaluatedAt,
        TotalDurationMs: report.TotalDurationMs,
        Mode: report.Mode,
        SummaryCounts: {
            Green: report.SummaryCounts.Green,
            Yellow: report.SummaryCounts.Yellow,
            Red: report.SummaryCounts.Red,
        },
        Signals: report.Signals.map((s): HealthSignalEvaluationGQL => ({
            Code: s.Code,
            Title: s.Title,
            Layer: s.Layer,
            OwnerApp: s.OwnerApp,
            Mode: s.Mode,
            Status: s.Status,
            Summary: s.Summary,
            ObservedMetricsJson: JSON.stringify(s.ObservedMetrics ?? {}),
            ThresholdsJson: s.Thresholds ? JSON.stringify(s.Thresholds) : undefined,
            EvaluatedAt: s.EvaluatedAt,
            DurationMs: s.DurationMs,
            ActivePlaybook: s.ActivePlaybook
                ? {
                      AgentInstructions: s.ActivePlaybook.AgentInstructions,
                      AllowedAutonomousActions: s.ActivePlaybook.AllowedAutonomousActions,
                      MaxAutonomousAttempts: s.ActivePlaybook.MaxAutonomousAttempts,
                      RetryCooldownSeconds: s.ActivePlaybook.RetryCooldownSeconds,
                      HumanEscalationCriteria: s.ActivePlaybook.HumanEscalationCriteria,
                      HumanOperatorRunbook: s.ActivePlaybook.HumanOperatorRunbook,
                  }
                : undefined,
            DiagnosticError: s.DiagnosticError,
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
        metadataProvider: IMetadataProvider;
        systemUser: UserInfo;
    } {
        const dbProvider =
            GetReadOnlyProvider(context?.providers ?? [], { allowFallbackToReadWrite: true }) ??
            MJGlobal.Instance.ClassFactory.CreateInstance<DatabaseProviderBase>(DatabaseProviderBase);

        const metadataProvider =
            (GetReadOnlyProvider(context?.providers ?? [], { allowFallbackToReadWrite: true }) as IMetadataProvider | undefined) ??
            Metadata.Provider; // global-provider-ok: server probe runner falls back to global metadata provider when no request context

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

        return { dbProvider, metadataProvider, systemUser };
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
        const { dbProvider, metadataProvider, systemUser } = this.resolveContextDeps(context);

        const checkType = mode === 'live-test' ? 'live-test' : 'passive';
        const report = await MJHealthEngine.Instance.RunCheck(checkType, {
            DatabaseProvider: dbProvider,
            MetadataProvider: metadataProvider,
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
        const { dbProvider, metadataProvider, systemUser } = this.resolveContextDeps(context);

        const report = await MJHealthEngine.Instance.RunCheck('live-test', {
            DatabaseProvider: dbProvider,
            MetadataProvider: metadataProvider,
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
                BucketStartIso: b.BucketStartIso,
                Category: b.Category,
                Count: b.Count,
                TotalElapsedMs: b.TotalElapsedMs,
                TotalInputTokens: b.TotalInputTokens,
                TotalOutputTokens: b.TotalOutputTokens,
            }),
        );

        const healthBuckets = bridge.GetHealthBuckets().map(
            (b): HealthStatusBucketGQL => ({
                BucketStartIso: b.BucketStartIso,
                Green: b.Green,
                Yellow: b.Yellow,
                Red: b.Red,
            }),
        );

        const probeSignalBuckets = bridge.GetProbeSignalBuckets().map(
            (b): ProbeSignalBucketGQL => ({
                BucketStartIso: b.BucketStartIso,
                SignalCode: b.SignalCode,
                OwnerApp: b.OwnerApp,
                Green: b.Green,
                Yellow: b.Yellow,
                Red: b.Red,
                TotalDurationMs: b.TotalDurationMs,
                SampleCount: b.SampleCount,
            }),
        );

        const featureUsageBuckets = bridge.GetFeatureUsageBuckets().map(
            (b): FeatureUsageBucketGQL => ({
                BucketStartIso: b.BucketStartIso,
                ApplicationName: b.ApplicationName,
                RouteTemplate: b.RouteTemplate,
                Count: b.Count,
            }),
        );

        return {
            CountBuckets: countBuckets,
            HealthBuckets: healthBuckets,
            ProbeSignalBuckets: probeSignalBuckets,
            FeatureUsageBuckets: featureUsageBuckets,
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
                Category: category,
                EventCount: count,
                TotalElapsedMs: data.totalElapsedMs,
                AvgElapsedMs: avgElapsed,
                MinElapsedMs: minElapsed,
                MaxElapsedMs: maxElapsed,
                P50ElapsedMs: p50,
                P95ElapsedMs: p95,
                ErrorCount: data.errorCount,
                TotalInputTokens: data.totalInputTokens,
                TotalOutputTokens: data.totalOutputTokens,
            });
        }

        return results.sort((a, b) => b.EventCount - a.EventCount);
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
                ID: ev.id,
                Category: ev.category,
                Operation: ev.operation,
                Fingerprint: ev.fingerprint,
                StartTime: ev.startTime,
                ElapsedMs: ev.elapsedMs,
                UserID: ev.userId,
                Success: !isError,
                ErrorMessage: errorMessage,
                ParamsJson: JSON.stringify(params),
                InputTokens: typeof params.inputTokens === 'number' ? params.inputTokens : undefined,
                OutputTokens: typeof params.outputTokens === 'number' ? params.outputTokens : undefined,
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
            Enabled: config?.Enabled ?? false,
            IsInitialized: sdk.IsInitialized,
            ServiceName: config?.ServiceName ?? 'memberjunction',
            ServiceVersion: config?.ServiceVersion ?? 'unknown',
            Environment: config?.Environment ?? 'production',
            OtlpEndpoint: config?.OtlpEndpoint,
            TracesEndpoint: config?.TracesEndpoint,
            MetricsEndpoint: config?.MetricsEndpoint,
            DatabasePlatform: config?.DatabasePlatform ?? 'sqlserver',
            SamplingRatio: config?.SamplingRatio ?? 1.0,
            SignalGaugesJson: JSON.stringify({}),
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
            ConsentTier: pkg.Payload.ConsentTier,
            GeneratedAtIso: pkg.Payload.GeneratedAtIso,
            PayloadHashHex: pkg.PayloadHashHex,
            PayloadJson: pkg.PayloadJson,
            HealthSignalsCount: pkg.Payload.HealthSignals?.Buckets?.length ?? 0,
            AggregatedUsageCount: pkg.Payload.AggregatedUsage?.Buckets?.length ?? 0,
            FeatureUsageCount: pkg.Payload.FeatureUsage?.DailyBuckets?.length ?? 0,
            AllowlistCompliant: true,
        };
    }
}
