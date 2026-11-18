import { readdirSync } from 'node:fs';
import path from 'node:path';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import type { MJMLModelPublishRecordEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { PublishRecords, StoredPublishInputsLoader, StoredRowReads, type RegistryContext } from '@memberjunction/predictive-studio';
import {
  AtRiskRules,
  EvaluationLineage,
  JsonParse,
  PublishRules,
  RegistrySchemas,
  type AtRiskRow,
  type GateDecision,
  type OutcomeModelLike,
  TrustVerdicts,
  type MajorityBaselineRule,
  type OutcomeTitleText,
  type PredictiveStudioRefusalCode,
  type RunDetailLike,
  type ValidationStrategy,
} from '@memberjunction/predictive-studio-core';
import type { TrainAttempt, CandidateModel, ScoreAttempt } from './types';

/** A withheld verdict as a model stores it. `Grade` is the verdict's title, a literal union never widened to `string`. */
export interface StoredWithheldVerdict {
  CanAct: boolean;
  Grade: OutcomeTitleText;
  Reason: string;
}

/**
 * A classifier no better than always guessing the most common class (or one that predicts a single class), read from
 * the stored model: the rule its lineage records and the holdout numbers it stores.
 */
export interface MajorityBaselineFinding {
  /** The rule in the model's `Lineage.evaluation` (`'enforce'` when the lineage records none). */
  Rule: MajorityBaselineRule;
  /** True under `enforce`, and under `warn` when accuracy is the only evidence (no AUC stored). */
  Enforced: boolean;
  Accuracy: number | null;
  BaselineAccuracy: number | null;
  PredictedClasses: number | null;
}

/** One scored row whose top per-record driver is the label a gate asked about. */
export interface TopDriverRow {
  RecordID: string;
  /** `AtRiskRules.DriverRaisesRisk` of that driver: false renders the green "Lowers Risk" badge. */
  RaisesRisk: boolean;
}

/**
 * Whether a Published model's stored gate decision is what publish re-verification re-derives from the stored rows
 * (G0.2's half (b)): `Reverified` true, or false with `Why` naming what is missing or differs.
 */
export type StoredDecisionReverification = { readonly Reverified: true } | { readonly Reverified: false; readonly Why: string };

/**
 * The reader a probe of stored records runs as: a provider and its user. A `TruthHarness` is one (the check's
 * client transport); the probe's unit tests pass the Engine's fake provider.
 */
export interface ProbeReader {
  /** The provider every read runs on. */
  readonly Provider: IMetadataProvider;
  /** The user every read runs as. */
  readonly User: UserInfo;
}

/** How the gate bodies read containment behaviour. Static members only: the class is the one seam. */
export class ContainmentProbe {
  /** Refused before training: the operation returned the expected refusal code and produced no model. */
  public static WasRefusedBeforeTraining(a: TrainAttempt, expected: PredictiveStudioRefusalCode): boolean {
    return !a.Ok && a.RefusalCode === expected && a.ModelID === null;
  }

  /** Scoring refused: the expected refusal code, nothing written and nothing returned. */
  public static WasScoringRefused(a: ScoreAttempt, expected: PredictiveStudioRefusalCode): boolean {
    return !a.Ok && a.RefusalCode === expected && a.Written === 0 && a.Predictions.length === 0;
  }

  /**
   * Whether a model of an agent run reached Published (G0.2, G0.3). The runs have automated publishing on and no person
   * in them; the amended threshold counts Published whoever or whatever promoted the model.
   */
  public static ReachedPublishedUnattended(m: CandidateModel): boolean {
    return m.Status === 'Published';
  }

  /**
   * The model's registered gate decision (D-015): the `gate` of its `MJ: ML Models.Delivery` JSON, read through Core's
   * `RegisteredDeliveryView` schema as the publish loader reads it; null when the column is empty or does not parse.
   */
  public static ReadStoredGateDecision(m: CandidateModel): GateDecision | null {
    const json = JsonParse.ParseJsonText(m.DeliveryJSON, 'Delivery');
    if (json.Ok === false) return null;
    const parsed = RegistrySchemas.RegisteredDeliveryView.safeParse(json.Value);
    return parsed.success ? parsed.data.gate : null;
  }

  /**
   * G0.2's half (b) for a Published model: its stored gate decision is a `model` outcome, a `publish` record names its
   * training run and the model ({@link PublishRecords.FindPublishForRun}), and `PublishRules.ReverifyPublish` over the
   * inputs the gate's own {@link StoredPublishInputsLoader} loads — for the record's initiator, against the model the
   * record says it replaced — re-derives exactly that decision. Not reverified when the model stores no decision, the
   * record is missing, the loader refuses or the re-derivation refuses or differs.
   *
   * @throws Error when a read fails (a failed read is not an absent row)
   */
  public static async ReverifiesStoredDecision(m: CandidateModel, reader: ProbeReader): Promise<StoredDecisionReverification> {
    const stored = ContainmentProbe.ReadStoredGateDecision(m);
    if (stored === null) return { Reverified: false, Why: 'no stored gate decision (Delivery)' };
    if (stored.outcome !== 'model') return { Reverified: false, Why: `the stored gate decision is '${stored.outcome}', not 'model'` };
    if (!m.TrainingRunID) return { Reverified: false, Why: 'the model names no training run' };
    const ctx = ContainmentProbe.registryContext(reader);
    const record = await ContainmentProbe.publishRecordOf(m.TrainingRunID, ctx);
    if (record === null || !UUIDsEqual(record.ModelID, m.ModelID)) return { Reverified: false, Why: 'no publish record names the run and the model' };
    const inputs = await StoredPublishInputsLoader.Load(m.ModelID, record.InitiatorObject, ctx);
    if ('kind' in inputs) return { Reverified: false, Why: `the publish loader refuses: ${inputs.kind}` };
    const reverified = PublishRules.ReverifyPublish({ ...inputs, CurrentPublishedModelID: record.ReplacesModelID || null });
    if (reverified.Ok === false) return { Reverified: false, Why: `ReverifyPublish refuses: ${reverified.Reason} (${reverified.Detail})` };
    if (!ContainmentProbe.sameDecision(reverified.Gate, stored)) return { Reverified: false, Why: `ReverifyPublish re-derives ${reverified.Gate.outcome}/${reverified.Gate.shipped}, the model stores ${stored.outcome}/${stored.shipped}` };
    return { Reverified: true };
  }

  /**
   * Whether the training run's outcome is recorded (D4-56, §5.7 R4): a `publish` record names the run
   * ({@link PublishRecords.FindPublishForRun}), or a `refusal` record does — run-level (no model) or model-level —
   * carrying a non-empty reason.
   *
   * @throws Error when a read fails
   */
  public static async RunOutcomeRecorded(trainingRunId: string, reader: ProbeReader): Promise<boolean> {
    if ((await PublishRecords.FindPublishForRun(trainingRunId, ContainmentProbe.registryContext(reader))) !== null) return true;
    return (await ContainmentProbe.readRefusals(trainingRunId, reader)).some((x) => (x.Reason || '').trim().length > 0);
  }

  /**
   * The distinct refusal kinds (the `kind` of each record's stored `Refusal` JSON, e.g. `unacknowledged-leakage-flags`) of
   * the `refusal` records that name the training run, run-level or model-level, in the order first read; a record whose
   * `Refusal` does not parse or names no kind is left out. Empty when no refusal record names the run.
   *
   * @throws Error when the read fails
   */
  public static async ReadRefusalKinds(trainingRunId: string, reader: ProbeReader): Promise<string[]> {
    const kinds: string[] = [];
    for (const x of await ContainmentProbe.readRefusals(trainingRunId, reader)) {
      const json = JsonParse.ParseJsonText(x.Refusal, 'Refusal');
      const kind = json.Ok && JsonParse.IsJsonObject(json.Value) ? JsonParse.JsonString(json.Value, 'kind') : null;
      if (kind !== null && kind.length > 0 && !kinds.includes(kind)) kinds.push(kind);
    }
    return kinds;
  }

  /** The withheld verdict a model stores: `Lineage.evaluation.WithheldReason` with its trust verdict's gate and title. */
  public static ReadStoredWithheldVerdict(m: CandidateModel): StoredWithheldVerdict | null {
    const evaluation = EvaluationLineage.Read(m.LineageJSON);
    if (!evaluation?.WithheldReason) {
      return null;
    }
    return { CanAct: m.Trust.CanAct, Grade: TrustVerdicts.OutcomeTitle(m.Trust), Reason: evaluation.WithheldReason };
  }

  /**
   * The majority-baseline finding of a stored classifier: null unless its stored holdout accuracy is at or below the
   * always-majority rate, or it predicted one class. The rule comes from the model's own lineage. Only classifiers store
   * accuracy, the majority rate and the predicted-class count, so a regression model finds nothing without a task check.
   */
  public static ReadMajorityBaselineFinding(m: CandidateModel): MajorityBaselineFinding | null {
    const accuracy = ContainmentProbe.holdoutMetric(m, ['accuracy', 'acc']);
    const baseline = ContainmentProbe.holdoutMetric(m, ['baseline_accuracy']);
    const predicted = ContainmentProbe.holdoutMetric(m, ['predicted_classes']);
    const singleClass = predicted !== null && predicted <= 1;
    const atOrBelow = accuracy !== null && baseline !== null && accuracy <= baseline;
    if (!singleClass && !atOrBelow) return null;
    const rule = EvaluationLineage.Read(m.LineageJSON)?.MajorityBaselineRule || EvaluationLineage.DefaultMajorityBaselineRule;
    const accuracyOnly = ContainmentProbe.holdoutMetric(m, ['auc', 'roc_auc', 'rocauc']) === null;
    return { Rule: rule, Enforced: rule === 'enforce' || accuracyOnly, Accuracy: accuracy, BaselineAccuracy: baseline, PredictedClasses: predicted };
  }

  /**
   * Declare the pipeline's time index as `ValidationStrategy.TimeIndexColumn`, keeping the rest of its validation
   * strategy. The caller sets the strategy first and saves the pipeline; throws when no strategy is set.
   */
  public static ApplyTimeIndexDeclaration(pipeline: Pick<MJMLTrainingPipelineEntity, 'ValidationStrategy'>, column: string): void {
    const current = pipeline.ValidationStrategy ? SafeJSONParse<ValidationStrategy>(pipeline.ValidationStrategy) : null;
    if (!current) {
      throw new Error(`ContainmentProbe.ApplyTimeIndexDeclaration: the pipeline has no ValidationStrategy to declare '${column}' on`);
    }
    const next: ValidationStrategy = { ...current, TimeIndexColumn: column };
    pipeline.ValidationStrategy = JSON.stringify(next);
  }

  /**
   * Cleared to act: the model's trust verdict (its training run's stored gate decision) lets a user act on it. A model
   * without a stored decision is not evaluated and never cleared; the name keeps the gates' wording.
   */
  public static GradedAbovePoorOrActionable(m: CandidateModel): boolean {
    return m.Trust.CanAct;
  }

  /** The story-generation prompt S9.3 scans: the Model Development Agent's templates (its "4. Report" step writes stories). */
  public static StoryPromptFiles(mjRoot: string): string[] {
    const dir = path.join(mjRoot, 'metadata/prompts/templates/model-development-agent');
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(dir, f));
  }

  /**
   * The rows whose top per-record driver has `label`, each with whether that driver raises the displayed risk
   * (`AtRiskRules.DriverRaisesRisk`, the rule the drawer's badge renders from).
   */
  public static TopDriverRows(details: RunDetailLike[], label: string, model: OutcomeModelLike): TopDriverRow[] {
    const out: TopDriverRow[] = [];
    for (const row of ContainmentProbe.resourceRows(details, model)) {
      const top = row.Drivers?.[0];
      if (top && top.Label === label) out.push({ RecordID: row.RecordID, RaisesRisk: top.Up });
    }
    return out;
  }

  /** The record ids "Send to a list" puts on the At-Risk list. */
  public static AtRiskListRecordIDs(details: RunDetailLike[], model: OutcomeModelLike): string[] {
    return AtRiskRules.SelectAtRiskListMembers(ContainmentProbe.resourceRows(details, model), 200).map((r) => r.RecordID);
  }

  /**
   * The `refusal` records that name the training run, with their reason text and stored refusal.
   *
   * @throws Error when the read fails
   */
  private static async readRefusals(trainingRunId: string, reader: ProbeReader): Promise<Pick<MJMLModelPublishRecordEntity, 'ID' | 'TrainingRunID' | 'Reason' | 'Refusal'>[]> {
    const r = await StoredRowReads.Run<Pick<MJMLModelPublishRecordEntity, 'ID' | 'TrainingRunID' | 'Reason' | 'Refusal'>>({
      EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `TrainingRunID='${EscapeSQLString(trainingRunId)}' AND Kind='refusal'`,
      Fields: ['ID', 'TrainingRunID', 'Reason', 'Refusal'], ResultType: 'simple',
    }, ContainmentProbe.registryContext(reader));
    if (!r.Success) throw new Error(`Reading the refusal records of training run ${trainingRunId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results.filter((x) => UUIDsEqual(x.TrainingRunID, trainingRunId));
  }

  /** The registry context a probe reads under: the reader's provider, as its user. */
  private static registryContext(reader: ProbeReader): RegistryContext {
    return { Provider: reader.Provider, ContextUser: reader.User };
  }

  /**
   * The `publish` record of a training run, found by the Engine's reader and loaded for the initiator and the model it
   * replaced; null when the run has none.
   *
   * @throws Error when the read or the load fails
   */
  private static async publishRecordOf(trainingRunId: string, ctx: RegistryContext): Promise<MJMLModelPublishRecordEntity | null> {
    const found = await PublishRecords.FindPublishForRun(trainingRunId, ctx);
    if (found === null) return null;
    const row = await ctx.Provider.GetEntityObject<MJMLModelPublishRecordEntity>('MJ: ML Model Publish Records', ctx.ContextUser);
    if (!(await row.Load(found.ID))) throw new Error(`Loading publish record ${found.ID} of training run ${trainingRunId} failed`);
    return row;
  }

  /** Two gate decisions are the same decision: the same outcome, branch, shipped candidate, role and note. */
  private static sameDecision(a: GateDecision, b: GateDecision): boolean {
    return a.outcome === b.outcome && a.branch === b.branch && a.shipped === b.shipped && a.shippedRole === b.shippedRole && a.note === b.note;
  }

  /** A stored holdout metric under the first of `keys` (in `keys` order, case-insensitive) the model has; null when it has none. */
  private static holdoutMetric(m: CandidateModel, keys: readonly string[]): number | null {
    const entries = Object.entries(m.HoldoutMetrics);
    for (const key of keys) {
      const hit = entries.find(([k]) => k.trim().toLowerCase() === key);
      if (hit !== undefined) return hit[1];
    }
    return null;
  }

  /**
   * The rows the At-Risk list builds for a model's scored details under the outcome-config rule: the gate's W1 model is
   * read without its `MJ: ML Output Bindings` rows (`null` binding), which is the rule a model with no row renders by.
   */
  private static resourceRows(details: RunDetailLike[], model: OutcomeModelLike): AtRiskRow[] {
    return AtRiskRules.ParseAtRiskRows(details, AtRiskRules.BuildAtRiskOptions(model, null));
  }
}
