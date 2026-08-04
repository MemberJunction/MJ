/**
 * Pure derivations for the business workspace's **ranked at-risk list** — turning a model's per-record
 * scoring results (`MJ: Process Run Details` payloads) into a "who to focus on" list sorted by risk, and
 * the model's global feature importance into plain-language "what's driving this" drivers.
 *
 * Honest about the gap: MJ stores only GLOBAL feature importance (not per-record/SHAP), so we surface the
 * top global drivers once for the whole prediction rather than fabricating per-member attribution.
 *
 * Framework-free + deterministic → unit-tested with no Angular.
 */

/** A scored record in the at-risk list. */
export interface AtRiskRow {
  recordId: string;
  /**
   * Human-readable label for the record (e.g. the member's name/email), resolved from the model's
   * target entity. Null until resolved; the UI falls back to {@link recordId} so the row is never blank.
   */
  label: string | null;
  /** 0–1 prediction score (probability / risk). */
  score: number;
  /** Risk as a 0–100 integer, for display. */
  riskPct: number;
  /** Predicted class label, when present (classification). */
  class: string | null;
  /** Risk band, for color. */
  band: 'high' | 'medium' | 'low';
  /**
   * Top signed per-record drivers behind THIS row's prediction (P1-5), humanized + one-hot-collapsed for
   * display. `up: true` pushed the risk up, `false` down. Null when the model doesn't produce per-record
   * attribution (tree/ensemble/multiclass) — the UI then shows the model's global drivers instead.
   */
  drivers: RowDriver[] | null;
}

/** A humanized, signed per-record driver for the at-risk row's inline "why". */
export interface RowDriver {
  /** Display label (humanized, one-hot base collapsed). */
  label: string;
  /** Signed contribution magnitude for this row. */
  value: number;
  /** Whether this pushed the risk UP (value > 0) or down. */
  up: boolean;
}

/** Parse + humanize the raw per-record `drivers` (post-preprocessing `feature`/`value`) into {@link RowDriver}s. */
function parseRowDrivers(raw: unknown): RowDriver[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RowDriver[] = [];
  for (const d of raw as Array<{ feature?: unknown; value?: unknown }>) {
    const feature = typeof d?.feature === 'string' ? d.feature : '';
    const value = typeof d?.value === 'number' ? d.value : NaN;
    if (!feature || !Number.isFinite(value)) continue;
    // Keep the one-hot category: for a per-record "why", the category IS the story — "Membership Type =
    // Student lowers risk" is actionable where a collapsed "Membership Type" is close to meaningless.
    // (Collapsing across categories is only right for GLOBAL importance — see topGlobalDrivers.)
    out.push({ label: humanizeFeatureName(feature), value, up: value > 0 });
  }
  return out.length > 0 ? out : null;
}

/**
 * Build a human-readable label for a record from its (simple) row of the target entity — preferring a
 * single `Name`, else `FirstName`+`LastName`, else `Email`, else any first non-empty string field.
 * Returns null when nothing usable is found (caller falls back to the record id).
 */
export function labelFromRecord(row: Record<string, unknown> | undefined | null): string | null {
  if (!row) return null;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const name = str(row['Name']);
  if (name) return name;
  const full = `${str(row['FirstName'])} ${str(row['LastName'])}`.trim();
  const email = str(row['Email']);
  if (full && email) return `${full} (${email})`;
  if (full) return full;
  if (email) return email;
  for (const v of Object.values(row)) {
    const s = str(v);
    if (s && s.length <= 120) return s;
  }
  return null;
}

/** The raw per-record detail the list is built from (a slice of `MJ: Process Run Details`). */
export interface RunDetailLike {
  recordId: string;
  ResultPayload?: string | null;
}

function bandFor(score: number): AtRiskRow['band'] {
  return score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';
}

/** Parse + rank the per-record predictions into the at-risk list (highest risk first). */
export function parseAtRiskRows(details: RunDetailLike[]): AtRiskRow[] {
  const rows: AtRiskRow[] = [];
  for (const d of details) {
    if (!d.ResultPayload) continue;
    let parsed: {
      score?: number;
      class?: string;
      drivers?: unknown;
      output?: { score?: number; class?: string; drivers?: unknown };
    };
    try {
      parsed = JSON.parse(d.ResultPayload);
    } catch {
      continue;
    }
    // Write-back runs nest the prediction under `output`; generic runs carry it at the top level.
    const p = parsed.output ?? parsed;
    if (typeof p.score !== 'number' || !Number.isFinite(p.score)) continue;
    const score = p.score;
    rows.push({
      recordId: d.recordId,
      label: null,
      score,
      riskPct: Math.round(score * 100),
      class: p.class ?? null,
      band: bandFor(score),
      drivers: parseRowDrivers(p.drivers),
    });
  }
  return rows.sort((a, b) => b.score - a.score);
}

/**
 * The top plain-language drivers for the whole prediction, from the model's global feature importance.
 * Accepts the object form (`{"MembershipType=Student": 0.9, ...}`) or the array form
 * (`[{feature, importance}]`), strips one-hot `=value` suffixes, de-duplicates, and returns the
 * highest-importance feature names — so a business user sees "what's driving this", not raw weights.
 */
export function topGlobalDrivers(featureImportanceJson: string | null | undefined, n = 3): string[] {
  if (!featureImportanceJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(featureImportanceJson);
  } catch {
    return [];
  }
  const pairs: Array<{ name: string; weight: number }> = [];
  if (Array.isArray(parsed)) {
    for (const e of parsed as Array<Record<string, unknown>>) {
      const name = (e.feature ?? e.name) as string | undefined;
      const weight = (e.importance ?? e.value) as number | undefined;
      if (typeof name === 'string' && typeof weight === 'number') pairs.push({ name, weight: Math.abs(weight) });
    }
  } else if (parsed && typeof parsed === 'object') {
    for (const [name, weight] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof weight === 'number') pairs.push({ name, weight: Math.abs(weight) });
    }
  }
  // Collapse one-hot columns ("Feature=Value" → "Feature"), keeping each feature's max weight.
  const byFeature = new Map<string, number>();
  for (const { name, weight } of pairs) {
    const base = name.split('=')[0].trim();
    if (!base) continue;
    byFeature.set(base, Math.max(byFeature.get(base) ?? 0, weight));
  }
  return [...byFeature.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => humanizeFeatureName(name));
}

/**
 * Turn a raw feature/column name into a readable label — `RetentionOverdueInvoices` → `Retention Overdue
 * Invoices`, `overdue_invoices` → `Overdue Invoices`, and a one-hot `MembershipType=Student` →
 * `Membership Type = Student`. Splits camelCase + snake/kebab, spaces one-hot `=`, collapses whitespace,
 * and capitalizes the first letter. Already-spaced labels pass through unchanged.
 */
export function humanizeFeatureName(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s*=\s*/g, ' = ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}
