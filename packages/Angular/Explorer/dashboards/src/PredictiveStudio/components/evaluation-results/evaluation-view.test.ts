import { describe, it, expect } from 'vitest';
import { TrainingRunResultsParser } from '@memberjunction/predictive-studio-core';
import { EvaluationViews } from './evaluation-view';
import { WidgetFixtures } from './widget-fixtures';

describe('BuildEvaluationView', () => {
  it('reads a fixture envelope that the run-results parser accepts', () => {
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(WidgetFixtures.StoredRunJson());
    expect(parsed.Ok).toBe(true);
  });
  it('turns a run\'s stored trainer result and gate record into the rows the results widget shows', () => {
    const v = EvaluationViews.BuildEvaluationView({ ValidationResults: WidgetFixtures.StoredRunJson(), Lineage: null }, null);
    expect(v?.Outcome).toBe('keep-simple-baseline');
    expect(v?.OutcomeTitle).toBe('Ships — a simple baseline');
    expect(v?.Reason).toContain('0.0239 [0.0110, 0.0360]');
    expect(v?.Holdout).toEqual({ Metric: 'log-loss', Cell: { Value: 0.3712, Lower: 0.333, Upper: 0.413 }, Rows: 1205 });
    expect(v?.Baselines.map((b) => b.Name)).toEqual(['Flat guess (base rate / mean)', 'Best single feature', 'Simple model (GLM)']);
    expect(v?.VersusFlatGuess.map((r) => r.Member)).toEqual(['model (xgb)', 'glm', 'oneFeature']);
    expect(v?.InnerScores).toEqual([
      { Candidate: 'xgb', Cell: { Value: 0.371, Lower: 0.36, Upper: 0.382 }, IsFinalist: true },
      { Candidate: 'rf', Cell: { Value: 0.378, Lower: 0.366, Upper: 0.39 }, IsFinalist: false },
    ]);
    expect(v?.Calibration?.Slope).toBe(0.826);
    expect(v?.LeakageFlags).toEqual(['single-feature-auc: TicketCode']);
  });
  it('passes the model lineage to the verdict: a kept member fitted with the finalist\'s driver is not said to have beaten it', () => {
    const json = WidgetFixtures.StoredRunJson();
    const without = EvaluationViews.BuildEvaluationView({ ValidationResults: json, Lineage: null }, null);
    const shared = EvaluationViews.BuildEvaluationView({ ValidationResults: json, Lineage: JSON.stringify({ shippedMember: 'glm', shippedDriver: 'xgboost' }) }, null);
    expect(without?.Headline).toContain('the trained model did not beat it');
    expect(shared?.Headline).not.toContain('the trained model did not beat it');
  });
  it('returns null for a run without a stored trainer result or gate record', () => {
    expect(EvaluationViews.BuildEvaluationView({ ValidationResults: JSON.stringify({ metrics: { auc: 0.9 } }), Lineage: null }, null)).toBeNull();
    expect(EvaluationViews.BuildEvaluationView({ ValidationResults: null, Lineage: null }, null)).toBeNull();
    expect(EvaluationViews.BuildEvaluationView({ ValidationResults: WidgetFixtures.StoredRunJson({ gate: null }), Lineage: null }, null)).toBeNull();
    expect(EvaluationViews.BuildEvaluationView({ ValidationResults: WidgetFixtures.StoredRunJson({ trainer: null }), Lineage: null }, null)).toBeNull();
  });
  it('reads the snapshot counts: rows read, resolved, censored, label-known, empty-label and duplicate rows, and the uncovered history rows', () => {
    const uncovered = JSON.stringify([{ entity: 'Members', field: 'Tier', rows: 12 }]);
    const v = EvaluationViews.BuildEvaluationView({ ValidationResults: WidgetFixtures.StoredRunJson(), Lineage: null }, uncovered);
    expect(v?.Rows).toEqual({
      Read: 6673, Resolved: 4873, Censored: 1756, LabelKnown: 44, EmptyLabel: 0, Duplicates: 0, DataCutoff: '2026-07-30',
      Uncovered: { Kind: 'counted', Fields: [{ Entity: 'Members', Field: 'Tier', Rows: 12 }] },
    });
  });
  it('says when the run has no snapshot, and when the snapshot\'s uncovered counts cannot be read', () => {
    const json = WidgetFixtures.StoredRunJson();
    expect(EvaluationViews.BuildEvaluationView({ ValidationResults: json, Lineage: null }, null)?.Rows.Uncovered).toEqual({ Kind: 'no-snapshot' });
    expect(EvaluationViews.BuildEvaluationView({ ValidationResults: json, Lineage: null }, '[{"entity":"Members"}]')?.Rows.Uncovered.Kind).toBe('unreadable');
    expect(EvaluationViews.BuildEvaluationView({ ValidationResults: json, Lineage: null }, '[]')?.Rows.Uncovered).toEqual({ Kind: 'counted', Fields: [] });
  });
  it('formats a value with its interval', () => {
    expect(EvaluationViews.FormatInterval({ Value: 0.0177, Lower: 0.0098, Upper: 0.0254 })).toBe('0.0177 [0.0098, 0.0254]');
  });
});

describe('DescribeRun', () => {
  const run = (ValidationResults: string | null, RunStatus: 'Completed' | 'Failed' | 'Pending' | 'Pruned' | 'Running' | null = 'Completed') =>
    EvaluationViews.DescribeRun({ ValidationResults, Lineage: null, RunStatus, UncoveredHistoryRows: null });

  it('is evaluated for a completed run with a trainer result and a gate record', () => {
    const s = run(WidgetFixtures.StoredRunJson());
    expect(s.Kind === 'evaluated' && s.View.Outcome).toBe('keep-simple-baseline');
  });
  it('is not evaluated for no run, results stored before protocol training, and a completed run without a gate', () => {
    expect(run(null, null)).toEqual({ Kind: 'not-evaluated' });
    expect(run(JSON.stringify({ metrics: { auc: 0.9 } }))).toEqual({ Kind: 'not-evaluated' });
    expect(run(WidgetFixtures.StoredRunJson({ gate: null }))).toEqual({ Kind: 'not-evaluated' });
  });
  it('is not finished for a pending or running run without results', () => {
    expect(run(null, 'Running')).toEqual({ Kind: 'not-finished', RunStatus: 'Running' });
    expect(run('', 'Pending')).toEqual({ Kind: 'not-finished', RunStatus: 'Pending' });
  });
  it('is refused, with the stage and the reason in words, for a refused run', () => {
    expect(run(WidgetFixtures.RefusedRunJson(), 'Failed')).toEqual({
      Kind: 'refused', Stage: 'carve',
      Detail: 'No row is dated on or after the cutoff 2026-01-01; there is nothing to test on. Choose an earlier cutoff.',
    });
  });
  it('is unreadable for a tagged envelope that does not parse', () => {
    const s = run(JSON.stringify({ schema: 'ps-run-results/v2', status: 'completed' }));
    expect(s.Kind).toBe('unreadable');
  });
});
