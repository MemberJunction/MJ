/**
 * Prediction Unit + pipeline fixtures for the Prediction Unit, assembly, snapshot and protocol gates. Units are created through the product's own versioning
 * helpers and saved through the API (so the server subclasses validate them); pipelines get their legacy target
 * columns from the unit (ApplyUnitToPipeline). Every fixture takes the TruthHarness and records each unit version and
 * pipeline it saves on `h.Created`, so the bundle teardown deletes them.
 */
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJMLAlgorithmEntity, MJMLTrainingPipelineEntity, MJMLTrainingRunEntity, MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { PredictionUnit, type ColumnEncodingKind, type FeatureStep, type FeatureStepGraph, type LeakageGuard, type PredictionUnitSpec, type TaskType } from '@memberjunction/predictive-studio-core';
import { RunViewPredictionUnitStore, PredictionUnitVersioning, MetadataEntityFactory, ProviderAssemblyMetadata, type IEntityFactory, type PredictionUnitDraft } from '@memberjunction/predictive-studio';
import type { ScenarioID, TruthHarness } from '../harness/types';
import { DatasetSeeds } from '../data/seeds';

/** What a W-world renewal pipeline selects: its features, and the options that shape the unit and its steps. */
export interface WorldRenewalPipelineOptions {
  readonly Features: readonly string[];
  readonly OneClassVariant?: boolean;
  readonly Algorithm?: string;
  /** Saved as the pipeline's whole LeakageGuard (deny list and dominance threshold). */
  readonly LeakageGuard?: LeakageGuard;
  /** Declared encodings of the selected columns, overriding the one chosen from the field type. */
  readonly Encodings?: Record<string, ColumnEncodingKind>;
  /** Also select the person's `Status`, read from the world's Person table through the year's PersonID. */
  readonly PersonStatus?: boolean;
}

/** The columns a T3 pipeline selects from the series table, and how many periods back each one refers to. */
export interface T3PipelineOptions {
  readonly Columns: readonly string[];
  readonly PeriodOffsets: Record<string, number>;
}

export interface ProvisionedUnitPipeline {
  readonly UnitRow: MJPredictionUnitEntity;
  readonly Unit: PredictionUnitSpec;
  readonly Pipeline: MJMLTrainingPipelineEntity;
}

/**
 * Prediction Unit and pipeline fixtures for the gates, as static members on one owner class. Later provisioners are
 * added here too.
 */
export class UnitFixtures {
  /** The product's entity factory over the harness's provider (the training engine's entity-factory seam). */
  public static EntityFactory(h: TruthHarness): IEntityFactory {
    return new MetadataEntityFactory(h.Provider);
  }

  /** A scenario's base seed (its spec seed; the `base` seed set). */
  public static ScenarioBaseSeed(id: ScenarioID): number {
    return DatasetSeeds.SeedSet('scenario', id, 'base')[0];
  }

  /** The per-world table prefix: 'W5-censor' → 'W5' (tables W5_Person, W5_MembershipYear). */
  public static WorldTablePrefix(world: string): string {
    return world.split('-')[0];
  }

  /** The pstruth entity registered for a base table (names come from the test schema's CodeGen config, so they are looked up). */
  public static TruthEntityName(h: TruthHarness, baseTable: string): string {
    const e = h.Provider.Entities.find((x) => x.SchemaName === 'pstruth' && x.BaseTable === baseTable);
    if (!e) throw new Error(`pstruth.${baseTable} is not registered; run truth:provision`);
    return e.Name;
  }

  public static C1RenewalUnitDraft(h: TruthHarness): PredictionUnitDraft {
    return {
      Name: 'C1 renewal (person x dues period)', Description: 'Renewed = the next dues period within 400 days of this one (the reference renewal unit).',
      UnitRows: { kind: 'grain-x-periods', grainEntity: UnitFixtures.TruthEntityName(h, 'C1Person'), childEntity: UnitFixtures.TruthEntityName(h, 'C1DuesPeriod'), foreignKey: 'PersonID', periodDate: 'OrderDate', filter: [] },
      LabelRule: { kind: 'next-period', periodIndexField: 'PeriodIndex', offset: 1 }, LabelWindowDays: 400, LabelGapDays: 0,
      TaskType: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
      Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: UnitFixtures.TruthEntityName(h, 'C1OrderHeader'), field: 'OrderDate' } },
      ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, GroupKey: 'PersonID', TemporalSpec: null,
      DecisionSpec: { action: 'renewal outreach', actorRole: 'membership team', capacityPerPeriod: 150, period: 'month' },
      IncumbentHeuristic: { kind: 'rule', name: 'renewed last year', scoreExpression: 'prior_dues_periods_400d >= 2' },
    };
  }

  /** W1/W4/W5 renewal: one row per membership year, decided on 1 December, outcome observed by 1 January. */
  public static WorldRenewalUnitDraft(h: TruthHarness, world: string, oneClassVariant: boolean): PredictionUnitDraft {
    const years = UnitFixtures.TruthEntityName(h, `${UnitFixtures.WorldTablePrefix(world)}_MembershipYear`);
    const fullyResolved = world !== 'W5-censor';
    return {
      Name: `${world} renewal (person x membership year)${oneClassVariant ? ' — one-class variant' : ''}`, Description: null,
      UnitRows: { kind: 'grain', grainEntity: years, decisionDate: { kind: 'column-offset', column: 'StartDate', offsetDays: 334 }, filter: oneClassVariant ? [{ field: 'Renewed', op: 'eq', values: [true] }] : [] },
      LabelRule: { kind: 'column', column: 'Renewed' }, LabelWindowDays: 31, LabelGapDays: 0,
      TaskType: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
      // W5's 2026 outcomes are unknown at its corpus end (the newest StartDate); every other world's outcomes are drawn (resolved).
      Censoring: fullyResolved ? { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2027-02-01' } } : { rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: years, field: 'StartDate' } },
      ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, GroupKey: 'PersonID', TemporalSpec: null,
      DecisionSpec: { action: 'renewal outreach', actorRole: 'membership team', capacityPerPeriod: null, period: 'year' },
      IncumbentHeuristic: { kind: 'none' },
    };
  }

  /** T3: one row per month of the planted series, decided on its own month, forecasting `Target` one month ahead. */
  public static T3UnitDraft(h: TruthHarness): PredictionUnitDraft {
    return {
      Name: 'T3 monthly forecast (series x month)', Description: null,
      UnitRows: { kind: 'grain', grainEntity: UnitFixtures.TruthEntityName(h, 'Scn_T3'), decisionDate: { kind: 'column', column: 'T' }, filter: [] },
      LabelRule: { kind: 'column', column: 'Target' }, LabelWindowDays: 28, LabelGapDays: 0,
      TaskType: { kind: 'forecast', valueKind: 'continuous' },
      Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2025-12-31' } },
      ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, GroupKey: null,
      TemporalSpec: { timeColumn: 'T', horizonPeriods: 1, lags: [1, 12], rollingWindows: [], period: 'month', seasonality: 12 },
      DecisionSpec: { action: 'monthly forecast', actorRole: 'test', capacityPerPeriod: null, period: 'month' }, IncumbentHeuristic: { kind: 'none' },
    };
  }

  /** The C1 unit's feature steps: the reference's as-of features. */
  public static C1AssemblySteps(h: TruthHarness): FeatureStepGraph {
    const child = (id: string, featureName: string, baseTable: string, rest: Omit<Extract<FeatureStep, { Kind: 'windowed-aggregate' }>, 'Id' | 'Kind' | 'FeatureName' | 'ChildEntity' | 'ForeignKey' | 'OwnerKeyField'>): FeatureStep =>
      ({ Id: id, Kind: 'windowed-aggregate', FeatureName: featureName, ChildEntity: UnitFixtures.TruthEntityName(h, baseTable), ForeignKey: 'PersonID', OwnerKeyField: 'PersonID', ...rest });
    return { Steps: [
      { Id: 'tier', Kind: 'select', Columns: ['TierSKU'] },
      { Id: 'person', Kind: 'select', Entity: UnitFixtures.TruthEntityName(h, 'C1Person'), KeyField: 'PersonID', Columns: ['JoinDate', 'Segment', 'Region'] },
      child('events', 'events_attended_y', 'C1EventAttendance', { DateField: 'EventDate', Aggregate: 'count', WindowDays: 365 }),
      child('courses', 'courses_completed_y', 'C1CourseCompletion', { DateField: 'CompletedOn', Aggregate: 'count', WindowDays: 365 }),
      child('certs', 'certs_held_y', 'C1Certification', { DateField: 'AwardedOn', EndDateField: 'ExpiresOn', Aggregate: 'active-at' }),
      child('committee', 'committee_active_y', 'C1CommitteeMembership', { DateField: 'StartDate', EndDateField: 'EndDate', Aggregate: 'active-at' }),
      child('lines', 'nondues_lines_y', 'C1NonduesLine', { DateField: 'OrderDate', VoidedAtField: 'ReversedOn', Aggregate: 'count', WindowDays: 365 }),
      child('spend', 'nondues_spend_y', 'C1NonduesLine', { DateField: 'OrderDate', VoidedAtField: 'ReversedOn', Aggregate: 'sum', ValueField: 'LineTotalNet', WindowDays: 365 }),
      child('prior', 'prior_dues_periods_400d', 'C1DuesPeriod', { DateField: 'OrderDate', Aggregate: 'count', WindowDays: 400 }),
    ] };
  }

  /** A W-world renewal pipeline's steps: the selected year columns (with any declared encodings), and the person's Status when asked. */
  private static worldRenewalSteps(h: TruthHarness, world: string, o: WorldRenewalPipelineOptions): FeatureStepGraph {
    const steps: FeatureStep[] = [{ Id: 'select', Kind: 'select', Columns: [...o.Features], ...(o.Encodings ? { Encodings: { ...o.Encodings } } : {}) }];
    if (o.PersonStatus) {
      steps.push({ Id: 'person', Kind: 'select', Entity: UnitFixtures.TruthEntityName(h, `${UnitFixtures.WorldTablePrefix(world)}_Person`), KeyField: 'PersonID', Columns: ['Status'] });
    }
    return { Steps: steps };
  }

  /** A cross-sectional planted scenario (no dates): one decision moment for every row. */
  public static ScenarioUnitDraft(h: TruthHarness, scenario: string, task: TaskType): PredictionUnitDraft {
    return {
      Name: `${scenario} (${task.kind})`, Description: null,
      UnitRows: { kind: 'grain', grainEntity: UnitFixtures.TruthEntityName(h, `Scn_${scenario.replace('-', '')}`), decisionDate: { kind: 'fixed', date: '2020-01-01' }, filter: [] },
      LabelRule: { kind: 'column', column: 'Target' }, LabelWindowDays: 1, LabelGapDays: 0, TaskType: task,
      Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2020-12-31' } },
      ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, GroupKey: null, TemporalSpec: null,
      DecisionSpec: { action: 'scenario', actorRole: 'test', capacityPerPeriod: null, period: 'year' }, IncumbentHeuristic: { kind: 'none' },
    };
  }

  private static async algorithmId(h: TruthHarness, name: string): Promise<string> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLAlgorithmEntity, 'ID'>>({ EntityName: 'MJ: ML Algorithms', ExtraFilter: `Name='${EscapeSQLString(name)}'`, Fields: ['ID'], ResultType: 'simple' }, h.User);
    if (!r.Success || !r.Results[0]) throw new Error(`ML Algorithm "${name}" not found`);
    return r.Results[0].ID;
  }

  /** `featureSteps`, when given, is saved as the pipeline's step graph; else one select step over `features`. */
  private static async provision(h: TruthHarness, draft: PredictionUnitDraft, features: readonly string[], algorithm: string, guard?: LeakageGuard, featureSteps?: FeatureStepGraph): Promise<ProvisionedUnitPipeline> {
    const factory = UnitFixtures.EntityFactory(h);
    const unitRow = await PredictionUnitVersioning.CreatePredictionUnitV1(draft, { kind: 'human', userId: h.User.ID }, factory, h.User);
    h.Created.RecordPredictionUnit(unitRow.ID);
    const parsed = PredictionUnit.ParsePredictionUnitRow(unitRow);
    if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
    const pipeline = await factory.getEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', h.User);
    pipeline.Name = `PSTruth: ${draft.Name} — ${algorithm} ${h.RunID}`;
    pipeline.AlgorithmID = await UnitFixtures.algorithmId(h, algorithm);
    const steps: FeatureStepGraph = featureSteps || { Steps: [{ Id: 'select', Kind: 'select', Columns: [...features] }] };
    pipeline.FeatureSteps = JSON.stringify(steps);
    pipeline.ValidationStrategy = JSON.stringify({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 });
    if (guard) pipeline.LeakageGuard = JSON.stringify(guard);
    RunViewPredictionUnitStore.ApplyUnitToPipeline(pipeline, unitRow.ID, parsed.Value, new ProviderAssemblyMetadata(h.Provider));
    if (!(await pipeline.Save())) throw new Error(`Saving pipeline failed: ${pipeline.LatestResult?.CompleteMessage}`);
    h.Created.RecordPipeline(pipeline.ID);
    return { UnitRow: unitRow, Unit: parsed.Value, Pipeline: pipeline };
  }

  public static ProvisionC1RenewalPipeline(h: TruthHarness): Promise<ProvisionedUnitPipeline> {
    return UnitFixtures.provision(h, UnitFixtures.C1RenewalUnitDraft(h), ['PeriodIndex'], 'Logistic Regression');
  }

  /** The C1 renewal unit with the reference's as-of features (`C1AssemblySteps`). */
  public static ProvisionC1AssemblyPipeline(h: TruthHarness): Promise<ProvisionedUnitPipeline> {
    return UnitFixtures.provision(h, UnitFixtures.C1RenewalUnitDraft(h), [], 'Logistic Regression', undefined, UnitFixtures.C1AssemblySteps(h));
  }

  public static ProvisionWorldRenewalPipeline(h: TruthHarness, world: string, o: WorldRenewalPipelineOptions): Promise<ProvisionedUnitPipeline> {
    return UnitFixtures.provision(h, UnitFixtures.WorldRenewalUnitDraft(h, world, o.OneClassVariant === true), o.Features, o.Algorithm || 'Logistic Regression', o.LeakageGuard, UnitFixtures.worldRenewalSteps(h, world, o));
  }

  /** The T3 forecast unit with one select step over the given series columns and their period offsets. */
  public static ProvisionT3Pipeline(h: TruthHarness, o: T3PipelineOptions): Promise<ProvisionedUnitPipeline> {
    const steps: FeatureStepGraph = { Steps: [{ Id: 'select', Kind: 'select', Columns: [...o.Columns], PeriodOffsets: { ...o.PeriodOffsets } }] };
    return UnitFixtures.provision(h, UnitFixtures.T3UnitDraft(h), o.Columns, 'Ridge Regression', undefined, steps);
  }

  public static ProvisionScenarioPipeline(h: TruthHarness, scenario: string, task: TaskType): Promise<ProvisionedUnitPipeline> {
    return UnitFixtures.provision(h, UnitFixtures.ScenarioUnitDraft(h, scenario, task), ['PastEventsZ', 'Member', 'DistanceZ'], 'Ridge Regression');
  }

  /** The newest training run of a pipeline (an entity: callers read ValidationResults, Status and ResultingModelID). */
  public static async LatestRun(h: TruthHarness, pipelineId: string): Promise<MJMLTrainingRunEntity> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<MJMLTrainingRunEntity>({ EntityName: 'MJ: ML Training Runs', ExtraFilter: `PipelineID='${EscapeSQLString(pipelineId)}'`, OrderBy: '__mj_CreatedAt DESC', MaxRows: 1, ResultType: 'entity_object' }, h.User);
    if (!r.Success || !r.Results[0]) throw new Error(`No training run for pipeline ${pipelineId}`);
    return r.Results[0];
  }

  /** A saved unit version, parsed. */
  public static async LoadUnitSpec(h: TruthHarness, unitId: string): Promise<PredictionUnitSpec> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<MJPredictionUnitEntity>({ EntityName: 'MJ: Prediction Units', ExtraFilter: `ID='${EscapeSQLString(unitId)}'`, ResultType: 'simple' }, h.User);
    if (!r.Success) throw new Error(`Reading Prediction Unit ${unitId} failed: ${r.ErrorMessage || 'unknown error'}`);
    if (!r.Results[0]) throw new Error(`Prediction Unit ${unitId} was not found`);
    const parsed = PredictionUnit.ParsePredictionUnitRow(r.Results[0]);
    if (parsed.Ok === false) throw new Error(`Prediction Unit ${unitId} does not parse: ${parsed.Errors.join('; ')}`);
    return parsed.Value;
  }
}
