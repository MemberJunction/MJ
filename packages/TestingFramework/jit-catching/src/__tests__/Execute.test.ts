import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExecuteStep } from '../pipeline/Execute';
import { RunDir } from '../pipeline/RunDir';
import type { PipelineTarget } from '../pipeline/Deps';
import { RedactionCheck } from '../sandbox/Redaction';
import { InfrastructureError } from '../target/VitestCatchTarget';
import { DEFAULT_SETTINGS } from '../settings';
import type { CandidateTest, ChangedLines, PreparedRevision, RevisionRef } from '../types';
import { candidate, generation, HEAD_SHA, ID_A, ID_B, PKG, results, RUN_ID } from './helpers/pipelineFixtures';

interface Calls { Prepare: RevisionRef[]; PreparePackages: (string[] | undefined)[]; Build: { Kind: string; Packages: string[] }[]; Write: string[]; Run: { Kind: string; IDs: string[]; Repeats: number }[]; Coverage: string[][]; Cleanup: string[] }

/**
 * A target that records every call: A passes on base and fails on head, B passes on both, nothing has type errors.
 * Each call advances `clock.Ms`: Prepare 1s, BuildPackages 2s, each TypeCheck 1.5s, each Run 2s, Coverage 5s.
 */
function fakeTarget(prepareError?: Error, clock: { Ms: number } = { Ms: 0 }): { Target: PipelineTarget; Calls: Calls } {
  const calls: Calls = { Prepare: [], PreparePackages: [], Build: [], Write: [], Run: [], Coverage: [], Cleanup: [] };
  const target: PipelineTarget = {
    Prepare: async (r: RevisionRef, p?: string[]): Promise<PreparedRevision> => { clock.Ms += 1000; calls.Prepare.push(r); calls.PreparePackages.push(p); if (prepareError) throw prepareError; return { Ref: r, RootDir: '/work/head' }; },
    BuildPackages: async (r: PreparedRevision, p: string[]) => { clock.Ms += 2000; calls.Build.push({ Kind: r.Ref.Kind, Packages: p }); },
    PackagesAt: (_r: PreparedRevision, p: string[]) => p,
    WriteTests: async (r: PreparedRevision) => { calls.Write.push(r.Ref.Kind); },
    TypeCheck: async (_r: PreparedRevision, t: CandidateTest[]) => { clock.Ms += 1500; return new Map(t.map((x) => [x.ID, null])); },
    Run: async (r: PreparedRevision, t: CandidateTest[], repeats: number) => {
      clock.Ms += 2000; calls.Run.push({ Kind: r.Ref.Kind, IDs: t.map((x) => x.ID), Repeats: repeats });
      return t.flatMap((x) => results(x.ID, r.Ref.Kind, !(r.Ref.Kind === 'Head' && x.ID === ID_A), repeats));
    },
    Coverage: async (_r: PreparedRevision, t: CandidateTest[], _c: ChangedLines) => { clock.Ms += 5000; calls.Coverage.push(t.map((x) => x.ID)); return t.map((x) => ({ CandidateTestID: x.ID, CoveredChangedLines: 4 })); },
    Cleanup: async (r: PreparedRevision) => { calls.Cleanup.push(r.RootDir); },
  };
  return { Target: target, Calls: calls };
}

describe('ExecuteStep', () => {
  let root: string; let dir: RunDir; const redaction = new RedactionCheck([]);
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'jit-exec-')); dir = new RunDir(root, RUN_ID, redaction);
    mkdirSync(join(dir.Path, 'work', 'base'), { recursive: true });
    dir.WriteGeneration(generation(join(dir.Path, 'work', 'base'), [candidate(ID_A), candidate(ID_B), candidate('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'x', 'Failed')]));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('prepares head, runs produced tests on both revisions and writes execution.json', async () => {
    const { Target, Calls } = fakeTarget();
    await ExecuteStep({ RunID: RUN_ID, RepoRoot: root, Settings: DEFAULT_SETTINGS, Deps: { Target, Redaction: redaction } });
    expect(Calls.Prepare).toEqual([{ Kind: 'Head', SHA: HEAD_SHA }]);
    expect(Calls.PreparePackages).toEqual([[PKG]]);
    expect(Calls.Build).toEqual([{ Kind: 'Head', Packages: [PKG] }]);
    expect(Calls.Write).toEqual(['Base', 'Head']);
    expect(Calls.Run).toEqual([{ Kind: 'Base', IDs: [ID_A, ID_B], Repeats: 3 }, { Kind: 'Head', IDs: [ID_A, ID_B], Repeats: 3 }]);
    expect(Calls.Coverage).toEqual([[ID_B]]);
    expect(Calls.Cleanup).toEqual(['/work/head']);
    const f = dir.ReadExecution();
    expect(f.Results).toHaveLength(12);
    expect(f.Coverage).toEqual([{ CandidateTestID: ID_B, CoveredChangedLines: 4 }]);
    expect(f.TypeErrors[ID_A]).toEqual({ Base: null, Head: null });
  });

  it('measures no coverage when Settings.Coverage is false, even for tests that pass on both', async () => {
    const { Target, Calls } = fakeTarget();
    await ExecuteStep({ RunID: RUN_ID, RepoRoot: root, Settings: { ...DEFAULT_SETTINGS, Coverage: false }, Deps: { Target, Redaction: redaction } });
    expect(Calls.Coverage).toEqual([]);
    expect(dir.ReadExecution().Coverage).toEqual([]);
  });

  it('records how long each stage took in execution.json and prints them on one stdout line', async () => {
    const clock = { Ms: 0 }; const { Target } = fakeTarget(undefined, clock);
    const stdout: string[] = []; vi.spyOn(process.stdout, 'write').mockImplementation((c) => { stdout.push(String(c)); return true; });
    await ExecuteStep({ RunID: RUN_ID, RepoRoot: root, Settings: DEFAULT_SETTINGS, Deps: { Target, Redaction: redaction, Now: () => clock.Ms } });
    expect(dir.ReadExecution().Timings).toEqual({ PrepareHeadMs: 1000, BuildHeadMs: 2000, TypeCheckMs: 3000, RunMs: 4000, CoverageMs: 5000 });
    expect(stdout).toContain(`run ${RUN_ID}: stages prepare head 1s, build head 2s, type-check 3s, run 4s, coverage 5s\n`);
  });

  it('records a coverage time of 0 when Settings.Coverage is false', async () => {
    const clock = { Ms: 0 }; const { Target } = fakeTarget(undefined, clock);
    await ExecuteStep({ RunID: RUN_ID, RepoRoot: root, Settings: { ...DEFAULT_SETTINGS, Coverage: false }, Deps: { Target, Redaction: redaction, Now: () => clock.Ms } });
    expect(dir.ReadExecution().Timings?.CoverageMs).toBe(0);
  });

  it('an InfrastructureError from Prepare ends the step once and writes no execution.json', async () => {
    const { Target, Calls } = fakeTarget(new InfrastructureError('install failed on Head: offline'));
    await expect(ExecuteStep({ RunID: RUN_ID, RepoRoot: root, Settings: DEFAULT_SETTINGS, Deps: { Target, Redaction: redaction } })).rejects.toThrow(InfrastructureError);
    expect(Calls.Prepare).toHaveLength(1);
    expect(existsSync(join(dir.Path, 'execution.json'))).toBe(false);
  });

  it('refuses a BaseRootDir outside the run folder before any target call', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'jit-outside-'));
    dir.WriteGeneration(generation(outside, [candidate(ID_A)]));
    const { Target, Calls } = fakeTarget();
    await expect(ExecuteStep({ RunID: RUN_ID, RepoRoot: root, Settings: DEFAULT_SETTINGS, Deps: { Target, Redaction: redaction } })).rejects.toThrow(/base worktree/);
    expect(Calls).toEqual({ Prepare: [], PreparePackages: [], Build: [], Write: [], Run: [], Coverage: [], Cleanup: [] });
  });
});
