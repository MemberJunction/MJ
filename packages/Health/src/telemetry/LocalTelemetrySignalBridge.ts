import { BaseSingleton } from '@memberjunction/global';
import type { TelemetryCategory, TelemetryEvent, TelemetryEventCallback, TelemetryManager } from '@memberjunction/core';
import type { InstanceHealthReport } from '../types';
import { ScrubMjRoute, type ScrubbedRouteResult } from './RouteScrubber';

/** Bucket granularity for {@link LocalTelemetrySignalBridge} rollups — matches `{ kind: 'date_bucket' }`. */
export type SignalBucketGranularity = 'minute' | 'hour' | 'day';

/** One time-bucketed rollup of `TelemetryManager` events for a single category. */
export interface TelemetryCountBucket {
  BucketStartIso: string;
  Category: TelemetryCategory;
  Count: number;
  TotalElapsedMs: number;
  TotalInputTokens: number;
  TotalOutputTokens: number;
}

/** One time-bucketed rollup of `MJHealthEngine` evaluation outcomes. */
export interface HealthStatusBucket {
  BucketStartIso: string;
  Green: number;
  Yellow: number;
  Red: number;
}

/** One time-bucketed rollup of per-probe signal evaluation outcomes. */
export interface ProbeSignalBucket {
  BucketStartIso: string;
  SignalCode: string;
  OwnerApp: string;
  Green: number;
  Yellow: number;
  Red: number;
  TotalDurationMs: number;
  SampleCount: number;
}

/** One time-bucketed rollup of feature route navigation counts. */
export interface FeatureUsageBucket {
  BucketStartIso: string;
  ApplicationName: string;
  RouteTemplate: string;
  Count: number;
}

export interface LocalTelemetrySignalBridgeOptions {
  /** Time-bucket granularity for rollup series. Defaults to `'minute'`. */
  Granularity?: SignalBucketGranularity;
  /** Maximum buckets retained per series before the oldest are pruned. Defaults to 1440 (24h of minute buckets). */
  MaxBucketsPerSeries?: number;
  /** Maximum age, in milliseconds, a bucket is retained regardless of count. Defaults to 24 hours. */
  MaxAgeMs?: number;
}

const DEFAULT_GRANULARITY: SignalBucketGranularity = 'minute';
const DEFAULT_MAX_BUCKETS_PER_SERIES = 1440;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Bridges the two local-layer event sources — `TelemetryManager.Instance.OnEvent` (operation
 * timing/counts) and `MJHealthEngine` evaluation reports (health status) — into bounded,
 * time-bucketed local rollups. This is the in-process "CoreBus" piece of the local-first
 * observability architecture: it has no network egress and no consent gating of its own (that is
 * `ShareLayerPackager`'s job, several steps downstream) — it exists purely so a local admin
 * console, CLI, or the share-layer packager has bucketed data to read instead of re-deriving
 * rollups from `TelemetryManager.GetEvents()` on every query.
 *
 * A singleton, matching `TelemetryManager`/`MJHealthEngine` — see `BaseSingleton`.
 */
export class LocalTelemetrySignalBridge extends BaseSingleton<LocalTelemetrySignalBridge> {
  private _granularity: SignalBucketGranularity = DEFAULT_GRANULARITY;
  private _maxBucketsPerSeries: number = DEFAULT_MAX_BUCKETS_PER_SERIES;
  private _maxAgeMs: number = DEFAULT_MAX_AGE_MS;

  private _countBuckets: Map<string, TelemetryCountBucket> = new Map();
  private _healthBuckets: Map<string, HealthStatusBucket> = new Map();
  private _probeSignalBuckets: Map<string, ProbeSignalBucket> = new Map();
  private _featureUsageBuckets: Map<string, FeatureUsageBucket> = new Map();
  private _unsubscribeTelemetry?: () => void;

  protected constructor() {
    super();
  }

  public static get Instance(): LocalTelemetrySignalBridge {
    return super.getInstance<LocalTelemetrySignalBridge>();
  }

  /** Updates bucketing configuration. Does not retroactively re-bucket already-recorded data. */
  public Configure(options: LocalTelemetrySignalBridgeOptions): void {
    if (options.Granularity) this._granularity = options.Granularity;
    if (options.MaxBucketsPerSeries != null) this._maxBucketsPerSeries = options.MaxBucketsPerSeries;
    if (options.MaxAgeMs != null) this._maxAgeMs = options.MaxAgeMs;
  }

  /**
   * Subscribes to `manager.OnEvent` and rolls every completed (`'end'`) event into the count
   * bucket series. Only one subscription is active at a time — calling this again replaces the
   * prior subscription rather than stacking a second one.
   * @returns A detach function equivalent to calling {@link Detach}.
   */
  public AttachToTelemetryManager(manager: Pick<TelemetryManager, 'OnEvent'>): () => void {
    this.Detach();
    const callback: TelemetryEventCallback = (event, type) => {
      if (type !== 'end') return; // only completed events carry a final elapsedMs
      this.recordTelemetryEvent(event);
    };
    this._unsubscribeTelemetry = manager.OnEvent(callback);
    return () => this.Detach();
  }

  /** Stops listening to whatever `TelemetryManager` instance {@link AttachToTelemetryManager} was given, if any. */
  public Detach(): void {
    this._unsubscribeTelemetry?.();
    this._unsubscribeTelemetry = undefined;
  }

  /** Rolls one `MJHealthEngine.Evaluate()` report's summary counts and probe signals into the health bucket series. */
  public RecordHealthReport(report: InstanceHealthReport, atEpochMs: number = Date.now()): void {
    const bucketKey = this.bucketStartIso(atEpochMs);
    const bucket = this._healthBuckets.get(bucketKey) ?? { BucketStartIso: bucketKey, Green: 0, Yellow: 0, Red: 0 };
    bucket.Green += report.SummaryCounts.Green;
    bucket.Yellow += report.SummaryCounts.Yellow;
    bucket.Red += report.SummaryCounts.Red;
    this._healthBuckets.set(bucketKey, bucket);
    this.pruneMap(this._healthBuckets, (b) => b.BucketStartIso);

    for (const signal of report.Signals) {
      const signalKey = `${signal.Code}:${bucketKey}`;
      const probeBucket = this._probeSignalBuckets.get(signalKey) ?? {
        BucketStartIso: bucketKey,
        SignalCode: signal.Code,
        OwnerApp: signal.OwnerApp,
        Green: 0,
        Yellow: 0,
        Red: 0,
        TotalDurationMs: 0,
        SampleCount: 0,
      };
      if (signal.Status === 'GREEN') probeBucket.Green++;
      else if (signal.Status === 'YELLOW') probeBucket.Yellow++;
      else if (signal.Status === 'RED') probeBucket.Red++;
      probeBucket.TotalDurationMs += signal.DurationMs;
      probeBucket.SampleCount++;
      this._probeSignalBuckets.set(signalKey, probeBucket);
    }
    this.pruneMap(this._probeSignalBuckets, (b) => b.BucketStartIso, (b) => b.SignalCode);
  }

  /**
   * Scrubs `featurePathOrUrl` using {@link ScrubMjRoute} and, if recognized, rolls the navigation into
   * a bounded `FeatureUsageBucket`.
   */
  public RecordFeatureUsage(appName: string, featurePathOrUrl: string, atEpochMs: number = Date.now()): ScrubbedRouteResult {
    const scrubbed = ScrubMjRoute(featurePathOrUrl);
    if (scrubbed.RouteTemplate !== 'unknown') {
      const bucketStart = this.bucketStartIso(atEpochMs);
      const app = scrubbed.ApplicationName ?? appName;
      const key = `${app}:${scrubbed.RouteTemplate}:${bucketStart}`;
      const bucket = this._featureUsageBuckets.get(key) ?? {
        BucketStartIso: bucketStart,
        ApplicationName: app,
        RouteTemplate: scrubbed.RouteTemplate,
        Count: 0,
      };
      bucket.Count += 1;
      this._featureUsageBuckets.set(key, bucket);
      this.pruneMap(this._featureUsageBuckets, (b) => b.BucketStartIso, (b) => `${b.ApplicationName}:${b.RouteTemplate}`);
    }
    return scrubbed;
  }

  private recordTelemetryEvent(event: TelemetryEvent, atEpochMs: number = Date.now()): void {
    const bucketStart = this.bucketStartIso(atEpochMs);
    const key = `${event.category}:${bucketStart}`;
    const bucket = this._countBuckets.get(key) ?? {
      BucketStartIso: bucketStart,
      Category: event.category,
      Count: 0,
      TotalElapsedMs: 0,
      TotalInputTokens: 0,
      TotalOutputTokens: 0,
    };
    bucket.Count += 1;
    bucket.TotalElapsedMs += event.elapsedMs ?? 0;
    if (event.category === 'AI' && event.params && typeof event.params === 'object') {
      const aiParams = event.params as { inputTokens?: number; outputTokens?: number };
      if (typeof aiParams.inputTokens === 'number' && Number.isFinite(aiParams.inputTokens) && aiParams.inputTokens >= 0) {
        bucket.TotalInputTokens += aiParams.inputTokens;
      }
      if (typeof aiParams.outputTokens === 'number' && Number.isFinite(aiParams.outputTokens) && aiParams.outputTokens >= 0) {
        bucket.TotalOutputTokens += aiParams.outputTokens;
      }
    }
    this._countBuckets.set(key, bucket);
    this.pruneMap(this._countBuckets, (b) => b.BucketStartIso, (b) => b.Category);
  }

  /** Every count bucket currently retained, optionally filtered to one category. */
  public GetCountBuckets(category?: TelemetryCategory): readonly TelemetryCountBucket[] {
    const all = [...this._countBuckets.values()];
    return category ? all.filter((b) => b.Category === category) : all;
  }

  /** Every health status bucket currently retained. */
  public GetHealthBuckets(): readonly HealthStatusBucket[] {
    return [...this._healthBuckets.values()];
  }

  /** Every probe signal bucket currently retained. */
  public GetProbeSignalBuckets(): readonly ProbeSignalBucket[] {
    return [...this._probeSignalBuckets.values()];
  }

  /** Every feature usage bucket currently retained. */
  public GetFeatureUsageBuckets(): readonly FeatureUsageBucket[] {
    return [...this._featureUsageBuckets.values()];
  }

  /** Clears all recorded buckets (not the telemetry subscription). */
  public Reset(): void {
    this._countBuckets.clear();
    this._healthBuckets.clear();
    this._probeSignalBuckets.clear();
    this._featureUsageBuckets.clear();
  }

  /** Floors `epochMs` to this bridge's configured bucket granularity and returns it as an ISO-8601 string. */
  private bucketStartIso(epochMs: number): string {
    const d = new Date(epochMs);
    d.setUTCMilliseconds(0);
    d.setUTCSeconds(0);
    if (this._granularity === 'hour' || this._granularity === 'day') {
      d.setUTCMinutes(0);
    }
    if (this._granularity === 'day') {
      d.setUTCHours(0);
    }
    return d.toISOString();
  }

  /**
   * Prunes a bucket map in place: first by age (any bucket older than `_maxAgeMs`), then by count
   * per series down to `_maxBucketsPerSeries` (oldest-first, by `BucketStartIso`). Scoped per series
   * so one high-volume series cannot starve or evict buckets belonging to other series.
   */
  private pruneMap<V>(
    map: Map<string, V>,
    bucketStartOf: (value: V) => string,
    seriesOf?: (value: V) => string,
  ): void {
    const now = Date.now();
    for (const [key, value] of map) {
      if (now - new Date(bucketStartOf(value)).getTime() > this._maxAgeMs) {
        map.delete(key);
      }
    }

    if (!seriesOf) {
      if (map.size <= this._maxBucketsPerSeries) return;
      const sortedKeys = [...map.entries()]
        .sort((a, b) => new Date(bucketStartOf(a[1])).getTime() - new Date(bucketStartOf(b[1])).getTime())
        .map(([k]) => k);
      const overflow = sortedKeys.length - this._maxBucketsPerSeries;
      for (let i = 0; i < overflow; i++) {
        map.delete(sortedKeys[i]);
      }
      return;
    }

    // Partition keys by series
    const seriesBuckets = new Map<string, Array<{ key: string; time: number }>>();
    for (const [key, value] of map) {
      const s = seriesOf(value);
      let list = seriesBuckets.get(s);
      if (!list) {
        list = [];
        seriesBuckets.set(s, list);
      }
      list.push({ key, time: new Date(bucketStartOf(value)).getTime() });
    }

    for (const [, list] of seriesBuckets) {
      if (list.length > this._maxBucketsPerSeries) {
        list.sort((a, b) => a.time - b.time);
        const overflow = list.length - this._maxBucketsPerSeries;
        for (let i = 0; i < overflow; i++) {
          map.delete(list[i].key);
        }
      }
    }
  }
}
