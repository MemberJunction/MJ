import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResolveOtelConfig } from '../../otel/OtelConfig';

describe('ResolveOtelConfig', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.OTEL_SDK_DISABLED;
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_SERVICE_VERSION;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
    delete process.env.NODE_ENV;
    delete process.env.MJ_DATABASE_DIALECT;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('is disabled by default when no config or OTEL env vars are provided', () => {
    const resolved = ResolveOtelConfig();
    expect(resolved.Enabled).toBe(false);
    expect(resolved.ServiceName).toBe('memberjunction');
    expect(resolved.Environment).toBe('development');
    expect(resolved.DatabasePlatform).toBe('sqlserver');
    expect(resolved.SamplingRatio).toBe(1.0);
  });

  it('respects explicit Enabled: true in config', () => {
    const resolved = ResolveOtelConfig({
      Enabled: true,
      ServiceName: 'custom-service',
      Environment: 'staging',
      DatabasePlatform: 'postgresql',
      SamplingRatio: 0.5,
    });
    expect(resolved.Enabled).toBe(true);
    expect(resolved.ServiceName).toBe('custom-service');
    expect(resolved.Environment).toBe('staging');
    expect(resolved.DatabasePlatform).toBe('postgresql');
    expect(resolved.SamplingRatio).toBe(0.5);
  });

  it('enables automatically if OTEL_EXPORTER_OTLP_ENDPOINT is present', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
    process.env.OTEL_SERVICE_NAME = 'env-service';

    const resolved = ResolveOtelConfig();
    expect(resolved.Enabled).toBe(true);
    expect(resolved.ServiceName).toBe('env-service');
  });

  it('remains disabled if OTEL_SDK_DISABLED=true even if endpoint is present', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
    process.env.OTEL_SDK_DISABLED = 'true';

    const resolved = ResolveOtelConfig({ Enabled: true });
    expect(resolved.Enabled).toBe(false);
  });
});
