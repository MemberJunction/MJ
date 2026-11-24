import { describe, it, expect } from 'vitest';
import { TracedNumbers } from '../traced-number';

const RUNS = 'MJ: ML Training Runs';
const four = (v: number): string => v.toFixed(4);
const stored = JSON.stringify({
  gate: { holdoutRows: 1205, intervals: { modelVsDummy: { value: 0.02, lower: 0.01, upper: 0.03 }, memberVsDummy: { 'heuristic:a.b[c]': { value: 0.5 } } } },
  trainer: { innerScores: [{ inner: { value: 0.41 } }, { inner: { value: 0.4 } }] },
  text: 'x', flag: true, nothing: null,
});

describe('TracedNumbers.FromStoredPath — the path grammar', () => {
  it('reads `.key` segments', () => {
    expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', stored, '$.gate.intervals.modelVsDummy.value', four))
      .toEqual({ Value: 0.02, Text: '0.0200', Source: { EntityName: RUNS, RecordID: 'R-1', Path: '$.gate.intervals.modelVsDummy.value' } });
  });

  it('reads `[index]` segments', () => {
    expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', stored, '$.trainer.innerScores[1].inner.value', four)?.Value).toBe(0.4);
    expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', '[7,8]', '$[0]', String)?.Text).toBe('7');
  });

  it('reads a `["key"]` segment whose key holds a dot and brackets', () => {
    expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', stored, '$.gate.intervals.memberVsDummy["heuristic:a.b[c]"].value', four)?.Value).toBe(0.5);
    expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', stored, '$["gate"]["holdoutRows"]', (v) => v.toLocaleString('en-US'))?.Text).toBe('1,205');
  });

  it('reads a quoted key with an escaped quote', () => {
    expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', JSON.stringify({ 'a"b': 3 }), '$["a\\"b"]', String)?.Value).toBe(3);
  });

  it('refuses a path outside the grammar, never throwing', () => {
    for (const path of ['', 'gate', '$gate', '$.', '$..gate', '$.1gate', '$[01]', '$[-1]', '$[1.5]', '$[gate]', "$['gate']", '$["gate"', '$["gate"]x', '$.gate[', '$.gate.']) {
      expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', stored, path, four)).toBeNull();
    }
  });

  it('is null for a missing segment, an index past the end, and a prototype member', () => {
    for (const path of ['$.gate.margin', '$.trainer.innerScores[2].inner.value', '$.gate.constructor', '$.trainer.innerScores.length']) {
      expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', stored, path, four)).toBeNull();
    }
  });

  it('is null for a leaf that is not a finite number', () => {
    for (const path of ['$.text', '$.flag', '$.nothing', '$.gate', '$.trainer.innerScores']) {
      expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', stored, path, four)).toBeNull();
    }
    expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', '{"a":"NaN","b":"Infinity"}', '$.a', four)).toBeNull();
    expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', '{"a":"NaN","b":"Infinity"}', '$.b', four)).toBeNull();
    expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', '{"a":1e400}', '$.a', four)).toBeNull();
  });

  it('is null for JSON that does not parse', () => {
    for (const json of ['', '   ', 'not json', '{"a":']) {
      expect(TracedNumbers.FromStoredPath(RUNS, 'R-1', json, '$.a', four)).toBeNull();
    }
  });
});

describe('TracedNumbers.Recompute', () => {
  it('re-reads the stored value at the source path', () => {
    const n = TracedNumbers.FromStoredPath(RUNS, 'R-1', stored, '$.gate.holdoutRows', String);
    expect(n).not.toBeNull();
    if (n === null) return;
    expect(TracedNumbers.Recompute(n, stored)).toBe(1205);
  });

  it('returns the stored value, not a tampered Value (the G3.7 shape)', () => {
    const n = TracedNumbers.FromStoredPath(RUNS, 'R-1', stored, '$.gate.intervals.modelVsDummy.value', four);
    expect(n).not.toBeNull();
    if (n === null) return;
    const tampered = { ...n, Value: n.Value * 0.98 };
    expect(TracedNumbers.Recompute(tampered, stored)).toBe(0.02);
    expect(TracedNumbers.Recompute(tampered, stored)).not.toBeCloseTo(tampered.Value, 12);
  });

  it('is null when the row no longer holds the path, or its JSON does not parse', () => {
    const n = TracedNumbers.FromStoredPath(RUNS, 'R-1', stored, '$.gate.holdoutRows', String);
    if (n === null) throw new Error('expected a traced number');
    expect(TracedNumbers.Recompute(n, JSON.stringify({ gate: null }))).toBeNull();
    expect(TracedNumbers.Recompute(n, 'garbage')).toBeNull();
  });
});
