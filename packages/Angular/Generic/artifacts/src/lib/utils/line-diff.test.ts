import { describe, it, expect } from 'vitest';
import { ComputeLineDiff, ComputeBoundedSequenceDiff } from './line-diff';

/**
 * Exact O(N * M) dynamic-programming LCS length used as a reference oracle for small arrays.
 */
function exactDpLcsLength(a: readonly string[], b: readonly string[]): number {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[n][m];
}

describe('line-diff — Myers d=0 base case, exact LCS equivalence, JSON cell diff & 20k-line bound (Blocker 7)', () => {
  it('handles ["a"] vs ["b"] -> 1 delete + 1 insert (edit distance 2)', () => {
    const res = ComputeLineDiff(['a'], ['b']);
    expect(res.RemovedLines).toBe(1);
    expect(res.AddedLines).toBe(1);
    expect(res.UnchangedLines).toBe(0);
    expect(res.RemovedLines + res.AddedLines).toBe(2);
    expect(res.Lines.map((l) => `${l.Type}:${l.Content}`)).toEqual(['removed:a', 'added:b']);
  });

  it('handles ["a", "b"] vs ["b"] -> 1 delete + 1 equal (edit distance 1)', () => {
    const res = ComputeLineDiff(['a', 'b'], ['b']);
    expect(res.RemovedLines).toBe(1);
    expect(res.AddedLines).toBe(0);
    expect(res.UnchangedLines).toBe(1);
    expect(res.RemovedLines + res.AddedLines).toBe(1);
    expect(res.Lines.map((l) => `${l.Type}:${l.Content}`)).toEqual(['removed:a', 'same:b']);
  });

  it('matches exact dynamic-programming LCS edit counts across 500 random small arrays (length <= 30)', () => {
    // Deterministic PRNG (Mulberry32) so the 500 random trials are 100% reproducible
    let seed = 0x58445246;
    const nextRand = (): number => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const alphabet = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', '', '{', '}'];

    for (let trial = 0; trial < 500; trial++) {
      const lenA = Math.floor(nextRand() * 31);
      const lenB = Math.floor(nextRand() * 31);
      const a = Array.from({ length: lenA }, () => alphabet[Math.floor(nextRand() * alphabet.length)]);
      const b = Array.from({ length: lenB }, () => alphabet[Math.floor(nextRand() * alphabet.length)]);

      const ops = ComputeBoundedSequenceDiff(
        a,
        b,
        (x, y) => x === y,
        (s) => s,
      );

      let deletions = 0;
      let insertions = 0;
      let equals = 0;
      const reconstructedA: string[] = [];
      const reconstructedB: string[] = [];

      for (const op of ops) {
        if (op.Kind === 'equal') {
          equals++;
          expect(a[op.OldIndex]).toBe(b[op.NewIndex]);
          reconstructedA.push(a[op.OldIndex]);
          reconstructedB.push(b[op.NewIndex]);
        } else if (op.Kind === 'delete') {
          deletions++;
          reconstructedA.push(a[op.OldIndex]);
        } else {
          insertions++;
          reconstructedB.push(b[op.NewIndex]);
        }
      }

      expect(reconstructedA).toEqual(a);
      expect(reconstructedB).toEqual(b);

      const expectedLcs = exactDpLcsLength(a, b);
      const expectedEditDistance = lenA + lenB - 2 * expectedLcs;
      expect(equals).toBe(expectedLcs);
      expect(deletions + insertions).toBe(expectedEditDistance);
    }
  });

  it('produces exactly 4 changed lines (2 deletions + 2 insertions) on a 50-row pretty-printed workbook JSON where 2 cell values change', () => {
    const buildWorkbookJson = (row10Val: number, row40Val: number): string => {
      const rows = Array.from({ length: 50 }, (_, idx) => ({
        rowIndex: idx + 1,
        address: `A${idx + 1}`,
        value: idx + 1 === 10 ? row10Val : idx + 1 === 40 ? row40Val : (idx + 1) * 100,
        format: 'currency',
      }));
      return JSON.stringify({ workbookId: 'wb-1', sheetName: 'Revenue', rows }, null, 2);
    };

    const baseJson = buildWorkbookJson(1000, 4000);
    const targetJson = buildWorkbookJson(1250, 4999);

    const diff = ComputeLineDiff(baseJson, targetJson);
    expect(diff.RemovedLines).toBe(2);
    expect(diff.AddedLines).toBe(2);
    expect(diff.RemovedLines + diff.AddedLines).toBe(4);
  });

  it('diffs a 20,000-line input where first, middle, and last lines change (no common prefix/suffix bypass) in < 50ms', () => {
    const baseLines = Array.from({ length: 20000 }, (_, i) => `line-${i}: payload-${i}`);
    const targetLines = [...baseLines];
    // Mutate first and last lines so common prefix/suffix trimming is 0 lines
    targetLines[0] = 'line-0: mutated-start';
    targetLines[10000] = 'line-10000: mutated-middle-A';
    targetLines[10001] = 'line-10001: mutated-middle-B';
    targetLines[19999] = 'line-19999: mutated-end';

    const startMs = performance.now();
    const diff = ComputeLineDiff(baseLines, targetLines);
    const elapsedMs = performance.now() - startMs;

    expect(elapsedMs).toBeLessThan(50);
    expect(diff.RemovedLines).toBe(4);
    expect(diff.AddedLines).toBe(4);
    expect(diff.UnchangedLines).toBe(19996);
  });
});
