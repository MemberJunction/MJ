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
    fingerprint: string;
    startTime: number;
    elapsedMs?: number;
    userId?: string;
    success: boolean;
    errorMessage?: string;
    paramsJson: string;
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
// GraphQL Document Definitions
// ============================================================================

const RunHealthCheckQuery = gql`
    query RunHealthCheck($mode: String!, $appFilter: String) {
        RunHealthCheck(mode: $mode, appFilter: $appFilter) {
            overallStatus
            mjVersion
            databasePlatform
            evaluatedAt
            totalDurationMs
            mode
            summaryCounts {
                green
                yellow
                red
            }
            signals {
                code
                title
                layer
                ownerApp
                mode
                status
                summary
                observedMetricsJson
                thresholdsJson
                evaluatedAt
                durationMs
                diagnosticError
                activePlaybook {
                    agentInstructions
                    allowedAutonomousActions
                    maxAutonomousAttempts
                    retryCooldownSeconds
                    humanEscalationCriteria
                    humanOperatorRunbook
                }
            }
        }
    }
`;

const ExecuteLiveCrudVerificationMutation = gql`
    mutation ExecuteLiveCrudVerification($appFilter: String) {
        ExecuteLiveCrudVerification(appFilter: $appFilter) {
            overallStatus
            mjVersion
            databasePlatform
            evaluatedAt
            totalDurationMs
            mode
            summaryCounts {
                green
                yellow
                red
            }
            signals {
                code
                title
                layer
                ownerApp
                mode
                status
                summary
                observedMetricsJson
                thresholdsJson
                evaluatedAt
                durationMs
                diagnosticError
                activePlaybook {
                    agentInstructions
                    allowedAutonomousActions
                    maxAutonomousAttempts
                    retryCooldownSeconds
                    humanEscalationCriteria
                    humanOperatorRunbook
                }
            }
        }
    }
`;

const GetObservatoryMinuteSeriesQuery = gql`
    query GetObservatoryMinuteSeries($category: String) {
        GetObservatoryMinuteSeries(category: $category) {
            countBuckets {
                bucketStartIso
                category
                count
                totalElapsedMs
                totalInputTokens
                totalOutputTokens
            }
            healthBuckets {
                bucketStartIso
                green
                yellow
                red
            }
            probeSignalBuckets {
                bucketStartIso
                signalCode
                ownerApp
                green
                yellow
                red
                totalDurationMs
                sampleCount
            }
            featureUsageBuckets {
                bucketStartIso
                applicationName
                routeTemplate
                count
            }
        }
    }
`;

const GetTelemetryCategoryAggregatesQuery = gql`
    query GetTelemetryCategoryAggregates {
        GetTelemetryCategoryAggregates {
            category
            eventCount
            totalElapsedMs
            avgElapsedMs
            minElapsedMs
            maxElapsedMs
            p50ElapsedMs
            p95ElapsedMs
            errorCount
            totalInputTokens
            totalOutputTokens
        }
    }
`;

const GetRecentRingBufferEventsQuery = gql`
    query GetRecentRingBufferEvents($limit: Int, $category: String) {
        GetRecentRingBufferEvents(limit: $limit, category: $category) {
            id
            category
            operation
            fingerprint
            startTime
            elapsedMs
            userId
            success
            errorMessage
            paramsJson
            inputTokens
            outputTokens
        }
    }
`;

const GetOtelStatusQuery = gql`
    query GetOtelStatus {
        GetOtelStatus {
            enabled
            isInitialized
            serviceName
            serviceVersion
            environment
            otlpEndpoint
            tracesEndpoint
            metricsEndpoint
            databasePlatform
            samplingRatio
            signalGaugesJson
        }
    }
`;

const PreviewSharePackageQuery = gql`
    query PreviewSharePackage($tier: String!) {
        PreviewSharePackage(tier: $tier) {
            consentTier
            generatedAtIso
            payloadHashHex
            payloadJson
            healthSignalsCount
            aggregatedUsageCount
            featureUsageCount
            allowlistCompliant
        }
    }
`;

// ============================================================================
// Observatory Client Service
// ============================================================================

@Injectable({
    providedIn: 'root',
})
export class HealthObservatoryService {
    private get gqlProvider(): GraphQLDataProvider {
        return GraphQLDataProvider.Instance;
    }

    /**
     * Executes passive or active health probe checks across the instance.
     */
    public async RunHealthCheck(
        mode: 'passive' | 'startup' | 'readiness' | 'live-test' = 'passive',
        appFilter?: string,
    ): Promise<InstanceHealthReportModel> {
        const response = (await this.gqlProvider.ExecuteGQL(
            RunHealthCheckQuery,
            { mode, appFilter: appFilter?.trim() ? appFilter.trim() : undefined },
        )) as { RunHealthCheck?: InstanceHealthReportModel } | undefined;
        if (!response?.RunHealthCheck) {
            throw new Error('RunHealthCheck returned empty or invalid response');
        }
        return response.RunHealthCheck;
    }

    /** @deprecated Use RunHealthCheck instead */
    public async runHealthCheck(
        mode: 'passive' | 'startup' | 'readiness' | 'live-test' = 'passive',
        appFilter?: string,
    ): Promise<InstanceHealthReportModel> {
        return this.RunHealthCheck(mode, appFilter);
    }

    /**
     * Executes active live CRUD functional verification with transactional rollback isolation.
     */
    public async ExecuteLiveCrudVerification(appFilter?: string): Promise<InstanceHealthReportModel> {
        const response = (await this.gqlProvider.ExecuteGQL(
            ExecuteLiveCrudVerificationMutation,
            { appFilter: appFilter?.trim() ? appFilter.trim() : undefined },
        )) as { ExecuteLiveCrudVerification?: InstanceHealthReportModel } | undefined;
        if (!response?.ExecuteLiveCrudVerification) {
            throw new Error('ExecuteLiveCrudVerification returned empty or invalid response');
        }
        return response.ExecuteLiveCrudVerification;
    }

    /** @deprecated Use ExecuteLiveCrudVerification instead */
    public async executeLiveCrudVerification(appFilter?: string): Promise<InstanceHealthReportModel> {
        return this.ExecuteLiveCrudVerification(appFilter);
    }

    /**
     * Retrieves 24h minute-bucket series from LocalTelemetrySignalBridge for time-series charts.
     */
    public async GetObservatoryMinuteSeries(category?: string): Promise<ObservatoryMinuteSeriesModel> {
        const response = (await this.gqlProvider.ExecuteGQL(
            GetObservatoryMinuteSeriesQuery,
            { category: category && category !== 'All' ? category : undefined },
        )) as { GetObservatoryMinuteSeries?: ObservatoryMinuteSeriesModel } | undefined;
        if (!response?.GetObservatoryMinuteSeries) {
            return {
                countBuckets: [],
                healthBuckets: [],
                probeSignalBuckets: [],
                featureUsageBuckets: [],
            };
        }
        return response.GetObservatoryMinuteSeries;
    }

    /** @deprecated Use GetObservatoryMinuteSeries instead */
    public async getObservatoryMinuteSeries(category?: string): Promise<ObservatoryMinuteSeriesModel> {
        return this.GetObservatoryMinuteSeries(category);
    }

    /**
     * Aggregates active ring-buffer telemetry events by category.
     */
    public async GetTelemetryCategoryAggregates(): Promise<TelemetryCategoryAggregateModel[]> {
        const response = (await this.gqlProvider.ExecuteGQL(
            GetTelemetryCategoryAggregatesQuery,
            {},
        )) as { GetTelemetryCategoryAggregates?: TelemetryCategoryAggregateModel[] } | undefined;
        return response?.GetTelemetryCategoryAggregates ?? [];
    }

    /** @deprecated Use GetTelemetryCategoryAggregates instead */
    public async getTelemetryCategoryAggregates(): Promise<TelemetryCategoryAggregateModel[]> {
        return this.GetTelemetryCategoryAggregates();
    }

    /**
     * Retrieves recent raw events from the ring buffer with PII-scrubbed parameters.
     */
    public async GetRecentRingBufferEvents(
        limit: number = 50,
        category?: string,
    ): Promise<RingBufferEventSummaryModel[]> {
        const response = (await this.gqlProvider.ExecuteGQL(
            GetRecentRingBufferEventsQuery,
            {
                limit,
                category: category && category !== 'All' ? category : undefined,
            },
        )) as { GetRecentRingBufferEvents?: RingBufferEventSummaryModel[] } | undefined;
        return response?.GetRecentRingBufferEvents ?? [];
    }

    /** @deprecated Use GetRecentRingBufferEvents instead */
    public async getRecentRingBufferEvents(
        limit: number = 50,
        category?: string,
    ): Promise<RingBufferEventSummaryModel[]> {
        return this.GetRecentRingBufferEvents(limit, category);
    }

    /**
     * Inspects OpenTelemetry SDK spine configuration and active gauge states.
     */
    public async GetOtelStatus(): Promise<OtelStatusModel> {
        const response = (await this.gqlProvider.ExecuteGQL(
            GetOtelStatusQuery,
            {},
        )) as { GetOtelStatus?: OtelStatusModel } | undefined;
        if (!response?.GetOtelStatus) {
            return {
                enabled: false,
                isInitialized: false,
                serviceName: 'unknown',
                serviceVersion: 'unknown',
                environment: 'unknown',
                databasePlatform: 'sqlserver',
                samplingRatio: 1.0,
                signalGaugesJson: '{}',
            };
        }
        return response.GetOtelStatus;
    }

    /** @deprecated Use GetOtelStatus instead */
    public async getOtelStatus(): Promise<OtelStatusModel> {
        return this.GetOtelStatus();
    }

    /**
     * Previews an opt-in Share Layer telemetry package without transmission.
     */
    public async PreviewSharePackage(
        tier: string = 'HealthAndAggregatedUsage',
    ): Promise<ShareLayerPreviewModel> {
        const response = (await this.gqlProvider.ExecuteGQL(
            PreviewSharePackageQuery,
            { tier },
        )) as { PreviewSharePackage?: ShareLayerPreviewModel } | undefined;
        if (!response?.PreviewSharePackage) {
            throw new Error(`PreviewSharePackage returned empty response for tier: ${tier}`);
        }
        return response.PreviewSharePackage;
    }

    /** @deprecated Use PreviewSharePackage instead */
    public async previewSharePackage(
        tier: string = 'HealthAndAggregatedUsage',
    ): Promise<ShareLayerPreviewModel> {
        return this.PreviewSharePackage(tier);
    }
}
