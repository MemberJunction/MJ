/**
 * @module operations/train-model.mapping
 *
 * What the Train surfaces (the `PredictiveStudio.TrainModel` operation and the Train ML Model action) accept and
 * return. Both refuse the retired inputs with the same refusal, gather the same run facts once, and map them to the
 * same output, so the two surfaces cannot drift apart.
 *
 * The output is read from the run's stored envelope: the gate decision and its reason, the trainer's holdout scores,
 * the Training Snapshot and the Evaluation Protocol version. A run whose envelope cannot be read fails closed (it
 * throws) rather than reporting a guessed status.
 */
import type { MJMLModelEntity, PredictiveStudioTrainModelOutput, RetiredTrainModelInputs } from '@memberjunction/core-entities';
import {
  GateRules, TrainingRunResultsParser,
  type PipelineRefusal, type StoredGateRecord, type StoredTrainerResult, type TrainingRunResults,
} from '@memberjunction/predictive-studio-core';

import type { TrainModelResult } from '../training/types';
import { TrainingRefusedError } from '../training/training-refusal';
import type { IEvaluationProtocolStore } from '../training/evaluation-protocol-store';
import { WasTrainingLeakageFlagged } from './delegation';

/** The refusal that names an input a Train call may not send. */
type InputNotAcceptedRefusal = Extract<PipelineRefusal, { kind: 'input-not-accepted' }>;

/** A retired Train input: a key of the retired-input type that the `input-not-accepted` refusal can name. */
export type RetiredTrainInput = keyof RetiredTrainModelInputs & InputNotAcceptedRefusal['input'];

/** The retired Train inputs, in the order a refusal names them. */
export const RETIRED_TRAIN_INPUTS: readonly RetiredTrainInput[] = ['asOf', 'labelEventDates', 'maxRows', 'primaryKeyField'];

/** `true` only when the list names every member of the union; otherwise `never`, and assigning `true` fails to compile. */
type ListsEveryMember<Union, Listed> = [Exclude<Union, Listed>] extends [never] ? true : never;
/** Compile-time completeness: a key added to `RetiredTrainModelInputs` without listing it here breaks the build. */
const retiredInputsComplete: ListsEveryMember<keyof RetiredTrainModelInputs, (typeof RETIRED_TRAIN_INPUTS)[number]> = true;
void retiredInputsComplete;

/** The status a run reports when the gate decision ships no model row. */
export type NoModelStatus = 'NoSignal' | 'KeptExistingRule';

/** The produced model row's fields the output reads. */
export type TrainedModelFacts = Pick<MJMLModelEntity, 'ID' | 'Version' | 'Status' | 'HoldoutMetrics'>;

/** Everything the Train output is built from, gathered once from the engine result and the protocol row. */
export interface TrainRunFacts {
  /** The produced model row, or null when the gate decision ships no model. */
  readonly Model: TrainedModelFacts | null;
  /** One feature dominates the finalist's predictions (the run's LEAKAGE WARNING note). */
  readonly LeakageFlagged: boolean;
  readonly RunID: string;
  readonly TrainingSnapshotID: string | null;
  readonly EvaluationProtocolID: string | null;
  /** `MJ: ML Evaluation Protocols.Version` of `EvaluationProtocolID`, read through the FK. */
  readonly EvaluationProtocolVersion: number | null;
  readonly ValidationResults: string | null;
}

type CompletedRunResults = Extract<TrainingRunResults, { status: 'completed' }>;
type TrainOutput = PredictiveStudioTrainModelOutput;

/** The Train surfaces' input refusal, run facts and output mapping. */
export class TrainModelMapping {
  /** The retired inputs present in a payload, by own-property presence: a key sent with an empty value is still sent. */
  public static PresentRetiredInputs(payload: object): RetiredTrainInput[] {
    return RETIRED_TRAIN_INPUTS.filter((k) => Object.prototype.hasOwnProperty.call(payload, k));
  }

  /** The sentence that names every retired input a call sent. */
  public static RetiredInputsMessage(surface: string, names: readonly string[]): string {
    return `${surface} no longer accepts ${names.join(', ')}: the Prediction Unit declares the decision date and the row key, and every eligible row is read. Remove them from the call.`;
  }

  /**
   * The refusal for a call that sent retired inputs (the first one is the refusal's `input`, the message names them
   * all), or null when it sent none. `shownAs` is how the surface names them (an action's param names).
   */
  public static RetiredInputRefusal(surface: string, present: readonly RetiredTrainInput[], shownAs: readonly string[] = present): TrainingRefusedError | null {
    if (present.length === 0) return null;
    return new TrainingRefusedError({
      stage: 'pipeline',
      reason: { kind: 'input-not-accepted', input: present[0], why: TrainModelMapping.RetiredInputsMessage(surface, shownAs) },
    });
  }

  /**
   * The run facts both surfaces map: the model row, the dominance flag, the run's references and the protocol version
   * read through the run's `EvaluationProtocolID`.
   *
   * @throws Error when the run names a protocol row that cannot be read
   */
  public static async GatherRunFacts(result: TrainModelResult, protocols: IEvaluationProtocolStore): Promise<TrainRunFacts> {
    const run = result.run;
    const model = result.model;
    return {
      Model: model === null ? null : { ID: model.ID, Version: model.Version, Status: model.Status, HoldoutMetrics: model.HoldoutMetrics },
      LeakageFlagged: WasTrainingLeakageFlagged(result),
      RunID: run.ID,
      TrainingSnapshotID: run.TrainingSnapshotID,
      EvaluationProtocolID: run.EvaluationProtocolID,
      EvaluationProtocolVersion: await TrainModelMapping.protocolVersionOf(run.ID, run.EvaluationProtocolID, protocols),
      ValidationResults: run.ValidationResults,
    };
  }

  /**
   * The Train output: the model fields when a model was produced, the stored gate decision and its reason, the holdout
   * scores, and the snapshot and protocol the run used.
   *
   * @throws Error when the stored envelope cannot be read, or the run produced no model and its decision does not say why
   */
  public static TrainModelOutputFrom(f: TrainRunFacts): TrainOutput {
    const completed = TrainModelMapping.completedResults(f);
    return {
      ...TrainModelMapping.modelFields(f.Model),
      trainingRunId: f.RunID,
      status: TrainModelMapping.statusOf(f, completed.gate),
      leakageFlagged: f.LeakageFlagged,
      ...TrainModelMapping.holdoutField(f.Model, completed.trainer),
      ...TrainModelMapping.referenceFields(f),
      ...TrainModelMapping.gateFields(completed.gate),
    };
  }

  /**
   * The one sentence a finished Train call reports: the produced model and its version, or the stored reason no model
   * shipped. Read from the mapped output, so both surfaces report the reason the output carries.
   */
  public static FinishedMessage(out: TrainOutput): string {
    // `||`: the mapping stores a gate whenever no model ships; an absent reason still names the status, never "undefined".
    return out.modelId
      ? `Trained model ${out.modelId} (v${out.version}).`
      : `Training run ${out.trainingRunId} completed and shipped no model: ${out.gateReason || out.status}`;
  }

  /** The protocol row's Version, or null for a run with no protocol; a protocol the run names but nobody can read throws. */
  private static async protocolVersionOf(runId: string, protocolId: string | null, protocols: IEvaluationProtocolStore): Promise<number | null> {
    if (protocolId === null) return null;
    const row = await protocols.Load(protocolId);
    if (row === null) throw new Error(`training run ${runId} names Evaluation Protocol '${protocolId}', which cannot be read`);
    return row.Version;
  }

  /** The completed envelope; any other stored value fails closed. */
  private static completedResults(f: TrainRunFacts): CompletedRunResults {
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(f.ValidationResults);
    if (parsed.Ok === false) throw new Error(`training run ${f.RunID} stored results that cannot be read: ${parsed.Errors.join('; ')}`);
    if (parsed.Value.status !== 'completed') throw new Error(`training run ${f.RunID} stored a refusal, so its results cannot be read as a completed run`);
    return parsed.Value;
  }

  /** The model's status, or the status the stored decision names when no model was produced. */
  private static statusOf(f: TrainRunFacts, gate: StoredGateRecord | null): string {
    if (f.Model !== null) return f.Model.Status;
    if (gate === null) throw new Error(`training run ${f.RunID} produced no model and stored no gate decision`);
    const status = TrainModelMapping.noModelStatus(gate);
    if (status === null) throw new Error(`training run ${f.RunID} stored the outcome ${gate.decision.outcome} shipping ${gate.decision.shipped} but produced no model`);
    return status;
  }

  /** No-signal, or the unit's existing rule kept; null for a decision that should have produced a model. */
  private static noModelStatus(gate: StoredGateRecord): NoModelStatus | null {
    if (gate.decision.outcome === 'no-signal') return 'NoSignal';
    return gate.decision.shipped.startsWith(GateRules.HeuristicPrefix) ? 'KeptExistingRule' : null;
  }

  private static modelFields(model: TrainedModelFacts | null): Pick<TrainOutput, 'modelId' | 'version'> {
    return model === null ? {} : { modelId: model.ID, version: model.Version };
  }

  /**
   * The produced model's stored scores (the member the gate ships) when a model exists, otherwise the trainer's
   * finalist scores. A model row with empty scores reports none, never another member's.
   */
  private static holdoutField(model: TrainedModelFacts | null, trainer: StoredTrainerResult | null): Pick<TrainOutput, 'holdoutMetrics'> {
    // `if (text)`: an empty HoldoutMetrics string is no scores, the same as null.
    if (model !== null) return model.HoldoutMetrics ? { holdoutMetrics: model.HoldoutMetrics } : {};
    if (trainer === null) return {};
    const scores: Record<string, number> = { [trainer.holdout.primary.metric]: trainer.holdout.primary.value };
    for (const m of trainer.holdout.secondary) scores[m.metric] = m.value;
    return { holdoutMetrics: JSON.stringify(scores) };
  }

  private static referenceFields(f: TrainRunFacts): Pick<TrainOutput, 'trainingSnapshotId' | 'evaluationProtocolId' | 'evaluationProtocolVersion'> {
    return {
      ...(f.TrainingSnapshotID === null ? {} : { trainingSnapshotId: f.TrainingSnapshotID }),
      ...(f.EvaluationProtocolID === null ? {} : { evaluationProtocolId: f.EvaluationProtocolID }),
      ...(f.EvaluationProtocolVersion === null ? {} : { evaluationProtocolVersion: f.EvaluationProtocolVersion }),
    };
  }

  private static gateFields(gate: StoredGateRecord | null): Pick<TrainOutput, 'gateOutcome' | 'gateBranch' | 'gateReason' | 'shipped'> {
    if (gate === null) return {};
    const d = gate.decision;
    return { gateOutcome: d.outcome, gateBranch: d.branch, gateReason: gate.reason.text, ...(d.shipped === null ? {} : { shipped: d.shipped }) };
  }
}
