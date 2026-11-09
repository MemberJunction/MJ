import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LabelCatch, LabelPacket } from '../pipeline/Label';
import { FileCatchStore } from '../store/FileCatchStore';
import { RunDir } from '../pipeline/RunDir';
import { RedactionCheck, RedactionError } from '../sandbox/Redaction';
import type { Catch } from '../types';
import { candidate, generation, ID_A, ID_B, ID_C, results, run, RUN_ID } from './helpers/pipelineFixtures';

const FAKE_SECRET = 'not-a-real-secret-value';
const CATCH_A = '11111111-1111-4111-8111-111111111111';
const CATCH_B = '22222222-2222-4222-8222-222222222222';
const CATCH_C = '33333333-3333-4333-8333-333333333333';
const redaction = new RedactionCheck([FAKE_SECRET]);

function aCatch(id: string, testID: string, over: Partial<Catch> = {}): Catch {
  return { ID: id, RunID: RUN_ID, CandidateTestID: testID, Verdict: { Label: 'WeakCatch', Timeout: false, Reason: 'fails on head' }, DroppedByRule: null, Boosts: [],
    TPProb: 0.4, JudgeBuckets: [{ Model: 'judge-one', Bucket: 'High', Reason: 'looks like a real break' }, { Model: 'judge-two', Bucket: null, Reason: 'provider error' }],
    Median: 'High', Rank: 1, Reported: true, CommentID: null, ...over };
}

/** A repo root with one run folder and a store holding the run and three catches: A weak, B dropped, C passes both. */
async function fixture(over: Partial<Catch> = {}): Promise<{ RepoRoot: string; StoreDir: string; Store: FileCatchStore }> {
  const repoRoot = mkdtempSync(join(tmpdir(), 'jit-label-')); const storeDir = join(repoRoot, 'store');
  const store = new FileCatchStore(storeDir, new RedactionCheck([]));
  const tests = [candidate(ID_A, `it('opens', () => { expect(open()).toBe(3); });`), candidate(ID_B), candidate(ID_C)];
  const dir = new RunDir(repoRoot, RUN_ID, new RedactionCheck([]));
  dir.WriteGeneration(generation('/work/base', tests));
  dir.WriteExecution({ RunID: RUN_ID, Tests: tests, Coverage: [], TypeErrors: {},
    Results: [...results(ID_A, 'Base', true), ...results(ID_A, 'Head', false), ...results(ID_B, 'Head', false), ...results(ID_C, 'Head', true)] });
  await store.SaveRun(run());
  await store.SaveCatches([aCatch(CATCH_A, ID_A, over), aCatch(CATCH_B, ID_B, { DroppedByRule: 'ApiChanged' }),
    aCatch(CATCH_C, ID_C, { Verdict: { Label: 'PassesBoth', Timeout: false, Reason: '' } })]);
  return { RepoRoot: repoRoot, StoreDir: storeDir, Store: store };
}

describe('LabelCatch', () => {
  it('saves feedback with Source Label at the given time', async () => {
    const f = await fixture();
    await LabelCatch({ StoreDir: f.StoreDir, CatchID: CATCH_A, Answer: 'Intended', User: 'octo', Redaction: redaction, Now: () => new Date('2026-11-09T10:00:00.000Z') });
    expect(await f.Store.ListFeedback(CATCH_A)).toEqual([{ CatchID: CATCH_A, User: 'octo', Answer: 'Intended', Source: 'Label', At: '2026-11-09T10:00:00.000Z' }]);
  });
  it('finds the catch when the ID differs only in case', async () => {
    const f = await fixture();
    await LabelCatch({ StoreDir: f.StoreDir, CatchID: CATCH_A.toUpperCase(), Answer: 'Bug', User: 'octo', Redaction: redaction });
    expect((await f.Store.ListFeedback(CATCH_A)).map((x) => x.Answer)).toEqual(['Bug']);
  });
  it('rejects AuthorChangedPR', async () => {
    const f = await fixture();
    await expect(LabelCatch({ StoreDir: f.StoreDir, CatchID: CATCH_A, Answer: 'AuthorChangedPR', User: 'octo', Redaction: redaction })).rejects.toThrow(/Bug, Intended or TestFault/);
    expect(await f.Store.ListFeedback(CATCH_A)).toEqual([]);
  });
  it('rejects a catch that is not in the store', async () => {
    const f = await fixture();
    await expect(LabelCatch({ StoreDir: f.StoreDir, CatchID: '99999999-9999-4999-8999-999999999999', Answer: 'Bug', User: 'octo', Redaction: redaction })).rejects.toThrow(/not in the store/);
  });
});

describe('LabelPacket', () => {
  it('names each weak, non-dropped catch once with its test, failure, judges and label commands', async () => {
    const f = await fixture();
    const md = await LabelPacket({ StoreDir: f.StoreDir, RepoRoot: f.RepoRoot, RunID: RUN_ID, Redaction: redaction });
    expect(md.split(CATCH_A).length - 1).toBe(4);      // heading + three commands
    expect(md).not.toContain(CATCH_B);
    expect(md).not.toContain(CATCH_C);
    expect(md).toContain('#12');
    expect(md).toContain(candidate(ID_A).FilePath);
    expect(md).toContain(`expect(open()).toBe(3)`);
    expect(md).toContain('AssertionError: expected 4 to be 3');
    expect(md).toMatch(/Expected.*3/);
    expect(md).toMatch(/Actual.*4/);
    expect(md).toContain('judge-one');
    expect(md).toContain('looks like a real break');
    expect(md).toContain('provider error');
    for (const a of ['Bug', 'Intended', 'TestFault']) expect(md).toContain(`jit-catch label --catch ${CATCH_A} --answer ${a} --user <login>`);
  });
  it('refuses a packet that holds a secret', async () => {
    const f = await fixture({ JudgeBuckets: [{ Model: 'judge-one', Bucket: 'High', Reason: `saw ${FAKE_SECRET}` }] });
    await expect(LabelPacket({ StoreDir: f.StoreDir, RepoRoot: f.RepoRoot, RunID: RUN_ID, Redaction: redaction })).rejects.toThrow(RedactionError);
  });
});
