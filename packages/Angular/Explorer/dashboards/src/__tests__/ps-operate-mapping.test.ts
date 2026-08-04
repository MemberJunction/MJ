import { describe, it, expect } from 'vitest';
import {
  OperateModelState,
  mapStateToCreateScoringInput,
  describeOperateMappingError,
} from '../PredictiveStudio/components/ps-operate-dialog.mapping';

/** A valid baseline state — tests override individual knobs. */
function baseState(overrides: Partial<OperateModelState> = {}): OperateModelState {
  return {
    modelId: 'model-1',
    targetEntityName: 'Memberships',
    scopeMode: 'all',
    viewId: null,
    listId: null,
    outputMode: 'generic',
    outputField: '',
    valueKind: 'score',
    ...overrides,
  };
}

describe('mapStateToCreateScoringInput', () => {
  describe('scope', () => {
    it('maps "all" to { all: true }', () => {
      const r = mapStateToCreateScoringInput(baseState({ scopeMode: 'all' }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.input.scope).toEqual({ all: true });
    });

    it('maps "view" to { viewId }', () => {
      const r = mapStateToCreateScoringInput(baseState({ scopeMode: 'view', viewId: 'v-1' }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.input.scope).toEqual({ viewId: 'v-1' });
    });

    it('maps "list" to { listId }', () => {
      const r = mapStateToCreateScoringInput(baseState({ scopeMode: 'list', listId: 'l-1' }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.input.scope).toEqual({ listId: 'l-1' });
    });

    it('errors when view mode has no view selected', () => {
      const r = mapStateToCreateScoringInput(baseState({ scopeMode: 'view', viewId: null }));
      expect(r).toEqual({ ok: false, error: 'missing-view' });
    });

    it('errors when list mode has no list selected', () => {
      const r = mapStateToCreateScoringInput(baseState({ scopeMode: 'list', listId: '  ' }));
      expect(r).toEqual({ ok: false, error: 'missing-list' });
    });
  });

  describe('output', () => {
    it('generic mode omits outputField + valueKind entirely', () => {
      const r = mapStateToCreateScoringInput(baseState({ outputMode: 'generic', outputField: 'IgnoredCol' }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.input.outputField).toBeUndefined();
        expect(r.input.valueKind).toBeUndefined();
      }
    });

    it('write-back mode sets outputField + valueKind', () => {
      const r = mapStateToCreateScoringInput(
        baseState({ outputMode: 'writeback', outputField: 'RenewalProbability', valueKind: 'class' }),
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.input.outputField).toBe('RenewalProbability');
        expect(r.input.valueKind).toBe('class');
      }
    });

    it('write-back trims the column name', () => {
      const r = mapStateToCreateScoringInput(baseState({ outputMode: 'writeback', outputField: '  Score  ' }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.input.outputField).toBe('Score');
    });

    it('errors when write-back has no column', () => {
      const r = mapStateToCreateScoringInput(baseState({ outputMode: 'writeback', outputField: '' }));
      expect(r).toEqual({ ok: false, error: 'missing-output-field' });
    });
  });

  describe('required fields', () => {
    it('errors when modelId is blank', () => {
      const r = mapStateToCreateScoringInput(baseState({ modelId: '' }));
      expect(r).toEqual({ ok: false, error: 'missing-model' });
    });

    it('errors when targetEntityName is blank', () => {
      const r = mapStateToCreateScoringInput(baseState({ targetEntityName: '   ' }));
      expect(r).toEqual({ ok: false, error: 'missing-target-entity' });
    });
  });

  it('every error has a user-facing message', () => {
    const errors = ['missing-model', 'missing-target-entity', 'missing-view', 'missing-list', 'missing-output-field'] as const;
    for (const e of errors) {
      expect(describeOperateMappingError(e).length).toBeGreaterThan(0);
    }
  });
});
