import type { OracleResult } from '@memberjunction/testing-engine-base';

/** Rank a scale's levels by sequence into indexes 0..n-1. n is every level on the scale. */
export function rankLevels(levels: { id: string; scaleId: string; sequence: number }[]): { indexByLevel: Map<string, number>; countByScale: Map<string, number> } {
    const byScale = new Map<string, { id: string; sequence: number }[]>();
    for (const level of levels) {
        const list = byScale.get(level.scaleId) ?? [];
        list.push(level);
        byScale.set(level.scaleId, list);
    }
    const indexByLevel = new Map<string, number>();
    const countByScale = new Map<string, number>();
    for (const [scaleId, list] of byScale) {
        const ordered = [...list].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
        countByScale.set(scaleId, ordered.length);
        ordered.forEach((level, index) => indexByLevel.set(level.id, index));
    }
    return { indexByLevel, countByScale };
}

/** Pair submitted human and AI scores. Criterion identity is the criterion Key. Level indexes are ranked, not the stored sequence. */
export function calibrationPairs(input: {
    evaluations: { id: string; subjectId: string; versionId: string; evaluatorType: string; status: string }[];
    versions: { id: string; major: number }[];
    scores: { evaluationId: string; criterionId: string; normalizedScore: number | null; scaleLevelId: string | null }[];
    levels: { id: string; scaleId: string; sequence: number }[];
    criteria: { id: string; key: string }[];
}): CalibrationPair[] {
    const majorByVersion = new Map(input.versions.map(row => [row.id, row.major]));
    const keyByCriterion = new Map(input.criteria.map(row => [row.id, row.key || row.id]));
    const levelById = new Map(input.levels.map(level => [level.id, level]));
    const { indexByLevel, countByScale } = rankLevels(input.levels);
    const buckets = new Map<string, { subjectId: string; criterionId: string; major: number; human?: { level: number; score: number; categories: number }; ai?: { level: number; score: number; categories: number } }>();
    for (const score of input.scores) {
        if (score.normalizedScore == null) continue;
        const evaluation = input.evaluations.find(row => row.id === score.evaluationId);
        if (!evaluation || evaluation.status !== 'Submitted') continue;
        const side = evaluation.evaluatorType === 'Human' ? 'human' : (evaluation.evaluatorType === 'AIPrompt' || evaluation.evaluatorType === 'Agent') ? 'ai' : null;
        if (!side) continue;
        const criterionId = keyByCriterion.get(score.criterionId) || score.criterionId;
        if (!criterionId) continue;
        const major = majorByVersion.get(evaluation.versionId) ?? 0;
        const id = `${evaluation.subjectId}|${major}|${criterionId}`;
        const bucket = buckets.get(id) ?? { subjectId: evaluation.subjectId, criterionId, major };
        const levelRow = score.scaleLevelId == null ? undefined : levelById.get(score.scaleLevelId);
        const level = levelRow ? (indexByLevel.get(levelRow.id) ?? 0) : (score.normalizedScore >= 0.5 ? 1 : 0);
        const categories = levelRow ? Math.max(2, countByScale.get(levelRow.scaleId) ?? 2) : 2;
        bucket[side] = { level, score: score.normalizedScore, categories };
        buckets.set(id, bucket);
    }
    const pairs: CalibrationPair[] = [];
    for (const bucket of buckets.values()) {
        if (!bucket.human || !bucket.ai) continue;
        pairs.push({
            subjectId: bucket.subjectId,
            criterionId: bucket.criterionId,
            humanLevel: bucket.human.level,
            aiLevel: bucket.ai.level,
            categoryCount: Math.max(bucket.human.categories, bucket.ai.categories),
            humanScore: bucket.human.score,
            aiScore: bucket.ai.score,
            major: bucket.major,
        });
    }
    return pairs;
}

export interface CalibrationPair {
    subjectId: string;
    criterionId: string;
    /** Level index, 0 .. categoryCount-1. */
    humanLevel: number;
    aiLevel: number;
    categoryCount: number;
    humanScore: number;
    aiScore: number;
    /** Rubric major. A pair is only kept when the human and AI evaluations share it. */
    major: number;
}

export interface CalibrationThresholds {
    minWeightedKappa?: number;
    maxMeanAbsoluteError?: number;
    minExactAgreement?: number;
}

export interface CalibrationExpectation extends CalibrationThresholds {
    perCriterion?: Record<string, CalibrationThresholds>;
}

export interface CriterionAgreement {
    criterionId: string;
    sampleSize: number;
    exactAgreement: number;
    meanAbsoluteError: number;
    weightedKappa: number;
}

/** Quadratic-weighted Cohen's kappa. Returns null when there are no paired ratings or fewer than two levels. */
export function quadraticWeightedKappa(humanLevels: number[], aiLevels: number[], categoryCount: number): number | null {
    const count = Math.min(humanLevels.length, aiLevels.length);
    if (count === 0 || categoryCount < 2) return null;
    const observed = Array.from({ length: categoryCount }, () => Array(categoryCount).fill(0));
    for (let index = 0; index < count; index++) {
        const human = humanLevels[index];
        const ai = aiLevels[index];
        if (human < 0 || ai < 0 || human >= categoryCount || ai >= categoryCount) continue;
        observed[human][ai] += 1;
    }
    const rowTotals = observed.map(row => row.reduce((sum, value) => sum + value, 0));
    const columnTotals = Array(categoryCount).fill(0);
    for (let row = 0; row < categoryCount; row++) {
        for (let column = 0; column < categoryCount; column++) columnTotals[column] += observed[row][column];
    }
    const total = rowTotals.reduce((sum, value) => sum + value, 0);
    if (total === 0) return null;
    const denominator = (categoryCount - 1) ** 2;
    let weightedObserved = 0;
    let weightedExpected = 0;
    for (let row = 0; row < categoryCount; row++) {
        for (let column = 0; column < categoryCount; column++) {
            const weight = denominator === 0 ? 0 : ((row - column) ** 2) / denominator;
            weightedObserved += weight * observed[row][column];
            weightedExpected += weight * (rowTotals[row] * columnTotals[column] / total);
        }
    }
    if (weightedExpected === 0) return 1;
    return 1 - weightedObserved / weightedExpected;
}

/** One agreement record per criterion. Subjects that do not have both a human and an AI score are left out. */
export function agreementByCriterion(pairs: CalibrationPair[]): CriterionAgreement[] {
    const groups = new Map<string, CalibrationPair[]>();
    for (const pair of pairs) {
        const list = groups.get(pair.criterionId) ?? [];
        list.push(pair);
        groups.set(pair.criterionId, list);
    }
    return [...groups.entries()].map(([criterionId, rows]) => {
        const sampleSize = rows.length;
        const exactAgreement = rows.filter(row => row.humanLevel === row.aiLevel).length / sampleSize;
        const meanAbsoluteError = rows.reduce((sum, row) => sum + Math.abs(row.humanScore - row.aiScore), 0) / sampleSize;
        const categoryCount = Math.max(...rows.map(row => row.categoryCount));
        const weightedKappa = quadraticWeightedKappa(rows.map(row => row.humanLevel), rows.map(row => row.aiLevel), categoryCount) ?? 0;
        return { criterionId, sampleSize, exactAgreement, meanAbsoluteError, weightedKappa };
    }).sort((left, right) => left.criterionId.localeCompare(right.criterionId));
}

export function clampScore(kappa: number): number {
    if (!Number.isFinite(kappa)) return 0;
    return Math.min(1, Math.max(0, kappa));
}

/**
 * One oracle per criterion and one overall. The test score is the mean of the
 * per-criterion quadratic-weighted kappas, clamped to 0..1.
 */
export function calibrationOracles(pairs: CalibrationPair[], expected: CalibrationExpectation = {}): { score: number; oracles: OracleResult[] } {
    const criteria = agreementByCriterion(pairs);
    if (criteria.length === 0) {
        return {
            score: 0,
            oracles: [{ oracleType: 'rubric-calibration', passed: false, score: 0, message: 'No human and AI scores to compare.', details: { sampleSize: 0 } }],
        };
    }
    const overallKappa = criteria.reduce((sum, row) => sum + row.weightedKappa, 0) / criteria.length;
    const score = clampScore(overallKappa);
    const oracles = criteria.map(row => criterionOracle(row, expected.perCriterion?.[row.criterionId] ?? expected));
    oracles.push(overallOracle(criteria, overallKappa, score, expected));
    return { score, oracles };
}

function criterionOracle(row: CriterionAgreement, thresholds: CalibrationThresholds): OracleResult {
    const passed = meets(row, thresholds);
    return {
        oracleType: 'rubric-calibration',
        passed,
        score: clampScore(row.weightedKappa),
        message: `${row.criterionId}: kappa ${row.weightedKappa.toFixed(3)} (n=${row.sampleSize}), exact ${row.exactAgreement.toFixed(3)}, mae ${row.meanAbsoluteError.toFixed(3)}`,
        details: { ...row, scope: 'criterion' },
    };
}

function overallOracle(criteria: CriterionAgreement[], kappa: number, score: number, expected: CalibrationExpectation): OracleResult {
    const sampleSize = criteria.reduce((sum, row) => sum + row.sampleSize, 0);
    const exactAgreement = criteria.reduce((sum, row) => sum + row.exactAgreement, 0) / criteria.length;
    const meanAbsoluteError = criteria.reduce((sum, row) => sum + row.meanAbsoluteError, 0) / criteria.length;
    const passed = meets({ exactAgreement, meanAbsoluteError, weightedKappa: kappa }, expected);
    return {
        oracleType: 'rubric-calibration',
        passed,
        score,
        message: `overall: kappa ${kappa.toFixed(3)} (n=${sampleSize}), exact ${exactAgreement.toFixed(3)}, mae ${meanAbsoluteError.toFixed(3)}`,
        details: { scope: 'overall', sampleSize, exactAgreement, meanAbsoluteError, weightedKappa: kappa },
    };
}

function meets(row: { exactAgreement: number; meanAbsoluteError: number; weightedKappa: number }, thresholds: CalibrationThresholds): boolean {
    if (thresholds.minWeightedKappa != null && row.weightedKappa < thresholds.minWeightedKappa) return false;
    if (thresholds.maxMeanAbsoluteError != null && row.meanAbsoluteError > thresholds.maxMeanAbsoluteError) return false;
    if (thresholds.minExactAgreement != null && row.exactAgreement < thresholds.minExactAgreement) return false;
    return true;
}
