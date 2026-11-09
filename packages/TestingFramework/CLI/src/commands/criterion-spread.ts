export interface CriterionSpread {
    Key: string;
    Scores: number[];
    Spread: number;
}

/** Max-minus-min of each criterion's normalized score across repeats. A criterion seen once is left out. */
export function CriterionSpreads(repeats: { oracleResults?: { oracleType?: string; type?: string; Name?: string; details?: unknown; Details?: unknown }[] | null }[]): CriterionSpread[] {
    const byKey = new Map<string, number[]>();
    for (const repeat of repeats) {
        for (const [key, score] of criteriaOf(repeat.oracleResults ?? [])) {
            const scores = byKey.get(key) ?? [];
            scores.push(score);
            byKey.set(key, scores);
        }
    }
    return [...byKey.entries()]
        .filter(([, scores]) => scores.length >= 2)
        .map(([key, scores]) => ({ Key: key, Scores: scores, Spread: Math.max(...scores) - Math.min(...scores) }))
        .sort((left, right) => right.Spread - left.Spread || left.Key.localeCompare(right.Key));
}

function criteriaOf(oracles: { oracleType?: string; type?: string; Name?: string; details?: unknown; Details?: unknown }[]): [string, number][] {
    const rubric = oracles.find(oracle => kind(oracle) === 'rubric' && criteria(oracle).length > 0)
        ?? oracles.find(oracle => kind(oracle).includes('judge') && criteria(oracle).length > 0);
    if (!rubric) return [];
    return criteria(rubric).flatMap((row, index) => {
        const score = row.NormalizedScore ?? row.normalizedScore;
        if (typeof score !== 'number' || !Number.isFinite(score)) return [];
        return [[String(row.Key ?? row.key ?? `c${index}`), score] as [string, number]];
    });
}

function criteria(oracle: { details?: unknown; Details?: unknown }): Record<string, unknown>[] {
    const details = oracle.details ?? oracle.Details;
    if (!details || typeof details !== 'object') return [];
    const rows = (details as { Criteria?: unknown }).Criteria;
    return Array.isArray(rows) ? rows.filter(row => row && typeof row === 'object') as Record<string, unknown>[] : [];
}

function kind(oracle: { oracleType?: string; type?: string; Name?: string }): string {
    return String(oracle.oracleType ?? oracle.type ?? oracle.Name ?? '').toLowerCase();
}
