/**
 * @module actions/schedule-model-scoring.action
 *
 * **Schedule Model Scoring** action — the thin Action boundary over the PS2-6
 * {@link createScheduledModelScoring} helper (plan PS2-6 / §12). It lets an agent /
 * workflow / UI bind a trained model to write its prediction into a target entity
 * column on a recurring schedule, conversationally: "build a model, write the
 * renewal probability back into the member record, and re-score it monthly."
 *
 * Per CLAUDE.md "Actions are boundaries": this action does NOT do any scheduling /
 * Record-Process-assembly logic. It validates + extracts its params (`ModelID`,
 * `TargetEntityName`, `OutputField`, `ScopeFilter`, `Cadence`, `PrimaryKeyField`,
 * `ValueKind`), delegates to the helper (which creates + saves the scheduled
 * `MJ: Record Processes` row, whose owned `MJ: Scheduled Jobs` row is auto-created
 * on save), then maps the new Record Process id + cron onto output params.
 *
 * The helper is invoked behind an overridable factory seam so unit tests substitute
 * a mock with no live DB.
 */

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';

import { BasePredictiveStudioAction } from './base-predictive-studio.action';
import {
  createScheduledModelScoring,
  type ScheduleModelScoringOptions,
  type ScoringCadence,
  type ScoringValueKind,
} from '../scheduling/scheduled-model-scoring';

/** The driver-class key this action registers under (matches the metadata row). */
export const SCHEDULE_MODEL_SCORING_DRIVER_CLASS = 'PredictiveStudioScheduleModelScoringAction';

/**
 * The scheduling seam this action depends on — "create + save a scheduled scoring
 * Record Process for these options, give me the saved row". The production
 * implementation is {@link createScheduledModelScoring}; tests inject a fake.
 */
export type ScheduleModelScoringFn = (opts: ScheduleModelScoringOptions) => Promise<MJRecordProcessEntity>;

/**
 * Binds a trained `MJ: ML Models` to a recurring write-back: scores the target
 * entity's rows on a cadence (default monthly) and writes the prediction into a
 * column. Outputs: `RecordProcessID` (string), `CronExpression` (string).
 */
@RegisterClass(BaseAction, SCHEDULE_MODEL_SCORING_DRIVER_CLASS)
export class PredictiveStudioScheduleModelScoringAction extends BasePredictiveStudioAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const modelId = this.getStringParam(params, 'ModelID');
      if (!modelId) {
        return this.fail('VALIDATION_ERROR', 'ModelID parameter is required');
      }
      const targetEntityName = this.getStringParam(params, 'TargetEntityName');
      if (!targetEntityName) {
        return this.fail('VALIDATION_ERROR', 'TargetEntityName parameter is required');
      }
      const outputField = this.getStringParam(params, 'OutputField');
      if (!outputField) {
        return this.fail('VALIDATION_ERROR', 'OutputField parameter is required');
      }
      const scopeFilter = this.getStringParam(params, 'ScopeFilter');
      if (!scopeFilter) {
        return this.fail('VALIDATION_ERROR', 'ScopeFilter parameter is required (the SQL predicate selecting rows to score)');
      }
      // Server-side: creating + saving the Record Process is user-scoped (audit + isolation).
      if (!params.ContextUser) {
        return this.fail('VALIDATION_ERROR', 'ContextUser is required to schedule model scoring (server-side data access is user-scoped)');
      }

      const rp = await this.schedule()({
        modelId,
        targetEntityName,
        outputField,
        scope: { filter: scopeFilter },
        cadence: this.parseCadence(params),
        primaryKeyField: this.getStringParam(params, 'PrimaryKeyField'),
        valueKind: this.parseValueKind(params),
        name: this.getStringParam(params, 'Name'),
        timezone: this.getStringParam(params, 'Timezone'),
        contextUser: params.ContextUser,
        provider: params.Provider,
      });

      return this.mapResult(params, rp);
    } catch (e) {
      LogError(e);
      return this.fail('SCHEDULE_FAILED', `Scheduling model scoring failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Map the saved Record Process onto output params + a human-readable message. */
  protected mapResult(params: RunActionParams, rp: MJRecordProcessEntity): ActionResultSimple {
    this.addOutputParam(params, 'RecordProcessID', rp.ID);
    this.addOutputParam(params, 'CronExpression', rp.CronExpression);
    return this.ok(
      params,
      `Scheduled scoring Record Process '${rp.Name}' (${rp.CronExpression}); it will score and write back on its cadence.`,
    );
  }

  // ----- param parsing -------------------------------------------------------

  /**
   * Parse the optional `Cadence` param. A named cadence (`Monthly` / `Weekly` /
   * `Daily`, case-insensitive) is passed through; any other non-empty value is
   * treated as a raw cron expression (`{ cron }`). Returns `undefined` (helper
   * defaults to Monthly) when omitted.
   */
  protected parseCadence(params: RunActionParams): ScoringCadence | undefined {
    const raw = this.getStringParam(params, 'Cadence');
    if (!raw) {
      return undefined;
    }
    const named = raw.trim().toLowerCase();
    if (named === 'monthly') return 'Monthly';
    if (named === 'weekly') return 'Weekly';
    if (named === 'daily') return 'Daily';
    return { cron: raw };
  }

  /** Parse the optional `ValueKind` param (`score` | `class`); `undefined` defaults to score. */
  protected parseValueKind(params: RunActionParams): ScoringValueKind | undefined {
    const raw = this.getStringParam(params, 'ValueKind');
    return raw?.trim().toLowerCase() === 'class' ? 'class' : undefined;
  }

  // ----- injectable scheduling seam (overridden in tests) --------------------

  /** The scheduling function. Overridable so tests inject a fake with no live DB. */
  protected schedule(): ScheduleModelScoringFn {
    return createScheduledModelScoring;
  }
}
