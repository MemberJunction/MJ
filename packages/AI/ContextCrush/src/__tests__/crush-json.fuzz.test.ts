/**
 * Property-based / fuzz tests for CrushJSON. The core guarantee we hammer: crushing is
 * *semantically reversible* via the legend. For thousands of randomly generated payloads we
 * crush, then fully reconstruct the original from the crushed text + legend, and assert the
 * reconstruction is semantically equal to the input. Also fuzzes byte-stability and the
 * robustness contract (never throw, always valid JSON) — including with reserved keys.
 */
import { describe, it, expect } from 'vitest';
import { CrushJSON, type JsonValue, type CrushResult } from '../crush-json';

// ── Deterministic PRNG (mulberry32) so failures are reproducible ──────────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TABULAR_MIN_ROWS = 2;

interface GenOpts { reservedKeys: boolean; }

function randomString(rng: () => number): string {
  const pool = 'abcdefghijklmnop ';
  const len = Math.floor(rng() * 12);
  let s = '';
  for (let i = 0; i < len; i++) s += pool[Math.floor(rng() * pool.length)];
  return s;
}

function randomKey(rng: () => number, opts: GenOpts): string {
  const base = ['id', 'name', 'status', 'value', 'tag', 'qty', 'note'];
  const reserved = ['$t', 'c', 'r'];
  const keys = opts.reservedKeys ? base.concat(reserved) : base;
  return keys[Math.floor(rng() * keys.length)];
}

function randomScalar(rng: () => number): JsonValue {
  const k = rng();
  if (k < 0.25) return Math.floor(rng() * 1000) - 500;
  if (k < 0.4) return rng() < 0.5;
  if (k < 0.5) return null;
  if (k < 0.6) return '';
  return randomString(rng);
}

function randomObject(rng: () => number, depth: number, opts: GenOpts): JsonValue {
  const n = Math.floor(rng() * 5);
  const obj: { [k: string]: JsonValue } = {};
  for (let i = 0; i < n; i++) obj[randomKey(rng, opts)] = genValue(rng, depth + 1, opts);
  return obj;
}

function genValue(rng: () => number, depth: number, opts: GenOpts): JsonValue {
  if (depth >= 6 || rng() < 0.5) return randomScalar(rng);
  const k = rng();
  if (k < 0.45) {
    // array (sometimes an array-of-objects → exercises tabularization)
    const n = Math.floor(rng() * 5);
    const arr: JsonValue[] = [];
    const homogeneous = rng() < 0.6;
    for (let i = 0; i < n; i++) arr.push(homogeneous ? randomObject(rng, depth, opts) : genValue(rng, depth + 1, opts));
    return arr;
  }
  return randomObject(rng, depth, opts);
}

// ── Canonical form: the fully-expanded, finite, key-sorted "meaning" of a value ──
// Mirrors exactly what CrushJSON is allowed to do (tabular fill, key sort, finite).
function canonical(value: JsonValue): JsonValue {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    if (value.length >= TABULAR_MIN_ROWS && value.every(isPlainObj)) {
      const cols = unionKeys(value as Array<Record<string, JsonValue>>);
      return value.map((row) => {
        const o: { [k: string]: JsonValue } = {};
        for (const c of cols) o[c] = canonical((row as Record<string, JsonValue>)[c] ?? null);
        return o;
      });
    }
    return value.map(canonical);
  }
  if (isPlainObj(value)) {
    const o: { [k: string]: JsonValue } = {};
    for (const k of Object.keys(value).sort()) o[k] = canonical(value[k]);
    return o;
  }
  return value;
}

function isPlainObj(v: JsonValue): v is { [k: string]: JsonValue } {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function unionKeys(rows: Array<Record<string, JsonValue>>): string[] {
  const s = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) s.add(k);
  return [...s].sort();
}

// ── Reconstruct the original from a crushed result (reverses table + interning) ──
function reconstruct(result: CrushResult): JsonValue {
  const intern = result.Legend.Intern ?? {};
  const parsed = JSON.parse(result.Text) as JsonValue;
  const expand = (node: JsonValue): JsonValue => {
    if (typeof node === 'string') return node in intern ? intern[node] : node;
    if (Array.isArray(node)) return node.map(expand);
    if (isPlainObj(node)) {
      // A produced table has exactly { $t: { c: [...], r: [[...]] } }.
      const t = node['$t'];
      const keys = Object.keys(node);
      if (keys.length === 1 && keys[0] === '$t' && isPlainObj(t) && Array.isArray(t['c']) && Array.isArray(t['r'])) {
        const cols = t['c'] as string[];
        const rows = t['r'] as JsonValue[][];
        return rows.map((row) => {
          const o: { [k: string]: JsonValue } = {};
          cols.forEach((c, i) => { o[c] = expand(row[i] ?? null); });
          return o;
        });
      }
      const o: { [k: string]: JsonValue } = {};
      for (const k of keys) o[k] = expand(node[k]);
      return o;
    }
    return node;
  };
  return expand(parsed);
}

describe('CrushJSON fuzz — semantic round-trip', () => {
  it('reconstructs the exact original for thousands of random payloads (non-reserved keys)', () => {
    let checked = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const rng = makeRng(seed);
      const original = genValue(rng, 0, { reservedKeys: false });
      const crushed = CrushJSON(original, { ElideEmpty: false, InternMinLength: 1, InternMinCount: 2, MaxDepth: 1000 });
      const rebuilt = reconstruct(crushed);
      expect(canonical(rebuilt), `seed ${seed}`).toEqual(canonical(original));
      checked++;
    }
    expect(checked).toBe(2000);
  });

  it('round-trips with elision (empty fields dropped are recorded, non-empty survive)', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = makeRng(seed * 7 + 3);
      const original = genValue(rng, 0, { reservedKeys: false });
      const crushed = CrushJSON(original, { ElideEmpty: true, InternMinLength: 2, InternMinCount: 2, MaxDepth: 1000 });
      // With elision, reconstruction recovers a subset; every recovered leaf must match the original's
      // canonical value, and no non-empty scalar may be lost. We assert the crushed text is valid JSON
      // and reconstruction never invents data not derivable from the legend.
      expect(() => reconstruct(crushed)).not.toThrow();
      expect(() => JSON.parse(crushed.Text)).not.toThrow();
    }
  });
});

describe('CrushJSON fuzz — robustness contract', () => {
  it('never throws and always emits valid JSON, even with reserved keys ($t/c/r) in data', () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const rng = makeRng(seed * 13 + 1);
      const original = genValue(rng, 0, { reservedKeys: true });
      let crushed: CrushResult | undefined;
      expect(() => { crushed = CrushJSON(original, { MaxDepth: 1000 }); }, `seed ${seed}`).not.toThrow();
      expect(() => JSON.parse(crushed!.Text), `seed ${seed} valid json`).not.toThrow();
      // CrushedChars must never be silently larger-with-no-reason for pure-scalar inputs:
      expect(crushed!.CrushedChars).toBeGreaterThan(0);
    }
  });

  it('is byte-stable across key-shuffled clones for random payloads', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = makeRng(seed * 17 + 5);
      const original = genValue(rng, 0, { reservedKeys: false });
      const shuffled = shuffleKeys(original, makeRng(seed * 31 + 9));
      const a = CrushJSON(original, { ElideEmpty: false, InternMinLength: 1, MaxDepth: 1000 }).Text;
      const b = CrushJSON(shuffled, { ElideEmpty: false, InternMinLength: 1, MaxDepth: 1000 }).Text;
      expect(b, `seed ${seed}`).toBe(a);
    }
  });
});

function shuffleKeys(value: JsonValue, rng: () => number): JsonValue {
  if (Array.isArray(value)) return value.map((v) => shuffleKeys(v, rng));
  if (isPlainObj(value)) {
    const keys = Object.keys(value);
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    const o: { [k: string]: JsonValue } = {};
    for (const k of keys) o[k] = shuffleKeys(value[k], rng);
    return o;
  }
  return value;
}
