export interface DriftPeriodMeanRow {
    AgentName?: unknown;
    RubricName?: unknown;
    CriterionKey?: unknown;
    CurrentMean?: unknown;
    PreviousMean?: unknown;
}

/** Names for the drift screen. A missing mean for one window is left out of that window. */
export function DriftPeriodRows(rows: DriftPeriodMeanRow[]): { current: { key: string; mean: number }[]; previous: { key: string; mean: number }[] } {
    const current: { key: string; mean: number }[] = [];
    const previous: { key: string; mean: number }[] = [];
    for (const row of rows) {
        const agent = text(row.AgentName);
        const rubric = text(row.RubricName);
        const criterion = text(row.CriterionKey);
        if (!agent || !rubric || !criterion) continue;
        const key = `${agent} · ${rubric} · ${criterion}`;
        const currentMean = numberOrNull(row.CurrentMean);
        const previousMean = numberOrNull(row.PreviousMean);
        if (currentMean != null) current.push({ key, mean: currentMean });
        if (previousMean != null) previous.push({ key, mean: previousMean });
    }
    return { current, previous };
}

function text(value: unknown): string {
    return value == null ? '' : String(value).trim();
}

function numberOrNull(value: unknown): number | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/** Scores for DriftSeries, keyed by the criterion Key rather than the row id. */
export function DriftSeriesInput(
    scoreRows: Record<string, unknown>[],
    criteria: Record<string, unknown>[],
): {
    scores: { evaluationId: string; criterionId: string; criterionKey?: string; normalizedScore: number }[];
    criteria: { id: string; key: string }[];
} {
    const keys = new Map(criteria.map(row => [String(row.ID ?? ''), String(row.Key ?? '')]));
    return {
        scores: scoreRows.map(row => {
            const criterionId = String(row.CriterionID ?? '');
            const criterionKey = keys.get(criterionId);
            return {
                evaluationId: String(row.EvaluationID ?? ''),
                criterionId,
                ...(criterionKey ? { criterionKey } : {}),
                normalizedScore: Number(row.NormalizedScore),
            };
        }),
        criteria: criteria
            .filter(row => String(row.ID ?? '').length > 0 && String(row.Key ?? '').length > 0)
            .map(row => ({ id: String(row.ID ?? ''), key: String(row.Key ?? '') })),
    };
}
