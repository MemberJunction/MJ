import { describe, it, expect, vi } from 'vitest';
import { VectorStore } from '../models/VectorStore';

describe('VectorStore', () => {
  it('appends new keys and overwrites existing keys in place', () => {
    const store = new VectorStore<string>();
    store.Write('a', [1, 2]);
    store.Write('b', [3, 4]);
    const row = store.Write('a', [5, 6]);
    expect(row).toBe(0);
    expect(store.Size).toBe(2);
    expect(store.ReadRow(0)).toEqual([5, 6]);
    expect(Array.from(store.LiveRows(), r => store.KeyAt(r))).toEqual(['a', 'b']);
  });

  it('caches each row\'s sum of squares from the stored values', () => {
    const store = new VectorStore<string>();
    store.Write('a', [3, 4]);
    expect(store.NormAt(0)).toBe(25);
  });

  it('re-adding a removed key appends it, matching Map insertion order', () => {
    const store = new VectorStore<string>();
    store.Write('a', [1]);
    store.Write('b', [2]);
    store.Remove('a');
    store.Write('a', [3]);
    expect(Array.from(store.LiveRows(), r => store.KeyAt(r))).toEqual(['b', 'a']);
  });

  it('rounds values to float32 at float32 precision, and converts queries the same way', () => {
    const store = new VectorStore<string>('float32');
    store.Write('a', [0.1]);
    expect(store.ReadRow(0)[0]).toBe(Math.fround(0.1));
    expect(store.ToStorePrecision([0.1])[0]).toBe(Math.fround(0.1));
  });

  it('allocates through the supplied allocator (e.g. shared memory)', () => {
    const allocate = vi.fn((bytes: number) => new SharedArrayBuffer(bytes));
    const store = new VectorStore<string>('float32', allocate);
    store.Write('a', [1, 2, 3]);
    expect(allocate).toHaveBeenCalled();
    expect(store.IsShared).toBe(true);
  });

  it('tracks zero-norm rows through writes and removals', () => {
    const store = new VectorStore<string>();
    store.Write('z', [0, 0]);
    expect(store.ZeroNormRows).toBe(1);
    store.Write('z', [1, 0]);
    expect(store.ZeroNormRows).toBe(0);
    store.Write('y', [0, 0]);
    store.Remove('y');
    expect(store.ZeroNormRows).toBe(0);
  });

  describe('compaction', () => {
    function fill(store: VectorStore<number>, n: number): void {
      for (let i = 0; i < n; i++) {
        store.Write(`k${i}`, [i, i + 1]);
        store.SetMetadata(store.RowOf(`k${i}`)!, i);
      }
    }

    it('reclaims tombstones in order and keeps keys, values and metadata together', () => {
      const store = new VectorStore<number>();
      fill(store, 200);
      const generation = store.Generation;
      for (let i = 0; i < 200; i += 2) store.Remove(`k${i}`);
      expect(store.Generation).toBeGreaterThan(generation);
      expect(store.RowCount).toBeLessThan(200);
      const keys = Array.from(store.LiveRows(), r => store.KeyAt(r));
      expect(keys).toEqual(Array.from({ length: 100 }, (_, j) => `k${2 * j + 1}`));
      const row = store.RowOf('k51')!;
      expect(store.ReadRow(row)).toEqual([51, 52]);
      expect(store.MetadataAt(row)).toBe(51);
    });

    it('leaves a previously captured key array valid for the rows it saw', () => {
      const store = new VectorStore<number>();
      fill(store, 200);
      const captured = store.Keys;
      const rowOfK7 = store.RowOf('k7')!;
      for (let i = 100; i < 200; i++) store.Remove(`k${i}`);
      expect(captured[rowOfK7]).toBe('k7');
      expect(store.Keys).not.toBe(captured);
    });
  });

  it('keeps the dimension count across Clear', () => {
    const store = new VectorStore<string>();
    store.Write('a', [1, 2, 3]);
    store.Clear();
    expect(store.Size).toBe(0);
    expect(store.Dims).toBe(3);
  });

  describe('Adopt', () => {
    it('wraps a view read-only, keyed by row, limited to the candidate rows', () => {
      const source = new VectorStore<string>();
      source.Write('a', [1, 0]);
      source.Write('b', [0, 1]);
      source.Write('c', [1, 1]);
      const adopted = VectorStore.Adopt<string>(source.View(), 'float64', Int32Array.from([0, 2]));
      expect(adopted.Size).toBe(2);
      expect(Array.from(adopted.LiveRows(), r => adopted.KeyAt(r))).toEqual(['0', '2']);
      expect(() => adopted.Write('x', [1, 1])).toThrow(/read-only/);
      // The source's live mask is never modified by the adoption.
      expect(source.IsLive(1)).toBe(true);
    });
  });
});
