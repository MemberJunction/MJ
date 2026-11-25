import { createHash, createHmac } from 'node:crypto';
import { BaseSingleton } from '@memberjunction/global';
import { LocalTelemetrySignalBridge, type TelemetryCountBucket, type FeatureUsageBucket } from './LocalTelemetrySignalBridge';
import { BaseTelemetrySink, ConsentTierSatisfies, type ConsentTier, type SinkAckResult, type SinkExecutionContext } from './BaseTelemetrySink';
import {
  ValidateTelemetryRecord,
  HEALTH_REPORT_SHARE_SCHEMA,
  DAILY_USAGE_SHARE_SCHEMA,
  MINUTE_USAGE_SHARE_SCHEMA,
  FEATURE_USAGE_SHARE_SCHEMA,
  type HealthBucketShareRecord,
  type DailyUsageShareRecord,
  type MinuteUsageShareRecord,
  type FeatureUsageShareRecord,
} from './TelemetrySchemaDsl';

function toDayString(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso;
  }
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The exact shareable payload shape for one consent-tier package, before serialization. */
export interface TelemetryPackagePayload {
  ConsentTier: ConsentTier;
  GeneratedAtIso: string;
  /** Present at `HealthOnly` and above. */
  HealthSignals?: { Buckets: readonly HealthBucketShareRecord[] };
  /** Present at `HealthAndAggregatedUsage` and above. */
  AggregatedUsage?: {
    Buckets: readonly TelemetryCountBucket[];
    DailyBuckets?: readonly DailyUsageShareRecord[];
  };
  FeatureUsage?: {
    DailyBuckets: readonly FeatureUsageShareRecord[];
  };
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

/** The source of bucketed local data a package is built from. */
export type TelemetryBucketSource = Pick<LocalTelemetrySignalBridge, 'GetHealthBuckets' | 'GetCountBuckets'> & {
  GetFeatureUsageBuckets?(): readonly FeatureUsageBucket[];
};

/** Options controlling date boundary and watermark filtering for telemetry packages. */
export interface BuildPackageOptions {
  /**
   * When true, only packages records from completed calendar days strictly prior to the current
   * UTC calendar day. This prevents partial, in-progress days from being transmitted before they close.
   */
  CompletedDaysOnly?: boolean;

  /**
   * High-water mark date string (YYYY-MM-DD). If supplied, records with bucket dates less than or
   * equal to this watermark are excluded, preventing re-transmission of previously sent days.
   */
  WatermarkDate?: string;
}

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
  public BuildPackage(
    tier: ConsentTier,
    source: TelemetryBucketSource = LocalTelemetrySignalBridge.Instance,
    options?: BuildPackageOptions,
  ): TelemetryPackage {
    if (tier === 'Off') {
      throw new Error('ShareLayerPackager.BuildPackage: cannot build a package at ConsentTier \'Off\' — no data may ever be packaged at that tier.');
    }

    const currentUtcDay = toDayString(new Date().toISOString());
    const isDateEligible = (day: string): boolean => {
      if (options?.CompletedDaysOnly && day >= currentUtcDay) {
        return false;
      }
      if (options?.WatermarkDate && day <= options.WatermarkDate) {
        return false;
      }
      return true;
    };

    const payload: TelemetryPackagePayload = { ConsentTier: tier, GeneratedAtIso: new Date().toISOString() };
    if (ConsentTierSatisfies(tier, 'HealthOnly')) {
      const healthDailyMap = new Map<string, HealthBucketShareRecord>();
      for (const b of source.GetHealthBuckets()) {
        const day = toDayString(b.BucketStartIso);
        if (!isDateEligible(day)) {
          continue;
        }
        const existing = healthDailyMap.get(day) ?? {
          BucketStartIso: day,
          Green: 0,
          Yellow: 0,
          Red: 0,
        };
        existing.Green += b.Green;
        existing.Yellow += b.Yellow;
        existing.Red += b.Red;
        healthDailyMap.set(day, existing);
      }
      const sanitizedHealthBuckets = Array.from(healthDailyMap.values());
      for (const rec of sanitizedHealthBuckets) {
        const val = ValidateTelemetryRecord(HEALTH_REPORT_SHARE_SCHEMA, rec);
        if (!val.Valid) {
          throw new Error(`HealthSignals validation failed: ${val.Errors.map((e) => `${e.Field}: ${e.Reason}`).join(', ')}`);
        }
      }
      payload.HealthSignals = { Buckets: sanitizedHealthBuckets };
    }

    if (ConsentTierSatisfies(tier, 'HealthAndAggregatedUsage')) {
      const rawCountBuckets: TelemetryCountBucket[] = source.GetCountBuckets().map((b) => ({
        BucketStartIso: b.BucketStartIso,
        Category: b.Category,
        Count: b.Count,
        TotalElapsedMs: b.TotalElapsedMs,
        TotalInputTokens: b.TotalInputTokens ?? 0,
        TotalOutputTokens: b.TotalOutputTokens ?? 0,
      }));

      const dailyMap = new Map<string, DailyUsageShareRecord>();
      for (const b of rawCountBuckets) {
        const day = toDayString(b.BucketStartIso);
        if (!isDateEligible(day)) {
          continue;
        }
        const key = `${day}:${b.Category}`;
        const existing = dailyMap.get(key) ?? {
          DateBucket: day,
          Category: b.Category,
          Count: 0,
          TotalElapsedMs: 0,
          TotalInputTokens: 0,
          TotalOutputTokens: 0,
        };
        existing.Count += b.Count;
        existing.TotalElapsedMs += b.TotalElapsedMs;
        existing.TotalInputTokens += b.TotalInputTokens;
        existing.TotalOutputTokens += b.TotalOutputTokens;
        dailyMap.set(key, existing);
      }
      const dailyBuckets = Array.from(dailyMap.values());
      for (const rec of dailyBuckets) {
        const val = ValidateTelemetryRecord(DAILY_USAGE_SHARE_SCHEMA, rec);
        if (!val.Valid) {
          throw new Error(`DailyUsageBuckets validation failed: ${val.Errors.map((e) => `${e.Field}: ${e.Reason}`).join(', ')}`);
        }
      }
      // At Tier 2 (HealthAndAggregatedUsage), outbound usage buckets are floored to daily UTC
      // boundaries so minute-by-minute activity timing never leaves the deployment; sub-day
      // buckets are only retained when the admin explicitly grants Tier 3 (HealthAndMetadataEvents).
      const eligibleRawBuckets = rawCountBuckets.filter((b) => isDateEligible(toDayString(b.BucketStartIso)));
      const outboundBuckets: TelemetryCountBucket[] = ConsentTierSatisfies(tier, 'HealthAndMetadataEvents')
        ? eligibleRawBuckets
        : dailyBuckets.map((d) => ({
            BucketStartIso: d.DateBucket,
            Category: d.Category as TelemetryCountBucket['Category'],
            Count: d.Count,
            TotalElapsedMs: d.TotalElapsedMs,
            TotalInputTokens: d.TotalInputTokens,
            TotalOutputTokens: d.TotalOutputTokens,
          }));

      if (ConsentTierSatisfies(tier, 'HealthAndMetadataEvents')) {
        for (const rec of outboundBuckets) {
          const val = ValidateTelemetryRecord(MINUTE_USAGE_SHARE_SCHEMA, rec);
          if (!val.Valid) {
            throw new Error(`MinuteUsageBuckets validation failed: ${val.Errors.map((e) => `${e.Field}: ${e.Reason}`).join(', ')}`);
          }
        }
      }

      payload.AggregatedUsage = {
        Buckets: outboundBuckets,
        DailyBuckets: dailyBuckets,
      };

      if (typeof source.GetFeatureUsageBuckets === 'function') {
        const rawFeatures = source.GetFeatureUsageBuckets();
        if (rawFeatures && rawFeatures.length > 0) {
          const featureDailyMap = new Map<string, FeatureUsageShareRecord>();
          for (const fb of rawFeatures) {
            const day = toDayString(fb.BucketStartIso);
            if (!isDateEligible(day)) {
              continue;
            }
            const key = `${day}:${fb.RouteTemplate}`;
            const existing = featureDailyMap.get(key) ?? {
              DateBucket: day,
              RouteTemplate: fb.RouteTemplate,
              NavigationCount: 0,
            };
            existing.NavigationCount += fb.Count;
            featureDailyMap.set(key, existing);
          }
          const featureDailyBuckets = Array.from(featureDailyMap.values());
          for (const rec of featureDailyBuckets) {
            const val = ValidateTelemetryRecord(FEATURE_USAGE_SHARE_SCHEMA, rec);
            if (!val.Valid) {
              throw new Error(`FeatureUsage validation failed: ${val.Errors.map((e) => `${e.Field}: ${e.Reason}`).join(', ')}`);
            }
          }
          payload.FeatureUsage = {
            DailyBuckets: featureDailyBuckets,
          };
        }
      }
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
  public PreviewNextPackage(
    tier: ConsentTier,
    source?: TelemetryBucketSource,
    options?: BuildPackageOptions,
  ): TelemetryPackage {
    return this.BuildPackage(tier, source, options);
  }

  /** Computes the `x-mj-signature: sha256=...` header value for `pkg`, keyed on the installation's private signing key. */
  public SignPackage(pkg: TelemetryPackage, signingKeyHex: string): string {
    if (
      typeof signingKeyHex !== 'string' ||
      signingKeyHex.length === 0 ||
      signingKeyHex.length % 2 !== 0 ||
      !/^[0-9a-fA-F]+$/.test(signingKeyHex)
    ) {
      throw new Error('ShareLayerPackager.SignPackage: signingKeyHex must be a non-empty, even-length hexadecimal string.');
    }
    const signature = createHmac('sha256', Buffer.from(signingKeyHex, 'hex')).update(pkg.PayloadJson).digest('hex');
    return `sha256=${signature}`;
  }

  /**
   * Builds, signs, and delivers a package at `tier` to `sink`. Refuses to call the sink at all
   * when `tier` does not satisfy `sink.RequiredConsentTier` — the gate every sink would otherwise
   * have to re-implement for itself.
   */
  public async DispatchToSink(
    sink: BaseTelemetrySink,
    tier: ConsentTier,
    context: SinkExecutionContext,
    source?: TelemetryBucketSource,
    options?: BuildPackageOptions,
  ): Promise<TelemetryPackageAudit & { Package: TelemetryPackage }> {
    if (!ConsentTierSatisfies(tier, sink.RequiredConsentTier)) {
      throw new Error(`ShareLayerPackager.DispatchToSink: sink '${sink.SinkKey}' requires consent tier '${sink.RequiredConsentTier}', but the granted tier is '${tier}'.`);
    }

    const pkg = this.BuildPackage(tier, source, options);
    const signatureHeader = this.SignPackage(pkg, context.SigningKeyHex);
    const signedContext: SinkExecutionContext = {
      ...context,
      SignatureHeader: signatureHeader,
    };
    const ack = await sink.DeliverPackage(pkg, signedContext);

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
