import { describe, it, expect } from 'vitest';
import {
  LegacyPipelines, LEGACY_PROTOCOL_SEED, TIME_INDEX_HOLD_REASON,
  type LegacyOutcomeInputs, type LegacyPipelineFields,
} from '../legacy-pipeline';
import { PredictionUnit } from '../prediction-unit';
import { ProtocolRows } from '../protocol-rows';
import { EvaluationProtocolRules } from '../evaluation-protocol-rules';

const pipeline = (over: Partial<LegacyPipelineFields> = {}): LegacyPipelineFields => ({
  Name: 'Member Renewal Risk', TargetEntity: 'Membership Years', TargetVariable: 'Renewed', ProblemType: 'classification',
  AsOfStrategy: JSON.stringify({ Mode: 'column', Column: 'StartDate' }), ValidationStrategy: null, ...over,
});
const outcome = (over: Partial<LegacyOutcomeInputs> = {}): LegacyOutcomeInputs => ({
  FeatureSteps: null, Hyperparameters: null, ModelLineage: null, TargetVariable: 'Renewed', ProblemType: 'classification', ...over,
});
const LegacyCandidatesFor = (target: string): ReturnType<typeof LegacyPipelines.LegacyOutcomeCandidates> => LegacyPipelines.LegacyOutcomeCandidates(outcome({ TargetVariable: target }));

describe('LegacyUnitInputs', () => {
  it('maps a column as-of classification pipeline to a binary grain unit decided on that column', () => {
    const r = LegacyPipelines.LegacyUnitInputs(pipeline(), ['true', 'false'], '2026-10-20', LegacyPipelines.LegacyOutcomeCandidates(outcome()));
    if (r.Kind !== 'unit') throw new Error(r.Reason);
    expect(r.Draft.UnitRows).toEqual({ kind: 'grain', grainEntity: 'Membership Years', decisionDate: { kind: 'column', column: 'StartDate' }, filter: [] });
    expect(r.Draft.LabelRule).toEqual({ kind: 'column', column: 'Renewed' });
    // "Renewed" has positive polarity (ResolveOutcomeConfig): the lower class of the legacy order is adverse.
    expect(r.Draft.TaskType).toEqual({ kind: 'binary', classOrder: ['false', 'true'], adverseIndex: 0 });
    expect(r.Draft.Censoring).toEqual({ rule: 'exclude-unresolved', cutoff: { kind: 'now' } });
    expect(r.DateColumn).toBe('StartDate');
    expect(r.Notes).toContain('class order false, true; adverse class false (target-name polarity: Polarity positive)');
  });
  it('fixes the decision date at the migration day, advancing each run, when the pipeline had no as-of', () => {
    const r = LegacyPipelines.LegacyUnitInputs(pipeline({ AsOfStrategy: null, ProblemType: 'regression' }), [], '2026-10-20', []);
    if (r.Kind !== 'unit') throw new Error(r.Reason);
    expect(r.Draft.UnitRows).toEqual({ kind: 'grain', grainEntity: 'Membership Years', decisionDate: { kind: 'fixed', date: '2026-10-20', advance: 'each-run' }, filter: [] });
    expect(r.Draft.Censoring).toEqual({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-10-21' } });
    expect(r.Draft.TaskType).toEqual({ kind: 'continuous' });
    expect(r.DateColumn).toBeNull();
  });
  it('archives what has no Prediction Unit form and holds a binary target whose adverse class nothing declares', () => {
    expect(LegacyPipelines.LegacyUnitInputs(pipeline({ AsOfStrategy: JSON.stringify({ Mode: 'offset', OffsetDays: 30 }) }), ['a', 'b'], '2026-10-20', []))
      .toEqual({ Kind: 'archive', Reason: 'offset as-of cannot be expressed as a Prediction Unit' });
    expect(LegacyPipelines.LegacyUnitInputs(pipeline(), ['1'], '2026-10-20', [])).toEqual({ Kind: 'archive', Reason: 'single-valued target (1 class observed)' });
    expect(LegacyPipelines.LegacyUnitInputs(pipeline({ ProblemType: 'sequence' }), ['a', 'b'], '2026-10-20', []))
      .toEqual({ Kind: 'archive', Reason: 'an HMM latent state has no outcome window' });
    const neutral = LegacyCandidatesFor('Segment');
    expect(LegacyPipelines.LegacyUnitInputs(pipeline({ TargetVariable: 'Segment' }), ['A', 'B'], '2026-10-20', neutral)).toEqual({
      Kind: 'hold',
      Reason: 'adverse class undetermined: no OutcomeConfig polarity or red/green class style on the pipeline, its newest model or the target name; set FeatureSteps.OutcomeConfig.Polarity (or OutcomeStyles) and run this Action again',
    });
  });
});

describe('LegacyAdverseClass', () => {
  it('takes the first source that decides: a red class style, then polarity against the legacy score P(classOrder[1])', () => {
    const styled = LegacyPipelines.LegacyOutcomeCandidates(outcome({ FeatureSteps: JSON.stringify({ Steps: [], OutcomeConfig: { OutcomeStyles: { Lapsed: { BadgeColor: 'red' }, Renewed: { BadgeColor: 'green' } } } }) }));
    expect(LegacyPipelines.LegacyAdverseClass(['Lapsed', 'Renewed'], styled)).toEqual({ Kind: 'decided', AdverseIndex: 0, Source: 'pipeline-outcome-config', Evidence: 'OutcomeStyles Lapsed red' });
    const churn = LegacyPipelines.LegacyOutcomeCandidates(outcome({ TargetVariable: 'Status', Hyperparameters: JSON.stringify({ outcomeConfig: { Polarity: 'adverse' } }) }));
    expect(LegacyPipelines.LegacyAdverseClass(['0', '1'], churn)).toEqual({ Kind: 'decided', AdverseIndex: 1, Source: 'pipeline-outcome-config', Evidence: 'Polarity adverse' });
    const fromModel = LegacyPipelines.LegacyOutcomeCandidates(outcome({ TargetVariable: 'Status', ModelLineage: JSON.stringify({ outcomeConfig: { Polarity: 'positive' } }) }));
    expect(LegacyPipelines.LegacyAdverseClass(['0', '1'], fromModel)).toEqual({ Kind: 'decided', AdverseIndex: 0, Source: 'model-lineage-outcome-config', Evidence: 'Polarity positive' });
    // an explicit pipeline config wins over the target-name polarity ("renew" is positive, the config says adverse)
    const overridden = LegacyPipelines.LegacyOutcomeCandidates(outcome({ FeatureSteps: JSON.stringify({ OutcomeConfig: { Polarity: 'adverse' } }) }));
    expect(LegacyPipelines.LegacyAdverseClass(['0', '1'], overridden)).toMatchObject({ Kind: 'decided', AdverseIndex: 1, Source: 'pipeline-outcome-config' });
    expect(LegacyPipelines.LegacyAdverseClass(['A', 'B'], LegacyCandidatesFor('Segment'))).toMatchObject({ Kind: 'undetermined' });
  });
});

describe('LegacyProtocolInputs', () => {
  const dates = ['2020-05-01', '2021-05-01', '2022-05-01', '2023-05-01', '2024-05-01', '2024-06-01', '2024-07-01', '2024-08-01'];
  it('turns the trailing holdout fraction into a date cutoff, k-fold into repeated folds and the deny lists into exclusions', () => {
    const r = LegacyPipelines.LegacyProtocolInputs(JSON.stringify({ Strategy: 'kfold', K: 4, LockedHoldoutFraction: 0.5 }), JSON.stringify({ DenyFields: ['Status'], DenySources: [], SingleFeatureDominanceThreshold: 0.6 }), 'StartDate', dates);
    if (r.Kind !== 'protocol') throw new Error(r.Reason);
    expect(r.Holdout).toEqual({ kind: 'date-carved', dateColumn: 'StartDate', cutoff: '2024-05-01', holdoutEnd: null, newEntityReport: null });
    expect(r.InnerValidation).toEqual({ kind: 'repeated-stratified-kfold', folds: 4, repeats: 3 });
    expect(r.Exclusions).toEqual({ denyFields: ['Status'], denySources: [] });
    expect(r.Notes).toContain('SingleFeatureDominanceThreshold 0.6 not carried: the held-out single-feature AUC audit replaces it.');
  });
  it('uses the defaults for a missing strategy and refuses dates that leave no development rows', () => {
    const r = LegacyPipelines.LegacyProtocolInputs(null, 'not json', 'StartDate', dates);
    expect(r.Kind === 'protocol' && r.InnerValidation).toBeNull();
    expect(r.Kind === 'protocol' && r.Notes).toContain('ValidationStrategy missing or unreadable: defaults used.');
    expect(LegacyPipelines.LegacyProtocolInputs(null, null, 'StartDate', ['2024-01-01', '2024-01-01'])).toEqual({ Kind: 'archive', Reason: 'every row has the same StartDate (2024-01-01): no date cutoff leaves development rows' });
  });
  it('gives a fixed-date unit a seeded-random holdout of the legacy share', () => {
    const r = LegacyPipelines.LegacyProtocolInputs(JSON.stringify({ LockedHoldoutFraction: 0.8 }), null, null, []);
    if (r.Kind !== 'protocol') throw new Error(r.Reason);
    expect(r.Holdout).toEqual({ kind: 'seeded-random', fraction: 0.5 });
    expect(r.Notes).toContain('test set = a seeded random 50% of rows (one decision date per run); the legacy trailing slice in key order is gone');
  });
});

describe('TrailingShareCutoff', () => {
  it('is the earliest day whose trailing block holds at most the share, and never the first day', () => {
    expect(LegacyPipelines.TrailingShareCutoff(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'], 0.25)).toBe('2024-01-04');
    expect(LegacyPipelines.TrailingShareCutoff(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'], 0.5)).toBe('2024-01-03');
    expect(LegacyPipelines.TrailingShareCutoff(['2024-01-01', '2024-01-01'], 0.5)).toBeNull();
  });
});

describe('LegacyAdverseClass within one source', () => {
  it('takes a single green class as the non-adverse one when no class is red', () => {
    const green = LegacyPipelines.LegacyOutcomeCandidates(outcome({ TargetVariable: 'Status', FeatureSteps: JSON.stringify({ OutcomeConfig: { OutcomeStyles: { B: { BadgeColor: 'green' } } } }) }));
    expect(LegacyPipelines.LegacyAdverseClass(['A', 'B'], green)).toEqual({ Kind: 'decided', AdverseIndex: 0, Source: 'pipeline-outcome-config', Evidence: 'OutcomeStyles B green' });
    const greenFirst = LegacyPipelines.LegacyOutcomeCandidates(outcome({ TargetVariable: 'Status', FeatureSteps: JSON.stringify({ OutcomeConfig: { OutcomeStyles: { A: { BadgeColor: 'green' } } } }) }));
    expect(LegacyPipelines.LegacyAdverseClass(['A', 'B'], greenFirst)).toMatchObject({ Kind: 'decided', AdverseIndex: 1 });
  });
  it('lets a red class win over a contrary polarity in the same source', () => {
    const both = LegacyPipelines.LegacyOutcomeCandidates(outcome({ TargetVariable: 'Status', FeatureSteps: JSON.stringify({ OutcomeConfig: { Polarity: 'adverse', OutcomeStyles: { A: { BadgeColor: 'red' } } } }) }));
    expect(LegacyPipelines.LegacyAdverseClass(['A', 'B'], both)).toMatchObject({ Kind: 'decided', AdverseIndex: 0, Evidence: 'OutcomeStyles A red' });
  });
});

describe('LegacyUnitInputs for three or more classes', () => {
  it('maps a multiclass target to the classes the first declaring source styles red', () => {
    const styled = LegacyPipelines.LegacyOutcomeCandidates(outcome({ TargetVariable: 'Tier', FeatureSteps: JSON.stringify({ OutcomeConfig: { OutcomeStyles: { lapsed: { BadgeColor: 'red' }, gold: { BadgeColor: 'green' } } } }) }));
    const r = LegacyPipelines.LegacyUnitInputs(pipeline({ TargetVariable: 'Tier' }), ['silver', 'lapsed', 'gold', ' silver '], '2026-10-20', styled);
    if (r.Kind !== 'unit') throw new Error(r.Kind);
    expect(r.Draft.TaskType).toEqual({ kind: 'multiclass', classOrder: ['gold', 'lapsed', 'silver'], adverseIndices: [1] });
    expect(r.Notes[0]).toBe('class order gold, lapsed, silver; adverse classes lapsed (pipeline OutcomeConfig: red OutcomeStyles)');
    const none = LegacyPipelines.LegacyUnitInputs(pipeline({ TargetVariable: 'Tier' }), ['a', 'b', 'c'], '2026-10-20', LegacyCandidatesFor('Tier'));
    expect(none.Kind === 'unit' && none.Draft.TaskType).toEqual({ kind: 'multiclass', classOrder: ['a', 'b', 'c'], adverseIndices: [] });
  });
  it('archives a column-mode as-of that names no column and keeps the report text free of plan ids', () => {
    expect(LegacyPipelines.LegacyUnitInputs(pipeline({ AsOfStrategy: JSON.stringify({ Mode: 'column' }) }), ['a', 'b'], '2026-10-20', []))
      .toEqual({ Kind: 'archive', Reason: 'AsOfStrategy column mode names no column' });
    const r = LegacyPipelines.LegacyUnitInputs(pipeline({ ProblemType: 'regression' }), [], '2026-10-20', []);
    expect(r.Kind === 'unit' && r.Notes[0]).toBe('declared continuous; a count or a non-negative amount is a different task and is declared in a new unit version');
  });
});

describe('LegacyProtocolInputs edge rules', () => {
  const dates = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01'];
  it('takes at least two folds from a k-fold strategy and clamps a zero holdout fraction to the smallest share', () => {
    const r = LegacyPipelines.LegacyProtocolInputs(JSON.stringify({ Strategy: 'kfold', K: 1, LockedHoldoutFraction: 0 }), null, null, []);
    if (r.Kind !== 'protocol') throw new Error(r.Reason);
    expect(r.InnerValidation).toEqual({ kind: 'repeated-stratified-kfold', folds: 2, repeats: 3 });
    expect(r.Holdout).toEqual({ kind: 'seeded-random', fraction: 0.05 });
    const five = LegacyPipelines.LegacyProtocolInputs(JSON.stringify({ Strategy: 'kfold' }), null, 'StartDate', dates);
    expect(five.Kind === 'protocol' && five.InnerValidation).toEqual({ kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 });
  });
  it('uses the default share when the fraction is absent and reads the deny sources', () => {
    const r = LegacyPipelines.LegacyProtocolInputs(JSON.stringify({ Strategy: 'holdout' }), JSON.stringify({ DenySources: ['Payments', 7] }), 'StartDate', dates);
    if (r.Kind !== 'protocol') throw new Error(r.Reason);
    expect(r.Holdout).toEqual({ kind: 'date-carved', dateColumn: 'StartDate', cutoff: '2024-04-01', holdoutEnd: null, newEntityReport: null });
    expect(r.InnerValidation).toBeNull();
    expect(r.Exclusions).toEqual({ denyFields: [], denySources: ['Payments'] });
  });
});

describe('ClassLabel and LegacyProtocolDraft', () => {
  it('reads a target cell as the unit row reader labels a class', () => {
    expect([true, false, 1, 0.5, ' A ', '', null, undefined, Number.NaN].map((v) => LegacyPipelines.ClassLabel(v))).toEqual(['1', '0', '1', '0.5', 'A', null, null, null, null]);
    expect(LegacyPipelines.ClassLabel(new Date('2024-03-05T10:00:00Z'))).toBe('2024-03-05');
  });
  it('gives the default protocol one candidate, the legacy seed, holdout, folds and exclusions', () => {
    const r = LegacyPipelines.LegacyUnitInputs(pipeline({ AsOfStrategy: null }), ['1', '0'], '2026-10-20', LegacyCandidatesFor('Renewed'));
    if (r.Kind !== 'unit') throw new Error(r.Kind);
    const parsed = PredictionUnit.ParsePredictionUnitRow({ ID: 'U', LineageRootID: 'U', Version: 1, LabelVersion: 1, AuthoredBy: JSON.stringify({ kind: 'system', component: 'pipeline-migration' }), ...ProtocolRows.UnitDraftColumns(r.Draft) });
    if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
    const inputs = LegacyPipelines.LegacyProtocolInputs(JSON.stringify({ Strategy: 'kfold', K: 3, LockedHoldoutFraction: 0.15 }), JSON.stringify({ DenyFields: ['ID'] }), null, []);
    if (inputs.Kind !== 'protocol') throw new Error(inputs.Reason);
    const d = LegacyPipelines.LegacyProtocolDraft(parsed.Value, inputs, 'P — migrated protocol');
    expect([d.name, d.seed, d.budgets.maxCandidates, d.holdout, d.innerValidation, d.exclusions]).toEqual([
      'P — migrated protocol', LEGACY_PROTOCOL_SEED, 1, { kind: 'seeded-random', fraction: 0.15 }, { kind: 'repeated-stratified-kfold', folds: 3, repeats: 3 }, { denyFields: ['ID'], denySources: [] },
    ]);
    const plain = LegacyPipelines.LegacyProtocolInputs(null, null, null, []);
    if (plain.Kind !== 'protocol') throw new Error(plain.Reason);
    expect(LegacyPipelines.LegacyProtocolDraft(parsed.Value, plain, 'x').innerValidation).toEqual(EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: parsed.Value, Holdout: plain.Holdout, Candidates: 1, Seed: 0, Name: 'x' }).innerValidation);
  });
});

describe('LegacyUnitInputs for a time-indexed pipeline', () => {
  it('holds a pipeline that declares a time index, and archives what has no unit form before that', () => {
    const indexed = JSON.stringify({ Strategy: 'train_test_split', LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex' });
    expect(LegacyPipelines.LegacyUnitInputs(pipeline({ AsOfStrategy: null, ProblemType: 'regression', ValidationStrategy: indexed }), [], '2026-10-20', []))
      .toEqual({ Kind: 'hold', Reason: TIME_INDEX_HOLD_REASON });
    expect(LegacyPipelines.LegacyUnitInputs(pipeline({ ProblemType: 'sequence', ValidationStrategy: indexed }), [], '2026-10-20', [])).toMatchObject({ Kind: 'archive' });
    const plain = LegacyPipelines.LegacyUnitInputs(pipeline({ AsOfStrategy: null, ProblemType: 'regression', ValidationStrategy: JSON.stringify({ TimeIndexColumn: '' }) }), [], '2026-10-20', []);
    expect(plain.Kind).toBe('unit');
  });
});
