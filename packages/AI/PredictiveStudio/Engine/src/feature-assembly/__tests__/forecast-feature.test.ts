import { describe, it, expect } from 'vitest';
import type { ForecastRequest, ForecastResponse } from '@memberjunction/predictive-studio-core';
import {
  ForecastFeatureExtractor,
  bucketSeries,
  forecastColumnNames,
  type ForecastStep,
  type ForecastTarget,
  type IForecastRunner,
} from '../forecast-feature';
import type { DatedRow } from '../as-of';

const DAY = 24 * 60 * 60 * 1000;
const ASOF = new Date('2026-06-01T00:00:00Z');

/** A dated row `daysAgo` before the as-of date, carrying `amount`. */
function row(daysAgo: number, amount = 1): DatedRow {
  return { Date: new Date(ASOF.getTime() - daysAgo * DAY), Row: { Amount: amount } };
}

const STEP: ForecastStep = {
  Id: 'fc',
  Kind: 'forecast',
  SourceEntity: 'Activities',
  ForeignKeyField: 'MemberID',
  DateField: 'ActivityDate',
  BucketDays: 7,
  Horizon: 4,
  OutputPrefix: 'engagement',
};

describe('forecastColumnNames', () => {
  it('names four columns off the prefix so two forecasts cannot collide', () => {
    expect(forecastColumnNames(STEP)).toEqual([
      'engagement_p50',
      'engagement_p10',
      'engagement_p90',
      'engagement_slope',
    ]);
  });
});

describe('bucketSeries', () => {
  it('counts rows per bucket when no value field is given', () => {
    // Two rows in the most recent week, one the week before.
    const series = bucketSeries([row(1), row(2), row(9)], ASOF, 7, undefined);
    expect(series?.[series.length - 1]).toBe(2);
    expect(series?.[series.length - 2]).toBe(1);
  });

  it('treats an empty bucket as a real zero for a COUNT series', () => {
    // Nothing happened in the intervening weeks — for a count, that IS the measurement.
    const series = bucketSeries([row(1), row(30)], ASOF, 7, undefined);
    expect(series).toContain(0);
  });

  it('carries the last value forward for a VALUE series instead of asserting a zero', () => {
    // A bucket with no observation is not a measurement of 0; summing it to 0 would invent a
    // reading nobody took, and the model needs evenly-spaced points.
    const series = bucketSeries([row(30, 100), row(1, 250)], ASOF, 7, 'Amount');
    expect(series).not.toContain(0);
    expect(series?.[series!.length - 1]).toBe(250);
  });

  it('ends the final bucket exactly at the as-of date', () => {
    // Indexed from the END, so the newest row always lands in the last bucket regardless of how
    // far back the history reaches; indexing from the start would leave a partial final bucket.
    const series = bucketSeries([row(0), row(100)], ASOF, 7, undefined);
    expect(series?.[series.length - 1]).toBe(1);
  });

  it('returns null when there are no rows at all', () => {
    expect(bucketSeries([], ASOF, 7, undefined)).toBeNull();
  });

  it('excludes rows after the as-of date — the leakage boundary', () => {
    const future: DatedRow = { Date: new Date(ASOF.getTime() + 30 * DAY), Row: { Amount: 999 } };
    const series = bucketSeries([row(1), future], ASOF, 7, undefined);
    // The future row must not appear anywhere: total observed count is 1, not 2.
    expect(series!.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('refuses an absurd bucket count rather than allocating unboundedly', () => {
    expect(bucketSeries([row(100000)], ASOF, 1, undefined)).toBeNull();
  });
});

/** Records every request so the batching contract can be asserted. */
class RecordingRunner implements IForecastRunner {
  public readonly Requests: ForecastRequest[] = [];
  constructor(private readonly reply: (r: ForecastRequest) => ForecastResponse) {}
  async forecast(request: ForecastRequest): Promise<ForecastResponse> {
    this.Requests.push(request);
    return this.reply(request);
  }
}

function band(key: string, median: number): ForecastResponse['Results'][number] {
  return {
    Key: key,
    Median: [median, median, median, median],
    Quantiles: Array.from({ length: 4 }, () => [1, 2, 3, 4, median, 6, 7, 8, 9]),
    Refused: null,
  };
}

function targets(count: number, rowsEach: number): ForecastTarget[] {
  return Array.from({ length: count }, (_, i) => ({
    recordId: `r${i}`,
    asOf: ASOF,
    rows: Array.from({ length: rowsEach }, (_, j) => row(j * 7 + 1)),
  }));
}

describe('ForecastFeatureExtractor', () => {
  it('chunks large populations so no single request is unbounded', async () => {
    // One request per 500 series. An unbounded request over a full population reliably exceeds the
    // HTTP timeout, and a timeout discards every series in it — the feature then silently becomes
    // null for everyone, which is worse than being slow.
    const runner = new RecordingRunner((r) => ({
      Results: r.Series.map((s) => band(s.Key, 5)),
      Checkpoint: 'timesfm-2.5-200m',
      ProductionLicensed: true,
      DurationMs: 1,
    }));
    const values = await new ForecastFeatureExtractor(runner).extract(STEP, targets(1200, 40));
    expect(runner.Requests).toHaveLength(3);
    expect(runner.Requests.map((r) => r.Series.length)).toEqual([500, 500, 200]);
    expect([...values.values()].filter((v) => v.P50 !== null)).toHaveLength(1200);
  });

  it('keeps the surviving chunks when one fails, rather than discarding the whole feature', async () => {
    let call = 0;
    const runner: IForecastRunner = {
      forecast: async (r) => {
        call++;
        if (call === 1) throw new Error('timed out');
        return { Results: r.Series.map((s) => band(s.Key, 5)), Checkpoint: 'timesfm-2.5-200m', ProductionLicensed: true, DurationMs: 1 };
      },
    };
    const values = await new ForecastFeatureExtractor(runner).extract(STEP, targets(700, 40));
    const populated = [...values.values()].filter((v) => v.P50 !== null).length;
    expect(populated).toBe(200); // the second chunk survived; the first is null
    expect(values.size).toBe(700);
  });

  it('sends ONE batched request for a population that fits in a chunk, not one per record', () => {
    // The model costs seconds per series on CPU; per-row calls would make this unusable at scale.
    const runner = new RecordingRunner((r) => ({
      Results: r.Series.map((s) => band(s.Key, 5)),
      Checkpoint: 'timesfm-2.5-200m',
      ProductionLicensed: true,
      DurationMs: 1,
    }));
    return new ForecastFeatureExtractor(runner).extract(STEP, targets(50, 40)).then(() => {
      expect(runner.Requests).toHaveLength(1);
      expect(runner.Requests[0].Series).toHaveLength(50);
    });
  });

  it('never sends a series shorter than the minimum, and reports it as null', async () => {
    const runner = new RecordingRunner((r) => ({
      Results: r.Series.map((s) => band(s.Key, 5)),
      Checkpoint: 'timesfm-2.5-200m',
      ProductionLicensed: true,
      DurationMs: 1,
    }));
    // 5 buckets of history is far below the 32-step input patch.
    const values = await new ForecastFeatureExtractor(runner).extract(STEP, targets(3, 5));
    expect(runner.Requests).toHaveLength(0);
    expect([...values.values()].every((v) => v.P50 === null && v.Slope === null)).toBe(true);
  });

  it('computes slope against the last OBSERVED value, not against zero', async () => {
    // A slope measured from zero would report the level, not the change — every record would look
    // like it was heading up by exactly its own size.
    const runner = new RecordingRunner((r) => ({
      Results: r.Series.map((s) => band(s.Key, 9)),
      Checkpoint: 'timesfm-2.5-200m',
      ProductionLicensed: true,
      DurationMs: 1,
    }));
    const values = await new ForecastFeatureExtractor(runner).extract(STEP, targets(1, 40));
    const v = values.get('r0')!;
    const lastObserved = runner.Requests[0].Series[0].Context.slice(-1)[0];
    expect(v.P50).toBe(9);
    expect(v.Slope).toBe(9 - lastObserved);
  });

  it('maps p10 and p90 to the first and last quantile levels', async () => {
    const runner = new RecordingRunner((r) => ({
      Results: r.Series.map((s) => band(s.Key, 5)),
      Checkpoint: 'timesfm-2.5-200m',
      ProductionLicensed: true,
      DurationMs: 1,
    }));
    const v = (await new ForecastFeatureExtractor(runner).extract(STEP, targets(1, 40))).get('r0')!;
    expect(v.P10).toBe(1);
    expect(v.P90).toBe(9);
  });

  it('leaves a refused series null rather than substituting a band', async () => {
    const runner = new RecordingRunner((r) => ({
      Results: r.Series.map((s) => ({ Key: s.Key, Median: null, Quantiles: null, Refused: 'too short' })),
      Checkpoint: 'timesfm-2.5-200m',
      ProductionLicensed: true,
      DurationMs: 1,
    }));
    const v = (await new ForecastFeatureExtractor(runner).extract(STEP, targets(1, 40))).get('r0')!;
    expect(v).toEqual({ P50: null, P10: null, P90: null, Slope: null });
  });

  it('degrades to nulls when the sidecar is unreachable, rather than failing the assembly', async () => {
    // A forecast is one feature among many. Throwing here would take down models that do not use it.
    const runner: IForecastRunner = {
      forecast: async () => {
        throw new Error('connection refused');
      },
    };
    const values = await new ForecastFeatureExtractor(runner).extract(STEP, targets(2, 40));
    expect(values.size).toBe(2);
    expect([...values.values()].every((v) => v.P50 === null)).toBe(true);
  });
});
