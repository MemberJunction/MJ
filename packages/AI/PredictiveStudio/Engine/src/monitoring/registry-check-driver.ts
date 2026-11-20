/**
 * @module monitoring/registry-check-driver
 *
 * `PredictiveStudioRegistryCheckJobDriver` — the hourly registry check (§5.7 R6, R7; D4-19, D4-20). Every finding of
 * the model registry is remediated through the lifecycle gate (initiator `{ kind: 'scheduled-job', scheduledJobRunId }`)
 * and written, with the action taken, to the run's `Details` and a D4-18 notification (to the job's owner; the seeded
 * job has none, so to the owner of the finding's model's monitoring job, and a finding with neither is listed in the
 * run's `Details` under `Unnotified`). A finding the job cannot remediate in one run (a lock that did not come free, a
 * gate refusal) is recorded `retry` and found again on the next run. One JSDoc'd protected step per finding:
 *
 * | Step | Finding | Action |
 * |---|---|---|
 * | {@link MigratePreChangeModels} (g), first | a model the serving migration's data section marked (`Delivery IS NULL`) | §5.6 steps 2–5 ({@link PreGateModelMigration.RunRegistryStep}); what it did is the run's `Details` under {@link PreGateModelMigration.DetailsKey} |
 * | {@link ArchiveOutsideGatePublishes} (a) | a Published model with no publish record; surplus Published models of a pipeline | archived (`status-written-outside-gate`; of two with records the newest stays), then the rollback rule |
 * | {@link RestoreOutsideGateDemotions} (b) | a model moved off Published outside the gate while holding a publish record | restored by the gate (R1's restore); refused → archived, then the rollback rule |
 * | {@link RemediateArtifactHealth} (c) | a Published model whose stored artifact is `missing` or `hash-mismatch` | archived, the rollback rule, then one training run through `AutomatedPublisher` |
 * | {@link ResyncScoringActions} (d) | a Published model without an active scoring Action | re-synced |
 * | {@link FailStaleScoringRuns} (e) | a scoring run `running` past the threshold (default 6 h) | `failed` with the reason |
 * | {@link CloseSignOffWaits} (f) | a sign-off wait whose newer run was evaluated or whose expiry passed | archived through the gate, then (only once it applied) `refusal` record `sign-off-wait-closed`; the incumbent untouched |
 * | {@link RecordOrphanPublishRecords} (h) | a publish record with no matching status change | recorded only |
 * | {@link ReattachViewGate} (i) | a read permission on the prediction entities without the view gate | the filter attached where the permission has none; a different filter is recorded, never overwritten |
 *
 * The rollback rule ((a), §5.7 R7): when the pipeline is left with no Published model, the newest `Archived` model with
 * an applied backing record (`publish`, `rollback` or `adopt`, D4-204), a `Delivery` and a verified artifact is
 * published back (`purpose: 'rollback'`); with none, the pipeline serves nothing and scoring refuses
 * `model-not-published`. Pre-change models (`Delivery IS NULL`) are step
 * (g)'s and are not findings of (a)–(c); (g) runs first, so a model it back-fills is seen by (a)–(c) as migrated.
 */
import { ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import type { MJEntityPermissionEntity, MJMLModelEntity, MJMLModelPublishRecordEntity, MJMLScoringRunEntity, MJMLTrainingPipelineEntity, MJRowLevelSecurityFilterEntity, MJScheduledJobEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import type { NotificationContent, ScheduledJobResult } from '@memberjunction/scheduling-base-types';
import { BaseScheduledJob, type ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { EvaluationProtocol, JsonParse, type Actor, type TransitionRefusal } from '@memberjunction/predictive-studio-core';

import { PreGateMigrationContexts, PreGateModelMigration, type PreChangeMigrationConfig, type PreChangeStepDetails, type PreGateMigrationSeams } from '../migration/pre-gate-model-migration';

import { ModelScoringActionGenerator } from '../actions/model-scoring-action-generator';
import { ArtifactRegistry } from '../registry/artifact-registry';
import type { GateContext, PublishOutcome, PublishRequest, GateApplyResult } from '../registry/gate-context';
import { GateRefusals } from '../registry/gate-refusals';
import { GateContexts } from '../registry/gate-seams';
import { LifecycleGate } from '../registry/lifecycle-gate';
import { MonitoringJobs } from '../registry/monitoring-job';
import { PublishLocks } from '../registry/publish-locks';
import { PublishRecords } from '../registry/publish-records';
import type { RegistryContext } from '../registry/registry-context';
import { StoredRowReads } from '../registry/stored-row-reads';
import type { IArtifactLoader } from '../scoring/types';
import { StorageProviderArtifactLoader } from '../scoring/storage-provider-artifact-loader';
import type { IMonitoringNotifier, IMonitoringPublisher } from './monitoring-seams';
import { AutomatedMonitoringPublisher, UserNotificationMonitoringNotifier } from './monitoring-store';

/** The stored Queries the check reads its findings with (every SQL text lives in `metadata/queries/`, D-035). */
export const REGISTRY_CHECK_QUERIES = {
  ManyPublished: 'Predictive Studio: Pipelines With More Than One Published Model',
  PublishedWithoutRecord: 'Predictive Studio: Published Models Without A Publish Record',
  RecordsWithoutStatusChange: 'Predictive Studio: Publish Records Without A Status Change',
  StaleScoringRuns: 'Predictive Studio: Stale Running Scoring Runs',
} as const;

/** The view gate's `MJ: Row Level Security Filters` row (M5b.1). */
export const VIEW_GATE_FILTER_NAME = 'Model Predictions View Gate';
/** The entities whose read permissions carry the view gate (§5.8.4). */
export const VIEW_GATED_ENTITIES = ['MJ: Feature Values', 'MJ: Latest Feature Values'] as const;

/** The registry job's `Configuration` (its invariant check plus the thresholds the steps read). */
export interface RegistryCheckConfiguration {
  /** Hours a scoring run may stay `running` before (e) fails it. */
  readonly StaleScoringRunHours: number;
  /** Step (g)'s limits, from `Configuration.migration` (`{ batchSize, retrainPerRun }`, D4-22). */
  readonly Migration: PreChangeMigrationConfig;
}

/** One finding and what the job did about it. */
export interface RegistryFinding {
  /** The R7 finding letter. */
  readonly Finding: 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i';
  /** The model (or the scoring run, permission or record) the finding is about. */
  readonly SubjectID: string | null;
  readonly Detail: string;
  readonly Action: string;
  /** `remediated`, `recorded` (nothing to act on), or `retry` (the action did not complete; found again next run). */
  readonly Outcome: 'remediated' | 'recorded' | 'retry';
}

/** A finding no one was notified of: the job has no owner and its subject is not a model with a monitoring job owner. */
export interface UnnotifiedFinding {
  readonly Finding: RegistryFinding['Finding'];
  readonly SubjectID: string | null;
  readonly Reason: string;
}

/** The registry check's per-model scoring Action seam: whether a model has an active Action, and its re-sync. */
export interface IRegistryScoringActions {
  HasActiveAction(modelId: string, ctx: RegistryContext): Promise<boolean>;
  Generate(model: MJMLModelEntity, ctx: RegistryContext): Promise<void>;
}

/** The registry check's collaborators. */
export interface RegistryCheckSeams {
  readonly Gate: Pick<LifecycleGate, 'Publish' | 'Archive'>;
  readonly Publisher: IMonitoringPublisher;
  readonly ArtifactLoader: IArtifactLoader;
  readonly ScoringActions: IRegistryScoringActions;
  readonly Notifier: IMonitoringNotifier;
  readonly Clock: { Now(): Date };
  /** Replacements for step (g)'s migration seams; each one left out is the migration's production default. */
  readonly Migration: Partial<PreGateMigrationSeams>;
}

/** What step (g) did in one run: the migration's record (null when no pre-change work remained) and its findings. */
export interface PreChangeStepOutcome {
  readonly Details: PreChangeStepDetails | null;
  /** One `retry` finding when the step threw; otherwise none (the record is in `Details`). */
  readonly Findings: RegistryFinding[];
}

/** The production scoring-Action seam: the per-model Action generator, its lookup exposed. */
export class GeneratorRegistryScoringActions extends ModelScoringActionGenerator implements IRegistryScoringActions {
  /** @inheritdoc */
  public async HasActiveAction(modelId: string, ctx: RegistryContext): Promise<boolean> {
    const action = await this.FindActionForModel(modelId, ctx.Provider, ctx.ContextUser);
    return action !== null && action.Status === 'Active';
  }

  /** @inheritdoc */
  public async Generate(model: MJMLModelEntity, ctx: RegistryContext): Promise<void> {
    await this.GenerateForModel(model, ctx.ContextUser, ctx.Provider);
  }
}

/** A model row the steps act on. */
type RegistryModel = Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'Version' | 'Status' | 'Delivery' | 'ArtifactFileID' | 'ArtifactSha256' | 'TrainingRunID' | 'EvaluationProtocolID'>;

/** Runs the registry check. */
@RegisterClass(BaseScheduledJob, 'PredictiveStudioRegistryCheckJobDriver')
export class PredictiveStudioRegistryCheckJobDriver extends BaseScheduledJob {
  /** The default `StaleScoringRunHours`. */
  public static readonly DEFAULT_STALE_HOURS = 6;
  private static readonly MS_PER_HOUR = 3_600_000;
  private static readonly MS_PER_DAY = 86_400_000;
  private readonly resolved: RegistryCheckSeams;

  /** @param seams replacements for the production collaborators (tests); each one left out is the production default */
  constructor(seams: Partial<RegistryCheckSeams> = {}) {
    super();
    this.resolved = {
      Gate: seams.Gate || new LifecycleGate(),
      Publisher: seams.Publisher || new AutomatedMonitoringPublisher(),
      ArtifactLoader: seams.ArtifactLoader || new StorageProviderArtifactLoader(),
      ScoringActions: seams.ScoringActions || new GeneratorRegistryScoringActions(),
      Notifier: seams.Notifier || new UserNotificationMonitoringNotifier(),
      Clock: seams.Clock || { Now: () => new Date() },
      Migration: seams.Migration || {},
    };
  }

  /**
   * Every step, in the table's order, on the job's provider, as the job's owner when it has one
   * (`resolveScheduleOwnerUser`, which fails closed for a missing or inactive owner: the run then fails before any step)
   * and otherwise as the scheduler's system user: the seeded registry job has no owner by design, because (a)–(i) must
   * see every pipeline and no seeded user other than the system user can. Step (g) runs first, then (a)–(i). A step that
   * throws is recorded as one `retry` finding naming the error; the other steps still run. The run fails only when a
   * step threw. Step (g)'s record, when it ran, is the run's `Details` under {@link PreGateModelMigration.DetailsKey}
   * (later runs read the Record Processes it disabled back from there, D4-14).
   */
  public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
    const config = PredictiveStudioRegistryCheckJobDriver.ReadConfiguration(context.Schedule.Configuration);
    let runAs: GateContext['ContextUser'];
    try {
      runAs = await this.resolveScheduleOwnerUser(context.Schedule, context.ContextUser);
    } catch (e) {
      return { Success: false, ErrorMessage: `The registry check's owner could not be resolved, so it did not run: ${e instanceof Error ? e.message : String(e)}` };
    }
    const ctx = GateContexts.ForRequest({ ContextUser: runAs, Provider: context.Provider });
    const initiator: Actor = { kind: 'scheduled-job', scheduledJobRunId: context.Run.ID };
    const migration = await this.MigratePreChangeModels(config, context.Run.ID, ctx);
    const findings = [...migration.Findings, ...(await this.RunChecks(config, initiator, ctx))];
    const unnotified = await this.notify(context.Schedule.OwnerUserID, findings, ctx);
    const failed = findings.filter((f) => f.Outcome === 'retry' && f.Action.startsWith('the step failed'));
    return {
      Success: failed.length === 0,
      ErrorMessage: failed.length === 0 ? undefined : failed.map((f) => f.Detail).join('; '),
      Details: {
        Findings: findings,
        ...(unnotified.length > 0 ? { Unnotified: unnotified } : {}),
        ...(migration.Details === null ? {} : { [PreGateModelMigration.DetailsKey]: migration.Details }),
      },
    };
  }

  /** Checks the `Configuration`: `StaleScoringRunHours`, when present, is a positive number. */
  public ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult {
    const result = new ValidationResult();
    const json = JsonParse.ParseJsonText(schedule.Configuration || '{}', 'Configuration');
    if (json.Ok === false) result.Errors.push(new ValidationErrorInfo('Configuration', json.Errors.join('; '), schedule.Configuration, ValidationErrorType.Failure));
    else if (JsonParse.IsJsonObject(json.Value)) {
      const hours = JsonParse.JsonNumber(json.Value, 'StaleScoringRunHours');
      if ('StaleScoringRunHours' in json.Value && (hours === null || hours <= 0)) {
        result.Errors.push(new ValidationErrorInfo('Configuration.StaleScoringRunHours', 'must be a positive number of hours', schedule.Configuration, ValidationErrorType.Failure));
      }
    }
    result.Success = result.Errors.length === 0;
    return result;
  }

  /** The run's findings in words; a run with a `retry` finding is High priority. */
  public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
    return {
      Subject: `Predictive Studio registry check (${context.Schedule.Name}): ${result.Success ? 'completed' : 'failed'}`,
      Body: [result.ErrorMessage || '', JSON.stringify(result.Details || {})].filter((l) => l.length > 0).join('\n'),
      Priority: result.Success ? 'Normal' : 'High',
    };
  }

  /** The job's `Configuration` with its defaults (an absent or unreadable member reads as its default). Pure. */
  public static ReadConfiguration(text: string | null): RegistryCheckConfiguration {
    const json = JsonParse.ParseJsonText(text || '{}', 'Configuration');
    const root = json.Ok && JsonParse.IsJsonObject(json.Value) ? json.Value : null;
    const hours = root === null ? null : JsonParse.JsonNumber(root, 'StaleScoringRunHours');
    return {
      StaleScoringRunHours: hours !== null && hours > 0 ? hours : PredictiveStudioRegistryCheckJobDriver.DEFAULT_STALE_HOURS,
      Migration: PreGateModelMigration.ConfigFrom(root === null ? null : JsonParse.JsonObjectField(root, 'migration')),
    };
  }

  /** Every step in order; a step that throws becomes one `retry` finding. */
  public async RunChecks(config: RegistryCheckConfiguration, initiator: Actor, ctx: GateContext): Promise<RegistryFinding[]> {
    const steps: { readonly Letter: RegistryFinding['Finding']; readonly Run: () => Promise<RegistryFinding[]> }[] = [
      { Letter: 'a', Run: () => this.ArchiveOutsideGatePublishes(initiator, ctx) },
      { Letter: 'b', Run: () => this.RestoreOutsideGateDemotions(initiator, ctx) },
      { Letter: 'c', Run: () => this.RemediateArtifactHealth(initiator, ctx) },
      { Letter: 'd', Run: () => this.ResyncScoringActions(ctx) },
      { Letter: 'e', Run: () => this.FailStaleScoringRuns(config, ctx) },
      { Letter: 'f', Run: () => this.CloseSignOffWaits(initiator, ctx) },
      { Letter: 'h', Run: () => this.RecordOrphanPublishRecords(ctx) },
      { Letter: 'i', Run: () => this.ReattachViewGate(ctx) },
    ];
    const findings: RegistryFinding[] = [];
    for (const step of steps) {
      try {
        findings.push(...(await step.Run()));
      } catch (e) {
        findings.push({ Finding: step.Letter, SubjectID: null, Detail: `step (${step.Letter}): ${e instanceof Error ? e.message : String(e)}`, Action: 'the step failed; it runs again next hour', Outcome: 'retry' });
      }
    }
    return findings;
  }

  // ----- the steps -------------------------------------------------------------------------------------------------

  /**
   * (g) The pre-change model migration (§5.6 steps 2–5, D4-22): nothing once no pre-change work remains; otherwise one
   * bounded pass as this job run ({@link PreGateModelMigration.RunRegistryStep}), whose record the run's `Details`
   * carries. It runs before (a)–(c), which skip `Delivery IS NULL` rows. A pass that throws is one `retry` finding.
   */
  protected async MigratePreChangeModels(config: RegistryCheckConfiguration, scheduledJobRunId: string, ctx: GateContext): Promise<PreChangeStepOutcome> {
    try {
      const migrationCtx = PreGateMigrationContexts.ForJobRun({ ContextUser: ctx.ContextUser, Provider: ctx.Provider }, scheduledJobRunId, this.resolved.Migration);
      return { Details: await PreGateModelMigration.RunRegistryStep(config.Migration, migrationCtx), Findings: [] };
    } catch (e) {
      return { Details: null, Findings: [{ Finding: 'g', SubjectID: null, Detail: `step (g): ${e instanceof Error ? e.message : String(e)}`, Action: 'the step failed; it runs again next hour', Outcome: 'retry' }] };
    }
  }

  /**
   * (a) A Published model with no publish record is archived `status-written-outside-gate`; of a pipeline's surplus
   * Published models the one with the newest publish record stays and the rest are archived; then the rollback rule.
   */
  protected async ArchiveOutsideGatePublishes(initiator: Actor, ctx: GateContext): Promise<RegistryFinding[]> {
    const out: RegistryFinding[] = [];
    const touched = new Set<string>();
    for (const row of await this.query(REGISTRY_CHECK_QUERIES.PublishedWithoutRecord, {}, ctx)) {
      const modelId = String(row['ModelID']);
      const archived = await this.resolved.Gate.Archive(modelId, 'status-written-outside-gate: the model was set Published without a publish record', initiator, ctx);
      out.push(PredictiveStudioRegistryCheckJobDriver.archiveFinding('a', modelId, 'Published with no publish record (set outside the lifecycle gate)', archived));
      touched.add(String(row['PipelineID']).toLowerCase());
    }
    for (const row of await this.query(REGISTRY_CHECK_QUERIES.ManyPublished, {}, ctx)) {
      const pipelineId = String(row['PipelineID']);
      const published = await this.modelsOf(pipelineId, 'Published', ctx);
      const ranked = await this.byNewestPublishRecord(published, ctx);
      for (const surplus of ranked.slice(1)) {
        const archived = await this.resolved.Gate.Archive(surplus.ID, `status-written-outside-gate: pipeline ${pipelineId} held more than one Published model; ${ranked[0].ID} has the newest publish record and stays`, initiator, ctx);
        out.push(PredictiveStudioRegistryCheckJobDriver.archiveFinding('a', surplus.ID, `one of ${published.length} Published models of pipeline ${pipelineId}`, archived));
      }
      touched.add(pipelineId.toLowerCase());
    }
    for (const pipelineId of touched) out.push(...(await this.RollBackPipeline(pipelineId, 'a', initiator, ctx)));
    return out;
  }

  /**
   * (b) A model whose status was changed outside the gate away from Published while it holds a publish record
   * (Validated or KeepBaseline) is restored by the gate (R1's restore, no second publish record); when the gate refuses
   * it, it is archived with the refusal as the reason and the rollback rule runs.
   */
  protected async RestoreOutsideGateDemotions(initiator: Actor, ctx: GateContext): Promise<RegistryFinding[]> {
    const out: RegistryFinding[] = [];
    for (const row of await this.query(REGISTRY_CHECK_QUERIES.RecordsWithoutStatusChange, {}, ctx)) {
      const status = String(row['ModelStatus']);
      if (status !== 'Validated' && status !== 'KeepBaseline') continue;
      const modelId = String(row['ModelID']);
      const outcome = await this.resolved.Gate.Publish({ modelId, purpose: 'publish', initiator, signOffId: null, reason: null }, ctx);
      if (outcome.Kind !== 'withheld') {
        out.push({ Finding: 'b', SubjectID: modelId, Detail: `${status} with publish record ${String(row['PublishRecordID'])} (changed outside the lifecycle gate)`, Action: 'restored to Published by the lifecycle gate', Outcome: 'remediated' });
        continue;
      }
      if (outcome.Transient) {
        out.push({ Finding: 'b', SubjectID: modelId, Detail: `${status} with a publish record`, Action: `restore withheld (transient: ${GateRefusals.Describe(outcome.Refusal)})`, Outcome: 'retry' });
        continue;
      }
      const archived = await this.resolved.Gate.Archive(modelId, `the restore was refused: ${GateRefusals.Describe(outcome.Refusal)}`, initiator, ctx);
      out.push(PredictiveStudioRegistryCheckJobDriver.archiveFinding('b', modelId, `${status} with a publish record; its restore was refused`, archived));
      out.push(...(await this.RollBackPipeline(String(row['PipelineID']), 'b', initiator, ctx)));
    }
    return out;
  }

  /**
   * (c) A Published model whose stored artifact loads `missing` or `hash-mismatch` is archived, the rollback rule runs,
   * and one training run starts through the automated publisher when the pipeline has a bound protocol (D4-144).
   */
  protected async RemediateArtifactHealth(initiator: Actor, ctx: GateContext): Promise<RegistryFinding[]> {
    const out: RegistryFinding[] = [];
    const registry = ArtifactRegistry.ForContext(ctx, this.resolved.ArtifactLoader);
    for (const model of (await this.modelsOfAll('Published', ctx)).filter((m) => m.Delivery !== null)) {
      const load = await registry.Load(model, ctx);
      if (load.Status !== 'missing' && load.Status !== 'hash-mismatch') continue;
      const archived = await this.resolved.Gate.Archive(model.ID, `artifact-${load.Status}: the stored artifact of the Published model no longer verifies`, initiator, ctx);
      out.push(PredictiveStudioRegistryCheckJobDriver.archiveFinding('c', model.ID, `the stored artifact loads ${load.Status}`, archived));
      if (!archived.Ok) continue;
      out.push(...(await this.RollBackPipeline(model.PipelineID, 'c', initiator, ctx)));
      if (await this.pipelineHasProtocol(model.PipelineID, ctx)) out.push(await this.retrain(model.PipelineID, initiator, ctx));
    }
    return out;
  }

  /** (d) A Published model without an active per-model scoring Action gets it re-synced. */
  protected async ResyncScoringActions(ctx: GateContext): Promise<RegistryFinding[]> {
    const out: RegistryFinding[] = [];
    for (const model of await this.entitiesOf(`Status='Published' AND Delivery IS NOT NULL`, ctx)) {
      if (await this.resolved.ScoringActions.HasActiveAction(model.ID, ctx)) continue;
      await this.resolved.ScoringActions.Generate(model, ctx);
      out.push({ Finding: 'd', SubjectID: model.ID, Detail: 'a Published model without an active scoring Action', Action: 'scoring Action re-synced', Outcome: 'remediated' });
    }
    return out;
  }

  /** (e) A scoring run `running` since before the threshold is failed with the reason. */
  protected async FailStaleScoringRuns(config: RegistryCheckConfiguration, ctx: GateContext): Promise<RegistryFinding[]> {
    const now = this.resolved.Clock.Now();
    const before = new Date(now.getTime() - config.StaleScoringRunHours * PredictiveStudioRegistryCheckJobDriver.MS_PER_HOUR);
    const out: RegistryFinding[] = [];
    for (const row of await this.query(REGISTRY_CHECK_QUERIES.StaleScoringRuns, { StartedBefore: before.toISOString() }, ctx)) {
      const id = String(row['ID']);
      const runs = await StoredRowReads.Run<MJMLScoringRunEntity>({ EntityName: 'MJ: ML Scoring Runs', ExtraFilter: `ID='${EscapeSQLString(id)}'`, ResultType: 'entity_object', MaxRows: 1 }, ctx); // pk-filter-ok: MJ core entity keyed by ID
      const run = runs.Success ? runs.Results[0] : undefined;
      if (!run || run.Status !== 'running') continue;
      const reason = `the run stayed running for more than ${config.StaleScoringRunHours} h; the registry check failed it`;
      run.Status = 'failed';
      run.EndedAt = now;
      run.FirstErrors = JSON.stringify([{ recordId: '', message: reason }]);
      const saved = await run.Save();
      out.push({ Finding: 'e', SubjectID: id, Detail: `scoring run running since before ${before.toISOString()}`, Action: saved ? `failed: ${reason}` : `failing it did not save: ${run.LatestResult?.CompleteMessage || 'unknown error'}`, Outcome: saved ? 'remediated' : 'retry' });
    }
    return out;
  }

  /**
   * (f) A sign-off wait (D4-19): a model whose newest record is a `no-sign-off` refusal is closed when a newer training
   * run of its pipeline has been evaluated, or when its protocol's `signOffExpiryDays` (default 30) have passed since
   * the withheld attempt: the model is archived through the gate first, and only once the archive applied is the
   * `refusal` record `sign-off-wait-closed` written; the incumbent keeps serving. A refused archive writes no record, so
   * the model's newest record stays `no-sign-off` and the next run finds the wait again (`retry`). The gate's archive
   * opens its own transaction and takes no work to join it, so the record is written right after it commits; a record
   * write that fails then is a `retry` finding naming the archived model (its `StatusReason` already names the rule).
   */
  protected async CloseSignOffWaits(initiator: Actor, ctx: GateContext): Promise<RegistryFinding[]> {
    const out: RegistryFinding[] = [];
    const now = this.resolved.Clock.Now();
    for (const model of [...(await this.modelsOfAll('Validated', ctx)), ...(await this.modelsOfAll('KeepBaseline', ctx))]) {
      const latest = await this.latestRecord(model.ID, ctx);
      if (latest === null || latest.Kind !== 'refusal' || !PredictiveStudioRegistryCheckJobDriver.isNoSignOff(latest.RefusalObject)) continue;
      const closedBy = (await this.newerRunEvaluated(model, ctx)) ? 'newer-run-evaluated'
        : now.getTime() - new Date(latest.RecordedAt).getTime() >= (await this.expiryDays(model, ctx)) * PredictiveStudioRegistryCheckJobDriver.MS_PER_DAY ? 'expired' : null;
      if (closedBy === null) continue;
      const refusal: TransitionRefusal = { kind: 'sign-off-wait-closed', closedBy };
      const archived = await this.resolved.Gate.Archive(model.ID, `sign-off-wait-closed: ${GateRefusals.Describe(refusal)}`, initiator, ctx);
      const finding = PredictiveStudioRegistryCheckJobDriver.archiveFinding('f', model.ID, `a sign-off wait closed (${closedBy})`, archived);
      out.push(archived.Ok ? await this.recordWaitClosed(model, refusal, initiator, finding, ctx) : finding);
    }
    return out;
  }

  /** (f)'s `sign-off-wait-closed` record, written after the archive applied; a failed write is a `retry` finding. */
  private async recordWaitClosed(model: RegistryModel, refusal: TransitionRefusal, initiator: Actor, archived: RegistryFinding, ctx: GateContext): Promise<RegistryFinding> {
    try {
      await PublishRecords.WriteRefusal({ ModelID: model.ID, TrainingRunID: model.TrainingRunID, Purpose: 'publish', Approver: { Kind: 'automated-gate' }, Initiator: initiator, Refusal: refusal, Transient: false }, ctx);
      return archived;
    } catch (e) {
      return { ...archived, Action: `archived by the lifecycle gate, but its sign-off-wait-closed record did not save: ${e instanceof Error ? e.message : String(e)}`, Outcome: 'retry' };
    }
  }

  /** (h) A publish record with no matching status change (its model gone, Draft or Unevaluated) is recorded only. */
  protected async RecordOrphanPublishRecords(ctx: GateContext): Promise<RegistryFinding[]> {
    const out: RegistryFinding[] = [];
    for (const row of await this.query(REGISTRY_CHECK_QUERIES.RecordsWithoutStatusChange, {}, ctx)) {
      const status = row['ModelStatus'] === null || row['ModelStatus'] === undefined ? null : String(row['ModelStatus']);
      if (status === 'Validated' || status === 'KeepBaseline') continue;
      out.push({
        Finding: 'h', SubjectID: String(row['PublishRecordID']), Action: 'recorded only (the record is immutable; the model\'s status is governed by (a) and (b))', Outcome: 'recorded',
        Detail: status === null ? `publish record ${String(row['PublishRecordID'])} names no model (deleted)` : `publish record ${String(row['PublishRecordID'])} of a ${status} model`,
      });
    }
    return out;
  }

  /**
   * (i) A read permission on `MJ: Feature Values` or `MJ: Latest Feature Values` with no read filter gets the view gate.
   * One that carries a different read filter is never overwritten (an admin may have set it on purpose, and replacing it
   * could widen access): it is a `recorded` finding naming both filters.
   */
  protected async ReattachViewGate(ctx: GateContext): Promise<RegistryFinding[]> {
    const filters = await StoredRowReads.Run<Pick<MJRowLevelSecurityFilterEntity, 'ID'>>({ EntityName: 'MJ: Row Level Security Filters', ExtraFilter: `Name='${EscapeSQLString(VIEW_GATE_FILTER_NAME)}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx);
    if (!filters.Success) throw new Error(`reading the view gate filter failed: ${filters.ErrorMessage}`);
    const gate = filters.Results[0];
    if (!gate) return [{ Finding: 'i', SubjectID: null, Detail: `the '${VIEW_GATE_FILTER_NAME}' filter is not seeded`, Action: 'nothing to attach (the M5b metadata is missing)', Outcome: 'retry' }];
    const permissions = await StoredRowReads.Run<MJEntityPermissionEntity>({
      EntityName: 'MJ: Entity Permissions', ExtraFilter: `Entity IN (${VIEW_GATED_ENTITIES.map((e) => `'${EscapeSQLString(e)}'`).join(',')}) AND CanRead=1`, ResultType: 'entity_object',
    }, ctx);
    if (!permissions.Success) throw new Error(`reading the prediction entities' permissions failed: ${permissions.ErrorMessage}`);
    const out: RegistryFinding[] = [];
    for (const permission of permissions.Results.filter((p) => !UUIDsEqual(p.ReadRLSFilterID, gate.ID))) {
      if (permission.ReadRLSFilterID) {
        out.push({
          Finding: 'i', SubjectID: permission.ID, Outcome: 'recorded',
          Detail: `read permission of role ${permission.RoleID} on ${permission.Entity || permission.EntityID} carries read filter ${permission.ReadRLSFilterID}, not the view gate ${gate.ID}`,
          Action: 'recorded only: a different read filter is never overwritten; attach the view gate to that filter\'s rule or replace it by hand',
        });
        continue;
      }
      permission.ReadRLSFilterID = gate.ID;
      const saved = await permission.Save();
      out.push({
        Finding: 'i', SubjectID: permission.ID, Detail: `read permission of role ${permission.RoleID} on ${permission.Entity || permission.EntityID} without the view gate`,
        Action: saved ? 'the view gate attached' : `attaching it did not save: ${permission.LatestResult?.CompleteMessage || 'unknown error'}`, Outcome: saved ? 'remediated' : 'retry',
      });
    }
    return out;
  }

  /**
   * The rollback rule: when the pipeline has no Published model left, the newest `Archived` model with an applied
   * backing record (`publish`, `rollback` or `adopt`: {@link PublishRecords.BACKING_PURPOSES}, D4-204), a `Delivery` and
   * a verified artifact is published back through the gate (`purpose: 'rollback'`).
   */
  protected async RollBackPipeline(pipelineId: string, finding: RegistryFinding['Finding'], initiator: Actor, ctx: GateContext): Promise<RegistryFinding[]> {
    if ((await this.modelsOf(pipelineId, 'Published', ctx)).length > 0) return [];
    const registry = ArtifactRegistry.ForContext(ctx, this.resolved.ArtifactLoader);
    const archived = (await this.modelsOf(pipelineId, 'Archived', ctx)).filter((m) => m.Delivery !== null).sort((a, b) => b.Version - a.Version);
    for (const candidate of archived) {
      if (!(await this.hasBackingRecord(candidate.ID, ctx))) continue;
      if ((await registry.Load(candidate, ctx)).Status !== 'verified') continue;
      const request: PublishRequest = { modelId: candidate.ID, purpose: 'rollback', initiator, signOffId: null, reason: `registry check (${finding}): pipeline ${pipelineId} was left with no Published model` };
      return [PredictiveStudioRegistryCheckJobDriver.rollbackFinding(finding, candidate.ID, await this.resolved.Gate.Publish(request, ctx))];
    }
    return [{ Finding: finding, SubjectID: pipelineId, Detail: `pipeline ${pipelineId} has no Published model`, Action: 'no archived model with a publish record and a verified artifact to roll back to; scoring refuses model-not-published', Outcome: 'recorded' }];
  }

  // ----- helpers ---------------------------------------------------------------------------------------------------

  /** One training run of the pipeline published through the automated publisher (single-flight). */
  private async retrain(pipelineId: string, initiator: Actor, ctx: GateContext): Promise<RegistryFinding> {
    try {
      const trained = await this.resolved.Publisher.Train(pipelineId, ctx);
      const outcome = await this.resolved.Publisher.EvaluateAndPublish(trained.TrainingRunID, initiator, ctx);
      return { Finding: 'c', SubjectID: pipelineId, Detail: `pipeline ${pipelineId} retrained after its artifact was lost`, Action: `training run ${trained.TrainingRunID} started; the gate's outcome: ${outcome.Kind}`, Outcome: 'remediated' };
    } catch (e) {
      return { Finding: 'c', SubjectID: pipelineId, Detail: `pipeline ${pipelineId} needs a training run`, Action: `the training run did not start: ${e instanceof Error ? e.message : String(e)}`, Outcome: 'retry' };
    }
  }

  /** The rows of a stored Query on the job's provider (ruling S3). */
  private async query(name: string, parameters: Readonly<Record<string, string>>, ctx: GateContext): Promise<Record<string, string | number | boolean | null>[]> {
    const r = await PublishLocks.RunStored(name, parameters, ctx);
    if (!r.Success) throw new Error(`the query '${name}' failed: ${r.ErrorMessage}`);
    return r.Results;
  }

  private async modelsOf(pipelineId: string, status: MJMLModelEntity['Status'], ctx: GateContext): Promise<RegistryModel[]> {
    return this.entitiesOf(`PipelineID='${EscapeSQLString(pipelineId)}' AND Status='${status}'`, ctx);
  }

  private async modelsOfAll(status: MJMLModelEntity['Status'], ctx: GateContext): Promise<MJMLModelEntity[]> {
    return this.entitiesOf(`Status='${status}'`, ctx);
  }

  private async entitiesOf(filter: string, ctx: GateContext): Promise<MJMLModelEntity[]> {
    const r = await StoredRowReads.Run<MJMLModelEntity>({ EntityName: 'MJ: ML Models', ExtraFilter: filter, ResultType: 'entity_object', IgnoreMaxRows: true }, ctx);
    if (!r.Success) throw new Error(`reading ML Models failed: ${r.ErrorMessage}`);
    return r.Results;
  }

  /** The models ordered by their newest applied publish record, newest first (a model without one last). */
  private async byNewestPublishRecord(models: readonly RegistryModel[], ctx: GateContext): Promise<RegistryModel[]> {
    const at = new Map<string, number>();
    for (const m of models) {
      const record = await this.latestApplied(m.ID, ctx);
      at.set(m.ID, record === null ? -1 : new Date(record.RecordedAt).getTime());
    }
    const recordedAt = (id: string): number => {
      const t = at.get(id);
      return t === undefined ? -1 : t;
    };
    return [...models].sort((a, b) => recordedAt(b.ID) - recordedAt(a.ID));
  }

  /** Whether the model holds an applied record that backs a Published model ({@link PublishRecords.BackingRecordFilter}). */
  private async hasBackingRecord(modelId: string, ctx: GateContext): Promise<boolean> {
    const r = await StoredRowReads.Run<Pick<MJMLModelPublishRecordEntity, 'ID'>>({
      EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `ModelID='${EscapeSQLString(modelId)}' AND ${PublishRecords.BackingRecordFilter()}`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1,
    }, ctx);
    if (!r.Success) throw new Error(`reading the backing records of ML Model ${modelId} failed: ${r.ErrorMessage}`);
    return r.Results.length > 0;
  }

  private async latestApplied(modelId: string, ctx: GateContext): Promise<Pick<MJMLModelPublishRecordEntity, 'ID' | 'RecordedAt'> | null> {
    const r = await StoredRowReads.Run<Pick<MJMLModelPublishRecordEntity, 'ID' | 'RecordedAt'>>({
      EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `ModelID='${EscapeSQLString(modelId)}' AND Kind='publish'`, OrderBy: 'RecordedAt DESC', Fields: ['ID', 'RecordedAt'], ResultType: 'simple', MaxRows: 1,
    }, ctx);
    if (!r.Success) throw new Error(`reading the publish records of ML Model ${modelId} failed: ${r.ErrorMessage}`);
    return r.Results[0] || null;
  }

  private async latestRecord(modelId: string, ctx: GateContext): Promise<MJMLModelPublishRecordEntity | null> {
    const r = await StoredRowReads.Run<MJMLModelPublishRecordEntity>({ EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `ModelID='${EscapeSQLString(modelId)}'`, OrderBy: 'RecordedAt DESC', ResultType: 'entity_object', MaxRows: 1 }, ctx);
    if (!r.Success) throw new Error(`reading the records of ML Model ${modelId} failed: ${r.ErrorMessage}`);
    return r.Results[0] || null;
  }

  /** Whether a newer model of the pipeline (a later training run) has been evaluated past Draft. */
  private async newerRunEvaluated(model: RegistryModel, ctx: GateContext): Promise<boolean> {
    const others = await this.entitiesOf(`PipelineID='${EscapeSQLString(model.PipelineID)}' AND Status IN ('Validated','KeepBaseline','Published','Archived')`, ctx);
    return others.some((m) => m.Version > model.Version);
  }

  /** The model's protocol's `signOffExpiryDays` (30 when the row is missing or does not parse). */
  private async expiryDays(model: RegistryModel, ctx: GateContext): Promise<number> {
    if (!model.EvaluationProtocolID) return 30;
    const r = await StoredRowReads.Run<Parameters<typeof EvaluationProtocol.ParseEvaluationProtocolRow>[0]>({ EntityName: 'MJ: ML Evaluation Protocols', ExtraFilter: `ID='${EscapeSQLString(model.EvaluationProtocolID)}'`, ResultType: 'simple', MaxRows: 1 }, ctx); // pk-filter-ok: MJ core entity keyed by ID
    const row = r.Success ? r.Results[0] : undefined;
    const parsed = row ? EvaluationProtocol.ParseEvaluationProtocolRow(row) : null;
    return parsed !== null && parsed.Ok ? parsed.Value.promotion.signOffExpiryDays : 30;
  }

  private async pipelineHasProtocol(pipelineId: string, ctx: GateContext): Promise<boolean> {
    const r = await StoredRowReads.Run<Pick<MJMLTrainingPipelineEntity, 'ID' | 'EvaluationProtocolID'>>({ EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${EscapeSQLString(pipelineId)}'`, Fields: ['ID', 'EvaluationProtocolID'], ResultType: 'simple', MaxRows: 1 }, ctx); // pk-filter-ok: MJ core entity keyed by ID
    return r.Success && !!r.Results[0]?.EvaluationProtocolID;
  }

  /**
   * One notification per finding (D4-18): to the job's owner when the job has one; otherwise (the seeded job has none)
   * to the owner of the finding's model's monitoring job ({@link MonitoringJobs.OwnerOf}), the user its publish
   * ran as. Returns the findings no one could be notified of (no job owner and no model owner), which the run's
   * `Details` lists under `Unnotified`.
   */
  private async notify(ownerUserId: string | null, findings: readonly RegistryFinding[], ctx: RegistryContext): Promise<UnnotifiedFinding[]> {
    const unnotified: UnnotifiedFinding[] = [];
    const owners = new Map<string, string | null>();
    for (const f of findings) {
      const recipient = ownerUserId || (await this.modelOwner(f.SubjectID, owners, ctx));
      if (!recipient) {
        unnotified.push({ Finding: f.Finding, SubjectID: f.SubjectID, Reason: 'the registry job has no owner and the subject is not a model with a monitoring job owner' });
        continue;
      }
      await this.resolved.Notifier.Notify(recipient, `Predictive Studio registry check (${f.Finding}): ${f.Outcome}`, `${f.Detail}. Action: ${f.Action}.`, f.SubjectID || '', ctx);
    }
    return unnotified;
  }

  /** The owner of `subjectId`'s monitoring job when the subject is a model that has one (memoised per run); else null. */
  private async modelOwner(subjectId: string | null, owners: Map<string, string | null>, ctx: RegistryContext): Promise<string | null> {
    if (!subjectId) return null;
    const key = subjectId.toLowerCase();
    if (!owners.has(key)) owners.set(key, await MonitoringJobs.OwnerOf(subjectId, ctx));
    return owners.get(key) || null;
  }

  private static isNoSignOff(refusal: MJMLModelPublishRecordEntity['RefusalObject']): boolean {
    return refusal !== null && refusal.kind === 'no-sign-off';
  }

  private static archiveFinding(finding: RegistryFinding['Finding'], modelId: string, detail: string, archived: GateApplyResult): RegistryFinding {
    if (archived.Ok === true) return { Finding: finding, SubjectID: modelId, Detail: detail, Action: 'archived by the lifecycle gate', Outcome: 'remediated' };
    const why = 'Kind' in archived.Refusal ? `the artifact loads ${archived.Refusal.Load.Status}` : GateRefusals.Describe(archived.Refusal);
    return { Finding: finding, SubjectID: modelId, Detail: detail, Action: `the archive was refused: ${why}`, Outcome: 'retry' };
  }

  private static rollbackFinding(finding: RegistryFinding['Finding'], modelId: string, outcome: PublishOutcome): RegistryFinding {
    if (outcome.Kind === 'withheld') return { Finding: finding, SubjectID: modelId, Detail: 'the pipeline was left with no Published model', Action: `the rollback was withheld: ${GateRefusals.Describe(outcome.Refusal)}`, Outcome: 'retry' };
    return { Finding: finding, SubjectID: modelId, Detail: 'the pipeline was left with no Published model', Action: `rolled back to ML Model ${modelId} (publish record ${outcome.PublishRecordID})`, Outcome: 'remediated' };
  }
}

