import { createHash, createHmac } from 'node:crypto';
import type { TelemetryPackage } from './ShareLayerPackager';

/**
 * The four-tier consent hierarchy governing what a `ShareLayerPackager` is permitted to build and
 * send. `'Off'` is the default on every self-hosted and independent instance — nothing is ever
 * packaged or transmitted at that tier. See `docs/telemetry-shareable-schema.md` §2.
 */
export type ConsentTier = 'Off' | 'HealthOnly' | 'HealthAndAggregatedUsage' | 'HealthAndMetadataEvents';

/** Ordered rank of each {@link ConsentTier}, used to check "at least tier X" without string comparisons scattered everywhere. */
export const CONSENT_TIER_RANK: Readonly<Record<ConsentTier, number>> = {
  Off: 0,
  HealthOnly: 1,
  HealthAndAggregatedUsage: 2,
  HealthAndMetadataEvents: 3,
};

/** True when `granted` is at least as permissive as `required` (e.g. a sink requiring `HealthOnly` may run under `HealthAndAggregatedUsage`). */
export function ConsentTierSatisfies(granted: ConsentTier, required: ConsentTier): boolean {
  return CONSENT_TIER_RANK[granted] >= CONSENT_TIER_RANK[required];
}

/** Outcome of a single {@link BaseTelemetrySink.DeliverPackage} attempt. */
export interface SinkAckResult {
  Success: boolean;
  StatusCode: number;
  RetryAfterSeconds?: number;
  ErrorMessage?: string;
}

/** Per-dispatch context a sink needs to deliver a package, independent of the package contents. */
export interface SinkExecutionContext {
  /** The installation's private HMAC signing key, hex-encoded. Never logged or echoed back. */
  SigningKeyHex: string;
  /** Opaque installation identifier included in delivery headers/metadata, never a tenant/user ID. */
  InstallId: string;
  /** `sha256=<hex>` — the computed `x-mj-signature` header value for the package. */
  SignatureHeader?: string;
}

/** Outbound HTTP request parameters for telemetry sinks. */
export interface TelemetryHttpRequest {
  Url: string;
  Method: 'POST';
  Headers: Record<string, string>;
  Body: string;
  TimeoutMs?: number;
}

/** Outbound HTTP response returned by an HTTP transport. */
export interface TelemetryHttpResponse {
  StatusCode: number;
  RetryAfterHeader?: string;
  BodyText?: string;
}

/** Injectable, strongly-typed HTTP transport function. */
export type TelemetryHttpTransport = (request: TelemetryHttpRequest) => Promise<TelemetryHttpResponse>;

/** Default fetch-backed implementation of {@link TelemetryHttpTransport}. */
export const DefaultTelemetryHttpTransport: TelemetryHttpTransport = async (request: TelemetryHttpRequest): Promise<TelemetryHttpResponse> => {
  const controller = typeof AbortController !== 'undefined' && request.TimeoutMs ? new AbortController() : undefined;
  const timer = controller && request.TimeoutMs ? setTimeout(() => controller.abort(), request.TimeoutMs) : undefined;
  try {
    const res = await fetch(request.Url, {
      method: request.Method,
      headers: request.Headers,
      body: request.Body,
      signal: controller?.signal,
    });
    const bodyText = await res.text();
    const retryAfter = res.headers.get('retry-after') ?? undefined;
    return {
      StatusCode: res.status,
      RetryAfterHeader: retryAfter,
      BodyText: bodyText,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

function parseRetryAfterHeader(header?: string): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds);
  }
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, Math.floor((dateMs - Date.now()) / 1000));
  }
  return undefined;
}

/**
 * Pluggable outbound delivery destination for a consent-gated `TelemetryPackage`. Concrete sinks
 * (a federated peer-sync target, an MJ Central fleet endpoint, a generic OTLP exporter) subclass
 * this and are invoked by `ShareLayerPackager.DispatchToSink` — never called directly by a probe
 * or the telemetry bridge, which keeps every sink unaware of how its package was assembled.
 */
export abstract class BaseTelemetrySink {
  /** Unique, stable key identifying this sink (e.g. `'mjc-fleet'`, `'otlp-http'`). */
  public abstract readonly SinkKey: string;

  /** Human-readable name for admin UI / CLI listings. */
  public abstract readonly DisplayName: string;

  /** The minimum consent tier a dispatch must be granted for this sink to run at all. */
  public abstract readonly RequiredConsentTier: Exclude<ConsentTier, 'Off'>;

  /** How often this sink expects to receive a new package, in minutes. */
  public abstract readonly BatchCadenceMinutes: number;

  /**
   * Delivers `pkg` to this sink's destination. Implementations must not throw for an ordinary
   * delivery failure (network error, non-2xx response) — report it via `SinkAckResult.Success =
   * false` so `ShareLayerPackager` can still produce a complete, honest audit record. Reserve a
   * thrown exception for a programming error (e.g. missing required configuration).
   */
  public abstract DeliverPackage(pkg: TelemetryPackage, context: SinkExecutionContext): Promise<SinkAckResult>;

  /**
   * Protected helper for sending JSON over an HTTP transport and mapping response/exceptions to SinkAckResult.
   */
  protected async PostJson(
    transport: TelemetryHttpTransport,
    url: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs: number,
  ): Promise<SinkAckResult> {
    try {
      const response = await transport({
        Url: url,
        Method: 'POST',
        Headers: headers,
        Body: body,
        TimeoutMs: timeoutMs,
      });

      const success = response.StatusCode >= 200 && response.StatusCode < 300;
      return {
        Success: success,
        StatusCode: response.StatusCode,
        RetryAfterSeconds: parseRetryAfterHeader(response.RetryAfterHeader),
        ErrorMessage: success ? undefined : (response.BodyText || `HTTP ${response.StatusCode}`),
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        Success: false,
        StatusCode: 0,
        ErrorMessage: errorMsg,
      };
    }
  }
}

/** No-op telemetry sink for dry-runs and testing. */
export class NoopTelemetrySink extends BaseTelemetrySink {
  public readonly SinkKey = 'noop';
  public readonly DisplayName = 'No-op Telemetry Sink';
  public readonly RequiredConsentTier = 'HealthOnly' as const;
  public readonly BatchCadenceMinutes = 1440;

  public async DeliverPackage(_pkg: TelemetryPackage, _context: SinkExecutionContext): Promise<SinkAckResult> {
    return { Success: true, StatusCode: 204 };
  }
}

/** Configuration options for {@link MJCentralTelemetrySink}. */
export interface MJCentralTelemetrySinkOptions {
  EndpointUrl: string;
  Transport?: TelemetryHttpTransport;
  TimeoutMs?: number;
}

/** Sinks telemetry packages to MemberJunction Central fleet service over HTTPS. */
export class MJCentralTelemetrySink extends BaseTelemetrySink {
  public readonly SinkKey = 'mjc-fleet';
  public readonly DisplayName = 'MemberJunction Central Fleet Sink';
  public readonly RequiredConsentTier = 'HealthOnly' as const;
  public readonly BatchCadenceMinutes = 1440;

  private readonly _endpointUrl: string;
  private readonly _transport: TelemetryHttpTransport;
  private readonly _timeoutMs: number;

  constructor(options: MJCentralTelemetrySinkOptions) {
    super();
    if (!options?.EndpointUrl) {
      throw new Error('MJCentralTelemetrySink: EndpointUrl is required.');
    }
    this._endpointUrl = options.EndpointUrl;
    this._transport = options.Transport ?? DefaultTelemetryHttpTransport;
    this._timeoutMs = options.TimeoutMs ?? 30_000;
  }

  public async DeliverPackage(pkg: TelemetryPackage, context: SinkExecutionContext): Promise<SinkAckResult> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-mj-install-id': context.InstallId,
      'x-mj-consent-tier': pkg.Payload.ConsentTier,
      'x-mj-payload-sha256': pkg.PayloadHashHex,
      'x-mj-signature': context.SignatureHeader ?? '',
    };
    return this.PostJson(this._transport, this._endpointUrl, headers, pkg.PayloadJson, this._timeoutMs);
  }
}

/** Configuration options for {@link FederatedMJTelemetrySink}. */
export interface FederatedMJTelemetrySinkOptions {
  EndpointUrl: string;
  PeerId?: string;
  Transport?: TelemetryHttpTransport;
  TimeoutMs?: number;
}

/** Sinks telemetry packages to a peer MemberJunction deployment in a federated topology. */
export class FederatedMJTelemetrySink extends BaseTelemetrySink {
  public readonly SinkKey = 'mj-federated-peer';
  public readonly DisplayName = 'Federated MemberJunction Peer Sink';
  public readonly RequiredConsentTier = 'HealthOnly' as const;
  public readonly BatchCadenceMinutes = 60;

  private readonly _endpointUrl: string;
  private readonly _peerId?: string;
  private readonly _transport: TelemetryHttpTransport;
  private readonly _timeoutMs: number;

  constructor(options: FederatedMJTelemetrySinkOptions) {
    super();
    this._endpointUrl = options.EndpointUrl;
    this._peerId = options.PeerId;
    this._transport = options.Transport ?? DefaultTelemetryHttpTransport;
    this._timeoutMs = options.TimeoutMs ?? 30_000;
  }

  public async DeliverPackage(pkg: TelemetryPackage, context: SinkExecutionContext): Promise<SinkAckResult> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-mj-install-id': context.InstallId,
      'x-mj-consent-tier': pkg.Payload.ConsentTier,
      'x-mj-payload-sha256': pkg.PayloadHashHex,
      'x-mj-signature': context.SignatureHeader ?? '',
    };
    if (this._peerId) {
      headers['x-mj-peer-id'] = this._peerId;
    }
    return this.PostJson(this._transport, this._endpointUrl, headers, pkg.PayloadJson, this._timeoutMs);
  }
}

/** Configuration options for {@link OtlpHttpTelemetrySink}. */
export interface OtlpHttpTelemetrySinkOptions {
  CollectorUrl?: string;
  Headers?: Record<string, string>;
  Transport?: TelemetryHttpTransport;
  TimeoutMs?: number;
}

/** Sinks health and usage buckets transformed to OTLP/HTTP JSON metrics format. */
export class OtlpHttpTelemetrySink extends BaseTelemetrySink {
  public readonly SinkKey = 'otlp-http';
  public readonly DisplayName = 'OpenTelemetry OTLP/HTTP Metrics Sink';
  public readonly RequiredConsentTier = 'HealthAndAggregatedUsage' as const;
  public readonly BatchCadenceMinutes = 5;

  private readonly _collectorUrl: string;
  private readonly _customHeaders: Record<string, string>;
  private readonly _transport: TelemetryHttpTransport;
  private readonly _timeoutMs: number;

  constructor(options?: OtlpHttpTelemetrySinkOptions) {
    super();
    this._collectorUrl = options?.CollectorUrl ?? 'http://localhost:4318/v1/metrics';
    this._customHeaders = options?.Headers ?? {};
    this._transport = options?.Transport ?? DefaultTelemetryHttpTransport;
    this._timeoutMs = options?.TimeoutMs ?? 30_000;
  }

  public async DeliverPackage(pkg: TelemetryPackage, context: SinkExecutionContext): Promise<SinkAckResult> {
    const otlpPayload = this.transformToOtlp(pkg, context);
    const bodyText = JSON.stringify(otlpPayload);
    let signatureHeader = context.SignatureHeader ?? '';
    if (context.SigningKeyHex && /^[0-9a-fA-F]+$/.test(context.SigningKeyHex) && context.SigningKeyHex.length % 2 === 0) {
      const sig = createHmac('sha256', Buffer.from(context.SigningKeyHex, 'hex')).update(bodyText).digest('hex');
      signatureHeader = `sha256=${sig}`;
    }
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-mj-install-id': context.InstallId,
      'x-mj-consent-tier': pkg.Payload.ConsentTier,
      'x-mj-payload-sha256': createHash('sha256').update(bodyText).digest('hex'),
      'x-mj-original-payload-sha256': pkg.PayloadHashHex,
      'x-mj-signature': signatureHeader,
      ...this._customHeaders,
    };
    return this.PostJson(this._transport, this._collectorUrl, headers, bodyText, this._timeoutMs);
  }

  private transformToOtlp(pkg: TelemetryPackage, context: SinkExecutionContext): object {
    const metrics: object[] = [];

    if (pkg.Payload.HealthSignals?.Buckets && pkg.Payload.HealthSignals.Buckets.length > 0) {
      const dataPoints: object[] = [];
      for (const bucket of pkg.Payload.HealthSignals.Buckets) {
        const startEpochMs = Date.parse(bucket.BucketStartIso);
        const startNano = String(BigInt(Number.isNaN(startEpochMs) ? Date.now() : startEpochMs) * 1_000_000n);
        const endEpochMs = Number.isNaN(startEpochMs) ? Date.now() : startEpochMs + 86_400_000;
        const endNano = String(BigInt(endEpochMs) * 1_000_000n);

        dataPoints.push(
          { asInt: bucket.Green, startTimeUnixNano: startNano, timeUnixNano: endNano, attributes: [{ key: 'status', value: { stringValue: 'GREEN' } }] },
          { asInt: bucket.Yellow, startTimeUnixNano: startNano, timeUnixNano: endNano, attributes: [{ key: 'status', value: { stringValue: 'YELLOW' } }] },
          { asInt: bucket.Red, startTimeUnixNano: startNano, timeUnixNano: endNano, attributes: [{ key: 'status', value: { stringValue: 'RED' } }] },
        );
      }
      metrics.push({
        name: 'mj.health.status_count',
        description: 'Counts of health check evaluations by status',
        unit: '1',
        sum: {
          dataPoints,
          aggregationTemporality: 2,
          isMonotonic: false,
        },
      });
    }

    if (pkg.Payload.AggregatedUsage?.DailyBuckets && pkg.Payload.AggregatedUsage.DailyBuckets.length > 0) {
      const opDataPoints: object[] = [];
      const tokenDataPoints: object[] = [];

      for (const bucket of pkg.Payload.AggregatedUsage.DailyBuckets) {
        const startEpochMs = Date.parse(bucket.DateBucket);
        const startNano = String(BigInt(Number.isNaN(startEpochMs) ? Date.now() : startEpochMs) * 1_000_000n);
        const endEpochMs = Number.isNaN(startEpochMs) ? Date.now() : startEpochMs + 86_400_000;
        const endNano = String(BigInt(endEpochMs) * 1_000_000n);

        opDataPoints.push({
          asInt: bucket.Count,
          startTimeUnixNano: startNano,
          timeUnixNano: endNano,
          attributes: [{ key: 'category', value: { stringValue: bucket.Category } }],
        });

        if (bucket.TotalInputTokens > 0 || bucket.TotalOutputTokens > 0) {
          tokenDataPoints.push(
            {
              asInt: bucket.TotalInputTokens,
              startTimeUnixNano: startNano,
              timeUnixNano: endNano,
              attributes: [
                { key: 'category', value: { stringValue: bucket.Category } },
                { key: 'token_type', value: { stringValue: 'input' } },
              ],
            },
            {
              asInt: bucket.TotalOutputTokens,
              startTimeUnixNano: startNano,
              timeUnixNano: endNano,
              attributes: [
                { key: 'category', value: { stringValue: bucket.Category } },
                { key: 'token_type', value: { stringValue: 'output' } },
              ],
            },
          );
        }
      }

      if (opDataPoints.length > 0) {
        metrics.push({
          name: 'mj.usage.operations',
          description: 'Aggregated operations by category',
          unit: '1',
          sum: {
            dataPoints: opDataPoints,
            aggregationTemporality: 2,
            isMonotonic: true,
          },
        });
      }

      if (tokenDataPoints.length > 0) {
        metrics.push({
          name: 'mj.usage.tokens',
          description: 'Aggregated AI token counts',
          unit: '1',
          sum: {
            dataPoints: tokenDataPoints,
            aggregationTemporality: 2,
            isMonotonic: true,
          },
        });
      }
    }

    return {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'memberjunction' } },
              { key: 'service.instance.id', value: { stringValue: context.InstallId } },
            ],
          },
          scopeMetrics: [
            {
              scope: { name: '@memberjunction/health' },
              metrics,
            },
          ],
        },
      ],
    };
  }
}
