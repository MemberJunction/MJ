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
}
