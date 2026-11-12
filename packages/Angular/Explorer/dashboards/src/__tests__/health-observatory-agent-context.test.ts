import { describe, expect, it } from 'vitest';
import {
    BuildHealthObservatoryAgentContext,
    IsValidCheckMode,
    IsValidObservatoryTab,
    IsValidTimeWindow,
    type HealthObservatoryAgentContextInput,
} from '../HealthObservatory/health-observatory-agent-context';
import type { InstanceHealthReportModel } from '../HealthObservatory/services/health-observatory.service';

describe('HealthObservatory Agent Context', () => {
    it('validates tab identifiers correctly', () => {
        expect(IsValidObservatoryTab('probes')).toBe(true);
        expect(IsValidObservatoryTab('telemetry')).toBe(true);
        expect(IsValidObservatoryTab('otel')).toBe(true);
        expect(IsValidObservatoryTab('share-layer')).toBe(true);
        expect(IsValidObservatoryTab('invalid')).toBe(false);
        expect(IsValidObservatoryTab(null)).toBe(false);
    });

    it('validates check modes correctly', () => {
        expect(IsValidCheckMode('passive')).toBe(true);
        expect(IsValidCheckMode('startup')).toBe(true);
        expect(IsValidCheckMode('readiness')).toBe(true);
        expect(IsValidCheckMode('live-test')).toBe(true);
        expect(IsValidCheckMode('other')).toBe(false);
    });

    it('validates time windows correctly', () => {
        expect(IsValidTimeWindow('15m')).toBe(true);
        expect(IsValidTimeWindow('1h')).toBe(true);
        expect(IsValidTimeWindow('6h')).toBe(true);
        expect(IsValidTimeWindow('24h')).toBe(true);
        expect(IsValidTimeWindow('7d')).toBe(false);
    });

    it('builds context with empty health report gracefully', () => {
        const input: HealthObservatoryAgentContextInput = {
            activeTab: 'probes',
            checkMode: 'passive',
            timeWindow: '1h',
            selectedCategory: 'All',
            autoRefreshIntervalSeconds: 30,
        };

        const ctx = BuildHealthObservatoryAgentContext(input);
        expect(ctx.Surface).toBe('HealthObservatory');
        expect(ctx.ActiveTab).toBe('probes');
        expect(ctx.OverallStatus).toBe('UNKNOWN');
        expect(ctx.HealthSummary.Total).toBe(0);
        expect(ctx.AvailableProbeCodes).toEqual([]);
        expect(ctx.TotalEventsInWindow).toBe(0);
        expect(ctx.OtelEnabled).toBe(false);
    });

    it('builds context with full health report and telemetry aggregates', () => {
        const mockReport: InstanceHealthReportModel = {
            overallStatus: 'GREEN',
            mjVersion: '6.3.0',
            databasePlatform: 'sqlserver',
            evaluatedAt: new Date().toISOString(),
            totalDurationMs: 42.5,
            mode: 'passive',
            summaryCounts: { green: 7, yellow: 0, red: 0 },
            signals: [
                {
                    code: 'SchemaMigrationParityProbe',
                    title: 'Schema Migration Parity',
                    layer: 'Database',
                    ownerApp: 'Core',
                    mode: 'passive',
                    status: 'GREEN',
                    summary: 'All migrations applied',
                    observedMetricsJson: '{}',
                    evaluatedAt: new Date().toISOString(),
                    durationMs: 5.2,
                },
                {
                    code: 'AiProviderReadinessProbe',
                    title: 'AI Provider Readiness',
                    layer: 'AI',
                    ownerApp: 'AI',
                    mode: 'passive',
                    status: 'GREEN',
                    summary: 'AI models configured',
                    observedMetricsJson: '{}',
                    evaluatedAt: new Date().toISOString(),
                    durationMs: 3.1,
                },
            ],
        };

        const input: HealthObservatoryAgentContextInput = {
            activeTab: 'telemetry',
            checkMode: 'passive',
            timeWindow: '24h',
            selectedCategory: 'RunView',
            autoRefreshIntervalSeconds: 60,
            healthReport: mockReport,
            aggregates: [
                {
                    category: 'RunView',
                    eventCount: 150,
                    totalElapsedMs: 3000,
                    avgElapsedMs: 20,
                    minElapsedMs: 5,
                    maxElapsedMs: 120,
                    p50ElapsedMs: 18,
                    p95ElapsedMs: 45,
                    errorCount: 1,
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                },
                {
                    category: 'AI',
                    eventCount: 40,
                    totalElapsedMs: 20000,
                    avgElapsedMs: 500,
                    minElapsedMs: 100,
                    maxElapsedMs: 1200,
                    p50ElapsedMs: 450,
                    p95ElapsedMs: 950,
                    errorCount: 0,
                    totalInputTokens: 12000,
                    totalOutputTokens: 4500,
                },
            ],
            otelStatus: {
                enabled: true,
                isInitialized: true,
                serviceName: 'mj-server-primary',
                serviceVersion: '6.3.0',
                environment: 'production',
                otlpEndpoint: 'http://localhost:4318',
                databasePlatform: 'sqlserver',
                samplingRatio: 1.0,
                signalGaugesJson: '{}',
            },
            sharePreview: {
                consentTier: 'HealthAndAggregatedUsage',
                generatedAtIso: new Date().toISOString(),
                payloadHashHex: 'abc12345',
                payloadJson: '{}',
                healthSignalsCount: 2,
                aggregatedUsageCount: 2,
                featureUsageCount: 5,
                allowlistCompliant: true,
            },
        };

        const ctx = BuildHealthObservatoryAgentContext(input);
        expect(ctx.OverallStatus).toBe('GREEN');
        expect(ctx.HealthSummary.Green).toBe(7);
        expect(ctx.HealthSummary.Total).toBe(2);
        expect(ctx.AvailableProbeCodes).toEqual(['SchemaMigrationParityProbe', 'AiProviderReadinessProbe']);
        expect(ctx.ProbeCodesTruncated).toBe(false);
        expect(ctx.TotalEventsInWindow).toBe(190);
        expect(ctx.TotalInputTokens).toBe(12000);
        expect(ctx.TotalOutputTokens).toBe(4500);
        expect(ctx.OtelEnabled).toBe(true);
        expect(ctx.OtelServiceName).toBe('mj-server-primary');
        expect(ctx.ShareLayerConsentTier).toBe('HealthAndAggregatedUsage');
        expect(ctx.ShareLayerAllowlistCompliant).toBe(true);
    });
});
