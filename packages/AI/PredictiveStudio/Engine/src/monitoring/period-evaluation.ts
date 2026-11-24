/**
 * @module monitoring/period-evaluation
 *
 * `PeriodEvaluation` — one monitored period's numbers from its joined rows (M6.3): the protocol's primary proper score
 * with its 95% interval under the protocol's `IntervalSpec` (iid, cluster or moving-block bootstrap, seeded), the
 * tracked metrics (label rates, the other proper scores, the mean prediction) each with its interval, the calibration
 * report of a binary model, the (period − reference) degradation interval a retrain trigger reads, and the paired
 * (current − predecessor) loss interval the rollback reads (D4-17). Pure: the rows, the specs and the seed decide every
 * number; nothing is read.
 */
import { UUIDsEqual } from '@memberjunction/global';
import type {
  CalibrationReport,
  Interval,
  IntervalSpec,
  MetricWithInterval,
  ProperScore,
  TaskType,
  TrackedMetric,
} from '@memberjunction/predictive-studio-core';

import type { JoinedRow } from './monitoring-seams';

/** What a period is scored under: the protocol's primary score and interval method, and the model's task. */
export interface PeriodScoringSpec {
  readonly PrimaryScore: ProperScore;
  readonly Interval: IntervalSpec;
  readonly Task: TaskType;
  /** Seeds every resample of the period, so a re-run of the period reproduces its numbers. */
  readonly Seed: number;
}

/** One period's numbers. */
export interface PeriodScores {
  readonly Primary: MetricWithInterval;
  readonly Tracked: readonly TrackedMetric[];
  /** Binary models only; null for every other task. */
  readonly Calibration: CalibrationReport | null;
}

/** A row-level statistic: the per-row values a bootstrap resamples and how a resample becomes one number. */
interface RowStatistic {
  readonly Values: readonly number[];
  readonly Reduce: (values: readonly number[]) => number;
}

/** The period's rows a statistic is computed over, in decision-date order, with their resampling groups. */
interface ResampleFrame {
  /** The row indices of each group, in first-seen order (built once per frame; a cluster draw picks whole groups). */
  readonly Members: readonly (readonly number[])[];
  readonly Spec: IntervalSpec;
  readonly Seed: number;
}

/** Scores one monitored period. */
export class PeriodEvaluation {
  /** Probabilities are clipped to [EPS, 1 − EPS] before a log. */
  public static readonly EPS = 1e-15;
  /** Bins of a calibration report's reliability table. */
  public static readonly RELIABILITY_BINS = 10;
  private static readonly Z95 = 1.959963984540054;
  private static readonly NEWTON_STEPS = 50;

  /**
   * The period's primary score, tracked metrics and calibration over `rows` (each with a realised outcome). The rows
   * are ordered by decision date first, so a block bootstrap resamples contiguous runs of the period.
   *
   * @throws Error when no row has an outcome, or a row's outcome does not fit the task (a class the model does not know)
   */
  public static Score(rows: readonly JoinedRow[], spec: PeriodScoringSpec): PeriodScores {
    const labelled = PeriodEvaluation.ordered(rows.filter((r) => r.Outcome !== null));
    if (labelled.length === 0) throw new Error('PeriodEvaluation.Score: the period has no row with a realised outcome');
    const frame = PeriodEvaluation.frame(labelled.map((r) => r.GroupKey), spec);
    const primary = PeriodEvaluation.metric(spec.PrimaryScore.metric, PeriodEvaluation.lossOf(spec.PrimaryScore.metric, labelled, spec.Task), frame);
    return {
      Primary: primary,
      Tracked: PeriodEvaluation.tracked(labelled, spec, frame),
      Calibration: spec.Task.kind === 'binary' ? PeriodEvaluation.calibration(labelled, spec.Task) : null,
    };
  }

  /**
   * The (period − reference) primary-loss interval: the difference of the two point values, with the two intervals'
   * normal-approximation standard errors combined (the reference is the model's stored holdout score, D4-17's
   * "reference band"). A lower bound above a trigger's margin means the period's loss is worse than the reference by
   * more than the margin. Pure.
   */
  public static Degradation(period: MetricWithInterval, reference: MetricWithInterval): Interval {
    const se = (m: MetricWithInterval): number => (m.interval.upper - m.interval.lower) / (2 * PeriodEvaluation.Z95);
    const diff = period.value - reference.value;
    const half = PeriodEvaluation.Z95 * Math.sqrt(se(period) ** 2 + se(reference) ** 2);
    return { level: 0.95, lower: diff - half, upper: diff + half };
  }

  /**
   * The paired (current − predecessor) primary-loss interval over the rows both models scored (`current[i]` and
   * `predecessor[i]` are the same record, each with its own score): the resamples draw the same rows for both models, so
   * the interval is of the difference on identical rows (G6.9's same-row rule, D4-17). Pure.
   *
   * @throws Error when the two lists differ in length or order, or no row has an outcome
   */
  public static PairedDifference(current: readonly JoinedRow[], predecessor: readonly JoinedRow[], spec: PeriodScoringSpec): MetricWithInterval {
    if (current.length !== predecessor.length || current.some((r, i) => !UUIDsEqual(r.RecordID, predecessor[i].RecordID))) {
      throw new Error('PeriodEvaluation.PairedDifference: the two models were not scored on the same rows in the same order');
    }
    const keep = current.map((r, i) => i).filter((i) => current[i].Outcome !== null);
    if (keep.length === 0) throw new Error('PeriodEvaluation.PairedDifference: no shared row has a realised outcome');
    const metric = spec.PrimaryScore.metric;
    const cur = PeriodEvaluation.lossOf(metric, keep.map((i) => current[i]), spec.Task);
    const pre = PeriodEvaluation.lossOf(metric, keep.map((i) => predecessor[i]), spec.Task);
    const value = (idx: readonly number[]): number => cur.Reduce(idx.map((i) => cur.Values[i])) - pre.Reduce(idx.map((i) => pre.Values[i]));
    const all = cur.Values.map((_, i) => i);
    const frame = PeriodEvaluation.frame(keep.map((i) => current[i].GroupKey), spec);
    const draws = PeriodEvaluation.resampleIndices(all.length, frame).map(value);
    return { metric, value: value(all), interval: PeriodEvaluation.percentile(draws), n: all.length };
  }

  // ----- metrics --------------------------------------------------------------------------------------------------

  /** The tracked metrics of the task, each with its interval. */
  private static tracked(rows: readonly JoinedRow[], spec: PeriodScoringSpec, frame: ResampleFrame): TrackedMetric[] {
    const task = spec.Task;
    const out: TrackedMetric[] = [];
    const add = (metric: TrackedMetric['metric'], className: string | null, stat: RowStatistic): void => {
      const m = PeriodEvaluation.withInterval(stat, frame);
      out.push({ metric, className, value: m.value, interval: m.interval, n: m.n });
    };
    if (task.kind === 'binary') {
      const adverse = task.classOrder[task.adverseIndex];
      add('positive-rate', adverse, PeriodEvaluation.mean(rows.map((r) => (PeriodEvaluation.isClass(r, adverse) ? 1 : 0))));
      add('mean-prediction', adverse, PeriodEvaluation.mean(rows.map((r) => r.Score)));
      for (const m of ['log-loss', 'brier'] as const) if (m !== spec.PrimaryScore.metric) add(m, null, PeriodEvaluation.lossOf(m, rows, task));
      return out;
    }
    if (task.kind === 'multiclass') {
      for (const cls of task.classOrder) add('class-rate', cls, PeriodEvaluation.mean(rows.map((r) => (PeriodEvaluation.isClass(r, cls) ? 1 : 0))));
      if (spec.PrimaryScore.metric !== 'multiclass-log-loss') add('multiclass-log-loss', null, PeriodEvaluation.lossOf('multiclass-log-loss', rows, task));
      return out;
    }
    add('mean-prediction', null, PeriodEvaluation.mean(rows.map((r) => r.Score)));
    for (const m of ['rmse', 'mae'] as const) if (m !== spec.PrimaryScore.metric) add(m, null, PeriodEvaluation.lossOf(m, rows, task));
    return out;
  }

  /** A proper score as a row statistic over `rows`. */
  private static lossOf(metric: ProperScore['metric'], rows: readonly JoinedRow[], task: TaskType): RowStatistic {
    switch (metric) {
      case 'log-loss': {
        const adverse = PeriodEvaluation.adverseClass(task);
        return PeriodEvaluation.mean(rows.map((r) => {
          const p = PeriodEvaluation.clip(r.Score);
          return PeriodEvaluation.isClass(r, adverse) ? -Math.log(p) : -Math.log(1 - p);
        }));
      }
      case 'brier': {
        const adverse = PeriodEvaluation.adverseClass(task);
        return PeriodEvaluation.mean(rows.map((r) => (r.Score - (PeriodEvaluation.isClass(r, adverse) ? 1 : 0)) ** 2));
      }
      case 'multiclass-log-loss':
        return PeriodEvaluation.mean(rows.map((r) => -Math.log(PeriodEvaluation.clip(PeriodEvaluation.classProbability(r)))));
      case 'rmse':
        return { Values: rows.map((r) => (r.Score - PeriodEvaluation.numeric(r)) ** 2), Reduce: (v) => Math.sqrt(PeriodEvaluation.avg(v)) };
      case 'mae':
        return PeriodEvaluation.mean(rows.map((r) => Math.abs(r.Score - PeriodEvaluation.numeric(r))));
      case 'poisson-deviance':
        return PeriodEvaluation.mean(rows.map((r) => {
          const y = PeriodEvaluation.numeric(r);
          const mu = Math.max(r.Score, PeriodEvaluation.EPS);
          return 2 * ((y > 0 ? y * Math.log(y / mu) : 0) - (y - mu));
        }));
      case 'tweedie-deviance': {
        const power = task.kind === 'non-negative' ? task.tweediePower : 1.5;
        return PeriodEvaluation.mean(rows.map((r) => PeriodEvaluation.tweedie(PeriodEvaluation.numeric(r), Math.max(r.Score, PeriodEvaluation.EPS), power)));
      }
      case 'mase': {
        const ys = rows.map((r) => PeriodEvaluation.numeric(r));
        const steps = ys.slice(1).map((y, i) => Math.abs(y - ys[i]));
        const scale = PeriodEvaluation.avg(steps);
        if (!(scale > 0)) throw new Error('PeriodEvaluation: MASE needs at least two distinct consecutive outcomes in the period');
        return PeriodEvaluation.mean(rows.map((r) => Math.abs(r.Score - PeriodEvaluation.numeric(r)) / scale));
      }
    }
  }

  /** The Tweedie unit deviance at `power` (1 < p < 2). */
  private static tweedie(y: number, mu: number, power: number): number {
    const a = y > 0 ? (y ** (2 - power)) / ((1 - power) * (2 - power)) : 0;
    return 2 * (a - (y * mu ** (1 - power)) / (1 - power) + (mu ** (2 - power)) / (2 - power));
  }

  /** A binary model's calibration over the period: the logistic recalibration fit (intercept, slope) and reliability bins. */
  private static calibration(rows: readonly JoinedRow[], task: Extract<TaskType, { kind: 'binary' }>): CalibrationReport {
    const adverse = task.classOrder[task.adverseIndex];
    const x = rows.map((r) => {
      const p = PeriodEvaluation.clip(r.Score);
      return Math.log(p / (1 - p));
    });
    const y = rows.map((r) => (PeriodEvaluation.isClass(r, adverse) ? 1 : 0));
    const [intercept, slope] = PeriodEvaluation.logisticFit(x, y);
    const bins = PeriodEvaluation.RELIABILITY_BINS;
    const reliability: CalibrationReport['reliability'][number][] = [];
    for (let b = 0; b < bins; b++) {
      const lo = b / bins;
      const hi = (b + 1) / bins;
      const inBin = rows.map((r, i) => i).filter((i) => rows[i].Score >= lo && (b === bins - 1 ? rows[i].Score <= hi : rows[i].Score < hi));
      if (inBin.length === 0) continue;
      reliability.push({
        binLower: lo, binUpper: hi, n: inBin.length,
        meanPredicted: PeriodEvaluation.avg(inBin.map((i) => rows[i].Score)), observedRate: PeriodEvaluation.avg(inBin.map((i) => y[i])),
      });
    }
    return { method: 'platt', intercept, slope, reliability };
  }

  /** Logistic regression of `y` on `x` with an intercept, by Newton–Raphson; returns `[intercept, slope]`. */
  private static logisticFit(x: readonly number[], y: readonly number[]): [number, number] {
    let a = 0;
    let b = 1;
    for (let step = 0; step < PeriodEvaluation.NEWTON_STEPS; step++) {
      let ga = 0;
      let gb = 0;
      let haa = 0;
      let hab = 0;
      let hbb = 0;
      for (let i = 0; i < x.length; i++) {
        const p = 1 / (1 + Math.exp(-(a + b * x[i])));
        const w = Math.max(p * (1 - p), 1e-12);
        ga += y[i] - p;
        gb += (y[i] - p) * x[i];
        haa += w;
        hab += w * x[i];
        hbb += w * x[i] * x[i];
      }
      const det = haa * hbb - hab * hab;
      if (!(Math.abs(det) > 1e-12)) break;
      const da = (hbb * ga - hab * gb) / det;
      const db = (haa * gb - hab * ga) / det;
      a += da;
      b += db;
      if (Math.abs(da) + Math.abs(db) < 1e-10) break;
    }
    return [a, b];
  }

  // ----- intervals ------------------------------------------------------------------------------------------------

  /** A proper score's value and interval. */
  private static metric(metric: ProperScore['metric'], stat: RowStatistic, frame: ResampleFrame): MetricWithInterval {
    const m = PeriodEvaluation.withInterval(stat, frame);
    return { metric, value: m.value, interval: m.interval, n: m.n };
  }

  /** A statistic's point value and its percentile interval over the frame's resamples. */
  private static withInterval(stat: RowStatistic, frame: ResampleFrame): { readonly value: number; readonly interval: Interval; readonly n: number } {
    const draws = PeriodEvaluation.resampleIndices(stat.Values.length, frame).map((idx) => stat.Reduce(idx.map((i) => stat.Values[i])));
    return { value: stat.Reduce(stat.Values), interval: PeriodEvaluation.percentile(draws), n: stat.Values.length };
  }

  /**
   * `resamples` index draws of `n` rows under the interval method: `bootstrap` (and `delong`, which has no loss form)
   * draws rows iid; `cluster-bootstrap` draws whole groups; `block-bootstrap` draws moving blocks of contiguous rows
   * (length ⌈n^⅓⌉), which keeps serial correlation inside a block.
   */
  private static resampleIndices(n: number, frame: ResampleFrame): number[][] {
    const rng = PeriodEvaluation.rng(frame.Seed);
    const out: number[][] = [];
    for (let r = 0; r < frame.Spec.resamples; r++) {
      if (frame.Spec.method === 'cluster-bootstrap') out.push(PeriodEvaluation.clusterDraw(frame.Members, rng));
      else if (frame.Spec.method === 'block-bootstrap') out.push(PeriodEvaluation.blockDraw(n, rng));
      else out.push(Array.from({ length: n }, () => Math.floor(rng() * n)));
    }
    return out;
  }

  /** A resample frame over rows whose groups are `groupKeys`: each group's row indices indexed once. */
  private static frame(groupKeys: readonly string[], spec: PeriodScoringSpec): ResampleFrame {
    const byGroup = new Map<string, number[]>();
    groupKeys.forEach((g, i) => {
      const members = byGroup.get(g);
      if (members === undefined) byGroup.set(g, [i]);
      else members.push(i);
    });
    return { Members: [...byGroup.values()], Spec: spec.Interval, Seed: spec.Seed };
  }

  private static clusterDraw(members: readonly (readonly number[])[], rng: () => number): number[] {
    const out: number[] = [];
    for (let k = 0; k < members.length; k++) {
      for (const i of members[Math.floor(rng() * members.length)]) out.push(i);
    }
    return out;
  }

  private static blockDraw(n: number, rng: () => number): number[] {
    const length = Math.max(1, Math.ceil(Math.cbrt(n)));
    const out: number[] = [];
    while (out.length < n) {
      const start = Math.floor(rng() * Math.max(1, n - length + 1));
      for (let i = start; i < start + length && out.length < n; i++) out.push(i);
    }
    return out;
  }

  /** The 2.5% and 97.5% percentiles of the draws (linear interpolation). */
  private static percentile(draws: readonly number[]): Interval {
    const sorted = [...draws].sort((a, b) => a - b);
    const at = (q: number): number => {
      const pos = q * (sorted.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    };
    return { level: 0.95, lower: at(0.025), upper: at(0.975) };
  }

  /** A seeded uniform generator on [0, 1) (mulberry32). */
  private static rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ----- helpers --------------------------------------------------------------------------------------------------

  private static mean(values: readonly number[]): RowStatistic {
    return { Values: values, Reduce: PeriodEvaluation.avg };
  }

  private static avg(values: readonly number[]): number {
    return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
  }

  private static clip(p: number): number {
    return Math.min(1 - PeriodEvaluation.EPS, Math.max(PeriodEvaluation.EPS, p));
  }

  private static ordered(rows: readonly JoinedRow[]): JoinedRow[] {
    return [...rows].sort((a, b) => a.DecisionDate.getTime() - b.DecisionDate.getTime());
  }

  private static adverseClass(task: TaskType): string {
    if (task.kind !== 'binary') throw new Error(`PeriodEvaluation: a binary proper score needs a binary task, not '${task.kind}'`);
    return task.classOrder[task.adverseIndex];
  }

  private static isClass(row: JoinedRow, cls: string): boolean {
    return String(row.Outcome).trim() === cls;
  }

  private static classProbability(row: JoinedRow): number {
    const cls = String(row.Outcome).trim();
    if (row.Probabilities === null) throw new Error(`PeriodEvaluation: record '${row.RecordID}' has no class probabilities`);
    const p = row.Probabilities[cls];
    if (p === undefined) throw new Error(`PeriodEvaluation: record '${row.RecordID}' has the outcome '${cls}', a class the model does not score`);
    return p;
  }

  private static numeric(row: JoinedRow): number {
    const y = typeof row.Outcome === 'number' ? row.Outcome : Number(row.Outcome);
    if (!Number.isFinite(y)) throw new Error(`PeriodEvaluation: record '${row.RecordID}' has the non-numeric outcome '${String(row.Outcome)}'`);
    return y;
  }
}
