import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthObservatoryService } from '../HealthObservatory/services/health-observatory.service';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

describe('HealthObservatoryService', () => {
    let service: HealthObservatoryService;
    let executeGQLMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        executeGQLMock = vi.fn();
        vi.spyOn(GraphQLDataProvider, 'Instance', 'get').mockReturnValue({
            ExecuteGQL: executeGQLMock,
        } as unknown as GraphQLDataProvider);

        service = new HealthObservatoryService();
    });

    it('executes runHealthCheck and returns report', async () => {
        const mockReport = {
            overallStatus: 'GREEN',
            mjVersion: '6.3.0',
            databasePlatform: 'sqlserver',
            evaluatedAt: new Date().toISOString(),
            totalDurationMs: 15,
            mode: 'passive',
            summaryCounts: { green: 5, yellow: 0, red: 0 },
            signals: [],
        };

        executeGQLMock.mockResolvedValueOnce({
            RunHealthCheck: mockReport,
        });

        const report = await service.runHealthCheck('passive', 'Core');
        expect(report.overallStatus).toBe('GREEN');
        expect(executeGQLMock).toHaveBeenCalledTimes(1);
        expect(executeGQLMock.mock.calls[0][1]).toEqual({ mode: 'passive', appFilter: 'Core' });
    });

    it('executes executeLiveCrudVerification mutation', async () => {
        const mockReport = {
            overallStatus: 'GREEN',
            mjVersion: '6.3.0',
            databasePlatform: 'sqlserver',
            evaluatedAt: new Date().toISOString(),
            totalDurationMs: 45,
            mode: 'live-test',
            summaryCounts: { green: 7, yellow: 0, red: 0 },
            signals: [],
        };

        executeGQLMock.mockResolvedValueOnce({
            ExecuteLiveCrudVerification: mockReport,
        });

        const report = await service.executeLiveCrudVerification();
        expect(report.overallStatus).toBe('GREEN');
        expect(report.mode).toBe('live-test');
    });

    it('retrieves minute series data with fallback', async () => {
        const mockSeries = {
            countBuckets: [
                {
                    bucketStartIso: '2026-11-12T12:00:00Z',
                    category: 'RunView',
                    count: 10,
                    totalElapsedMs: 120,
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                },
            ],
            healthBuckets: [],
            probeSignalBuckets: [],
            featureUsageBuckets: [],
        };

        executeGQLMock.mockResolvedValueOnce({
            GetObservatoryMinuteSeries: mockSeries,
        });

        const series = await service.getObservatoryMinuteSeries('RunView');
        expect(series.countBuckets.length).toBe(1);
        expect(series.countBuckets[0].category).toBe('RunView');
    });

    it('retrieves category aggregates', async () => {
        const mockAggregates = [
            {
                category: 'AI',
                eventCount: 25,
                totalElapsedMs: 5000,
                avgElapsedMs: 200,
                minElapsedMs: 50,
                maxElapsedMs: 400,
                p50ElapsedMs: 190,
                p95ElapsedMs: 380,
                errorCount: 0,
                totalInputTokens: 5000,
                totalOutputTokens: 2500,
            },
        ];

        executeGQLMock.mockResolvedValueOnce({
            GetTelemetryCategoryAggregates: mockAggregates,
        });

        const aggregates = await service.getTelemetryCategoryAggregates();
        expect(aggregates.length).toBe(1);
        expect(aggregates[0].category).toBe('AI');
    });

    it('retrieves Otel status', async () => {
        executeGQLMock.mockResolvedValueOnce({
            GetOtelStatus: {
                enabled: true,
                isInitialized: true,
                serviceName: 'mj-server',
                serviceVersion: '6.3.0',
                environment: 'test',
                samplingRatio: 1.0,
                databasePlatform: 'sqlserver',
                signalGaugesJson: '{}',
            },
        });

        const otel = await service.getOtelStatus();
        expect(otel.enabled).toBe(true);
        expect(otel.serviceName).toBe('mj-server');
    });

    it('previews share package', async () => {
        executeGQLMock.mockResolvedValueOnce({
            PreviewSharePackage: {
                consentTier: 'HealthAndAggregatedUsage',
                generatedAtIso: new Date().toISOString(),
                payloadHashHex: '1234abcd',
                payloadJson: '{"test": true}',
                healthSignalsCount: 5,
                aggregatedUsageCount: 3,
                featureUsageCount: 4,
                allowlistCompliant: true,
            },
        });

        const preview = await service.previewSharePackage('HealthAndAggregatedUsage');
        expect(preview.allowlistCompliant).toBe(true);
        expect(preview.payloadHashHex).toBe('1234abcd');
    });
});
