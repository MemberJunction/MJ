import type { OracleResult } from '@memberjunction/testing-engine-base';

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
