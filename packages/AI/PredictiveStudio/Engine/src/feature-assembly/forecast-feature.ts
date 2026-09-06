/**
 * @module feature-assembly/forecast-feature
 *
 * The `forecast` FeatureStep: a time-series foundation model (TimesFM) used as a FEATURE
 * EXTRACTOR for the tabular models, the way `embedding` and `vision-llm` already are.
 *
 * The idea is the one Sonar's `TrendSlope` reaches for — "where is this member heading?" — but
 * learned and probabilistic: a band instead of a regression line. Each record's dated history is
 * bucketed, cut at the as-of date, and handed to the model; the returned band becomes four plain
 * numeric columns, which is what lets the ordinary holdout comparison decide whether it was worth
 * anything.
 *
 * Two things this module refuses to do, both deliberate:
 *
 * * **Forecast a series that is too short.** Below the model's 32-step input patch it will still
 *   return a tight, confident band, and that band is noise wearing a number's clothes. Those rows
 *   get nulls, which the sidecar's imputation already handles honestly.
 * * **Invent history.** Buckets with no rows are zero for a COUNT series (nothing happened is a
 *   real zero) but null-and-then-dropped for a VALUE series (no observation is not a value of 0).
 */
import { LogError, type UserInfo } from '@memberjunction/core';
import type { ForecastRequest, ForecastResponse } from '@memberjunction/predictive-studio-core';
import { FORECAST_MIN_CONTEXT } from '@memberjunction/predictive-studio-core';
import type { FeatureStep } from '@memberjunction/predictive-studio-core';
import type { SourceRow } from './data-access';
import type { DatedRow } from './as-of';
import { filterAsOf } from './as-of';

/** The `forecast` step, narrowed. */
export type ForecastStep = Extract<FeatureStep, { Kind: 'forecast' }>;

/**
 * The seam the extractor calls to reach the forecast sidecar.
 *
 * Injectable so the executor's tests never spawn a Python process — but the executor supplies a
 * REAL default, because an optional seam with no production implementation is a feature that
 * ships inert.
 */
export interface IForecastRunner {
  forecast(request: ForecastRequest): Promise<ForecastResponse>;
}

/** One record's forecast columns. `null` throughout when the series could not be forecast. */
export interface ForecastFeatureValues {
  P50: number | null;
  P10: number | null;
  P90: number | null;
  /** Change from the last OBSERVED value to the forecast median — the "heading" number. */
  Slope: number | null;
}

const EMPTY: ForecastFeatureValues = { P50: null, P10: null, P90: null, Slope: null };

/**
 * Series per sidecar request.
 *
 * The model costs ~140ms per series on CPU and does not speed up with batch size, so a request's
 * duration is simply linear in how many series it carries: a 5,000-record population in ONE request
 * is ~12 minutes and blows any sane HTTP timeout. When that happened the extractor degraded to
 * nulls exactly as designed — and the feature then silently contributed nothing, which is a worse
 * outcome than being slow. Chunking keeps each request bounded (~70s here) so the work completes
 * instead of being thrown away at the end.
 */
const FORECAST_BATCH_SIZE = 500;

/** The four columns a forecast step emits, in order. */
export function forecastColumnNames(step: ForecastStep): string[] {
  return [`${step.OutputPrefix}_p50`, `${step.OutputPrefix}_p10`, `${step.OutputPrefix}_p90`, `${step.OutputPrefix}_slope`];
}

/** Read a column's numeric value, or null when absent/non-numeric. */
function numeric(row: SourceRow, field: string): number | null {
  const raw = row[field];
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Aggregate a record's dated rows into an evenly-spaced series ending at the as-of date.
 *
 * Even spacing matters: the model reads a sequence of points as equally spaced in time, so handing
 * it raw irregular events would silently distort every interval it reasons about.
 *
 * @returns the bucketed series oldest-first, or null when there is nothing to build one from
 */
export function bucketSeries(
  rows: DatedRow[],
  asOf: Date | null,
  bucketDays: number,
  valueField: string | undefined,
): number[] | null {
  const surviving = filterAsOf(rows, asOf);
  if (surviving.length === 0 || bucketDays <= 0) return null;

  const end = (asOf ?? new Date()).getTime();
  const bucketMs = bucketDays * 24 * 60 * 60 * 1000;
  let earliest = end;
  for (const r of surviving) earliest = Math.min(earliest, r.Date.getTime());
  const bucketCount = Math.max(1, Math.ceil((end - earliest) / bucketMs));
  if (!Number.isFinite(bucketCount) || bucketCount > 4096) return null;

  const sums = new Array<number>(bucketCount).fill(0);
  const counts = new Array<number>(bucketCount).fill(0);
  for (const r of surviving) {
    // Index from the END so the final bucket always closes exactly at the as-of date; indexing
    // from the start would let the last bucket be a partial one of arbitrary width.
    const age = end - r.Date.getTime();
    const index = bucketCount - 1 - Math.floor(age / bucketMs);
    if (index < 0 || index >= bucketCount) continue;
    counts[index] += 1;
    if (valueField) {
      const v = numeric(r.Row, valueField);
      if (v !== null) sums[index] += v;
    }
  }
  // A COUNT series: an empty bucket genuinely means "nothing happened", so zero is the truth.
  // A VALUE series: an empty bucket means "no observation", and summing that to 0 would assert a
  // measurement nobody took — but the model needs even spacing, so carry the last known value
  // forward instead, which is the standard and honest choice for irregular observations.
  if (!valueField) return counts;
  const out: number[] = [];
  let last: number | null = null;
  for (let i = 0; i < bucketCount; i++) {
    if (counts[i] > 0) last = sums[i];
    if (last !== null) out.push(last);
  }
  return out.length > 0 ? out : null;
}

/** One record to forecast for. */
export interface ForecastTarget {
  recordId: string;
  asOf: Date | null;
  rows: DatedRow[];
}

/**
 * Runs one `forecast` step over every record in ONE batched sidecar call.
 *
 * Batching is not an optimization here, it is the difference between usable and not: the model
 * runs seconds per series on CPU, so a per-row call over a 2,000-record population would be hours.
 */
export class ForecastFeatureExtractor {
  constructor(
    private readonly runner: IForecastRunner,
    private readonly contextUser?: UserInfo,
  ) {
    void this.contextUser;
  }

  public async extract(step: ForecastStep, targets: ForecastTarget[]): Promise<Map<string, ForecastFeatureValues>> {
    const out = new Map<string, ForecastFeatureValues>();
    const minContext = step.MinContext ?? FORECAST_MIN_CONTEXT;
    const series: { Key: string; Context: number[] }[] = [];
    const lastObserved = new Map<string, number>();

    for (const target of targets) {
      out.set(target.recordId, EMPTY);
      const built = bucketSeries(target.rows, target.asOf, step.BucketDays, step.ValueField);
      // Screen here as well as in the sidecar: a short series should not cost a network round trip,
      // and the sidecar's refusal and this one must agree on the same threshold.
      if (!built || built.length < minContext) continue;
      lastObserved.set(target.recordId, built[built.length - 1]);
      series.push({ Key: target.recordId, Context: built });
    }
    if (series.length === 0) return out;

    // Chunked: one unbounded request over the whole population reliably exceeds the request
    // timeout at population scale, and a timeout throws away every series in it.
    const results: ForecastResponse['Results'] = [];
    let failedChunks = 0;
    for (let i = 0; i < series.length; i += FORECAST_BATCH_SIZE) {
      const chunk = series.slice(i, i + FORECAST_BATCH_SIZE);
      try {
        const response = await this.runner.forecast({
          Series: chunk,
          Horizon: step.Horizon,
          Checkpoint: step.Checkpoint as ForecastRequest['Checkpoint'],
          MinContext: minContext,
        });
        results.push(...response.Results);
      } catch (err) {
        // A forecast is one feature among many, and one bad chunk should not discard the others.
        // Failing the whole assembly would take out models that do not use this feature at all.
        failedChunks++;
        LogError(
          `ForecastFeatureExtractor: step '${step.Id}' chunk ${i / FORECAST_BATCH_SIZE + 1} failed, ` +
            `its ${chunk.length} series will be null: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (failedChunks > 0) {
      // Said once, loudly, with the blast radius — a feature that is null for part of the
      // population trains a model on a column that means different things for different rows.
      LogError(
        `ForecastFeatureExtractor: step '${step.Id}' completed with ${failedChunks} failed chunk(s) of ` +
          `${Math.ceil(series.length / FORECAST_BATCH_SIZE)}; affected rows carry null forecast columns.`,
      );
    }

    for (const result of results) {
      if (result.Refused || !result.Median || !result.Quantiles) continue;
      const step0 = Math.min(step.Horizon, result.Median.length) - 1;
      if (step0 < 0) continue;
      const quantiles = result.Quantiles[step0] ?? [];
      const p50 = result.Median[step0] ?? null;
      const previous = lastObserved.get(result.Key);
      out.set(result.Key, {
        P50: p50,
        // p10 and p90 are the first and last of the nine levels.
        P10: quantiles.length > 0 ? quantiles[0] : null,
        P90: quantiles.length > 0 ? quantiles[quantiles.length - 1] : null,
        Slope: p50 !== null && previous !== undefined ? p50 - previous : null,
      });
    }
    return out;
  }
}
