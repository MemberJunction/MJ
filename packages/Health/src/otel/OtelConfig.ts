import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { MetricReader } from '@opentelemetry/sdk-metrics';

/** Configuration options for the MemberJunction OpenTelemetry SDK spine. */
export interface OtelConfig {
  /**
   * Explicit opt-in flag. When false or omitted without OTEL_* environment variables,
   * the SDK remains completely disabled with zero runtime overhead.
   */
  Enabled?: boolean;

  /** Service name resource attribute. Defaults to `OTEL_SERVICE_NAME` or `'memberjunction'`. */
  ServiceName?: string;

  /** Service version resource attribute. Defaults to the package version (e.g. `'6.3.0-edge.0'`). */
  ServiceVersion?: string;

  /** Deployment environment resource attribute (e.g. `'production'`, `'staging'`, `'development'`). */
  Environment?: string;

  /** Base OTLP exporter endpoint (e.g. `'http://localhost:4318'`). */
  OtlpEndpoint?: string;

  /** Dedicated traces endpoint if separate from {@link OtlpEndpoint} (e.g. `'http://localhost:4318/v1/traces'`). */
  TracesEndpoint?: string;

  /** Dedicated metrics endpoint if separate from {@link OtlpEndpoint} (e.g. `'http://localhost:4318/v1/metrics'`). */
  MetricsEndpoint?: string;

  /** Underlying database system platform name for semantic conventions (`'sqlserver'`, `'postgresql'`). */
  DatabasePlatform?: string;

  /** Sampling ratio between 0.0 and 1.0 (defaults to 1.0 = sample all traces). */
  SamplingRatio?: number;

  /** Custom headers to send with outbound OTLP HTTP trace and metric exports. */
  Headers?: Record<string, string>;

  /** Optional in-memory or custom span exporter (primarily for testing). */
  CustomSpanExporter?: SpanExporter;

  /** Optional custom metric reader (primarily for testing). */
  CustomMetricReader?: MetricReader;
}

/** Resolved configuration with guaranteed defaults for core metadata attributes. */
export type ResolvedOtelConfig = Required<
  Pick<OtelConfig, 'Enabled' | 'ServiceName' | 'ServiceVersion' | 'Environment' | 'DatabasePlatform' | 'SamplingRatio'>
> &
  OtelConfig;

/**
 * Resolves configuration from user options and environment variables.
 * Disables the SDK by default unless explicitly enabled via config or standard `OTEL_*` env vars.
 */
export function ResolveOtelConfig(config?: OtelConfig): ResolvedOtelConfig {
  const envDisabled = process.env.OTEL_SDK_DISABLED === 'true' || process.env.OTEL_SDK_DISABLED === '1';
  const hasOtlpEnv = Boolean(
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
      process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  );

  const enabled = !envDisabled && (config?.Enabled ?? hasOtlpEnv);
  const serviceName = config?.ServiceName || process.env.OTEL_SERVICE_NAME || 'memberjunction';
  const serviceVersion = config?.ServiceVersion || process.env.OTEL_SERVICE_VERSION || '6.3.0-edge.0';
  const environment = config?.Environment || process.env.NODE_ENV || 'development';
  const dbPlatform = config?.DatabasePlatform || process.env.MJ_DATABASE_DIALECT || 'sqlserver';
  const samplingRatio = config?.SamplingRatio ?? 1.0;

  return {
    ...config,
    Enabled: enabled,
    ServiceName: serviceName,
    ServiceVersion: serviceVersion,
    Environment: environment,
    DatabasePlatform: dbPlatform,
    SamplingRatio: samplingRatio,
  };
}
