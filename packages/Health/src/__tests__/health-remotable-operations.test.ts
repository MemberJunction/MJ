import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BaseRemotableOperation, DatabaseProviderBase, type IMetadataProvider, type RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    HealthRunCheckOperation,
    HealthLiveCrudVerificationOperation,
    HealthObservatoryMinuteSeriesOperation,
    HealthTelemetryAggregatesOperation,
    HealthRecentRingBufferEventsOperation,
    HealthOtelStatusOperation,
    HealthPreviewSharePackageOperation,
} from '../operations/index';
import { MJHealthEngine } from '../MJHealthEngine';
import { LocalTelemetrySignalBridge } from '../telemetry/LocalTelemetrySignalBridge';
import { OtelMetrics } from '../otel/OtelMetrics';
import { OtelSdk } from '../otel/OtelSdk';
import { ShareLayerPackager } from '../telemetry/ShareLayerPackager';
import { TelemetryManager } from '@memberjunction/core';
import type { InstanceHealthReport, TelemetryPackage } from '../types';

describe('Health Remotable Operations & Agent Tool Discovery (@memberjunction/health)', () => {
    function createMockServerContext(userType: 'Owner' | 'User' = 'Owner', hasDiagAuth: boolean = true): RemoteOpServerContext {
        const user = new UserInfo();
        user.ID = 'user-test-1';
        user.Name = 'Test User';
        user.Email = 'test@example.com';
        user.Type = userType;

        const auths = hasDiagAuth
            ? [
                  {
                      ID: 'auth-1',
                      Name: 'Diagnostics: Run Sessions',
                      Description: 'Allows running diagnostic sessions',
                  },
              ]
            : [];

        const mockProvider: IMetadataProvider = {
            Authorizations: auths,
        } as unknown as IMetadataProvider;

        return {
            provider: mockProvider,
            user,
            emitProgress: vi.fn(),
            requestOrigin: 'http://localhost:4200',
            clientIp: '127.0.0.1',
        };
    }

    const mockReport: InstanceHealthReport = {
        OverallStatus: 'GREEN',
        MJVersion: '6.3.0-edge.0',
        DatabasePlatform: 'sqlserver',
        EvaluatedAt: new Date().toISOString(),
        TotalDurationMs: 12.5,
        Mode: 'passive',
        SummaryCounts: {
            Green: 7,
            Yellow: 0,
            Red: 0,
        },
        Signals: [
            {
                Code: 'MJ.CORE.DB.CONNECTIVITY_AND_POOL',
                Title: 'Database Connectivity',
                Layer: 'DataEngine',
                OwnerApp: 'Core',
                Mode: 'passive',
                Status: 'GREEN',
                Summary: 'Pool active',
                ObservedMetrics: { latencyMs: 2.1 },
                EvaluatedAt: new Date().toISOString(),
                DurationMs: 2.1,
            },
        ],
    };

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('1. AI Agent and MCP Tool Discovery', () => {
        it('discovers all 7 Health Remotable Operations via BaseRemotableOperation.GetExposedToolOperations()', () => {
            const tools = BaseRemotableOperation.GetExposedToolOperations();
            const healthTools = tools.filter((t) => t.OperationKey.startsWith('Health.'));

            expect(healthTools.length).toBeGreaterThanOrEqual(7);

            const expectedKeys = [
                'Health.RunCheck',
                'Health.ExecuteLiveCrudVerification',
                'Health.GetObservatoryMinuteSeries',
                'Health.GetTelemetryCategoryAggregates',
                'Health.GetRecentRingBufferEvents',
                'Health.GetOtelStatus',
                'Health.PreviewSharePackage',
            ];

            for (const key of expectedKeys) {
                const found = healthTools.find((t) => t.OperationKey === key);
                expect(found, `Tool descriptor for ${key} must exist`).toBeDefined();
                expect(found!.ExposeAsAgentTool).toBe(true);
                expect(found!.ExposeAsMCPTool).toBe(true);
                expect(found!.Description).toBeTruthy();
                expect(found!.InputSchema).toBeDefined();
                expect(typeof found!.InputSchema).toBe('object');
            }
        });

        it('discovers health tools when filtered for agentOnly: true', () => {
            const agentTools = BaseRemotableOperation.GetExposedToolOperations({ agentOnly: true });
            const foundRunCheck = agentTools.find((t) => t.OperationKey === 'Health.RunCheck');
            expect(foundRunCheck).toBeDefined();
            expect(foundRunCheck?.ExposeAsAgentTool).toBe(true);
        });

        it('discovers health tools when filtered for mcpOnly: true', () => {
            const mcpTools = BaseRemotableOperation.GetExposedToolOperations({ mcpOnly: true });
            const foundLiveCrud = mcpTools.find((t) => t.OperationKey === 'Health.ExecuteLiveCrudVerification');
            expect(foundLiveCrud).toBeDefined();
            expect(foundLiveCrud?.ExposeAsMCPTool).toBe(true);
        });
    });

    describe('2. HealthRunCheckOperation', () => {
        it('executes passive health checks and records to bridge and OTel metrics', async () => {
            const runCheckSpy = vi.spyOn(MJHealthEngine.Instance, 'RunCheck').mockResolvedValue(mockReport);
            const recordBridgeSpy = vi.spyOn(LocalTelemetrySignalBridge.Instance, 'RecordHealthReport').mockImplementation(() => {});
            const recordOtelSpy = vi.spyOn(OtelMetrics.Instance, 'RecordHealthReport').mockImplementation(() => {});

            const op = new HealthRunCheckOperation();
            const ctx = createMockServerContext('Owner');

            const res = await op.ExecuteServer({ CheckType: 'passive', AppFilter: 'Core' }, ctx);

            expect(res.Success).toBe(true);
            expect(res.Output?.OverallStatus).toBe('GREEN');
            expect(runCheckSpy).toHaveBeenCalledWith('passive', expect.objectContaining({ AppFilter: 'Core' }));
            expect(recordBridgeSpy).toHaveBeenCalledWith(mockReport);
            expect(recordOtelSpy).toHaveBeenCalledWith(mockReport);
        });

        it('rejects unauthorized non-owner callers lacking Diagnostics permission', async () => {
            const op = new HealthRunCheckOperation();
            const ctx = createMockServerContext('User', false);

            const res = await op.ExecuteServer({ CheckType: 'passive' }, ctx);

            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('FORBIDDEN');
        });
    });

    describe('3. HealthLiveCrudVerificationOperation', () => {
        it('executes live-test probe with rollback mode', async () => {
            const liveReport: InstanceHealthReport = {
                ...mockReport,
                Mode: 'live-test',
                Signals: [
                    {
                        Code: 'MJ.CORE.LIVE.ENTITY_CRUD_AND_RLS',
                        Title: 'Live CRUD Verification',
                        Layer: 'ApplicationPlatform',
                        OwnerApp: 'Core',
                        Mode: 'live-test',
                        Status: 'GREEN',
                        Summary: 'Zero residue verified',
                        ObservedMetrics: { rollbackSuccessful: true, durationMs: 14.2 },
                        EvaluatedAt: new Date().toISOString(),
                        DurationMs: 14.2,
                    },
                ],
            };

            const runCheckSpy = vi.spyOn(MJHealthEngine.Instance, 'RunCheck').mockResolvedValue(liveReport);
            const op = new HealthLiveCrudVerificationOperation();
            const ctx = createMockServerContext('Owner');

            const res = await op.ExecuteServer({ AppFilter: 'Core' }, ctx);

            expect(res.Success).toBe(true);
            expect(res.Output?.Mode).toBe('live-test');
            expect(res.Output?.Signals[0].Code).toBe('MJ.CORE.LIVE.ENTITY_CRUD_AND_RLS');
            expect(runCheckSpy).toHaveBeenCalledWith('live-test', expect.objectContaining({ AppFilter: 'Core' }));
        });
    });

    describe('4. HealthObservatoryMinuteSeriesOperation', () => {
        it('retrieves time-series buckets from LocalTelemetrySignalBridge', async () => {
            vi.spyOn(LocalTelemetrySignalBridge.Instance, 'GetCountBuckets').mockReturnValue([
                {
                    BucketStartIso: '2026-11-12T12:00:00Z',
                    Category: 'RunView',
                    Count: 42,
                    TotalElapsedMs: 840,
                    TotalInputTokens: 0,
                    TotalOutputTokens: 0,
                },
            ]);
            vi.spyOn(LocalTelemetrySignalBridge.Instance, 'GetHealthBuckets').mockReturnValue([
                { BucketStartIso: '2026-11-12T12:00:00Z', Green: 7, Yellow: 0, Red: 0 },
            ]);
            vi.spyOn(LocalTelemetrySignalBridge.Instance, 'GetProbeSignalBuckets').mockReturnValue([
                { BucketStartIso: '2026-11-12T12:00:00Z', SignalCode: 'MJ.CORE.DB', Status: 'GREEN', LatencyMs: 2.5 },
            ]);
            vi.spyOn(LocalTelemetrySignalBridge.Instance, 'GetFeatureUsageBuckets').mockReturnValue([
                { BucketStartIso: '2026-11-12T12:00:00Z', RouteTemplate: '/health/observatory', Count: 10 },
            ]);

            const op = new HealthObservatoryMinuteSeriesOperation();
            const ctx = createMockServerContext('Owner');

            const res = await op.ExecuteServer({ Category: 'RunView' }, ctx);

            expect(res.Success).toBe(true);
            expect(res.Output?.CountBuckets).toHaveLength(1);
            expect(res.Output?.CountBuckets[0].Count).toBe(42);
            expect(res.Output?.HealthBuckets[0].Green).toBe(7);
            expect(res.Output?.ProbeSignalBuckets[0].SignalCode).toBe('MJ.CORE.DB');
            expect(res.Output?.FeatureUsageBuckets[0].RouteTemplate).toBe('/health/observatory');
        });
    });

    describe('5. HealthTelemetryAggregatesOperation', () => {
        it('computes aggregated percentiles, call volume, and token velocity from ring buffer', async () => {
            vi.spyOn(TelemetryManager.Instance, 'GetEvents').mockReturnValue([
                {
                    id: 'ev-1',
                    category: 'RunView',
                    operation: 'RunView.Users',
                    startTime: Date.now() - 1000,
                    elapsedMs: 20,
                    userId: 'u1',
                    params: { success: true },
                },
                {
                    id: 'ev-2',
                    category: 'RunView',
                    operation: 'RunView.Roles',
                    startTime: Date.now() - 500,
                    elapsedMs: 80,
                    userId: 'u1',
                    params: { success: false, error: 'Timeout' },
                },
                {
                    id: 'ev-3',
                    category: 'AI',
                    operation: 'AIPromptRunner.Run',
                    startTime: Date.now() - 200,
                    elapsedMs: 150,
                    userId: 'u1',
                    params: { success: true, inputTokens: 500, outputTokens: 120 },
                },
            ]);

            const op = new HealthTelemetryAggregatesOperation();
            const ctx = createMockServerContext('Owner');

            const res = await op.ExecuteServer({ WindowMinutes: 60 }, ctx);

            expect(res.Success).toBe(true);
            expect(res.Output?.Aggregates).toHaveLength(2);

            const runViewAgg = res.Output?.Aggregates.find((a) => a.Category === 'RunView');
            expect(runViewAgg?.EventCount).toBe(2);
            expect(runViewAgg?.ErrorCount).toBe(1);
            expect(runViewAgg?.MinElapsedMs).toBe(20);
            expect(runViewAgg?.MaxElapsedMs).toBe(80);

            const aiAgg = res.Output?.Aggregates.find((a) => a.Category === 'AI');
            expect(aiAgg?.EventCount).toBe(1);
            expect(aiAgg?.TotalInputTokens).toBe(500);
            expect(aiAgg?.TotalOutputTokens).toBe(120);
        });
    });

    describe('6. HealthRecentRingBufferEventsOperation', () => {
        it('returns bounded events with PII-scrubbed parameters', async () => {
            vi.spyOn(TelemetryManager.Instance, 'GetEvents').mockReturnValue([
                {
                    id: 'ev-100',
                    category: 'Engine',
                    operation: 'Transaction.Commit',
                    startTime: 1000,
                    elapsedMs: 15,
                    userId: 'usr-1',
                    params: { entity: 'MJ: Users', sanitized: true, inputTokens: 20 },
                },
            ]);

            const op = new HealthRecentRingBufferEventsOperation();
            const ctx = createMockServerContext('Owner');

            const res = await op.ExecuteServer({ Limit: 10, Category: 'Engine' }, ctx);

            expect(res.Success).toBe(true);
            expect(res.Output?.Events).toHaveLength(1);
            expect(res.Output?.Events[0].ID).toBe('ev-100');
            expect(res.Output?.Events[0].InputTokens).toBe(20);
            expect(JSON.parse(res.Output?.Events[0].ParamsJson!)).toEqual({
                entity: 'MJ: Users',
                sanitized: true,
                inputTokens: 20,
            });
        });
    });

    describe('7. HealthOtelStatusOperation', () => {
        it('returns OpenTelemetry SDK spine initialization state and configuration', async () => {
            vi.spyOn(OtelSdk.Instance, 'IsInitialized', 'get').mockReturnValue(true);
            vi.spyOn(OtelSdk.Instance, 'Config', 'get').mockReturnValue({
                Enabled: true,
                ServiceName: 'memberjunction-backend',
                ServiceVersion: '6.3.0-edge.0',
                Environment: 'staging',
                OtlpEndpoint: 'http://otel-collector:4318',
                TracesEndpoint: 'http://otel-collector:4318/v1/traces',
                MetricsEndpoint: 'http://otel-collector:4318/v1/metrics',
                DatabasePlatform: 'sqlserver',
                SamplingRatio: 0.5,
            });

            const op = new HealthOtelStatusOperation();
            const ctx = createMockServerContext('Owner');

            const res = await op.ExecuteServer({}, ctx);

            expect(res.Success).toBe(true);
            expect(res.Output?.Enabled).toBe(true);
            expect(res.Output?.IsInitialized).toBe(true);
            expect(res.Output?.ServiceName).toBe('memberjunction-backend');
            expect(res.Output?.SamplingRatio).toBe(0.5);
        });
    });

    describe('8. HealthPreviewSharePackageOperation', () => {
        it('returns deterministic preview package without transmission', async () => {
            const mockPkg: TelemetryPackage = {
                Payload: {
                    ConsentTier: 'HealthAndAggregatedUsage',
                    GeneratedAtIso: '2026-11-12T12:00:00.000Z',
                    InstanceUuid: '00000000-0000-0000-0000-000000000000',
                    MJVersion: '6.3.0',
                    DatabasePlatform: 'sqlserver',
                    HealthSignals: { Buckets: [] },
                    AggregatedUsage: { Buckets: [] },
                    FeatureUsage: { DailyBuckets: [] },
                },
                PayloadHashHex: 'deadbeef12345678',
                PayloadJson: '{"test":true}',
            };

            vi.spyOn(ShareLayerPackager.Instance, 'PreviewNextPackage').mockReturnValue(mockPkg);

            const op = new HealthPreviewSharePackageOperation();
            const ctx = createMockServerContext('Owner');

            const res = await op.ExecuteServer({ ConsentTier: 'HealthAndAggregatedUsage' }, ctx);

            expect(res.Success).toBe(true);
            expect(res.Output?.ConsentTier).toBe('HealthAndAggregatedUsage');
            expect(res.Output?.PayloadHashHex).toBe('deadbeef12345678');
            expect(res.Output?.AllowlistCompliant).toBe(true);
        });

        it('rejects preview request when consent tier is Off', async () => {
            const op = new HealthPreviewSharePackageOperation();
            const ctx = createMockServerContext('Owner');

            const res = await op.ExecuteServer({ ConsentTier: 'Off' }, ctx);

            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('INVALID_CONSENT_TIER');
            expect(res.ErrorMessage).toContain('Cannot preview share package for consent tier "Off"');
        });
    });

    describe('9. Agent Chat Turn Tool Execution Simulation', () => {
        it('simulates an AI Agent invoking Health.RunCheck during a conversation turn', async () => {
            vi.spyOn(MJHealthEngine.Instance, 'RunCheck').mockResolvedValue(mockReport);
            const ctx = createMockServerContext('Owner');

            // Agent discovers tool
            const agentTools = BaseRemotableOperation.GetExposedToolOperations({ agentOnly: true });
            const healthTool = agentTools.find((t) => t.OperationKey === 'Health.RunCheck')!;

            // Agent creates operation instance via ClassFactory
            const opInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation<object, object>>(
                BaseRemotableOperation,
                healthTool.OperationKey,
            );
            expect(opInstance).toBeDefined();

            // Agent dispatches tool call with arguments
            const agentToolInput = { CheckType: 'passive', AppFilter: 'Core' };
            const agentResult = await opInstance!.ExecuteServer(agentToolInput, ctx);

            expect(agentResult.Success).toBe(true);
            const report = agentResult.Output as InstanceHealthReport;
            expect(report.OverallStatus).toBe('GREEN');
            expect(report.SummaryCounts.Green).toBe(7);
        });
    });
});
