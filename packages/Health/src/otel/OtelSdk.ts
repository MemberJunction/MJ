import { trace, metrics, type Tracer, type Meter } from '@opentelemetry/api';
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
  BatchSpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { BaseSingleton } from '@memberjunction/global';
import { ResolveOtelConfig, type OtelConfig, type ResolvedOtelConfig } from './OtelConfig';
import { OtelSpanBridge } from './OtelSpanBridge';
import { OtelMetrics } from './OtelMetrics';

/**
 * Singleton managing the OpenTelemetry SDK runtime lifecycle for MemberJunction:
 * configuration resolution, tracer/meter initialization, span bridging, and clean shutdown.
 */
export class OtelSdk extends BaseSingleton<OtelSdk> {
  private _tracerProvider?: NodeTracerProvider;
  private _meterProvider?: MeterProvider;
  private _config?: ResolvedOtelConfig;
  private _isInitialized = false;
  private _sigtermHandler?: () => void;
  private _sigintHandler?: () => void;

  protected constructor() {
    super();
  }

  public static get Instance(): OtelSdk {
    return super.getInstance<OtelSdk>();
  }

  /**
   * Initializes the OpenTelemetry SDK spine.
   * If config resolves to disabled, returns false with zero runtime overhead
   * (no SDK initialized, no global registrations, no event listeners attached).
   */
  public Initialize(config?: OtelConfig): boolean {
    if (this._isInitialized) {
      return true;
    }

    const resolved = ResolveOtelConfig(config);
    this._config = resolved;

    if (!resolved.Enabled) {
      return false;
    }

    const resource = new Resource({
      'service.name': resolved.ServiceName,
      'service.version': resolved.ServiceVersion,
      'deployment.environment': resolved.Environment,
      'db.system': resolved.DatabasePlatform,
    });

    const sampler = new TraceIdRatioBasedSampler(resolved.SamplingRatio);
    const tracerProvider = new NodeTracerProvider({ resource, sampler });

    if (resolved.CustomSpanExporter) {
      tracerProvider.addSpanProcessor(new SimpleSpanProcessor(resolved.CustomSpanExporter));
    } else if (resolved.TracesEndpoint || resolved.OtlpEndpoint) {
      const tracesUrl =
        resolved.TracesEndpoint ||
        (resolved.OtlpEndpoint?.endsWith('/v1/traces')
          ? resolved.OtlpEndpoint
          : `${resolved.OtlpEndpoint}/v1/traces`);
      const exporter = new OTLPTraceExporter({
        url: tracesUrl,
        headers: resolved.Headers,
      });
      tracerProvider.addSpanProcessor(new BatchSpanProcessor(exporter));
    }

    tracerProvider.register();
    this._tracerProvider = tracerProvider;

    let meterProvider: MeterProvider;
    if (resolved.CustomMetricReader) {
      meterProvider = new MeterProvider({
        resource,
        readers: [resolved.CustomMetricReader],
      });
    } else if (resolved.MetricsEndpoint || resolved.OtlpEndpoint) {
      const metricsUrl =
        resolved.MetricsEndpoint ||
        (resolved.OtlpEndpoint?.endsWith('/v1/metrics')
          ? resolved.OtlpEndpoint
          : `${resolved.OtlpEndpoint}/v1/metrics`);
      const metricExporter = new OTLPMetricExporter({
        url: metricsUrl,
        headers: resolved.Headers,
      });
      const metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 15_000,
      });
      meterProvider = new MeterProvider({
        resource,
        readers: [metricReader],
      });
    } else {
      meterProvider = new MeterProvider({ resource });
    }

    metrics.setGlobalMeterProvider(meterProvider);
    this._meterProvider = meterProvider;

    OtelSpanBridge.Instance.Start(this.Tracer, resolved.DatabasePlatform);
    OtelMetrics.Instance.Initialize(this.Meter);

    this.registerProcessSignalHandlers();
    this._isInitialized = true;
    return true;
  }

  /**
   * Flushes telemetry buffers, unbinds TelemetryManager event listeners, and shuts down providers.
   */
  public async Shutdown(): Promise<void> {
    if (!this._isInitialized) {
      return;
    }

    OtelSpanBridge.Instance.Stop();

    if (this._sigtermHandler && typeof process !== 'undefined') {
      process.removeListener('SIGTERM', this._sigtermHandler);
      this._sigtermHandler = undefined;
    }
    if (this._sigintHandler && typeof process !== 'undefined') {
      process.removeListener('SIGINT', this._sigintHandler);
      this._sigintHandler = undefined;
    }

    if (this._tracerProvider) {
      await this._tracerProvider.shutdown();
      this._tracerProvider = undefined;
    }
    if (this._meterProvider) {
      await this._meterProvider.shutdown();
      this._meterProvider = undefined;
    }

    OtelMetrics.Instance.Reset();
    this._isInitialized = false;
    this._config = undefined;
  }

  /** True if the OpenTelemetry SDK is initialized and active. */
  public get IsEnabled(): boolean {
    return this._isInitialized;
  }

  /** True if the OpenTelemetry SDK is initialized and active. */
  public get IsInitialized(): boolean {
    return this._isInitialized;
  }

  /** Returns the active OpenTelemetry Tracer for the health package. */
  public get Tracer(): Tracer {
    return trace.getTracer('memberjunction', this._config?.ServiceVersion ?? '6.3.0-edge.0');
  }

  /** Returns the active OpenTelemetry Meter for the health package. */
  public get Meter(): Meter {
    return metrics.getMeter('memberjunction', this._config?.ServiceVersion ?? '6.3.0-edge.0');
  }

  /** Returns the active resolved configuration if initialized. */
  public get Config(): ResolvedOtelConfig | undefined {
    return this._config;
  }

  private registerProcessSignalHandlers(): void {
    if (typeof process === 'undefined' || typeof process.on !== 'function') {
      return;
    }

    this._sigtermHandler = () => {
      this.Shutdown().catch((err) => {
        console.error('OtelSdk: error shutting down on SIGTERM:', err);
      });
    };
    this._sigintHandler = () => {
      this.Shutdown().catch((err) => {
        console.error('OtelSdk: error shutting down on SIGINT:', err);
      });
    };

    process.once('SIGTERM', this._sigtermHandler);
    process.once('SIGINT', this._sigintHandler);
  }
}
