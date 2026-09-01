import { describe, it, expect } from 'vitest';
import type { CandidateGateReport, DatasetStatistics, ModelingPlanSpec } from '@memberjunction/predictive-studio-core';

import {
  shouldForceStatisticsPass,
  statisticsOutcomeMessage,
  type PredictiveStudioStatisticsPayload,
} from '../statistics-pass-agent';
import { modelingPlanToAssemblyParams } from '../modeling-plan-to-pipeline';

/**
 * The routing decision and the user-facing sentence are the two parts of this sub-agent a human
 * ever sees, and both are pure. The invariant that matters most: the pass fires at most ONCE per
 * plan — re-measuring the same rows on every turn would spend a sidecar round trip per message and
 * could not change the answer.
 */

function plan(over: Partial<ModelingPlanSpec> = {}): PredictiveStudioStatisticsPayload {
  return {
    Goal: 'Predict which members will renew',
    TargetDefinition: {
      EntityName: 'Members',
      TargetVariable: 'Renewed',
      ProblemType: 'classification',
      SuccessMetric: 'AUC',
    },
    CandidateSources: [{ Kind: 'Entity', Ref: 'Members', Why: 'the training unit' }],
    CandidateFeatures: [
      { Name: 'tenure', SourceRef: 'Members', Kind: 'numeric', Why: 'longer members renew more' },
      { Name: 'city', SourceRef: 'Members', Kind: 'categorical', Why: 'regional differences' },
    ],
    LeakageNotes: [],
    ProposedExperiments: [
      { Label: 'XGBoost baseline', AlgorithmName: 'XGBoost', FeatureSet: ['tenure', 'city'], Rationale: 'strong default', Priority: 1 },
    ],
    ValidationStrategy: { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 },
    ProposedBudget: {},
    ...over,
  };
}

function stats(over: Partial<DatasetStatistics> = {}): DatasetStatistics {
  return {
    EntityName: 'Members',
    RowCount: 1000,
    FeatureCount: 2,
    RowsPerFeature: 500,
    Target: { Name: 'Renewed', ProblemType: 'classification', LabeledRowCount: 1000, MinorityFraction: 0.2 },
    Features: [],
    DescribedAt: '2026-09-01T00:00:00.000Z',
    Warnings: [],
    ...over,
  };
}

describe('shouldForceStatisticsPass', () => {
  it('fires once on a describable plan that has not been measured', () => {
    expect(shouldForceStatisticsPass(plan(), 1)).toBe(true);
  });

  it('never fires again once Statistics exist — the answer cannot change', () => {
    expect(shouldForceStatisticsPass({ ...plan(), Statistics: stats() }, 5)).toBe(false);
  });

  it('does not fire on a plan with nothing to describe', () => {
    expect(shouldForceStatisticsPass(plan({ CandidateFeatures: [] }), 1)).toBe(false);
    expect(shouldForceStatisticsPass(plan({ TargetDefinition: { EntityName: '', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' } }), 1)).toBe(false);
    expect(shouldForceStatisticsPass(plan({ TargetDefinition: { EntityName: 'Members', TargetVariable: '   ', ProblemType: 'classification', SuccessMetric: 'AUC' } }), 1)).toBe(false);
  });

  it('does not fire on an absent payload', () => {
    expect(shouldForceStatisticsPass(undefined, 1)).toBe(false);
  });

  it('does not re-fire for the SAME user message after a pass that produced nothing', () => {
    // The sidecar was down: the pass ran, wrote no Statistics, but stamped the message count.
    const attempted = { ...plan(), StatisticsAttemptUserMessageCount: 3 };
    expect(shouldForceStatisticsPass(attempted, 3)).toBe(false);
  });

  it('retries on a FRESH user message after a pass that produced nothing', () => {
    const attempted = { ...plan(), StatisticsAttemptUserMessageCount: 3 };
    expect(shouldForceStatisticsPass(attempted, 4)).toBe(true);
  });
});

describe('statisticsOutcomeMessage', () => {
  it('says plainly what it measured', () => {
    const msg = statisticsOutcomeMessage(stats(), []);
    expect(msg).toContain('1,000 rows');
    expect(msg).toContain('2 candidate inputs');
    expect(msg).toContain('500 rows per input');
    expect(msg).toContain('rarer outcome is 20%');
  });

  it('names the flagged inputs, truncating a long list', () => {
    const flagged = ['a', 'b', 'c', 'd'].map((name) => ({
      Name: name,
      Kind: 'numeric' as const,
      MissingFraction: 0,
      DistinctCount: 5,
      CardinalityRatio: 0.1,
      Hints: [{ Hint: 'id-like' as const, Value: 1, Threshold: 0.95, Message: 'x' }],
    }));
    const msg = statisticsOutcomeMessage(stats({ Features: flagged, FeatureCount: 4 }), []);
    expect(msg).toContain('4 inputs need a closer look');
    expect(msg).toContain('a, b, c…');
  });

  it('uses singular wording for a single flagged input', () => {
    const one = [{
      Name: 'row_id',
      Kind: 'numeric' as const,
      MissingFraction: 0,
      DistinctCount: 1000,
      CardinalityRatio: 1,
      Hints: [{ Hint: 'id-like' as const, Value: 1, Threshold: 0.95, Message: 'x' }],
    }];
    expect(statisticsOutcomeMessage(stats({ Features: one }), [])).toContain('1 input needs a closer look');
  });

  it('reports ruled-out candidates by name', () => {
    const gates: CandidateGateReport[] = [
      { ComponentTypeID: 't1', ComponentTypeName: 'Multilayer Perceptron', Admissible: false, Gates: [], Summary: '' },
      { ComponentTypeID: 't2', ComponentTypeName: 'XGBoost', Admissible: true, Gates: [], Summary: '' },
    ];
    const msg = statisticsOutcomeMessage(stats(), gates);
    expect(msg).toContain('1 candidate approach ruled out: Multilayer Perceptron');
    expect(msg).not.toContain('XGBoost');
  });

  it('degrades honestly when nothing could be measured', () => {
    const msg = statisticsOutcomeMessage(null, []);
    expect(msg).toContain("couldn't measure");
    expect(msg).toContain('extra caution');
  });

  it('omits class balance for a regression target rather than inventing one', () => {
    const regression = stats({ Target: { Name: 'Amount', ProblemType: 'regression', LabeledRowCount: 1000 } });
    expect(statisticsOutcomeMessage(regression, [])).not.toContain('rarer outcome');
  });
});

describe('modelingPlanToAssemblyParams', () => {
  it('describes the SAME matrix the plan would build, in train context', () => {
    const params = modelingPlanToAssemblyParams(plan());
    expect(params.targetEntityName).toBe('Members');
    expect(params.targetVariable).toBe('Renewed');
    expect(params.recordSet).toEqual({ EntityName: 'Members', MaxRows: undefined });
    expect(params.context).toBe('train');
    // The steps come from the plan→pipeline mapping, so the pass cannot drift from the pipeline.
    expect(params.steps.Steps.length).toBeGreaterThan(0);
  });

  it('threads the row cap and primary-key field through', () => {
    const params = modelingPlanToAssemblyParams(plan(), { maxRows: 5000, primaryKeyField: 'MemberID' });
    expect(params.recordSet?.MaxRows).toBe(5000);
    expect(params.primaryKeyField).toBe('MemberID');
  });
});
