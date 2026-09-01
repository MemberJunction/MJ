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

describe('gateArchitecture — what is not built yet', () => {
  it('records a reify decision but refuses to execute it, saying what to do instead', () => {
    const architecture: ArchitectureSpec = {
      Decision: 'reify',
      Rationale: 'both candidates are boosting variants',
      Candidates: [
        { ComponentTypeRef: 'XGBoost', Rationale: 'a' },
        { ComponentTypeRef: 'LightGBM', Rationale: 'b' },
      ],
      ReifiedUnderComponentTypeRef: 'Boosting',
    };
    const result = gateArchitecture(plan({ Architecture: architecture }));
    expect(result.Executable).toBe(false);
    // The decision is still returned — it is recorded on the plan, just not trainable yet.
    expect(result.Architecture?.Decision).toBe('reify');
    expect(result.Reasons[0]).toContain('cannot be trained yet');
    expect(result.Reasons[0]).toContain('Commit to one of its concrete descendants');
  });

  it('records a compose decision but refuses to execute it', () => {
    const architecture: ArchitectureSpec = {
      Decision: 'compose',
      Rationale: 'a bagged forest suits the variance here',
      Candidates: [{ ComponentTypeRef: 'Bagging Wrapper', Rationale: 'reduces variance' }],
      ComposedGraph: { ComponentTypeRef: 'Bagging Wrapper', Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator' }] },
    };
    const result = gateArchitecture(plan({ Architecture: architecture }));
    expect(result.Executable).toBe(false);
    expect(result.Reasons[0]).toContain('composition runtime');
    // The proposal survives on the plan rather than being discarded.
    expect(result.Architecture?.ComposedGraph?.ComponentTypeRef).toBe('Bagging Wrapper');
  });

  it('executes exactly the decisions it claims to', () => {
    expect([...EXECUTABLE_DECISIONS]).toEqual(['commit', 'defer']);
    for (const Decision of EXECUTABLE_DECISIONS) {
      const architecture: ArchitectureSpec =
        Decision === 'commit'
          ? commit
          : { Decision, Rationale: 'r', Candidates: [{ ComponentTypeRef: 'A', Rationale: 'a' }, { ComponentTypeRef: 'B', Rationale: 'b' }] };
      expect(gateArchitecture(plan({ Architecture: architecture })).Executable, Decision).toBe(true);
    }
  });
});
