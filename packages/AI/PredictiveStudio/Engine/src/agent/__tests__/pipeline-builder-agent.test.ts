import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, EntityInfo, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { TRAINING_RUN_RESULTS_SCHEMA, TrustVerdicts, ImportanceDisplay, type GateDecision, type ModelingPlanSpec, type StoredGateRecord } from '@memberjunction/predictive-studio-core';
import {
  SummarizeBuildResult,
  BuildOutcomeMessage,
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
/** A run's stored results whose gate decision is `decision`, measured on 500 holdout rows. */
function storedRun(decision: GateDecision, reason: string): string {
  const gate: StoredGateRecord = {
    evaluationProtocolId: 'EP-1', margin: 0, primaryMetric: 'log-loss', holdoutRows: 500,
    intervals: { modelName: 'xgb', modelVsDummy: { value: 0.02, lower: 0.01, upper: 0.03 }, modelVsBestSimple: null, memberVsDummy: { glm: { value: 0.015, lower: 0.005, upper: 0.025 } }, memberScores: { glm: 0.4 }, deliveredMember: null },
    guards: { taskKind: 'binary', holdoutClassCounts: { '0': 400, '1': 100 }, modelAucInterval: { level: 0.95, lower: 0.6, upper: 0.7 }, minMinorityClassRows: 20 },
    transcribed: decision, decision, guardRefusal: null,
    reason: { code: decision.outcome === 'no-signal' ? 'nothing-beats-dummy' : 'only-model-beats-dummy', text: reason },
    incumbentDiff: null, sliceCoverage: { missingSubgroups: [], missingPeriods: [], slicesWithoutInterval: 0 },
  };
  return JSON.stringify({
    schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
    unitResolution: { rowsRead: 500, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 500, dataCutoff: '2026-07-30' },
    legacy: null, legacyRequest: null, trainer: null, trainerRequest: null, carve: null, gate,
  });
}
const shippedTrust = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: storedRun({ outcome: 'model', branch: 'a:Q15-only-model-beats-dummy', shipped: 'xgb', shippedRole: 'model', note: null }, 'The model beats the flat guess.'), Lineage: null });
const noSignalTrust = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: storedRun({ outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null }, 'Nothing beats the flat guess, so nothing ships.'), Lineage: null });
const published: BuildPredictionResult = {
  success: true, pipelineId: 'p1', modelId: 'm1', published: true, leakageFlagged: false, heldReason: null, errorMessage: null, trust: shippedTrust,
};
const held: BuildPredictionResult = {
  success: true, pipelineId: 'p2', modelId: 'm2', published: false, leakageFlagged: false, errorMessage: null,
  heldReason: noSignalTrust.Reason, trust: noSignalTrust,
};
const failed: BuildPredictionResult = { success: false, published: false, leakageFlagged: false, heldReason: null, errorMessage: 'Algorithm not found' };

describe('SummarizeBuildResult', () => {
  it('projects a published result', () => {
    expect(SummarizeBuildResult(published)).toMatchObject({
      success: true, pipelineId: 'p1', modelId: 'm1', published: true, heldReason: null, errorMessage: null,
      TrustTitle: 'Ships — the model beats the flat guess', Headline: 'Beats the flat guess by 0.0200 [0.0100, 0.0300] (log-loss).',
    });
  });
  it('projects a HELD result, carrying the stored reason (the safety gate)', () => {
    const o = SummarizeBuildResult(held);
    expect(o.published).toBe(false);
    expect([o.TrustTitle, o.Headline]).toEqual(['No signal — not usable', 'No signal: nothing beats the flat guess.']);
    expect(o.heldReason).toBe('Nothing beats the flat guess, so nothing ships.');
  });
  it('projects no title or headline when the build trained no model', () => {
    const o = SummarizeBuildResult({ ...held, trust: undefined });
    expect([o.TrustTitle, o.Headline]).toEqual([undefined, undefined]);
  });
  it('projects a failed build', () => {
    expect(SummarizeBuildResult(failed)).toMatchObject({ success: false, published: false, errorMessage: 'Algorithm not found' });
  });
});

describe('BuildOutcomeMessage', () => {
  it('describes published / held / failed in plain language', () => {
    expect(BuildOutcomeMessage(SummarizeBuildResult(published))).toBe("Done — I built and published your prediction (Ships — the model beats the flat guess). It's now in your Predictions.");
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
      'Ships — the model beats the flat guess',
      'Beats the flat guess by 0.0200 [0.0100, 0.0300] (log-loss).',
      true,
      [{ feature: 'DuesAmount', importance: 0.45 }],
      [],
      false,
    );
    expect(md).toContain('# Model Development Results: Member Renewal Risk');
    expect(md).toContain('**AUC** = **0.864**');
    expect(md).toContain('DuesAmount');
    expect(md).toContain('Published to Catalog');
    expect(md).toContain('## Executive Summary\nBeats the flat guess by 0.0200 [0.0100, 0.0300] (log-loss).');
    expect(md).toContain('- **Outcome**: **Ships — the model beats the flat guess** (Published to Catalog)');
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

describe('GenerateMarkdownReport — model not evaluated', () => {
  it('says the metric was not measured and names the not-evaluated outcome', () => {
    const md = GenerateMarkdownReport('Renewal', 'Predict renewal', 'Renewed', 'AUC', null, 'Not evaluated yet', 'Not evaluated yet.', false, [], [], false);
    expect(md).toContain('**AUC** = **not measured**');
    expect(md).not.toMatch(/0\.850/);
    expect(md).toContain('**Outcome**: **Not evaluated yet** (Held for Review)');
    expect(md).not.toMatch(/Poor|Trust Grade/);
  });
});

describe('GenerateMarkdownReport — measurement copy (M8)', () => {
  const row = (rank: number, score: number | null, isWinner: boolean): MLLeaderboardEntryPayload => ({
    IterationID: `m${rank}`, Metric: score, rank, algorithm: `Algo ${rank}`, score, metricName: score === null ? null : 'AUC', isWinner,
  });
  it('says nothing about picking a winner for a single-model build', () => {
    const md = GenerateMarkdownReport('Renewal', 'g', 'Renewed', 'AUC', 0.8, 'Ships — the model beats the flat guess', 'ok', true, [], [row(1, 0.8, true)], false);
    expect(md).not.toMatch(/winner was picked/);
    expect(md).toContain('## Model Performance');
  });
  it('says a search picked its winner on optimistic inner-fold scores and read the held-back rows once, and prints each interval', () => {
    const searchRow = (rank: number, mean: number, isWinner: boolean): MLLeaderboardEntryPayload => ({
      IterationID: 'run-1', Metric: mean, rank, algorithm: `Algo ${rank}`, score: mean, metricName: 'log-loss', innerLower: mean - 0.02, innerUpper: mean + 0.02, optimistic: true, isWinner,
    });
    const md = GenerateMarkdownReport('Renewal', 'g', 'Renewed', 'AUC', 0.8, 'Ships — the model beats the flat guess', 'ok', true, [], [searchRow(1, 0.4, false), searchRow(2, 0.41, true)], false);
    expect(md).toContain('The winner is the simplest candidate whose inner-fold score is within one standard error of the best; inner-fold scores are optimistic, and the held-back rows were read once, for the winner.');
    expect(md).toContain('| Rank | Algorithm | Inner-CV log-loss [95% interval] (optimistic) | Status |');
    expect(md).toContain('| 1 | Algo 1 | 0.400 [0.380, 0.420] | Evaluated |');
    expect(md).toContain('| 2 | Algo 2 | 0.410 [0.390, 0.430] | 🏆 Winner (Selected) |');
    expect(md).toContain('## Winning Model Performance');
  });
  it('names the proposed experiments a build without a search did not train', () => {
    const md = GenerateMarkdownReport('Renewal', 'g', 'Renewed', 'AUC', 0.8, 'Ships — the model beats the flat guess', 'ok', true, [], [row(1, 0.8, true)], false, ImportanceDisplay.HiddenNote, ['B', 'C']);
    expect(md).toContain('- The score comes from the rows held back from training. The other 2 proposed experiments (B, C) were not trained: a search over several candidates needs a Prediction Unit on the pipeline.');
    expect(md).toContain('| Rank | Algorithm | Score (AUC) | Status |');
    expect(BuildOutcomeMessage(SummarizeBuildResult({ ...published, untrainedExperiments: ['B'] }))).toContain('The other proposed experiment (B) was not trained: a search over several candidates needs a Prediction Unit on the pipeline.');
    const none = GenerateMarkdownReport('Renewal', 'g', 'Renewed', 'AUC', 0.8, 'Ships — the model beats the flat guess', 'ok', true, [], [row(1, 0.8, true)], false, ImportanceDisplay.HiddenNote, []);
    expect(none).toContain('- The score comes from the rows held back from training.\n');
    const outcome = SummarizeBuildResult({ ...published, untrainedExperiments: ['B', 'C'] });
    expect(BuildOutcomeMessage(outcome)).toContain('The other 2 proposed experiments (B, C) were not trained');
    expect(SummarizeBuildResult(published).untrainedExperiments).toBeUndefined();
  });
  it('says a tournament with no measured candidate has no winner', () => {
    const md = GenerateMarkdownReport('Renewal', 'g', 'Renewed', 'AUC', null, 'Not evaluated yet', 'x', false, [], [row(1, null, false), row(2, null, false)], false);
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

describe('GenerateMarkdownReport — copy', () => {
  const report = (features: Array<{ feature: string; importance: number }>, importanceHidden = true) =>
    GenerateMarkdownReport('Renewal', 'Predict renewal', 'Renewed', 'AUC', 0.72, 'Ships — the model beats the flat guess', 'Beats the flat guess by 0.0200 [0.0100, 0.0300] (log-loss).', true, features, [], importanceHidden);
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

/** The model slice the agent reads off a build result; its run stores no gate decision, so it is not evaluated. */
function unmeasuredModel(id: string): MJMLModelEntity {
  // Test double at the entity boundary: the agent reads only these typed members.
  return {
    ID: id, Version: 1, Metrics: null, HoldoutMetrics: null, ProblemType: 'classification',
    FeatureImportance: null, Lineage: JSON.stringify({ evaluation: { ImportanceKind: 'split_or_impurity' } }),
  } as unknown as MJMLModelEntity;
}

/** A builder stub that "trains" one model whose run stores no gate decision, reported the way the real builder does without a search. */
class UnmeasuredBuilder extends PredictiveStudioPipelineBuilder {
  public override async Build(_input: BuildPredictionInput): Promise<BuildPredictionResult> {
    const model = unmeasuredModel('model-unmeasured');
    const trust = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: null, Lineage: null });
    const leaderboard = PredictiveStudioPipelineBuilder.SingleModelLeaderboard('run-1', model, trust.Comparison, 'XGBoost');
    return {
      success: true, pipelineId: 'pipe-1', modelId: model.ID, model, trust, published: false, leakageFlagged: false,
      heldReason: trust.Reason, errorMessage: null, leaderboard,
    };
  }
}

/** A builder stub whose one model's run stores a gate decision that ships it. */
class ShippedBuilder extends PredictiveStudioPipelineBuilder {
  public override async Build(_input: BuildPredictionInput): Promise<BuildPredictionResult> {
    const model = unmeasuredModel('model-shipped');
    const leaderboard = PredictiveStudioPipelineBuilder.SingleModelLeaderboard('run-1', model, shippedTrust.Comparison, 'XGBoost');
    return {
      success: true, pipelineId: 'pipe-1', modelId: model.ID, model, trust: shippedTrust, published: true, leakageFlagged: false,
      heldReason: null, errorMessage: null, leaderboard,
    };
  }
}

/** The agent with the builder seam stubbed and a provider supplied, exposing the protected run. */
class TestableBuilderAgent extends PredictiveStudioPipelineBuilderAgent {
  constructor(private readonly builder: PredictiveStudioPipelineBuilder = new UnmeasuredBuilder()) {
    super();
  }
  protected override createBuilder(): PredictiveStudioPipelineBuilder {
    return this.builder;
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
    expect(payload.Markdown).toContain('**Outcome**: **Not evaluated yet** (Held for Review)');
    expect(payload.Summary).toBe('Not evaluated yet.');
  });
});

describe('PredictiveStudioPipelineBuilderAgent.executeAgentInternal — a shipped model', () => {
  it("reports the stored comparison with the flat guess, its metric, the outcome title and the verdict's headline", async () => {
    const step = await new TestableBuilderAgent(new ShippedBuilder()).Run({ ...plan });
    const payload = step.newPayload as PredictiveStudioBuilderPayload;
    expect(payload.Leaderboard).toEqual([expect.objectContaining({ Metric: 0.02, score: 0.02, metricName: 'log-loss', isWinner: true })]);
    expect(payload.Markdown).toContain('**log-loss gain over the flat guess** = **0.020**');
    expect(payload.Markdown).toContain('**Outcome**: **Ships — the model beats the flat guess** (Published to Catalog)');
    expect(payload.Summary).toBe('Beats the flat guess by 0.0200 [0.0100, 0.0300] (log-loss).');
    expect(payload.TargetMetric).toBe('AUC');
  });
});

/** A builder stub whose training run shipped no model (the gate decided no-signal): built, held with the stored reason. */
class NoModelBuilder extends PredictiveStudioPipelineBuilder {
  public Specs: ModelingPlanSpec[] = [];
  public override async Build(input: BuildPredictionInput): Promise<BuildPredictionResult> {
    this.Specs.push(input.spec);
    return {
      success: true, pipelineId: 'pipe-1', published: false, leakageFlagged: false, errorMessage: null, leaderboard: [],
      heldReason: 'Not published — the training run shipped no model: Neither the model nor any simple baseline beats the flat guess.',
    };
  }
}

describe('PredictiveStudioPipelineBuilderAgent.executeAgentInternal — a build that shipped no model', () => {
  it('names no best model and no version, and says why nothing shipped', async () => {
    const step = await new TestableBuilderAgent(new NoModelBuilder()).Run({ ...plan });
    const payload = step.newPayload as PredictiveStudioBuilderPayload;
    expect([payload.BestModel, payload.BestModelID]).toEqual([undefined, undefined]);
    expect(payload.Summary).toBe("I built and trained the prediction, but I'm holding it back: Not published — the training run shipped no model: Neither the model nor any simple baseline beats the flat guess.");
    expect(step.reasoning).toBe(payload.Summary);
    expect(payload.Markdown).toContain('**Outcome**: **No model shipped** (Held for Review)');
  });

  it("builds from the plan without a previous build's results leaderboard", async () => {
    const builder = new NoModelBuilder();
    const previous: MLLeaderboardEntryPayload = { IterationID: 'run-0', Metric: null, score: null, isWinner: false };
    await new TestableBuilderAgent(builder).Run({ ...plan, Leaderboard: [previous] });
    expect(builder.Specs).toHaveLength(1);
    expect('Leaderboard' in builder.Specs[0]).toBe(false);
    expect(builder.Specs[0].Goal).toBe('Predict renewal');
  });
});
