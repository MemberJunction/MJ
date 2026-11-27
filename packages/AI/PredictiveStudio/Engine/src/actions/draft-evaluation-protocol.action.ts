/**
 * @module actions/draft-evaluation-protocol.action
 *
 * **Draft Evaluation Protocol** — the agent's draft-only protocol tool (PR 5, A3; D5-25, §5.1.2). It validates a
 * proposal of protocol members against the drafted unit and writes no row. Guard members — the holdout, promotion,
 * leakage audit, exclusions, budgets, minimum minority-class rows, search and `guardFieldsEditableBy`, under their
 * stored names or the contract's (`PromotionRule`, `LeakageAuditSpec`, `Budgets`, the holdout policy) — are never
 * accepted from an agent (PR 3's `GuardFieldsEditableBy = 'non-agent'` rule): the call is refused
 * `guard-field-edited-by-disallowed-author`. The other members are merged over the default protocol the builder binds
 * (`EvaluationProtocolRules.DefaultEvaluationProtocolDraft` on the unit's default holdout), and the merged protocol
 * must pass PR 3's parser and its save-time and unit rules. The output is the validated `ProtocolDraft` (exactly the
 * proposed members) or the refusal, with `HoldoutRowsRead` (always 0: the Action reads no row's label).
 */
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import {
  EvaluationProtocol, EvaluationProtocolRules, GUARD_FIELDS, PredictionUnit,
  type DraftRefusal, type EvaluationProtocolColumns, type EvaluationProtocolDraft, type GuardField, type HoldoutSplit,
  type PredictionUnitSpec, type ProtocolDraftMembers, type UnitDraft,
} from '@memberjunction/predictive-studio-core';

import { AgentReadScope } from '../agent/agent-read-scope';
import { ProtocolDefaults } from '../protocol/protocol-defaults';
import { RunViewDataAccess } from '../feature-assembly/data-access';
import { ProviderAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { BasePredictiveStudioAction, type JsonObject } from './base-predictive-studio.action';
export { DRAFT_EVALUATION_PROTOCOL_DRIVER_CLASS } from './driver-classes';
import { DRAFT_EVALUATION_PROTOCOL_DRIVER_CLASS } from './driver-classes';

/** What drafting a protocol reads: the unit's default holdout (the one the builder binds). */
export interface DraftProtocolDeps {
  readonly DefaultHoldout: (unit: PredictionUnitSpec) => Promise<HoldoutSplit>;
}

/** A drafted protocol, or why there is none; never a row. */
export type ProtocolDraftOutcome =
  | { readonly Kind: 'draft'; readonly Draft: ProtocolDraftMembers; readonly HoldoutRowsRead: 0 }
  | { readonly Kind: 'refused'; readonly Refusal: DraftRefusal; readonly HoldoutRowsRead: 0 };

/** The members a draft may set (every non-guard member of a protocol draft). */
type DraftMember = keyof ProtocolDraftMembers;

/** Each draft member's column, and whether the column holds JSON text (else the scalar itself). */
const MEMBER_COLUMNS: Readonly<Record<DraftMember, { readonly Column: keyof EvaluationProtocolColumns; readonly Json: boolean }>> = {
  name: { Column: 'Name', Json: false },
  innerValidation: { Column: 'InnerValidation', Json: true },
  seed: { Column: 'Seed', Json: false },
  holdoutAccessBudget: { Column: 'HoldoutAccessBudget', Json: false },
  primaryScore: { Column: 'PrimaryScore', Json: true },
  secondaryMetrics: { Column: 'SecondaryMetrics', Json: true },
  baselines: { Column: 'Baselines', Json: true },
  calibration: { Column: 'Calibration', Json: true },
  resampling: { Column: 'Resampling', Json: true },
  intervals: { Column: 'Intervals', Json: true },
  allowedOutcomes: { Column: 'AllowedOutcomes', Json: true },
  slices: { Column: 'Slices', Json: true },
  predictionIntervals: { Column: 'PredictionIntervals', Json: true },
  residualDiagnostics: { Column: 'ResidualDiagnostics', Json: true },
  retrainTriggers: { Column: 'RetrainTriggers', Json: true },
};

/** Names an agent may write a guard member under (lower-cased, separators removed), by the guard field they mean. */
const GUARD_ALIASES: Readonly<Record<string, GuardField>> = {
  holdout: 'holdout', holdoutpolicy: 'holdout', holdoutsplit: 'holdout', lockedholdout: 'holdout',
  promotion: 'promotion', promotionrule: 'promotion',
  leakageaudit: 'leakageAudit', leakageauditspec: 'leakageAudit',
  exclusions: 'exclusions',
  budgets: 'budgets', budget: 'budgets',
  minminorityclassrows: 'minMinorityClassRows',
  search: 'search', searchstrategy: 'search',
  guardfieldseditableby: 'guardFieldsEditableBy',
};

/** Draft-only Evaluation Protocol tool. */
@RegisterClass(BaseAction, DRAFT_EVALUATION_PROTOCOL_DRIVER_CLASS)
export class DraftEvaluationProtocolAction extends BasePredictiveStudioAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const unit = DraftEvaluationProtocolAction.UnitDraftOf(this.getJsonObjectParam(params, 'UnitDraft'));
      if (unit === null) return this.fail('MISSING_UNIT', 'UnitDraft (the validated Prediction Unit draft) is required.');
      const outcome = await DraftEvaluationProtocolAction.Draft(this.getJsonObjectParam(params, 'Protocol') || {}, unit, this.BuildDeps(params));
      return this.writeOutcome(params, outcome);
    } catch (e) {
      LogError(e);
      return this.fail('DRAFT_FAILED', e instanceof Error ? e.message : String(e));
    }
  }

  /** The Action's deps from the run params (the request's provider and user); overridable so tests inject fakes. */
  protected BuildDeps(params: RunActionParams): DraftProtocolDeps {
    const provider = params.Provider || Metadata.Provider; // global-provider-ok: RunActionParams.Provider is optional; ActionEngine contract falls back to the global provider (ActionEngine-Base.ts:413-419)
    return {
      DefaultHoldout: (unit) => ProtocolDefaults.DefaultHoldoutFor(unit, { DataAccess: new RunViewDataAccess(params.ContextUser, provider), Metadata: new ProviderAssemblyMetadata(provider), Now: new Date() }),
    };
  }

  /** The validated draft of `proposal` for `unit`, or the refusal: guard members first, then unknown members, then PR 3's rules. */
  public static async Draft(proposal: JsonObject, unit: UnitDraft, deps: DraftProtocolDeps): Promise<ProtocolDraftOutcome> {
    const guards = DraftEvaluationProtocolAction.GuardFieldsOf(proposal);
    if (guards.length > 0) return DraftEvaluationProtocolAction.refused({ kind: 'guard-field-edited-by-disallowed-author', fields: guards });
    const members = DraftEvaluationProtocolAction.membersOf(proposal);
    if (members.Unknown.length > 0) return DraftEvaluationProtocolAction.refused({ kind: 'draft-invalid', problems: members.Unknown.map((k) => `'${k}' is not an Evaluation Protocol member`) });
    const spec = AgentReadScope.DraftSpec(unit);
    const defaults = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: spec, Holdout: await deps.DefaultHoldout(spec), Candidates: 1, Seed: ProtocolDefaults.DEFAULT_SEED, Name: `${unit.Name} — protocol` });
    const merged = DraftEvaluationProtocolAction.mergeAndParse(defaults, members.Known);
    if ('Problems' in merged) return DraftEvaluationProtocolAction.refused({ kind: 'draft-invalid', problems: merged.Problems });
    const problems = DraftEvaluationProtocolAction.ruleProblems(merged.Draft, spec);
    if (problems.length > 0) return DraftEvaluationProtocolAction.refused({ kind: 'draft-invalid', problems });
    return { Kind: 'draft', Draft: DraftEvaluationProtocolAction.PickMembers(merged.Draft, [...members.Known.keys()]), HoldoutRowsRead: 0 };
  }

  /**
   * The Action's `ProtocolDraft` output read back into its type (the control path stores it in the payload), or null
   * when it sets a guard member or does not parse. The members are parsed by PR 3's parser over a template built on a
   * placeholder holdout: only the proposed (non-guard) members are kept, so the placeholder never reaches the draft.
   */
  public static ProtocolDraftOf(value: JsonObject, unit: UnitDraft): ProtocolDraftMembers | null {
    if (DraftEvaluationProtocolAction.GuardFieldsOf(value).length > 0) return null;
    const members = DraftEvaluationProtocolAction.membersOf(value);
    if (members.Unknown.length > 0) return null;
    const placeholder: HoldoutSplit = { kind: 'seeded-random', fraction: ProtocolDefaults.SEEDED_RANDOM_FRACTION };
    const defaults = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: AgentReadScope.DraftSpec(unit), Holdout: placeholder, Candidates: 1, Seed: ProtocolDefaults.DEFAULT_SEED, Name: unit.Name });
    const merged = DraftEvaluationProtocolAction.mergeAndParse(defaults, members.Known);
    return 'Problems' in merged ? null : DraftEvaluationProtocolAction.PickMembers(merged.Draft, [...members.Known.keys()]);
  }

  /** The guard fields `proposal` sets, in {@link GUARD_FIELDS} order (each named once, whatever spelling it used). */
  public static GuardFieldsOf(proposal: JsonObject): GuardField[] {
    const named = new Set(Object.keys(proposal).map((k) => GUARD_ALIASES[DraftEvaluationProtocolAction.normalize(k)]).filter((g): g is GuardField => g !== undefined));
    return GUARD_FIELDS.filter((g) => named.has(g));
  }

  /** The members of `draft` named in `keys`, as a protocol draft. */
  public static PickMembers(draft: EvaluationProtocolDraft, keys: readonly DraftMember[]): ProtocolDraftMembers {
    const out: ProtocolDraftMembers = {};
    for (const key of keys) Object.assign(out, { [key]: draft[key] });
    return out;
  }

  /** A validated unit draft from a param object (the control path passes the payload's `UnitDraft`), or null when it does not parse. */
  public static UnitDraftOf(value: JsonObject | undefined): UnitDraft | null {
    if (!value) return null;
    const text = (k: string): string => JSON.stringify(value[k] ?? null); // ?? : a JSON column of a missing member is the literal null, which the parser refuses
    const parsed = PredictionUnit.ParsePredictionUnitRow({
      ID: AgentReadScope.DRAFT_UNIT_ID, LineageRootID: AgentReadScope.DRAFT_UNIT_ID, Version: 1, LabelVersion: 1, AuthoredBy: JSON.stringify({ kind: 'system', component: 'agent-draft' }),
      Name: typeof value['Name'] === 'string' ? value['Name'] : '', UnitRows: text('UnitRows'), LabelRule: text('LabelRule'),
      LabelWindowDays: Number(value['LabelWindowDays']), LabelGapDays: Number(value['LabelGapDays']), TaskType: text('TaskType'), Censoring: text('Censoring'),
      ChangeHistoryPolicy: text('ChangeHistoryPolicy'), GroupKey: typeof value['GroupKey'] === 'string' ? value['GroupKey'] : null,
      TemporalSpec: value['TemporalSpec'] ? text('TemporalSpec') : null, DecisionSpec: text('DecisionSpec'), IncumbentHeuristic: text('IncumbentHeuristic'),
    });
    if (parsed.Ok === false) return null;
    const s = parsed.Value;
    return {
      Name: s.name, Description: typeof value['Description'] === 'string' ? value['Description'] : null, UnitRows: s.rows, LabelRule: s.label.rule,
      LabelWindowDays: s.label.windowDays, LabelGapDays: s.label.gapDays, TaskType: s.label.outcome, Censoring: s.censoring, ChangeHistoryPolicy: s.history,
      GroupKey: s.groupKey, TemporalSpec: s.temporal, DecisionSpec: s.decision, IncumbentHeuristic: s.incumbent,
    };
  }

  /** The proposal's members by their stored names, and the keys that name no member. */
  private static membersOf(proposal: JsonObject): { readonly Known: Map<DraftMember, string | number | boolean | object | null>; readonly Unknown: string[] } {
    const byNormalized = new Map((Object.keys(MEMBER_COLUMNS) as DraftMember[]).map((m) => [DraftEvaluationProtocolAction.normalize(m), m] as const));
    const known = new Map<DraftMember, string | number | boolean | object | null>();
    const unknown: string[] = [];
    for (const [key, value] of Object.entries(proposal)) {
      const member = byNormalized.get(DraftEvaluationProtocolAction.normalize(key));
      if (member === undefined) unknown.push(key);
      else known.set(member, DraftEvaluationProtocolAction.jsonValueOf(value));
    }
    return { Known: known, Unknown: unknown };
  }

  /** The default's columns with each proposed member's column replaced, parsed back by PR 3's parser. */
  private static mergeAndParse(defaults: EvaluationProtocolDraft, members: ReadonlyMap<DraftMember, string | number | boolean | object | null>): { readonly Draft: EvaluationProtocolDraft } | { readonly Problems: string[] } {
    const columns = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(defaults, {
      ID: AgentReadScope.DRAFT_UNIT_ID, LineageRootID: AgentReadScope.DRAFT_UNIT_ID, Version: 1, AuthoredBy: { kind: 'system', component: 'agent-draft' },
    });
    for (const [member, value] of members) {
      const target = MEMBER_COLUMNS[member];
      Object.assign(columns, { [target.Column]: target.Json && value !== null ? JSON.stringify(value) : value });
    }
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(columns);
    if (parsed.Ok === false) return { Problems: [...parsed.Errors] };
    return { Draft: EvaluationProtocolRules.DraftFromProtocolSpec(parsed.Value) };
  }

  /** PR 3's save-time (version 1) and unit rules, in words. */
  private static ruleProblems(draft: EvaluationProtocolDraft, unit: PredictionUnitSpec): string[] {
    const spec = { ...draft, id: AgentReadScope.DRAFT_UNIT_ID, lineageRootId: AgentReadScope.DRAFT_UNIT_ID, version: 1, authoredBy: { kind: 'system', component: 'agent-draft' } } as const;
    return [
      ...EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: spec, Previous: null, AuthoredBy: spec.authoredBy }),
      ...EvaluationProtocolRules.ValidateProtocolForUnit(spec, unit),
    ].map((r) => EvaluationProtocolRules.DescribeProtocolRefusal(r));
  }

  /** A param value as a JSON value (a nested value is kept as the object it is). */
  private static jsonValueOf(value: unknown): string | number | boolean | object | null {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'object' && value !== null) return value;
    return null;
  }

  /** A key with case and separators removed. */
  private static normalize(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private static refused(refusal: DraftRefusal): ProtocolDraftOutcome {
    return { Kind: 'refused', Refusal: refusal, HoldoutRowsRead: 0 };
  }

  /** The outcome as output params: the draft or the refusal, with `HoldoutRowsRead`. */
  private writeOutcome(params: RunActionParams, outcome: ProtocolDraftOutcome): ActionResultSimple {
    this.addOutputParam(params, 'HoldoutRowsRead', outcome.HoldoutRowsRead);
    if (outcome.Kind === 'refused') {
      this.addOutputParam(params, 'Refusal', JSON.stringify(outcome.Refusal));
      return { Success: true, ResultCode: 'REFUSED', Message: `No protocol drafted: ${JSON.stringify(outcome.Refusal)}`, Params: params.Params };
    }
    this.addOutputParam(params, 'ProtocolDraft', JSON.stringify(outcome.Draft));
    return this.ok(params, `Protocol drafted (${Object.keys(outcome.Draft).length} member(s) over the template; guard members are the template's).`);
  }
}
