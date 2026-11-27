/**
 * B2 attacks on {@link FeaturePinResolver}: a pin is resolved at train time from the pipeline's Active `MJ: Feature
 * Pipeline Versions` row (an `llm-derived` step) or from the scoring binding and its pipeline's Published model (a
 * `model-prediction` step, D5-B2-2); a step with no resolvable pin refuses typed. The provider is a stub whose
 * `RunView` reads in-memory tables through {@link TableDataAccess}, which evaluates the filters the resolver writes.
 * Also the lineage half of attack 7: a stored prediction pin parses back from the unit lineage.
 */
import { describe, it, expect, vi } from 'vitest';
import { UserInfo, type RunViewParams } from '@memberjunction/core';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import type { FeatureStep, FeatureVersionPin, PredictionFeaturePin } from '@memberjunction/predictive-studio-core';
import { FeaturePinResolver } from '../feature-pin-resolver';
import type { SourceRow } from '../../data-access';
import { TableDataAccess } from '../../../__tests__/fakes/table-data-access';
import { UnitModelLineageParser } from '../../../training/unit-model-lineage';

/** A provider whose `RunView` answers from tables, evaluating `ExtraFilter` as the database would. */
class TableProvider extends DatabaseProviderStub {
  public readonly Reads: string[] = [];
  constructor(tables: Record<string, SourceRow[]>) {
    super();
    const access = new TableDataAccess(tables);
    this.RunView = vi.fn().mockImplementation(async (p: RunViewParams) => {
      this.Reads.push(p.EntityName || '');
      const r = await access.fetchRows({ EntityName: p.EntityName || '', ExtraFilter: p.ExtraFilter, Fields: p.Fields });
      return { Success: true, Results: r.Rows, TotalRowCount: r.TotalRowCount, ErrorMessage: '', RowCount: r.Rows.length, ExecutionTime: 0, UserViewRunID: '' };
    });
  }
}

const user = new UserInfo(null, { ID: 'U-1', Email: 'b2@example.com', Type: 'User', UserRoles: [] });
const RP = '11111111-1111-4111-8111-111111111111';

const versions = (status: 'Active' | 'Retired' | 'Candidate' = 'Active'): SourceRow[] => [
  { ID: 'FPV-2', RecordProcessID: RP, Version: 2, PromptVersionHash: 'ph-2', AIModelID: 'AIM-1', ParametersHash: 'pa-2', Status: 'Retired' },
  { ID: 'FPV-3', RecordProcessID: RP, Version: 3, PromptVersionHash: 'ph-3', AIModelID: 'AIM-1', ParametersHash: 'pa-3', Status: status },
];
const processes: SourceRow[] = [{ ID: RP, Name: 'Job Function Pipeline' }];
const llmStep = (ref: string): FeatureStep => ({ Id: 'llm', Kind: 'llm-derived', FeaturePipelineRef: ref, Columns: ['JobFunction'] });
const predictionStep = (bindingId = 'B-1', featureName = 'ChurnRisk'): FeatureStep => ({ Id: 'pred', Kind: 'model-prediction', ScoringBindingID: bindingId, FeatureName: featureName });
const bindings = (status: 'Active' | 'Withdrawn' = 'Active'): SourceRow[] => [{ ID: 'B-1', TargetEntityID: 'E-PE', FeatureName: 'ChurnRisk', MLTrainingPipelineID: 'TP-UP', Status: status }];
const models = (status: 'Published' | 'Validated' = 'Published'): SourceRow[] => [
  { ID: 'M-OLD', PipelineID: 'TP-UP', Status: 'Archived' },
  { ID: 'M-UP', PipelineID: 'TP-UP', Status: status },
];

describe('FeaturePinResolver — llm-derived steps (pipeline pins)', () => {
  it('pins the Record Process\'s Active version, its prompt version, AI model and parameters', async () => {
    const provider = new TableProvider({ 'MJ: Record Processes': processes, 'MJ: Feature Pipeline Versions': versions() });
    const expected: FeatureVersionPin = { featurePipelineRecordProcessId: RP, pipelineVersion: 3, promptVersionHash: 'ph-3', aiModelId: 'AIM-1', parametersHash: 'pa-3' };
    expect(await FeaturePinResolver.Resolve(llmStep(RP), provider, user)).toEqual(expected);
  });
  it('resolves a FeaturePipelineRef that names the Record Process', async () => {
    const provider = new TableProvider({ 'MJ: Record Processes': processes, 'MJ: Feature Pipeline Versions': versions() });
    expect(await FeaturePinResolver.Resolve(llmStep('Job Function Pipeline'), provider, user)).toMatchObject({ featurePipelineRecordProcessId: RP, pipelineVersion: 3 });
  });
  it('attack 5: refuses unpinned-feature-version when the pipeline has no Active version', async () => {
    const provider = new TableProvider({ 'MJ: Record Processes': processes, 'MJ: Feature Pipeline Versions': versions('Candidate') });
    expect(await FeaturePinResolver.Resolve(llmStep(RP), provider, user)).toEqual({ kind: 'unpinned-feature-version', featureName: 'JobFunction' });
  });
  it('attack 5: refuses unpinned-feature-version when the FeaturePipelineRef names no Record Process', async () => {
    const provider = new TableProvider({ 'MJ: Record Processes': processes, 'MJ: Feature Pipeline Versions': versions() });
    expect(await FeaturePinResolver.Resolve(llmStep('No Such Pipeline'), provider, user)).toEqual({ kind: 'unpinned-feature-version', featureName: 'JobFunction' });
  });
});

describe('FeaturePinResolver — model-prediction steps (prediction pins, D-058, D5-15, D5-B2-2)', () => {
  it('pins the binding and its pipeline\'s Published model', async () => {
    const provider = new TableProvider({ 'MJ: ML Model Scoring Bindings': bindings(), 'MJ: ML Models': models() });
    const expected: PredictionFeaturePin = { mlModelScoringBindingId: 'B-1', mlModelId: 'M-UP' };
    expect(await FeaturePinResolver.Resolve(predictionStep(), provider, user)).toEqual(expected);
  });
  it('D5-B2-2 attack: a binding whose serving model is missing refuses typed (unpinned-feature-version)', async () => {
    const provider = new TableProvider({ 'MJ: ML Model Scoring Bindings': bindings(), 'MJ: ML Models': models('Validated') });
    expect(await FeaturePinResolver.Resolve(predictionStep(), provider, user)).toEqual({ kind: 'unpinned-feature-version', featureName: 'ChurnRisk' });
  });
  it('refuses a withdrawn or unknown binding as unpinned', async () => {
    const withdrawn = new TableProvider({ 'MJ: ML Model Scoring Bindings': bindings('Withdrawn'), 'MJ: ML Models': models() });
    expect(await FeaturePinResolver.Resolve(predictionStep(), withdrawn, user)).toEqual({ kind: 'unpinned-feature-version', featureName: 'ChurnRisk' });
    const unknown = new TableProvider({ 'MJ: ML Model Scoring Bindings': bindings(), 'MJ: ML Models': models() });
    expect(await FeaturePinResolver.Resolve(predictionStep('B-404'), unknown, user)).toEqual({ kind: 'unpinned-feature-version', featureName: 'ChurnRisk' });
  });
  it('refuses a step whose FeatureName is not the binding\'s prediction feature (unresolved-column)', async () => {
    const provider = new TableProvider({ 'MJ: ML Model Scoring Bindings': bindings(), 'MJ: ML Models': models() });
    expect(await FeaturePinResolver.Resolve(predictionStep('B-1', 'NotTheFeature'), provider, user)).toEqual({ kind: 'unresolved-column', entity: 'MJ: ML Model Scoring Bindings', field: 'NotTheFeature' });
  });
  it('refuses a step kind that has no pin (unsupported-step-kind)', async () => {
    const provider = new TableProvider({});
    expect(await FeaturePinResolver.Resolve({ Id: 's', Kind: 'select', Columns: ['A'] }, provider, user)).toEqual({ kind: 'unsupported-step-kind', stepId: 's', stepKind: 'select' });
  });
});

/** A stored unit lineage holding `featureSpec`. */
const lineageText = (featureSpec: object[]): string => JSON.stringify({
  predictionUnitId: 'U', predictionUnitVersion: 1, labelVersion: 1, featureSpecVersion: 1, unitRowEntity: 'People',
  featureSpec, categoryLevels: {}, trainingSnapshotId: 'TS', snapshotContentHash: 'h',
});

describe('attack 7 (lineage half): a prediction pin survives the stored unit lineage', () => {
  it('parses a feature-value column whose pin is a PredictionFeaturePin', () => {
    const spec = [{ name: 'ChurnRisk', source: { kind: 'feature-value', featureName: 'ChurnRisk', pin: { mlModelScoringBindingId: 'B-1', mlModelId: 'M-UP' } }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } }];
    const parsed = UnitModelLineageParser.ParseUnitModelLineage(lineageText(spec));
    expect(parsed.Ok).toBe(true);
    if (parsed.Ok === false) return;
    expect(parsed.Value.featureSpec[0].source).toEqual({ kind: 'feature-value', featureName: 'ChurnRisk', pin: { mlModelScoringBindingId: 'B-1', mlModelId: 'M-UP' } });
  });
  it('still parses a stored pipeline pin unchanged (every stored FeatureVersionPin stays valid, D5-15)', () => {
    const pin: FeatureVersionPin = { featurePipelineRecordProcessId: RP, pipelineVersion: 3, promptVersionHash: 'ph-3', aiModelId: 'AIM-1', parametersHash: 'pa-3' };
    const spec = [{ name: 'JobFunction', source: { kind: 'feature-value', featureName: 'JobFunction', pin }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } }];
    const parsed = UnitModelLineageParser.ParseUnitModelLineage(lineageText(spec));
    expect(parsed.Ok === true && parsed.Value.featureSpec[0].source).toEqual({ kind: 'feature-value', featureName: 'JobFunction', pin });
  });
});
