import type { InstanceHealthReport } from '../types';
import type { ConsentTier } from '../telemetry/BaseTelemetrySink';
import type {
    HealthStatusBucket,
    ProbeSignalBucket,
    FeatureUsageBucket,
    TelemetryCountBucket,
} from '../telemetry/LocalTelemetrySignalBridge';

export interface HealthRunCheckInput {
    CheckType?: 'startup' | 'readiness' | 'live-test' | 'passive';
    AppFilter?: string;
    TimeoutMs?: number;
}

export interface HealthLiveCrudVerificationInput {
    AppFilter?: string;
    TimeoutMs?: number;
}

export interface HealthObservatoryMinuteSeriesInput {
    Category?: string;
    WindowMinutes?: number;
}

export interface HealthObservatoryMinuteSeriesOutput {
    CountBuckets: readonly TelemetryCountBucket[];
    HealthBuckets: readonly HealthStatusBucket[];
    ProbeSignalBuckets: readonly ProbeSignalBucket[];
    FeatureUsageBuckets: readonly FeatureUsageBucket[];
}

export interface HealthTelemetryAggregatesInput {
    WindowMinutes?: number;
}

export interface HealthTelemetryCategoryAggregate {
    Category: string;
    EventCount: number;
    TotalElapsedMs: number;
    AvgElapsedMs: number;
    MinElapsedMs: number;
    MaxElapsedMs: number;
    P50ElapsedMs: number;
    P95ElapsedMs: number;
    ErrorCount: number;
    TotalInputTokens: number;
    TotalOutputTokens: number;
}

export interface HealthTelemetryAggregatesOutput {
    Aggregates: HealthTelemetryCategoryAggregate[];
}

export interface HealthRecentRingBufferEventsInput {
    Limit?: number;
    Category?: string;
}

export interface HealthRingBufferEventSnapshot {
    ID: string;
    Category: string;
    Operation: string;
    Fingerprint?: string;
    StartTime: number;
    ElapsedMs?: number;
    UserID?: string;
    Success: boolean;
    ErrorMessage?: string;
    ParamsJson?: string;
    InputTokens?: number;
    OutputTokens?: number;
}

export interface HealthRecentRingBufferEventsOutput {
    Events: HealthRingBufferEventSnapshot[];
}

export interface HealthOtelStatusInput {}

export interface HealthOtelStatusOutput {
    Enabled: boolean;
    IsInitialized: boolean;
    ServiceName: string;
    ServiceVersion: string;
    Environment: string;
    OtlpEndpoint?: string;
    TracesEndpoint?: string;
    MetricsEndpoint?: string;
    DatabasePlatform: string;
    SamplingRatio: number;
    SignalGaugesJson: string;
}

export interface HealthPreviewSharePackageInput {
    ConsentTier: ConsentTier;
}

export interface HealthPreviewSharePackageOutput {
    ConsentTier: ConsentTier;
    GeneratedAtIso: string;
    PayloadHashHex: string;
    PayloadJson: string;
    HealthSignalsCount: number;
    AggregatedUsageCount: number;
    FeatureUsageCount: number;
    AllowlistCompliant: boolean;
}
