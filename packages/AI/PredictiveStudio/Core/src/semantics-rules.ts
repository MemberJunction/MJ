/**
 * @module semantics-rules
 *
 * The rule behind S9.5: what each of the four UI surfaces must show for a model, derived from its declared
 * `OutputSemantics` through {@link TaskTypeRules.ScoreSemantics} (the one source of truth for which class a score is for
 * and which direction is adverse), and the check of a model's `MJ: ML Output Bindings` rows against it. Pure.
 */
import type { SemanticsCheck, SemanticsCheckBinding } from './governance-contracts';
import type { ListsEveryMember } from './json-value';
import type { OutputSemantics } from './registry-contracts';
import { TaskTypeRules, type TaskType } from './task-type';

/** A surface's binding before it is stored: a default row has no ID yet, and a stored binding satisfies it. */
export type SemanticsBindingSpec = Omit<SemanticsCheckBinding, 'BindingID'>;

/** One of the four surfaces that render a model's output. */
export type BindingSurface = SemanticsCheckBinding['Surface'];

/** The four surfaces, in the order the defaults and the mismatches list them (§5.1). */
export const BINDING_SURFACES = ['at-risk-list', 'why-badge', 'predictions-grid', 'record-panel'] as const satisfies readonly BindingSurface[];
/** Compile-time completeness: a surface added to the contract without listing it here breaks the build. */
const bindingSurfacesComplete: ListsEveryMember<BindingSurface, (typeof BINDING_SURFACES)[number]> = true;
void bindingSurfacesComplete;

/** One way a binding row disagrees with the semantics: its surface, the field at fault and the words of the mismatch. */
export interface SemanticsMismatch {
  readonly Surface: BindingSurface;
  readonly Field: 'SortsBy' | 'DriverDirectionRelativeTo' | 'Label';
  readonly Message: string;
}

/** The sort and driver direction the semantics require of one surface. */
type RequiredShape = Pick<SemanticsBindingSpec, 'SortsBy' | 'DriverDirectionRelativeTo'>;

/** The surfaces that list rows in an order: the at-risk list and the predictions grid. */
const SORTING_SURFACES: readonly BindingSurface[] = ['at-risk-list', 'predictions-grid'];

/**
 * The output-binding rules. The table, derived from `TaskTypeRules.ScoreSemantics(task)`:
 *
 * | task | surface | `SortsBy` | `DriverDirectionRelativeTo` | `Label` |
 * |---|---|---|---|---|
 * | binary, multiclass | `at-risk-list`, `predictions-grid` | `adverse-probability-desc` | `adverse-class` | names every adverse class and no other class |
 * | binary, multiclass | `why-badge`, `record-panel` | `none` | `adverse-class` | as above |
 * | multiclass declaring no adverse class (`adverseIndices: []`) | every surface | `none` | `raw-contribution` | names no class |
 * | continuous, count, non-negative, forecast | `at-risk-list`, `predictions-grid` | `score-desc` when `higher-score-is-adverse`, `score-asc` when `lower-score-is-adverse`, `none` when `not-applicable` | `raw-contribution` | any non-blank label |
 * | continuous, count, non-negative, forecast | `why-badge`, `record-panel` | `none` | `raw-contribution` | any non-blank label |
 *
 * The adverse classes of a binary task are `classOrder[adverseIndex]`, of a multiclass task `classOrder[i]` for each
 * `i` in `adverseIndices`. A classification that declares no adverse class has no adverse probability to sort by and
 * no adverse class to orient drivers to, so a sort by adverse probability or a direction relative to the adverse class
 * would be a claim nothing backs: its surfaces sort by `none`, its drivers are raw contributions. A label names a class when it contains the class's name as a whole word, in any case;
 * longer class names are read first, so a label naming `No Show` does not also name `Show`. Every shipped regression
 * kind's adverse direction is `not-applicable` (`ScoreSemantics`), so its sorting surfaces sort by `none`.
 *
 * Default labels: a classification's is `<adverse classes joined by " or "> risk` (`Bronze risk`), or
 * {@link PREDICTED_CLASS_LABEL} for a multiclass task that declares no adverse class; a regression kind's is
 * `ScoreSemantics(task).ScoreRefersTo` when it names something, else the fixed {@link PREDICTED_VALUE_LABEL} — the
 * semantics carry no target name, and `ScoreRefersTo` is null for every regression kind, so it is always the fixed label.
 */
export class SemanticsRules {
  /** A regression model's default label: its semantics carry no target name. */
  public static readonly PREDICTED_VALUE_LABEL = 'Predicted value';
  /** The default label of a multiclass model that declares no adverse class. */
  public static readonly PREDICTED_CLASS_LABEL = 'Predicted class';

  /** The default binding of every surface, in {@link BINDING_SURFACES} order; they pass {@link Check}. */
  public static DefaultBindings(semantics: OutputSemantics): SemanticsBindingSpec[] {
    const label = SemanticsRules.defaultLabel(semantics.task);
    return BINDING_SURFACES.map((surface) => ({ Surface: surface, ...SemanticsRules.requiredShape(semantics.task, surface), Label: label }));
  }

  /**
   * The check of a model's bindings: exactly one row per surface (a missing or a duplicated surface is named), each
   * row as {@link CheckRow} checks it. Mismatches are listed in surface order.
   */
  public static Check(semantics: OutputSemantics, bindings: readonly SemanticsBindingSpec[]): SemanticsCheck['Result'] {
    const mismatches = BINDING_SURFACES.flatMap((surface) => {
      const rows = bindings.filter((b) => b.Surface === surface);
      if (rows.length === 0) return [`${surface}: no binding row, the semantics require one`];
      if (rows.length > 1) return [`${surface}: ${rows.length} binding rows, the semantics require one`];
      return SemanticsRules.CheckRow(semantics, rows[0]).map((m) => m.Message);
    });
    return mismatches.length === 0 ? { Status: 'passed' } : { Status: 'failed', Mismatches: mismatches };
  }

  /**
   * One surface's row alone against the semantics (what a save of that one row is checked by): its sort, its driver
   * direction and its label, each mismatch naming its field. Empty when the row agrees.
   */
  public static CheckRow(semantics: OutputSemantics, row: SemanticsBindingSpec): readonly SemanticsMismatch[] {
    const required = SemanticsRules.requiredShape(semantics.task, row.Surface);
    const mismatches: SemanticsMismatch[] = [];
    if (row.SortsBy !== required.SortsBy) mismatches.push(SemanticsRules.mismatch(row.Surface, 'SortsBy', row.SortsBy, required.SortsBy));
    if (row.DriverDirectionRelativeTo !== required.DriverDirectionRelativeTo) {
      mismatches.push(SemanticsRules.mismatch(row.Surface, 'DriverDirectionRelativeTo', row.DriverDirectionRelativeTo, required.DriverDirectionRelativeTo));
    }
    const label = SemanticsRules.labelProblem(semantics.task, row.Label);
    if (label !== null) mismatches.push(SemanticsRules.mismatch(row.Surface, 'Label', `"${row.Label}"`, label));
    return mismatches;
  }

  /** The adverse classes of a classification task (none for a regression kind), in class order. */
  public static AdverseClasses(task: TaskType): readonly string[] {
    if (task.kind === 'binary') return [task.classOrder[task.adverseIndex]];
    if (task.kind === 'multiclass') return task.classOrder.filter((_c, i) => task.adverseIndices.includes(i));
    return [];
  }

  private static mismatch(surface: BindingSurface, field: SemanticsMismatch['Field'], actual: string, expected: string): SemanticsMismatch {
    return { Surface: surface, Field: field, Message: `${surface}: ${field} is ${actual}, the semantics require ${expected}` };
  }

  /** The sort and driver direction `surface` must have under `task`. */
  private static requiredShape(task: TaskType, surface: BindingSurface): RequiredShape {
    const sorts = SORTING_SURFACES.includes(surface);
    if (TaskTypeRules.IsClassificationTask(task)) {
      if (SemanticsRules.AdverseClasses(task).length === 0) return { SortsBy: 'none', DriverDirectionRelativeTo: 'raw-contribution' };
      return { SortsBy: sorts ? 'adverse-probability-desc' : 'none', DriverDirectionRelativeTo: 'adverse-class' };
    }
    return { SortsBy: sorts ? SemanticsRules.regressionSort(task) : 'none', DriverDirectionRelativeTo: 'raw-contribution' };
  }

  /** A regression kind's list order, from its adverse direction. */
  private static regressionSort(task: TaskType): SemanticsBindingSpec['SortsBy'] {
    switch (TaskTypeRules.ScoreSemantics(task).AdverseDirection) {
      case 'higher-score-is-adverse':
        return 'score-desc';
      case 'lower-score-is-adverse':
        return 'score-asc';
      case 'not-applicable':
        return 'none';
    }
  }

  private static defaultLabel(task: TaskType): string {
    if (!TaskTypeRules.IsClassificationTask(task)) return TaskTypeRules.ScoreSemantics(task).ScoreRefersTo || SemanticsRules.PREDICTED_VALUE_LABEL;
    const adverse = SemanticsRules.AdverseClasses(task);
    return adverse.length === 0 ? SemanticsRules.PREDICTED_CLASS_LABEL : `${adverse.join(' or ')} risk`;
  }

  /** What the label must be, when it is not: a non-blank label, or one naming exactly the adverse classes. */
  private static labelProblem(task: TaskType, label: string): string | null {
    if (!TaskTypeRules.IsClassificationTask(task)) return label.trim().length > 0 ? null : 'a non-blank label';
    const adverse = SemanticsRules.AdverseClasses(task);
    const named = SemanticsRules.namedClasses(label, task.classOrder);
    const exact = named.length === adverse.length && adverse.every((c) => named.includes(c));
    if (exact) return null;
    return adverse.length === 0 ? 'a label naming no class' : `a label naming ${adverse.join(' and ')} and no other class`;
  }

  /** The classes `label` names as whole words, any case; longer names first, each match blanked so a shorter name inside it is not read again. */
  private static namedClasses(label: string, classes: readonly string[]): readonly string[] {
    let text = label.toLowerCase();
    const named: string[] = [];
    for (const c of [...classes].sort((a, b) => b.length - a.length)) {
      const needle = c.toLowerCase();
      const blanked = SemanticsRules.blankWholeWord(text, needle);
      if (blanked !== text) named.push(c);
      text = blanked;
    }
    return named;
  }

  /** `text` with every whole-word occurrence of `needle` replaced by spaces (unchanged when there is none). */
  private static blankWholeWord(text: string, needle: string): string {
    if (needle.length === 0) return text;
    let out = text;
    let from = 0;
    for (let at = out.indexOf(needle, from); at >= 0; at = out.indexOf(needle, from)) {
      const end = at + needle.length;
      if (!SemanticsRules.isWordChar(out[at - 1]) && !SemanticsRules.isWordChar(out[end])) out = `${out.slice(0, at)}${' '.repeat(needle.length)}${out.slice(end)}`;
      from = end;
    }
    return out;
  }

  private static isWordChar(ch: string | undefined): boolean {
    return ch !== undefined && /[\p{L}\p{N}_]/u.test(ch);
  }
}
