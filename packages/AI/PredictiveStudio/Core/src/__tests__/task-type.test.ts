import { describe, it, expect } from 'vitest';
import { TaskTypeRules, type TaskType } from '../task-type';
import { JsonParse, type JsonValue } from '../json-value';

function parsed(text: string): JsonValue {
  const r = JsonParse.ParseJsonText(text, 'TaskType');
  if (!r.Ok) throw new Error(r.Errors.join('; '));
  return r.Value;
}

describe('ParseTaskType', () => {
  it('parses a binary task with its class order and adverse index', () => {
    const r = TaskTypeRules.ParseTaskType(parsed('{"kind":"binary","classOrder":["0","1"],"adverseIndex":0}'));
    expect(r).toEqual({ Ok: true, Value: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 } });
  });
  it('refuses a binary task with one class label or a bad adverse index', () => {
    const r = TaskTypeRules.ParseTaskType(parsed('{"kind":"binary","classOrder":["1"],"adverseIndex":2}'));
    expect(r.Ok).toBe(false);
    if (!r.Ok) {
      expect(r.Errors).toContain('binary classOrder must list exactly two class labels, in artifact order');
      expect(r.Errors).toContain('binary adverseIndex must be 0 or 1');
    }
  });
  it('refuses a multiclass task with fewer than three classes or an adverse index out of range', () => {
    const r = TaskTypeRules.ParseTaskType(parsed('{"kind":"multiclass","classOrder":["a","b"],"adverseIndices":[5]}'));
    expect(r.Ok).toBe(false);
  });
  it('parses count, continuous, non-negative and forecast kinds', () => {
    expect(TaskTypeRules.ParseTaskType(parsed('{"kind":"count"}'))).toEqual({ Ok: true, Value: { kind: 'count' } });
    expect(TaskTypeRules.ParseTaskType(parsed('{"kind":"continuous"}'))).toEqual({ Ok: true, Value: { kind: 'continuous' } });
    expect(TaskTypeRules.ParseTaskType(parsed('{"kind":"non-negative","tweediePower":1.5}'))).toEqual({ Ok: true, Value: { kind: 'non-negative', tweediePower: 1.5 } });
    expect(TaskTypeRules.ParseTaskType(parsed('{"kind":"forecast","valueKind":"count"}'))).toEqual({ Ok: true, Value: { kind: 'forecast', valueKind: 'count' } });
  });
  it('refuses a Tweedie power outside (1, 2) and an unknown kind', () => {
    expect(TaskTypeRules.ParseTaskType(parsed('{"kind":"non-negative","tweediePower":2}')).Ok).toBe(false);
    expect(TaskTypeRules.ParseTaskType(parsed('{"kind":"classification"}')).Ok).toBe(false);
  });
});

describe('ScoreSemantics', () => {
  it('derives the scored class and the adverse direction from the binary class order', () => {
    const renewal: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 };
    expect(TaskTypeRules.ScoreSemantics(renewal)).toEqual({ ScoreRefersTo: '1', AdverseDirection: 'lower-score-is-adverse' });
    const churn: TaskType = { kind: 'binary', classOrder: ['stayed', 'churned'], adverseIndex: 1 };
    expect(TaskTypeRules.ScoreSemantics(churn)).toEqual({ ScoreRefersTo: 'churned', AdverseDirection: 'higher-score-is-adverse' });
  });
  it('has no scored class for multiclass and numeric tasks', () => {
    expect(TaskTypeRules.ScoreSemantics({ kind: 'count' })).toEqual({ ScoreRefersTo: null, AdverseDirection: 'not-applicable' });
  });
});

describe('LegacyProblemTypeForTask', () => {
  it('maps classification kinds to classification and every other kind to regression', () => {
    expect(TaskTypeRules.LegacyProblemTypeForTask({ kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 })).toBe('classification');
    expect(TaskTypeRules.LegacyProblemTypeForTask({ kind: 'multiclass', classOrder: ['a', 'b', 'c'], adverseIndices: [2] })).toBe('classification');
    expect(TaskTypeRules.LegacyProblemTypeForTask({ kind: 'non-negative', tweediePower: 1.5 })).toBe('regression');
  });
});
