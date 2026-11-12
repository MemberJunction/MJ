import { Injectable } from '@angular/core';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';

// ============================================================================
// Strongly-Typed Models
// ============================================================================

export interface HealthRemediationPlaybookModel {
    agentInstructions: string;
    allowedAutonomousActions: string[];
    maxAutonomousAttempts: number;
    retryCooldownSeconds: number;
    humanEscalationCriteria: string;
    humanOperatorRunbook?: string;
}

export interface HealthSignalEvaluationModel {
    code: string;
    title: string;
    layer: string;
    ownerApp: string;
    mode: string;
    status: 'GREEN' | 'YELLOW' | 'RED';
    summary: string;
    observedMetricsJson: string;
    thresholdsJson?: string;
    evaluatedAt: string;
    durationMs: number;
    activePlaybook?: HealthRemediationPlaybookModel;
    diagnosticError?: string;
}

export interface HealthSummaryCountsModel {
    green: number;
    yellow: number;
    red: number;
}

export interface InstanceHealthReportModel {
    overallStatus: 'GREEN' | 'YELLOW' | 'RED';
    mjVersion: string;
    databasePlatform: string;
    evaluatedAt: string;
    totalDurationMs: number;
    mode: string;
    summaryCounts: HealthSummaryCountsModel;
    signals: HealthSignalEvaluationModel[];
}

export interface TelemetryCountBucketModel {
    bucketStartIso: string;
    category: string;
    count: number;
    totalElapsedMs: number;
    totalInputTokens: number;
    totalOutputTokens: number;
}

export interface HealthStatusBucketModel {
    bucketStartIso: string;
    green: number;
    yellow: number;
    red: number;
}

export interface ProbeSignalBucketModel {
    bucketStartIso: string;
    signalCode: string;
    ownerApp: string;
    green: number;
    yellow: number;
    red: number;
    totalDurationMs: number;
    sampleCount: number;
}

export interface FeatureUsageBucketModel {
    bucketStartIso: string;
    applicationName: string;
    routeTemplate: string;
    count: number;
}

export interface ObservatoryMinuteSeriesModel {
    countBuckets: TelemetryCountBucketModel[];
    healthBuckets: HealthStatusBucketModel[];
    probeSignalBuckets: ProbeSignalBucketModel[];
    featureUsageBuckets: FeatureUsageBucketModel[];
}

export interface TelemetryCategoryAggregateModel {
    category: string;
    eventCount: number;
    totalElapsedMs: number;
    avgElapsedMs: number;
    minElapsedMs: number;
    maxElapsedMs: number;
    p50ElapsedMs: number;
    p95ElapsedMs: number;
    errorCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
}

export interface RingBufferEventSummaryModel {
    id: string;
    category: string;
    operation: string;
    fingerprint?: string;
    startTime: number;
    elapsedMs?: number;
    userId?: string;
    success: boolean;
    errorMessage?: string;
    paramsJson?: string;
    inputTokens?: number;
    outputTokens?: number;
}

export interface OtelStatusModel {
    enabled: boolean;
    isInitialized: boolean;
    serviceName: string;
    serviceVersion: string;
    environment: string;
    otlpEndpoint?: string;
    tracesEndpoint?: string;
    metricsEndpoint?: string;
    databasePlatform: string;
    samplingRatio: number;
    signalGaugesJson: string;
}

export interface ShareLayerPreviewModel {
    consentTier: string;
    generatedAtIso: string;
    payloadHashHex: string;
    payloadJson: string;
    healthSignalsCount: number;
    aggregatedUsageCount: number;
    featureUsageCount: number;
    allowlistCompliant: boolean;
}

// ============================================================================
// Service Implementation (Powered by MemberJunction BaseRemotableOperation)
// ============================================================================

@Injectable({
    providedIn: 'root',
})
export class HealthObservatoryService {
    private get gqlProvider(): GraphQLDataProvider {
        return GraphQLDataProvider.Instance;
    }

    /**
     * Executes a typed BaseRemotableOperation on the server via GraphQLDataProvider.RouteOperation.
     */
    private async executeOperation<TInput, TOutput>(operationKey: string, input: TInput): Promise<TOutput> {
        if (typeof this.gqlProvider.RouteOperation === 'function') {
            const result = await this.gqlProvider.RouteOperation<TInput, TOutput>(operationKey, input);
            if (!result.Success) {
                throw new Error(result.ErrorMessage || `Remote operation '${operationKey}' failed with resultCode '${result.ResultCode}'`);
            }
            return result.Output as TOutput;
        }

        // Test fallback if RouteOperation is mocked through ExecuteGQL
        const mutation = gql`
            mutation ExecuteRemoteOperation($operationKey: String!, $inputJSON: String!) {
                ExecuteRemoteOperation(input: { operationKey: $operationKey, inputJSON: $inputJSON, invokeMode: "attached" }) {
                    success
                    resultCode
                    outputJSON
                    errorMessage
                }
            }
        `;
        const res = (await this.gqlProvider.ExecuteGQL(mutation, {
            operationKey,
            inputJSON: JSON.stringify(input ?? {}),
        })) as { ExecuteRemoteOperation?: { success: boolean; resultCode?: string; outputJSON?: string; errorMessage?: string } } | undefined;

        const ro = res?.ExecuteRemoteOperation;
        if (!ro?.success) {
            throw new Error(ro?.errorMessage || `Remote operation '${operationKey}' failed with resultCode '${ro?.resultCode}'`);
        }
        return (ro.outputJSON ? JSON.parse(ro.outputJSON) : {}) as TOutput;
    }

    /**
     * Executes passive or active health probe checks across the MJ instance via Health.RunCheck.
     */
    public async RunHealthCheck(
        mode: 'passive' | 'startup' | 'readiness' | 'live-test' = 'passive',
        appFilter?: string,
    ): Promise<InstanceHealthReportModel> {
        const raw = await this.executeOperation<
            { CheckType?: string; AppFilter?: string },
            Record<string, unknown>
        >('Health.RunCheck', {
            CheckType: mode,
            AppFilter: appFilter?.trim() ? appFilter.trim() : undefined,
        });

        return this.mapReport(raw);
    }

    /** @deprecated Use RunHealthCheck instead */
    public async runHealthCheck(
        mode: 'passive' | 'startup' | 'readiness' | 'live-test' = 'passive',
        appFilter?: string,
    ): Promise<InstanceHealthReportModel> {
        return this.RunHealthCheck(mode, appFilter);
    }

    /**
     * Executes active live CRUD functional verification with transactional rollback isolation via Health.ExecuteLiveCrudVerification.
     */
    public async ExecuteLiveCrudVerification(appFilter?: string): Promise<InstanceHealthReportModel> {
        const raw = await this.executeOperation<
            { AppFilter?: string },
            Record<string, unknown>
        >('Health.ExecuteLiveCrudVerification', {
            AppFilter: appFilter?.trim() ? appFilter.trim() : undefined,
        });

        return this.mapReport(raw);
    }

    /** @deprecated Use ExecuteLiveCrudVerification instead */
    public async executeLiveCrudVerification(appFilter?: string): Promise<InstanceHealthReportModel> {
        return this.ExecuteLiveCrudVerification(appFilter);
    }

    /**
     * Retrieves 24h minute-bucket series from LocalTelemetrySignalBridge via Health.GetObservatoryMinuteSeries.
     */
    public async GetObservatoryMinuteSeries(category?: string): Promise<ObservatoryMinuteSeriesModel> {
        const raw = await this.executeOperation<
            { Category?: string },
            Record<string, unknown>
        >('Health.GetObservatoryMinuteSeries', {
            Category: category && category !== 'All' ? category : undefined,
        });

        const countBuckets = ((raw.CountBuckets ?? raw.countBuckets ?? []) as Array<Record<string, unknown>>).map((b) => ({
            bucketStartIso: String(b.TimestampIso ?? b.bucketStartIso ?? ''),
            category: String(b.Category ?? b.category ?? ''),
            count: Number(b.Count ?? b.count ?? 0),
            totalElapsedMs: Number(b.TotalElapsedMs ?? b.totalElapsedMs ?? 0),
            totalInputTokens: Number(b.TotalInputTokens ?? b.totalInputTokens ?? 0),
            totalOutputTokens: Number(b.TotalOutputTokens ?? b.totalOutputTokens ?? 0),
        }));

        const healthBuckets = ((raw.HealthBuckets ?? raw.healthBuckets ?? []) as Array<Record<string, unknown>>).map((b) => ({
            bucketStartIso: String(b.TimestampIso ?? b.bucketStartIso ?? ''),
            green: Number(b.Green ?? b.green ?? 0),
            yellow: Number(b.Yellow ?? b.yellow ?? 0),
            red: Number(b.Red ?? b.red ?? 0),
        }));

        const probeSignalBuckets = ((raw.ProbeSignalBuckets ?? raw.probeSignalBuckets ?? []) as Array<Record<string, unknown>>).map((b) => ({
            bucketStartIso: String(b.TimestampIso ?? b.bucketStartIso ?? ''),
            signalCode: String(b.SignalCode ?? b.signalCode ?? ''),
            ownerApp: String(b.OwnerApp ?? b.ownerApp ?? 'Core'),
            green: Number(b.Green ?? b.green ?? 0),
            yellow: Number(b.Yellow ?? b.yellow ?? 0),
            red: Number(b.Red ?? b.red ?? 0),
            totalDurationMs: Number(b.TotalDurationMs ?? b.totalDurationMs ?? 0),
            sampleCount: Number(b.SampleCount ?? b.sampleCount ?? 1),
        }));

        const featureUsageBuckets = ((raw.FeatureUsageBuckets ?? raw.featureUsageBuckets ?? []) as Array<Record<string, unknown>>).map((b) => ({
            bucketStartIso: String(b.TimestampIso ?? b.bucketStartIso ?? ''),
            applicationName: String(b.ApplicationName ?? b.applicationName ?? 'MemberJunction'),
            routeTemplate: String(b.RouteTemplate ?? b.routeTemplate ?? ''),
            count: Number(b.Count ?? b.count ?? 0),
        }));

        return {
            countBuckets,
            healthBuckets,
            probeSignalBuckets,
            featureUsageBuckets,
        };
    }

    /** @deprecated Use GetObservatoryMinuteSeries instead */
    public async getObservatoryMinuteSeries(category?: string): Promise<ObservatoryMinuteSeriesModel> {
        return this.GetObservatoryMinuteSeries(category);
    }

    /**
     * Aggregates active ring-buffer telemetry events by category via Health.GetTelemetryCategoryAggregates.
     */
    public async GetTelemetryCategoryAggregates(): Promise<TelemetryCategoryAggregateModel[]> {
        const raw = await this.executeOperation<
            Record<string, unknown>,
            { Aggregates?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
        >('Health.GetTelemetryCategoryAggregates', {});

        const list = Array.isArray(raw) ? raw : (raw.Aggregates ?? []);
        return list.map((a) => ({
            category: String(a.Category ?? a.category ?? ''),
            eventCount: Number(a.EventCount ?? a.eventCount ?? 0),
            totalElapsedMs: Number(a.TotalElapsedMs ?? a.totalElapsedMs ?? 0),
            avgElapsedMs: Number(a.AvgElapsedMs ?? a.avgElapsedMs ?? 0),
            minElapsedMs: Number(a.MinElapsedMs ?? a.minElapsedMs ?? 0),
            maxElapsedMs: Number(a.MaxElapsedMs ?? a.maxElapsedMs ?? 0),
            p50ElapsedMs: Number(a.P50ElapsedMs ?? a.p50ElapsedMs ?? 0),
            p95ElapsedMs: Number(a.P95ElapsedMs ?? a.p95ElapsedMs ?? 0),
            errorCount: Number(a.ErrorCount ?? a.errorCount ?? 0),
            totalInputTokens: Number(a.TotalInputTokens ?? a.totalInputTokens ?? 0),
            totalOutputTokens: Number(a.TotalOutputTokens ?? a.totalOutputTokens ?? 0),
        }));
    }

    /** @deprecated Use GetTelemetryCategoryAggregates instead */
    public async getTelemetryCategoryAggregates(): Promise<TelemetryCategoryAggregateModel[]> {
        return this.GetTelemetryCategoryAggregates();
    }

    /**
     * Retrieves recent raw events from the ring buffer with PII-scrubbed parameters via Health.GetRecentRingBufferEvents.
     */
    public async GetRecentRingBufferEvents(
        limit: number = 50,
        category?: string,
    ): Promise<RingBufferEventSummaryModel[]> {
        const raw = await this.executeOperation<
            { Limit?: number; Category?: string },
            { Events?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
        >('Health.GetRecentRingBufferEvents', {
            Limit: limit,
            Category: category && category !== 'All' ? category : undefined,
        });

        const list = Array.isArray(raw) ? raw : (raw.Events ?? []);
        return list.map((e) => ({
            id: String(e.ID ?? e.id ?? ''),
            category: String(e.Category ?? e.category ?? ''),
            operation: String(e.Operation ?? e.operation ?? ''),
            fingerprint: e.Fingerprint != null ? String(e.Fingerprint) : (e.fingerprint != null ? String(e.fingerprint) : undefined),
            startTime: Number(e.StartTime ?? e.startTime ?? Date.now()),
            elapsedMs: e.ElapsedMs != null ? Number(e.ElapsedMs) : (e.elapsedMs != null ? Number(e.elapsedMs) : undefined),
            userId: e.UserID != null ? String(e.UserID) : (e.userId != null ? String(e.userId) : undefined),
            success: Boolean(e.Success ?? e.success ?? true),
            errorMessage: e.ErrorMessage != null ? String(e.ErrorMessage) : (e.errorMessage != null ? String(e.errorMessage) : undefined),
            paramsJson: e.ParamsJson != null ? String(e.ParamsJson) : (e.paramsJson != null ? String(e.paramsJson) : undefined),
            inputTokens: e.InputTokens != null ? Number(e.InputTokens) : (e.inputTokens != null ? Number(e.inputTokens) : undefined),
            outputTokens: e.OutputTokens != null ? Number(e.OutputTokens) : (e.outputTokens != null ? Number(e.outputTokens) : undefined),
        }));
    }

    /** @deprecated Use GetRecentRingBufferEvents instead */
    public async getRecentRingBufferEvents(
        limit: number = 50,
        category?: string,
    ): Promise<RingBufferEventSummaryModel[]> {
        return this.GetRecentRingBufferEvents(limit, category);
    }

    /**
     * Inspects OpenTelemetry SDK spine configuration and active gauge states via Health.GetOtelStatus.
     */
    public async GetOtelStatus(): Promise<OtelStatusModel> {
        const raw = await this.executeOperation<
            Record<string, unknown>,
            Record<string, unknown>
        >('Health.GetOtelStatus', {});

        return {
            enabled: Boolean(raw.Enabled ?? raw.enabled ?? false),
            isInitialized: Boolean(raw.IsInitialized ?? raw.isInitialized ?? false),
            serviceName: String(raw.ServiceName ?? raw.serviceName ?? 'unknown'),
            serviceVersion: String(raw.ServiceVersion ?? raw.serviceVersion ?? 'unknown'),
            environment: String(raw.Environment ?? raw.environment ?? 'production'),
            otlpEndpoint: raw.OtlpEndpoint != null ? String(raw.OtlpEndpoint) : (raw.otlpEndpoint != null ? String(raw.otlpEndpoint) : undefined),
            tracesEndpoint: raw.TracesEndpoint != null ? String(raw.TracesEndpoint) : (raw.tracesEndpoint != null ? String(raw.tracesEndpoint) : undefined),
            metricsEndpoint: raw.MetricsEndpoint != null ? String(raw.MetricsEndpoint) : (raw.metricsEndpoint != null ? String(raw.metricsEndpoint) : undefined),
            databasePlatform: String(raw.DatabasePlatform ?? raw.databasePlatform ?? 'sqlserver'),
            samplingRatio: Number(raw.SamplingRatio ?? raw.samplingRatio ?? 1.0),
            signalGaugesJson: String(raw.SignalGaugesJson ?? raw.signalGaugesJson ?? '{}'),
        };
    }

    /** @deprecated Use GetOtelStatus instead */
    public async getOtelStatus(): Promise<OtelStatusModel> {
        return this.GetOtelStatus();
    }

    /**
     * Previews an opt-in Share Layer telemetry package without transmission via Health.PreviewSharePackage.
     */
    public async PreviewSharePackage(
        tier: string = 'HealthAndAggregatedUsage',
    ): Promise<ShareLayerPreviewModel> {
        const raw = await this.executeOperation<
            { ConsentTier: string },
            Record<string, unknown>
        >('Health.PreviewSharePackage', {
            ConsentTier: tier,
        });

        return {
            consentTier: String(raw.ConsentTier ?? raw.consentTier ?? tier),
            generatedAtIso: String(raw.GeneratedAtIso ?? raw.generatedAtIso ?? new Date().toISOString()),
            payloadHashHex: String(raw.PayloadHashHex ?? raw.payloadHashHex ?? ''),
            payloadJson: String(raw.PayloadJson ?? raw.payloadJson ?? '{}'),
            healthSignalsCount: Number(raw.HealthSignalsCount ?? raw.healthSignalsCount ?? 0),
            aggregatedUsageCount: Number(raw.AggregatedUsageCount ?? raw.aggregatedUsageCount ?? 0),
            featureUsageCount: Number(raw.FeatureUsageCount ?? raw.featureUsageCount ?? 0),
            allowlistCompliant: Boolean(raw.AllowlistCompliant ?? raw.allowlistCompliant ?? true),
        };
    }

    /** @deprecated Use PreviewSharePackage instead */
    public async previewSharePackage(
        tier: string = 'HealthAndAggregatedUsage',
    ): Promise<ShareLayerPreviewModel> {
        return this.PreviewSharePackage(tier);
    }

    private mapReport(raw: Record<string, unknown>): InstanceHealthReportModel {
        const overall = String(raw.OverallStatus ?? raw.overallStatus ?? 'GREEN').toUpperCase();
        const counts = (raw.SummaryCounts ?? raw.summaryCounts ?? {}) as Record<string, unknown>;
        const rawSignals = (raw.Signals ?? raw.signals ?? []) as Array<Record<string, unknown>>;

        const signals: HealthSignalEvaluationModel[] = rawSignals.map((s) => {
            const metrics = s.ObservedMetrics ?? s.observedMetricsJson ?? {};
            const thresholds = s.Thresholds ?? s.thresholdsJson;
            return {
                code: String(s.Code ?? s.code ?? ''),
                title: String(s.Title ?? s.title ?? ''),
                layer: String(s.Layer ?? s.layer ?? ''),
                ownerApp: String(s.OwnerApp ?? s.ownerApp ?? ''),
                mode: String(s.Mode ?? s.mode ?? ''),
                status: String(s.Status ?? s.status ?? 'GREEN').toUpperCase() as 'GREEN' | 'YELLOW' | 'RED',
                summary: String(s.Summary ?? s.summary ?? ''),
                observedMetricsJson: typeof metrics === 'string' ? metrics : JSON.stringify(metrics),
                thresholdsJson: thresholds != null ? (typeof thresholds === 'string' ? thresholds : JSON.stringify(thresholds)) : undefined,
                evaluatedAt: String(s.EvaluatedAt ?? s.evaluatedAt ?? ''),
                durationMs: Number(s.DurationMs ?? s.durationMs ?? 0),
                diagnosticError: s.DiagnosticError != null ? String(s.DiagnosticError) : (s.diagnosticError != null ? String(s.diagnosticError) : undefined),
            };
        });

        return {
            overallStatus: (overall === 'RED' || overall === 'YELLOW' ? overall : 'GREEN') as 'GREEN' | 'YELLOW' | 'RED',
            mjVersion: String(raw.MJVersion ?? raw.mjVersion ?? ''),
            databasePlatform: String(raw.DatabasePlatform ?? raw.databasePlatform ?? ''),
            evaluatedAt: String(raw.EvaluatedAt ?? raw.evaluatedAt ?? ''),
            totalDurationMs: Number(raw.TotalDurationMs ?? raw.totalDurationMs ?? 0),
            mode: String(raw.Mode ?? raw.mode ?? 'passive'),
            summaryCounts: {
                green: Number(counts.Green ?? counts.green ?? 0),
                yellow: Number(counts.Yellow ?? counts.yellow ?? 0),
                red: Number(counts.Red ?? counts.red ?? 0),
            },
            signals,
        };
    }
}
