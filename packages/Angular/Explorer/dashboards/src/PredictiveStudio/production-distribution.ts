/**
 * Pure, entity-agnostic helpers for the "Models in Production" panel.
 *
 * Nothing here knows about any specific entity, column, or domain — they operate on raw value arrays
 * and cron strings. Kept separate from the Angular component so they're trivially unit-testable and
 * reusable.
 */

/** Max rows pulled when sampling a target column's population for the distribution. */
export const PRODUCTION_SAMPLE_CAP = 5000;

/** One bucket in a written-column distribution (a tercile band or a class value). */
export interface DistributionBucket {
  /** Display label for the bucket (band name or class value). */
  label: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  /** Number of records in this bucket. */
  count: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  /** Share of the sampled population, 0..100 (rounded for display). */
  pct: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/** Result of bucketing a written column's current values across the population. */
export interface DistributionResult {
  /** 'numeric' → neutral terciles (Low/Mid/High bands); 'categorical' → group-by-value. */
  Kind: 'numeric' | 'categorical';
  Buckets: DistributionBucket[];
  /** Total records sampled (post NOT-NULL filter, pre-cap if the population is larger). */
  Sampled: number;
  /** True when the population hit {@link PRODUCTION_SAMPLE_CAP} and the distribution is a sample. */
  Capped: boolean;
}

/**
 * Build a generic distribution from a column's raw values.
 *
 * - **Numeric** (probabilities, scores, regression outputs): neutral terciles over the observed
 *   [min,max] range — "Lower third / Middle third / Upper third". No moral direction (no "risk",
 *   no "good/bad") — just neutral bands so the panel stays entity-agnostic.
 * - **Categorical** (class labels, strings, booleans): group-by-value counts, biggest first, with
 *   the long tail folded into "Other" beyond {@link MAX_CATEGORICAL_BUCKETS}.
 *
 * @param values raw column values (may contain null/undefined/empty — those are dropped)
 * @param numeric whether the bound column is numeric (caller derives this from entity field metadata)
 */
export function BuildDistribution(values: ReadonlyArray<unknown>, numeric: boolean): DistributionResult {
  const cleaned = values.filter((v) => v !== null && v !== undefined && v !== '');
  const sampled = cleaned.length;
  const capped = sampled >= PRODUCTION_SAMPLE_CAP;
  if (sampled === 0) {
    return { Kind: numeric ? 'numeric' : 'categorical', Buckets: [], Sampled: 0, Capped: false };
  }
  return numeric
    ? buildNumericTerciles(cleaned, sampled, capped)
    : buildCategorical(cleaned, sampled, capped);
}

/** @deprecated Use {@link BuildDistribution}. */
export function buildDistribution(values: ReadonlyArray<unknown>, numeric: boolean): DistributionResult {
  return BuildDistribution(values, numeric);
}

const MAX_CATEGORICAL_BUCKETS = 8;

function buildNumericTerciles(values: ReadonlyArray<unknown>, sampled: number, capped: boolean): DistributionResult {
  const nums = values.map(toNumber).filter((n): n is number => n !== null);
  if (nums.length === 0) {
    // Field flagged numeric but values weren't parseable — fall back to categorical so we show something.
    return buildCategorical(values, sampled, capped);
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  // Degenerate range (all identical) → a single band.
  if (span === 0) {
    return {
      Kind: 'numeric',
      Buckets: [{ label: `${formatNum(min)}`, count: nums.length, pct: 100 }],
      Sampled: sampled,
      Capped: capped,
    };
  }
  const third = span / 3;
  const b1 = min + third;
  const b2 = min + 2 * third;
  let low = 0;
  let mid = 0;
  let high = 0;
  for (const n of nums) {
    if (n < b1) low++;
    else if (n < b2) mid++;
    else high++;
  }
  const total = nums.length;
  const buckets: DistributionBucket[] = [
    { label: `Lower third (${formatNum(min)}–${formatNum(b1)})`, count: low, pct: pct(low, total) },
    { label: `Middle third (${formatNum(b1)}–${formatNum(b2)})`, count: mid, pct: pct(mid, total) },
    { label: `Upper third (${formatNum(b2)}–${formatNum(max)})`, count: high, pct: pct(high, total) },
  ];
  return { Kind: 'numeric', Buckets: buckets, Sampled: sampled, Capped: capped };
}

function buildCategorical(values: ReadonlyArray<unknown>, sampled: number, capped: boolean): DistributionResult {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = sampled;
  let buckets: DistributionBucket[];
  if (sorted.length <= MAX_CATEGORICAL_BUCKETS) {
    buckets = sorted.map(([label, count]) => ({ label, count, pct: pct(count, total) }));
  } else {
    const top = sorted.slice(0, MAX_CATEGORICAL_BUCKETS - 1);
    const otherCount = sorted.slice(MAX_CATEGORICAL_BUCKETS - 1).reduce((s, [, c]) => s + c, 0);
    buckets = top.map(([label, count]) => ({ label, count, pct: pct(count, total) }));
    buckets.push({ label: 'Other', count: otherCount, pct: pct(otherCount, total) });
  }
  return { Kind: 'categorical', Buckets: buckets, Sampled: sampled, Capped: capped };
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  // Probability-style values get more precision; large values stay compact.
  return Math.abs(n) < 10 ? n.toFixed(2) : n.toFixed(1);
}

/**
 * Turn a 5- or 6-field cron expression into a short human phrase ("Daily at 06:00", "Monthly",
 * "Weekly on Mon") for common cases, falling back to the raw expression when it doesn't match a
 * recognized pattern. Purely best-effort and locale-neutral — no external cron library.
 *
 * Field order: [second?] minute hour dayOfMonth month dayOfWeek
 */
export function HumanizeCron(cron: string | null | undefined): string | null {
  if (!cron) return null;
  const raw = cron.trim();
  if (!raw) return null;
  let parts = raw.split(/\s+/);
  // Drop a leading seconds field if this is a 6-part (Quartz-style) expression.
  if (parts.length === 6) parts = parts.slice(1);
  if (parts.length !== 5) return raw;

  const [min, hour, dom, month, dow] = parts;
  const everyMin = min === '*';
  const everyHour = hour === '*';
  const everyDom = dom === '*' || dom === '?';
  const everyMonth = month === '*';
  const everyDow = dow === '*' || dow === '?';

  const at = formatTime(min, hour);

  // Every minute / hour.
  if (everyMin && everyHour && everyDom && everyMonth && everyDow) return 'Every minute';
  if (!everyMin && everyHour && everyDom && everyMonth && everyDow && isInterval(min)) {
    return `Every ${intervalValue(min)} minutes`;
  }
  // Hourly: a specific minute, every hour ("0 * * * *" → at minute :00 of every hour).
  if (everyDom && everyMonth && everyDow && everyHour && !everyMin && isNumericField(min)) {
    const m = Number(min);
    return m === 0 ? 'Hourly' : `Hourly at :${String(m).padStart(2, '0')}`;
  }

  // Daily.
  if (everyDom && everyMonth && everyDow && at) return `Daily at ${at}`;

  // Weekly (specific day-of-week).
  if (everyDom && everyMonth && !everyDow) {
    const day = dayName(dow);
    return at ? `Weekly on ${day} at ${at}` : `Weekly on ${day}`;
  }

  // Monthly (specific day-of-month).
  if (!everyDom && everyMonth && everyDow) {
    return at ? `Monthly on day ${dom} at ${at}` : `Monthly on day ${dom}`;
  }

  // Yearly (specific month + day).
  if (!everyDom && !everyMonth && everyDow) {
    return at ? `Yearly (${month}/${dom}) at ${at}` : `Yearly (${month}/${dom})`;
  }

  return raw;
}

/** @deprecated Use {@link HumanizeCron}. */
export function humanizeCron(cron: string | null | undefined): string | null {
  return HumanizeCron(cron);
}

/** True when a cron field is a single integer literal (no `*`, ranges, lists, or steps). */
function isNumericField(field: string): boolean {
  return /^\d+$/.test(field);
}

function isInterval(field: string): boolean {
  return /^\*\/\d+$/.test(field);
}

function intervalValue(field: string): string {
  return field.split('/')[1] ?? field;
}

function formatTime(min: string, hour: string): string | null {
  const h = Number(hour);
  const m = Number(min);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayName(dow: string): string {
  const n = Number(dow);
  if (Number.isInteger(n) && n >= 0 && n <= 7) return DAY_NAMES[n % 7];
  return dow;
}

// ---------------------------------------------------------------------------
// View-model helpers — pure mappers shared by the production panel. Kept here
// (not in the Angular component) so the binding→VM / run-summarization logic is
// unit-testable without a metadata provider or component harness.
// ---------------------------------------------------------------------------

/** Status-pill colour variants used across the panel (matches the `.ps-badge` token set). */
export type StatusVariant = 'green' | 'amber' | 'red' | 'gray' | 'blue';

/**
 * Build the model display label for a production row: "<Pipeline> v<Version>", falling back to
 * "Model v<Version>" when no pipeline name is available, and "Unknown model" when the model itself
 * is missing (a dangling binding). Entity-agnostic — operates on plain pipeline/version inputs.
 *
 * @param pipeline denormalized pipeline name (may be null/empty/whitespace)
 * @param version  model version number (null when the model couldn't be resolved)
 */
export function ModelLabel(pipeline: string | null | undefined, version: number | null | undefined): string {
  if (version == null) return 'Unknown model';
  const name = pipeline?.trim();
  return name ? `${name} v${version}` : `Model v${version}`;
}

/** @deprecated Use {@link ModelLabel}. */
export function modelLabel(pipeline: string | null | undefined, version: number | null | undefined): string {
  return ModelLabel(pipeline, version);
}

/**
 * Map a Process-Run status to a {@link StatusVariant} pill colour. Unknown/empty statuses fall back
 * to neutral gray so a new run state never renders an undefined badge.
 */
export function RunStatusVariant(status: string | null | undefined): StatusVariant {
  switch (status) {
    case 'Completed':
      return 'green';
    case 'Running':
    case 'Pending':
      return 'blue';
    case 'Paused':
      return 'amber';
    case 'Failed':
      return 'red';
    case 'Cancelled':
      return 'gray';
    default:
      return 'gray';
  }
}

/** @deprecated Use {@link RunStatusVariant}. */
export function runStatusVariant(status: string | null | undefined): StatusVariant {
  return RunStatusVariant(status);
}

/** Map a scoring mode to its badge colour. OnDemand/unknown → neutral gray. */
export function ModeBadgeClass(mode: string | null | undefined): StatusVariant {
  switch (mode) {
    case 'Scheduled':
      return 'blue';
    case 'Materialized':
      return 'green';
    default:
      return 'gray';
  }
}

/** @deprecated Use {@link ModeBadgeClass}. */
export function modeBadgeClass(mode: string | null | undefined): StatusVariant {
  return ModeBadgeClass(mode);
}

/** Minimal raw shape of a Process Run consumed by {@link summarizeRun} (decoupled from the entity). */
export interface RawRun {
  Status: string;
  EndTime?: Date | null;
  StartTime?: Date | null;
  CreatedAt?: Date | null;
  SuccessCount?: number | null;
  ErrorCount?: number | null;
  TotalItemCount?: number | null;
}

/** A summarized last-run view-model rendered in the panel's "Last run" cell. */
export interface RunSummary {
  Status: string;
  StatusVariant: StatusVariant;
  /** Best available timestamp: EndTime → StartTime → CreatedAt → null. */
  When: Date | null;
  SuccessCount: number;
  ErrorCount: number;
  TotalCount: number | null;
}

/**
 * Summarize the latest Process Run for a production binding into a display-ready view-model. Picks the
 * most meaningful timestamp (end, else start, else created), coerces nullable counts to 0, and derives
 * the status-pill variant. Pure — no entity/provider dependency.
 *
 * @param run the latest run, or null/undefined when the binding has never run
 */
export function SummarizeRun(run: RawRun | null | undefined): RunSummary | null {
  if (!run) return null;
  return {
    Status: run.Status,
    StatusVariant: RunStatusVariant(run.Status),
    When: run.EndTime ?? run.StartTime ?? run.CreatedAt ?? null,
    SuccessCount: run.SuccessCount ?? 0,
    ErrorCount: run.ErrorCount ?? 0,
    TotalCount: run.TotalItemCount ?? null,
  };
}

/** @deprecated Use {@link SummarizeRun}. */
export function summarizeRun(run: RawRun | null | undefined): RunSummary | null {
  return SummarizeRun(run);
}
