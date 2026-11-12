/**
 * Bounded Myers O((M+N)D) sequence & line diff utility with common prefix/suffix trimming
 * and linear Patience-style unique-hash-anchor fallback for very large inputs.
 */

export interface SequenceDiffOp {
  Kind: 'equal' | 'delete' | 'insert';
  OldIndex: number;
  NewIndex: number;
}

export interface LineDiffLine {
  Type: 'same' | 'added' | 'removed';
  OldLineNumber: number | null;
  NewLineNumber: number | null;
  Content: string;
}

export interface LineDiffResult {
  AddedLines: number;
  RemovedLines: number;
  UnchangedLines: number;
  Lines: LineDiffLine[];
}

/**
 * Bounded Myers O((M+N)D) sequence diff with common prefix/suffix trimming and
 * linear Patience-style unique-hash-anchor fallback when `(m + n) > maxSequenceSum`
 * or edit distance `D` exceeds `maxEditDistance`.
 */
export function ComputeBoundedSequenceDiff<T>(
  oldItems: readonly T[],
  newItems: readonly T[],
  equals: (a: T, b: T) => boolean,
  keyFn: (item: T) => string,
  maxEditDistance = 2000,
  maxSequenceSum = 10000,
): SequenceDiffOp[] {
  const n = oldItems.length;
  const m = newItems.length;

  let prefixLen = 0;
  const minLen = Math.min(n, m);
  while (prefixLen < minLen && equals(oldItems[prefixLen], newItems[prefixLen])) {
    prefixLen++;
  }

  let oldEnd = n;
  let newEnd = m;
  while (
    oldEnd > prefixLen &&
    newEnd > prefixLen &&
    equals(oldItems[oldEnd - 1], newItems[newEnd - 1])
  ) {
    oldEnd--;
    newEnd--;
  }

  const ops: SequenceDiffOp[] = [];
  for (let i = 0; i < prefixLen; i++) {
    ops.push({ Kind: 'equal', OldIndex: i, NewIndex: i });
  }

  const midN = oldEnd - prefixLen;
  const midM = newEnd - prefixLen;

  if (midN === 0 && midM > 0) {
    for (let j = prefixLen; j < newEnd; j++) {
      ops.push({ Kind: 'insert', OldIndex: -1, NewIndex: j });
    }
  } else if (midM === 0 && midN > 0) {
    for (let i = prefixLen; i < oldEnd; i++) {
      ops.push({ Kind: 'delete', OldIndex: i, NewIndex: -1 });
    }
  } else if (midN > 0 && midM > 0) {
    let midOps: SequenceDiffOp[] | null = null;
    if (midN + midM <= maxSequenceSum) {
      midOps = runBoundedMyersSlice(
        oldItems,
        prefixLen,
        midN,
        newItems,
        prefixLen,
        midM,
        equals,
        maxEditDistance,
      );
    }
    if (midOps) {
      for (const op of midOps) {
        ops.push(op);
      }
    } else {
      appendLinearHashAnchorOps(ops, oldItems, prefixLen, oldEnd, newItems, prefixLen, newEnd, equals, keyFn);
    }
  }

  const suffixCount = n - oldEnd;
  for (let s = 0; s < suffixCount; s++) {
    ops.push({ Kind: 'equal', OldIndex: oldEnd + s, NewIndex: newEnd + s });
  }

  return ops;
}

function runBoundedMyersSlice<T>(
  oldItems: readonly T[],
  oldOffset: number,
  n: number,
  newItems: readonly T[],
  newOffset: number,
  m: number,
  equals: (a: T, b: T) => boolean,
  maxEditDistance: number,
): SequenceDiffOp[] | null {
  const maxD = Math.min(n + m, maxEditDistance);
  const offset = maxD + 1;
  const v = new Int32Array(2 * maxD + 3);
  v.fill(-1);
  v[offset + 1] = 0;

  // Store snapshot of v[offset - d .. offset + d] at each step d (packed at index (k + d) >> 1)
  const traces: Int32Array[] = [];

  for (let d = 0; d <= maxD; d++) {
    const snap = new Int32Array(d + 1);
    snap.fill(-1);

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1]; // move down (insert from B)
      } else {
        x = v[offset + k - 1] + 1; // move right (delete from A)
      }

      let y = x - k;
      while (x < n && y < m && equals(oldItems[oldOffset + x], newItems[newOffset + y])) {
        x++;
        y++;
      }

      v[offset + k] = x;
      snap[(k + d) >> 1] = x;

      if (x >= n && y >= m) {
        traces.push(snap);
        return backtrackMyersSlice(traces, d, n, m, oldOffset, newOffset);
      }
    }

    traces.push(snap);
  }

  return null;
}

function backtrackMyersSlice(
  traces: readonly Int32Array[],
  finalD: number,
  n: number,
  m: number,
  oldOffset: number,
  newOffset: number,
): SequenceDiffOp[] {
  const revOps: SequenceDiffOp[] = [];
  let x = n;
  let y = m;

  for (let d = finalD; d > 0; d--) {
    const k = x - y;
    const prevSnap = traces[d - 1];
    const vPrevMinus = k !== -d ? prevSnap[(k + d - 2) >> 1] : -1;
    const vPrevPlus = k !== d ? prevSnap[(k + d) >> 1] : -1;

    const prevK = k === -d || (k !== d && vPrevMinus < vPrevPlus) ? k + 1 : k - 1;
    const prevX = prevK === k + 1 ? vPrevPlus : vPrevMinus;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      revOps.push({ Kind: 'equal', OldIndex: oldOffset + x, NewIndex: newOffset + y });
    }

    if (prevK === k + 1) {
      revOps.push({ Kind: 'insert', OldIndex: -1, NewIndex: newOffset + prevY });
    } else {
      revOps.push({ Kind: 'delete', OldIndex: oldOffset + prevX, NewIndex: -1 });
    }

    x = prevX;
    y = prevY;
  }

  while (x > 0 && y > 0) {
    x--;
    y--;
    revOps.push({ Kind: 'equal', OldIndex: oldOffset + x, NewIndex: newOffset + y });
  }

  revOps.reverse();
  return revOps;
}

function appendLinearHashAnchorOps<T>(
  out: SequenceDiffOp[],
  oldItems: readonly T[],
  oldStart: number,
  oldEnd: number,
  newItems: readonly T[],
  newStart: number,
  newEnd: number,
  equals: (a: T, b: T) => boolean,
  keyFn: (item: T) => string,
): void {
  const oldUnique = new Map<string, number>();
  for (let i = oldStart; i < oldEnd; i++) {
    const key = keyFn(oldItems[i]);
    oldUnique.set(key, oldUnique.has(key) ? -1 : i);
  }

  const newUnique = new Map<string, number>();
  for (let j = newStart; j < newEnd; j++) {
    const key = keyFn(newItems[j]);
    newUnique.set(key, newUnique.has(key) ? -1 : j);
  }

  const candidates: Array<{ oldIdx: number; newIdx: number }> = [];
  for (let j = newStart; j < newEnd; j++) {
    const key = keyFn(newItems[j]);
    if (newUnique.get(key) === j) {
      const oi = oldUnique.get(key);
      if (oi !== undefined && oi >= 0 && equals(oldItems[oi], newItems[j])) {
        candidates.push({ oldIdx: oi, newIdx: j });
      }
    }
  }

  const anchors = extractMonotonicAnchors(candidates);

  let curOld = oldStart;
  let curNew = newStart;

  for (let a = 0; a <= anchors.length; a++) {
    const targetOld = a < anchors.length ? anchors[a].oldIdx : oldEnd;
    const targetNew = a < anchors.length ? anchors[a].newIdx : newEnd;

    let gOldStart = curOld;
    let gNewStart = curNew;
    while (
      gOldStart < targetOld &&
      gNewStart < targetNew &&
      equals(oldItems[gOldStart], newItems[gNewStart])
    ) {
      out.push({ Kind: 'equal', OldIndex: gOldStart, NewIndex: gNewStart });
      gOldStart++;
      gNewStart++;
    }

    let gOldEnd = targetOld;
    let gNewEnd = targetNew;
    while (
      gOldEnd > gOldStart &&
      gNewEnd > gNewStart &&
      equals(oldItems[gOldEnd - 1], newItems[gNewEnd - 1])
    ) {
      gOldEnd--;
      gNewEnd--;
    }

    const gapN = gOldEnd - gOldStart;
    const gapM = gNewEnd - gNewStart;
    if (gapN > 0 && gapM > 0 && gapN + gapM <= 2000) {
      const smallMyers = runBoundedMyersSlice(
        oldItems,
        gOldStart,
        gapN,
        newItems,
        gNewStart,
        gapM,
        equals,
        Math.min(500, gapN + gapM),
      );
      if (smallMyers) {
        for (const op of smallMyers) {
          out.push(op);
        }
      } else {
        for (let i = gOldStart; i < gOldEnd; i++) {
          out.push({ Kind: 'delete', OldIndex: i, NewIndex: -1 });
        }
        for (let j = gNewStart; j < gNewEnd; j++) {
          out.push({ Kind: 'insert', OldIndex: -1, NewIndex: j });
        }
      }
    } else {
      for (let i = gOldStart; i < gOldEnd; i++) {
        out.push({ Kind: 'delete', OldIndex: i, NewIndex: -1 });
      }
      for (let j = gNewStart; j < gNewEnd; j++) {
        out.push({ Kind: 'insert', OldIndex: -1, NewIndex: j });
      }
    }

    const gapSuffixCount = targetOld - gOldEnd;
    for (let s = 0; s < gapSuffixCount; s++) {
      out.push({ Kind: 'equal', OldIndex: gOldEnd + s, NewIndex: gNewEnd + s });
    }

    if (a < anchors.length) {
      out.push({ Kind: 'equal', OldIndex: targetOld, NewIndex: targetNew });
      curOld = targetOld + 1;
      curNew = targetNew + 1;
    }
  }
}

function extractMonotonicAnchors(
  candidates: ReadonlyArray<{ oldIdx: number; newIdx: number }>,
): Array<{ oldIdx: number; newIdx: number }> {
  const count = candidates.length;
  if (count === 0) {
    return [];
  }

  const tailIndices = new Int32Array(count);
  const prevIndices = new Int32Array(count);
  prevIndices.fill(-1);
  let length = 0;

  for (let i = 0; i < count; i++) {
    const val = candidates[i].oldIdx;
    let lo = 0;
    let hi = length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (candidates[tailIndices[mid]].oldIdx < val) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo > 0) {
      prevIndices[i] = tailIndices[lo - 1];
    }
    tailIndices[lo] = i;
    if (lo === length) {
      length++;
    }
  }

  const chosen: Array<{ oldIdx: number; newIdx: number }> = new Array(length);
  let k = tailIndices[length - 1];
  for (let pos = length - 1; pos >= 0; pos--) {
    chosen[pos] = candidates[k];
    k = prevIndices[k];
  }
  return chosen;
}

/**
 * Computes a deterministic line-by-line diff between two strings or line arrays using
 * common prefix/suffix trimming, bounded Myers O((M+N)D), and linear unique-anchor fallback.
 */
export function ComputeLineDiff(
  oldContent: string | readonly string[],
  newContent: string | readonly string[],
): LineDiffResult {
  const oldLines: readonly string[] =
    typeof oldContent === 'string'
      ? (oldContent ?? '').replace(/\r\n/g, '\n').split('\n')
      : oldContent;
  const newLines: readonly string[] =
    typeof newContent === 'string'
      ? (newContent ?? '').replace(/\r\n/g, '\n').split('\n')
      : newContent;

  const ops = ComputeBoundedSequenceDiff(
    oldLines,
    newLines,
    (a, b) => a === b,
    (line) => line,
  );

  const diffLines: LineDiffLine[] = [];
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  for (const op of ops) {
    if (op.Kind === 'equal') {
      diffLines.push({
        Type: 'same',
        OldLineNumber: op.OldIndex + 1,
        NewLineNumber: op.NewIndex + 1,
        Content: oldLines[op.OldIndex],
      });
      unchanged++;
    } else if (op.Kind === 'delete') {
      diffLines.push({
        Type: 'removed',
        OldLineNumber: op.OldIndex + 1,
        NewLineNumber: null,
        Content: oldLines[op.OldIndex],
      });
      removed++;
    } else {
      diffLines.push({
        Type: 'added',
        OldLineNumber: null,
        NewLineNumber: op.NewIndex + 1,
        Content: newLines[op.NewIndex],
      });
      added++;
    }
  }

  return {
    AddedLines: added,
    RemovedLines: removed,
    UnchangedLines: unchanged,
    Lines: diffLines,
  };
}
