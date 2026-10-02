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
