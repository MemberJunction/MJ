/**
 * `SemanticsRules` (Task M4.2, §5.1/§5.2): the default output bindings a model's `OutputSemantics` gives each of the four
 * surfaces, and the check of stored bindings against those semantics — every task kind, the C3 multiclass case of
 * gate G3.10 (`C3 -> S9.5`) included.
 */
import { describe, it, expect } from 'vitest';
import { SemanticsRules, BINDING_SURFACES, type SemanticsBindingSpec } from '../semantics-rules';
import type { OutputSemantics } from '../registry-contracts';
import type { TaskType } from '../task-type';

const c3: OutputSemantics = { task: { kind: 'multiclass', classOrder: ['Bronze', 'Silver', 'Gold'], adverseIndices: [0] } };

/** The C3 semantics with class `index` as the one adverse class. */
function WithAdverse(semantics: OutputSemantics, index: number): OutputSemantics {
  if (semantics.task.kind !== 'multiclass') throw new Error('WithAdverse takes a multiclass task');
  return { task: { ...semantics.task, adverseIndices: [index] } };
}

/** The default bindings with `surface`'s row changed by `change`. */
function Edited(semantics: OutputSemantics, surface: SemanticsBindingSpec['Surface'], change: Partial<SemanticsBindingSpec>): SemanticsBindingSpec[] {
  return SemanticsRules.DefaultBindings(semantics).map((b) => (b.Surface === surface ? { ...b, ...change } : b));
}

/** C3's classes with no adverse class declared (what the pipeline migration gives when no source styles a class red). */
const noAdverse: OutputSemantics = { task: { kind: 'multiclass', classOrder: ['Bronze', 'Silver', 'Gold'], adverseIndices: [] } };

const tasks: Readonly<Record<TaskType['kind'], TaskType>> = {
  binary: { kind: 'binary', classOrder: ['Stayed', 'Lapsed'], adverseIndex: 1 },
  multiclass: c3.task,
  continuous: { kind: 'continuous' },
  count: { kind: 'count' },
  'non-negative': { kind: 'non-negative', tweediePower: 1.5 },
  forecast: { kind: 'forecast', valueKind: 'count' },
};

describe('SemanticsRules (C3, the plan tests)', () => {
  it('passes the default bindings of each of the three C3 classes', () => {
    for (const index of [0, 1, 2]) {
      const s = WithAdverse(c3, index);
      expect(SemanticsRules.Check(s, SemanticsRules.DefaultBindings(s))).toEqual({ Status: 'passed' });
    }
  });
  it('refuses a binding that swaps the adverse class', () => {
    const rows = SemanticsRules.DefaultBindings(c3).map((b) => (b.Surface === 'at-risk-list' ? { ...b, Label: 'Gold risk' } : b));
    expect(SemanticsRules.Check(c3, rows)).toMatchObject({ Status: 'failed', Mismatches: [expect.stringContaining('at-risk-list')] });
  });
  it('refuses a why-badge relative to raw contribution on a classification', () => {
    const rows = SemanticsRules.DefaultBindings(c3).map((b) => (b.Surface === 'why-badge' ? { ...b, DriverDirectionRelativeTo: 'raw-contribution' as const } : b));
    expect(SemanticsRules.Check(c3, rows).Status).toBe('failed');
  });
});

describe('SemanticsRules.DefaultBindings', () => {
  it('gives one row per surface, in surface order, for every task kind', () => {
    for (const task of Object.values(tasks)) {
      expect(SemanticsRules.DefaultBindings({ task }).map((b) => b.Surface)).toEqual([...BINDING_SURFACES]);
    }
  });
  it('sorts a classification by adverse probability, relative to the adverse class, labelled by the adverse class', () => {
    expect(SemanticsRules.DefaultBindings(c3)).toEqual([
      { Surface: 'at-risk-list', SortsBy: 'adverse-probability-desc', DriverDirectionRelativeTo: 'adverse-class', Label: 'Bronze risk' },
      { Surface: 'why-badge', SortsBy: 'none', DriverDirectionRelativeTo: 'adverse-class', Label: 'Bronze risk' },
      { Surface: 'predictions-grid', SortsBy: 'adverse-probability-desc', DriverDirectionRelativeTo: 'adverse-class', Label: 'Bronze risk' },
      { Surface: 'record-panel', SortsBy: 'none', DriverDirectionRelativeTo: 'adverse-class', Label: 'Bronze risk' },
    ]);
    expect(SemanticsRules.DefaultBindings({ task: tasks.binary })[0]).toEqual({ Surface: 'at-risk-list', SortsBy: 'adverse-probability-desc', DriverDirectionRelativeTo: 'adverse-class', Label: 'Lapsed risk' });
  });
  it('names every adverse class of a multiclass task with several', () => {
    expect(SemanticsRules.DefaultBindings({ task: { kind: 'multiclass', classOrder: ['Bronze', 'Silver', 'Gold'], adverseIndices: [0, 1] } })[0].Label).toBe('Bronze or Silver risk');
  });
  it('gives a multiclass task with no adverse class no sort, raw contributions and a label naming no class, on every surface', () => {
    expect(SemanticsRules.DefaultBindings(noAdverse)).toEqual(BINDING_SURFACES.map((s) => ({ Surface: s, SortsBy: 'none', DriverDirectionRelativeTo: 'raw-contribution', Label: SemanticsRules.PREDICTED_CLASS_LABEL })));
  });
  it('gives a regression kind raw contributions, no sort (its adverse direction is not applicable) and the fixed value label', () => {
    for (const kind of ['continuous', 'count', 'non-negative', 'forecast'] as const) {
      for (const b of SemanticsRules.DefaultBindings({ task: tasks[kind] })) {
        expect(b).toMatchObject({ SortsBy: 'none', DriverDirectionRelativeTo: 'raw-contribution', Label: SemanticsRules.PREDICTED_VALUE_LABEL });
      }
    }
  });
});

describe('SemanticsRules.Check', () => {
  it('passes the default bindings of every task kind', () => {
    for (const task of Object.values(tasks)) expect(SemanticsRules.Check({ task }, SemanticsRules.DefaultBindings({ task }))).toEqual({ Status: 'passed' });
  });
  it("words a mismatch as '<surface>: <field> is <actual>, the semantics require <expected>'", () => {
    expect(SemanticsRules.Check(c3, Edited(c3, 'at-risk-list', { SortsBy: 'score-asc' }))).toEqual({
      Status: 'failed', Mismatches: ['at-risk-list: SortsBy is score-asc, the semantics require adverse-probability-desc'],
    });
    expect(SemanticsRules.Check(c3, Edited(c3, 'at-risk-list', { Label: 'Gold risk' }))).toEqual({
      Status: 'failed', Mismatches: ['at-risk-list: Label is "Gold risk", the semantics require a label naming Bronze and no other class'],
    });
    expect(SemanticsRules.Check(c3, Edited(c3, 'record-panel', { DriverDirectionRelativeTo: 'raw-contribution' }))).toEqual({
      Status: 'failed', Mismatches: ['record-panel: DriverDirectionRelativeTo is raw-contribution, the semantics require adverse-class'],
    });
  });
  it('refuses a label that names an adverse class and also another class, and one that names none', () => {
    expect(SemanticsRules.Check(c3, Edited(c3, 'why-badge', { Label: 'Bronze vs Gold' })).Status).toBe('failed');
    expect(SemanticsRules.Check(c3, Edited(c3, 'why-badge', { Label: 'Risk' })).Status).toBe('failed');
  });
  it('accepts an edited label that still names exactly the adverse classes, matching whole words in any case', () => {
    expect(SemanticsRules.Check(c3, Edited(c3, 'at-risk-list', { Label: 'Likely to end up bronze' }))).toEqual({ Status: 'passed' });
    // "Bronzed" is not the class Bronze.
    expect(SemanticsRules.Check(c3, Edited(c3, 'at-risk-list', { Label: 'Bronzed' })).Status).toBe('failed');
  });
  it('reads a class whose name contains another class as that class only', () => {
    const s: OutputSemantics = { task: { kind: 'multiclass', classOrder: ['Show', 'No Show', 'Cancelled'], adverseIndices: [1] } };
    expect(SemanticsRules.Check(s, Edited(s, 'at-risk-list', { Label: 'No Show risk' }))).toEqual({ Status: 'passed' });
    expect(SemanticsRules.Check(s, Edited(s, 'at-risk-list', { Label: 'Show risk' })).Status).toBe('failed');
  });
  it('sorts a regression kind as its adverse direction says (none for every shipped regression kind) and accepts any non-blank label', () => {
    const count: OutputSemantics = { task: tasks.count };
    expect(SemanticsRules.Check(count, Edited(count, 'predictions-grid', { SortsBy: 'score-desc' }))).toEqual({
      Status: 'failed', Mismatches: ['predictions-grid: SortsBy is score-desc, the semantics require none'],
    });
    expect(SemanticsRules.Check(count, Edited(count, 'why-badge', { DriverDirectionRelativeTo: 'adverse-class' })).Status).toBe('failed');
    expect(SemanticsRules.Check(count, Edited(count, 'record-panel', { Label: 'Predicted visits' }))).toEqual({ Status: 'passed' });
    expect(SemanticsRules.Check(count, Edited(count, 'record-panel', { Label: '  ' }))).toEqual({
      Status: 'failed', Mismatches: ['record-panel: Label is "  ", the semantics require a non-blank label'],
    });
  });
  it('passes the defaults of a no-adverse multiclass model and refuses an adverse-probability sort or an adverse-class direction on it', () => {
    expect(SemanticsRules.Check(noAdverse, SemanticsRules.DefaultBindings(noAdverse))).toEqual({ Status: 'passed' });
    expect(SemanticsRules.Check(noAdverse, Edited(noAdverse, 'at-risk-list', { SortsBy: 'adverse-probability-desc' }))).toEqual({
      Status: 'failed', Mismatches: ['at-risk-list: SortsBy is adverse-probability-desc, the semantics require none'],
    });
    expect(SemanticsRules.Check(noAdverse, Edited(noAdverse, 'why-badge', { DriverDirectionRelativeTo: 'adverse-class' }))).toEqual({
      Status: 'failed', Mismatches: ['why-badge: DriverDirectionRelativeTo is adverse-class, the semantics require raw-contribution'],
    });
    expect(SemanticsRules.Check(noAdverse, Edited(noAdverse, 'record-panel', { Label: 'Gold risk' }))).toEqual({
      Status: 'failed', Mismatches: ['record-panel: Label is "Gold risk", the semantics require a label naming no class'],
    });
  });
  it('fails on a missing and on a duplicated surface, naming it', () => {
    const rows = SemanticsRules.DefaultBindings(c3);
    expect(SemanticsRules.Check(c3, rows.filter((b) => b.Surface !== 'why-badge'))).toEqual({ Status: 'failed', Mismatches: ['why-badge: no binding row, the semantics require one'] });
    expect(SemanticsRules.Check(c3, [...rows, rows[3]])).toEqual({ Status: 'failed', Mismatches: ['record-panel: 2 binding rows, the semantics require one'] });
    expect(SemanticsRules.Check(c3, [])).toMatchObject({ Status: 'failed', Mismatches: BINDING_SURFACES.map((s) => `${s}: no binding row, the semantics require one`) });
  });
});

describe('SemanticsRules.CheckRow', () => {
  it("checks one surface's row alone, each mismatch naming its field", () => {
    const row = SemanticsRules.DefaultBindings(c3)[0];
    expect(SemanticsRules.CheckRow(c3, row)).toEqual([]);
    expect(SemanticsRules.CheckRow(c3, { ...row, SortsBy: 'score-asc', Label: 'Gold risk' })).toEqual([
      { Surface: 'at-risk-list', Field: 'SortsBy', Message: 'at-risk-list: SortsBy is score-asc, the semantics require adverse-probability-desc' },
      { Surface: 'at-risk-list', Field: 'Label', Message: 'at-risk-list: Label is "Gold risk", the semantics require a label naming Bronze and no other class' },
    ]);
  });
});
