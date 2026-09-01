import { describe, it, expect } from 'vitest';
import {
  deriveFeatureHints,
  addCollinearityHints,
  FEATURE_HINT_THRESHOLDS,
  type FeatureHintInput,
  type FeatureStatistics,
} from '../statistics-spec';

/**
 * The hints are what a business user actually reads, and what the Architect acts on. Every one is a
 * threshold over a measured quantity, so these tests pin both halves: that the rule fires where it
 * should, and that the evidence it carries (value + threshold) is the number that fired it.
 */

function feature(overrides: Partial<FeatureHintInput> = {}): FeatureHintInput {
  return {
    Name: 'tenure',
    Kind: 'numeric',
    MissingFraction: 0,
    DistinctCount: 50,
    CardinalityRatio: 0.5,
    TargetAssociation: 0.62,
    ...overrides,
  };
}

const hintNames = (f: FeatureHintInput) => deriveFeatureHints(f).map((h) => h.Hint);

describe('deriveFeatureHints', () => {
  it('flags nothing on an ordinary feature', () => {
    expect(deriveFeatureHints(feature())).toEqual([]);
  });

  it('short-circuits on a constant column instead of burying it in other hints', () => {
    // A single-valued column trivially trips id-like/association rules too; reporting all of them
    // would hide the one that matters.
    const hints = deriveFeatureHints(feature({ DistinctCount: 1, CardinalityRatio: 0.001, MissingFraction: 0.9 }));
    expect(hints.map((h) => h.Hint)).toEqual(['constant']);
    expect(hints[0].Message).toContain('same value in every row');
  });

  it('calls a near-perfect association a duplicate of the target, not just dominance', () => {
    const hints = deriveFeatureHints(feature({ TargetAssociation: 0.99 }));
    expect(hints.map((h) => h.Hint)).toEqual(['near-duplicate-of-target']);
    expect(hints[0].Value).toBe(0.99);
    expect(hints[0].Threshold).toBe(FEATURE_HINT_THRESHOLDS.NearDuplicateAssociation);
  });

  it('calls a strong-but-not-perfect association dominance', () => {
    expect(hintNames(feature({ TargetAssociation: 0.93 }))).toEqual(['leakage-dominance']);
  });

  it('never reports both duplicate and dominance for the same feature', () => {
    for (const a of [0.9, 0.95, 0.98, 1.0]) {
      const names = hintNames(feature({ TargetAssociation: a }));
      const both = names.includes('near-duplicate-of-target') && names.includes('leakage-dominance');
      expect(both, `association ${a} produced both hints`).toBe(false);
    }
  });

  it('treats an absent association as "not measured", never as no signal', () => {
    expect(hintNames(feature({ TargetAssociation: undefined }))).toEqual([]);
  });

  it('flags an identifier by its cardinality ratio', () => {
    const hints = deriveFeatureHints(feature({ CardinalityRatio: 1.0, Name: 'row_id' }));
    expect(hints.map((h) => h.Hint)).toEqual(['id-like']);
    expect(hints[0].Message).toContain('memorize');
  });

  it('flags heavy missingness and suggests a presence flag', () => {
    const hints = deriveFeatureHints(feature({ MissingFraction: 0.8 }));
    expect(hints.map((h) => h.Hint)).toEqual(['high-missingness']);
    expect(hints[0].Message).toContain('presence flag');
  });

  it('flags high cardinality only for categorical features', () => {
    expect(hintNames(feature({ Kind: 'categorical', DistinctCount: 500, CardinalityRatio: 0.3 }))).toContain('high-cardinality');
    // A numeric column with 500 distinct values is just a continuous variable, not a one-hot problem.
    expect(hintNames(feature({ Kind: 'numeric', DistinctCount: 500, CardinalityRatio: 0.3 }))).not.toContain('high-cardinality');
  });

  it('reports several independent problems at once', () => {
    const names = hintNames(feature({ Kind: 'categorical', DistinctCount: 900, CardinalityRatio: 0.99, MissingFraction: 0.7 }));
    expect(new Set(names)).toEqual(new Set(['id-like', 'high-missingness', 'high-cardinality']));
  });

  it('honors overridden thresholds', () => {
    const strict = { ...FEATURE_HINT_THRESHOLDS, HighMissingFraction: 0.1 };
    expect(deriveFeatureHints(feature({ MissingFraction: 0.2 }), strict).map((h) => h.Hint)).toEqual(['high-missingness']);
    expect(deriveFeatureHints(feature({ MissingFraction: 0.2 })).map((h) => h.Hint)).toEqual([]);
  });
});

describe('addCollinearityHints', () => {
  function described(name: string): FeatureStatistics {
    return {
      Name: name,
      Kind: 'numeric',
      MissingFraction: 0,
      DistinctCount: 100,
      CardinalityRatio: 0.5,
      Hints: [],
    };
  }

  it('flags a collinear pair on BOTH features, once each', () => {
    const features = [described('a'), described('b'), described('c')];
    addCollinearityHints(features, (x, y) => (x === 'a' && y === 'b' ? 0.99 : 0.1));

    expect(features[0].Hints.map((h) => h.Hint)).toEqual(['collinear']);
    expect(features[1].Hints.map((h) => h.Hint)).toEqual(['collinear']);
    expect(features[2].Hints).toEqual([]);
    // Each names the OTHER feature — that is what makes the hint actionable.
    expect(features[0].Hints[0].RelatedFeature).toBe('b');
    expect(features[1].Hints[0].RelatedFeature).toBe('a');
  });

  it('uses the absolute correlation, so a perfect inverse counts', () => {
    const features = [described('a'), described('b')];
    addCollinearityHints(features, () => -0.999);
    expect(features[0].Hints[0].Value).toBeCloseTo(0.999, 6);
  });

  it('ignores pairs that cannot be measured', () => {
    const features = [described('a'), described('b')];
    addCollinearityHints(features, () => null);
    expect(features[0].Hints).toEqual([]);
  });

  it('never pairs a feature with itself', () => {
    const features = [described('a')];
    addCollinearityHints(features, () => 1.0);
    expect(features[0].Hints).toEqual([]);
  });

  it('honors an overridden threshold', () => {
    const features = [described('a'), described('b')];
    addCollinearityHints(features, () => 0.8, 0.75);
    expect(features[0].Hints.map((h) => h.Hint)).toEqual(['collinear']);
  });
});
