import { readdirSync } from 'node:fs';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import {
  AtRiskRules,
  EvaluationLineage,
  type AtRiskRow,
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

/** How the gate bodies read containment behaviour. Static members only: the class is the one seam. */
export class ContainmentProbe {
  /** Refused before training: the operation returned the expected refusal code and produced no model. */
  public static WasRefusedBeforeTraining(a: TrainAttempt, expected: PredictiveStudioRefusalCode): boolean {
    return !a.Ok && a.RefusalCode === expected && a.ModelID === null;
  }

  /** Scoring refused: the expected refusal code and nothing scored. */
  public static WasScoringRefused(a: ScoreAttempt, expected: PredictiveStudioRefusalCode): boolean {
    return !a.Ok && a.RefusalCode === expected && a.Scored === 0;
  }

  /**
   * Whether a model of an agent run reached Published (G0.2, G0.3). The runs have automated publishing on and no person
   * in them; the amended threshold counts Published whoever or whatever promoted the model.
   */
  public static ReachedPublishedUnattended(m: CandidateModel): boolean {
    return m.Status === 'Published';
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

  /** A stored holdout metric under the first of `keys` (in `keys` order, case-insensitive) the model has; null when it has none. */
  private static holdoutMetric(m: CandidateModel, keys: readonly string[]): number | null {
    const entries = Object.entries(m.HoldoutMetrics);
    for (const key of keys) {
      const hit = entries.find(([k]) => k.trim().toLowerCase() === key);
      if (hit !== undefined) return hit[1];
    }
    return null;
  }

  /** The rows the Predictions resource builds for a model's scored details (same options as `loadAtRisk`). */
  private static resourceRows(details: RunDetailLike[], model: OutcomeModelLike): AtRiskRow[] {
    return AtRiskRules.ParseAtRiskRows(details, AtRiskRules.BuildAtRiskOptions(model));
  }
}
