import { describe, it, expect } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type {
  DescribeRequest,
  DescribeResponse,
  SourceBinding,
  FeatureStepGraph,
  ValidationStrategy,
} from '@memberjunction/predictive-studio-core';

import { StatisticsPass, runStatisticsPassBestEffort, correlationLookup, toFeatureStatistics, toTargetStatistics } from '../statistics-pass';
import type { ISidecarDescriber, StatisticsDeps } from '../seams';
import { FeatureAssemblyExecutor, type FeatureAssemblyParams } from '../../feature-assembly';
import type { IFeatureDataAccess, FetchRowsParams, FetchRowsResult, SourceRow } from '../../feature-assembly';

/**
 * The pre-pass's whole value depends on describing exactly what the model will train on — no more,
 * no less. The load-bearing test here is the holdout one: if the pass ever described the locked
 * holdout, `MLModel.HoldoutMetrics` would stop being the honest number the validation discipline
 * rests on, and nothing else in the system would notice.
 */

const STEPS: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['tenure', 'events'] }] };
const SOURCES: SourceBinding[] = [{ Kind: 'Entity', Ref: 'Members' }];

/** 100 members, ordered — so a positional holdout carve is checkable by value. */
function members(n = 100): SourceRow[] {
  return Array.from({ length: n }, (_, i) => ({
    ID: `m${i}`,
    tenure: i,
    events: i % 7,
    Renewed: i % 2,
  }));
}

class InMemoryDataAccess implements IFeatureDataAccess {
  constructor(private readonly rows: SourceRow[]) {}
  async fetchRows(_p: FetchRowsParams): Promise<FetchRowsResult> {
    return { Success: true, Rows: this.rows };
  }
  async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

class TestAssembler extends FeatureAssemblyExecutor {
  constructor(private readonly dataAccess: IFeatureDataAccess) {
    super();
  }
  public override assemble(params: Parameters<FeatureAssemblyExecutor['assemble']>[0]) {
    return super.assemble({ ...params, dataAccess: this.dataAccess });
  }
}

/** Captures the request and returns a canned description sized to what it was sent. */
class CapturingDescriber implements ISidecarDescriber {
  public Requests: DescribeRequest[] = [];
  constructor(private readonly build: (req: DescribeRequest) => DescribeResponse = defaultResponse) {}
  async describe(req: DescribeRequest): Promise<DescribeResponse> {
    this.Requests.push(req);
    return this.build(req);
  }
}

function defaultResponse(req: DescribeRequest): DescribeResponse {
  return {
    row_count: req.data.rows.length,
    feature_count: req.feature_schema.length,
    target: {
      name: req.target,
      labeled_row_count: req.data.rows.length,
      classes: [
        { value: '0', count: Math.ceil(req.data.rows.length / 2) },
        { value: '1', count: Math.floor(req.data.rows.length / 2) },
      ],
    },
    features: req.feature_schema.map((f, i) => ({
      name: f.Name,
      kind: f.Kind,
      missing_fraction: 0,
      distinct_count: 10 + i,
      numeric: { mean: 1, std: 1, min: 0, max: 2, quartiles: [0.5, 1, 1.5] },
      target_association: 0.6,
    })),
    duration_sec: 0.01,
    warnings: [],
  };
}

const VALIDATION: ValidationStrategy = { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 };

const DEPS = (describer: ISidecarDescriber): StatisticsDeps => ({
  describer,
  contextUser: undefined as unknown as UserInfo,
  provider: undefined as unknown as IMetadataProvider,
});

function assemblyParams(over: Partial<FeatureAssemblyParams> = {}): FeatureAssemblyParams {
  return {
    targetEntityName: 'Members',
    recordSet: { EntityName: 'Members' },
    sources: SOURCES,
    steps: STEPS,
    asOf: { Mode: 'none' },
    leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 0.6 },
    targetVariable: 'Renewed',
    primaryKeyField: 'ID',
    context: 'train',
    ...over,
  };
}

function buildPass(rows = members()) {
  return new StatisticsPass(new TestAssembler(new InMemoryDataAccess(rows)));
}

describe('StatisticsPass — the honest-holdout rule', () => {
  it('describes ONLY the training partition, never the locked holdout', async () => {
    const describer = new CapturingDescriber();
    await buildPass().run({ assembly: assemblyParams(), validation: VALIDATION, problemType: 'classification' }, DEPS(describer));

    const sent = describer.Requests[0];
    // 100 rows, 20% locked holdout → 80 described.
    expect(sent.data.rows.length).toBe(80);

    // And it is the LEADING 80 — the same positional slice TrainingEngine trains on, so the two
    // cannot disagree about which rows the holdout is.
    const tenureIdx = sent.data.columns.indexOf('tenure');
    expect(sent.data.rows[0][tenureIdx]).toBe(0);
    expect(sent.data.rows[79][tenureIdx]).toBe(79);
  });

  it('describes everything when no holdout is configured', async () => {
    const describer = new CapturingDescriber();
    await buildPass().run(
      { assembly: assemblyParams(), validation: { ...VALIDATION, LockedHoldoutFraction: 0 }, problemType: 'classification' },
      DEPS(describer),
    );
    expect(describer.Requests[0].data.rows.length).toBe(100);
  });

  it('assembles through the SAME executor path, so the described matrix is the real one', async () => {
    const describer = new CapturingDescriber();
    await buildPass().run({ assembly: assemblyParams(), validation: VALIDATION, problemType: 'classification' }, DEPS(describer));
    expect(describer.Requests[0].feature_schema.map((f) => f.Name)).toEqual(['tenure', 'events']);
    expect(describer.Requests[0].target).toBe('Renewed');
  });
});

describe('StatisticsPass — the produced statistics', () => {
  it('folds measurements into DatasetStatistics with hints attached', async () => {
    const stats = await buildPass().run(
      { assembly: assemblyParams(), validation: VALIDATION, problemType: 'classification' },
      DEPS(new CapturingDescriber()),
    );

    expect(stats.EntityName).toBe('Members');
    expect(stats.RowCount).toBe(80);
    expect(stats.FeatureCount).toBe(2);
    expect(stats.RowsPerFeature).toBe(40);
    expect(stats.Features.map((f) => f.Name)).toEqual(['tenure', 'events']);
    expect(stats.Target.ProblemType).toBe('classification');
    expect(stats.Target.MinorityFraction).toBeCloseTo(0.5, 6);
    expect(new Date(stats.DescribedAt).toString()).not.toBe('Invalid Date');
  });

  it('never reports Infinity rows-per-feature when a plan has no features', async () => {
    const describer = new CapturingDescriber((req) => ({ ...defaultResponse(req), features: [], feature_count: 0 }));
    const stats = await buildPass().run(
      { assembly: assemblyParams(), validation: VALIDATION, problemType: 'classification' },
      DEPS(describer),
    );
    // A gate message reading "Infinity rows per feature" would be worse than useless to a user.
    expect(stats.RowsPerFeature).toBe(0);
  });

  it('carries the sidecar warnings through rather than dropping them', async () => {
    const describer = new CapturingDescriber((req) => ({ ...defaultResponse(req), warnings: ["feature 'ghost' is not in data"] }));
    const stats = await buildPass().run(
      { assembly: assemblyParams(), validation: VALIDATION, problemType: 'classification' },
      DEPS(describer),
    );
    expect(stats.Warnings).toEqual(["feature 'ghost' is not in data"]);
  });

  it('requests correlations only when asked, and turns them into collinear hints', async () => {
    const withCorr = new CapturingDescriber((req) => ({ ...defaultResponse(req), correlations: { 'tenure|events': 0.99 } }));
    const stats = await buildPass().run(
      { assembly: assemblyParams(), validation: VALIDATION, problemType: 'classification', includeCorrelations: true },
      DEPS(withCorr),
    );
    expect(withCorr.Requests[0].include_correlations).toBe(true);
    expect(stats.Features[0].Hints.map((h) => h.Hint)).toContain('collinear');
    expect(stats.Features[1].Hints[0].RelatedFeature).toBe('tenure');

    const without = new CapturingDescriber();
    await buildPass().run({ assembly: assemblyParams(), validation: VALIDATION, problemType: 'classification' }, DEPS(without));
    expect(without.Requests[0].include_correlations).toBeUndefined();
  });

  it('rejects assembly params with no target rather than describing against nothing', async () => {
    await expect(
      buildPass().run(
        { assembly: assemblyParams({ targetVariable: undefined }), validation: VALIDATION, problemType: 'classification' },
        DEPS(new CapturingDescriber()),
      ),
    ).rejects.toThrow(/targetVariable/);
  });
});

describe('toFeatureStatistics', () => {
  const base = { name: 'x', kind: 'numeric', missing_fraction: 0, distinct_count: 10 };

  it('computes the cardinality ratio over NON-NULL rows', () => {
    // 100 rows, half missing, 50 distinct → distinct in every row it actually has. That is an
    // identifier, and dividing by the full row count (giving 0.5) would hide it.
    const f = toFeatureStatistics({ ...base, missing_fraction: 0.5, distinct_count: 50 }, 100);
    expect(f.CardinalityRatio).toBe(1);
    expect(f.Hints.map((h) => h.Hint)).toContain('id-like');
  });

  it('is 0 rather than NaN when a column is entirely missing', () => {
    const f = toFeatureStatistics({ ...base, missing_fraction: 1, distinct_count: 0 }, 100);
    expect(f.CardinalityRatio).toBe(0);
  });

  it("prefers the assembler's declared kind over the sidecar's echo", () => {
    const f = toFeatureStatistics({ ...base, kind: 'numeric', distinct_count: 200 }, 1000, 'categorical');
    expect(f.Kind).toBe('categorical');
    // …which is what makes the high-cardinality rule apply at all.
    expect(f.Hints.map((h) => h.Hint)).toContain('high-cardinality');
  });

  it('maps an unknown kind to numeric rather than propagating it', () => {
    expect(toFeatureStatistics({ ...base, kind: 'something-new' }, 100).Kind).toBe('numeric');
  });
});

describe('toTargetStatistics', () => {
  it('reports the SMALLEST class as the minority, whichever label it carries', () => {
    const t = toTargetStatistics(
      {
        row_count: 1000,
        feature_count: 0,
        target: { name: 'Renewed', labeled_row_count: 1000, classes: [{ value: 'no', count: 970 }, { value: 'yes', count: 30 }] },
        features: [],
        duration_sec: 0,
        warnings: [],
      },
      'classification',
    );
    expect(t.MinorityFraction).toBeCloseTo(0.03, 6);
    expect(t.Classes?.map((c) => c.Value)).toEqual(['no', 'yes']);
  });

  it('leaves MinorityFraction absent for a regression target', () => {
    const t = toTargetStatistics(
      {
        row_count: 100,
        feature_count: 0,
        target: { name: 'Amount', labeled_row_count: 100, numeric: { mean: 5, std: 2, min: 0, max: 10, quartiles: [3, 5, 7] } },
        features: [],
        duration_sec: 0,
        warnings: [],
      },
      'regression',
    );
    expect(t.MinorityFraction).toBeUndefined();
    expect(t.Numeric?.Quartiles).toEqual([3, 5, 7]);
  });
});

describe('correlationLookup', () => {
  it('is order-insensitive, since the two sides key pairs independently', () => {
    const lookup = correlationLookup({ 'a|b': 0.9 });
    expect(lookup('a', 'b')).toBe(0.9);
    expect(lookup('b', 'a')).toBe(0.9);
    expect(lookup('a', 'c')).toBeNull();
  });
});

describe('runStatisticsPassBestEffort', () => {
  it('returns null instead of throwing, so a failed pre-pass degrades the decision rather than killing the session', async () => {
    const exploding: ISidecarDescriber = {
      describe: async () => {
        throw new Error('sidecar unreachable');
      },
    };
    const result = await runStatisticsPassBestEffort(
      buildPass(),
      { assembly: assemblyParams(), validation: VALIDATION, problemType: 'classification' },
      DEPS(exploding),
    );
    expect(result).toBeNull();
  });

  it('returns the statistics on the happy path', async () => {
    const result = await runStatisticsPassBestEffort(
      buildPass(),
      { assembly: assemblyParams(), validation: VALIDATION, problemType: 'classification' },
      DEPS(new CapturingDescriber()),
    );
    expect(result?.RowCount).toBe(80);
  });
});
