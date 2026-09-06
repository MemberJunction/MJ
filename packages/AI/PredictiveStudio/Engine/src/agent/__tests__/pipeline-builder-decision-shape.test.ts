import { describe, it, expect } from 'vitest';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import { describeDecisionShape } from '../pipeline-builder';

/**
 * The builder trains ONE model. `defer` and `reify` both mean "race several and compare", which it
 * cannot do — so it builds the leading candidate, which is right, and says so, which is the part
 * that was missing. Unsaid, the model reads as the decision's outcome when it is only its first step.
 */
const spec = (architecture?: unknown): ModelingPlanSpec =>
  ({ Goal: 'g', Architecture: architecture } as unknown as ModelingPlanSpec);

describe('describeDecisionShape', () => {
  it('says nothing when the decision and the build are the same shape', () => {
    expect(describeDecisionShape(spec())).toBeNull();
    expect(
      describeDecisionShape(spec({ Decision: 'commit', Candidates: [{ ComponentTypeRef: 'Random Forest' }] })),
    ).toBeNull();
    // A composed model IS built whole by this path — nothing is lost, so nothing is said.
    expect(describeDecisionShape(spec({ Decision: 'compose', Candidates: [] }))).toBeNull();
  });

  it('names what a deferred race left unbuilt', () => {
    const note = describeDecisionShape(
      spec({ Decision: 'defer', Candidates: [{ ComponentTypeRef: 'Random Forest' }, { ComponentTypeRef: 'XGBoost' }] }),
    );
    expect(note).toContain('asked for a race');
    expect(note).toContain('Random Forest, XGBoost');
    expect(note).toContain('experiment session');
  });

  it('names the family a reify asked to search', () => {
    const note = describeDecisionShape(
      spec({
        Decision: 'reify',
        Candidates: [{ ComponentTypeRef: 'XGBoost' }, { ComponentTypeRef: 'LightGBM' }],
        ReifiedUnderComponentTypeRef: 'Boosting',
      }),
    );
    expect(note).toContain("under 'Boosting'");
    expect(note).toContain('only the leading variation');
  });
});
