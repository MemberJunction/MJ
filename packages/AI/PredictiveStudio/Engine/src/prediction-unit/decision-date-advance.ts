/**
 * @module prediction-unit/decision-date-advance
 *
 * A fixed decision date with `advance: 'each-run'` (a migrated pipeline that had no as-of) moves to each run's UTC
 * day: before the run, the engine saves the next unit version with that day and the censoring cutoff moved by the
 * unit's label window, and points the pipeline at it. The model then references the exact version it was trained under.
 */
import type { UserInfo } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity, MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { PredictionUnit, UtcDay, type Actor, type PredictionUnitSpec, type UnitDraft } from '@memberjunction/predictive-studio-core';
import type { IAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import type { IEntityFactory } from '../training/types';
import { RunViewPredictionUnitStore, type IPredictionUnitStore } from './unit-store';
import { PredictionUnitVersioning } from './unit-versioning';

/** The author recorded on every unit version a decision-date advance saves. */
export const DECISION_DATE_ADVANCE_ACTOR: Actor = { kind: 'system', component: 'decision-date-advance' };

/** What advancing a pipeline's unit needs: the unit store, the run's day, the metadata and the entity factory. */
export interface DecisionDateAdvanceDeps {
  readonly Store: IPredictionUnitStore;
  /** The run's UTC day, `yyyy-mm-dd`. */
  readonly RunDay: string;
  readonly Metadata: IAssemblyMetadata;
  readonly EntityFactory: IEntityFactory;
  readonly ContextUser?: UserInfo;
}

/** Advancing fixed decision dates. */
export class DecisionDateAdvance {
  /**
   * Whether the unit's decision date is fixed and advances to each run's UTC day. Training saves the advanced version
   * before it reads; scoring reads such a unit's rows as of the scoring run's own day (the stored date is the day the
   * model was trained).
   */
  public static AdvancesEachRun(unit: PredictionUnitSpec): boolean {
    return unit.rows.kind === 'grain' && unit.rows.decisionDate.kind === 'fixed' && unit.rows.decisionDate.advance === 'each-run';
  }

  /** Pure: the changes that move an advancing fixed decision date to `runDay`; null when the rule does not advance or is already there. */
  public static DecisionDateAdvanceChanges(unit: PredictionUnitSpec, runDay: string): Partial<UnitDraft> | null {
    if (unit.rows.kind !== 'grain' || !DecisionDateAdvance.AdvancesEachRun(unit)) return null;
    const rule = unit.rows.decisionDate;
    if (rule.kind !== 'fixed' || rule.date === runDay) return null;
    const day = UtcDay.ToUtcDay(runDay);
    if (day === null || !UtcDay.IsIsoDay(runDay)) throw new Error(`run day ${runDay} is not yyyy-mm-dd`);
    return {
      UnitRows: { ...unit.rows, decisionDate: { kind: 'fixed', date: runDay, advance: 'each-run' } },
      Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: UtcDay.UtcDayIso(UtcDay.AddUtcDays(day, unit.label.windowDays + unit.label.gapDays)) } },
    };
  }

  /**
   * Advances the pipeline's bound unit when due and returns the unit ID to train under (null when the pipeline has
   * none). Only the newest version of a lineage advances: a pipeline bound to an older version keeps it (that binding
   * is deliberate). A missing or unparsable unit is left to the engine's own refusal. Everything after the new version
   * is saved (parsing it, applying it to the pipeline, saving the pipeline) is one step: when any part fails, by a
   * refusal or a throw, the new version is deleted and the pipeline's columns are put back, so nothing is orphaned.
   */
  public static async AdvanceFixedDecisionDate(pipeline: MJMLTrainingPipelineEntity, deps: DecisionDateAdvanceDeps): Promise<string | null> {
    const unitId = pipeline.PredictionUnitID;
    if (unitId === null) return null;
    const row = await deps.Store.Load(unitId);
    const parsed = row === null ? null : PredictionUnit.ParsePredictionUnitRow(row);
    if (row === null || parsed === null || parsed.Ok === false) return unitId;
    const changes = DecisionDateAdvance.DecisionDateAdvanceChanges(parsed.Value, deps.RunDay);
    if (changes === null) return unitId;
    const latest = await deps.Store.LatestVersion(row.LineageRootID);
    if (latest === null || !UUIDsEqual(latest.ID, row.ID)) return unitId;
    const next = await PredictionUnitVersioning.CreateNextPredictionUnitVersion(row, changes, DECISION_DATE_ADVANCE_ACTOR, deps.EntityFactory, deps.ContextUser);
    const prior = { PredictionUnitID: pipeline.PredictionUnitID, TargetEntityID: pipeline.TargetEntityID, TargetVariable: pipeline.TargetVariable, ProblemType: pipeline.ProblemType };
    const why = await DecisionDateAdvance.bindPipeline(pipeline, next, deps.Metadata);
    if (why === null) return next.ID;
    Object.assign(pipeline, prior);
    if (await next.Delete()) throw new Error(why);
    throw new Error(`${why}; deleting the unbound unit version ${next.ID} also failed: ${next.LatestResult?.CompleteMessage || 'delete failed'}`);
  }

  /** Points the pipeline at the new version and saves it: null when bound, else why not (a throw is reported, not raised). */
  private static async bindPipeline(pipeline: MJMLTrainingPipelineEntity, next: MJPredictionUnitEntity, metadata: IAssemblyMetadata): Promise<string | null> {
    try {
      const nextSpec = PredictionUnit.ParsePredictionUnitRow(next);
      if (nextSpec.Ok === false) return `Advanced unit ${next.ID} does not parse: ${nextSpec.Errors.join('; ')}`;
      RunViewPredictionUnitStore.ApplyUnitToPipeline(pipeline, next.ID, nextSpec.Value, metadata);
      if (await pipeline.Save()) return null;
      return `Binding pipeline ${pipeline.ID} to unit ${next.ID} failed: ${pipeline.LatestResult?.CompleteMessage || 'save failed'}`;
    } catch (e) {
      return `Binding pipeline ${pipeline.ID} to unit ${next.ID} failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
