/**
 * @module monitoring/outcome-join
 *
 * `OutcomeJoin` — step 1 of a monitored period (C7 (1), §5.8.6, D4-67): the model's predictions as of the period
 * joined to their realised outcomes. A model whose pipeline has an `Active` scoring binding (or a withdrawn one that
 * scored the period) is joined on the binding's stored `Champion` `Model` rows whose `EffectiveAsOf` falls in the
 * period (the prediction as of the period, never a later one); a model with no such binding stores nothing, so it is
 * joined on a shadow `Predict` of the period's
 * unit rows, each assembled as of its own decision date (one `MJ: ML Scoring Runs` row, `Path = 'monitoring'`,
 * `DryRun = 1`, nothing written). Rows in the model's training snapshot (`InTraining`) are counted and excluded. The
 * outcomes come from PR 3's unit row reader at the unit's label rule; a record the reader has no label for joins with
 * `Outcome` null (G6.1 counts it).
 */
import { IndexByUUID } from '@memberjunction/global';

import type { JoinedRow, ModelPrediction, MonitoredUnit, MonitoringContext, MonitoringPeriod, MonitoredModel, MonitoredBinding } from './monitoring-seams';

/** How the period's predictions were found. */
export type JoinPath = 'binding' | 'shadow';

/** A period's join: the joined rows and what was counted on the way. */
export interface OutcomeJoinResult {
  readonly Path: JoinPath;
  /** The binding whose rows were joined; null on the shadow path. */
  readonly Binding: MonitoredBinding | null;
  /** The shadow run's `MJ: ML Scoring Runs` row; null on the binding path. */
  readonly ShadowScoringRunID: string | null;
  /** Predictions found for the period (training rows included). */
  readonly ScoredRows: number;
  /** Predictions left out because the record was in the model's training snapshot. */
  readonly ExcludedInTrainingRows: number;
  /** The joined rows: every prediction outside the training snapshot, with its outcome or null. */
  readonly Rows: readonly JoinedRow[];
}

/** The shadow run did not complete, so the period cannot be joined. */
export class OutcomeJoinFailedError extends Error {
  constructor(message: string, public readonly ScoringRunID: string | null) {
    super(message);
    this.name = 'OutcomeJoinFailedError';
  }
}

/** Joins a period's predictions to their realised outcomes. */
export class OutcomeJoin {
  /**
   * The joined rows of the model for the period (training rows excluded); see {@link Join}.
   *
   * @throws OutcomeJoinFailedError when the shadow run is refused or fails
   */
  public static async Rows(model: MonitoredModel, period: MonitoringPeriod, ctx: MonitoringContext): Promise<readonly JoinedRow[]> {
    const unit = await ctx.Seams.Store.LoadUnit(OutcomeJoin.UnitIdOf(model), ctx);
    return (await OutcomeJoin.Join(model, unit, period, ctx)).Rows;
  }

  /**
   * The period's join: the binding path when the model's pipeline has an `Active` binding, else the shadow path; then
   * the training rows counted and excluded, and each remaining prediction joined to its realised outcome by record key.
   *
   * @throws OutcomeJoinFailedError when the shadow run is refused or fails
   */
  public static async Join(model: MonitoredModel, unit: MonitoredUnit, period: MonitoringPeriod, ctx: MonitoringContext): Promise<OutcomeJoinResult> {
    const now = ctx.Seams.Clock.Now();
    const binding = await ctx.Seams.Store.BindingOf(model.PipelineID, model.ID, period, ctx);
    const found = binding !== null
      ? { Predictions: await ctx.Seams.Store.ModelRows(model.ID, binding.ID, 'Champion', period, ctx), ShadowScoringRunID: null }
      : await OutcomeJoin.shadow(model, unit, period, now, ctx);
    const kept = found.Predictions.filter((p) => !p.InTraining);
    const outcomes = IndexByUUID(await ctx.Seams.Store.Outcomes(unit, kept.map((p) => p.RecordID), now, ctx), (o) => o.RecordID);
    const rows = kept.map((p): JoinedRow => {
      const o = outcomes.Get(p.RecordID);
      return {
        RecordID: p.RecordID, EffectiveAsOf: p.EffectiveAsOf, DecisionDate: o === undefined ? p.EffectiveAsOf : o.DecisionDate, InTraining: false,
        ScoreFromPeriod: p.Score, Score: p.Score, Probabilities: p.Probabilities, Outcome: o === undefined ? null : o.Label,
        GroupKey: o === undefined ? p.RecordID.toLowerCase() : o.GroupKey,
      };
    });
    return {
      Path: binding !== null ? 'binding' : 'shadow', Binding: binding, ShadowScoringRunID: found.ShadowScoringRunID,
      ScoredRows: found.Predictions.length, ExcludedInTrainingRows: found.Predictions.length - kept.length, Rows: rows,
    };
  }

  /** The model's Prediction Unit ID. @throws when the model has none (it has no label window to join on) */
  public static UnitIdOf(model: MonitoredModel): string {
    if (!model.PredictionUnitID) throw new Error(`ML Model ${model.ID} has no Prediction Unit, so monitoring has no label window to join on`);
    return model.PredictionUnitID;
  }

  /** The shadow path: the period's unit rows scored by the model, dry run, each as of its own decision date. */
  private static async shadow(model: MonitoredModel, unit: MonitoredUnit, period: MonitoringPeriod, now: Date, ctx: MonitoringContext): Promise<{ readonly Predictions: readonly ModelPrediction[]; readonly ShadowScoringRunID: string | null }> {
    const rows = await ctx.Seams.Store.UnitRowsInPeriod(unit, period, now, ctx);
    if (rows.length === 0) return { Predictions: [], ShadowScoringRunID: null };
    const run = await ctx.Seams.Scorer.Shadow(model, unit, rows, null, ctx);
    if (run.Status !== 'completed') throw new OutcomeJoinFailedError(`the shadow scoring run ${run.ScoringRunID} of ML Model ${model.ID} ended ${run.Status}: ${run.Reason || 'no reason given'}`, run.ScoringRunID);
    return { Predictions: run.Predictions, ShadowScoringRunID: run.ScoringRunID };
  }
}
