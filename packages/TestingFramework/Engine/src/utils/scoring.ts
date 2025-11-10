/**
 * @fileoverview Scoring utilities for test evaluation
 * @module @memberjunction/testing-engine
 */

import { OracleResult, ScoringWeights } from '../types';

/**
 * Calculate weighted score from oracle results.
 *
 * @param oracleResults - Results from oracle evaluations
 * @param weights - Scoring weights by oracle type
 * @returns Weighted score from 0.0 to 1.0
 */
export function calculateWeightedScore(
    oracleResults: OracleResult[],
    weights?: ScoringWeights
): number {
    if (oracleResults.length === 0) {
        return 0;
    }

    if (!weights) {
        // Simple average if no weights provided
        const sum = oracleResults.reduce((acc, r) => acc + r.score, 0);
        return sum / oracleResults.length;
    }

    // Weighted average
    let weightedSum = 0;
    let totalWeight = 0;

    for (const result of oracleResults) {
        const weight = weights[result.oracleType] || 0;
        weightedSum += result.score * weight;
        totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate simple average score from oracle results.
 *
 * @param oracleResults - Results from oracle evaluations
 * @returns Average score from 0.0 to 1.0
 */
export function calculateAverageScore(oracleResults: OracleResult[]): number {
    if (oracleResults.length === 0) {
        return 0;
    }

    const sum = oracleResults.reduce((acc, r) => acc + r.score, 0);
    return sum / oracleResults.length;
}

/**
 * Calculate pass rate from oracle results.
 *
 * @param oracleResults - Results from oracle evaluations
 * @returns Pass rate from 0.0 to 1.0
 */
export function calculatePassRate(oracleResults: OracleResult[]): number {
    if (oracleResults.length === 0) {
        return 0;
    }

    const passedCount = oracleResults.filter(r => r.passed).length;
    return passedCount / oracleResults.length;
}

/**
 * Determine overall test status from oracle results.
 *
 * Test passes only if ALL oracles pass.
 *
 * @param oracleResults - Results from oracle evaluations
 * @returns 'Passed' if all oracles passed, 'Failed' otherwise
 */
export function determineTestStatus(oracleResults: OracleResult[]): 'Passed' | 'Failed' {
    if (oracleResults.length === 0) {
        return 'Failed';
    }

    return oracleResults.every(r => r.passed) ? 'Passed' : 'Failed';
}

/**
 * Group oracle results by type.
 *
 * @param oracleResults - Results from oracle evaluations
 * @returns Map of oracle type to results
 */
export function groupResultsByType(
    oracleResults: OracleResult[]
): Map<string, OracleResult[]> {
    const grouped = new Map<string, OracleResult[]>();

    for (const result of oracleResults) {
        const existing = grouped.get(result.oracleType) || [];
        existing.push(result);
        grouped.set(result.oracleType, existing);
    }

    return grouped;
}

/**
 * Calculate score distribution statistics.
 *
 * @param oracleResults - Results from oracle evaluations
 * @returns Score statistics
 */
export function calculateScoreStatistics(oracleResults: OracleResult[]): {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
} {
    if (oracleResults.length === 0) {
        return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 };
    }

    const scores = oracleResults.map(r => r.score).sort((a, b) => a - b);

    const min = scores[0];
    const max = scores[scores.length - 1];
    const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    const median = scores.length % 2 === 0
        ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
        : scores[Math.floor(scores.length / 2)];

    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    return { min, max, mean, median, stdDev };
}

/**
 * Normalize scores to 0-1 range.
 *
 * @param oracleResults - Results from oracle evaluations
 * @returns Normalized results
 */
export function normalizeScores(oracleResults: OracleResult[]): OracleResult[] {
    if (oracleResults.length === 0) {
        return [];
    }

    const scores = oracleResults.map(r => r.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min;

    if (range === 0) {
        // All scores are the same
        return oracleResults.map(r => ({ ...r, score: 1.0 }));
    }

    return oracleResults.map(r => ({
        ...r,
        score: (r.score - min) / range
    }));
}
