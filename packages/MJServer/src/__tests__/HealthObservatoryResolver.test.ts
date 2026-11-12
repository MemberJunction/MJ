import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock type-graphql decorators so tests can invoke resolver methods directly
vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator,
        Mutation: noopDecorator,
        Query: noopDecorator,
        Subscription: noopDecorator,
        ObjectType: noopDecorator,
        InputType: noopDecorator,
        Field: noopDecorator,
        Arg: noopDecorator,
        Args: noopDecorator,
        Ctx: noopDecorator,
        PubSub: noopDecorator,
        Root: noopDecorator,
        Directive: noopDecorator,
        Authorized: noopDecorator,
        UseMiddleware: noopDecorator,
        createUnionType: () => class {},
        AuthorizationError: class AuthorizationError extends Error {},
        Float: class {},
        Int: class {},
        ID: class {},
    };
});

import {
    HealthObservatoryResolver,
    InstanceHealthReportGQL,
    ObservatoryMinuteSeriesGQL,
    TelemetryCategoryAggregateGQL,
    RingBufferEventSummaryGQL,
    OtelStatusGQL,
    ShareLayerPreviewGQL,
} from '../resolvers/HealthObservatoryResolver.js';
import type { AppContext, ProviderInfo } from '../types.js';
import {
    MJHealthEngine,
    LocalTelemetrySignalBridge,
    OtelSdk,
    OtelMetrics,
    ShareLayerPackager,
    type InstanceHealthReport,
} from '@memberjunction/health';
import {
    DatabaseProviderBase,
    TelemetryManager,
    type UserInfo,
} from '@memberjunction/core';

describe('HealthObservatoryResolver (@memberjunction/server)', () => {
    let resolver: HealthObservatoryResolver;

    const mockReport: InstanceHealthReport = {
        OverallStatus: 'GREEN',
        MJVersion: '6.3.0-edge.0',
        DatabasePlatform: 'sqlserver',
        EvaluatedAt: '2026-11-12T16:00:00.000Z',
        TotalDurationMs: 42,
        Mode: 'passive',
        SummaryCounts: {
            Green: 7,
            Yellow: 0,
            Red: 0,
        },
        Signals: [
            {
                Code: 'MJ.CORE.DB.CONNECTIVITY_AND_POOL',
                Title: 'Database Connectivity & Pool Health',
                Layer: 'core',
                OwnerApp: '__mj',
                Mode: 'passive',
                Status: 'GREEN',
                Summary: 'Database responds to ping; connection pool within limits.',
                ObservedMetrics: { latencyMs: 3.2, activeConnections: 4 },
                EvaluatedAt: '2026-11-12T16:00:00.000Z',
                DurationMs: 4.5,
            },
            {
                Code: 'MJ.CORE.AI.PROVIDER_READINESS',
                Title: 'AI Provider Readiness',
                Layer: 'core',
                OwnerApp: '__mj',
                Mode: 'passive',
                Status: 'GREEN',
                Summary: 'Configured LLM providers reachable.',
                ObservedMetrics: { providerCount: 3 },
                EvaluatedAt: '2026-11-12T16:00:00.000Z',
                DurationMs: 8.1,
            },
        ],
    };

    function createMockContext(userType: string = 'Owner'): AppContext {
        const mockUser: UserInfo = {
            ID: 'USER-1',
            Name: 'Test User',
            Email: 'test@example.com',
            Type: userType,
            IsSystem: false,
        } as unknown as UserInfo;

        return {
            dataSource: {} as any,
            dataSources: [],
            providers: [
                {
                    provider: {} as DatabaseProviderBase,
                    type: 'Read-Only',
                } as ProviderInfo,
            ],
            userPayload: {
                email: 'test@example.com',
                sessionId: 'session-1',
                userRecord: mockUser,
            },
        };
    }

    beforeEach(() => {
        resolver = new HealthObservatoryResolver();
        vi.restoreAllMocks();
    });

    describe('RunHealthCheck', () => {
        it('executes passive health checks and records into bridge and metrics', async () => {
            const runCheckSpy = vi
                .spyOn(MJHealthEngine.Instance, 'RunCheck')
                .mockResolvedValue(mockReport);
            const recordBridgeSpy = vi
                .spyOn(LocalTelemetrySignalBridge.Instance, 'RecordHealthReport')
                .mockImplementation(() => {});
            const recordOtelSpy = vi
                .spyOn(OtelMetrics.Instance, 'RecordHealthReport')
                .mockImplementation(() => {});

            const ctx = createMockContext('Owner');
            const result: InstanceHealthReportGQL = await resolver.RunHealthCheck('passive', undefined, ctx);

            expect(runCheckSpy).toHaveBeenCalledWith('passive', expect.objectContaining({
                AppFilter: undefined,
            }));
            expect(recordBridgeSpy).toHaveBeenCalledWith(mockReport);
            expect(recordOtelSpy).toHaveBeenCalledWith(mockReport);

            expect(result.overallStatus).toBe('GREEN');
            expect(result.mjVersion).toBe('6.3.0-edge.0');
            expect(result.summaryCounts.green).toBe(7);
            expect(result.signals).toHaveLength(2);
            expect(result.signals[0].code).toBe('MJ.CORE.DB.CONNECTIVITY_AND_POOL');
            expect(JSON.parse(result.signals[0].observedMetricsJson)).toEqual({ latencyMs: 3.2, activeConnections: 4 });
        });
    });

    describe('ExecuteLiveCrudVerification', () => {
        it('executes live-test checks with transactional rollback isolation', async () => {
            const liveReport: InstanceHealthReport = {
                ...mockReport,
                Mode: 'live-test',
                Signals: [
                    {
                        Code: 'MJ.CORE.LIVE.ENTITY_CRUD_AND_RLS',
                        Title: 'Live Entity CRUD & RLS Transactional Proof',
                        Layer: 'core',
                        OwnerApp: '__mj',
                        Mode: 'live-test',
                        Status: 'GREEN',
                        Summary: 'Transactional CRUD cycle completed and rolled back cleanly.',
                        ObservedMetrics: { cycleDurationMs: 14.2, recordsWritten: 1, recordsCleaned: 1 },
                        EvaluatedAt: '2026-11-12T16:00:00.000Z',
                        DurationMs: 15.0,
                    },
                ],
            };

            const runCheckSpy = vi
                .spyOn(MJHealthEngine.Instance, 'RunCheck')
                .mockResolvedValue(liveReport);

            const ctx = createMockContext('Owner');
            const result: InstanceHealthReportGQL = await resolver.ExecuteLiveCrudVerification(undefined, ctx);

            expect(runCheckSpy).toHaveBeenCalledWith('live-test', expect.anything());
            expect(result.mode).toBe('live-test');
            expect(result.signals[0].code).toBe('MJ.CORE.LIVE.ENTITY_CRUD_AND_RLS');
            expect(result.signals[0].status).toBe('GREEN');
        });
    });

    describe('GetObservatoryMinuteSeries', () => {
        it('retrieves time-series buckets from LocalTelemetrySignalBridge', () => {
            const bridge = LocalTelemetrySignalBridge.Instance;
            vi.spyOn(bridge, 'GetCountBuckets').mockReturnValue([
                {
                    BucketStartIso: '2026-11-12T16:00:00.000Z',
                    Category: 'RunView',
                    Count: 15,
                    TotalElapsedMs: 350,
                    TotalInputTokens: 0,
                    TotalOutputTokens: 0,
                },
            ]);
            vi.spyOn(bridge, 'GetHealthBuckets').mockReturnValue([
                {
                    BucketStartIso: '2026-11-12T16:00:00.000Z',
                    Green: 7,
                    Yellow: 0,
                    Red: 0,
                },
            ]);
            vi.spyOn(bridge, 'GetProbeSignalBuckets').mockReturnValue([
                {
                    BucketStartIso: '2026-11-12T16:00:00.000Z',
                    SignalCode: 'MJ.CORE.DB.CONNECTIVITY_AND_POOL',
                    OwnerApp: '__mj',
                    Green: 1,
                    Yellow: 0,
                    Red: 0,
                    TotalDurationMs: 4.5,
                    SampleCount: 1,
                },
            ]);
            vi.spyOn(bridge, 'GetFeatureUsageBuckets').mockReturnValue([
                {
                    BucketStartIso: '2026-11-12T16:00:00.000Z',
                    ApplicationName: 'Explorer',
                    RouteTemplate: '/health/observatory',
                    Count: 8,
                },
            ]);

            const ctx = createMockContext('Owner');
            const series: ObservatoryMinuteSeriesGQL = resolver.GetObservatoryMinuteSeries('RunView', ctx);

            expect(series.countBuckets).toHaveLength(1);
            expect(series.countBuckets[0].category).toBe('RunView');
            expect(series.countBuckets[0].count).toBe(15);
            expect(series.healthBuckets[0].green).toBe(7);
            expect(series.probeSignalBuckets[0].signalCode).toBe('MJ.CORE.DB.CONNECTIVITY_AND_POOL');
            expect(series.featureUsageBuckets[0].routeTemplate).toBe('/health/observatory');
        });
    });

    describe('GetTelemetryCategoryAggregates', () => {
        it('computes aggregated percentiles, call volume, and token totals from ring-buffer events', () => {
            const tm = TelemetryManager.Instance;
            vi.spyOn(tm, 'GetEvents').mockReturnValue([
                {
                    id: 'ev-1',
                    category: 'RunView',
                    operation: 'RunView.Execute',
                    fingerprint: 'fp-1',
                    startTime: 1000,
                    elapsedMs: 20,
                    params: {},
                },
                {
                    id: 'ev-2',
                    category: 'RunView',
                    operation: 'RunView.Execute',
                    fingerprint: 'fp-2',
                    startTime: 1050,
                    elapsedMs: 40,
                    params: {},
                },
                {
                    id: 'ev-3',
                    category: 'RunView',
                    operation: 'RunView.Execute',
                    fingerprint: 'fp-3',
                    startTime: 1100,
                    elapsedMs: 100,
                    params: { error: 'query timeout' },
                },
                {
                    id: 'ev-4',
                    category: 'AI',
                    operation: 'AIPromptRunner.Execute',
                    fingerprint: 'fp-4',
                    startTime: 1200,
                    elapsedMs: 250,
                    params: { inputTokens: 500, outputTokens: 120 },
                },
            ]);

            const ctx = createMockContext('Owner');
            const aggregates: TelemetryCategoryAggregateGQL[] = resolver.GetTelemetryCategoryAggregates(ctx);

            expect(aggregates).toHaveLength(2);

            const runViewAgg = aggregates.find((a) => a.category === 'RunView')!;
            expect(runViewAgg.eventCount).toBe(3);
            expect(runViewAgg.totalElapsedMs).toBe(160);
            expect(runViewAgg.minElapsedMs).toBe(20);
            expect(runViewAgg.maxElapsedMs).toBe(100);
            expect(runViewAgg.p50ElapsedMs).toBe(40);
            expect(runViewAgg.errorCount).toBe(1);

            const aiAgg = aggregates.find((a) => a.category === 'AI')!;
            expect(aiAgg.eventCount).toBe(1);
            expect(aiAgg.totalInputTokens).toBe(500);
            expect(aiAgg.totalOutputTokens).toBe(120);
        });
    });

    describe('GetRecentRingBufferEvents', () => {
        it('returns bounded events with formatted parameters and token metrics', () => {
            const tm = TelemetryManager.Instance;
            vi.spyOn(tm, 'GetEvents').mockReturnValue([
                {
                    id: 'ev-1',
                    category: 'RunQuery',
                    operation: 'RunQuery.Execute',
                    fingerprint: 'fp-1',
                    startTime: 1000,
                    elapsedMs: 15,
                    userId: 'U-123',
                    params: { QueryName: 'ActiveUsers', RowCount: 25 },
                },
            ]);

            const ctx = createMockContext('Owner');
            const events: RingBufferEventSummaryGQL[] = resolver.GetRecentRingBufferEvents(10, 'RunQuery', ctx);

            expect(events).toHaveLength(1);
            expect(events[0].id).toBe('ev-1');
            expect(events[0].category).toBe('RunQuery');
            expect(events[0].success).toBe(true);
            expect(JSON.parse(events[0].paramsJson)).toEqual({ QueryName: 'ActiveUsers', RowCount: 25 });
        });
    });

    describe('GetOtelStatus', () => {
        it('returns OpenTelemetry SDK spine initialization state and configuration', () => {
            const sdk = OtelSdk.Instance;
            vi.spyOn(sdk, 'IsInitialized', 'get').mockReturnValue(true);
            vi.spyOn(sdk, 'Config', 'get').mockReturnValue({
                Enabled: true,
                ServiceName: 'mj-observatory-test',
                ServiceVersion: '6.3.0',
                Environment: 'test',
                DatabasePlatform: 'sqlserver',
                SamplingRatio: 1.0,
                OtlpEndpoint: 'http://localhost:4318',
            });

            const ctx = createMockContext('Owner');
            const status: OtelStatusGQL = resolver.GetOtelStatus(ctx);

            expect(status.enabled).toBe(true);
            expect(status.isInitialized).toBe(true);
            expect(status.serviceName).toBe('mj-observatory-test');
            expect(status.otlpEndpoint).toBe('http://localhost:4318');
        });
    });

    describe('PreviewSharePackage', () => {
        it('returns deterministic preview package without transmission', () => {
            const packager = ShareLayerPackager.Instance;
            vi.spyOn(packager, 'PreviewNextPackage').mockReturnValue({
                Payload: {
                    ConsentTier: 'HealthAndAggregatedUsage',
                    GeneratedAtIso: '2026-11-12T16:00:00.000Z',
                    AggregatedUsage: {
                        Buckets: [
                            {
                                BucketStartIso: '2026-11-12T16:00:00.000Z',
                                Category: 'RunView',
                                Count: 10,
                                TotalElapsedMs: 150,
                                TotalInputTokens: 0,
                                TotalOutputTokens: 0,
                            },
                        ],
                    },
                },
                PayloadJson: JSON.stringify({
                    ConsentTier: 'HealthAndAggregatedUsage',
                    GeneratedAtIso: '2026-11-12T16:00:00.000Z',
                }),
                PayloadHashHex: 'abc123digest',
            });

            const ctx = createMockContext('Owner');
            const preview: ShareLayerPreviewGQL = resolver.PreviewSharePackage('HealthAndAggregatedUsage', ctx);

            expect(preview.consentTier).toBe('HealthAndAggregatedUsage');
            expect(preview.payloadHashHex).toBe('abc123digest');
            expect(preview.aggregatedUsageCount).toBe(1);
            expect(preview.allowlistCompliant).toBe(true);
        });

        it('throws an error when preview is requested for ConsentTier "Off"', () => {
            const ctx = createMockContext('Owner');
            expect(() => resolver.PreviewSharePackage('Off', ctx)).toThrow(
                'Cannot preview share package for consent tier "Off".',
            );
        });
    });

    describe('Access Control & Diagnostics Authorization', () => {
        it('rejects unauthenticated or unauthorized users who lack Owner and Diagnostics privileges', async () => {
            const unauthorizedCtx = createMockContext('User');
            await expect(resolver.RunHealthCheck('passive', undefined, unauthorizedCtx)).rejects.toThrow(
                /Access denied/,
            );
        });
    });
});
