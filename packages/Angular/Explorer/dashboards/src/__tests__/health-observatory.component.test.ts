import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserInfoEngine } from '@memberjunction/core-entities';
import type { ChangeDetectorRef } from '@angular/core';

const mockNavigationService = {
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
};

const mockCdr = {
    markForCheck: vi.fn(),
    detectChanges: vi.fn(),
    checkNoChanges: vi.fn(),
    detach: vi.fn(),
    reattach: vi.fn(),
};

vi.mock('@angular/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@angular/core')>();
    return {
        ...actual,
        inject: (token: { name?: string }) => {
            if (token?.name === 'ChangeDetectorRef') return mockCdr;
            return mockNavigationService;
        },
    };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: Function) => target,
    };
});

import { HealthObservatoryComponent } from '../HealthObservatory/health-observatory.component';
import { HealthObservatoryService } from '../HealthObservatory/services/health-observatory.service';

describe('HealthObservatoryComponent', () => {
    let component: HealthObservatoryComponent;
    let mockService: HealthObservatoryService;

    beforeEach(() => {
        vi.clearAllMocks();

        mockService = {
            RunHealthCheck: vi.fn().mockResolvedValue({
                overallStatus: 'GREEN',
                mjVersion: '6.3.0',
                databasePlatform: 'sqlserver',
                evaluatedAt: new Date().toISOString(),
                totalDurationMs: 12.5,
                mode: 'passive',
                summaryCounts: { green: 5, yellow: 0, red: 0 },
                signals: [
                    {
                        code: 'SchemaMigrationParityProbe',
                        title: 'Schema Migration Parity',
                        layer: 'Database',
                        ownerApp: 'Core',
                        mode: 'passive',
                        status: 'GREEN',
                        summary: 'All good',
                        observedMetricsJson: '{}',
                        evaluatedAt: new Date().toISOString(),
                        durationMs: 3.2,
                    },
                ],
            }),
            ExecuteLiveCrudVerification: vi.fn().mockResolvedValue({
                overallStatus: 'GREEN',
                mjVersion: '6.3.0',
                databasePlatform: 'sqlserver',
                evaluatedAt: new Date().toISOString(),
                totalDurationMs: 50,
                mode: 'live-test',
                summaryCounts: { green: 7, yellow: 0, red: 0 },
                signals: [],
            }),
            GetObservatoryMinuteSeries: vi.fn().mockResolvedValue({
                countBuckets: [
                    {
                        bucketStartIso: '2026-11-12T10:00:00Z',
                        category: 'RunView',
                        count: 20,
                        totalElapsedMs: 400,
                        totalInputTokens: 0,
                        totalOutputTokens: 0,
                    },
                    {
                        bucketStartIso: '2026-11-12T10:01:00Z',
                        category: 'RunView',
                        count: 40,
                        totalElapsedMs: 600,
                        totalInputTokens: 0,
                        totalOutputTokens: 0,
                    },
                ],
                healthBuckets: [],
                probeSignalBuckets: [
                    {
                        bucketStartIso: '2026-11-12T10:00:00Z',
                        signalCode: 'SchemaMigrationParityProbe',
                        ownerApp: 'Core',
                        green: 1,
                        yellow: 0,
                        red: 0,
                        totalDurationMs: 3.2,
                        sampleCount: 1,
                    },
                ],
                featureUsageBuckets: [
                    {
                        bucketStartIso: '2026-11-12T10:00:00Z',
                        applicationName: 'DataExplorer',
                        routeTemplate: 'DataExplorer:View',
                        count: 15,
                    },
                ],
            }),
            GetTelemetryCategoryAggregates: vi.fn().mockResolvedValue([
                {
                    category: 'RunView',
                    eventCount: 60,
                    totalElapsedMs: 1000,
                    avgElapsedMs: 16.6,
                    minElapsedMs: 5,
                    maxElapsedMs: 50,
                    p50ElapsedMs: 15,
                    p95ElapsedMs: 35,
                    errorCount: 0,
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                },
                {
                    category: 'AI',
                    eventCount: 10,
                    totalElapsedMs: 2000,
                    avgElapsedMs: 200,
                    minElapsedMs: 100,
                    maxElapsedMs: 400,
                    p50ElapsedMs: 190,
                    p95ElapsedMs: 380,
                    errorCount: 0,
                    totalInputTokens: 8000,
                    totalOutputTokens: 3000,
                },
            ]),
            GetRecentRingBufferEvents: vi.fn().mockResolvedValue([
                {
                    id: 'ev-1',
                    category: 'RunView',
                    operation: 'RunView:Users',
                    fingerprint: 'fp-1',
                    startTime: 1000,
                    elapsedMs: 25,
                    userId: 'usr-1',
                    success: true,
                    paramsJson: '{"entityName":"Users"}',
                },
                {
                    id: 'ev-2',
                    category: 'AI',
                    operation: 'AI:Completion',
                    fingerprint: 'fp-2',
                    startTime: 2000,
                    elapsedMs: 120,
                    userId: 'usr-2',
                    success: true,
                    paramsJson: '{"prompt":"hello"}',
                },
            ]),
            GetOtelStatus: vi.fn().mockResolvedValue({
                enabled: true,
                isInitialized: true,
                serviceName: 'mj-server-primary',
                serviceVersion: '6.3.0',
                environment: 'production',
                otlpEndpoint: 'http://localhost:4318',
                databasePlatform: 'sqlserver',
                samplingRatio: 1.0,
                signalGaugesJson: '{}',
            }),
            PreviewSharePackage: vi.fn().mockResolvedValue({
                consentTier: 'HealthAndAggregatedUsage',
                generatedAtIso: new Date().toISOString(),
                payloadHashHex: 'abc12345',
                payloadJson: '{"tier": "HealthAndAggregatedUsage"}',
                healthSignalsCount: 5,
                aggregatedUsageCount: 2,
                featureUsageCount: 1,
                allowlistCompliant: true,
            }),
        } as unknown as HealthObservatoryService;

        // Spy UserInfoEngine setting
        vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
        vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockReturnValue(undefined);

        component = new HealthObservatoryComponent(
            mockCdr as unknown as ChangeDetectorRef,
            mockService,
        );
    });

    it('initializes dashboard and loads initial data', async () => {
        await (component as unknown as { loadData(): Promise<void> }).loadData();

        expect(component.HealthReport).toBeTruthy();
        expect(component.HealthReport?.overallStatus).toBe('GREEN');
        expect(component.MinuteSeries?.countBuckets.length).toBe(2);
        expect(component.CategoryAggregates.length).toBe(2);
        expect(component.RecentEvents.length).toBe(2);
        expect(component.OtelStatus?.enabled).toBe(true);
        expect(component.SharePreview?.allowlistCompliant).toBe(true);

        expect(mockNavigationService.SetAgentContext).toHaveBeenCalled();
        expect(mockNavigationService.SetAgentClientTools).toHaveBeenCalled();
    });

    it('switches tabs and updates agent context', async () => {
        await (component as unknown as { loadData(): Promise<void> }).loadData();
        component.OnTabChange('telemetry');

        expect(component.ActiveTab).toBe('telemetry');
        expect(UserInfoEngine.Instance.SetSettingDebounced).toHaveBeenCalled();
        expect(mockNavigationService.SetAgentContext).toHaveBeenCalled();
    });

    it('executes live CRUD rollback verification successfully', async () => {
        await (component as unknown as { loadData(): Promise<void> }).loadData();
        await component.RunLiveCrudVerification();

        expect(mockService.ExecuteLiveCrudVerification).toHaveBeenCalled();
        expect(component.LiveCrudExecutionSuccess).toBe(true);
        expect(component.LiveCrudSteps.every((s) => s.status === 'success')).toBe(true);
        expect(component.LiveCrudSteps.length).toBe(5);
    });

    it('handles live CRUD rollback verification error gracefully', async () => {
        vi.spyOn(mockService, 'ExecuteLiveCrudVerification').mockRejectedValueOnce(
            new Error('Database lock timeout'),
        );

        await component.RunLiveCrudVerification();

        expect(component.LiveCrudExecutionSuccess).toBe(false);
        expect(component.LiveTestError).toContain('Database lock timeout');
        expect(component.LiveCrudSteps[0].status).toBe('failed');
    });

    it('filters recent events by search term', async () => {
        await (component as unknown as { loadData(): Promise<void> }).loadData();

        component.OnEventSearchChange('Users');
        expect(component.FilteredEvents.length).toBe(1);
        expect(component.FilteredEvents[0].operation).toBe('RunView:Users');

        component.OnEventSearchChange('nonexistent');
        expect(component.FilteredEvents.length).toBe(0);

        component.OnEventSearchChange('');
        expect(component.FilteredEvents.length).toBe(2);
    });

    it('calculates flame bar percentages correctly', async () => {
        await (component as unknown as { loadData(): Promise<void> }).loadData();

        // max event elapsedMs is 120 (from ev-2)
        const percent1 = component.CalculateFlameBarPercent(120);
        expect(percent1).toBe(100);

        const percent2 = component.CalculateFlameBarPercent(60);
        expect(percent2).toBe(50);

        const percentZero = component.CalculateFlameBarPercent(0);
        expect(percentZero).toBe(2);
    });

    it('computes SVG sparkline and chart coordinates', async () => {
        await (component as unknown as { loadData(): Promise<void> }).loadData();

        const sparkline = component.GetSparklinePointsForSignal('SchemaMigrationParityProbe');
        expect(sparkline).toBeTruthy();

        const volumePoints = component.VolumeChartPoints;
        expect(volumePoints).toBeTruthy();
        expect(volumePoints).toContain('0.0,');

        const volumeArea = component.VolumeChartAreaPath;
        expect(volumeArea).toContain('M 0,120 L');
    });

    it('toggles probe expanded state', () => {
        expect(component.ExpandedProbeCodes.has('ProbeA')).toBe(false);

        component.ToggleProbeExpanded('ProbeA');
        expect(component.ExpandedProbeCodes.has('ProbeA')).toBe(true);

        component.ToggleProbeExpanded('ProbeA');
        expect(component.ExpandedProbeCodes.has('ProbeA')).toBe(false);
    });

    it('handles auto refresh change', () => {
        component.OnAutoRefreshChange(10);
        expect(component.AutoRefreshIntervalSeconds).toBe(10);
        expect(UserInfoEngine.Instance.SetSettingDebounced).toHaveBeenCalled();

        component.OnAutoRefreshChange(0);
        expect(component.AutoRefreshIntervalSeconds).toBe(0);
    });
});
