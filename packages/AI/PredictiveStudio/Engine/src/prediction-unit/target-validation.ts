/**
 * @module prediction-unit/target-validation
 *
 * Target validation before training: fewer than two classes, labels outside the declared class order, a count
 * declared continuous, and negative values for count/non-negative tasks are refused with the unit refusal that
 * names them. Empty labels never get here (the reader excludes and counts them).
 */
import type { TaskType, UnitResolutionCounts, UnitValidation } from '@memberjunction/predictive-studio-core';
import type { UnitRow } from './unit-row-reader';

/** A continuous target that looks like this is a count: integers >= 0 that include 0 and take fewer distinct values. */
export const COUNT_SIGNATURE_MAX_DISTINCT = 50;

type UnitRefusalReason = Extract<UnitValidation, { status: 'refused' }>['reason'];

/** Target validation before training (static members on one owner class). */
export class UnitTargetValidator {
  private static refused(reason: UnitRefusalReason): UnitValidation {
    return { status: 'refused', reason };
  }

  public static ValidateUnitTargets(rows: readonly UnitRow[], task: TaskType, counts: UnitResolutionCounts): UnitValidation {
    if (rows.length === 0) {
      return UnitTargetValidator.refused({ kind: 'no-resolved-rows', censored: counts.censoredRowsExcluded, labelKnown: counts.labelKnownRowsExcluded, emptyLabel: counts.emptyLabelRowsExcluded });
    }
    return task.kind === 'binary' || task.kind === 'multiclass' ? UnitTargetValidator.validateClasses(rows, task, counts) : UnitTargetValidator.validateNumeric(rows, task, counts);
  }

  /** Classification: at least two observed classes, every one of them in the declared class order. */
  private static validateClasses(rows: readonly UnitRow[], task: Extract<TaskType, { kind: 'binary' | 'multiclass' }>, counts: UnitResolutionCounts): UnitValidation {
    const levels = new Map<string, number>();
    for (const r of rows) levels.set(String(r.Label), (levels.get(String(r.Label)) || 0) + 1);
    if (levels.size < 2) {
      const [value, n] = [...levels.entries()][0];
      return UnitTargetValidator.refused({ kind: 'single-valued-target', value, rows: n });
    }
    const unknown = [...levels.keys()].filter((l) => !task.classOrder.includes(l)).sort();
    if (unknown.length > 0) {
      return UnitTargetValidator.refused({ kind: 'task-type-mismatch', declared: task.kind, observed: `labels ${unknown.join(', ')} are not in classOrder [${task.classOrder.join(', ')}]` });
    }
    return { status: 'valid', observedLevels: levels.size, eligibleRows: rows.length, censoredRows: counts.censoredRowsExcluded };
  }

  /** Numeric tasks: numbers only, more than one value, the count signature refused as continuous, no negatives where declared. */
  private static validateNumeric(rows: readonly UnitRow[], task: Exclude<TaskType, { kind: 'binary' | 'multiclass' }>, counts: UnitResolutionCounts): UnitValidation {
    const values: number[] = [];
    for (const r of rows) {
      if (typeof r.Label !== 'number') return UnitTargetValidator.refused({ kind: 'task-type-mismatch', declared: task.kind, observed: `non-numeric label "${r.Label}"` });
      values.push(r.Label);
    }
    const distinct = new Set(values);
    if (distinct.size < 2) return UnitTargetValidator.refused({ kind: 'single-valued-target', value: String(values[0]), rows: values.length });
    const valueKind = task.kind === 'forecast' ? task.valueKind : task.kind;
    const allNonNegativeIntegers = values.every((v) => Number.isInteger(v) && v >= 0);
    if (valueKind === 'continuous' && allNonNegativeIntegers && distinct.has(0) && distinct.size < COUNT_SIGNATURE_MAX_DISTINCT) {
      return UnitTargetValidator.refused({ kind: 'task-type-mismatch', declared: task.kind, observed: `count (non-negative integers including 0, ${distinct.size} distinct values)` });
    }
    if (valueKind === 'count' && !allNonNegativeIntegers) {
      return UnitTargetValidator.refused({ kind: 'task-type-mismatch', declared: task.kind, observed: values.some((v) => v < 0) ? 'negative values' : 'non-integer values (continuous)' });
    }
    if (valueKind === 'non-negative' && values.some((v) => v < 0)) {
      return UnitTargetValidator.refused({ kind: 'task-type-mismatch', declared: task.kind, observed: 'negative values' });
    }
    return { status: 'valid', observedLevels: distinct.size, eligibleRows: rows.length, censoredRows: counts.censoredRowsExcluded };
  }
}
