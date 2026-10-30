import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, EntityInfo, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { TrustVerdicts, ImportanceDisplay, type ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import {
  SummarizeBuildResult,
  BuildOutcomeMessage,
  UntrainedExperimentsNote,
  GenerateMarkdownReport,
  HiddenImportanceNote,
  UNSHOWN_IMPORTANCE_KIND_NOTE,
  PredictiveStudioPipelineBuilderAgent,
  type PredictiveStudioBuilderPayload,
} from '../pipeline-builder-agent';
import {
  PredictiveStudioPipelineBuilder,
  type BuildPredictionInput,
  type BuildPredictionResult,
  type MLLeaderboardEntryPayload,
} from '../pipeline-builder';

/**
 * The code sub-agent's pure projection helpers — they turn the rich builder result into the compact,
 * payload-safe outcome + the plain user-facing sentence the agent narrates. The agent's executeAgentInternal
 * glue is verified end-to-end by the in-process agent integration test; here we pin the projection + copy.
 */
const published: BuildPredictionResult = {
  success: true, pipelineId: 'p1', modelId: 'm1', published: true, leakageFlagged: false, heldReason: null, errorMessage: null,
  trust: { grade: 'Good', score01: 0.56, oneLiner: 'Right about 8 out of 10 times.', explanation: '', canAct: true, gateReason: null, headlineMetric: { key: 'AUC', value: 0.78 }, unknown: false, WithheldReason: null, MajorityBaseline: null },
};
const held: BuildPredictionResult = {
  success: true, pipelineId: 'p2', modelId: 'm2', published: false, leakageFlagged: false, errorMessage: null,
  heldReason: 'This prediction is about as accurate as guessing, so it isn\'t safe to act on yet.',
  trust: { grade: 'Poor', score01: 0, oneLiner: 'About as accurate as guessing — not reliable.', explanation: '', canAct: false, gateReason: 'x', headlineMetric: { key: 'AUC', value: 0.51 }, unknown: false, WithheldReason: null, MajorityBaseline: null },
};
const failed: BuildPredictionResult = { success: false, published: false, leakageFlagged: false, heldReason: null, errorMessage: 'Algorithm not found' };

describe('SummarizeBuildResult', () => {
  it('projects a published result', () => {
    expect(SummarizeBuildResult(published)).toMatchObject({ success: true, pipelineId: 'p1', modelId: 'm1', trustGrade: 'Good', published: true, heldReason: null, errorMessage: null });
  });
  it('projects a HELD result, carrying the plain reason (the safety gate)', () => {
    const o = SummarizeBuildResult(held);
    expect(o.published).toBe(false);
    expect(o.trustGrade).toBe('Poor');
    expect(o.heldReason).toMatch(/guessing/i);
  });
  it('projects a failed build', () => {
    expect(SummarizeBuildResult(failed)).toMatchObject({ success: false, published: false, errorMessage: 'Algorithm not found' });
  });
});

describe('BuildOutcomeMessage', () => {
  it('describes published / held / failed in plain language', () => {
    expect(BuildOutcomeMessage(SummarizeBuildResult(published))).toMatch(/built and published/i);
    expect(BuildOutcomeMessage(SummarizeBuildResult(held))).toMatch(/holding it back/i);
    expect(BuildOutcomeMessage(SummarizeBuildResult(failed))).toMatch(/couldn't build/i);
  });

  it('never renders double periods on held messages whether heldReason has trailing period or not', () => {
    const heldWithoutPeriod: BuildPredictionResult = {
      ...held,
      heldReason: 'Accuracy too low to trust',
    };
    const msg1 = BuildOutcomeMessage(SummarizeBuildResult(heldWithoutPeriod));
    expect(msg1).not.toContain('..');
    expect(msg1).toContain('Accuracy too low to trust.');

    const heldWithPeriod: BuildPredictionResult = {
      ...held,
      heldReason: 'Accuracy too low to trust.',
    };
    const msg2 = BuildOutcomeMessage(SummarizeBuildResult(heldWithPeriod));
    expect(msg2).not.toContain('..');
    expect(msg2).toContain('Accuracy too low to trust.');

    const heldNullReason: BuildPredictionResult = {
      ...held,
      heldReason: null,
    };
    const msg3 = BuildOutcomeMessage(SummarizeBuildResult(heldNullReason));
    expect(msg3).not.toContain('..');
    expect(msg3).toContain('it needs review before it can be published.');
  });

  it('projects a result with warnings and surfaces them in the message', () => {
    const withWarnings: BuildPredictionResult = {
      ...published,
      warnings: [
        { FeatureName: 'JobTitleNorm', Kind: 'llm-derived', Reason: 'Requires upstream Feature Pipeline' },
      ],
    };
    const summary = SummarizeBuildResult(withWarnings);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings?.[0].FeatureName).toBe('JobTitleNorm');
    expect(BuildOutcomeMessage(summary)).toContain('Note: 1 candidate feature(s) could not be mapped to pipeline steps');
    expect(BuildOutcomeMessage(summary)).toContain('JobTitleNorm: Requires upstream Feature Pipeline');
  });

  it('surfaces warnings even on a failed build outcome', () => {
    const failedWithWarnings: BuildPredictionResult = {
      ...failed,
      warnings: [
        { FeatureName: 'UnmappedCol', Kind: 'embedding', Reason: 'Dedicated vector step needed' },
      ],
    };
    const summary = SummarizeBuildResult(failedWithWarnings);
    expect(summary.success).toBe(false);
    expect(summary.warnings).toHaveLength(1);
    const msg = BuildOutcomeMessage(summary);
    expect(msg).toContain("I couldn't build the prediction: Algorithm not found.");
    expect(msg).toContain('Note: 1 candidate feature(s) could not be mapped to pipeline steps');
    expect(msg).toContain('UnmappedCol: Dedicated vector step needed');
  });
});

describe('ParseFeatureImportance', () => {
  it('parses JSON string object of key/value weights', async () => {
    const { ParseFeatureImportance } = await import('../pipeline-builder-agent');
    const res = ParseFeatureImportance('{"DuesAmount": 0.45, "TenureMonths": 0.28}');
    expect(res).toEqual([
      { feature: 'DuesAmount', importance: 0.45 },
      { feature: 'TenureMonths', importance: 0.28 },
    ]);
  });

  it('parses array of feature/importance objects', async () => {
    const { ParseFeatureImportance } = await import('../pipeline-builder-agent');
    const res = ParseFeatureImportance([
      { feature: 'LeadTimeDays', importance: 0.62 },
      { feature: 'Tier', importance: 0.38 },
    ]);
    expect(res).toEqual([
      { feature: 'LeadTimeDays', importance: 0.62 },
      { feature: 'Tier', importance: 0.38 },
    ]);
  });

  it('handles null/undefined gracefully', async () => {
    const { ParseFeatureImportance } = await import('../pipeline-builder-agent');
    expect(ParseFeatureImportance(null)).toEqual([]);
    expect(ParseFeatureImportance(undefined)).toEqual([]);
    expect(ParseFeatureImportance('invalid json')).toEqual([]);
  });
});

describe('GenerateMarkdownReport', () => {
  it('formats a structured markdown report with metrics and features', () => {
    const md = GenerateMarkdownReport(
      'Member Renewal Risk',
      'Predict renewal',
      'Status',
      'AUC',
      0.864,
      'Excellent',
      'Accurate and reliable.',
      true,
      [{ feature: 'DuesAmount', importance: 0.45 }],
      [],
      false,
    );
    expect(md).toContain('# Model Development Results: Member Renewal Risk');
    expect(md).toContain('**AUC** = **0.864**');
    expect(md).toContain('DuesAmount');
    expect(md).toContain('Published to Catalog');
  });
});

describe('ResolveEntity', () => {
  it('resolves entity by name, baseView, baseTable, schema prefix, and stripped prefix', async () => {
    const { ResolveEntity } = await import('../pipeline-builder');
    const fakeEntity = {
      ID: 'E1',
      Name: 'MJ: AI Prompt Runs',
      BaseView: 'vwAIPromptRuns',
      BaseTable: 'AIPromptRun',
      SchemaName: '__mj',
      Fields: [{ Name: 'ID' }, { Name: 'CompletedAt' }],
    } as unknown as EntityInfo;
    const fakeProvider = {
      EntityByName: (n: string) => (n.toLowerCase() === fakeEntity.Name.toLowerCase() ? fakeEntity : undefined),
      Entities: [fakeEntity],
    } as unknown as IMetadataProvider;

    // Direct name
    expect(ResolveEntity('MJ: AI Prompt Runs', fakeProvider)?.ID).toBe('E1');
    // Base view
    expect(ResolveEntity('vwAIPromptRuns', fakeProvider)?.ID).toBe('E1');
    // Base table
    expect(ResolveEntity('AIPromptRun', fakeProvider)?.ID).toBe('E1');
    // Schema qualified view
    expect(ResolveEntity('__mj.vwAIPromptRuns', fakeProvider)?.ID).toBe('E1');
    // Stripped prefix
    expect(ResolveEntity('AI Prompt Runs', fakeProvider)?.ID).toBe('E1');
    // Unknown returns undefined
    expect(ResolveEntity('NonExistentEntity', fakeProvider)).toBeUndefined();
  });
});

describe('GenerateMarkdownReport — unmeasured model', () => {
  it("says the metric was not measured, and does not call the unmeasured verdict's 'Poor' grade a measured result", () => {
    // Production passes the verdict's grade, which is 'Poor' for an unmeasured model (TrustVerdicts.unknownVerdict).
    const md = GenerateMarkdownReport('Renewal', 'Predict renewal', 'Renewed', 'AUC', null, 'Poor', 'Not measured.', false, [], [], false);
    expect(md).toContain('**AUC** = **not measured**');
    expect(md).not.toMatch(/0\.850/);
    expect(md).toContain('**Trust Grade**: **Not measured**');
    expect(md).not.toContain('**Poor**');
  });
});

describe('GenerateMarkdownReport — measurement copy (M8)', () => {
  const row = (rank: number, score: number | null, isWinner: boolean): MLLeaderboardEntryPayload => ({
    IterationID: `m${rank}`, Metric: score, rank, algorithm: `Algo ${rank}`, score, metricName: score === null ? null : 'AUC', isWinner,
  });
  it('says nothing about picking a winner for a single-model build', () => {
    const md = GenerateMarkdownReport('Renewal', 'g', 'Renewed', 'AUC', 0.8, 'Good', 'ok', true, [], [row(1, 0.8, true)], false);
    expect(md).not.toMatch(/winner was picked/);
    expect(md).toContain('## Model Performance');
  });
  it('says a search picked its winner on optimistic inner-fold scores and read the held-back rows once, and prints each interval', () => {
    const searchRow = (rank: number, mean: number, isWinner: boolean): MLLeaderboardEntryPayload => ({
      IterationID: 'run-1', Metric: mean, rank, algorithm: `Algo ${rank}`, score: mean, metricName: 'log-loss', innerLower: mean - 0.02, innerUpper: mean + 0.02, optimistic: true, isWinner,
    });
    const md = GenerateMarkdownReport('Renewal', 'g', 'Renewed', 'AUC', 0.8, 'Good', 'ok', true, [], [searchRow(1, 0.4, false), searchRow(2, 0.41, true)], false);
    expect(md).toContain('The winner is the simplest candidate whose inner-fold score is within one standard error of the best; inner-fold scores are optimistic, and the held-back rows were read once, for the winner.');
    expect(md).toContain('| Rank | Algorithm | Inner-CV log-loss [95% interval] (optimistic) | Status |');
    expect(md).toContain('| 1 | Algo 1 | 0.400 [0.380, 0.420] | Evaluated |');
    expect(md).toContain('| 2 | Algo 2 | 0.410 [0.390, 0.430] | 🏆 Winner (Selected) |');
    expect(md).toContain('## Winning Model Performance');
  });
  it('names the proposed experiments a build without a search did not train', () => {
    const md = GenerateMarkdownReport('Renewal', 'g', 'Renewed', 'AUC', 0.8, 'Good', 'ok', true, [], [row(1, 0.8, true)], false, ImportanceDisplay.HiddenNote, ['B', 'C']);
    expect(md).toContain('- The score comes from the rows held back from training. The other 2 proposed experiments (B, C) were not trained: a search over several candidates needs a Prediction Unit on the pipeline.');
    expect(md).toContain('| Rank | Algorithm | Score (AUC) | Status |');
    expect(UntrainedExperimentsNote(['B'])).toBe('The other proposed experiment (B) was not trained: a search over several candidates needs a Prediction Unit on the pipeline.');
    expect(UntrainedExperimentsNote([])).toBe('');
    const outcome = SummarizeBuildResult({ ...published, untrainedExperiments: ['B', 'C'] });
    expect(BuildOutcomeMessage(outcome)).toContain('The other 2 proposed experiments (B, C) were not trained');
    expect(SummarizeBuildResult(published).untrainedExperiments).toBeUndefined();
  });
  it('says a tournament with no measured candidate has no winner', () => {
    const md = GenerateMarkdownReport('Renewal', 'g', 'Renewed', 'AUC', null, 'Poor', 'x', false, [], [row(1, null, false), row(2, null, false)], false);
    expect(md).toContain('No candidate was measured, so no winner was picked.');
    expect(md).not.toContain('🏆');
    expect(md).not.toMatch(/inner-fold score/);
  });
});

describe('HiddenImportanceNote (M7)', () => {
  const lineage = (kind: string | null): string => JSON.stringify({ evaluation: { ImportanceKind: kind } });
  it('explains split/impurity counts for a tree model', () => {
    expect(HiddenImportanceNote(lineage('split_or_impurity'))).toBe(ImportanceDisplay.HiddenNote);
  });
  it('uses neutral wording for any other kind, including none and unknown', () => {
    expect(HiddenImportanceNote(lineage('none'))).toBe(UNSHOWN_IMPORTANCE_KIND_NOTE);
    expect(HiddenImportanceNote(lineage(null))).toBe(UNSHOWN_IMPORTANCE_KIND_NOTE);
    expect(HiddenImportanceNote(null)).toBe(UNSHOWN_IMPORTANCE_KIND_NOTE);
    expect(UNSHOWN_IMPORTANCE_KIND_NOTE).not.toContain('split or impurity');
  });
});

describe('GenerateMarkdownReport — copy (W1 → S9.3)', () => {
  const report = (features: Array<{ feature: string; importance: number }>, importanceHidden = true) =>
    GenerateMarkdownReport('Renewal', 'Predict renewal', 'Renewed', 'AUC', 0.72, 'Good', 'Right about 8 out of 10 times.', true, features, [], importanceHidden);
  it('prints the hidden-list note instead of inventing a ranking when importance is hidden', () => {
    const md = report([]);
    expect(md).toContain('split or impurity counts');
    expect(md).not.toMatch(/Features analyzed from source entity/);
  });
  it('prints a plain no-weights note when a coefficient model recorded no importance weights', () => {
    const md = report([], false);
    expect(md).toContain('No feature importance weights were recorded');
    expect(md).not.toContain('split or impurity counts');
  });
});

/** The model slice the agent reads off a build result; an unmeasured model has no metrics. */
function unmeasuredModel(id: string): MJMLModelEntity {
  // Test double at the entity boundary: the agent and the verdict read only these typed members.
  return {
    ID: id, Version: 1, Metrics: null, HoldoutMetrics: null, ProblemType: 'classification',
    FeatureImportance: null, Lineage: JSON.stringify({ evaluation: { ImportanceKind: 'split_or_impurity' } }),
  } as unknown as MJMLModelEntity;
}

/** A builder stub that "trains" one unmeasured model and reports it the way the real builder does without a search. */
class UnmeasuredBuilder extends PredictiveStudioPipelineBuilder {
  public override async Build(_input: BuildPredictionInput): Promise<BuildPredictionResult> {
    const model = unmeasuredModel('model-unmeasured');
    const trust = TrustVerdicts.DeriveTrustVerdict(model);
    const leaderboard = PredictiveStudioPipelineBuilder.SingleModelLeaderboard('run-1', model, trust, 'XGBoost');
    return {
      success: true, pipelineId: 'pipe-1', modelId: model.ID, model, trust, published: false, leakageFlagged: false,
      heldReason: trust.gateReason, errorMessage: null, leaderboard,
    };
  }
}

/** The agent with the builder seam stubbed and a provider supplied, exposing the protected run. */
class TestableBuilderAgent extends PredictiveStudioPipelineBuilderAgent {
  protected override createBuilder(): PredictiveStudioPipelineBuilder {
    return new UnmeasuredBuilder();
  }
  protected override get ProviderToUse(): IMetadataProvider {
    return {} as IMetadataProvider;
  }
  public async Run(payload: PredictiveStudioBuilderPayload): Promise<BaseAgentNextStep<PredictiveStudioBuilderPayload>> {
    // Test double for the framework params: executeAgentInternal reads only payload + contextUser.
    const params = { payload, contextUser: { ID: 'user-1' } as UserInfo } as unknown as ExecuteAgentParams;
    const { finalStep } = await this.executeAgentInternal<PredictiveStudioBuilderPayload>(params, {} as AgentConfiguration);
    return finalStep;
  }
}

const plan: ModelingPlanSpec = {
  Goal: 'Predict renewal',
  TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
  CandidateSources: [],
  CandidateFeatures: [],
  LeakageNotes: [],
  ProposedExperiments: [{ Label: 'x', AlgorithmName: 'XGBoost', FeatureSet: [], Rationale: 'r', Priority: 1 }],
  ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
  ProposedBudget: {},
};

describe('PredictiveStudioPipelineBuilderAgent.executeAgentInternal — unmeasured model', () => {
  it('reports the candidate as not measured, with no score and no winner', async () => {
    const step = await new TestableBuilderAgent().Run({ ...plan });
    const payload = step.newPayload as PredictiveStudioBuilderPayload;
    expect(payload.Leaderboard).toEqual([expect.objectContaining({ Metric: null, score: null, isWinner: false })]);
    expect(payload.Markdown).toContain('| 1 | XGBoost | not measured | Not measured |');
    expect(payload.Markdown).not.toContain('🏆');
    expect(payload.Markdown).not.toMatch(/0\.850|0\.833/);
    expect(payload.Markdown).toContain('**AUC** = **not measured**');
  });
});
