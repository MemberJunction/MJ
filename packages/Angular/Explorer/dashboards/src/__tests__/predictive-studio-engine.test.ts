import { describe, it, expect } from 'vitest';
import { computeBestLevels, RankingRow, RECOMMENDATION_RANK } from '../PredictiveStudio/engine/predictive-studio.engine';

/**
 * Tests for the Predictive Studio ranking-matrix reducer that drives the Algorithm Catalog
 * "Guide me" picker. The reducer must pick each algorithm's BEST recommendation level across the
 * selected scenarios (max by rank) — exactly mirroring the seeded MJ: ML Algorithm Use Case Rankings
 * matrix from plans/predictive-studio.md §4.1.2.
 */

const XGB = 'algo-xgboost';
const LOGREG = 'algo-logreg';
const MLP = 'algo-mlp';

const BINARY = 'uc-binary';
const INTERP = 'uc-interpret';
const EMBED = 'uc-embedding';

// Subset of the seed matrix.
const rankings: RankingRow[] = [
  { MLAlgorithmID: XGB, MLAlgorithmUseCaseID: BINARY, RecommendationLevel: 'Primary' },
  { MLAlgorithmID: XGB, MLAlgorithmUseCaseID: INTERP, RecommendationLevel: 'Weak' },
  { MLAlgorithmID: XGB, MLAlgorithmUseCaseID: EMBED, RecommendationLevel: 'Strong' },
  { MLAlgorithmID: LOGREG, MLAlgorithmUseCaseID: BINARY, RecommendationLevel: 'Viable' },
  { MLAlgorithmID: LOGREG, MLAlgorithmUseCaseID: INTERP, RecommendationLevel: 'Primary' },
  { MLAlgorithmID: MLP, MLAlgorithmUseCaseID: EMBED, RecommendationLevel: 'Primary' },
  { MLAlgorithmID: MLP, MLAlgorithmUseCaseID: BINARY, RecommendationLevel: 'Viable' },
];

describe('RECOMMENDATION_RANK', () => {
  it('orders levels weakest → strongest', () => {
    expect(RECOMMENDATION_RANK.NotRecommended).toBeLessThan(RECOMMENDATION_RANK.Weak);
    expect(RECOMMENDATION_RANK.Weak).toBeLessThan(RECOMMENDATION_RANK.Viable);
    expect(RECOMMENDATION_RANK.Viable).toBeLessThan(RECOMMENDATION_RANK.Strong);
    expect(RECOMMENDATION_RANK.Strong).toBeLessThan(RECOMMENDATION_RANK.Primary);
  });
});

describe('computeBestLevels', () => {
  it('returns an empty map when no scenarios are selected', () => {
    expect(computeBestLevels(rankings, []).size).toBe(0);
  });

  it('returns each algorithm level for a single scenario', () => {
    const result = computeBestLevels(rankings, [BINARY]);
    expect(result.get(XGB)).toBe('Primary');
    expect(result.get(LOGREG)).toBe('Viable');
    expect(result.get(MLP)).toBe('Viable');
  });

  it('takes the BEST level across multiple scenarios (max by rank)', () => {
    // XGB: Primary(binary) vs Weak(interp) → Primary
    // LOGREG: Viable(binary) vs Primary(interp) → Primary
    const result = computeBestLevels(rankings, [BINARY, INTERP]);
    expect(result.get(XGB)).toBe('Primary');
    expect(result.get(LOGREG)).toBe('Primary');
  });

  it('omits algorithms with no ranking row for the selected scenarios', () => {
    // Only EMBED selected → LOGREG has no EMBED row.
    const result = computeBestLevels(rankings, [EMBED]);
    expect(result.has(LOGREG)).toBe(false);
    expect(result.get(MLP)).toBe('Primary');
    expect(result.get(XGB)).toBe('Strong');
  });

  it('is case-insensitive on use-case IDs (UUID skew tolerance)', () => {
    const result = computeBestLevels(rankings, [BINARY.toUpperCase()]);
    expect(result.get(XGB)).toBe('Primary');
  });
});
