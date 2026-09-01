import { describe, it, expect } from 'vitest';
import type {
  DatasetStatistics,
  FeatureStatistics,
  ResolvedPropertyItem,
} from '@memberjunction/predictive-studio-core';

import { evaluateGates } from '../gates';

/**
 * The gates turn measurements into an admissibility verdict, reading the thresholds a component
 * type INHERITS rather than any hardcoded list. The invariants worth pinning: a gate that cannot
 * be checked is `Unevaluated` (never a silent pass), a failure explains itself in language a
 * business user can act on, and each result names the tree node that declared it — the node to
 * argue with.
 */

const MODEL_ROOT = 'type-model-root';
const NEURAL = 'type-neural';

function gate(itemKey: string, value: unknown, source = MODEL_ROOT): ResolvedPropertyItem {
  return { ItemKey: itemKey, Value: value, Rationale: null, SourceTypeID: source };
}

function feat(over: Partial<FeatureStatistics> = {}): FeatureStatistics {
  return {
    Name: 'tenure',
    Kind: 'numeric',
    MissingFraction: 0,
    DistinctCount: 40,
    CardinalityRatio: 0.4,
    TargetAssociation: 0.62,
    Hints: [],
    ...over,
  };
}

/**
 * Build a DatasetStatistics fixture. `RowsPerFeature` is DERIVED from the final row/feature counts
 * rather than accepted as an override, so a test that sets `RowCount` cannot accidentally leave the
 * ratio the gate reads pointing at the default.
 */
function stats(over: Partial<DatasetStatistics> = {}): DatasetStatistics {
  const features = over.Features ?? [feat(), feat({ Name: 'events' })];
  const rowCount = over.RowCount ?? 1000;
  return {
    EntityName: 'Members',
    Target: {
      Name: 'Renewed',
      ProblemType: 'classification',
      LabeledRowCount: 1000,
      Classes: [
        { Value: 'no', Count: 800, Fraction: 0.8 },
        { Value: 'yes', Count: 200, Fraction: 0.2 },
      ],
      MinorityFraction: 0.2,
    },
    Features: features,
    DescribedAt: '2026-09-01T00:00:00.000Z',
    Warnings: [],
    ...over,
    RowCount: rowCount,
    FeatureCount: features.length,
    RowsPerFeature: rowCount / features.length,
  };
}

const candidate = { ComponentTypeID: 'type-xgboost', ComponentTypeName: 'XGBoost' };
const run = (gates: ResolvedPropertyItem[], s = stats()) => evaluateGates(candidate, gates, s);

describe('evaluateGates — no gates', () => {
  it('is admissible but says plainly that nothing constrained it', () => {
    const report = run([]);
    expect(report.Admissible).toBe(true);
    expect(report.Gates).toEqual([]);
    expect(report.Summary).toContain('declares no statistical gates');
  });
});

describe('min-rows-per-feature', () => {
  const g = (threshold: number, source = MODEL_ROOT) =>
    gate('min-rows-per-feature', { Kind: 'min-rows-per-feature', Threshold: threshold }, source);

  it('passes with room to spare', () => {
    const report = run([g(5)]);
    expect(report.Admissible).toBe(true);
    expect(report.Gates[0]).toMatchObject({ Verdict: 'Passed', Observed: 500, Threshold: 5 });
  });

  it('fails and explains what to do about it', () => {
    const report = run([g(50)], stats({ RowCount: 40 }));
    expect(report.Admissible).toBe(false);
    expect(report.Gates[0].Verdict).toBe('Failed');
    expect(report.Gates[0].Message).toContain('memorizing');
    expect(report.Summary).toContain('NOT admissible');
  });

  it("names the tree node that declared it — Neural's Replace, not the root", () => {
    // The seeded tree has Neural REPLACE the Model root's floor of 5 with 50. The result must
    // point at Neural, so a user knows which node to argue with.
    const report = run([g(50, NEURAL)], stats({ RowCount: 60 }));
    expect(report.Gates[0].Verdict).toBe('Failed');
    expect(report.Gates[0].SourceTypeID).toBe(NEURAL);
  });

  it('is Unevaluated (not passed) when the row declares no threshold', () => {
    const report = run([gate('min-rows-per-feature', { Kind: 'min-rows-per-feature' })]);
    expect(report.Gates[0].Verdict).toBe('Unevaluated');
    // An unchecked gate must not fail the candidate, but must be visible.
    expect(report.Admissible).toBe(true);
    expect(report.Summary).toContain('could not be checked');
  });
});

describe('max-single-feature-share', () => {
  const g = gate('single-feature-dominance', { Kind: 'max-single-feature-share', Threshold: 0.6 });

  it('folds classification AUC onto a share scale before comparing', () => {
    // AUC 0.75 → share 0.5, under the 0.6 ceiling.
    const report = run([g], stats({ Features: [feat({ TargetAssociation: 0.75 })] }));
    expect(report.Gates[0]).toMatchObject({ Verdict: 'Passed', Observed: 0.5 });
  });

  it('fails on a dominant feature and names it', () => {
    // AUC 0.95 → share 0.9, over the ceiling.
    const report = run([g], stats({ Features: [feat({ Name: 'PaidInvoiceDate', TargetAssociation: 0.95 })] }));
    expect(report.Gates[0].Verdict).toBe('Failed');
    expect(report.Gates[0].Observed).toBeCloseTo(0.9, 4);
    expect(report.Gates[0].Message).toContain('PaidInvoiceDate');
    expect(report.Gates[0].Message).toContain('knowable at decision time');
  });

  it('uses |r| directly for regression, without folding', () => {
    const s = stats({
      Features: [feat({ TargetAssociation: 0.9 })],
      Target: { Name: 'Amount', ProblemType: 'regression', LabeledRowCount: 100 },
    });
    expect(run([g], s).Gates[0]).toMatchObject({ Verdict: 'Failed', Observed: 0.9 });
  });

  it('is Unevaluated when no feature has a measurable association (e.g. a multiclass target)', () => {
    const s = stats({ Features: [feat({ TargetAssociation: undefined })] });
    const report = run([g], s);
    expect(report.Gates[0].Verdict).toBe('Unevaluated');
    expect(report.Admissible).toBe(true);
  });
});

describe('requires-ordered-sequences', () => {
  const g = gate('requires-ordered-sequences', { Kind: 'requires-ordered-sequences', MinLength: 3 });

  it('fails plainly when the plan declares no ordering at all', () => {
    const report = run([g]);
    expect(report.Gates[0].Verdict).toBe('Failed');
    expect(report.Gates[0].Message).toContain('declares no ordering');
  });

  it('passes when the median sequence clears the minimum', () => {
    const s = stats({
      Sequence: { GroupField: 'MemberID', OrderField: 'Date', GroupCount: 120, MinLength: 1, MedianLength: 8, MaxLength: 40, ShortGroupFraction: 0.1 },
    });
    expect(run([g], s).Gates[0].Verdict).toBe('Passed');
  });

  it('fails when sequences are too short, quoting the short-group share', () => {
    const s = stats({
      Sequence: { GroupField: 'MemberID', OrderField: 'Date', GroupCount: 120, MinLength: 1, MedianLength: 2, MaxLength: 5, ShortGroupFraction: 0.62 },
    });
    const report = run([g], s);
    expect(report.Gates[0].Verdict).toBe('Failed');
    expect(report.Gates[0].Message).toContain('62%');
  });
});

describe('min-minority-fraction', () => {
  const g = gate('min-minority-fraction', { Kind: 'min-minority-fraction', Threshold: 0.1 });

  it('passes a reasonably balanced label', () => {
    expect(run([g]).Gates[0].Verdict).toBe('Passed');
  });

  it('fails a severely imbalanced one and warns about accuracy', () => {
    const s = stats({
      Target: {
        Name: 'Renewed',
        ProblemType: 'classification',
        LabeledRowCount: 1000,
        Classes: [
          { Value: 'no', Count: 970, Fraction: 0.97 },
          { Value: 'yes', Count: 30, Fraction: 0.03 },
        ],
        MinorityFraction: 0.03,
      },
    });
    const report = run([g], s);
    expect(report.Gates[0].Verdict).toBe('Failed');
    expect(report.Gates[0].Message).toContain('97% accurate');
    expect(report.Gates[0].Message).toContain('recall');
  });

  it('is Unevaluated for a regression target rather than failing it', () => {
    const s = stats({ Target: { Name: 'Amount', ProblemType: 'regression', LabeledRowCount: 100 } });
    const report = run([g], s);
    expect(report.Gates[0].Verdict).toBe('Unevaluated');
    expect(report.Admissible).toBe(true);
  });
});

describe('max-missing-fraction', () => {
  const g = gate('max-missing-fraction', { Kind: 'max-missing-fraction', Threshold: 0.5 });

  it('passes when every column is mostly present', () => {
    expect(run([g]).Gates[0].Verdict).toBe('Passed');
  });

  it('fails on the emptiest column and names it', () => {
    const s = stats({ Features: [feat(), feat({ Name: 'LastSurveyScore', MissingFraction: 0.83 })] });
    const report = run([g], s);
    expect(report.Gates[0].Verdict).toBe('Failed');
    expect(report.Gates[0].Message).toContain('LastSurveyScore');
    expect(report.Gates[0].Message).toContain('83%');
  });
});

describe('unknown and malformed gates', () => {
  it('reports an unknown kind as Unevaluated, never as a pass', () => {
    const report = run([gate('some-future-gate', { Kind: 'requires-quantum-supremacy', Threshold: 1 })]);
    expect(report.Gates[0].Verdict).toBe('Unevaluated');
    expect(report.Gates[0].Message).toContain('not implemented');
    expect(report.Gates[0].Message).toContain('unconfirmed');
    expect(report.Admissible).toBe(true);
  });

  it('degrades a malformed row to Unevaluated instead of throwing', () => {
    for (const bad of ['not-json-object', null, ['array'], 42, {}]) {
      const report = run([gate('broken', bad)]);
      expect(report.Gates[0].Verdict, JSON.stringify(bad)).toBe('Unevaluated');
    }
  });
});

describe('report aggregation', () => {
  it('is inadmissible as soon as ONE gate fails, whatever else passed', () => {
    const report = run([
      gate('min-rows-per-feature', { Kind: 'min-rows-per-feature', Threshold: 5 }),
      gate('min-minority-fraction', { Kind: 'min-minority-fraction', Threshold: 0.9 }),
    ]);
    expect(report.Gates.filter((g) => g.Verdict === 'Passed')).toHaveLength(1);
    expect(report.Admissible).toBe(false);
    expect(report.Summary).toContain('min-minority-fraction');
  });

  it('summarizes a clean sweep', () => {
    const report = run([
      gate('min-rows-per-feature', { Kind: 'min-rows-per-feature', Threshold: 5 }),
      gate('min-minority-fraction', { Kind: 'min-minority-fraction', Threshold: 0.1 }),
    ]);
    expect(report.Admissible).toBe(true);
    expect(report.Summary).toBe('XGBoost passed all 2 gates.');
  });
});
