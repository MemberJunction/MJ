import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MeterProvider, InMemoryMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OtelMetrics, HEALTH_STATUS_METRIC_VALUE } from '../../otel/OtelMetrics';
import type { HealthSignalEvaluation } from '../../types';

describe('OtelMetrics', () => {
  let exporter: InMemoryMetricExporter;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    exporter = new InMemoryMetricExporter();
    const reader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 60_000,
    });
    meterProvider = new MeterProvider({ readers: [reader] });
    const meter = meterProvider.getMeter('test-meter');
    OtelMetrics.Instance.Initialize(meter);
  });

  afterEach(async () => {
    OtelMetrics.Instance.Reset();
    await meterProvider.shutdown();
  });

  it('numeric health status codes correctly map GREEN: 0, YELLOW: 1, RED: 2', () => {
    expect(HEALTH_STATUS_METRIC_VALUE.GREEN).toBe(0);
    expect(HEALTH_STATUS_METRIC_VALUE.YELLOW).toBe(1);
    expect(HEALTH_STATUS_METRIC_VALUE.RED).toBe(2);
  });

  it('records requests, RunView, RunQuery, and cache operations without throwing', () => {
    expect(() => {
      OtelMetrics.Instance.RecordRequest('GET', '/api/users', 200, 45.2);
      OtelMetrics.Instance.RecordRequest('POST', '/graphql', 500, 120.5);
      OtelMetrics.Instance.RecordRunView('Users', 15.4, true);
      OtelMetrics.Instance.RecordRunQuery('RecentActivity', 32.1, false);
      OtelMetrics.Instance.RecordCacheOperation('get', true);
      OtelMetrics.Instance.RecordCacheOperation('get', false);
      OtelMetrics.Instance.RecordAiTokens('gpt-4o', 'input', 120);
      OtelMetrics.Instance.RecordAiTokens('gpt-4o', 'output', 45);
      OtelMetrics.Instance.RecordDbPoolUsage(5, 15);
    }).not.toThrow();
  });

  it('records health signal evaluations into observable gauge state', () => {
    const mockEvaluations: HealthSignalEvaluation[] = [
      {
        Code: 'MJ.CORE.DB.CONNECTIVITY',
        Title: 'Database Connectivity',
        Layer: 'core',
        OwnerApp: '__mj',
        Mode: 'passive',
        Status: 'GREEN',
        Summary: 'Connected',
        ObservedMetrics: { LatencyMs: 4 },
        Thresholds: {},
        EvaluatedAt: new Date().toISOString(),
        DurationMs: 4,
      },
      {
        Code: 'MJ.CORE.AI.PROVIDER_READINESS',
        Title: 'AI Readiness',
        Layer: 'core',
        OwnerApp: '__mj',
        Mode: 'passive',
        Status: 'YELLOW',
        Summary: 'Single provider',
        ObservedMetrics: {},
        Thresholds: {},
        EvaluatedAt: new Date().toISOString(),
        DurationMs: 8,
      },
      {
        Code: 'MJ.CORE.QUEUE.WORKER_HEARTBEAT',
        Title: 'Queue Heartbeat',
        Layer: 'core',
        OwnerApp: '__mj',
        Mode: 'passive',
        Status: 'RED',
        Summary: 'Overdue jobs',
        ObservedMetrics: {},
        Thresholds: {},
        EvaluatedAt: new Date().toISOString(),
        DurationMs: 12,
      },
    ];

    expect(() => {
      OtelMetrics.Instance.RecordHealthSignals(mockEvaluations);
    }).not.toThrow();
  });
});
