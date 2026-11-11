import { createHash, createHmac } from 'node:crypto';
import { BaseSingleton } from '@memberjunction/global';
import { LocalTelemetrySignalBridge, type HealthStatusBucket, type TelemetryCountBucket } from './LocalTelemetrySignalBridge';
import { BaseTelemetrySink, ConsentTierSatisfies, type ConsentTier, type SinkAckResult, type SinkExecutionContext } from './BaseTelemetrySink';

/** The exact shareable payload shape for one consent-tier package, before serialization. */
export interface TelemetryPackagePayload {
  ConsentTier: ConsentTier;
  GeneratedAtIso: string;
  /** Present at `HealthOnly` and above. */
  HealthSignals?: { Buckets: readonly HealthStatusBucket[] };
  /** Present at `HealthAndAggregatedUsage` and above. */
  AggregatedUsage?: { Buckets: readonly TelemetryCountBucket[] };
}

/** A fully-built, hashed (but not yet signed) telemetry package, ready to preview or dispatch. */
export interface TelemetryPackage {
  Payload: TelemetryPackagePayload;
  /** The exact serialized JSON — what `PreviewNextPackage` shows an administrator before any bytes leave the machine. */
  PayloadJson: string;
  /** SHA-256 of {@link PayloadJson}, hex-encoded. */
  PayloadHashHex: string;
}

/** The append-only audit record a successful (or attempted) dispatch produces. */
export interface TelemetryPackageAudit {
  SinkKey: string;
  ConsentTier: ConsentTier;
  PayloadHashHex: string;
  /** `sha256=<hex>` — the `x-mj-signature` header value a receiver would verify. */
  SignatureHeader: string;
  DispatchedAtIso: string;
  Ack: SinkAckResult;
}

/** The source of bucketed local data a package is built from. Narrowed to the two read methods {@link ShareLayerPackager} actually needs. */
export type TelemetryBucketSource = Pick<LocalTelemetrySignalBridge, 'GetHealthBuckets' | 'GetCountBuckets'>;

/**
 * Builds consent-gated `TelemetryPackage`s from `LocalTelemetrySignalBridge`'s local rollups,
 * signs them with the installation's private HMAC key, and dispatches them to a `BaseTelemetrySink`
 * — the Tier 2 "Share Layer" of the unified telemetry architecture
 * (`plans/mj-health-signals-and-openapp-live-probes.md` §6-7).
 *
 * At `ConsentTier.Off`, {@link BuildPackage} throws rather than returning an empty package — "no
 * data is collected, packaged, or transmitted" is an architectural invariant, not a payload that
 * happens to be empty, so attempting to build one at all is treated as a caller bug.
 *
 * Deliberately **not** persisted here: `__mj.TelemetryOutboundQueue` / `__mj.TelemetryAuditLog`
 * are database tables that ship with their own migration in a later phase (see the plan's §9.1
 * roadmap). {@link TelemetryPackageAudit} is the in-memory shape a caller with DB access persists;
 * this package only computes it.
 */
export class ShareLayerPackager extends BaseSingleton<ShareLayerPackager> {
  protected constructor() {
    super();
  }

  public static get Instance(): ShareLayerPackager {
    return super.getInstance<ShareLayerPackager>();
  }

  /**
   * Builds (but does not sign or dispatch) a package at `tier`, reading from `source` (defaults to
   * `LocalTelemetrySignalBridge.Instance`). Each tier's data is additive over the one below it —
   * `HealthAndAggregatedUsage` includes `HealthOnly`'s signals plus usage rollups.
   *
   * `HealthAndMetadataEvents` (Tier 3) is accepted but currently produces identical content to
   * `HealthAndAggregatedUsage`: un-rolled per-event records require retaining raw events
   * specifically for sharing, which `LocalTelemetrySignalBridge` deliberately does not do (it only
   * ever retains bucketed rollups) — that capability is deferred to a later phase, consistent with
   * Tier 3 being gated behind its own separate, advanced opt-in.
   */
  public BuildPackage(tier: ConsentTier, source: TelemetryBucketSource = LocalTelemetrySignalBridge.Instance): TelemetryPackage {
    if (tier === 'Off') {
      throw new Error('ShareLayerPackager.BuildPackage: cannot build a package at ConsentTier \'Off\' — no data may ever be packaged at that tier.');
    }

    const payload: TelemetryPackagePayload = { ConsentTier: tier, GeneratedAtIso: new Date().toISOString() };
    if (ConsentTierSatisfies(tier, 'HealthOnly')) {
      payload.HealthSignals = { Buckets: source.GetHealthBuckets() };
    }
    if (ConsentTierSatisfies(tier, 'HealthAndAggregatedUsage')) {
      payload.AggregatedUsage = { Buckets: source.GetCountBuckets() };
    }

    const payloadJson = JSON.stringify(payload);
    const payloadHashHex = createHash('sha256').update(payloadJson).digest('hex');
    return { Payload: payload, PayloadJson: payloadJson, PayloadHashHex: payloadHashHex };
  }

  /**
   * Administrator-facing inspection: builds the exact package that would be sent at `tier`,
   * without signing or dispatching it. This is `mj telemetry preview`'s underlying call —
   * identical to {@link BuildPackage}, named separately so call sites read as "I am only looking,
   * not sending" (see `docs/telemetry-shareable-schema.md` §6.2).
   */
  public PreviewNextPackage(tier: ConsentTier, source?: TelemetryBucketSource): TelemetryPackage {
    return this.BuildPackage(tier, source);
  }

  /** Computes the `x-mj-signature: sha256=...` header value for `pkg`, keyed on the installation's private signing key. */
  public SignPackage(pkg: TelemetryPackage, signingKeyHex: string): string {
    const signature = createHmac('sha256', Buffer.from(signingKeyHex, 'hex')).update(pkg.PayloadJson).digest('hex');
    return `sha256=${signature}`;
  }

  /**
   * Builds, signs, and delivers a package at `tier` to `sink`. Refuses to call the sink at all
   * when `tier` does not satisfy `sink.RequiredConsentTier` — the gate every sink would otherwise
   * have to re-implement for itself.
   */
  public async DispatchToSink(sink: BaseTelemetrySink, tier: ConsentTier, context: SinkExecutionContext, source?: TelemetryBucketSource): Promise<TelemetryPackageAudit & { Package: TelemetryPackage }> {
    if (!ConsentTierSatisfies(tier, sink.RequiredConsentTier)) {
      throw new Error(`ShareLayerPackager.DispatchToSink: sink '${sink.SinkKey}' requires consent tier '${sink.RequiredConsentTier}', but the granted tier is '${tier}'.`);
    }

    const pkg = this.BuildPackage(tier, source);
    const signatureHeader = this.SignPackage(pkg, context.SigningKeyHex);
    const ack = await sink.DeliverPackage(pkg, context);

    return {
      Package: pkg,
      SinkKey: sink.SinkKey,
      ConsentTier: tier,
      PayloadHashHex: pkg.PayloadHashHex,
      SignatureHeader: signatureHeader,
      DispatchedAtIso: new Date().toISOString(),
      Ack: ack,
    };
  }
}
