/**
 * @module task-type
 *
 * The declared task type of a Prediction Unit. It replaces the two-valued `ProblemType` as the statement of
 * what is predicted. Class order is stated once, in artifact order; the scored class and the adverse class are
 * indices into it and are derived by {@link TaskTypeRules.ScoreSemantics}, never stored as a second copy that could disagree.
 */
import { JsonParse, type JsonObject, type JsonValue, type ParseResult } from './json-value';

export type TaskType =
  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'binary'; readonly classOrder: readonly [string, string]; readonly adverseIndex: 0 | 1 }
  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'multiclass'; readonly classOrder: readonly string[]; readonly adverseIndices: readonly number[] }
  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'continuous' }
  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'count' }
  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'non-negative'; readonly tweediePower: number }
  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'forecast'; readonly valueKind: 'continuous' | 'count' | 'non-negative' };

export type TaskKind = TaskType['kind'];

export const TASK_KINDS = ['binary', 'multiclass', 'continuous', 'count', 'non-negative', 'forecast'] as const satisfies readonly TaskKind[];

export interface ScoreSemanticsResult {
  readonly ScoreRefersTo: string | null;
  readonly AdverseDirection: 'higher-score-is-adverse' | 'lower-score-is-adverse' | 'not-applicable';
}

/**
 * The rules derived from a declared TaskType: score semantics, classification test, the legacy ProblemType value,
 * and the TaskType parser (static members on one owner class).
 */
export class TaskTypeRules {
  /** The one derivation of score semantics; UI and scoring call this, never store a copy. */
  public static ScoreSemantics(task: TaskType): ScoreSemanticsResult {
    switch (task.kind) {
      case 'binary':
        return {
          ScoreRefersTo: task.classOrder[1],
          AdverseDirection: task.adverseIndex === 1 ? 'higher-score-is-adverse' : 'lower-score-is-adverse',
        };
      case 'multiclass':
      case 'continuous':
      case 'count':
      case 'non-negative':
      case 'forecast':
        return { ScoreRefersTo: null, AdverseDirection: 'not-applicable' };
    }
  }

  /** True for the kinds whose labels are classes. */
  public static IsClassificationTask(task: TaskType): task is Extract<TaskType, { kind: 'binary' | 'multiclass' }> {
    return task.kind === 'binary' || task.kind === 'multiclass';
  }

  /** The value written to the legacy `ProblemType` columns of pipelines and models (CHECK: classification|regression). */
  public static LegacyProblemTypeForTask(task: TaskType): 'classification' | 'regression' {
    return TaskTypeRules.IsClassificationTask(task) ? 'classification' : 'regression';
  }

  /** Parse a `TaskType` JSON value; every problem is reported. */
  public static ParseTaskType(v: JsonValue): ParseResult<TaskType> {
    if (!JsonParse.IsJsonObject(v)) {
      return JsonParse.ParseFail('TaskType must be a JSON object with a "kind"');
    }
    const kind = JsonParse.JsonString(v, 'kind');
    switch (kind) {
      case 'binary':
        return TaskTypeRules.parseBinary(v);
      case 'multiclass':
        return TaskTypeRules.parseMulticlass(v);
      case 'continuous':
        return JsonParse.ParseOk({ kind: 'continuous' });
      case 'count':
        return JsonParse.ParseOk({ kind: 'count' });
      case 'non-negative': {
        const power = JsonParse.JsonNumber(v, 'tweediePower');
        return power !== null && power > 1 && power < 2
          ? JsonParse.ParseOk({ kind: 'non-negative', tweediePower: power })
          : JsonParse.ParseFail('non-negative tweediePower must be a number strictly between 1 and 2');
      }
      case 'forecast': {
        const valueKind = JsonParse.JsonString(v, 'valueKind');
        return valueKind === 'continuous' || valueKind === 'count' || valueKind === 'non-negative'
          ? JsonParse.ParseOk({ kind: 'forecast', valueKind })
          : JsonParse.ParseFail('forecast valueKind must be continuous, count or non-negative');
      }
      default:
        return JsonParse.ParseFail(`TaskType kind "${kind || ''}" is not one of ${TASK_KINDS.join(', ')}`);
    }
  }

  private static binaryIndex(v: JsonValue | undefined): 0 | 1 | null {
    return v === 0 ? 0 : v === 1 ? 1 : null;
  }

  private static parseBinary(v: JsonObject): ParseResult<TaskType> {
    const order = JsonParse.JsonStringArray(v, 'classOrder');
    const adverse = TaskTypeRules.binaryIndex(v['adverseIndex']);
    const errors: string[] = [];
    if (order === null || order.length !== 2) {
      errors.push('binary classOrder must list exactly two class labels, in artifact order');
    } else if (order[0] === order[1]) {
      errors.push('binary classOrder labels must differ');
    }
    if (adverse === null) {
      errors.push('binary adverseIndex must be 0 or 1');
    }
    if (errors.length > 0 || order === null || adverse === null) {
      return { Ok: false, Errors: errors };
    }
    return JsonParse.ParseOk({ kind: 'binary', classOrder: [order[0], order[1]], adverseIndex: adverse });
  }

  private static parseMulticlass(v: JsonObject): ParseResult<TaskType> {
    const order = JsonParse.JsonStringArray(v, 'classOrder');
    const adverse = JsonParse.JsonIntegerArray(v, 'adverseIndices');
    const errors: string[] = [];
    if (order === null || order.length < 3) {
      errors.push('multiclass classOrder must list at least three class labels (two classes is a binary task)');
    } else if (new Set(order).size !== order.length) {
      errors.push('multiclass classOrder labels must be unique');
    }
    if (adverse === null) {
      errors.push('multiclass adverseIndices must be an array of integers');
    } else if (order !== null && adverse.some((i) => i < 0 || i >= order.length)) {
      errors.push(`multiclass adverseIndices must index classOrder (0..${order.length - 1})`);
    }
    if (errors.length > 0 || order === null || adverse === null) {
      return { Ok: false, Errors: errors };
    }
    return JsonParse.ParseOk({ kind: 'multiclass', classOrder: order, adverseIndices: adverse });
  }
}
