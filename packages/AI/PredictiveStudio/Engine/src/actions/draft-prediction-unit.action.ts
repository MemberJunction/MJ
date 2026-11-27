/**
 * @module actions/draft-prediction-unit.action
 *
 * **Draft Prediction Unit** — the agent's draft-only unit tool (PR 5, A3; D5-25, §5.1.2). It turns the plan's target
 * and the Goal Analyst's unit proposal (`TargetDefinition.Unit`) into a validated `UnitDraft` and writes no row: every
 * name is resolved against the passed provider's metadata (the grain entity, the label column, the decision-date
 * column, which must be a date, the group key and the filter fields), a unit with a label window must name its
 * censoring rule, a classification task takes its class order from the development rows only
 * (`AgentReadScope.DevelopmentRows`), and the draft passes PR 3's unit parser. The output is the draft or a typed
 * `DraftRefusal`, with `HoldoutRowsRead` (always 0) and the development-row preview counts. The control path stores
 * the draft in the plan payload; the Pipeline Builder saves unit version 1 from it after approval.
 */
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata, type EntityFieldInfo, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import {
  LegacyPipelines, PredictionUnit, ProtocolRows, UtcDay,
  type CensoringRule, type DecisionDateRule, type DraftRefusal, type ModelingPlanSpec, type TaskType, type UnitDraft, type UnitProposal, type UnresolvedReference,
} from '@memberjunction/predictive-studio-core';

import { AgentReadScope, type AgentRowSet } from '../agent/agent-read-scope';
import { PredictiveStudioPipelineBuilder } from '../agent/pipeline-builder';
import { BasePredictiveStudioAction } from './base-predictive-studio.action';
export { DRAFT_PREDICTION_UNIT_DRIVER_CLASS } from './driver-classes';
import { DRAFT_PREDICTION_UNIT_DRIVER_CLASS } from './driver-classes';

/** The plan's target as the Action reads it (the unit proposal is `Unit`). */
export type DraftUnitTarget = ModelingPlanSpec['TargetDefinition'];

/** What drafting a unit reads: the provider's entity metadata and the draft unit's development rows. */
export interface DraftUnitDeps {
  readonly Provider: Pick<IMetadataProvider, 'EntityByName' | 'Entities'>;
  /** The draft unit's development rows (production: `AgentReadScope.DevelopmentRows` as the run's user). */
  readonly ReadDevelopmentRows: (unit: UnitDraft) => Promise<AgentRowSet>;
  /** The day a fixed decision date is drafted on; default today (UTC). */
  readonly Today?: Date;
}

/** A drafted unit, or why there is none; never a row. */
export type UnitDraftOutcome =
  | { readonly Kind: 'draft'; readonly Draft: UnitDraft; readonly DevelopmentRows: number; readonly HoldoutRowsExcluded: number; readonly HoldoutRowsRead: 0 }
  | { readonly Kind: 'refused'; readonly Refusal: DraftRefusal; readonly HoldoutRowsRead: 0 };

/** The proposal's names, resolved. */
interface ResolvedUnitNames {
  readonly Grain: EntityInfo;
  readonly LabelColumn: string;
  readonly DecisionColumn: string | null;
}

/** The defaults a proposal leaves to the Action. */
const DEFAULT_LABEL_WINDOW_DAYS = 1; // the legacy mapping's window: the outcome is the row's stored value
/** The refusal text of {@link DraftPredictionUnitAction.WindowWithoutDecisionDate}, worded as the fix. */
const WINDOW_NEEDS_DATE = 'LabelWindowDays is set but DecisionDateColumn is not: with no decision-date column every row is decided today, so no outcome window has closed and every row is censored. Set TargetDefinition.Unit.DecisionDateColumn to a date column of the grain entity (when each row\'s prediction is made), or omit LabelWindowDays and Censoring to predict the stored outcome column as it stands.';
const DEFAULT_DECISION: UnitDraft['DecisionSpec'] = { action: 'review', actorRole: 'analyst', capacityPerPeriod: null, period: 'month' };

/** Draft-only Prediction Unit tool. */
@RegisterClass(BaseAction, DRAFT_PREDICTION_UNIT_DRIVER_CLASS)
export class DraftPredictionUnitAction extends BasePredictiveStudioAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const target = this.getJsonObjectParam(params, 'TargetDefinition');
      if (!target || !DraftPredictionUnitAction.IsTarget(target)) return this.fail('MISSING_TARGET', 'TargetDefinition (the plan\'s target, with its Unit proposal) is required.');
      const outcome = await DraftPredictionUnitAction.Draft(target, this.BuildDeps(params));
      return this.writeOutcome(params, outcome);
    } catch (e) {
      LogError(e);
      return this.fail('DRAFT_FAILED', e instanceof Error ? e.message : String(e));
    }
  }

  /** The Action's deps from the run params (the request's provider and user); overridable so tests inject fakes. */
  protected BuildDeps(params: RunActionParams): DraftUnitDeps {
    const provider = params.Provider || Metadata.Provider; // global-provider-ok: RunActionParams.Provider is optional; ActionEngine contract falls back to the global provider (ActionEngine-Base.ts:413-419)
    return { Provider: provider, ReadDevelopmentRows: (unit) => AgentReadScope.DevelopmentRows(unit, provider, params.ContextUser) };
  }

  /**
   * The validated draft of `target`'s unit, or the refusal: names first, then the censoring rule, then the task, then
   * PR 3's parser and the development-row read.
   */
  public static async Draft(target: DraftUnitTarget, deps: DraftUnitDeps): Promise<UnitDraftOutcome> {
    const proposal: UnitProposal = target.Unit || {};
    const names = DraftPredictionUnitAction.ResolveNames(target, proposal, deps.Provider);
    if ('references' in names) return DraftPredictionUnitAction.refused({ kind: 'unresolved-reference', references: names.references });
    if (DraftPredictionUnitAction.NeedsCensoring(proposal)) return DraftPredictionUnitAction.refused({ kind: 'censoring-required' });
    if (DraftPredictionUnitAction.WindowWithoutDecisionDate(proposal)) return DraftPredictionUnitAction.refused({ kind: 'draft-invalid', problems: [WINDOW_NEEDS_DATE] });
    const today = UtcDay.UtcDayIso(deps.Today || new Date());
    const provisional = DraftPredictionUnitAction.BuildDraft(target, proposal, names, { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, today);
    const problems = DraftPredictionUnitAction.ParseProblems(provisional);
    if (problems.length > 0) return DraftPredictionUnitAction.refused({ kind: 'draft-invalid', problems });
    const task = proposal.TaskType ? { Ok: true as const, Task: proposal.TaskType } : await DraftPredictionUnitAction.TaskFromDevelopmentRows(target, provisional, deps);
    if (task.Ok === false) return DraftPredictionUnitAction.refused({ kind: 'draft-invalid', problems: [task.Problem] });
    const draft: UnitDraft = { ...provisional, TaskType: task.Task };
    const finalProblems = DraftPredictionUnitAction.ParseProblems(draft);
    if (finalProblems.length > 0) return DraftPredictionUnitAction.refused({ kind: 'draft-invalid', problems: finalProblems });
    const preview = await deps.ReadDevelopmentRows(draft);
    if (preview.Status !== 'read') return DraftPredictionUnitAction.refused({ kind: 'draft-invalid', problems: [preview.Reason] });
    return { Kind: 'draft', Draft: draft, DevelopmentRows: preview.Rows.length, HoldoutRowsExcluded: preview.HoldoutRowsExcluded, HoldoutRowsRead: 0 };
  }

  /**
   * A label window with no decision-date column: every row would be decided today, so no outcome window has closed and
   * every row is censored. The proposal must date its rows, or describe a snapshot of the stored outcome (no window).
   */
  public static WindowWithoutDecisionDate(proposal: UnitProposal): boolean {
    return (proposal.LabelWindowDays || 0) > DEFAULT_LABEL_WINDOW_DAYS && !proposal.DecisionDateColumn;
  }

  /** A label window the proposal sets explicitly needs an explicit censoring rule. */
  public static NeedsCensoring(proposal: UnitProposal): boolean {
    return (proposal.LabelWindowDays || 0) > 0 && !proposal.Censoring;
  }

  /**
   * Every name the proposal uses, resolved on the provider: the grain entity, the label column, the decision-date
   * column (a date or datetime field), the group key and the filter fields; the unresolved ones otherwise.
   */
  public static ResolveNames(
    target: DraftUnitTarget, proposal: UnitProposal, provider: DraftUnitDeps['Provider'],
  ): ResolvedUnitNames | { readonly references: readonly UnresolvedReference[] } {
    const refs: UnresolvedReference[] = [];
    const grainName = proposal.GrainEntity || target.EntityName;
    const grain = PredictiveStudioPipelineBuilder.ResolveEntity(grainName, provider) || null;
    if (!grain) refs.push({ path: proposal.GrainEntity ? 'TargetDefinition.Unit.GrainEntity' : 'TargetDefinition.EntityName', name: grainName, kind: 'entity' });
    const label = DraftPredictionUnitAction.field(grain, proposal.LabelColumn || target.TargetVariable);
    if (!label) refs.push({ path: proposal.LabelColumn ? 'TargetDefinition.Unit.LabelColumn' : 'TargetDefinition.TargetVariable', name: proposal.LabelColumn || target.TargetVariable, kind: 'field' });
    const dateName = proposal.DecisionDateColumn || null;
    const date = dateName === null ? null : DraftPredictionUnitAction.field(grain, dateName);
    if (dateName !== null && (!date || date.TSType !== 'Date')) refs.push({ path: 'TargetDefinition.Unit.DecisionDateColumn', name: dateName, kind: 'field' });
    if (proposal.GroupKey && !DraftPredictionUnitAction.field(grain, proposal.GroupKey)) refs.push({ path: 'TargetDefinition.Unit.GroupKey', name: proposal.GroupKey, kind: 'field' });
    (proposal.Filter || []).forEach((f, i) => {
      if (!DraftPredictionUnitAction.field(grain, f.field)) refs.push({ path: `TargetDefinition.Unit.Filter[${i}].field`, name: f.field, kind: 'field' });
    });
    if (refs.length > 0 || !grain || !label) return { references: refs };
    return { Grain: grain, LabelColumn: label.Name, DecisionColumn: date ? date.Name : null };
  }

  /** The draft from the resolved names, the proposal's choices and the defaults, with `task` as its task. */
  public static BuildDraft(target: DraftUnitTarget, proposal: UnitProposal, names: ResolvedUnitNames, task: TaskType, today: string): UnitDraft {
    const decisionDate = DraftPredictionUnitAction.decisionDate(names.DecisionColumn, proposal.DecisionDateOffsetDays || 0, today);
    return {
      Name: `${names.Grain.Name} — ${target.TargetVariable} unit`,
      Description: `Drafted by the Model Development Agent from the plan's target (${target.EntityName}.${target.TargetVariable}).`,
      UnitRows: { kind: 'grain', grainEntity: names.Grain.Name, decisionDate, filter: proposal.Filter || [] },
      LabelRule: { kind: 'column', column: names.LabelColumn },
      LabelWindowDays: proposal.LabelWindowDays ?? DEFAULT_LABEL_WINDOW_DAYS, // ?? : 0 is a real window (an outcome known at the decision)
      LabelGapDays: proposal.LabelGapDays || 0,
      TaskType: task,
      Censoring: proposal.Censoring || DraftPredictionUnitAction.defaultCensoring(names.DecisionColumn, today),
      ChangeHistoryPolicy: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' },
      GroupKey: proposal.GroupKey || null,
      TemporalSpec: null,
      DecisionSpec: proposal.DecisionSpec || DEFAULT_DECISION,
      IncumbentHeuristic: { kind: 'none' },
    };
  }

  /**
   * The task of a draft with no declared task: continuous for a regression; for a classification, the classes the
   * development rows hold (two → binary with the adverse class the target's name declares, three or more → multiclass).
   */
  public static async TaskFromDevelopmentRows(target: DraftUnitTarget, provisional: UnitDraft, deps: DraftUnitDeps): Promise<{ readonly Ok: true; readonly Task: TaskType } | { readonly Ok: false; readonly Problem: string }> {
    if (target.ProblemType === 'regression') return { Ok: true, Task: { kind: 'continuous' } };
    const rows = await deps.ReadDevelopmentRows(provisional);
    if (rows.Status !== 'read') return { Ok: false, Problem: rows.Reason };
    const classes = [...new Set(rows.Rows.map((r) => String(r.Label).trim()).filter((l) => l.length > 0))].sort();
    const [first, second] = classes;
    if (classes.length < 2 || first === undefined || second === undefined) return { Ok: false, Problem: `the development rows hold ${classes.length} class of ${target.TargetVariable}; a classification needs two or more` };
    if (classes.length > 2) return { Ok: true, Task: { kind: 'multiclass', classOrder: classes, adverseIndices: [] } };
    const outcome = LegacyPipelines.LegacyOutcomeCandidates({ FeatureSteps: null, Hyperparameters: null, ModelLineage: null, TargetVariable: target.TargetVariable, ProblemType: target.ProblemType });
    const adverse = LegacyPipelines.LegacyAdverseClass([first, second], outcome);
    if (adverse.Kind === 'undetermined') return { Ok: false, Problem: `${adverse.Reason} Declare TargetDefinition.Unit.TaskType with its adverse class.` };
    return { Ok: true, Task: { kind: 'binary', classOrder: [first, second], adverseIndex: adverse.AdverseIndex } };
  }

  /** PR 3's unit parser's problems with a draft (empty when it parses). */
  public static ParseProblems(draft: UnitDraft): string[] {
    const parsed = PredictionUnit.ParsePredictionUnitRow({
      ...ProtocolRows.UnitDraftColumns(draft), ID: AgentReadScope.DRAFT_UNIT_ID, LineageRootID: AgentReadScope.DRAFT_UNIT_ID, Version: 1, LabelVersion: 1,
      AuthoredBy: JSON.stringify({ kind: 'system', component: 'agent-draft' }),
    });
    return parsed.Ok === false ? [...parsed.Errors] : [];
  }

  /** True for a JSON object shaped as the plan's target. */
  public static IsTarget(value: Record<string, unknown>): value is Record<string, unknown> & DraftUnitTarget {
    return typeof value['EntityName'] === 'string' && typeof value['TargetVariable'] === 'string' && (value['ProblemType'] === 'classification' || value['ProblemType'] === 'regression');
  }

  /** The decision date: the column (plus the offset), or one fixed day advancing each run. */
  private static decisionDate(column: string | null, offsetDays: number, today: string): DecisionDateRule {
    if (column === null) return { kind: 'fixed', date: today, advance: 'each-run' };
    return offsetDays === 0 ? { kind: 'column', column } : { kind: 'column-offset', column, offsetDays };
  }

  /** The censoring a proposal without a window gets (the legacy mapping's): now for a dated unit, the next day for a fixed one. */
  private static defaultCensoring(column: string | null, today: string): CensoringRule {
    if (column !== null) return { rule: 'exclude-unresolved', cutoff: { kind: 'now' } };
    const day = UtcDay.ToUtcDay(today);
    return { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: day === null ? today : UtcDay.UtcDayIso(UtcDay.AddUtcDays(day, 1)) } };
  }

  /** The field of `entity` named `name` (case-insensitive), or null. */
  private static field(entity: EntityInfo | null, name: string): EntityFieldInfo | null {
    const wanted = (name || '').trim().toLowerCase();
    return entity?.Fields.find((f) => f.Name.toLowerCase() === wanted) || null;
  }

  private static refused(refusal: DraftRefusal): UnitDraftOutcome {
    return { Kind: 'refused', Refusal: refusal, HoldoutRowsRead: 0 };
  }

  /** The outcome as output params: the draft or the refusal, with the read counts. */
  private writeOutcome(params: RunActionParams, outcome: UnitDraftOutcome): ActionResultSimple {
    this.addOutputParam(params, 'HoldoutRowsRead', outcome.HoldoutRowsRead);
    if (outcome.Kind === 'refused') {
      this.addOutputParam(params, 'Refusal', JSON.stringify(outcome.Refusal));
      return { Success: true, ResultCode: 'REFUSED', Message: `No unit drafted: ${JSON.stringify(outcome.Refusal)}`, Params: params.Params };
    }
    this.addOutputParam(params, 'UnitDraft', JSON.stringify(outcome.Draft));
    this.addOutputParam(params, 'DevelopmentRows', outcome.DevelopmentRows);
    this.addOutputParam(params, 'HoldoutRowsExcluded', outcome.HoldoutRowsExcluded);
    return this.ok(params, `Unit drafted on ${outcome.DevelopmentRows} development rows (${outcome.HoldoutRowsExcluded} holdout rows left unread).`);
  }
}
