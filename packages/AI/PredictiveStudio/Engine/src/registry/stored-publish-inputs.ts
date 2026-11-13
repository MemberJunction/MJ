/**
 * @module registry/stored-publish-inputs
 *
 * Everything `PublishRules.ReverifyPublish` reads, loaded from stored rows only (Ruling Q21, D-015): the model row's
 * registered delivery and artifact hash, the training run's stored gate record (intervals, guard inputs, incumbent diff)
 * and trainer result (the registered artifact references), the protocol version row the run names, and the pipeline's
 * current Published model. The gate calls it after both publish locks are held, so the current Published model is the
 * one the publish would replace (N8); the PreSave status guard (M3.3) calls it to re-derive an authorised publish. Every
 * read runs on `ctx.Provider` as `ctx.ContextUser` and every ID comparison uses `UUIDsEqual`.
 */
import type { MJMLEvaluationProtocolEntity, MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
  EvaluationProtocol,
  JsonParse,
  RegistrySchemas,
  TrainingRunResultsParser,
  type Actor,
  type EvaluationProtocolColumns,
  type EvaluationProtocolSpec,
  type ListsEveryMember,
  type RegisteredDeliveryView,
  type StoredGateRecord,
  type StoredPublishInputs,
  type StoredTrainerResult,
  type TaskType,
  type TransitionRefusal,
  type UnitResolutionCounts,
} from '@memberjunction/predictive-studio-core';

import type { RegistryContext } from './registry-context';
import { StoredRowReads } from './stored-row-reads';

/** The protocol columns the gate reads and `EvaluationProtocol.ParseEvaluationProtocolRow` parses, from the generated entity. */
type StoredProtocolColumns = Pick<MJMLEvaluationProtocolEntity, keyof EvaluationProtocolColumns>;
/** The names of {@link StoredProtocolColumns}; listing a column the parser does not read, or omitting one, is a compile error. */
const PROTOCOL_COLUMNS = [
  'ID', 'LineageRootID', 'Version', 'Name', 'Holdout', 'InnerValidation', 'Seed', 'HoldoutAccessBudget', 'PrimaryScore', 'SecondaryMetrics',
  'Baselines', 'Calibration', 'Resampling', 'Intervals', 'Promotion', 'AllowedOutcomes', 'LeakageAudit', 'Exclusions', 'Slices',
  'PredictionIntervals', 'ResidualDiagnostics', 'RetrainTriggers', 'SearchStrategy', 'Budgets', 'MinMinorityClassRows', 'GuardFieldsEditableBy', 'AuthoredBy',
] as const satisfies readonly (keyof EvaluationProtocolColumns)[];
const protocolColumnsComplete: ListsEveryMember<keyof EvaluationProtocolColumns, (typeof PROTOCOL_COLUMNS)[number]> = true;
void protocolColumnsComplete;

/** The model columns publish re-verification reads. */
type PublishModelColumns = Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'TrainingRunID' | 'OutputSemantics' | 'Delivery' | 'ArtifactSha256'>;

/** A completed training run as stored: its gate record, trainer result and unit counts (each null when absent). */
export interface StoredRunRecord {
  readonly ID: string;
  readonly PipelineID: string;
  readonly ResultingModelID: string | null;
  readonly EvaluationProtocolID: string | null;
  readonly Gate: StoredGateRecord | null;
  readonly Trainer: StoredTrainerResult | null;
  readonly UnitResolution: UnitResolutionCounts | null;
}

/** A protocol version row, parsed. */
export interface StoredProtocolRow {
  readonly ID: string;
  readonly Version: number;
  readonly Spec: EvaluationProtocolSpec;
}

/** Reads of the stored training-run and protocol rows the gate's checks share. */
export class StoredRuns {
  /**
   * The training run's stored record; null when no run has the ID. A run whose `ValidationResults` is not a completed
   * v2 envelope is returned with a null gate record and trainer result.
   *
   * @throws Error when the read fails
   */
  public static async Read(trainingRunId: string, ctx: RegistryContext): Promise<StoredRunRecord | null> {
    const r = await StoredRowReads.Run<Pick<MJMLTrainingRunEntity, 'ID' | 'PipelineID' | 'ResultingModelID' | 'EvaluationProtocolID' | 'ValidationResults'>>(
      {
        EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(trainingRunId)}'`,
        Fields: ['ID', 'PipelineID', 'ResultingModelID', 'EvaluationProtocolID', 'ValidationResults'], MaxRows: 1, ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading ML Training Run ${trainingRunId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const run = r.Results[0];
    if (!run) return null;
    const parsed = run.ValidationResults ? TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults) : null;
    const completed = parsed !== null && parsed.Ok && parsed.Value.status === 'completed' ? parsed.Value : null;
    return {
      ID: run.ID, PipelineID: run.PipelineID, ResultingModelID: run.ResultingModelID, EvaluationProtocolID: run.EvaluationProtocolID,
      Gate: completed?.gate || null, Trainer: completed?.trainer || null, UnitResolution: completed?.unitResolution || null,
    };
  }

  /**
   * The protocol version row with this ID, parsed; null when there is none. Read past the RunView cache (D4-108): its
   * promotion rule is the margin and sign-off rule a publish is re-derived under, so it must be the stored row. This is
   * the gate's own read; the trainer's `RunViewEvaluationProtocolStore` (training-time reads) is not used here.
   *
   * @throws Error when the read fails or the row does not parse
   */
  public static async ReadProtocol(protocolId: string, ctx: RegistryContext): Promise<StoredProtocolRow | null> {
    const r = await StoredRowReads.Run<StoredProtocolColumns>(
      { EntityName: 'MJ: ML Evaluation Protocols', ExtraFilter: `ID='${EscapeSQLString(protocolId)}'`, Fields: [...PROTOCOL_COLUMNS], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading Evaluation Protocol ${protocolId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    if (!row) return null;
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(row);
    if (parsed.Ok === false) throw new Error(`Evaluation Protocol ${protocolId} does not parse: ${parsed.Errors.join('; ')}`);
    return { ID: row.ID, Version: row.Version, Spec: parsed.Value };
  }
}

/** Loads {@link StoredPublishInputs} from stored rows. */
export class StoredPublishInputsLoader {
  /**
   * The stored publish inputs of `modelId` for an attempt `initiator` started, or the refusal naming what the stored
   * rows lack: `model-not-found` for no row; `not-servable` for a row with no training run, a run with no stored gate
   * record or trainer result (a pre-change model), a protocol row that is gone, or a model column that does not parse.
   * Call it after the publish locks are held: the pipeline's current Published model is read here.
   *
   * @throws Error when a read fails (a failed read is not an absent row)
   */
  public static async Load(modelId: string, initiator: Actor, ctx: RegistryContext): Promise<StoredPublishInputs | TransitionRefusal> {
    const model = await StoredPublishInputsLoader.readModel(modelId, ctx);
    if (model === null) return { kind: 'model-not-found', modelId };
    const run = model.TrainingRunID ? await StoredRuns.Read(model.TrainingRunID, ctx) : null;
    if (run === null || run.Gate === null || run.Trainer === null) {
      return StoredPublishInputsLoader.notServable(`ML Model ${modelId} has no stored training run with a gate record and trainer result`);
    }
    const protocol = await StoredRuns.ReadProtocol(run.EvaluationProtocolID || run.Gate.evaluationProtocolId, ctx);
    if (protocol === null) return StoredPublishInputsLoader.notServable(`the protocol version its training run names is gone`);
    const pinnedVersion = await StoredPublishInputsLoader.pinnedVersion(run.Gate, protocol, ctx);
    if (pinnedVersion === null) return StoredPublishInputsLoader.notServable(`the protocol version its stored gate record names is gone`);
    const task = RegistrySchemas.ParseOutputSemantics(model.OutputSemantics);
    if (task.Ok === false) return StoredPublishInputsLoader.notServable(`its OutputSemantics does not parse: ${task.Errors.join('; ')}`);
    const delivery = StoredPublishInputsLoader.deliveryOf(model.Delivery);
    if (delivery === null) return StoredPublishInputsLoader.notServable('its Delivery is missing or not a registered delivery');
    const current = await StoredPublishInputsLoader.readCurrentPublished(model, ctx);
    return StoredPublishInputsLoader.build(model, run.Gate, run.Trainer, protocol, pinnedVersion, task.Value.task, delivery, current, initiator);
  }

  /** The inputs, assembled. Pure. */
  private static build(
    model: PublishModelColumns, gate: StoredGateRecord, trainer: StoredTrainerResult, protocol: StoredProtocolRow, pinnedVersion: number,
    task: TaskType, delivery: RegisteredDeliveryView, current: string | null, initiator: Actor,
  ): StoredPublishInputs {
    return {
      ModelID: model.ID,
      Task: task,
      GateIntervals: gate.intervals,
      GateGuards: gate.guards,
      // The run's stored gate record names the version row it was judged under; the row is loaded by the run's own
      // EvaluationProtocolID, so a gate record that disagrees with its run is a protocol mismatch, not a quiet pass.
      PinnedProtocol: { ProtocolID: gate.evaluationProtocolId, ProtocolVersion: pinnedVersion },
      ProtocolRow: { ID: protocol.ID, Version: protocol.Version, Promotion: protocol.Spec.promotion },
      RegisteredArtifacts: trainer.artifacts,
      RegisteredDelivery: { Shipped: delivery.kind === 'delivered' ? delivery.shipped : null, ArtifactSha256: model.ArtifactSha256 },
      IncumbentDiff: gate.incumbentDiff,
      CurrentPublishedModelID: current,
      Initiator: initiator,
    };
  }

  /**
   * The version of the protocol row the run's stored gate record names: the loaded row's when it is that row, else the
   * named row's own (so a run whose `EvaluationProtocolID` was moved off its gate record's version is refused naming
   * both versions as stored); null when the named row is gone.
   */
  private static async pinnedVersion(gate: StoredGateRecord, loaded: StoredProtocolRow, ctx: RegistryContext): Promise<number | null> {
    if (UUIDsEqual(gate.evaluationProtocolId, loaded.ID)) return loaded.Version;
    return (await StoredRuns.ReadProtocol(gate.evaluationProtocolId, ctx))?.Version || null;
  }

  private static async readModel(modelId: string, ctx: RegistryContext): Promise<PublishModelColumns | null> {
    const r = await StoredRowReads.Run<PublishModelColumns>(
      {
        EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`,
        Fields: ['ID', 'PipelineID', 'TrainingRunID', 'OutputSemantics', 'Delivery', 'ArtifactSha256'], MaxRows: 1, ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading ML Model ${modelId} for publish re-verification failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0] || null;
  }

  /** The pipeline's Published model other than this one; null when there is none. */
  private static async readCurrentPublished(model: PublishModelColumns, ctx: RegistryContext): Promise<string | null> {
    const r = await StoredRowReads.Run<Pick<MJMLModelEntity, 'ID'>>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `PipelineID='${EscapeSQLString(model.PipelineID)}' AND Status='Published'`, Fields: ['ID'], ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the Published model of pipeline ${model.PipelineID} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results.find((m) => !UUIDsEqual(m.ID, model.ID))?.ID || null;
  }

  /** The stored delivery view checked against its schema; null when the column is empty, not JSON or not a delivery. */
  private static deliveryOf(text: string | null): RegisteredDeliveryView | null {
    const json = JsonParse.ParseJsonText(text, 'Delivery');
    if (json.Ok === false) return null;
    const parsed = RegistrySchemas.RegisteredDeliveryView.safeParse(json.Value);
    return parsed.success ? parsed.data : null;
  }

  private static notServable(reason: string): TransitionRefusal {
    return { kind: 'not-servable', reason };
  }
}
