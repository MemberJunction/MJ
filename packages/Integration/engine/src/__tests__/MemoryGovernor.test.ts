/**
 * The ranking rules are the whole subsystem. A threshold that fires and then pulls the wrong lever
 * is worse than no threshold, because it spends throughput and still dies — which is what the
 * sandbox did on 2026-09-14 with the one-lever version.
 */
import { describe, it, expect } from 'vitest';
import {
  planShedding, rankLevers, scoreLever, calibrate, estimateEntityMapBytes, batchSizeLever,
  SHED_ABOVE_FRACTION, SHED_DOWN_TO_FRACTION, CALIBRATION_MIN, CALIBRATION_MAX, resolveThresholds,
  type Contributor, type Lever, type GovernorReading
} from '../MemoryGovernor.js';

const MB = 1024 * 1024;

const lever = (over: Partial<Lever> = {}): Lever => ({
  Code: 'REDUCE_CONCURRENCY', ContributorID: 'c1', FreesBytes: 100 * MB,
  ThroughputCost: 0.5, LatencyBatches: 1, Reversible: true, ...over
});

const contributor = (levers: Lever[], over: Partial<Contributor> = {}): Contributor => ({
  ID: 'c1', Kind: 'entity-map', EstimatedBytes: 200 * MB, Levers: levers, ...over
});

/** The sandbox box, to scale: 3,830 MB total, killed at 3,478 MB resident. */
const sandbox = (residentMB: number): GovernorReading => ({
  ResidentBytes: residentMB * MB, HostTotalBytes: 3830 * MB, HostAvailableBytes: 120 * MB
});

describe('scoring and ranking', () => {
  it('prefers a free lever over any costed one, however large the costed saving', () => {
    const free = lever({ Code: 'HOLD_ADMISSIONS', FreesBytes: 1 * MB, ThroughputCost: 0 });
    const huge = lever({ Code: 'REDUCE_CONCURRENCY', FreesBytes: 5000 * MB, ThroughputCost: 0.5 });
    expect(rankLevers([huge, free])[0].Code).toBe('HOLD_ADMISSIONS');
  });

  it('discards a lever that frees nothing rather than ranking it last', () => {
    const useless = lever({ Code: 'SHRINK_BATCH', FreesBytes: 0, ThroughputCost: 0.05 });
    expect(rankLevers([useless, lever()]).map(l => l.Code)).toEqual(['REDUCE_CONCURRENCY']);
  });

  it('ranks by bytes per unit of throughput, not by bytes alone', () => {
    const cheap = lever({ Code: 'SHRINK_BATCH', FreesBytes: 100 * MB, ThroughputCost: 0.05 });
    const dear = lever({ Code: 'PAUSE_OTHER_SYNC', FreesBytes: 400 * MB, ThroughputCost: 1 });
    // 2000 MB-per-unit beats 400, even though the raw saving is a quarter the size.
    expect(rankLevers([dear, cheap])[0].Code).toBe('SHRINK_BATCH');
  });

  it('breaks a tie toward the reversible lever, then the faster one', () => {
    const irreversible = lever({ Code: 'PAUSE_OTHER_SYNC', Reversible: false });
    const reversible = lever({ Code: 'REDUCE_CONCURRENCY', Reversible: true });
    expect(rankLevers([irreversible, reversible])[0].Reversible).toBe(true);
    const slow = lever({ Code: 'FLUSH_ACCUMULATOR', LatencyBatches: 5 });
    const fast = lever({ Code: 'DROP_HASH_PREFETCH', LatencyBatches: 0 });
    expect(rankLevers([slow, fast])[0].LatencyBatches).toBe(0);
  });

  it('treats a NEGATIVE throughput cost as free, not as worst', () => {
    // Plain division would score -200 here and sort this last — the exact inversion of what a
    // "costs less than nothing" lever deserves. A cost below zero should never be reachable, which
    // is precisely why it must not silently produce the worst possible ranking if it ever is.
    const nonsense = lever({ Code: 'HOLD_ADMISSIONS', FreesBytes: 100 * MB, ThroughputCost: -0.5 });
    const ordinary = lever({ Code: 'REDUCE_CONCURRENCY', FreesBytes: 5000 * MB, ThroughputCost: 0.5 });
    expect(scoreLever(nonsense)).toBe(Number.POSITIVE_INFINITY);
    expect(rankLevers([ordinary, nonsense])[0].Code).toBe('HOLD_ADMISSIONS');
  });

  it('scores a zero-saving lever below every real one', () => {
    expect(scoreLever(lever({ FreesBytes: 0 }))).toBeLessThan(scoreLever(lever()));
  });
});

describe('the batch-size lever inverts on the connector, from evidence', () => {
  it('is the best lever available when the connector honours BatchSize', () => {
    const honours = batchSizeLever('m1', 400 * MB, true);
    const concurrency = lever({ FreesBytes: 400 * MB, ThroughputCost: 0.5 });
    expect(rankLevers([concurrency, honours])[0].Code).toBe('SHRINK_BATCH');
  });

  it('frees nothing when the connector ignores it — the Nimble case', () => {
    // Asking a connector that returned 2,000 against 200 for a smaller page buys a round trip and
    // no memory. The lever is still returned, so the decision is visibly considered and rejected.
    const ignores = batchSizeLever('m1', 400 * MB, false);
    expect(ignores.FreesBytes).toBe(0);
    expect(rankLevers([ignores])).toHaveLength(0);
  });
});

describe('planShedding', () => {
  it('does nothing while there is headroom', () => {
    const p = planShedding(sandbox(1500), [contributor([lever()])]);
    expect(p.Levers).toHaveLength(0);
    expect(p.Exhausted).toBe(false);
  });

  it('sheds once past the trigger, and stops as soon as the target is met', () => {
    // 3,478 of 3,830 MB. Target is 55% = ~2,107 MB, so it must free ~1,371 MB.
    const levers = [
      lever({ Code: 'HOLD_ADMISSIONS', FreesBytes: 800 * MB, ThroughputCost: 0 }),
      lever({ Code: 'REDUCE_CONCURRENCY', FreesBytes: 700 * MB, ThroughputCost: 0.5 }),
      lever({ Code: 'PAUSE_OTHER_SYNC', FreesBytes: 900 * MB, ThroughputCost: 1, Reversible: false })
    ];
    const p = planShedding(sandbox(3478), [contributor(levers)]);
    expect(p.Levers.map(l => l.Code)).toEqual(['HOLD_ADMISSIONS', 'REDUCE_CONCURRENCY']);
    expect(p.Exhausted).toBe(false);
  });

  it('reports EXHAUSTED rather than cutting past the point of progress', () => {
    const p = planShedding(sandbox(3478), [contributor([lever({ FreesBytes: 10 * MB })])]);
    expect(p.Exhausted).toBe(true);
    expect(p.Levers).toHaveLength(1);
  });

  it('is exhausted, not silent, when pressure is high and no lever exists', () => {
    const p = planShedding(sandbox(3478), [contributor([])]);
    expect(p.Levers).toHaveLength(0);
    expect(p.Exhausted).toBe(true);
    expect(p.Reason).toMatch(/no lever/);
  });

  it('refuses to judge without a denominator', () => {
    const p = planShedding(
      { ResidentBytes: 3478 * MB, HostTotalBytes: null, HostAvailableBytes: null },
      [contributor([lever()])]
    );
    expect(p.Levers).toHaveLength(0);
    expect(p.Reason).toMatch(/unknown/);
  });

  it('sheds MORE when the model has been proven optimistic', () => {
    const levers = [
      lever({ Code: 'HOLD_ADMISSIONS', FreesBytes: 800 * MB, ThroughputCost: 0 }),
      lever({ Code: 'REDUCE_CONCURRENCY', FreesBytes: 700 * MB, ThroughputCost: 0.5 }),
      lever({ Code: 'PAUSE_OTHER_SYNC', FreesBytes: 900 * MB, ThroughputCost: 1 })
    ];
    const honest = planShedding(sandbox(3478), [contributor(levers)], 1);
    const optimistic = planShedding(sandbox(3478), [contributor(levers)], 0.4);
    expect(optimistic.Levers.length).toBeGreaterThan(honest.Levers.length);
  });

  it('crosses the trigger exactly at the threshold, not before', () => {
    const at = 3830 * SHED_ABOVE_FRACTION;
    expect(planShedding(sandbox(at - 1), [contributor([lever()])]).Levers).toHaveLength(0);
    expect(planShedding(sandbox(at + 1), [contributor([lever()])]).Levers.length).toBeGreaterThan(0);
  });
});

describe('calibration', () => {
  it('converges downward when the model over-promises', () => {
    let c = 1;
    for (let i = 0; i < 20; i++) c = calibrate(c, 1000 * MB, 300 * MB);
    expect(c).toBeGreaterThan(CALIBRATION_MIN);
    expect(c).toBeLessThan(0.45);
  });

  it('never inverts on memory that GREW despite shedding', () => {
    // RSS moves for reasons that are not ours. A negative sample must damp, never flip the sign.
    expect(calibrate(1, 500 * MB, -200 * MB)).toBeGreaterThan(0);
  });

  it('stays inside its clamps however extreme the sample', () => {
    expect(calibrate(1, 1 * MB, 10_000 * MB)).toBeLessThanOrEqual(CALIBRATION_MAX);
    expect(calibrate(1, 10_000 * MB, 0)).toBeGreaterThanOrEqual(CALIBRATION_MIN);
  });

  it('ignores a plan that projected nothing', () => {
    expect(calibrate(0.8, 0, 500 * MB)).toBe(0.8);
  });
});

describe('the cost model', () => {
  it('uses what the connector RETURNED, not what was asked for', () => {
    // Nimble: 2,000 returned against 200 requested. Modelling the request understates by 10x.
    expect(estimateEntityMapBytes(2000, 4096)).toBe(2000 * 4096);
  });

  it('is zero rather than negative on a nonsense input', () => {
    expect(estimateEntityMapBytes(0, 4096)).toBe(0);
    expect(estimateEntityMapBytes(-5, 4096)).toBe(0);
    expect(estimateEntityMapBytes(100, 0)).toBe(0);
  });
});

describe('operator thresholds', () => {
  const D = { ShedAbove: SHED_ABOVE_FRACTION, ShedDownTo: SHED_DOWN_TO_FRACTION };

  it('defaults when nothing is set', () => {
    expect(resolveThresholds({})).toEqual(D);
  });

  it('lets a known-tight workspace shed earlier', () => {
    expect(resolveThresholds({
      MJ_INTEGRATION_SHED_ABOVE_FRACTION: '0.35',
      MJ_INTEGRATION_SHED_DOWN_TO_FRACTION: '0.25'
    })).toEqual({ ShedAbove: 0.35, ShedDownTo: 0.25 });
  });

  it('rejects an INVERTED pair outright rather than half-applying it', () => {
    // A target at or above the trigger sheds, re-triggers instantly, and never stops. Half-taking
    // the setting would produce exactly that, so the pair falls back together.
    expect(resolveThresholds({
      MJ_INTEGRATION_SHED_ABOVE_FRACTION: '0.30',
      MJ_INTEGRATION_SHED_DOWN_TO_FRACTION: '0.60'
    })).toEqual(D);
    expect(resolveThresholds({
      MJ_INTEGRATION_SHED_ABOVE_FRACTION: '0.40',
      MJ_INTEGRATION_SHED_DOWN_TO_FRACTION: '0.40'
    })).toEqual(D);
  });

  it('ignores values outside 0..1, including a percentage typed as one', () => {
    for (const v of ['70', '0', '1', '-0.2', 'high', '']) {
      expect(resolveThresholds({ MJ_INTEGRATION_SHED_ABOVE_FRACTION: v }).ShedAbove)
        .toBe(SHED_ABOVE_FRACTION);
    }
  });

  it('accepts one override and keeps the other default, when the pair still makes sense', () => {
    expect(resolveThresholds({ MJ_INTEGRATION_SHED_ABOVE_FRACTION: '0.60' }))
      .toEqual({ ShedAbove: 0.6, ShedDownTo: SHED_DOWN_TO_FRACTION });
  });
});
