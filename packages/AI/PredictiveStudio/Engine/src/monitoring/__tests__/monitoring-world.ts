/**
 * An in-memory world for the monitoring driver and its steps: every seam of `MonitoringSeams` over plain maps, with the
 * stored predictions, outcomes, period rows, publish records and calls the tests read back.
 */
import { IndexByUUID, NormalizeUUID } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import type {
  Actor,
  MetricWithInterval,
  MonitorDriftRequest,
  MonitorDriftResponse,
  MonitorDriftLook,
  PredictionUnitSpec,
  TaskType,
} from '@memberjunction/predictive-studio-core';

import type { EvaluateOutcome, PublishOutcome, PublishRequest } from '../../registry/gate-context';
import { GateTestProvider, GateTestStore } from '../../__tests__/fakes/gate-test-store';
import type { RegistryContext } from '../../registry/registry-context';
import type { ChallengerSelection } from '../../scoring/scoring-seams';
import type {
  DriftInputValues,
  IMonitoringDrift,
  IMonitoringGate,
  IMonitoringNotifier,
  IMonitoringParity,
  IMonitoringPublisher,
  IMonitoringScorer,
  IMonitoringStore,
  ModelPrediction,
  MonitoredBinding,
  MonitoredModel,
  MonitoredUnit,
  MonitoringContext,
  MonitoringPeriod,
  MonitoringSeams,
  PeriodGrain,
  PeriodRowWrite,
  Predecessor,
  RealisedOutcome,
  ShadowScoring,
  StoredPeriodRow,
  UnitRowInPeriod,
} from '../monitoring-seams';

export const PIPELINE = 'C0000000-0000-4000-8000-000000000001';
export const CURRENT = 'C0000000-0000-4000-8000-0000000000A1';
export const PREDECESSOR = 'C0000000-0000-4000-8000-0000000000A0';
export const JOB_RUN = 'C0000000-0000-4000-8000-0000000000F1';
export const OWNER = 'C0000000-0000-4000-8000-0000000000E1';
/** The scheduler's polling user, who is not the job's owner. */
export const SCHEDULER = 'C0000000-0000-4000-8000-0000000000E9';
export const BINARY: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 1 };

/** Day `iso` at 00:00 UTC. */
export const D = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
/** The month starting on `iso`. */
export const Month = (iso: string): MonitoringPeriod => {
  const start = D(iso);
  return { Start: start, End: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)), Grain: 'month' };
};

const UNIT_SPEC: PredictionUnitSpec = {
  id: 'U1', lineageRootId: 'U1', version: 1, name: 'members',
  rows: { kind: 'grain-x-periods', grainEntity: 'Members', periodEntity: 'Member Periods', grainForeignKey: 'MemberID', periodDate: 'PeriodStart', periodIndex: 'PeriodIndex', filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 30, gapDays: 0, outcome: BINARY, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } },
  history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, groupKey: null, temporal: null,
  decision: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'month' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: OWNER },
};

/** A stored prediction keyed by model, binding role and record. */
interface StoredValue extends ModelPrediction {
  readonly ModelID: string;
  readonly Role: 'Champion' | 'Challenger';
}

/** The world's store: models, predictions, outcomes, period rows and publish records. */
export class WorldStore implements IMonitoringStore {
  public readonly Models = new Map<string, MonitoredModel>();
  public Binding: MonitoredBinding | null = null;
  public readonly Values: StoredValue[] = [];
  public readonly UnitRows: UnitRowInPeriod[] = [];
  public readonly OutcomeRows: RealisedOutcome[] = [];
  public Reference: MetricWithInterval | null = { metric: 'log-loss', value: 0.5, interval: { level: 0.95, lower: 0.48, upper: 0.52 }, n: 1000 };
  public readonly Rows: PeriodRowWrite[] = [];
  public PredecessorOf: Predecessor | null = null;
  public readonly Artifacts = new Map<string, { readonly Verified: boolean; readonly Reason: string }>();
  public ChallengerSelection: ChallengerSelection | null = null;
  public Inputs: DriftInputValues[] = [];
  public Unit: MonitoredUnit = { ID: 'U1', Spec: UNIT_SPEC, LabelWindowDays: 30, LabelGapDays: 0, RowEntity: 'Member Periods' };

  public async LoadModel(modelId: string): Promise<MonitoredModel | null> {
    return this.Models.get(NormalizeUUID(modelId)) || null;
  }
  public TaskOf(): TaskType {
    return BINARY;
  }
  public async LoadUnit(): Promise<MonitoredUnit> {
    return this.Unit;
  }
  public async BindingOf(): Promise<MonitoredBinding | null> {
    return this.Binding;
  }
  /** Whether the job's user holds the binding's view authorization (D4-157); true unless a case says otherwise. */
  public HoldsView = true;
  /** Users (by ID) who do not hold the binding's view authorization even when {@link HoldsView} is true. */
  public readonly ViewDenied = new Set<string>();
  /** How many times the binding's stored rows were read. */
  public ModelRowReads = 0;
  public async HoldsBindingView(_bindingId: string, ctx: RegistryContext): Promise<boolean> {
    return this.HoldsView && !this.ViewDenied.has(NormalizeUUID(ctx.ContextUser.ID));
  }
  public async ModelRows(modelId: string, _bindingId: string, role: 'Champion' | 'Challenger', period: MonitoringPeriod): Promise<ModelPrediction[]> {
    this.ModelRowReads++;
    const rows = this.Values.filter((v) => NormalizeUUID(v.ModelID) === NormalizeUUID(modelId) && v.Role === role && v.EffectiveAsOf >= period.Start && v.EffectiveAsOf < period.End);
    const latest = new Map<string, ModelPrediction>();
    for (const r of [...rows].sort((a, b) => a.EffectiveAsOf.getTime() - b.EffectiveAsOf.getTime())) latest.set(r.RecordID.toLowerCase(), r);
    return [...latest.values()];
  }
  public async UnitRowsInPeriod(_unit: MonitoredUnit, period: MonitoringPeriod): Promise<UnitRowInPeriod[]> {
    return this.UnitRows.filter((r) => r.DecisionDate >= period.Start && r.DecisionDate < period.End);
  }
  public async Outcomes(_unit: MonitoredUnit, recordIds: readonly string[]): Promise<readonly RealisedOutcome[]> {
    const wanted = IndexByUUID(recordIds, (id) => id);
    return this.OutcomeRows.filter((o) => wanted.Has(o.RecordID));
  }
  public async ReferenceScore(): Promise<MetricWithInterval | null> {
    return this.Reference;
  }
  public async EarlierPeriods(modelId: string, grain: PeriodGrain, before: Date): Promise<StoredPeriodRow[]> {
    return this.Rows
      .filter((r) => NormalizeUUID(r.ModelID) === NormalizeUUID(modelId) && r.Period.Grain === grain && r.Period.Start < before)
      .sort((a, b) => a.Period.Start.getTime() - b.Period.Start.getTime())
      .map((r) => ({ Period: r.Period.Start, State: r.State, Primary: r.Primary, Calibration: r.Calibration, TriggersFired: r.TriggersFired }));
  }
  public async Predecessor(): Promise<Predecessor | null> {
    return this.PredecessorOf;
  }
  public async ArtifactVerified(model: MonitoredModel): Promise<{ readonly Verified: boolean; readonly Reason: string }> {
    return this.Artifacts.get(NormalizeUUID(model.ID)) || { Verified: true, Reason: 'the stored artifact loads verified' };
  }
  public async Challenger(): Promise<ChallengerSelection | null> {
    return this.ChallengerSelection;
  }
  public async DriftInputs(): Promise<DriftInputValues[]> {
    return this.Inputs;
  }
  public async WritePeriod(write: PeriodRowWrite): Promise<string> {
    const at = this.Rows.findIndex((r) => r.ModelID === write.ModelID && r.Period.Grain === write.Period.Grain && r.Period.Start.getTime() === write.Period.Start.getTime());
    if (at >= 0) this.Rows[at] = write;
    else this.Rows.push(write);
    return `row-${write.ModelID}-${write.Period.Start.toISOString().slice(0, 10)}`;
  }

  /** Stores a `Champion` (or `Challenger`) prediction of a record. */
  public Predict(modelId: string, recordId: string, asOf: Date, score: number, o: { readonly InTraining?: boolean; readonly Role?: 'Champion' | 'Challenger' } = {}): void {
    this.Values.push({ ModelID: modelId, Role: o.Role || 'Champion', RecordID: recordId, EffectiveAsOf: asOf, InTraining: o.InTraining === true, Score: score, Probabilities: { '0': 1 - score, '1': score } });
  }
  /** Stores a record's realised label. */
  public Outcome(recordId: string, decision: Date, label: '0' | '1'): void {
    this.OutcomeRows.push({ RecordID: recordId, DecisionDate: decision, Label: label, GroupKey: recordId.toLowerCase() });
  }
  /** The newest written period row. */
  public Last(): PeriodRowWrite {
    const last = this.Rows[this.Rows.length - 1];
    if (!last) throw new Error('no period row was written');
    return last;
  }
}

/** Shadow scoring double: scores every row with `ScoreOf(model, record)`; records every call. */
export class WorldScorer implements IMonitoringScorer {
  public readonly Calls: { readonly ModelID: string; readonly PredecessorOf: string | null; readonly Records: readonly string[] }[] = [];
  public readonly Runs: { readonly Path: 'monitoring'; readonly DryRun: true; readonly Written: 0; readonly ModelID: string }[] = [];
  public ScoreOf: (modelId: string, recordId: string) => number = () => 0.5;
  public InTraining: (modelId: string, recordId: string) => boolean = () => false;
  public async Shadow(model: MonitoredModel, _unit: MonitoredUnit, rows: readonly UnitRowInPeriod[], predecessorOf: string | null): Promise<ShadowScoring> {
    this.Calls.push({ ModelID: model.ID, PredecessorOf: predecessorOf, Records: rows.map((r) => r.RecordID) });
    this.Runs.push({ Path: 'monitoring', DryRun: true, Written: 0, ModelID: model.ID });
    const predictions = rows.map((r): ModelPrediction => {
      const s = this.ScoreOf(model.ID, r.RecordID);
      return { RecordID: r.RecordID, EffectiveAsOf: r.DecisionDate, InTraining: this.InTraining(model.ID, r.RecordID), Score: s, Probabilities: { '0': 1 - s, '1': s } };
    });
    return { ScoringRunID: `shadow-${this.Runs.length}`, Status: 'completed', Reason: null, Predictions: predictions };
  }
}

/** Drift double: answers the next queued response, else no alarm. */
export class WorldDrift implements IMonitoringDrift {
  public readonly Requests: MonitorDriftRequest[] = [];
  private next: readonly string[] | null = null;
  public NextDrift(alarms: readonly string[]): void {
    this.next = alarms;
  }
  /** How many of the next calls fail as an unreachable sidecar would. */
  public FailNext = 0;
  public async MonitorDrift(request: MonitorDriftRequest): Promise<MonitorDriftResponse> {
    this.Requests.push(request);
    if (this.FailNext > 0) {
      this.FailNext--;
      throw new Error('the ML sidecar is unreachable (ECONNREFUSED)');
    }
    const flagged = new Set(this.next || []);
    this.next = null;
    const results: MonitorDriftLook[] = request.inputs.map((i) => ({ input: i.name, kind: i.kind, z: flagged.has(i.name) ? 5 : 0, p: flagged.has(i.name) ? 1e-4 : 0.9, pAdjusted: flagged.has(i.name) ? 1e-4 : 0.9, q: request.q, look: request.look, flagged: flagged.has(i.name) }));
    return { look: request.look, q: request.q, replays: request.replays, results, alarms: results.filter((r) => r.flagged) };
  }
}

/** Publisher double: every training run gets a new ID; every publish is answered with `Answer`. */
export class WorldPublisher implements IMonitoringPublisher {
  public readonly Trained: string[] = [];
  public readonly Published: { readonly TrainingRunID: string; readonly Initiator: Actor }[] = [];
  public Answer: (trainingRunId: string) => PublishOutcome | EvaluateOutcome = (id) => ({ Kind: 'published', Purpose: 'publish', ModelID: `model-of-${id}`, PublishRecordID: `publish-of-${id}`, Replaces: CURRENT, Approver: 'automated-gate' });
  /** The refusal `PrepareChallenger` answers with; null prepares it. */
  public PrepareRefusal: string | null = null;
  /** `prepare:<pipeline>` and `train:<pipeline>`, in call order. */
  public readonly Calls: string[] = [];
  public async PrepareChallenger(pipelineId: string): Promise<string | null> {
    this.Calls.push(`prepare:${pipelineId}`);
    return this.PrepareRefusal;
  }
  public async Train(pipelineId: string): Promise<{ readonly TrainingRunID: string; readonly ModelID: string | null }> {
    const id = `run-${this.Trained.length + 1}`;
    this.Calls.push(`train:${pipelineId}`);
    this.Trained.push(pipelineId);
    return { TrainingRunID: id, ModelID: `model-of-${id}` };
  }
  public async EvaluateAndPublish(trainingRunId: string, initiator: Actor): Promise<PublishOutcome | EvaluateOutcome> {
    this.Published.push({ TrainingRunID: trainingRunId, Initiator: initiator });
    return this.Answer(trainingRunId);
  }
}

/** Gate double: every rollback publish is applied and recorded. */
export class WorldGate implements IMonitoringGate {
  public readonly Requests: PublishRequest[] = [];
  public async Publish(request: PublishRequest): Promise<PublishOutcome> {
    this.Requests.push(request);
    return { Kind: 'published', Purpose: request.purpose, ModelID: request.modelId, PublishRecordID: `rollback-${this.Requests.length}`, Replaces: CURRENT, Approver: 'automated-gate' };
  }
}

/** Parity double: answers the queued results in order, then passes. */
export class WorldParity implements IMonitoringParity {
  public readonly Seeds: number[] = [];
  public readonly Queue: { readonly Sampled: number; readonly MaxAbsDifference: number; readonly Passed: boolean }[] = [];
  public async Check(_binding: MonitoredBinding, _n: number, seed: number): Promise<{ readonly Sampled: number; readonly MaxAbsDifference: number; readonly Passed: boolean }> {
    this.Seeds.push(seed);
    return this.Queue.shift() || { Sampled: 10, MaxAbsDifference: 0, Passed: true };
  }
}

/** Notifier double. */
export class WorldNotifier implements IMonitoringNotifier {
  public readonly Sent: { readonly UserID: string; readonly Title: string }[] = [];
  public async Notify(userId: string, title: string): Promise<void> {
    this.Sent.push({ UserID: userId, Title: title });
  }
}

/** Every monitoring seam in memory, a clock the test sets, and the context the steps run under. */
export class MonitoringWorld {
  public readonly Store = new WorldStore();
  public readonly Scorer = new WorldScorer();
  public readonly Drift = new WorldDrift();
  public readonly Publisher = new WorldPublisher();
  public readonly Gate = new WorldGate();
  public readonly Parity = new WorldParity();
  public readonly Notifier = new WorldNotifier();
  public Now: Date = D('2026-06-15');
  /** A provider the in-memory seams never read (the registry's test provider over an empty store). */
  public readonly GateStore = new GateTestStore();
  public readonly Provider = new GateTestProvider(this.GateStore);
  public static readonly User = new UserInfo(null, { ID: OWNER, Email: 'owner@example.com', Type: 'User', IsActive: true, UserRoles: [] });
  /** The scheduler's polling user (MJServer polls as its system user); scheduled runs must not read as it. */
  public static readonly Scheduler = new UserInfo(null, { ID: SCHEDULER, Email: 'system@example.com', Type: 'User', IsActive: true, UserRoles: [] });

  constructor() {
    this.Store.Models.set(NormalizeUUID(CURRENT), MonitoringWorld.model(CURRENT, 'Published'));
    this.Store.Models.set(NormalizeUUID(PREDECESSOR), MonitoringWorld.model(PREDECESSOR, 'Archived'));
  }

  /** The seams, every one of them this world's. */
  public Seams(): MonitoringSeams {
    return { Store: this.Store, Scorer: this.Scorer, Drift: this.Drift, Publisher: this.Publisher, Gate: this.Gate, Parity: this.Parity, Notifier: this.Notifier, Clock: { Now: () => this.Now } };
  }

  /** The context a step runs under (a scheduled run by default). */
  public Ctx(scheduledJobRunId: string | null = JOB_RUN): MonitoringContext {
    return { ContextUser: MonitoringWorld.User, Provider: this.Provider, ScheduledJobRunID: scheduledJobRunId, Seams: this.Seams() };
  }

  /** The current model. */
  public Current(): MonitoredModel {
    const m = this.Store.Models.get(NormalizeUUID(CURRENT));
    if (!m) throw new Error('the current model is gone');
    return m;
  }

  /** The pipeline's binding (only its ID and pipeline are read by the steps). */
  public static readonly BINDING: MonitoredBinding = { ID: 'B0000000-0000-4000-8000-000000000001', MLTrainingPipelineID: PIPELINE };

  private static model(id: string, status: MonitoredModel['Status']): MonitoredModel {
    return { ID: id, PipelineID: PIPELINE, Version: id === CURRENT ? 2 : 1, Status: status, PredictionUnitID: 'U1', OutputSemantics: JSON.stringify({ task: BINARY }), ArtifactFileID: `file-${id}`, ArtifactSha256: 'a'.repeat(64), TrainingSnapshotID: `snap-${id}` };
  }
}
