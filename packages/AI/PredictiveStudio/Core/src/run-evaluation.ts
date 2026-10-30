/**
 * @module run-evaluation
 *
 * The gate record a completed unit training run stores as the `gate` member of its `ps-run-results/v2` envelope
 * (`MJ: ML Training Runs.ValidationResults`): the paired intervals (never the booleans derived from them), the pinned
 * margin and protocol version row, the transcribed and the final decision with its reason, the guard inputs, the
 * incumbent diff and slice coverage. The trainer's evaluation itself lives in the envelope's `trainer` member; this
 * record copies none of it. TypeScript is authoritative for the stored outcome: a sidecar decision that differs from
 * the transcription refuses the run. Publish re-verification re-derives the decision from this record and the pinned
 * protocol row.
 */
import type { EvaluationProtocolSpec, MetricKey } from './evaluation-protocol';
import {
  GateRules,
  type CompletedTrainerResult, type GateDecision, type GateGuardInputs, type GateGuardRefusal, type GateReason, type StoredGateIntervals,
} from './gate';
import type { HoldoutCarveSummary } from './holdout-carve';
import type { TaskType } from './task-type';
import type { TrainerCompleted } from './trainer-contract';
import { TrainingRunResultsParser } from './training-run-results';

/** Which declared slices the trainer's result covers. */
export interface SliceCoverage {
  /** Declared `slices.subgroups` fields with no subgroup slice in the trainer result. */
  readonly missingSubgroups: readonly string[];  // case-violation-ok-legacy-back-compat: stored gate record key
  /** Holdout periods (from the run's carve) with no out-of-time slice, when `slices.outOfTime` is declared. */
  readonly missingPeriods: readonly string[];  // case-violation-ok-legacy-back-compat: stored gate record key
  /** Slices whose primary score lacks a finite lower or upper bound. */
  readonly slicesWithoutInterval: number;  // case-violation-ok-legacy-back-compat: stored gate record key
}

/** The gate decision a completed unit run stores, with everything needed to re-derive it. */
export interface StoredGateRecord {
  /** The Evaluation Protocol version row the run was judged under. */
  readonly evaluationProtocolId: string;  // case-violation-ok-legacy-back-compat: stored gate record key
  /** The protocol's promotion margin the intervals were compared with. */
  readonly margin: number;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly primaryMetric: MetricKey;  // case-violation-ok-legacy-back-compat: stored gate record key
  /** Rows in the locked holdout the intervals were measured on. */
  readonly holdoutRows: number;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly intervals: StoredGateIntervals;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly guards: GateGuardInputs;  // case-violation-ok-legacy-back-compat: stored gate record key
  /** The decision table's output (what the sidecar agreed with). */
  readonly transcribed: GateDecision;  // case-violation-ok-legacy-back-compat: stored gate record key
  /** The stored decision: the transcription, or no-signal when a guard refused. */
  readonly decision: GateDecision;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly guardRefusal: GateGuardRefusal | null;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly reason: GateReason;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly incumbentDiff: TrainerCompleted['incumbentDiff'];  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly sliceCoverage: SliceCoverage;  // case-violation-ok-legacy-back-compat: stored gate record key
}

/** What the gate record is built from. */
export interface GateRecordArgs {
  /** The live result (the trainer path builds the record before the artifacts are stored) or the stored one. */
  readonly Result: CompletedTrainerResult;
  /** The protocol version row the run's `EvaluationProtocolID` names. */
  readonly Protocol: EvaluationProtocolSpec;
  readonly Task: TaskType;
  /** The run's holdout carve (envelope `carve`): class counts and holdout periods; null when the run has none. */
  readonly Carve: Pick<HoldoutCarveSummary, 'holdoutClassCounts' | 'holdoutPeriods'> | null;
}

/** Why a run was refused at the gate stage: the two implementations disagree, or a comparison the gate needs is absent. */
export type GateStageRefusal =
  | { readonly kind: 'sidecar-gate-mismatch'; readonly sidecar: GateDecision; readonly engine: GateDecision }  // case-violation-ok-legacy-back-compat: stored envelope key
  | { readonly kind: 'missing-comparison'; readonly comparison: string };  // case-violation-ok-legacy-back-compat: stored envelope key

/** The built record, or the gate-stage refusal. */
export type GateRecordBuild =
  | { readonly Ok: true; readonly Record: StoredGateRecord }
  | { readonly Ok: false; readonly Refusal: GateStageRefusal };

/** Building and reading the stored gate record (static members on one owner). */
export class GateRecords {
  /** The record a completed run stores; refuses a missing comparison or a sidecar decision that differs from the transcription. */
  public static BuildStoredGateRecord(a: GateRecordArgs): GateRecordBuild {
    const r = a.Result;
    const intervals = GateRules.StoredGateIntervalsFromResult(r);
    if (!intervals.Ok) return { Ok: false, Refusal: { kind: 'missing-comparison', comparison: intervals.MissingComparison } };
    const guards = GateRecords.guardInputs(a);
    const margin = a.Protocol.promotion.margin;
    const guarded = GateRules.DecideGuardedGate(intervals.Intervals, margin, guards);
    if (!GateRules.SameGate(guarded.Transcribed, r.gate)) {
      return { Ok: false, Refusal: { kind: 'sidecar-gate-mismatch', sidecar: r.gate, engine: guarded.Transcribed } };
    }
    return {
      Ok: true,
      Record: {
        evaluationProtocolId: a.Protocol.id,
        margin,
        primaryMetric: a.Protocol.primaryScore.metric,
        holdoutRows: r.holdout.primary.n,
        intervals: intervals.Intervals,
        guards,
        transcribed: guarded.Transcribed,
        decision: guarded.Decision,
        guardRefusal: guarded.GuardRefusal,
        reason: GateRules.DescribeGate(intervals.Intervals, guarded, a.Protocol.primaryScore.metric),
        incumbentDiff: r.incumbentDiff,
        sliceCoverage: GateRecords.sliceCoverage(a.Protocol, r.slices, a.Carve === null ? [] : a.Carve.holdoutPeriods),
      },
    };
  }

  /**
   * The stored gate record of a run, or null for a legacy blob, a refused run, or a run stored before gate records
   * existed. The envelope is checked member by member by `ParseTrainingRunResults`.
   */
  public static ParseStoredGateRecord(validationResults: string | null): StoredGateRecord | null {
    if (validationResults === null || validationResults.trim().length === 0) return null;
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(validationResults);
    if (!parsed.Ok || parsed.Value.status !== 'completed') return null;
    return parsed.Value.gate;
  }

  /** What the two guards read: the task kind, the holdout's class counts, the finalist's holdout AUC interval and the protocol minimum. */
  private static guardInputs(a: GateRecordArgs): GateGuardInputs {
    return {
      taskKind: a.Task.kind,
      holdoutClassCounts: a.Carve === null ? null : a.Carve.holdoutClassCounts,
      modelAucInterval: a.Result.holdout.secondary.find((m) => m.metric === 'auc')?.interval || null,
      minMinorityClassRows: a.Protocol.minMinorityClassRows,
    };
  }

  private static sliceCoverage(protocol: EvaluationProtocolSpec, slices: CompletedTrainerResult['slices'], periods: readonly string[]): SliceCoverage {
    const subgroupFields = new Set(slices.flatMap((s) => (s.slice.kind === 'subgroup' ? [s.slice.field] : [])));
    const outOfTime = new Set(slices.flatMap((s) => (s.slice.kind === 'out-of-time' ? [s.slice.period] : [])));
    return {
      missingSubgroups: protocol.slices.subgroups.filter((f) => !subgroupFields.has(f)),
      missingPeriods: protocol.slices.outOfTime ? periods.filter((p) => !outOfTime.has(p)) : [],
      slicesWithoutInterval: slices.filter((s) => !(Number.isFinite(s.primary.interval.lower) && Number.isFinite(s.primary.interval.upper))).length,
    };
  }
}
