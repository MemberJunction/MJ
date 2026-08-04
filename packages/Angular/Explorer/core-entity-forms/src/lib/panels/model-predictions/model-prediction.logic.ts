/**
 * Pure, framework-free logic for the entity-agnostic Model Predictions panel.
 *
 * Extracted from the Angular component so the band computation, value
 * formatting, and feature-importance parsing can be unit-tested without
 * standing up Angular or a real entity record. NONE of this is entity-specific
 * or domain-specific — it operates purely on numbers, strings, and the model's
 * generic `ProblemType` / `FeatureImportance` JSON.
 */

/**
 * The neutral tercile a numeric prediction falls into. No moral direction is
 * implied — `low`/`mid`/`high` describe position on the value axis only.
 */
export type PredictionBand = 'low' | 'mid' | 'high';

/** Generic problem types a trained model can have. */
export type ModelProblemType = 'classification' | 'regression';

/** One normalized feature-importance driver for display. */
export interface PredictionDriver {
    /** Raw feature name as the model stored it. */
    name: string;
    /** Importance magnitude (absolute value of the raw contribution). */
    importance: number;
    /** Importance as a 0–100 share of the strongest driver, for the bar width. */
    relativePct: number;
}

/** How a prediction's primary value should be rendered. */
export type PredictionValueKind = 'probability' | 'numeric' | 'class';

/** Maximum number of feature-importance drivers shown per card. */
export const MAX_DRIVERS = 5;

/**
 * Coerce a dynamic field value into a finite number, or null when it isn't one.
 */
export function toNumber(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * Decide how to render a value given the model's problem type and the value.
 *  - regression + numeric → 'numeric'
 *  - classification + value in [0,1] → 'probability' (a confidence/score we can gauge)
 *  - everything else (a class label, a missing value) → 'class'
 */
export function valueKind(problemType: ModelProblemType, numeric: number | null): PredictionValueKind {
    const isRegression = problemType === 'regression';
    if (isRegression && numeric != null) {
        return 'numeric';
    }
    if (!isRegression && numeric != null && numeric >= 0 && numeric <= 1) {
        return 'probability';
    }
    return 'class';
}

/**
 * Neutral tercile for a 0–1 value. Position on the value axis only — no
 * assumption that high is good or bad. Values are clamped to [0,1].
 */
export function bandFor(value: number): PredictionBand {
    const v = Math.max(0, Math.min(1, value));
    if (v < 1 / 3) return 'low';
    if (v < 2 / 3) return 'mid';
    return 'high';
}

/** Round a 0–1 probability to an integer 0–100 gauge fill, clamped. */
export function gaugePct(value: number): number {
    return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

/**
 * Format the primary value for display:
 *  - probability → "72%"
 *  - numeric (regression) → grouped number, up to 4 decimals
 *  - class label → the label string
 *  - missing/empty → "—" (em dash)
 */
export function formatValue(rawValue: unknown, numeric: number | null, kind: PredictionValueKind): string {
    if (kind === 'probability' && numeric != null) {
        return `${gaugePct(numeric)}%`;
    }
    if (kind === 'numeric' && numeric != null) {
        return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    if (rawValue == null || rawValue === '') {
        return '—';
    }
    return String(rawValue);
}

/**
 * Pick the human label for a prediction: prefer the model's target variable,
 * then the bound column name, then a generic fallback.
 */
export function resolveLabel(targetVariable: string | null, targetColumn: string | null): string {
    const target = targetVariable?.trim();
    if (target) return target;
    const col = targetColumn?.trim();
    if (col) return col;
    return 'Prediction';
}

/**
 * Parse a model's `FeatureImportance` JSON (`Record<string, number>`) into the
 * top-N sorted drivers with relative bar widths. Returns [] on null / invalid /
 * empty input — the caller omits the drivers section cleanly when empty.
 */
export function parseDrivers(featureImportanceJson: string | null): PredictionDriver[] {
    if (!featureImportanceJson) {
        return [];
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(featureImportanceJson);
    } catch {
        return [];
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return [];
    }
    const entries = Object.entries(parsed as Record<string, unknown>)
        .map(([name, raw]) => ({ name, importance: Math.abs(toNumber(raw) ?? 0) }))
        .filter(d => d.importance > 0)
        .sort((a, b) => b.importance - a.importance)
        .slice(0, MAX_DRIVERS);

    const max = entries.length > 0 ? entries[0].importance : 0;
    return entries.map(d => ({
        ...d,
        relativePct: max > 0 ? Math.round((d.importance / max) * 100) : 0,
    }));
}

/** Format a last-scored timestamp to a short date, or null when absent/invalid. */
export function formatLastScored(lastScoredAt: Date | string | null): string | null {
    if (!lastScoredAt) {
        return null;
    }
    const d = lastScoredAt instanceof Date ? lastScoredAt : new Date(lastScoredAt);
    if (isNaN(d.getTime())) {
        return null;
    }
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
