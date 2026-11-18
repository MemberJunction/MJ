import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthObservatoryService } from '../HealthObservatory/services/health-observatory.service';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

describe('HealthObservatoryService (Remotable Operations)', () => {
    let service: HealthObservatoryService;
    let routeOperationMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        routeOperationMock = vi.fn();
        vi.spyOn(GraphQLDataProvider, 'Instance', 'get').mockReturnValue({
            RouteOperation: routeOperationMock,
            ExecuteGQL: vi.fn(),
        } as unknown as GraphQLDataProvider);

        service = new HealthObservatoryService();
    });

    it('executes runHealthCheck via Health.RunCheck Remotable Operation and maps report', async () => {
        const mockReport = {
            OverallStatus: 'GREEN',
            MJVersion: '6.3.0',
            DatabasePlatform: 'sqlserver',
            EvaluatedAt: new Date().toISOString(),
            TotalDurationMs: 15,
            Mode: 'passive',
            SummaryCounts: { Green: 5, Yellow: 0, Red: 0 },
            Signals: [],
        };

        routeOperationMock.mockResolvedValueOnce({
            Success: true,
            Output: mockReport,
        });

        const report = await service.runHealthCheck('passive', 'Core');
        expect(report.overallStatus).toBe('GREEN');
        expect(routeOperationMock).toHaveBeenCalledWith('Health.RunCheck', {
            CheckType: 'passive',
            AppFilter: 'Core',
        });
    });

    it('executes executeLiveCrudVerification via Health.ExecuteLiveCrudVerification', async () => {
        const mockReport = {
            OverallStatus: 'GREEN',
            MJVersion: '6.3.0',
            DatabasePlatform: 'sqlserver',
            EvaluatedAt: new Date().toISOString(),
            TotalDurationMs: 45,
            Mode: 'live-test',
            SummaryCounts: { Green: 7, Yellow: 0, Red: 0 },
            Signals: [],
        };

        routeOperationMock.mockResolvedValueOnce({
            Success: true,
            Output: mockReport,
        });

        const report = await service.executeLiveCrudVerification('Core');
        expect(report.overallStatus).toBe('GREEN');
        expect(report.mode).toBe('live-test');
        expect(routeOperationMock).toHaveBeenCalledWith('Health.ExecuteLiveCrudVerification', {
            AppFilter: 'Core',
        });
    });

    it('retrieves minute series data via Health.GetObservatoryMinuteSeries', async () => {
        const mockSeries = {
            CountBuckets: [
                {
                    TimestampIso: '2026-11-12T12:00:00Z',
                    Category: 'RunView',
                    Count: 10,
                    TotalElapsedMs: 120,
                    TotalInputTokens: 0,
                    TotalOutputTokens: 0,
                },
            ],
            HealthBuckets: [],
            ProbeSignalBuckets: [],
            FeatureUsageBuckets: [],
        };

        routeOperationMock.mockResolvedValueOnce({
            Success: true,
            Output: mockSeries,
        });

        const series = await service.getObservatoryMinuteSeries('RunView');
        expect(series.countBuckets.length).toBe(1);
        expect(series.countBuckets[0].category).toBe('RunView');
        expect(routeOperationMock).toHaveBeenCalledWith('Health.GetObservatoryMinuteSeries', {
            Category: 'RunView',
        });
    });

    it('retrieves category aggregates via Health.GetTelemetryCategoryAggregates', async () => {
        const mockAggregates = {
            Aggregates: [
                {
                    Category: 'AI',
                    EventCount: 25,
                    TotalElapsedMs: 5000,
                    AvgElapsedMs: 200,
                    MinElapsedMs: 50,
                    MaxElapsedMs: 400,
                    P50ElapsedMs: 190,
                    P95ElapsedMs: 380,
                    ErrorCount: 0,
                    TotalInputTokens: 5000,
                    TotalOutputTokens: 2500,
                },
            ],
        };

        routeOperationMock.mockResolvedValueOnce({
            Success: true,
            Output: mockAggregates,
        });

        const aggregates = await service.getTelemetryCategoryAggregates();
        expect(aggregates.length).toBe(1);
        expect(aggregates[0].category).toBe('AI');
        expect(routeOperationMock).toHaveBeenCalledWith('Health.GetTelemetryCategoryAggregates', {});
    });

    it('retrieves recent ring buffer events via Health.GetRecentRingBufferEvents', async () => {
        const mockEvents = {
            Events: [
                {
                    ID: 'evt-1',
                    Category: 'RunView',
                    Operation: 'RunView.Users',
                    StartTime: Date.now(),
                    ElapsedMs: 45,
                    Success: true,
                },
            ],
        };

        routeOperationMock.mockResolvedValueOnce({
            Success: true,
            Output: mockEvents,
        });

        const events = await service.GetRecentRingBufferEvents(25, 'RunView');
        expect(events.length).toBe(1);
        expect(events[0].category).toBe('RunView');
        expect(routeOperationMock).toHaveBeenCalledWith('Health.GetRecentRingBufferEvents', {
            Limit: 25,
            Category: 'RunView',
        });
    });

    it('retrieves Otel status via Health.GetOtelStatus', async () => {
        routeOperationMock.mockResolvedValueOnce({
            Success: true,
            Output: {
                Enabled: true,
                IsInitialized: true,
                ServiceName: 'mj-server',
                ServiceVersion: '6.3.0',
                Environment: 'test',
                SamplingRatio: 1.0,
                DatabasePlatform: 'sqlserver',
                SignalGaugesJson: '{}',
            },
        });

        const otel = await service.getOtelStatus();
        expect(otel.enabled).toBe(true);
        expect(otel.serviceName).toBe('mj-server');
        expect(routeOperationMock).toHaveBeenCalledWith('Health.GetOtelStatus', {});
    });

    it('previews share package via Health.PreviewSharePackage', async () => {
        routeOperationMock.mockResolvedValueOnce({
            Success: true,
            Output: {
                ConsentTier: 'Tier2_AggregatedUsage',
                GeneratedAtIso: new Date().toISOString(),
                PayloadHashHex: '1234abcd',
                PayloadJson: '{"test": true}',
                HealthSignalsCount: 5,
                AggregatedUsageCount: 3,
                FeatureUsageCount: 4,
                AllowlistCompliant: true,
            },
        });

        const preview = await service.previewSharePackage('Tier2_AggregatedUsage');
        expect(preview.allowlistCompliant).toBe(true);
        expect(preview.payloadHashHex).toBe('1234abcd');
        expect(routeOperationMock).toHaveBeenCalledWith('Health.PreviewSharePackage', {
            ConsentTier: 'Tier2_AggregatedUsage',
        });
    });

    it('throws structured error when operation fails', async () => {
        routeOperationMock.mockResolvedValueOnce({
            Success: false,
            ResultCode: 'FORBIDDEN',
            ErrorMessage: 'Caller not authorized for operation Health.RunCheck',
        });

        await expect(service.runHealthCheck('passive')).rejects.toThrow('Caller not authorized for operation Health.RunCheck');
    });
});
