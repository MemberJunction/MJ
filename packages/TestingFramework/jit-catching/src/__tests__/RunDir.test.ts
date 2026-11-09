import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunDir } from '../pipeline/RunDir';
import { RedactionCheck, RedactionError } from '../sandbox/Redaction';
import { candidate, generation, ID_A, results, RUN_ID } from './helpers/pipelineFixtures';

const FAKE_SECRET = 'not-a-real-secret-value';
function dir(): RunDir { return new RunDir(mkdtempSync(join(tmpdir(), 'jit-rundir-')), RUN_ID, new RedactionCheck([FAKE_SECRET])); }

describe('RunDir', () => {
  it('writes a GenerationFile and reads it back equal', () => {
    const d = dir(); const g = generation('/work/base', [candidate(ID_A)]);
    d.WriteGeneration(g);
    expect(d.ReadGeneration()).toEqual(g);
    expect(d.Path.endsWith(join('.jit-catch', 'runs', RUN_ID))).toBe(true);
  });
  it('ReadExecution throws on a tampered file', () => {
    const d = dir();
    d.WriteExecution({ RunID: RUN_ID, Tests: [candidate(ID_A)], Results: results(ID_A, 'Base', true, 1), Coverage: [], TypeErrors: {} });
    const file = join(d.Path, 'execution.json'); const raw = JSON.parse(readFileSync(file, 'utf8')) as { Results: { Status: string }[] };
    raw.Results[0].Status = 'Bogus'; writeFileSync(file, JSON.stringify(raw));
    expect(() => d.ReadExecution()).toThrow();
  });
  it('WriteAssessment refuses a secret in a judge reason', () => {
    const d = dir();
    const c = { ID: 'c1', RunID: RUN_ID, CandidateTestID: ID_A, Verdict: { Label: 'WeakCatch' as const, Timeout: false, Reason: 'fails on head' }, DroppedByRule: null, Boosts: [], TPProb: 0.5,
      JudgeBuckets: [{ Model: 'm', Bucket: 'High' as const, Reason: `the key ${FAKE_SECRET} leaked` }], Median: 'High' as const, Rank: 1, Reported: true, CommentID: null };
    expect(() => d.WriteAssessment({ RunID: RUN_ID, Catches: [c], Promotions: [] })).toThrow(RedactionError);
  });
  it('refuses a run ID that is not a plain name', () => {
    expect(() => new RunDir(mkdtempSync(join(tmpdir(), 'jit-rundir-')), '../escape', new RedactionCheck([]))).toThrow(/run ID/);
  });
  it('reading an unknown run throws and creates nothing', () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-rundir-'));
    expect(() => new RunDir(root, 'nope', new RedactionCheck([])).ReadGeneration()).toThrow('run nope not found');
    expect(existsSync(join(root, '.jit-catch', 'runs', 'nope'))).toBe(false);
  });
  it('Create makes the run and transcript folders', () => {
    const d = new RunDir(mkdtempSync(join(tmpdir(), 'jit-rundir-')), RUN_ID, new RedactionCheck([]));
    expect(existsSync(d.Path)).toBe(false);
    d.Create();
    expect(existsSync(d.TranscriptDir)).toBe(true);
  });
});
