import { describe, it, expect } from 'vitest';
import {
  OperateModelState,
  MapStateToCreateScoringInput,
  DescribeOperateMappingError,
} from '../PredictiveStudio/components/ps-operate-dialog.mapping';

/** A valid baseline state — tests override individual knobs. */
function baseState(overrides: Partial<OperateModelState> = {}): OperateModelState {
  return {
    ModelId: 'model-1',
    TargetEntityName: 'Memberships',
    ScopeMode: 'all',
    ViewId: null,
    ListId: null,
    OutputMode: 'generic',
    OutputField: '',
    ValueKind: 'score',
    ...overrides,
  };
}

describe('mapStateToCreateScoringInput', () => {
  describe('scope', () => {
    it('maps "all" to { all: true }', () => {
      const r = MapStateToCreateScoringInput(baseState({ ScopeMode: 'all' }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.input.scope).toEqual({ all: true });
    });

    it('maps "view" to { viewId }', () => {
      const r = MapStateToCreateScoringInput(baseState({ ScopeMode: 'view', ViewId: 'v-1' }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.input.scope).toEqual({ viewId: 'v-1' });
    });

    it('maps "list" to { listId }', () => {
      const r = MapStateToCreateScoringInput(baseState({ ScopeMode: 'list', ListId: 'l-1' }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.input.scope).toEqual({ listId: 'l-1' });
    });

    it('errors when view mode has no view selected', () => {
      const r = MapStateToCreateScoringInput(baseState({ ScopeMode: 'view', ViewId: null }));
      expect(r).toEqual({ ok: false, error: 'missing-view' });
    });

    it('errors when list mode has no list selected', () => {
      const r = MapStateToCreateScoringInput(baseState({ ScopeMode: 'list', ListId: '  ' }));
      expect(r).toEqual({ ok: false, error: 'missing-list' });
    });
  });

  describe('output', () => {
    it('generic mode omits outputField + valueKind entirely', () => {
      const r = MapStateToCreateScoringInput(baseState({ OutputMode: 'generic', OutputField: 'IgnoredCol' }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.input.outputField).toBeUndefined();
        expect(r.input.valueKind).toBeUndefined();
      }
    });

    it('write-back mode sets outputField + valueKind', () => {
      const r = MapStateToCreateScoringInput(
        baseState({ OutputMode: 'writeback', OutputField: 'RenewalProbability', ValueKind: 'class' }),
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.input.outputField).toBe('RenewalProbability');
        expect(r.input.valueKind).toBe('class');
      }
    });

    it('write-back trims the column name', () => {
      const r = MapStateToCreateScoringInput(baseState({ OutputMode: 'writeback', OutputField: '  Score  ' }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.input.outputField).toBe('Score');
    });

    it('errors when write-back has no column', () => {
      const r = MapStateToCreateScoringInput(baseState({ OutputMode: 'writeback', OutputField: '' }));
      expect(r).toEqual({ ok: false, error: 'missing-output-field' });
    });
  });

  describe('required fields', () => {
    it('errors when modelId is blank', () => {
      const r = MapStateToCreateScoringInput(baseState({ ModelId: '' }));
      expect(r).toEqual({ ok: false, error: 'missing-model' });
    });

    it('errors when targetEntityName is blank', () => {
      const r = MapStateToCreateScoringInput(baseState({ TargetEntityName: '   ' }));
      expect(r).toEqual({ ok: false, error: 'missing-target-entity' });
    });
  });

  it('every error has a user-facing message', () => {
    const errors = ['missing-model', 'missing-target-entity', 'missing-view', 'missing-list', 'missing-output-field'] as const;
    for (const e of errors) {
      expect(DescribeOperateMappingError(e).length).toBeGreaterThan(0);
    }
  });
});
