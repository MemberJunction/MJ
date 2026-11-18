import type {
    InstanceHealthReportModel,
    OtelStatusModel,
    ShareLayerPreviewModel,
    TelemetryCategoryAggregateModel,
} from './services/health-observatory.service';

export type ObservatoryTab = 'probes' | 'telemetry' | 'otel' | 'share-layer';
export type CheckMode = 'passive' | 'startup' | 'readiness' | 'live-test';
export type TimeWindow = '15m' | '1h' | '6h' | '24h';

export const VALID_OBSERVATORY_TABS: readonly ObservatoryTab[] = [
    'probes',
    'telemetry',
    'otel',
    'share-layer',
] as const;

export const VALID_CHECK_MODES: readonly CheckMode[] = [
    'passive',
    'startup',
    'readiness',
    'live-test',
] as const;

export const VALID_TIME_WINDOWS: readonly TimeWindow[] = ['15m', '1h', '6h', '24h'] as const;

export interface HealthObservatoryAgentContextInput {
    activeTab: ObservatoryTab;
    checkMode: CheckMode;
    timeWindow: TimeWindow;
    selectedCategory: string;
    autoRefreshIntervalSeconds: number;
    appFilter?: string;
    selectedProbeCode?: string;
    healthReport?: InstanceHealthReportModel | null;
    aggregates?: TelemetryCategoryAggregateModel[];
    otelStatus?: OtelStatusModel | null;
    sharePreview?: ShareLayerPreviewModel | null;
    isExecutingLiveTest?: boolean;
    isLoading?: boolean;
}

export interface HealthObservatoryAgentContext {
    [key: string]: unknown;
    Surface: 'HealthObservatory';
    ActiveTab: ObservatoryTab;
    CheckMode: CheckMode;
    TimeWindow: TimeWindow;
    SelectedCategory: string;
    AutoRefreshIntervalSeconds: number;
    AppFilter: string;
    IsLoading: boolean;
    IsExecutingLiveTest: boolean;
    SelectedProbeCode: string | null;

    // Health Report Summary
    OverallStatus: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
    TotalDurationMs: number;
    HealthSummary: {
        Green: number;
        Yellow: number;
        Red: number;
        Total: number;
    };
    AvailableProbeCodes: string[];
    ProbeCodesTruncated: boolean;

    // Telemetry Highlights
    TelemetryCategories: string[];
    TotalEventsInWindow: number;
    TotalInputTokens: number;
    TotalOutputTokens: number;

    // OpenTelemetry
    OtelEnabled: boolean;
    OtelServiceName: string;
    OtelEndpoint: string | null;

    // Share Layer
    ShareLayerConsentTier: string | null;
    ShareLayerAllowlistCompliant: boolean;
}

export function IsValidObservatoryTab(value: unknown): value is ObservatoryTab {
    return typeof value === 'string' && VALID_OBSERVATORY_TABS.includes(value as ObservatoryTab);
}

export function IsValidCheckMode(value: unknown): value is CheckMode {
    return typeof value === 'string' && VALID_CHECK_MODES.includes(value as CheckMode);
}

export function IsValidTimeWindow(value: unknown): value is TimeWindow {
    return typeof value === 'string' && VALID_TIME_WINDOWS.includes(value as TimeWindow);
}

/**
 * Pure builder function for the Health Observatory Agent Context snapshot.
 */
export function BuildHealthObservatoryAgentContext(
    input: HealthObservatoryAgentContextInput,
): HealthObservatoryAgentContext {
    const report = input.healthReport;
    const signals = report?.signals ?? [];
    const probeCodes = signals.map((s) => s.code);
    const maxProbes = 25;
    const boundedProbeCodes = probeCodes.slice(0, maxProbes);

    const aggregates = input.aggregates ?? [];
    const totalEvents = aggregates.reduce((sum, a) => sum + a.eventCount, 0);
    const totalInputTokens = aggregates.reduce((sum, a) => sum + a.totalInputTokens, 0);
    const totalOutputTokens = aggregates.reduce((sum, a) => sum + a.totalOutputTokens, 0);

    return {
        Surface: 'HealthObservatory',
        ActiveTab: input.activeTab,
        CheckMode: input.checkMode,
        TimeWindow: input.timeWindow,
        SelectedCategory: input.selectedCategory,
        AutoRefreshIntervalSeconds: input.autoRefreshIntervalSeconds,
        AppFilter: input.appFilter ?? '',
        IsLoading: Boolean(input.isLoading),
        IsExecutingLiveTest: Boolean(input.isExecutingLiveTest),
        SelectedProbeCode: input.selectedProbeCode ?? null,

        OverallStatus: report?.overallStatus ?? 'UNKNOWN',
        TotalDurationMs: report?.totalDurationMs ?? 0,
        HealthSummary: {
            Green: report?.summaryCounts?.green ?? 0,
            Yellow: report?.summaryCounts?.yellow ?? 0,
            Red: report?.summaryCounts?.red ?? 0,
            Total: signals.length,
        },
        AvailableProbeCodes: boundedProbeCodes,
        ProbeCodesTruncated: probeCodes.length > maxProbes,

        TelemetryCategories: aggregates.map((a) => a.category).slice(0, maxProbes),
        TotalEventsInWindow: totalEvents,
        TotalInputTokens: totalInputTokens,
        TotalOutputTokens: totalOutputTokens,

        OtelEnabled: Boolean(input.otelStatus?.enabled),
        OtelServiceName: input.otelStatus?.serviceName ?? 'unknown',
        OtelEndpoint: input.otelStatus?.otlpEndpoint ?? null,

        ShareLayerConsentTier: input.sharePreview?.consentTier ?? null,
        ShareLayerAllowlistCompliant: Boolean(input.sharePreview?.allowlistCompliant),
    };
}
