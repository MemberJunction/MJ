import { describe, it, expect } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';

import {
  MaterializingPipelineResolver,
  jsonEquals,
  pipelineMatchesConfig,
  type IPipelineCandidateLoader,
  type IPipelineMaterializer,
} from '../materializing-pipeline-resolver';
import { modelingPlanToPipelineConfig, type PipelineConfig } from '../../agent/modeling-plan-to-pipeline';
import type { TrainExperimentInput } from '../types';

/**
 * This resolver is what makes a production experiment session able to train at all — the shipped
 * default threw. Two behaviours carry the weight:
 *
 *  - **Reuse before create**, so a retried or resumed session lands on the SAME pipeline row and the
 *    model registry stays a history of one thing rather than fragmenting across near-identical rows.
 *  - **Match on the WHOLE configuration.** Two experiments can differ only in hyperparameters or only
 *    in feature set; matching on anything less would silently train the wrong pipeline and report it
 *    as the right one — exactly what the throwing default existed to prevent.
 */

const PLAN: ModelingPlanSpec = {
  Goal: 'Predict which members will renew',
  TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
  CandidateSources: [{ Kind: 'Entity', Ref: 'Members', Why: 'the training unit' }],
  CandidateFeatures: [
    { Name: 'tenure', SourceRef: 'Members', Kind: 'numeric', Why: 'longer members renew' },
    { Name: 'events', SourceRef: 'Members', Kind: 'numeric', Why: 'engagement' },
  ],
  LeakageNotes: [],
  ProposedExperiments: [
    { Label: 'XGBoost baseline', AlgorithmName: 'XGBoost', FeatureSet: ['tenure', 'events'], Hyperparameters: { max_depth: 4 }, Rationale: 'strong default', Priority: 1 },
    { Label: 'XGBoost deeper', AlgorithmName: 'XGBoost', FeatureSet: ['tenure', 'events'], Hyperparameters: { max_depth: 9 }, Rationale: 'more capacity', Priority: 2 },
    { Label: 'Logistic baseline', AlgorithmName: 'Logistic Regression', FeatureSet: ['tenure'], Rationale: 'interpretable', Priority: 3 },
  ],
  ValidationStrategy: { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 },
  ProposedBudget: {},
};

const USER = {} as UserInfo;
const PROVIDER = {} as IMetadataProvider;

function input(experimentIndex: number, overrides: Partial<TrainExperimentInput> = {}): TrainExperimentInput {
  return {
    experiment: PLAN.ProposedExperiments[experimentIndex],
    plan: PLAN,
    iterationId: 'iter-1',
    sessionId: 'session-1',
    contextUser: USER,
    provider: PROVIDER,
    ...overrides,
  };
}

/** Build a stored pipeline row that encodes a given config exactly. */
function rowFor(config: PipelineConfig, id: string, overrides: Partial<Record<string, unknown>> = {}): MJMLTrainingPipelineEntity {
  return {
    ID: id,
    Name: config.name,
    TargetEntity: config.targetEntityName,
    TargetVariable: config.targetVariable,
    ProblemType: config.problemType,
    Algorithm: config.algorithmName,
    SourceBindings: JSON.stringify(config.sourceBindings),
    FeatureSteps: JSON.stringify(config.featureSteps),
    AsOfStrategy: JSON.stringify(config.asOf),
    LeakageGuard: JSON.stringify(config.leakageGuard),
    ValidationStrategy: JSON.stringify(config.validation),
    Hyperparameters: JSON.stringify(config.hyperparameters ?? {}),
    DatedSources: config.datedSources?.length ? JSON.stringify(config.datedSources) : null,
    ...overrides,
  } as unknown as MJMLTrainingPipelineEntity;
}

class FakeLoader implements IPipelineCandidateLoader {
  public Calls: Array<{ entity: string; variable: string }> = [];
  constructor(private readonly rows: MJMLTrainingPipelineEntity[] = []) {}
  async load(targetEntityName: string, targetVariable: string): Promise<MJMLTrainingPipelineEntity[]> {
    this.Calls.push({ entity: targetEntityName, variable: targetVariable });
    return this.rows;
  }
}

class FakeMaterializer implements IPipelineMaterializer {
  public Configs: PipelineConfig[] = [];
  constructor(private readonly id = 'new-pipeline') {}
  async materialize(config: PipelineConfig): Promise<string> {
    this.Configs.push(config);
    return `${this.id}-${this.Configs.length}`;
  }
}

describe('MaterializingPipelineResolver — reuse before create', () => {
  it('reuses an existing pipeline whose whole configuration matches', async () => {
    const config = modelingPlanToPipelineConfig(PLAN, PLAN.ProposedExperiments[0]);
    const materializer = new FakeMaterializer();
    const resolver = new MaterializingPipelineResolver(materializer, new FakeLoader([rowFor(config, 'existing-1')]));

    expect(await resolver.resolvePipelineId(input(0))).toBe('existing-1');
    expect(materializer.Configs).toHaveLength(0);
  });

  it('materializes when nothing matches', async () => {
    const materializer = new FakeMaterializer();
    const resolver = new MaterializingPipelineResolver(materializer, new FakeLoader([]));

    expect(await resolver.resolvePipelineId(input(0))).toBe('new-pipeline-1');
    expect(materializer.Configs[0].algorithmName).toBe('XGBoost');
  });

  it('maps THIS experiment, not the plan\'s highest-priority one', async () => {
    // A session trains several proposed experiments; collapsing onto the top-ranked one would train
    // the same pipeline every iteration and report three different results for one model.
    const materializer = new FakeMaterializer();
    const resolver = new MaterializingPipelineResolver(materializer, new FakeLoader([]));

    await resolver.resolvePipelineId(input(2));
    expect(materializer.Configs[0].algorithmName).toBe('Logistic Regression');
  });

  it('gives two experiments that differ ONLY in hyperparameters different pipelines', async () => {
    const baseline = modelingPlanToPipelineConfig(PLAN, PLAN.ProposedExperiments[0]);
    const materializer = new FakeMaterializer();
    // The store already holds the baseline; the deeper variant must NOT match it.
    const resolver = new MaterializingPipelineResolver(materializer, new FakeLoader([rowFor(baseline, 'baseline')]));

    expect(await resolver.resolvePipelineId(input(0))).toBe('baseline');
    expect(await resolver.resolvePipelineId(input(1))).toBe('new-pipeline-1');
    expect(materializer.Configs[0].hyperparameters).toEqual({ max_depth: 9 });
  });

  it('narrows candidates by target entity + variable', async () => {
    const loader = new FakeLoader([]);
    await new MaterializingPipelineResolver(new FakeMaterializer(), loader).resolvePipelineId(input(0));
    expect(loader.Calls[0]).toEqual({ entity: 'Members', variable: 'Renewed' });
  });

  it('fails clearly without a provider or user rather than materializing into nowhere', async () => {
    const resolver = new MaterializingPipelineResolver(new FakeMaterializer(), new FakeLoader([]));
    await expect(resolver.resolvePipelineId(input(0, { provider: undefined }))).rejects.toThrow(/provider and a context user/);
    await expect(resolver.resolvePipelineId(input(0, { contextUser: undefined }))).rejects.toThrow(/provider and a context user/);
  });
});

describe('pipelineMatchesConfig', () => {
  const config = modelingPlanToPipelineConfig(PLAN, PLAN.ProposedExperiments[0]);

  it('matches an exact encoding', () => {
    expect(pipelineMatchesConfig(rowFor(config, 'p'), config)).toBe(true);
  });

  it('is insensitive to JSON key ORDER — the same config serialized differently is the same config', () => {
    const reordered = rowFor(config, 'p', {
      ValidationStrategy: JSON.stringify({ LockedHoldoutFraction: 0.2, TestSize: 0.2, Strategy: 'train_test_split' }),
    });
    expect(pipelineMatchesConfig(reordered, config)).toBe(true);
  });

  it('treats a null column and an empty value as the same thing', () => {
    // A pipeline written before DatedSources existed must still match a config that has none.
    expect(pipelineMatchesConfig(rowFor(config, 'p', { DatedSources: null }), config)).toBe(true);
    expect(pipelineMatchesConfig(rowFor(config, 'p', { DatedSources: '[]' }), config)).toBe(true);
  });

  it('compares the algorithm name case- and whitespace-tolerantly (an agent writes it)', () => {
    expect(pipelineMatchesConfig(rowFor(config, 'p', { Algorithm: '  xgboost ' }), config)).toBe(true);
  });

  it('rejects a row differing in ANY field that changes what gets trained', () => {
    const differing: Array<[string, unknown]> = [
      ['TargetEntity', 'Contacts'],
      ['TargetVariable', 'Churned'],
      ['ProblemType', 'regression'],
      ['Algorithm', 'LightGBM'],
      ['SourceBindings', JSON.stringify([{ Kind: 'Entity', Ref: 'Contacts' }])],
      ['FeatureSteps', JSON.stringify({ Steps: [] })],
      ['AsOfStrategy', JSON.stringify({ Mode: 'column', Column: 'DecisionDate' })],
      ['LeakageGuard', JSON.stringify({ DenyFields: ['Renewed'], SingleFeatureDominanceThreshold: 0.6 })],
      ['ValidationStrategy', JSON.stringify({ Strategy: 'kfold', K: 5, LockedHoldoutFraction: 0.2 })],
      ['Hyperparameters', JSON.stringify({ max_depth: 12 })],
      ['DatedSources', JSON.stringify([{ EntityName: 'Activities', ForeignKeyField: 'MemberID', DateField: 'ActivityDate', Features: [] }])],
    ];
    for (const [field, value] of differing) {
      expect(pipelineMatchesConfig(rowFor(config, 'p', { [field]: value }), config), field).toBe(false);
    }
  });

  it('does not treat a malformed stored column as a match', () => {
    expect(pipelineMatchesConfig(rowFor(config, 'p', { FeatureSteps: '{not json' }), config)).toBe(false);
  });
});

describe('jsonEquals', () => {
  it('is key-order insensitive but array-order sensitive', () => {
    expect(jsonEquals('{"a":1,"b":2}', { b: 2, a: 1 })).toBe(true);
    // Feature-step and source-binding order IS meaningful, so array order must matter.
    expect(jsonEquals('[1,2]', [2, 1])).toBe(false);
  });

  it('collapses null, blank, {} and [] to the same "nothing here"', () => {
    for (const stored of [null, undefined, '   ', '{}', '[]']) {
      expect(jsonEquals(stored, {}), String(stored)).toBe(true);
      expect(jsonEquals(stored, []), String(stored)).toBe(true);
    }
  });

  it('compares nested structures deeply', () => {
    expect(jsonEquals('{"a":{"c":3,"b":[1,{"e":5,"d":4}]}}', { a: { b: [1, { d: 4, e: 5 }], c: 3 } })).toBe(true);
    expect(jsonEquals('{"a":{"b":[1,{"d":4}]}}', { a: { b: [1, { d: 5 }] } })).toBe(false);
  });

  it('treats unparseable stored JSON as nothing, so it cannot accidentally match a real config', () => {
    expect(jsonEquals('{oops', { a: 1 })).toBe(false);
    expect(jsonEquals('{oops', {})).toBe(true);
  });
});
