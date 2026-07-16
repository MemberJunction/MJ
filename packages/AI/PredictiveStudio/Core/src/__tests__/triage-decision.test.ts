import { describe, it, expect } from 'vitest';
import {
  validateTriageDecision,
  TriageDecisionSchema,
  TRIAGE_TASK_FAMILIES,
  type TriageDecision,
  type TriageValidationContext,
} from '../triage-decision';
import { ALL_TASKS } from '../tasks';

/** A minimally-valid commit decision; override per test. */
function decision(over: Partial<TriageDecision> = {}): TriageDecision {
  return {
    taskFamily: 'classification',
    triage: 'commit',
    modelWorthBuilding: true,
    expectedMeaningfulness: {
      decisionInformed: 'who gets a retention call',
      valueMetric: 'PR-AUC / lift-at-k (94% base rate makes accuracy vacuous)',
      honestCeiling: 'top univariate AUC ~0.72',
    },
    chosenComponents: ['XGBoost'],
    calibrationRequired: true,
    citedStats: [{ name: 'class_balance', value: 0.94, why: 'heavy imbalance ⇒ rank not classify' }],
    dataPrerequisites: [],
    storySeed: { nominalName: 'Renewal risk ranker', narrative: 'Ranks the at-risk 6%.' },
    rationale: 'Committed to a calibrated GBT ranker.',
    ...over,
  };
}

const CTX: TriageValidationContext = {
  catalogComponentNames: ['XGBoost', 'K-Means', 'HMM Cadence-State Extractor', 'Isotonic Calibrator'],
  libraryCandidateNames: ['Engagement archetypes', 'K-Means'],
  qualiaKeys: ['class_balance', 'censored_fraction', 'vif_max', 'hopkins', 'seasonal_strength'],
};

describe('TRIAGE_TASK_FAMILIES', () => {
  it('is a superset of the 10 modeling tasks plus uplift + none', () => {
    for (const t of ALL_TASKS) expect(TRIAGE_TASK_FAMILIES).toContain(t);
    expect(TRIAGE_TASK_FAMILIES).toContain('uplift');
    expect(TRIAGE_TASK_FAMILIES).toContain('none');
    expect(TRIAGE_TASK_FAMILIES.length).toBe(ALL_TASKS.length + 2);
  });
});

describe('TriageDecisionSchema (structural)', () => {
  it('accepts a well-formed decision', () => {
    expect(TriageDecisionSchema.safeParse(decision()).success).toBe(true);
  });
  it('rejects an unknown verdict', () => {
    expect(TriageDecisionSchema.safeParse(decision({ triage: 'ponder' as never })).success).toBe(false);
  });
  it('rejects a missing meaningfulness block', () => {
    const d = decision() as Record<string, unknown>;
    delete d.expectedMeaningfulness;
    expect(TriageDecisionSchema.safeParse(d).success).toBe(false);
  });
});

describe('validateTriageDecision — identification gate', () => {
  it('rejects an uplift question with no treatment column that does NOT defer', () => {
    const r = validateTriageDecision(decision({ taskFamily: 'uplift', triage: 'commit' }), {
      ...CTX,
      situationFamily: 'uplift',
      treatmentColumnPresent: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(' ')).toMatch(/IDENTIFICATION GATE/);
  });

  it('accepts an uplift question with no treatment column that DEFERS', () => {
    const r = validateTriageDecision(
      decision({
        taskFamily: 'uplift',
        triage: 'defer',
        dataPrerequisites: ['contact/intervention history (a treatment column)'],
        chosenComponents: [],
      }),
      { ...CTX, situationFamily: 'uplift', treatmentColumnPresent: false },
    );
    expect(r.ok).toBe(true);
  });

  it('allows uplift commit when a treatment column IS present', () => {
    const r = validateTriageDecision(decision({ taskFamily: 'uplift', triage: 'commit' }), {
      ...CTX,
      situationFamily: 'uplift',
      treatmentColumnPresent: true,
    });
    expect(r.ok).toBe(true);
  });
});

describe('validateTriageDecision — combine legality', () => {
  it('rejects combine without a ≥2-node graph', () => {
    const r = validateTriageDecision(decision({ triage: 'combine' }), CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(' ')).toMatch(/2-node/);
  });

  it('rejects combine referencing an unknown component', () => {
    const r = validateTriageDecision(
      decision({
        triage: 'combine',
        compositionGraph: {
          nodes: [
            { id: 'a', component: 'K-Means' },
            { id: 'b', component: 'Nonexistent Model' },
          ],
          edges: [{ from: 'a', to: 'b', port: 'cluster-id' }],
        },
      }),
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(' ')).toMatch(/unknown components/);
  });

  it('accepts combine with a valid 2-node graph of known components', () => {
    const r = validateTriageDecision(
      decision({
        triage: 'combine',
        compositionGraph: {
          nodes: [
            { id: 'a', component: 'K-Means' },
            { id: 'b', component: 'XGBoost' },
          ],
          edges: [{ from: 'a', to: 'b', port: 'cluster-id', adapter: 'cluster-id→features:tabular' }],
        },
      }),
      CTX,
    );
    expect(r.ok).toBe(true);
  });
});

describe('validateTriageDecision — reuse + defer', () => {
  it('rejects reuse that names no library candidate', () => {
    const r = validateTriageDecision(decision({ triage: 'reuse', chosenComponents: ['Brand New Thing'] }), CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(' ')).toMatch(/session-library candidate/);
  });

  it('accepts reuse naming a library candidate', () => {
    const r = validateTriageDecision(decision({ triage: 'reuse', chosenComponents: ['K-Means'] }), CTX);
    expect(r.ok).toBe(true);
  });

  it('rejects defer with neither prerequisites nor ≥2 candidates', () => {
    const r = validateTriageDecision(decision({ triage: 'defer', dataPrerequisites: [], chosenComponents: ['A'] }), CTX);
    expect(r.ok).toBe(false);
  });

  it('accepts defer with ≥2 branch candidates', () => {
    const r = validateTriageDecision(
      decision({ triage: 'defer', dataPrerequisites: [], chosenComponents: ['XGBoost', 'Logistic Regression'] }),
      CTX,
    );
    expect(r.ok).toBe(true);
  });
});

describe('validateTriageDecision — citation validity', () => {
  it('flags a cited stat absent from the qualia report', () => {
    const r = validateTriageDecision(
      decision({ citedStats: [{ name: 'made_up_metric', value: 1, why: 'sounds good' }] }),
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.join(' ')).toMatch(/not present in qualia report/);
      expect(r.citationsValid).toBe(0);
    }
  });

  it('reports partial citation validity across mixed cites', () => {
    const r = validateTriageDecision(
      decision({
        citedStats: [
          { name: 'class_balance', value: 0.94, why: 'real' },
          { name: 'nonsense', value: 0, why: 'fake' },
        ],
      }),
      CTX,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.citationsValid).toBeCloseTo(0.5, 5);
  });

  it('reports full citation validity on a clean commit', () => {
    const r = validateTriageDecision(decision(), CTX);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.citationsValid).toBe(1);
  });
});
