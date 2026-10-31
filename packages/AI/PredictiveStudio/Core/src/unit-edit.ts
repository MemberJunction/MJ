/**
 * @module unit-edit
 *
 * Authoring a Prediction Unit version from a form. The form edits grain units whose decision date is a column and
 * whose outcome is a column of the row; a grain-x-periods row rule, a next-period or child-event outcome rule, a
 * forecast task, the Temporal Spec, the change-history policy, the decision and the incumbent heuristic are carried
 * over from the previous version unchanged (they are edited as JSON on the generated record form). The label version
 * moves exactly when `PredictionUnit.LabelDefinitionChanged` says the outcome definition changed.
 */
import {
  PredictionUnit,
  type CensoringCutoff, type CensoringRule, type ChangeHistoryPolicy, type DecisionSpec, type LabelRule, type PredictionUnitSpec, type UnitRows,
} from './prediction-unit';
import { ProtocolRows, type UnitDraft } from './protocol-rows';
import type { TaskKind, TaskType } from './task-type';

/** The fields of a unit version an analyst edits in a form. */
export interface UnitEditForm {
  Name: string;
  GrainEntity: string;
  DecisionDateColumn: string;
  LabelColumn: string;
  WindowDays: number;
  GapDays: number;
  /** The task kinds the form authors; a forecast is carried over from the previous version. */
  TaskKind: Exclude<TaskKind, 'forecast'>;
  /** Comma-separated class labels in artifact order (classification). */
  ClassOrder: string;
  /** Binary: one class; multiclass: a comma-separated list. */
  AdverseClass: string;
  TweediePower: number;
  /** `corpus-end` is accepted only when the previous version used it (its entity and field are carried over). */
  CensoringMode: CensoringCutoff['kind'];
  /** yyyy-mm-dd when CensoringMode is `fixed`. */
  CensoringFixedAt: string;
  /** '' = no group key. */
  GroupKey: string;
}

/** The next version's draft and label version, or why the form cannot become one. */
export type UnitEditResult =
  | { readonly Ok: true; readonly Draft: UnitDraft; readonly LabelVersion: number }
  | { readonly Ok: false; readonly Error: string };

/** The change-history policy of a new lineage. */
const DEFAULT_HISTORY: ChangeHistoryPolicy = { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' };
/** The decision of a new lineage, until someone edits it on the record form. */
const DEFAULT_DECISION: DecisionSpec = { action: 'review', actorRole: 'analyst', capacityPerPeriod: null, period: 'month' };

/** The parts of a draft built from the form; a string is the first problem found. */
interface FormParts {
  readonly Task: TaskType;
  readonly Rows: UnitRows;
  readonly Rule: LabelRule;
  readonly Censoring: CensoringRule;
}

/** Unit authoring from a form: the form of a version, the next version's draft and its label version. */
export class UnitEdits {
  /** The form showing a saved version. */
  public static UnitEditFormFrom(u: PredictionUnitSpec): UnitEditForm {
    const o = u.label.outcome;
    const cutoff = u.censoring.cutoff;
    return {
      Name: u.name,
      GrainEntity: u.rows.grainEntity,
      DecisionDateColumn: u.rows.kind === 'grain' && u.rows.decisionDate.kind === 'column' ? u.rows.decisionDate.column : '',
      LabelColumn: u.label.rule.kind === 'column' ? u.label.rule.column : '',
      WindowDays: u.label.windowDays,
      GapDays: u.label.gapDays,
      TaskKind: o.kind === 'forecast' ? o.valueKind : o.kind,
      ClassOrder: o.kind === 'binary' || o.kind === 'multiclass' ? o.classOrder.join(', ') : '',
      AdverseClass: UnitEdits.adverseClassText(o),
      TweediePower: o.kind === 'non-negative' ? o.tweediePower : 1.5,
      CensoringMode: cutoff.kind,
      CensoringFixedAt: cutoff.kind === 'fixed' ? cutoff.at : '',
      GroupKey: u.groupKey || '',
    };
  }

  /** The label version of the version after `base` with `next`'s outcome definition (1 for a new lineage). */
  public static NextLabelVersion(base: PredictionUnitSpec | null, next: Pick<UnitDraft, 'LabelRule' | 'LabelWindowDays' | 'LabelGapDays' | 'TaskType'>): number {
    if (base === null) return 1;
    const nextSpec: PredictionUnitSpec = {
      ...base,
      label: { ...base.label, rule: next.LabelRule, windowDays: next.LabelWindowDays, gapDays: next.LabelGapDays, outcome: next.TaskType },
    };
    return PredictionUnit.LabelDefinitionChanged(base, nextSpec) ? base.label.labelVersion + 1 : base.label.labelVersion;
  }

  /** The draft of the version after `base` (null = version 1) with the form applied, or the first problem with the form. */
  public static ApplyUnitEdits(base: PredictionUnitSpec | null, form: UnitEditForm): UnitEditResult {
    const problem = UnitEdits.scalarProblem(form);
    if (problem !== null) return { Ok: false, Error: problem };
    const parts = UnitEdits.formParts(base, form);
    if (typeof parts === 'string') return { Ok: false, Error: parts };
    const draft = UnitEdits.draftFrom(base, form, parts);
    return { Ok: true, Draft: draft, LabelVersion: UnitEdits.NextLabelVersion(base, draft) };
  }

  private static scalarProblem(form: UnitEditForm): string | null {
    if (form.Name.trim().length === 0) return 'The unit needs a name.';
    if (!Number.isInteger(form.WindowDays) || form.WindowDays < 1) return 'The outcome window must be a whole number of days, at least 1.';
    if (!Number.isInteger(form.GapDays) || form.GapDays < 0) return 'The gap must be a whole number of days, 0 or more.';
    return null;
  }

  /** The task, rows, outcome rule and censoring of the draft, or the first problem with them. */
  private static formParts(base: PredictionUnitSpec | null, form: UnitEditForm): FormParts | string {
    const task = base !== null && base.label.outcome.kind === 'forecast' ? base.label.outcome : UnitEdits.outcomeFrom(form);
    if (typeof task === 'string') return task;
    const rows = UnitEdits.rowsFrom(base, form);
    if (typeof rows === 'string') return rows;
    const rule = UnitEdits.ruleFrom(base, form);
    if (typeof rule === 'string') return rule;
    const censoring = UnitEdits.censoringFrom(base, form);
    if (typeof censoring === 'string') return censoring;
    return { Task: task, Rows: rows, Rule: rule, Censoring: censoring };
  }

  /** The draft: the form's parts, and everything the form does not edit carried over from `base`. */
  private static draftFrom(base: PredictionUnitSpec | null, form: UnitEditForm, parts: FormParts): UnitDraft {
    const groupKey = form.GroupKey.trim();
    return {
      Name: form.Name.trim(),
      Description: null,
      UnitRows: parts.Rows,
      LabelRule: parts.Rule,
      LabelWindowDays: form.WindowDays,
      LabelGapDays: form.GapDays,
      TaskType: parts.Task,
      Censoring: parts.Censoring,
      ChangeHistoryPolicy: base === null ? DEFAULT_HISTORY : base.history,
      GroupKey: groupKey === '' ? null : groupKey,
      TemporalSpec: base === null ? null : base.temporal,
      DecisionSpec: base === null ? DEFAULT_DECISION : base.decision,
      IncumbentHeuristic: base === null ? { kind: 'none' } : base.incumbent,
    };
  }

  private static adverseClassText(o: TaskType): string {
    if (o.kind === 'binary') return o.classOrder[o.adverseIndex];
    // A stored index outside the class order names no class; the label is then blank rather than "undefined".
    if (o.kind === 'multiclass') return o.adverseIndices.map((i) => o.classOrder[i] || '').join(', ');
    return '';
  }

  private static rowsFrom(base: PredictionUnitSpec | null, form: UnitEditForm): UnitRows | string {
    if (base !== null && (base.rows.kind === 'grain-x-periods' || base.rows.decisionDate.kind !== 'column')) return base.rows;
    const entity = form.GrainEntity.trim();
    const column = form.DecisionDateColumn.trim();
    if (entity === '' || column === '') return 'Name the entity whose records are the rows and its decision-date column.';
    return { kind: 'grain', grainEntity: entity, decisionDate: { kind: 'column', column }, filter: base === null ? [] : base.rows.filter };
  }

  private static ruleFrom(base: PredictionUnitSpec | null, form: UnitEditForm): LabelRule | string {
    if (base !== null && base.label.rule.kind !== 'column') return base.label.rule;
    const column = form.LabelColumn.trim();
    return column === '' ? 'Name the column that holds the outcome.' : { kind: 'column', column };
  }

  private static censoringFrom(base: PredictionUnitSpec | null, form: UnitEditForm): CensoringRule | string {
    switch (form.CensoringMode) {
      case 'now':
        return { rule: 'exclude-unresolved', cutoff: { kind: 'now' } };
      case 'fixed':
        return ProtocolRows.IsIsoDay(form.CensoringFixedAt)
          ? { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: form.CensoringFixedAt } }
          : `The censoring date must be yyyy-mm-dd (got "${form.CensoringFixedAt}").`;
      case 'corpus-end':
        return base !== null && base.censoring.cutoff.kind === 'corpus-end'
          ? base.censoring
          : 'A corpus-end cutoff names an entity and a date field; edit it as JSON on the record form.';
    }
  }

  /** The TaskType the form declares, or the problem with it. */
  private static outcomeFrom(form: UnitEditForm): TaskType | string {
    const classes = UnitEdits.splitList(form.ClassOrder);
    switch (form.TaskKind) {
      case 'binary':
        return UnitEdits.binaryOutcome(classes, form.AdverseClass.trim());
      case 'multiclass':
        return UnitEdits.multiclassOutcome(classes, UnitEdits.splitList(form.AdverseClass));
      case 'continuous':
        return { kind: 'continuous' };
      case 'count':
        return { kind: 'count' };
      case 'non-negative':
        return form.TweediePower > 1 && form.TweediePower < 2 ? { kind: 'non-negative', tweediePower: form.TweediePower } : 'The Tweedie power must be between 1 and 2.';
    }
  }

  private static binaryOutcome(classes: readonly string[], adverse: string): TaskType | string {
    const [first, second] = classes;
    if (classes.length !== 2 || first === undefined || second === undefined) {
      return 'A binary outcome needs exactly two classes in artifact order, e.g. "Lapsed, Renewed".';
    }
    const idx = classes.indexOf(adverse);
    if (idx === 0 || idx === 1) return { kind: 'binary', classOrder: [first, second], adverseIndex: idx };
    return `The adverse class "${adverse}" is not one of: ${classes.join(', ')}.`;
  }

  private static multiclassOutcome(classes: readonly string[], adverse: readonly string[]): TaskType | string {
    if (classes.length < 3) return 'A multiclass outcome needs at least three classes.';
    const indices = adverse.map((a) => classes.indexOf(a));
    if (indices.some((i) => i < 0)) return `Every adverse class must be one of: ${classes.join(', ')}.`;
    return { kind: 'multiclass', classOrder: classes, adverseIndices: indices };
  }

  private static splitList(text: string): string[] {
    return text.split(',').map((c) => c.trim()).filter((c) => c.length > 0);
  }
}
