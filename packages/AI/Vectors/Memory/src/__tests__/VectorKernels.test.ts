import { describe, it, expect } from 'vitest';
import {
  CosineFromNorms,
  DistanceMetric,
  MergeScoredRows,
  MetricScore,
  SearchRows,
  SumOfSquares,
  VectorRowsView,
} from '../models/VectorKernels';

/** Packs rows into a float64 view the way VectorStore lays them out. */
function viewOf(rows: number[][], live?: number[]): VectorRowsView {
  const dims = rows[0].length;
  const data = new Float64Array(rows.length * dims);
  const norms = new Float64Array(rows.length);
  rows.forEach((r, i) => {
    data.set(r, i * dims);
    norms[i] = SumOfSquares(r, 0, dims);
  });
  return {
    Data: data,
    Norms: norms,
    Live: Uint8Array.from(live ?? rows.map(() => 1)),
    RowCount: rows.length,
    Dims: dims,
  };
}

function search(view: VectorRowsView, query: number[], metric: DistanceMetric, topK: number | null, threshold: number | null = null, candidates: number[] | null = null) {
  const q = Float64Array.from(query);
  return SearchRows(view, {
    Query: q,
    QueryNormSq: SumOfSquares(q, 0, q.length),
    Candidates: candidates ? Int32Array.from(candidates) : null,
    Metric: metric,
    TopK: topK,
    Threshold: threshold,
  });
}

describe('VectorKernels', () => {
  describe('MetricScore', () => {
    const a = [1, 2, 0];
    const b = [2, 4, 0];
    const score = (m: DistanceMetric, x: number[], y: number[]) =>
      MetricScore(m, x, 0, SumOfSquares(x, 0, x.length), y, 0, SumOfSquares(y, 0, y.length), x.length);

    it('maps cosine from [-1, 1] onto [0, 1]', () => {
      expect(score('cosine', a, b)).toBeCloseTo(1, 12);
      expect(score('cosine', [1, 0], [-1, 0])).toBe(0);
      expect(score('cosine', [1, 0], [0, 1])).toBe(0.5);
    });

    it('treats a zero vector as orthogonal under cosine', () => {
      expect(CosineFromNorms([0, 0], 0, 0, [1, 1], 0, 2, 2)).toBe(0);
    });

    it('computes the distance-based metrics as 1 / (1 + distance)', () => {
      expect(score('euclidean', [0, 0], [3, 4])).toBe(1 / 6);
      expect(score('manhattan', [0, 0], [3, 4])).toBe(1 / 8);
    });

    it('squashes the dot product with tanh', () => {
      expect(score('dotproduct', [1, 1], [1, 1])).toBe((Math.tanh(2 / Math.sqrt(2)) + 1) / 2);
    });

    it('treats non-zero elements as set members for jaccard, and two empty sets as identical', () => {
      expect(score('jaccard', [1, 0, 1, 0], [1, 1, 0, 0])).toBe(1 / 3);
      expect(score('jaccard', [0, 0], [0, 0])).toBe(1);
    });

    it('counts differing positions for hamming', () => {
      expect(score('hamming', [1, 2, 3, 4], [1, 0, 3, 0])).toBe(0.5);
    });

    it('reads rows at an offset', () => {
      const packed = [9, 9, 1, 2, 0];
      expect(MetricScore('euclidean', packed, 2, 0, a, 0, 0, 3)).toBe(1);
    });

    it('throws for an unknown metric', () => {
      expect(() => score('nope' as DistanceMetric, a, b)).toThrow(/Unknown distance metric/);
    });
  });

  describe('SearchRows', () => {
    const view = viewOf([
      [1, 0],   // 0
      [0, 1],   // 1
      [1, 0],   // 2 — ties row 0
      [0.9, 0.1], // 3
      [-1, 0],  // 4
    ]);

    it('returns the top K highest first, breaking ties by ascending row', () => {
      const result = search(view, [1, 0], 'cosine', 3);
      expect(Array.from(result.Rows)).toEqual([0, 2, 3]);
      expect(result.Scores[0]).toBe(1);
      expect(result.Scores[1]).toBe(1);
    });

    it('keeps the earliest of tied rows at the K boundary', () => {
      expect(Array.from(search(view, [1, 0], 'cosine', 1).Rows)).toEqual([0]);
    });

    it('returns every passing row, fully sorted, when TopK is null', () => {
      const result = search(view, [1, 0], 'cosine', null, 0.5);
      expect(Array.from(result.Rows)).toEqual([0, 2, 3, 1]);
    });

    it('applies the threshold inclusively', () => {
      expect(Array.from(search(view, [1, 0], 'cosine', null, 1).Rows)).toEqual([0, 2]);
    });

    it('scores only the candidate rows', () => {
      expect(Array.from(search(view, [1, 0], 'cosine', 10, null, [1, 3, 4]).Rows)).toEqual([3, 1, 4]);
    });

    it('skips tombstoned rows', () => {
      const withDead = viewOf([[1, 0], [1, 0], [0, 1]], [1, 0, 1]);
      expect(Array.from(search(withDead, [1, 0], 'cosine', null).Rows)).toEqual([0, 2]);
    });

    it('never returns NaN scores', () => {
      const withNaN = viewOf([[NaN, 0], [1, 0]]);
      expect(Array.from(search(withNaN, [1, 0], 'euclidean', null).Rows)).toEqual([1]);
    });

    it('returns nothing for TopK of zero', () => {
      expect(search(view, [1, 0], 'cosine', 0).Rows.length).toBe(0);
    });
  });

  describe('MergeScoredRows', () => {
    it('merges partitions into the same ranking a single scan gives', () => {
      const whole = search(view5(), [1, 0], 'cosine', 3);
      const partA = search(view5(), [1, 0], 'cosine', 3, null, [0, 1]);
      const partB = search(view5(), [1, 0], 'cosine', 3, null, [2, 3, 4]);
      const merged = MergeScoredRows([partB, partA], 3);
      expect(Array.from(merged.Rows)).toEqual(Array.from(whole.Rows));
      expect(Array.from(merged.Scores)).toEqual(Array.from(whole.Scores));
    });
  });
});

function view5(): VectorRowsView {
  return viewOf([[1, 0], [0, 1], [1, 0], [0.9, 0.1], [-1, 0]]);
}

describe('SearchRows precision specialisations', () => {
  it('scores float32 and float64 data identically to MetricScore, zero vectors included', () => {
    const rows = [[0, 0, 0], [1, 2, 3], [-1, 0.5, 2], [3, 3, 3]];
    const query = Float64Array.from([0.5, -1, 2]);
    for (const metric of ['cosine', 'euclidean', 'manhattan', 'dotproduct', 'jaccard', 'hamming'] as DistanceMetric[]) {
      for (const ArrayType of [Float32Array, Float64Array]) {
        const base = viewOf(rows);
        const data = ArrayType.from(base.Data);
        const norms = Float64Array.from(rows, (_, i) => SumOfSquares(data, i * 3, 3));
        const view: VectorRowsView = { ...base, Data: data, Norms: norms };
        const result = SearchRows(view, { Query: query, QueryNormSq: SumOfSquares(query, 0, 3), Candidates: null, Metric: metric, TopK: null, Threshold: null });
        for (let i = 0; i < result.Rows.length; i++) {
          const row = result.Rows[i];
          expect(result.Scores[i]).toBe(MetricScore(metric, query, 0, SumOfSquares(query, 0, 3), data, row * 3, norms[row], 3));
        }
        expect(result.Rows.length).toBe(rows.length);
      }
    }
  });
});

describe('SearchRows edge cases', () => {
  it('throws for an unknown metric', () => {
    expect(() => search(viewOf([[1, 0]]), [1, 0], 'nope' as DistanceMetric, 1)).toThrow(/Unknown distance metric: nope/);
  });

  it('drops NaN scores and rows below the threshold on float32 data, as on float64', () => {
    const rows = [[1, 0], [Number.NaN, 0], [0, 1], [0.9, 0.1]];
    for (const ArrayType of [Float32Array, Float64Array]) {
      const base = viewOf(rows);
      const data = ArrayType.from(base.Data);
      const view: VectorRowsView = { ...base, Data: data, Norms: Float64Array.from(rows, (_, i) => SumOfSquares(data, i * 2, 2)) };
      for (const metric of ['cosine', 'euclidean', 'dotproduct', 'manhattan'] as DistanceMetric[]) {
        const all = search(view, [1, 0], metric, null);
        expect(Array.from(all.Rows)).not.toContain(1); // the NaN row never scores
        const threshold = all.Scores[1]; // keep exactly the two best rows
        const kept = search(view, [1, 0], metric, null, threshold);
        expect(Array.from(kept.Rows)).toEqual(Array.from(all.Rows.slice(0, 2)));
      }
    }
  });

  it('skips dead rows named in the candidate list, at both precisions', () => {
    for (const ArrayType of [Float32Array, Float64Array]) {
      const base = viewOf([[1, 0], [1, 0], [0, 1]], [1, 0, 1]);
      const view: VectorRowsView = { ...base, Data: ArrayType.from(base.Data) };
      expect(Array.from(search(view, [1, 0], 'euclidean', null, null, [1, 2]).Rows)).toEqual([2]);
    }
  });

  it('scans only from RowStart, and clamps RowEnd to the row count, at both precisions', () => {
    for (const ArrayType of [Float32Array, Float64Array]) {
      const base = viewOf([[1, 0], [0, 1], [1, 1]]);
      const view: VectorRowsView = { ...base, Data: ArrayType.from(base.Data) };
      const result = SearchRows(view, {
        Query: Float64Array.from([1, 0]), QueryNormSq: 1, Candidates: null, Metric: 'cosine', TopK: null, Threshold: null, RowStart: 1, RowEnd: 99,
      });
      expect(Array.from(result.Rows)).toEqual([2, 1]);
      const fromStart = SearchRows(view, {
        Query: Float64Array.from([1, 0]), QueryNormSq: 1, Candidates: null, Metric: 'cosine', TopK: 1, Threshold: null, RowEnd: 2,
      });
      expect(Array.from(fromStart.Rows)).toEqual([0]);
    }
  });
});

describe('MergeScoredRows', () => {
  it('keeps every row, highest score first and ties by ascending row, when topK is null', () => {
    const merged = MergeScoredRows([
      { Rows: Int32Array.from([4, 1]), Scores: Float64Array.from([0.9, 0.5]) },
      { Rows: Int32Array.from([2, 0]), Scores: Float64Array.from([0.9, 0.1]) },
    ], null);
    expect(Array.from(merged.Rows)).toEqual([2, 4, 1, 0]);
    expect(Array.from(merged.Scores)).toEqual([0.9, 0.9, 0.5, 0.1]);
  });

  it('returns nothing for no parts', () => {
    expect(MergeScoredRows([], 5).Rows.length).toBe(0);
  });
});
