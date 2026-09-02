import { describe, it, expect } from 'vitest';
import type { ArchitectureSpec, CandidateGateReport, ModelingPlanSpec } from '@memberjunction/predictive-studio-core';

import { gateArchitecture, EXECUTABLE_DECISIONS } from '../architecture-gate';

/**
 * The gate is the last thing between an LLM's architecture proposal and a real pipeline row. Three
 * independent failures it has to catch — malformed JSON, a candidate the measurements ruled out, and
 * a decision whose runtime does not exist yet — none of which the others would catch. Plus the
 * backward-compatibility case that matters most in practice: a plan written before the Architect
 * existed must pass through untouched.
 */

function plan(over: Partial<ModelingPlanSpec> = {}): ModelingPlanSpec {
  return {
    Goal: 'Predict renewals',
    TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
    CandidateSources: [],
    CandidateFeatures: [],
    LeakageNotes: [],
    ProposedExperiments: [{ Label: 'x', AlgorithmName: 'XGBoost', FeatureSet: [], Rationale: 'y', Priority: 1 }],
    ValidationStrategy: { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 },
    ProposedBudget: {},
    ...over,
  };
}

const commit: ArchitectureSpec = {
  Decision: 'commit',
  Rationale: 'the data is thin and interpretability is the requirement',
  Candidates: [{ ComponentTypeRef: 'Glass-Box Rubric', Rationale: 'exact per-record explanation', Admissible: true }],
};

function inadmissible(name: string, summary: string, failMessage: string): CandidateGateReport {
  return {
    ComponentTypeID: 't-1',
    ComponentTypeName: name,
    Admissible: false,
    Gates: [
      { GateKey: 'min-rows-per-feature', Kind: 'min-rows-per-feature', Verdict: 'Failed', Observed: 30, Threshold: 50, Message: failMessage, SourceTypeID: 't-neural' },
    ],
    Summary: summary,
  };
}

describe('gateArchitecture — backward compatibility', () => {
  it('passes a plan with NO architecture decision at all', () => {
    // Plans written before the Architect existed execute exactly as they always did.
    expect(gateArchitecture(plan())).toEqual({ Executable: true, Architecture: null, Reasons: [] });
  });
});

describe('gateArchitecture — well-formedness', () => {
  it('accepts a well-formed commit', () => {
    const result = gateArchitecture(plan({ Architecture: commit }));
    expect(result.Executable).toBe(true);
    expect(result.Architecture?.Decision).toBe('commit');
  });

  it('refuses a malformed decision, surfacing the shape error', () => {
    const bad = { Decision: 'commit', Rationale: '', Candidates: [] } as unknown as ArchitectureSpec;
    const result = gateArchitecture(plan({ Architecture: bad }));
    expect(result.Executable).toBe(false);
    expect(result.Architecture).toBeNull();
    expect(result.Reasons[0]).toContain('malformed');
    expect(result.Reasons[0]).toContain('Rationale');
  });

  it("refuses a 'commit' that names several candidates — the label and the content disagree", () => {
    const incoherent: ArchitectureSpec = {
      ...commit,
      Candidates: [
        { ComponentTypeRef: 'XGBoost', Rationale: 'a' },
        { ComponentTypeRef: 'Random Forest', Rationale: 'b' },
      ],
    };
    expect(gateArchitecture(plan({ Architecture: incoherent })).Executable).toBe(false);
  });
});

describe('gateArchitecture — consistency with the measured evidence', () => {
  it('refuses a candidate the statistics pre-pass ruled out, quoting the measured reason', () => {
    const architecture: ArchitectureSpec = {
      ...commit,
      Candidates: [{ ComponentTypeRef: 'Multilayer Perceptron', Rationale: 'it usually wins' }],
    };
    const result = gateArchitecture(
      plan({
        Architecture: architecture,
        GateReports: [inadmissible('Multilayer Perceptron', 'Multilayer Perceptron is NOT admissible: min-rows-per-feature failed.', 'Only 30 rows per feature, below the floor of 50.')],
      }),
    );
    expect(result.Executable).toBe(false);
    // The user must read the MEASURED reason, not a restatement of it.
    expect(result.Reasons[0]).toContain('30 rows per feature');
    expect(result.Reasons[0]).toContain('floor of 50');
  });

  it('matches candidate names case-insensitively', () => {
    const architecture: ArchitectureSpec = { ...commit, Candidates: [{ ComponentTypeRef: 'multilayer perceptron', Rationale: 'x' }] };
    const result = gateArchitecture(
      plan({ Architecture: architecture, GateReports: [inadmissible('Multilayer Perceptron', 'not admissible', 'too thin')] }),
    );
    expect(result.Executable).toBe(false);
  });

  it('allows an ADMISSIBLE candidate through even when a sibling was ruled out', () => {
    const architecture: ArchitectureSpec = {
      Decision: 'defer',
      Rationale: 'the statistics do not separate these two',
      Candidates: [
        { ComponentTypeRef: 'Glass-Box Rubric', Rationale: 'interpretable', Admissible: true },
        { ComponentTypeRef: 'XGBoost', Rationale: 'stronger', Admissible: true },
      ],
    };
    const result = gateArchitecture(
      plan({ Architecture: architecture, GateReports: [inadmissible('Multilayer Perceptron', 'not admissible', 'too thin')] }),
    );
    expect(result.Executable).toBe(true);
  });

  it('is silent when there are no gate reports to check against', () => {
    const architecture: ArchitectureSpec = { ...commit, Candidates: [{ ComponentTypeRef: 'Anything', Rationale: 'x' }] };
    expect(gateArchitecture(plan({ Architecture: architecture })).Executable).toBe(true);
  });
});

describe('gateArchitecture — composition and reification', () => {
  const reify = (candidates: string[], parent = 'Boosting'): ArchitectureSpec => ({
    Decision: 'reify',
    Rationale: 'the candidates are boosting variants',
    Candidates: candidates.map((c) => ({ ComponentTypeRef: c, Rationale: 'r' })),
    ReifiedUnderComponentTypeRef: parent,
  });

  /** Minimal tree stand-in: Boosting → {XGBoost, LightGBM}; Linear → Logistic Regression. */
  const treeEngine = {
    FindTypeByName: (name: string) =>
      ({
        boosting: { ID: 'boosting', Name: 'Boosting', Kind: 'Model', IsAbstract: true },
        xgboost: { ID: 'xgb', Name: 'XGBoost', Kind: 'Model', IsAbstract: false },
        lightgbm: { ID: 'lgbm', Name: 'LightGBM', Kind: 'Model', IsAbstract: false },
        'logistic regression': { ID: 'logreg', Name: 'Logistic Regression', Kind: 'Model', IsAbstract: false },
      })[name.trim().toLowerCase()],
    IsDescendantOf: (typeID: string, ancestorID: string) =>
      ancestorID === 'boosting' ? typeID === 'xgb' || typeID === 'lgbm' || typeID === 'boosting' : typeID === ancestorID,
  } as unknown as Parameters<typeof gateArchitecture>[1];

  it('executes a reify decision now that the combination search is the production strategist', () => {
    const result = gateArchitecture(plan({ Architecture: reify(['XGBoost', 'LightGBM']) }), treeEngine);
    expect(result.Executable).toBe(true);
    expect(result.Architecture?.Decision).toBe('reify');
    expect(result.Reasons).toEqual([]);
  });

  it('refuses a reify whose candidates are not actually variations of one parent', () => {
    // The entire content of a reify is "these are all Boosting". Unchecked, every model in the
    // session would be filed against a family it is not in.
    const result = gateArchitecture(plan({ Architecture: reify(['XGBoost', 'Logistic Regression']) }), treeEngine);
    expect(result.Executable).toBe(false);
    expect(result.Reasons[0]).toContain("'Logistic Regression' is not a 'Boosting'");
    expect(result.Reasons[0]).toContain('defer across them instead');
  });

  it('refuses a reify under a parent the tree does not have', () => {
    const result = gateArchitecture(plan({ Architecture: reify(['XGBoost'], 'Gradient Magic') }), treeEngine);
    expect(result.Reasons[0]).toContain("reifies under 'Gradient Magic', which is not a component type");
  });

  it('leaves the claim alone when no tree is available, rather than assuming it true', () => {
    // Same posture as the graph check: no engine ⇒ not structurally verified, still executable.
    expect(gateArchitecture(plan({ Architecture: reify(['XGBoost', 'Logistic Regression']) })).Executable).toBe(true);
  });

  it('executes a compose decision now that the composition runtime exists', () => {
    const architecture: ArchitectureSpec = {
      Decision: 'compose',
      Rationale: 'a bagged forest suits the variance here',
      Candidates: [{ ComponentTypeRef: 'Bagging Wrapper', Rationale: 'reduces variance' }],
      ComposedGraph: { ComponentTypeRef: 'Bagging Wrapper', Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator' }] },
    };
    const result = gateArchitecture(plan({ Architecture: architecture }));
    expect(result.Executable).toBe(true);
    expect(result.Reasons).toEqual([]);
    expect(result.Architecture?.ComposedGraph?.ComponentTypeRef).toBe('Bagging Wrapper');
  });

  it('executes exactly the decisions it claims to', () => {
    expect([...EXECUTABLE_DECISIONS]).toEqual(['commit', 'defer', 'reify', 'compose']);
    for (const Decision of EXECUTABLE_DECISIONS) {
      const architecture: ArchitectureSpec =
        Decision === 'commit'
          ? commit
          : Decision === 'compose'
            ? { Decision, Rationale: 'r', Candidates: [{ ComponentTypeRef: 'A', Rationale: 'a' }], ComposedGraph: { ComponentTypeRef: 'A' } }
            : Decision === 'reify'
              ? { Decision, Rationale: 'r', Candidates: [{ ComponentTypeRef: 'A', Rationale: 'a' }], ReifiedUnderComponentTypeRef: 'P' }
              : { Decision, Rationale: 'r', Candidates: [{ ComponentTypeRef: 'A', Rationale: 'a' }, { ComponentTypeRef: 'B', Rationale: 'b' }] };
      expect(gateArchitecture(plan({ Architecture: architecture })).Executable, Decision).toBe(true);
    }
  });
});
