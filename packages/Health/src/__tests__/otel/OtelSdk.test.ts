import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';
import { InMemoryMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OtelSdk } from '../../otel/OtelSdk';
import { OtelSpanBridge } from '../../otel/OtelSpanBridge';

describe('OtelSdk', () => {
  beforeEach(async () => {
    await OtelSdk.Instance.Shutdown();
  });

  afterEach(async () => {
    await OtelSdk.Instance.Shutdown();
  });

  it('remains uninitialized with zero overhead when disabled', () => {
    const initialized = OtelSdk.Instance.Initialize({ Enabled: false });
    expect(initialized).toBe(false);
    expect(OtelSdk.Instance.IsInitialized).toBe(false);
    expect(OtelSpanBridge.Instance.ActiveSpanCount).toBe(0);
  });

  it('initializes cleanly when enabled with in-memory exporter', async () => {
    const spanExporter = new InMemorySpanExporter();
    const metricExporter = new InMemoryMetricExporter();
    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 60_000,
    });

    const initialized = OtelSdk.Instance.Initialize({
      Enabled: true,
      ServiceName: 'test-service',
      CustomSpanExporter: spanExporter,
      CustomMetricReader: metricReader,
    });

    expect(initialized).toBe(true);
    expect(OtelSdk.Instance.IsInitialized).toBe(true);
    expect(OtelSdk.Instance.Tracer).toBeDefined();
    expect(OtelSdk.Instance.Meter).toBeDefined();

    await OtelSdk.Instance.Shutdown();
    expect(OtelSdk.Instance.IsInitialized).toBe(false);
  });

  it('is idempotent when Initialize is called repeatedly', async () => {
    const spanExporter = new InMemorySpanExporter();
    const first = OtelSdk.Instance.Initialize({
      Enabled: true,
      CustomSpanExporter: spanExporter,
    });
    expect(first).toBe(true);

    const second = OtelSdk.Instance.Initialize({
      Enabled: true,
    });
    expect(second).toBe(true);

    await OtelSdk.Instance.Shutdown();
  });
});
