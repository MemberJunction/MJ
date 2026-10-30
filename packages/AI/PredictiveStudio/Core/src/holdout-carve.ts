/**
 * @module holdout-carve
 *
 * The locked holdout an Evaluation Protocol declares (`HoldoutSplit`), carved from the unit rows.
 *
 * - date-carved: rows whose carve date is on or after the cutoff (and before `holdoutEnd`, when set) are the holdout,
 *   earlier rows are development, rows on or after `holdoutEnd` are left out and counted. An optional new-entity report
 *   holds out the newest entities whole.
 * - seeded-random: a row-hash holdout for units with one fixed decision date (no date to carve on).
 * - rolling-origin: the last `origins × horizonPeriods` periods of a forecast series.
 *
 * Every carve depends only on dates, keys and the protocol, never on the order the rows were read in or on the host's
 * time zone (every date is read as the UTC day of its `yyyy-mm-dd` date part), so the same rows always give the same
 * holdout. Browser-safe: no node `crypto` (see {@link HoldoutCarve.SeededRandomCarve} for the hash).
 */
import { OrdinalCompare } from '@memberjunction/global';
import type { HoldoutSplit } from './evaluation-protocol';
import type { DecisionSpec } from './prediction-unit';
import type { SnapshotRowKey } from './assembly-contract';
import { UtcDay } from './utc-day';

type DateCarved = Extract<HoldoutSplit, { readonly kind: 'date-carved' }>;
type RollingOrigin = Extract<HoldoutSplit, { readonly kind: 'rolling-origin' }>;

/**
 * The share of rows {@link HoldoutCarve.YearCutoff} leaves at most in the holdout when no share is given. Every caller
 * that derives a default cutoff reads this constant, so the default exists once.
 */
export const DEFAULT_YEAR_CUTOFF_SHARE = 0.25;

/** A date the carve reads (a carve date given to `YearCutoff` or `HoldoutPeriods`) that has no `yyyy-mm-dd` date part. */
export class HoldoutCarveDateError extends RangeError {
  constructor(public readonly Value: string) {
    super(`"${Value}" is not a date (yyyy-mm-dd); the holdout cannot be derived from it.`);
    this.name = 'HoldoutCarveDateError';
  }
}

/** One unit row as the date carve reads it. */
export interface CarveRow {
  readonly RowId: string;
  /**
   * The row's value of the unit's group key (the Prediction Unit's `groupKey` field, or the row's entity key when the
   * unit declares none). The new-entity report holds out whole groups by this key, so it must be the key the inner
   * folds group by, never the row id of a one-row-per-record unit.
   */
  readonly EntityKey: string;
  /**
   * The date the protocol carves on (the decision date, or the unit row's `dateColumn`): a `yyyy-mm-dd` day, or a
   * date-time whose date part is that day. The carve reads only the date part, as a UTC day, so a zone-less date-time
   * never shifts across midnight with the host's time zone.
   */
  readonly CarveDate: string;
  /** The label as text for classification units; null otherwise. */
  readonly Label: string | null;
}

/** A row kept in the snapshot and its role. */
export interface CarvedRow { readonly RowId: string; readonly Role: 'development' | 'locked-holdout' }

/** The deployment carve of a date-carved holdout. */
export interface DeploymentCarve {
  /** The rows kept in the snapshot, sorted by row id; rows on or after `holdoutEnd` are not among them. */
  readonly Rows: readonly CarvedRow[];
  readonly HoldoutRowIds: readonly string[];
  readonly DevelopmentRowCount: number;
  readonly HoldoutRowCount: number;
  readonly ExcludedAfterHoldoutEnd: number;
  /** Holdout rows per label; null when no holdout row has a label. */
  readonly HoldoutClassCounts: Readonly<Record<string, number>> | null;
  readonly HoldoutCarveDates: readonly string[];
}

/** The new-entity report: the newest groups held out whole, every other group trained on before the cutoff. */
export interface NewEntityCarve {
  readonly HoldoutEntityKeys: readonly string[];
  readonly TrainingRowIds: readonly string[];
  readonly HoldoutRowIds: readonly string[];
  /** Rows in neither set: a held-out group's rows outside the holdout window, another group's rows on or after the cutoff. */
  readonly ExcludedRowCount: number;
  /** Group keys present in both sets, counted from the rows; zero when the report is sound. */
  readonly SharedEntityKeys: number;
}

/** Why a holdout could not be carved; stored on a refused run (wire names shared with the sidecar). */
export type CarveRefusal =
  | { readonly kind: 'unparseable-cutoff'; readonly value: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'unparseable-carve-date'; readonly rowId: string; readonly value: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'missing-carve-date'; readonly rowId: string; readonly column: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'no-development-rows'; readonly cutoff: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'no-holdout-rows'; readonly cutoff: string; readonly holdoutEnd: string | null }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | {  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly kind: 'too-few-periods'; readonly periods: number; readonly origins: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly horizonPeriods: number; readonly gapPeriods: number; readonly minTrainPeriods: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    };

/** The result of a date carve: the deployment carve and, when the protocol declares one, the new-entity report. */
export type CarveResult =
  | { readonly Ok: true; readonly Deployment: DeploymentCarve; readonly NewEntity: NewEntityCarve | null }
  | { readonly Ok: false; readonly Refusal: CarveRefusal };

/** The result of a seeded-random carve: every row is in exactly one of the two lists, each sorted by row id. */
export interface SeededRandomCarveResult {
  readonly HoldoutRowIds: readonly string[];
  readonly DevelopmentRowIds: readonly string[];
}

/** One row of a forecast series and the period it belongs to (ISO date of the period start). */
export interface PeriodRow { readonly RowId: string; readonly Period: string }

/** The result of a rolling-origin carve. */
export type RollingOriginCarveResult =
  | { readonly Ok: true; readonly HoldoutRowIds: readonly string[]; readonly HoldoutPeriods: readonly string[] }
  | { readonly Ok: false; readonly Refusal: CarveRefusal };

/** The new-entity counts of a stored carve. */
export interface HoldoutCarveNewEntitySummary {
  readonly holdoutEntityKeys: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly trainingRowCount: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly holdoutRowCount: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly excludedRowCount: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly sharedEntityKeys: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** The carve as stored on the run (`ValidationResults.carve`), read by the gates (holdout class counts, periods) and the UI. */
export interface HoldoutCarveSummary {
  readonly kind: HoldoutSplit['kind'];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly cutoff: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly holdoutEnd: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly developmentRowCount: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly holdoutRowCount: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly excludedAfterHoldoutEnd: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly holdoutClassCounts: Readonly<Record<string, number>> | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** Distinct period starts of the holdout rows at the unit's decision period (one out-of-time slice each). */
  readonly holdoutPeriods: readonly string[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly newEntity: HoldoutCarveNewEntitySummary | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

interface DatedRow { readonly Row: CarveRow; readonly Time: number }

interface CarveWindow { readonly Cutoff: number; readonly End: number | null }

/** Where a carve date falls against the holdout window: before the cutoff, inside the window, or on or after its end. */
type WindowPlace = 'before-cutoff' | 'in-window' | 'after-end';

/**
 * Locked-holdout carves (static members on one owner). Ordering is `OrdinalCompare` from `@memberjunction/global`
 * (locale-independent), so results never depend on the host's locale.
 */
export class HoldoutCarve {
  /** The date carve: holdout = carve date ≥ cutoff and < holdoutEnd (when set); development = before the cutoff. */
  public static CarveLockedHoldout(rows: readonly CarveRow[], holdout: DateCarved): CarveResult {
    const window = HoldoutCarve.parseWindow(holdout);
    if (!window.Ok) return window;
    const dated = HoldoutCarve.parseCarveDates(rows);
    if (!dated.Ok) return dated;
    const deployment = HoldoutCarve.carveDeployment(dated.Rows, window.Window);
    if (deployment.DevelopmentRowCount === 0) return { Ok: false, Refusal: { kind: 'no-development-rows', cutoff: holdout.cutoff } };
    if (deployment.HoldoutRowCount === 0) return { Ok: false, Refusal: { kind: 'no-holdout-rows', cutoff: holdout.cutoff, holdoutEnd: holdout.holdoutEnd } };
    const report = holdout.newEntityReport;
    return { Ok: true, Deployment: deployment, NewEntity: report === null ? null : HoldoutCarve.carveNewEntities(dated.Rows, window.Window, report.holdoutFraction) };
  }

  /**
   * The holdout is every row whose hash of `<seed>:<rowId>`, read as a fraction of 2^32, is below `fraction`. A row's
   * role depends only on the seed and its own id, so it never changes with the read order or with other rows.
   */
  public static SeededRandomCarve(rowIds: readonly string[], fraction: number, seed: number): SeededRandomCarveResult {
    const hold: string[] = [];
    const dev: string[] = [];
    for (const id of [...rowIds].sort(OrdinalCompare)) (HoldoutCarve.seededRowHash(seed, id) / 4294967296 < fraction ? hold : dev).push(id);
    return { HoldoutRowIds: hold, DevelopmentRowIds: dev };
  }

  /**
   * The last `origins × horizonPeriods` distinct periods are the holdout (the trainer's outer origins). The series must
   * keep `minTrainPeriods` periods before the first origin's gap, as the trainer requires of its first origin.
   */
  public static RollingOriginCarve(rows: readonly PeriodRow[], holdout: RollingOrigin): RollingOriginCarveResult {
    const periods = [...new Set(rows.map((r) => r.Period))].sort(OrdinalCompare);
    const testCount = holdout.origins * holdout.horizonPeriods;
    if (periods.length - testCount - holdout.gapPeriods < holdout.minTrainPeriods) {
      return {
        Ok: false,
        Refusal: { kind: 'too-few-periods', periods: periods.length, origins: holdout.origins, horizonPeriods: holdout.horizonPeriods, gapPeriods: holdout.gapPeriods, minTrainPeriods: holdout.minTrainPeriods },
      };
    }
    const test = periods.slice(periods.length - testCount);
    const testSet = new Set(test);
    return { Ok: true, HoldoutRowIds: rows.filter((r) => testSet.has(r.Period)).map((r) => r.RowId), HoldoutPeriods: test };
  }

  /** One plain sentence per carve refusal (run notes, the operation error, the UI). */
  public static DescribeCarveRefusal(r: CarveRefusal): string {
    switch (r.kind) {
      case 'unparseable-cutoff': return `The holdout cutoff "${r.value}" is not a date.`;
      case 'unparseable-carve-date': return `Row ${r.rowId} has carve date "${r.value}", which is not a date; the holdout cannot be carved.`;
      case 'missing-carve-date': return `Row ${r.rowId} has no ${r.column}; the holdout is carved on that column.`;
      case 'no-development-rows': return `No row is dated before the cutoff ${r.cutoff}; nothing would be left to train on. Choose a later cutoff.`;
      case 'no-holdout-rows': return `No row is dated on or after the cutoff ${r.cutoff}${r.holdoutEnd === null ? '' : ` and before ${r.holdoutEnd}`}; there is nothing to test on. Choose an earlier cutoff.`;
      case 'too-few-periods': return `${r.periods} periods cannot hold ${r.origins} origins of ${r.horizonPeriods} periods and a gap of ${r.gapPeriods} periods after ${r.minTrainPeriods} training periods.`;
    }
  }

  /**
   * The earliest 1 January whose trailing block (dates on or after it) holds at most `maxShare` of the rows; at least
   * the last year's 1 January. Throws {@link HoldoutCarveDateError} on a date it cannot read (a dropped date would
   * shrink the denominator), and a `RangeError` when there is no date or the cutoff would leave no row before it.
   */
  public static YearCutoff(dates: readonly string[], maxShare: number = DEFAULT_YEAR_CUTOFF_SHARE): string {
    const times = dates.map((d) => HoldoutCarve.requireUtcDay(d));
    if (times.length === 0) throw new RangeError('YearCutoff needs at least one date.');
    const years = [...new Set(times.map((t) => new Date(t).getUTCFullYear()))].sort((a, b) => a - b);
    let best = Date.UTC(years[years.length - 1] || 0, 0, 1);
    for (let i = years.length - 1; i >= 0; i--) {
      const start = Date.UTC(years[i] || 0, 0, 1);
      if (times.filter((t) => t >= start).length / times.length > maxShare) break;
      best = start;
    }
    const earliest = times.reduce((m, t) => (t < m ? t : m), Number.POSITIVE_INFINITY);
    if (best <= earliest) throw new RangeError('The cutoff would leave no training rows.');
    return HoldoutCarve.iso(best);
  }

  /**
   * The distinct period starts (ISO dates, UTC) of the given dates, in order: one out-of-time slice per period. Weeks
   * start on Monday, quarters on 1 January, April, July and October. Throws {@link HoldoutCarveDateError} on a date it
   * cannot read.
   */
  public static HoldoutPeriods(dates: readonly string[], period: DecisionSpec['period']): readonly string[] {
    const starts = new Set<string>();
    for (const d of dates) starts.add(HoldoutCarve.periodStart(new Date(HoldoutCarve.requireUtcDay(d)), period));
    return [...starts].sort(OrdinalCompare);
  }

  /**
   * The development row ids of a snapshot manifest: the set a scored record's `inTraining` flag reads (a record whose
   * id is in it was a training row). Row ids, not entity keys: the same rule holds for one-row-per-record units and for
   * units with a row per record per period.
   */
  public static TrainingRowIds(manifest: readonly SnapshotRowKey[]): ReadonlySet<string> {
    return new Set(manifest.filter((r) => r.role === 'development').map((r) => r.rowId));
  }

  private static parseWindow(holdout: DateCarved): { readonly Ok: true; readonly Window: CarveWindow } | { readonly Ok: false; readonly Refusal: CarveRefusal } {
    const cutoff = UtcDay.ToUtcDay(holdout.cutoff);
    if (cutoff === null) return { Ok: false, Refusal: { kind: 'unparseable-cutoff', value: holdout.cutoff } };
    if (holdout.holdoutEnd === null) return { Ok: true, Window: { Cutoff: cutoff.getTime(), End: null } };
    const end = UtcDay.ToUtcDay(holdout.holdoutEnd);
    if (end === null) return { Ok: false, Refusal: { kind: 'unparseable-cutoff', value: holdout.holdoutEnd } };
    return { Ok: true, Window: { Cutoff: cutoff.getTime(), End: end.getTime() } };
  }

  /** The rows with their parsed carve dates, sorted by row id; the first unparseable date refuses the carve. */
  private static parseCarveDates(rows: readonly CarveRow[]): { readonly Ok: true; readonly Rows: readonly DatedRow[] } | { readonly Ok: false; readonly Refusal: CarveRefusal } {
    const dated: DatedRow[] = [];
    for (const row of rows) {
      const day = UtcDay.ToUtcDay(row.CarveDate);
      if (day === null) return { Ok: false, Refusal: { kind: 'unparseable-carve-date', rowId: row.RowId, value: row.CarveDate } };
      dated.push({ Row: row, Time: day.getTime() });
    }
    dated.sort((a, b) => OrdinalCompare(a.Row.RowId, b.Row.RowId));
    return { Ok: true, Rows: dated };
  }

  private static carveDeployment(dated: readonly DatedRow[], w: CarveWindow): DeploymentCarve {
    const kept: CarvedRow[] = [];
    const held: DatedRow[] = [];
    let excluded = 0;
    for (const d of dated) {
      const place = HoldoutCarve.windowPlace(w, d.Time);
      if (place === 'after-end') excluded++;
      else if (place === 'in-window') { kept.push({ RowId: d.Row.RowId, Role: 'locked-holdout' }); held.push(d); }
      else kept.push({ RowId: d.Row.RowId, Role: 'development' });
    }
    return {
      Rows: kept, HoldoutRowIds: held.map((d) => d.Row.RowId), DevelopmentRowCount: kept.length - held.length, HoldoutRowCount: held.length,
      ExcludedAfterHoldoutEnd: excluded, HoldoutClassCounts: HoldoutCarve.classCounts(held.map((d) => d.Row.Label)), HoldoutCarveDates: held.map((d) => d.Row.CarveDate),
    };
  }

  /**
   * Holds out the newest `fraction` of groups (by first carve date) whole, at least one group: their rows inside the
   * holdout window are the new-entity holdout; every other group's rows before the cutoff are its training rows; every
   * other row is excluded and counted.
   *
   * The reference pipeline (`date_grouped_carve`) holds out a seeded-random 30 % of groups instead. This carve holds out
   * the newest groups, as the protocol's report is defined here: it measures the model on the groups that appeared most
   * recently, the ones a deployed model meets first. A gate that compares this report with the reference measures two different
   * group selections and must read its numbers knowing that.
   */
  private static carveNewEntities(dated: readonly DatedRow[], w: CarveWindow, fraction: number): NewEntityCarve {
    const held = HoldoutCarve.newestEntityKeys(dated, fraction);
    const training: DatedRow[] = [];
    const holdout: DatedRow[] = [];
    for (const d of dated) {
      const place = HoldoutCarve.windowPlace(w, d.Time);
      if (held.has(d.Row.EntityKey)) { if (place === 'in-window') holdout.push(d); }
      else if (place === 'before-cutoff') training.push(d);
    }
    const trainingKeys = new Set(training.map((d) => d.Row.EntityKey));
    return {
      HoldoutEntityKeys: [...held].sort(OrdinalCompare),
      TrainingRowIds: training.map((d) => d.Row.RowId),
      HoldoutRowIds: holdout.map((d) => d.Row.RowId),
      ExcludedRowCount: dated.length - training.length - holdout.length,
      SharedEntityKeys: new Set(holdout.map((d) => d.Row.EntityKey).filter((k) => trainingKeys.has(k))).size,
    };
  }

  /** The newest `fraction` of group keys by first carve date (ties broken by key), at least one. */
  private static newestEntityKeys(dated: readonly DatedRow[], fraction: number): ReadonlySet<string> {
    const firstSeen = new Map<string, number>();
    for (const d of dated) {
      const prev = firstSeen.get(d.Row.EntityKey);
      if (prev === undefined || d.Time < prev) firstSeen.set(d.Row.EntityKey, d.Time);
    }
    const newestFirst = [...firstSeen.entries()].sort((a, b) => b[1] - a[1] || OrdinalCompare(a[0], b[0]));
    return new Set(newestFirst.slice(0, Math.max(1, Math.round(fraction * newestFirst.length))).map(([key]) => key));
  }

  private static classCounts(labels: readonly (string | null)[]): Readonly<Record<string, number>> | null {
    const counts: Record<string, number> = {};
    let labelled = 0;
    for (const l of labels) {
      if (l === null) continue;
      labelled++;
      counts[l] = (counts[l] || 0) + 1;
    }
    return labelled === 0 ? null : counts;
  }

  private static periodStart(date: Date, period: DecisionSpec['period']): string {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    switch (period) {
      case 'day': return HoldoutCarve.iso(Date.UTC(y, m, date.getUTCDate()));
      case 'week': return HoldoutCarve.iso(Date.UTC(y, m, date.getUTCDate() - ((date.getUTCDay() + 6) % 7)));
      case 'month': return HoldoutCarve.iso(Date.UTC(y, m, 1));
      case 'quarter': return HoldoutCarve.iso(Date.UTC(y, m - (m % 3), 1));
      case 'year': return HoldoutCarve.iso(Date.UTC(y, 0, 1));
    }
  }

  /**
   * The 32-bit hash that places a row in or out of a seeded-random holdout: FNV-1a over the UTF-16 code units of
   * `<seed>:<rowId>`, then the murmur3 `fmix32` finalizer.
   *
   * Why the finalizer: FNV-1a mixes its last input bytes only into the low bits, so on short ids that differ in their
   * last characters (`r1`, `r2`, … or sequential integer keys) the high bits, which decide the comparison with
   * `fraction`, are not uniform; on 4,000 ids `r0`–`r3999` at a fraction of 0.25 plain FNV-1a held out 1,119 rows
   * under seed 42 and 847 under seed 1 (expected 1,000). `fmix32` spreads every input bit over all 32 output bits, so the share matches the fraction for
   * any key shape. Changing this function re-carves every stored seeded-random holdout.
   */
  private static seededRowHash(seed: number, rowId: string): number {
    const text = `${seed}:${rowId}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /** The one holdout window rule both carves read: before the cutoff, on or after it and before `holdoutEnd`, or on or after `holdoutEnd`. */
  private static windowPlace(w: CarveWindow, time: number): WindowPlace {
    if (w.End !== null && time >= w.End) return 'after-end';
    return time >= w.Cutoff ? 'in-window' : 'before-cutoff';
  }

  /** The UTC midnight (ms) of a date ({@link UtcDay.ToUtcDay}); {@link HoldoutCarveDateError} when it names no calendar day. */
  private static requireUtcDay(text: string): number {
    const day = UtcDay.ToUtcDay(text);
    if (day === null) throw new HoldoutCarveDateError(text);
    return day.getTime();
  }

  private static iso(time: number): string {
    return new Date(time).toISOString().slice(0, 10);
  }
}
