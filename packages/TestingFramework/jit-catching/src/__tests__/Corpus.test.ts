import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LoadCorpus, RevisionsOf } from '../corpus/Corpus';

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
  it('rejects a bug PR that is also a clean entry', () => {
    const p = writeCorpus({ Version: 1, Seed: 3, Bug: [bug], Clean: [{ ...clean, PR: 10 }] });
    expect(() => LoadCorpus(p)).toThrow(/duplicate PR number/);
  });
  it('rejects a bug PR that is the fix PR of another pair', () => {
    const p = writeCorpus({ Version: 1, Seed: 3, Bug: [bug, { ...bug, BugPR: 12, FixPR: 10 }], Clean: [] });
    expect(() => LoadCorpus(p)).toThrow(/duplicate PR number/);
  });
  it('accepts a fix PR that is also a clean entry', () => {
    const c = LoadCorpus(writeCorpus({ Version: 1, Seed: 3, Bug: [bug], Clean: [{ ...clean, PR: 11 }] }));
    expect(c.Clean[0].PR).toBe(11);
  });
  it('reports a missing file as not found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jit-corpus-')); dirs.push(dir);
    expect(() => LoadCorpus(join(dir, 'missing.json'))).toThrow(/corpus file not found: .*missing\.json/);
  });
  it('rejects a bug pair whose bug and fix PR are the same', () => {
    const p = writeCorpus({ Version: 1, Seed: 3, Bug: [{ ...bug, FixPR: 10 }], Clean: [] });
    expect(() => LoadCorpus(p)).toThrow(/duplicate PR number/);
  });
});
