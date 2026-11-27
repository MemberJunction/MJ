/**
 * @module actions/profile-prediction-target.action
 *
 * **Profile Prediction Target** — the agent's read-only profiling tool (PR 5, A4; §5.1.5, DD-4, D5-32). It reads a draft
 * Prediction Unit's development rows through `AgentReadScope` (never a locked-holdout row, `HoldoutRowsRead = 0`) and:
 *
 * 1. counts resolved rows and rows per class, and applies the fixed small-data refusal (`ProfileVerdict.SmallData`)
 *    before any compute;
 * 2. otherwise sends the development rows' candidate columns and labels to the sidecar's read-only `POST /profile`
 *    (`MLSidecar.Profile`: per field the single-feature inner-CV log-loss improvement over the dummy, and the GLM on
 *    every field against the dummy on the same folds) and applies the no-usable-signal verdict
 *    (`ProfileVerdict.NoSignal`) to the GLM's improvement;
 * 3. marks leak suspects: a field whose improvement alone recovers at least {@link ProfilePredictionTargetAction.LEAK_SHARE}
 *    of the dummy's log-loss (implausibly strong for one field), or a near-unique identifier.
 *
 * It writes no row: no snapshot, training run or protocol (none exists before approval, D5-25). The output is the
 * `ProfileResult` (with the compute cost the sidecar reported, DD-4), the verdict as `Refusal` when there is one, and
 * `HoldoutRowsRead` (always 0). The control path records the result on the session's `profile` decision row.
 */
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import type { ProfileCell, ProfileFieldResult, ProfileRequest, ProfileResponse, ProfileResult, UnitDraft } from '@memberjunction/predictive-studio-core';

import { AgentReadScope, type AgentRowSet } from '../agent/agent-read-scope';
import { ProfileVerdict } from '../agent/profile-verdict';
import { ProtocolDefaults } from '../protocol/protocol-defaults';
import { MLSidecarProvider } from '../sidecar-provider';
import type { UnitRow } from '../prediction-unit/unit-row-reader';
import type { SourceRow } from '../feature-assembly/data-access';
import { BasePredictiveStudioAction } from './base-predictive-studio.action';
import { DraftEvaluationProtocolAction } from './draft-evaluation-protocol.action';
export { PROFILE_PREDICTION_TARGET_DRIVER_CLASS } from './driver-classes';
import { PROFILE_PREDICTION_TARGET_DRIVER_CLASS } from './driver-classes';

/** What profiling reads: the draft unit's development rows and the sidecar's `/profile`. */
export interface ProfileTargetDeps {
  /** The draft unit's development rows (production: `AgentReadScope.DevelopmentRows` as the run's user). */
  readonly ReadDevelopmentRows: (unit: UnitDraft) => Promise<AgentRowSet>;
  /** The sidecar's `POST /profile` (production: the process's shared `MLSidecar`). */
  readonly Profile: (req: ProfileRequest) => Promise<ProfileResponse>;
}

/** A profile, or why there is none (the rows could not be read); never a row written. */
export type ProfileOutcome =
  | { readonly Kind: 'profiled'; readonly Result: ProfileResult }
  | { readonly Kind: 'refused'; readonly Reason: string; readonly HoldoutRowsRead: 0 };

/** Read-only profiling of a draft unit's development rows. */
@RegisterClass(BaseAction, PROFILE_PREDICTION_TARGET_DRIVER_CLASS)
export class ProfilePredictionTargetAction extends BasePredictiveStudioAction {
  /** Stratified folds the profile is scored on (the trainer's inner-validation default). */
  public static readonly FOLDS = 5;
  /** Share of the dummy's log-loss a single field's improvement must recover to be a leak suspect (one field explaining half the outcome's uncertainty is implausible). */
  public static readonly LEAK_SHARE = 0.5;

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const unit = DraftEvaluationProtocolAction.UnitDraftOf(this.getJsonObjectParam(params, 'UnitDraft'));
      if (unit === null) return this.fail('MISSING_UNIT', 'UnitDraft (the validated Prediction Unit draft) is required.');
      const features = this.getStringArrayParam(params, 'Features');
      const outcome = await ProfilePredictionTargetAction.Profile(unit, features, this.BuildDeps(params));
      return this.writeOutcome(params, outcome);
    } catch (e) {
      LogError(e);
      return this.fail('PROFILE_FAILED', e instanceof Error ? e.message : String(e));
    }
  }

  /** The Action's deps from the run params (the request's provider and user); overridable so tests inject fakes. */
  protected BuildDeps(params: RunActionParams): ProfileTargetDeps {
    const provider = params.Provider || Metadata.Provider; // global-provider-ok: RunActionParams.Provider is optional; ActionEngine contract falls back to the global provider (ActionEngine-Base.ts:413-419)
    return {
      ReadDevelopmentRows: (unit) => AgentReadScope.DevelopmentRows(unit, provider, params.ContextUser),
      Profile: async (req) => {
        const sidecar = MLSidecarProvider.Instance.GetSidecar();
        await sidecar.Start();
        return sidecar.Profile(req);
      },
    };
  }

  /** The profile of `unit`'s development rows over `features`: the counts first, then (with enough rows) the sidecar. */
  public static async Profile(unit: UnitDraft, features: readonly string[], deps: ProfileTargetDeps): Promise<ProfileOutcome> {
    const read = await deps.ReadDevelopmentRows(unit);
    if (read.Status !== 'read') return { Kind: 'refused', Reason: read.Reason, HoldoutRowsRead: 0 };
    const counts = ProfilePredictionTargetAction.ClassCounts(read.Rows);
    const minority = Math.min(...Object.values(counts), read.Rows.length);
    const small = ProfileVerdict.SmallData(read.Rows.length, Object.keys(counts).length < 2 ? 0 : minority);
    const base = { resolvedRows: read.Rows.length, minorityRows: Object.keys(counts).length < 2 ? 0 : minority, classCounts: counts, holdoutRowsRead: 0 as const, holdoutRowsExcluded: read.HoldoutRowsExcluded };
    if (small !== null) return { Kind: 'profiled', Result: { ...base, fields: [], leakSuspects: [], glmVsDummy: null, computeSeconds: 0, verdict: small } };
    const answer = await deps.Profile(ProfilePredictionTargetAction.Request(read.Rows, features));
    const fields = ProfilePredictionTargetAction.FieldResults(answer, ProfilePredictionTargetAction.DummyLogLoss(counts, read.Rows.length));
    return {
      Kind: 'profiled',
      Result: { ...base, fields, leakSuspects: fields.filter((f) => f.leakSuspect).map((f) => f.name), glmVsDummy: answer.glmVsDummy, computeSeconds: answer.computeSeconds, verdict: ProfileVerdict.NoSignal(answer.glmVsDummy) },
    };
  }

  /** The `/profile` request: each feature's development-row values, aligned with the rows' labels. */
  public static Request(rows: readonly UnitRow[], features: readonly string[]): ProfileRequest {
    const columns = Object.fromEntries(features.map((name) => [name, rows.map((r) => ProfilePredictionTargetAction.Cell(r.Source, name))]));
    return { features: columns, labels: rows.map((r) => r.Label), folds: ProfilePredictionTargetAction.FOLDS, seed: ProtocolDefaults.DEFAULT_SEED };
  }

  /** A source value as a profile cell: a number or text as it is, a flag as 1/0, a date as its ISO text, missing as null. */
  public static Cell(row: SourceRow, name: string): ProfileCell {
    const value = row[name];
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return value;
  }

  /** Development rows per class (the labels' canonical text). */
  public static ClassCounts(rows: readonly UnitRow[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[String(r.Label)] = (counts[String(r.Label)] || 0) + 1;
    return counts;
  }

  /** The dummy's (class prior's) mean log-loss on the rows: what a field's improvement is a share of. */
  public static DummyLogLoss(counts: Readonly<Record<string, number>>, n: number): number {
    return n === 0 ? 0 : -Object.values(counts).reduce((s, c) => s + (c / n) * Math.log(c / n), 0);
  }

  /** The sidecar's field associations with each field's leak-suspect mark. */
  public static FieldResults(answer: ProfileResponse, dummyLogLoss: number): ProfileFieldResult[] {
    return answer.fields.map((f) => ({
      name: f.name, improvement: f.improvement, nearUnique: f.nearUnique,
      leakSuspect: f.nearUnique || (dummyLogLoss > 0 && f.improvement.interval.lower >= ProfilePredictionTargetAction.LEAK_SHARE * dummyLogLoss),
    }));
  }

  /** The outcome as output params: the profile (and its verdict), or the refusal, with the read and compute counts. */
  private writeOutcome(params: RunActionParams, outcome: ProfileOutcome): ActionResultSimple {
    this.addOutputParam(params, 'HoldoutRowsRead', outcome.Kind === 'profiled' ? outcome.Result.holdoutRowsRead : outcome.HoldoutRowsRead);
    if (outcome.Kind === 'refused') return this.fail('PROFILE_REFUSED', `No profile: ${outcome.Reason}`);
    const r = outcome.Result;
    this.addOutputParam(params, 'ProfileResult', JSON.stringify(r));
    this.addOutputParam(params, 'ComputeSeconds', r.computeSeconds);
    if (r.verdict) this.addOutputParam(params, 'Refusal', JSON.stringify(r.verdict));
    const verdict = r.verdict ? ` Verdict: ${r.verdict.kind}.` : '';
    return this.ok(params, `Profiled ${r.resolvedRows} development rows (${r.minorityRows} in the smaller class; ${r.holdoutRowsExcluded} holdout rows left unread).${verdict}`);
  }
}
