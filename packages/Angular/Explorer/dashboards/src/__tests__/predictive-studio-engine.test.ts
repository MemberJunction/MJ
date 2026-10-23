import { describe, it, expect } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import { ComputeBestLevels, PredictiveStudioEngine, RankingRow, RECOMMENDATION_RANK, type PSRunDetailRow } from '../PredictiveStudio/engine/predictive-studio.engine';

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
    expect(ComputeBestLevels(rankings, []).size).toBe(0);
  });

  it('returns each algorithm level for a single scenario', () => {
    const result = ComputeBestLevels(rankings, [BINARY]);
    expect(result.get(XGB)).toBe('Primary');
    expect(result.get(LOGREG)).toBe('Viable');
    expect(result.get(MLP)).toBe('Viable');
  });

  it('takes the BEST level across multiple scenarios (max by rank)', () => {
    // XGB: Primary(binary) vs Weak(interp) → Primary
    // LOGREG: Viable(binary) vs Primary(interp) → Primary
    const result = ComputeBestLevels(rankings, [BINARY, INTERP]);
    expect(result.get(XGB)).toBe('Primary');
    expect(result.get(LOGREG)).toBe('Primary');
  });

  it('omits algorithms with no ranking row for the selected scenarios', () => {
    // Only EMBED selected → LOGREG has no EMBED row.
    const result = ComputeBestLevels(rankings, [EMBED]);
    expect(result.has(LOGREG)).toBe(false);
    expect(result.get(MLP)).toBe('Primary');
    expect(result.get(XGB)).toBe('Strong');
  });

  it('is case-insensitive on use-case IDs (UUID skew tolerance)', () => {
    const result = ComputeBestLevels(rankings, [BINARY.toUpperCase()]);
    expect(result.get(XGB)).toBe('Primary');
  });
});

/** Serves `total` run-detail rows one keyset page at a time; records every page request. */
class PagedDetailProvider {
  public readonly Requests: RunViewParams[] = [];
  constructor(private readonly total: number) {}

  public EntityByName(_name: string): EntityInfo {
    // Test double: the keyset cursor reads only the primary-key list.
    return { PrimaryKeys: [{ Name: 'ID' }] } as unknown as EntityInfo;
  }

  public async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
    this.Requests.push(params);
    const after = params.AfterKey ? Number(params.AfterKey.KeyValuePairs[0].Value) : 0;
    const count = Math.max(0, Math.min(params.MaxRows ?? this.total, this.total - after));
    const rows: PSRunDetailRow[] = Array.from({ length: count }, (_, i) => {
      const n = after + i + 1;
      return { ID: String(n), RecordID: `r${n}`, ResultPayload: '{}', Status: 'Succeeded', CompletedAt: null, __mj_CreatedAt: new Date(0) };
    });
    return { Success: true, Results: rows as T[], RowCount: rows.length, TotalRowCount: this.total, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
  }
}

describe('PredictiveStudioEngine.LoadRunDetails', () => {
  const load = (provider: PagedDetailProvider) =>
    // Test double: LoadRunDetails reads only EntityByName and RunView from the provider.
    PredictiveStudioEngine.Instance.LoadRunDetails('run-1', provider as unknown as IMetadataProvider, undefined);

  it('reads every row of a run larger than one page, not a fixed cap', async () => {
    const provider = new PagedDetailProvider(2500);
    const read = await load(provider);
    expect(read?.Rows).toHaveLength(2500);
    expect(read?.Capped).toBe(false);
    expect(provider.Requests).toHaveLength(3);
  });

  it('stops at MaxRunDetailRows and reports the read as capped', async () => {
    const provider = new PagedDetailProvider(PredictiveStudioEngine.MaxRunDetailRows + 10);
    const read = await load(provider);
    expect(read?.Rows).toHaveLength(PredictiveStudioEngine.MaxRunDetailRows);
    expect(read?.Capped).toBe(true);
  });
});
