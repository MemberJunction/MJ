import { describe, it, expect } from 'vitest';
import {
  emptyReuseMessage,
  splitQualifiedName,
  toReuseMatch,
  toReuseMatches,
} from '../component-reuse.view-models';

describe('splitQualifiedName', () => {
  it('separates the part from the model that built it', () => {
    expect(splitQualifiedName('Renewal Model v1 › acts_90d__present')).toEqual({
      name: 'acts_90d__present',
      fromModel: 'Renewal Model v1',
    });
  });

  it('uses the LAST separator, so a model whose own name contains one still resolves', () => {
    expect(splitQualifiedName('A › B › the_part')).toEqual({ name: 'the_part', fromModel: 'A › B' });
  });

  it('treats an unqualified name as the part itself', () => {
    expect(splitQualifiedName('Standalone Component')).toEqual({
      name: 'Standalone Component',
      fromModel: null,
    });
  });
});

describe('toReuseMatch', () => {
  const base = {
    ID: 'c1',
    Name: 'Renewal v1 › acts_90d',
    ComponentTypeName: 'As-Of Count',
    Story: '  How often a member acted.  ',
    Similarity: 0.7421,
    PromotionState: 'Approved',
  };

  it('projects a match with its part name, provenance and type', () => {
    const vm = toReuseMatch(base)!;
    expect(vm.name).toBe('acts_90d');
    expect(vm.fromModel).toBe('Renewal v1');
    expect(vm.typeName).toBe('As-Of Count');
    expect(vm.story).toBe('How often a member acted.');
    expect(vm.matchPercent).toBe(74);
  });

  it('falls back to ComponentType when the resolved name is absent', () => {
    const vm = toReuseMatch({ ...base, ComponentTypeName: undefined, ComponentType: 'Forecast' })!;
    expect(vm.typeName).toBe('Forecast');
  });

  it('clamps an out-of-range similarity rather than drawing a bar past its track', () => {
    expect(toReuseMatch({ ...base, Similarity: 1.8 })!.matchPercent).toBe(100);
    expect(toReuseMatch({ ...base, Similarity: -0.4 })!.matchPercent).toBe(0);
  });

  it('reports no similarity rather than inventing one when the action omits it', () => {
    const vm = toReuseMatch({ ...base, Similarity: undefined })!;
    expect(vm.similarity).toBeNull();
    expect(vm.matchPercent).toBe(0);
  });

  it('drops a match with no usable identity', () => {
    expect(toReuseMatch({ ...base, ID: undefined })).toBeNull();
    expect(toReuseMatch({ ...base, Name: '   ' })).toBeNull();
  });
});

describe('toReuseMatches', () => {
  it('preserves the server ranking rather than re-sorting a truncated top-K', () => {
    // The server ranked over every candidate; re-sorting the visible few would quietly disagree.
    const out = toReuseMatches([
      { ID: 'a', Name: 'M › low', Similarity: 0.2 },
      { ID: 'b', Name: 'M › high', Similarity: 0.9 },
    ]);
    expect(out.map((m) => m.name)).toEqual(['low', 'high']);
  });

  it('skips unusable rows without losing the rest', () => {
    const out = toReuseMatches([{ ID: 'a', Name: 'M › keep' }, { Name: 'no id' }]);
    expect(out.map((m) => m.name)).toEqual(['keep']);
  });

  it('handles a null result set', () => {
    expect(toReuseMatches(null)).toEqual([]);
  });
});

describe('emptyReuseMessage', () => {
  it('distinguishes "nothing close enough" from "nothing to search"', () => {
    // Opposite responses: reword the query, versus go publish a model first.
    expect(emptyReuseMessage(42)).toContain('42 components');
    expect(emptyReuseMessage(0)).toContain('story vector');
  });

  it('does not say "1 components"', () => {
    expect(emptyReuseMessage(1)).toContain('1 component with a story');
  });
});
