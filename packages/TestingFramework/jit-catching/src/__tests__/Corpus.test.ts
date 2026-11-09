import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AssignSlices, LoadCorpus, RevisionsOf } from '../corpus/Corpus';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function writeCorpus(content: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'jit-corpus-'));
  dirs.push(dir);
  const p = join(dir, 'corpus.json');
  writeFileSync(p, JSON.stringify(content));
  return p;
}

const sha = (c: string) => c.repeat(40);
const entries = (n: number) => Array.from({ length: n }, (_, i) => ({ PR: i + 1 }));
const heldOut = (list: { Slice: string }[]) => list.filter(e => e.Slice === 'HeldOut').length;

describe('AssignSlices', () => {
  it('gives the same assignment for the same seed', () => {
    const a = AssignSlices(entries(45), 7).map(e => e.Slice);
    const b = AssignSlices(entries(45), 7).map(e => e.Slice);
    expect(a).toEqual(b);
    expect(AssignSlices(entries(45), 8).map(e => e.Slice)).not.toEqual(a);
  });
  it('holds out a third of 45 entries', () => {
    const out = AssignSlices(entries(45), 1);
    expect(heldOut(out)).toBe(15);
    expect(out.length).toBe(45);
    expect(out.map(e => e.PR)).toEqual(entries(45).map(e => e.PR));
  });
  it('holds out at least 10 of 12 entries', () => {
    expect(heldOut(AssignSlices(entries(12), 1))).toBe(10);
  });
  it('holds out all of 6 entries', () => {
    expect(heldOut(AssignSlices(entries(6), 1))).toBe(6);
  });
});

describe('RevisionsOf', () => {
  it('takes the base from the first parent of the landing commit', async () => {
    const FirstParent = vi.fn(async (s: string) => (s === sha('b') ? sha('a') : 'unexpected'));
    expect(await RevisionsOf(sha('b'), { FirstParent })).toEqual({ BaseSHA: sha('a'), HeadSHA: sha('b') });
    expect(FirstParent).toHaveBeenCalledWith(sha('b'));
  });
});

describe('LoadCorpus', () => {
  const bug = { BugPR: 10, FixPR: 11, BugMergeSHA: sha('a'), FixMergeSHA: sha('b'), Description: 'off by one', Slice: 'Tuning' };
  const clean = { PR: 20, MergeSHA: sha('c'), Slice: 'HeldOut' };

  it('loads a valid corpus', () => {
    const c = LoadCorpus(writeCorpus({ Version: 1, Seed: 3, Bug: [bug], Clean: [clean] }));
    expect(c.Bug[0].FixPR).toBe(11);
    expect(c.Clean[0].Slice).toBe('HeldOut');
  });
  it('rejects a PR number that appears in both a bug pair and a clean entry', () => {
    const p = writeCorpus({ Version: 1, Seed: 3, Bug: [bug], Clean: [{ ...clean, PR: 11 }] });
    expect(() => LoadCorpus(p)).toThrow(/duplicate PR number/);
  });
  it('rejects a bug pair whose bug and fix PR are the same', () => {
    const p = writeCorpus({ Version: 1, Seed: 3, Bug: [{ ...bug, FixPR: 10 }], Clean: [] });
    expect(() => LoadCorpus(p)).toThrow(/duplicate PR number/);
  });
});
