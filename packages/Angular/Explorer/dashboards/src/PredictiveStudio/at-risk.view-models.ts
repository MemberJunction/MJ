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
  /** 0–1 prediction score (probability / risk). */
  score: number;
  /** Risk as a 0–100 integer, for display. */
  riskPct: number;
  /** Predicted class label, when present (classification). */
  class: string | null;
  /** Risk band, for color. */
  band: 'high' | 'medium' | 'low';
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
    let parsed: { score?: number; class?: string; output?: { score?: number; class?: string } };
    try {
      parsed = JSON.parse(d.ResultPayload);
    } catch {
      continue;
    }
    // Write-back runs nest the prediction under `output`; generic runs carry it at the top level.
    const p = parsed.output ?? parsed;
    if (typeof p.score !== 'number' || !Number.isFinite(p.score)) continue;
    const score = p.score;
    rows.push({ recordId: d.recordId, score, riskPct: Math.round(score * 100), class: p.class ?? null, band: bandFor(score) });
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
  return [...byFeature.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => name);
}
