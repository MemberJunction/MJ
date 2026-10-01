/**
 * Pure, framework-free logic for the entity-agnostic Model Predictions panel.
 *
 * Extracted from the Angular component so the band computation, value
 * formatting, and feature-importance parsing can be unit-tested without
 * standing up Angular or a real entity record. NONE of this is entity-specific
 * or domain-specific — it operates purely on numbers, strings, and the model's
 * generic `ProblemType` / `FeatureImportance` JSON.
 */

import {
    OutcomeBand,
    OutcomeConfig,
    formatPredictionScore,
    resolveOutcomeConfig,
    resolveOutcomeStyle,
    resolveScoreBand,
} from '@memberjunction/predictive-studio-core';

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
    name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Importance magnitude (absolute value of the raw contribution). */
    importance: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Importance as a 0–100 share of the strongest driver, for the bar width. */
    RelativePct: number;
}

/** How a prediction's primary value should be rendered. */
export type PredictionValueKind = 'probability' | 'numeric' | 'class';

/** Maximum number of feature-importance drivers shown per card. */
export const MAX_DRIVERS = 5;

/**
 * Coerce a dynamic field value into a finite number, or null when it isn't one.
 */
export function ToNumber(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** @deprecated Use {@link ToNumber}. */
export function toNumber(value: unknown): number | null {
    return ToNumber(value);
}

/**
 * Decide how to render a value given the model's problem type and the value.
 *  - regression + numeric → 'numeric'
 *  - classification + value in [0,1] → 'probability' (a confidence/score we can gauge)
 *  - everything else (a class label, a missing value) → 'class'
 */
export function ValueKind(problemType: ModelProblemType, numeric: number | null): PredictionValueKind {
    const isRegression = problemType === 'regression';
    if (isRegression && numeric != null) {
        return 'numeric';
    }
    if (!isRegression && numeric != null && numeric >= 0 && numeric <= 1) {
        return 'probability';
    }
    return 'class';
}

/** @deprecated Use {@link ValueKind}. */
export function valueKind(problemType: ModelProblemType, numeric: number | null): PredictionValueKind {
    return ValueKind(problemType, numeric);
}

/**
 * Neutral tercile for a 0–1 value. Position on the value axis only — no
 * assumption that high is good or bad. Values are clamped to [0,1].
 */
export function BandFor(value: number): PredictionBand {
    const v = Math.max(0, Math.min(1, value));
    if (v < 1 / 3) return 'low';
    if (v < 2 / 3) return 'mid';
    return 'high';
}

/** @deprecated Use {@link BandFor}. */
export function bandFor(value: number): PredictionBand {
    return BandFor(value);
}

/** Round a 0–1 probability to an integer 0–100 gauge fill, clamped. */
export function GaugePct(value: number): number {
    return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

/** @deprecated Use {@link GaugePct}. */
export function gaugePct(value: number): number {
    return GaugePct(value);
}

/**
 * Format the primary value for display:
 *  - probability → "72%"
 *  - numeric (regression) → grouped number, up to 4 decimals
 *  - class label → the label string
 *  - missing/empty → "—" (em dash)
 */
export function FormatValue(rawValue: unknown, numeric: number | null, kind: PredictionValueKind): string {
    if (kind === 'probability' && numeric != null) {
        return `${GaugePct(numeric)}%`;
    }
    if (kind === 'numeric' && numeric != null) {
        return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    if (rawValue == null || rawValue === '') {
        return '—';
    }
    return String(rawValue);
}

/** @deprecated Use {@link FormatValue}. */
export function formatValue(rawValue: unknown, numeric: number | null, kind: PredictionValueKind): string {
    return FormatValue(rawValue, numeric, kind);
}

/**
 * Pick the human label for a prediction: prefer the model's target variable,
 * then the bound column name, then a generic fallback.
 */
export function ResolveLabel(targetVariable: string | null, targetColumn: string | null): string {
    const target = targetVariable?.trim();
    if (target) return target;
    const col = targetColumn?.trim();
    if (col) return col;
    return 'Prediction';
}

/** @deprecated Use {@link ResolveLabel}. */
export function resolveLabel(targetVariable: string | null, targetColumn: string | null): string {
    return ResolveLabel(targetVariable, targetColumn);
}

/**
 * Parse a model's `FeatureImportance` JSON (`Record<string, number>`) into the
 * top-N sorted drivers with relative bar widths. Returns [] on null / invalid /
 * empty input — the caller omits the drivers section cleanly when empty.
 */
export function ParseDrivers(featureImportanceJson: string | null): PredictionDriver[] {
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
        .map(([name, raw]) => ({ name, importance: Math.abs(ToNumber(raw) ?? 0) }))
        .filter(d => d.importance > 0)
        .sort((a, b) => b.importance - a.importance)
        .slice(0, MAX_DRIVERS);

    const max = entries.length > 0 ? entries[0].importance : 0;
    return entries.map(d => ({
        ...d,
        RelativePct: max > 0 ? Math.round((d.importance / max) * 100) : 0,
    }));
}

/** @deprecated Use {@link ParseDrivers}. */
export function parseDrivers(featureImportanceJson: string | null): PredictionDriver[] {
    return ParseDrivers(featureImportanceJson);
}

/** Format a last-scored timestamp to a short date, or null when absent/invalid. */
export function FormatLastScored(lastScoredAt: Date | string | null): string | null {
    if (!lastScoredAt) {
        return null;
    }
    const d = lastScoredAt instanceof Date ? lastScoredAt : new Date(lastScoredAt);
    if (isNaN(d.getTime())) {
        return null;
    }
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** @deprecated Use {@link FormatLastScored}. */
export function formatLastScored(lastScoredAt: Date | string | null): string | null {
    return FormatLastScored(lastScoredAt);
}

/**
 * A resolved historical prediction row from `MJ: Process Run Details` for an entity record.
 */
export interface PredictionHistoryItem {
    /** The MJ: Process Run Details primary key ID */
    id: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** The parent Process Run ID */
    ProcessRunId: string;
    /** Model ID if resolved from payload or model lookup */
    modelId: string | null;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Resolved model name (e.g. "Member Churn Risk" or "LatePaymentOutcome") */
    ModelName: string;
    /** Resolved pipeline & version string (e.g. "Pipeline v1") */
    Provenance: string;
    /** Target variable / label */
    target: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Problem type: classification or regression */
    problemType: ModelProblemType;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Primary numeric value / score */
    NumericValue: number | null;
    /** Class label if classification */
    PredictedClass: string | null;
    /** Formatted display value (e.g. "88%", "Late", "1,240.5") */
    DisplayValue: string;
    /** True if 0–1 probability we can gauge/badge */
    IsProbability: boolean;
    /** Neutral band: 'low' | 'mid' | 'high' */
    Band: PredictionBand | null;
    /** Resolved semantic status band from outcomeConfig */
    StatusBand: OutcomeBand | null;
    /** Human-readable status label (e.g. "Low Risk", "High") */
    StatusLabel: string | null;
    /** Semantic badge color ('green' | 'amber' | 'red' | 'blue' | 'gray') */
    BadgeColor: 'green' | 'amber' | 'red' | 'blue' | 'gray';
    /** Icon class if specified in band/style */
    BadgeIcon: string | null;
    /** Execution status: 'Succeeded' | 'Failed' | 'Pending' | 'Skipped' */
    status: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** When processing completed */
    CompletedAt: Date | null;
    /** Formatted date/time for history display */
    FormattedTime: string;
    /** Drivers if available in payload */
    Drivers: PredictionDriver[];
    /** Error message if Failed */
    ErrorMessage: string | null;
    /** Full raw payload object for JSON inspection */
    RawPayload: Record<string, unknown> | null;
}

/** Summary descriptor of a model represented in prediction history. */
export interface ModelHistorySummary {
    modelId: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    ModelName: string;
    count: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

/** Input contract for parsing a Process Run Detail record. */
export interface RawProcessRunDetail {
    ID: string;
    ProcessRunID: string;
    Status: string;
    CompletedAt: Date | string | null;
    ResultPayload: string | null;
    ErrorMessage: string | null;
}

/** Model metadata lookup contract for decorating history items. */
export interface HistoryModelMetadata {
    Name?: string;
    Pipeline?: string;
    Version?: number;
    ProblemType?: string;
    TargetVariable?: string;
    Lineage?: string | null;
    outcomeConfig?: OutcomeConfig | null;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

/**
 * Format a history completion timestamp with date and time.
 */
export function FormatHistoryTimestamp(date: Date | string | null): string {
    if (!date) return '—';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

/** @deprecated Use {@link FormatHistoryTimestamp}. */
export function formatHistoryTimestamp(date: Date | string | null): string {
    return FormatHistoryTimestamp(date);
}

/**
 * Parse an array of drivers from payload driver shapes (array of { feature, value } or map).
 */
export function ParsePayloadDrivers(rawDrivers: unknown): PredictionDriver[] {
    if (!rawDrivers) return [];
    if (Array.isArray(rawDrivers)) {
        const entries = rawDrivers
            .map((item: unknown) => {
                if (!item || typeof item !== 'object') return null;
                const rec = item as Record<string, unknown>;
                const name = typeof rec['feature'] === 'string' ? rec['feature'] : (typeof rec['name'] === 'string' ? rec['name'] : '');
                const val = ToNumber(rec['value'] ?? rec['importance']);
                if (!name || val == null) return null;
                return { name, importance: Math.abs(val) };
            })
            .filter((d): d is { name: string; importance: number } => d != null && d.importance > 0)
            .sort((a, b) => b.importance - a.importance)
            .slice(0, MAX_DRIVERS);

        const max = entries.length > 0 ? entries[0].importance : 0;
        return entries.map(d => ({
            ...d,
            RelativePct: max > 0 ? Math.round((d.importance / max) * 100) : 0,
        }));
    }
    if (typeof rawDrivers === 'object') {
        return ParseDrivers(JSON.stringify(rawDrivers));
    }
    return [];
}

/** @deprecated Use {@link ParsePayloadDrivers}. */
export function parsePayloadDrivers(rawDrivers: unknown): PredictionDriver[] {
    return ParsePayloadDrivers(rawDrivers);
}

/**
 * Parse a raw `MJ: Process Run Details` row into a decorated {@link PredictionHistoryItem}.
 */
export function ParseHistoryItem(
    detail: RawProcessRunDetail,
    modelLookup?: Map<string, HistoryModelMetadata>,
): PredictionHistoryItem {
    let rawPayload: Record<string, unknown> | null = null;
    let payloadSection: Record<string, unknown> | null = null;

    if (detail.ResultPayload) {
        try {
            const parsed = JSON.parse(detail.ResultPayload);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                rawPayload = parsed as Record<string, unknown>;
                const outputObj = rawPayload['output'];
                if (outputObj && typeof outputObj === 'object' && !Array.isArray(outputObj)) {
                    payloadSection = outputObj as Record<string, unknown>;
                } else {
                    payloadSection = rawPayload;
                }
            }
        } catch {
            rawPayload = null;
            payloadSection = null;
        }
    }

    const payloadModelId = typeof payloadSection?.['modelId'] === 'string' ? payloadSection['modelId'] : null;
    const modelMeta = payloadModelId && modelLookup ? modelLookup.get(payloadModelId) : undefined;

    const rawScore = payloadSection?.['score'] ?? payloadSection?.['value'] ?? null;
    const numericScore = ToNumber(rawScore);
    const predictedClass = typeof payloadSection?.['class'] === 'string' ? payloadSection['class'] : null;

    const probTypeStr = (typeof payloadSection?.['problemType'] === 'string' ? payloadSection['problemType'] : modelMeta?.ProblemType) ?? '';
    const problemType: ModelProblemType = probTypeStr.toLowerCase() === 'regression' ? 'regression' : 'classification';

    const kind = ValueKind(problemType, numericScore);
    const displayValue = predictedClass ?? FormatValue(rawScore, numericScore, kind);

    const targetVar = (typeof payloadSection?.['target'] === 'string' ? payloadSection['target'] : modelMeta?.TargetVariable) ?? '';
    const label = ResolveLabel(targetVar, null);

    const modelName = modelMeta?.Name ?? label;
    const provenance = modelMeta?.Pipeline && modelMeta?.Version
        ? `${modelMeta.Pipeline} v${modelMeta.Version}`
        : (modelMeta?.Name ?? 'Predictive Model');

    const completedAt = detail.CompletedAt ? (detail.CompletedAt instanceof Date ? detail.CompletedAt : new Date(detail.CompletedAt)) : null;
    const drivers = ParsePayloadDrivers(payloadSection?.['drivers']);

    const rawOutcomeConfig = (payloadSection?.['outcomeConfig'] ?? modelMeta?.outcomeConfig) as OutcomeConfig | undefined;
    const outcomeConfig = rawOutcomeConfig
        ? resolveOutcomeConfig({ outcomeConfig: rawOutcomeConfig })
        : resolveOutcomeConfig({
            Lineage: modelMeta?.Lineage ?? null,
            TargetVariable: targetVar || modelMeta?.TargetVariable || null,
            ProblemType: probTypeStr || modelMeta?.ProblemType || null,
        });

    let statusBand: OutcomeBand | null = null;
    let badgeColor: 'green' | 'amber' | 'red' | 'blue' | 'gray' = 'gray';
    let badgeIcon: string | null = null;
    let statusLabel: string | null = null;

    if (numericScore != null) {
        statusBand = resolveScoreBand(numericScore, outcomeConfig);
        if (statusBand) {
            badgeColor = statusBand.BadgeColor;
            badgeIcon = statusBand.Icon ?? null;
            statusLabel = statusBand.Label;
        }
    } else if (predictedClass) {
        const style = resolveOutcomeStyle(predictedClass, outcomeConfig);
        badgeColor = style.BadgeColor;
        badgeIcon = style.Icon ?? null;
        statusLabel = style.DisplayLabel ?? predictedClass;
    }

    return {
        id: detail.ID,
        ProcessRunId: detail.ProcessRunID,
        modelId: payloadModelId,
        ModelName: modelName,
        Provenance: provenance,
        target: targetVar || label,
        problemType,
        NumericValue: numericScore,
        PredictedClass: predictedClass,
        DisplayValue: displayValue,
        IsProbability: kind === 'probability',
        Band: kind === 'probability' && numericScore != null ? BandFor(numericScore) : null,
        StatusBand: statusBand,
        StatusLabel: statusLabel,
        BadgeColor: badgeColor,
        BadgeIcon: badgeIcon,
        status: detail.Status || 'Succeeded',
        CompletedAt: completedAt,
        FormattedTime: FormatHistoryTimestamp(completedAt),
        Drivers: drivers,
        ErrorMessage: detail.ErrorMessage,
        RawPayload: rawPayload,
    };
}

/** @deprecated Use {@link ParseHistoryItem}. */
export function parseHistoryItem(
    detail: RawProcessRunDetail,
    modelLookup?: Map<string, HistoryModelMetadata>,
): PredictionHistoryItem {
    return ParseHistoryItem(detail, modelLookup);
}

/**
 * Filter prediction history by a selected model ID (or return all when null / 'ALL').
 */
export function FilterHistoryByModel(
    history: PredictionHistoryItem[],
    selectedModelId: string | null,
): PredictionHistoryItem[] {
    if (!selectedModelId || selectedModelId === 'ALL') {
        return history;
    }
    return history.filter(item => item.modelId === selectedModelId);
}

/** @deprecated Use {@link FilterHistoryByModel}. */
export function filterHistoryByModel(
    history: PredictionHistoryItem[],
    selectedModelId: string | null,
): PredictionHistoryItem[] {
    return FilterHistoryByModel(history, selectedModelId);
}

/**
 * Aggregate unique models from prediction history for multi-model tabs / filters.
 */
export function GetDistinctModelsFromHistory(history: PredictionHistoryItem[]): ModelHistorySummary[] {
    const counts = new Map<string, { ModelName: string; count: number }>();
    for (const item of history) {
        const id = item.modelId ?? 'UNKNOWN';
        const existing = counts.get(id);
        if (existing) {
            existing.count += 1;
        } else {
            counts.set(id, { ModelName: item.ModelName, count: 1 });
        }
    }
    return Array.from(counts.entries()).map(([modelId, data]) => ({
        modelId,
        ModelName: data.ModelName,
        count: data.count,
    }));
}

/** @deprecated Use {@link GetDistinctModelsFromHistory}. */
export function getDistinctModelsFromHistory(history: PredictionHistoryItem[]): ModelHistorySummary[] {
    return GetDistinctModelsFromHistory(history);
}
