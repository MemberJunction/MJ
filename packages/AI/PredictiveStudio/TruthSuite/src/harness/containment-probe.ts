import { readdirSync } from 'node:fs';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { AtRiskRules, EvaluationLineage, type AtRiskRow, type DriverBadge, type RunDetailLike, type TrustVerdict, type ValidationStrategy } from '@memberjunction/predictive-studio-core';
import type { TrainAttempt, CandidateModel, ScoreAttempt, TruthHarness } from './types';

/** The three gate outcomes (reference contracts.ts `GateOutcome`; named apart from the suite's own result outcomes). */
export type StoredGateDecision = 'model' | 'keep-simple-baseline' | 'no-signal';

/** A withheld verdict as a model stores it. `Grade` is derived from the verdict type, never widened to `string`. */
export interface StoredWithheldVerdict {
  CanAct: boolean;
  Grade: TrustVerdict['grade'];
  Reason: string;
}

/** How the gate bodies read containment behaviour. Static members only: the class is the one seam. */
export class ContainmentProbe {
  /** A training request counts as "refused before training" when the operation failed and produced no model. */
  public static WasRefusedBeforeTraining(a: TrainAttempt): boolean {
    return !a.Ok && a.ModelID === null;
  }

  /** A scoring request counts as refused when the operation failed (ErrorMessage set) and nothing was scored. */
  public static WasScoringRefused(a: ScoreAttempt): boolean {
    return !a.Ok && a.ErrorMessage !== null && a.Scored === 0;
  }

  /**
   * Whether a model of an agent run reached Published (G0.2, G0.3). The runs have automated publishing on and no person
   * in them; the amended threshold counts Published whoever or whatever promoted the model.
   */
  public static ReachedPublishedUnattended(m: CandidateModel): boolean {
    return m.Status === 'Published';
  }

  /**
   * The gate outcome stored for the model's training run, or null when nothing is stored (G0.2). Nothing stores one
   * yet: the training-side gate stores the outcome and the publish-side reverification replaces this body to read it.
   */
  public static ReadStoredGateDecision(_m: CandidateModel): StoredGateDecision | null {
    return null;
  }

  /**
   * Whether publish reverification re-derives the model's stored outcome (G0.2). It does not exist yet; the change that
   * adds it replaces this body with a call to it. Until then false, so a run that reaches Published is never consistent.
   */
  public static ReverifiesStoredDecision(_m: CandidateModel): boolean {
    return false;
  }

  /** The withheld verdict a model stores: `Lineage.evaluation.WithheldReason` with the model's derived grade. */
  public static ReadStoredWithheldVerdict(m: CandidateModel): StoredWithheldVerdict | null {
    const evaluation = EvaluationLineage.Read(m.LineageJSON);
    if (!evaluation?.WithheldReason) {
      return null;
    }
    return { CanAct: m.Trust.canAct, Grade: m.Trust.grade, Reason: evaluation.WithheldReason };
  }

  /** Declare the pipeline's time index as `ValidationStrategy.TimeIndexColumn`. The caller saves the pipeline. */
  public static ApplyTimeIndexDeclaration(pipeline: MJMLTrainingPipelineEntity, column: string): boolean {
    const current: ValidationStrategy =
      (pipeline.ValidationStrategy ? SafeJSONParse<ValidationStrategy>(pipeline.ValidationStrategy) : null) || {
        Strategy: 'train_test_split',
        TestSize: 0.2,
        LockedHoldoutFraction: 0.1,
      };
    const next: ValidationStrategy = { ...current, TimeIndexColumn: column };
    pipeline.ValidationStrategy = JSON.stringify(next);
    return true;
  }

  /** "Graded above Poor or cleared to act". */
  public static GradedAbovePoorOrActionable(m: CandidateModel): boolean {
    return m.Trust.grade !== 'Poor' || m.Trust.canAct;
  }

  /** The story-generation prompt S9.3 scans: the Model Development Agent's templates (its "4. Report" step writes stories). */
  public static StoryPromptFiles(mjRoot: string): string[] {
    const dir = path.join(mjRoot, 'metadata/prompts/templates/model-development-agent');
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(dir, f));
  }

  /** One generated story about a model: the agent's report turn (the harness's `GenerateStory`, live model). */
  public static async GenerateModelStory(h: TruthHarness, modelId: string): Promise<string | null> {
    return h.GenerateStory(modelId);
  }

  /** The badge each row shows for its top per-record driver, for rows whose top driver has `label`. */
  public static TopDriverBadges(details: RunDetailLike[], label: string, targetVariable: string): DriverBadge[] {
    const badges: DriverBadge[] = [];
    for (const row of ContainmentProbe.resourceRows(details, targetVariable)) {
      const top = row.drivers?.[0];
      if (top && top.label === label) badges.push(AtRiskRules.DriverBadgeText(top.up));
    }
    return badges;
  }

  /** The record ids "Send to a list" puts on the At-Risk list. */
  public static AtRiskListRecordIDs(details: RunDetailLike[], targetVariable: string): string[] {
    return AtRiskRules.SelectAtRiskListMembers(ContainmentProbe.resourceRows(details, targetVariable), 200).map((r) => r.recordId);
  }

  /** The rows the Predictions resource builds for a model's scored details (same options as `loadAtRisk`). */
  private static resourceRows(details: RunDetailLike[], targetVariable: string): AtRiskRow[] {
    return AtRiskRules.ParseAtRiskRows(details, AtRiskRules.BuildAtRiskOptions(details.map((d) => d.ResultPayload), targetVariable));
  }
}
