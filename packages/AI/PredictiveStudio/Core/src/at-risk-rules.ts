/**
 * Pure derivations for the business workspace's **ranked at-risk list** — turning a model's per-record
 * scoring results (`MJ: Process Run Details` payloads) into a "who to focus on" list sorted by risk, and
 * the model's global feature importance into the features the model weighted most (shown only for
 * coefficient models — see `ImportanceDisplay.GlobalDriversShowable`).
 *
 * Honest about the gap: MJ stores only GLOBAL feature importance (not per-record/SHAP), so we surface the
 * top global drivers once for the whole prediction rather than fabricating per-member attribution.
 *
 * Pure, dependency-free, browser-safe → unit-tested with no Angular.
 */

import { type OutcomeConfig, ResolveOutcomeConfig, ResolveScoreBand } from './outcome-config';

/** The three risk bands the at-risk list colors and counts by. */
export type RiskBand = 'high' | 'medium' | 'low';

/** A scored record in the at-risk list. */
export interface AtRiskRow {
  RecordID: string;
  /**
   * Human-readable label for the record (e.g. the member's name/email), resolved from the model's
   * target entity. Null until resolved; the UI falls back to {@link RecordID} so the row is never blank.
   */
  Label: string | null;
  /** 0–1 prediction score (probability / risk). */
  Score: number;
  /** Risk as a 0–100 integer, for display. */
  RiskPct: number;
  /** Predicted class label, when present (classification). */
  Class: string | null;
  /** Risk band measured on {@link RiskPct} (never on the raw score), for color / filtering / the High-Medium-Low counts. */
  Band: RiskBand;
  /** Qualitative status label (e.g. "High", "Critical", "Low Risk"). */
  Status?: string;
  /** Semantic badge color. */
  BadgeColor?: string;
  /** Icon class. */
  Icon?: string;
  /**
   * Top signed per-record drivers behind THIS row's prediction (P1-5), humanized for display. `Up: true`
   * pushed the risk up, `false` down. Null when the model doesn't produce per-record attribution
   * (tree/ensemble/multiclass) — the UI then shows the model's global drivers instead.
   */
  Drivers: RowDriver[] | null;
}

/** A humanized, signed per-record driver for the at-risk row's inline "why". */
export interface RowDriver {
  /** Display label (humanized; the one-hot category is kept). */
  Label: string;
  /** Signed contribution magnitude for this row. */
  Value: number;
  /** Whether this pushed the displayed risk UP. */
  Up: boolean;
}

/** The raw per-record detail the list is built from (a slice of `MJ: Process Run Details`). */
export interface RunDetailLike {
  RecordID: string;
  ResultPayload?: string | null;
}

/** Options for parsing predictions into at-risk rows. */
export interface ParseAtRiskOptions {
  /**
   * When true, the model predicts probability of a positive outcome (e.g. `P(Renewed)`).
   * Churn / adverse risk is therefore inverted: `riskScore = 1.0 - score`.
   * High score (0.99) -> Low Risk (1%, green). Low score (0.10) -> High Risk (90%, red).
   */
  InvertedRisk?: boolean;
  /**
   * Configured outcome metadata for the model (labels, thresholds, colors, icons).
   * When provided, `ResolveScoreBand()` supplies the display status, badge color and icon (the risk `Band` is computed from risk).
   */
  OutcomeConfig?: OutcomeConfig;
}

/** The model shape the outcome config resolves from (the same input `ResolveOutcomeConfig` takes). */
export type OutcomeModelLike = Parameters<typeof ResolveOutcomeConfig>[0];

/** The prediction fields a scored payload carries, after narrowing from parsed JSON. */
interface ScoredPrediction {
  Score: number;
  Class: string | null;
  Status?: string;
  BadgeColor?: string;
  Icon?: string;
  // unknown: the raw per-record drivers from the stored payload; ParseRowDrivers narrows them
  Drivers: unknown;
}

/** Rows below this displayed risk never go on an "At-Risk" list. */
export const AT_RISK_LIST_MIN_RISK_PCT = 40;

/** The At-Risk rules the drawer, the resource, the gate probe and the tests share. */
export class AtRiskRules {
  /**
   * Whether a signed per-row contribution raises the risk the screen shows. Contributions are on the model's own score
   * (`value > 0` pushed the score up). When that score is the probability of the good outcome (`invertedRisk`, e.g.
   * P(renew)), pushing it up LOWERS risk.
   */
  public static DriverRaisesRisk(contribution: number, invertedRisk: boolean): boolean {
    return invertedRisk ? contribution < 0 : contribution > 0;
  }

  /** The At-Risk options for a model: its resolved outcome config, and risk inverted when the score is the good outcome. */
  public static BuildAtRiskOptions(model: OutcomeModelLike): ParseAtRiskOptions {
    const outcomeConfig = ResolveOutcomeConfig(model);
    return { InvertedRisk: outcomeConfig.Polarity === 'positive' && model?.ProblemType !== 'regression', OutcomeConfig: outcomeConfig };
  }

  /** The members of an "At-Risk" list: highest displayed risk first, at least {@link AT_RISK_LIST_MIN_RISK_PCT}, at most `limit`. */
  public static SelectAtRiskListMembers(rows: ReadonlyArray<AtRiskRow>, limit: number): AtRiskRow[] {
    return [...rows]
      .sort((a, b) => b.RiskPct - a.RiskPct)
      .filter((r) => r.RiskPct >= AT_RISK_LIST_MIN_RISK_PCT)
      .slice(0, limit);
  }

  /** Parse + humanize the raw per-record `drivers` (post-preprocessing `feature`/`value`) into {@link RowDriver}s. */
  public static ParseRowDrivers(raw: unknown, invertedRisk: boolean): RowDriver[] | null { // unknown: parsed JSON from a stored payload; narrowed below
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const out: RowDriver[] = [];
    for (const d of raw) {
      if (!AtRiskRules.isDriverLike(d)) continue;
      const feature = typeof d.feature === 'string' ? d.feature : '';
      const value = AtRiskRules.firstNumber(d.value, d.importance, d.weight);
      if (!feature || value === null) continue;
      // Keep the one-hot category: for a per-record "why", the category IS the story — "Membership Type =
      // Student lowers risk" is actionable where a collapsed "Membership Type" is close to meaningless.
      // (Collapsing across categories is only right for GLOBAL importance — see TopGlobalDrivers.)
      out.push({ Label: AtRiskRules.HumanizeFeatureName(feature), Value: value, Up: AtRiskRules.DriverRaisesRisk(value, invertedRisk) });
    }
    return out.length > 0 ? out : null;
  }

  /**
   * Build a human-readable label for a record from its (simple) row of the target entity — preferring the
   * entity's name field (`nameField`), then `Name`, else `FirstName`+`LastName` (with `Email`), else `Email`,
   * else any first short non-empty string field. Returns null when nothing usable is found (caller falls back
   * to the record id).
   */
  public static LabelFromRecord(row: Record<string, unknown> | undefined | null, nameField: string | null): string | null {
    if (!row) return null;
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const named = nameField ? str(row[nameField]) : '';
    if (named) return named;
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

  /** Parse + rank the per-record predictions into the at-risk list (highest risk first). */
  public static ParseAtRiskRows(details: RunDetailLike[], options?: ParseAtRiskOptions): AtRiskRow[] {
    const rows: AtRiskRow[] = [];
    const isInverted = options?.InvertedRisk === true;
    for (const d of details) {
      const p = AtRiskRules.readScoredPrediction(d.ResultPayload);
      if (p) rows.push(AtRiskRules.buildRow(d.RecordID, p, isInverted, options?.OutcomeConfig));
    }
    return rows.sort((a, b) => b.RiskPct - a.RiskPct);
  }

  /**
   * The top plain-language drivers for the whole prediction, from the model's global feature importance.
   * Accepts the object form (`{"MembershipType=Student": 0.9, ...}`) or the array form
   * (`[{feature, importance}]`), strips one-hot `=value` suffixes, de-duplicates, and returns the
   * highest-importance feature names — so a business user sees feature names, not raw weights.
   */
  public static TopGlobalDrivers(featureImportanceJson: string | null | undefined, n = 3): string[] {
    const pairs = AtRiskRules.importancePairs(featureImportanceJson);
    // Collapse one-hot columns ("Feature=Value" → "Feature"), keeping each feature's max weight.
    const byFeature = new Map<string, number>();
    for (const { name, weight } of pairs) {
      const base = name.split('=')[0].trim();
      if (!base) continue;
      // ?? keeps a legitimate 0 weight already stored for this feature
      byFeature.set(base, Math.max(byFeature.get(base) ?? 0, weight));
    }
    return [...byFeature.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => AtRiskRules.HumanizeFeatureName(name));
  }

  /**
   * Turn a raw feature/column name into a readable label — `RetentionOverdueInvoices` → `Retention Overdue
   * Invoices`, `overdue_invoices` → `Overdue invoices`, and a one-hot `MembershipType=Student` →
   * `Membership Type = Student`. Splits camelCase + snake/kebab, spaces one-hot `=`, collapses whitespace,
   * and capitalizes the first letter. Already-spaced labels pass through unchanged.
   */
  public static HumanizeFeatureName(name: string): string {
    return name
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s*=\s*/g, ' = ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  /**
   * Build the `MJ: Lists.Name` string (`At-Risk: <title> (<timestamp>)`) truncated to `maxLength`
   * (100 chars, matching `MJ: Lists.Name` `NVARCHAR(100)`) so long prediction titles never fail save validation.
   */
  public static FormatAtRiskListName(title: string, timestamp: string, maxLength = 100): string {
    const prefix = 'At-Risk: ';
    const suffix = ` (${timestamp})`;
    const maxTitleLen = Math.max(1, maxLength - prefix.length - suffix.length);
    const trimmed = title.trim();
    const truncatedTitle =
      trimmed.length > maxTitleLen ? `${trimmed.slice(0, maxTitleLen - 1).trimEnd()}…` : trimmed;
    return `${prefix}${truncatedTitle}${suffix}`;
  }

  /**
   * One at-risk row from a narrowed prediction. `Band` is always measured on the displayed risk (inverted when asked), so
   * the High/Medium/Low counts mean risk for every polarity; a configured band's keys are on the raw score, so the outcome
   * config supplies only the display status, color and icon.
   */
  private static buildRow(recordId: string, p: ScoredPrediction, isInverted: boolean, outcomeConfig: OutcomeConfig | undefined): AtRiskRow {
    const effectiveRisk = isInverted ? Math.max(0, Math.min(1, 1 - p.Score)) : p.Score;
    const resolved = outcomeConfig ? ResolveScoreBand(p.Score, outcomeConfig) : null;
    // Payload strings are never legitimately '' — an empty status/color/icon means "not set", so || falls back.
    return {
      RecordID: recordId,
      Label: null,
      Score: p.Score,
      RiskPct: Math.round(effectiveRisk * 100),
      Class: p.Class,
      Band: AtRiskRules.bandFor(effectiveRisk),
      Status: p.Status || resolved?.Label,
      BadgeColor: p.BadgeColor || resolved?.BadgeColor,
      Icon: p.Icon || resolved?.Icon,
      Drivers: AtRiskRules.ParseRowDrivers(p.Drivers, isInverted),
    };
  }

  private static bandFor(risk: number): RiskBand {
    return risk >= 0.7 ? 'high' : risk >= 0.4 ? 'medium' : 'low';
  }

  /** Parse a stored payload and narrow it to its prediction (write-back runs nest it under `output`); null when unusable. */
  private static readScoredPrediction(payload: string | null | undefined): ScoredPrediction | null {
    if (!payload) return null;
    // unknown: parsed JSON from a stored payload; narrowed below
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return null;
    }
    if (!AtRiskRules.isDriverLike(parsed)) return null;
    const p = AtRiskRules.isDriverLike(parsed.output) ? parsed.output : parsed;
    if (typeof p.score !== 'number' || !Number.isFinite(p.score)) return null;
    return {
      Score: p.score,
      Class: AtRiskRules.optionalString(p.class) || null,
      Status: AtRiskRules.optionalString(p.status),
      BadgeColor: AtRiskRules.optionalString(p.badgeColor),
      Icon: AtRiskRules.optionalString(p.icon),
      Drivers: p.drivers,
    };
  }

  /** The (name, |weight|) pairs of a global feature-importance JSON, in its object or array form. */
  private static importancePairs(featureImportanceJson: string | null | undefined): Array<{ name: string; weight: number }> {
    if (!featureImportanceJson) return [];
    // unknown: parsed JSON from the stored FeatureImportance column; narrowed below
    let parsed: unknown;
    try {
      parsed = JSON.parse(featureImportanceJson);
    } catch {
      return [];
    }
    const pairs: Array<{ name: string; weight: number }> = [];
    if (Array.isArray(parsed)) {
      for (const e of parsed) {
        if (!AtRiskRules.isDriverLike(e)) continue;
        const name = AtRiskRules.optionalString(e.feature) || AtRiskRules.optionalString(e.name);
        const weight = AtRiskRules.firstNumber(e.importance, e.value);
        if (name && weight !== null) pairs.push({ name, weight: Math.abs(weight) });
      }
    } else if (AtRiskRules.isDriverLike(parsed)) {
      for (const [name, weight] of Object.entries(parsed)) {
        if (typeof weight === 'number') pairs.push({ name, weight: Math.abs(weight) });
      }
    }
    return pairs;
  }

  // unknown: one element of parsed JSON; this guard is what narrows it
  private static isDriverLike(d: unknown): d is Record<string, unknown> {
    return typeof d === 'object' && d !== null;
  }

  // unknown: a field of parsed JSON
  private static optionalString(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined;
  }

  /** The first finite number among the candidates, or null. */
  private static firstNumber(...candidates: unknown[]): number | null { // unknown: fields of parsed JSON
    for (const c of candidates) {
      if (typeof c === 'number' && Number.isFinite(c)) return c;
    }
    return null;
  }
}
