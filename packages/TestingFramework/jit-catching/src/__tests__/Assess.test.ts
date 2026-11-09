import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssessStep } from '../pipeline/Assess';
import { RunDir } from '../pipeline/RunDir';
import { RuleFilter } from '../rules/RuleFilter';
import { AllRules } from '../rules/index';
import { FileCatchStore } from '../store/FileCatchStore';
import { RedactionCheck } from '../sandbox/Redaction';
import { DEFAULT_SETTINGS } from '../settings';
import type { PanelResult } from '../judges/JudgePanel';
import type { CatchContext } from '../types';
import { candidate, FULL_ENV, generation, ID_A, ID_B, ID_C, PKG_DIR, results, RUN_ID } from './helpers/pipelineFixtures';

const SVC = 'export class Svc { private secret = 1; public Open(): number { return 4; } }\n';
const SOURCE_A = `import { it, expect } from 'vitest';\nimport { Svc } from '../../svc';\nit('opens', () => { expect(new Svc().Open()).toBe(3); });\n`;
const SOURCE_C = `import { it, expect } from 'vitest';\nimport { Svc } from '../../svc';\nit('reads', () => { expect((new Svc() as unknown as { secret: number }).secret).toBe(2); });\n`;

describe('AssessStep', () => {
  let root: string; let base: string; let storeDir: string; const redaction = new RedactionCheck([]);
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'jit-assess-')); storeDir = join(root, 'store');
    const dir = new RunDir(root, RUN_ID, redaction); base = join(dir.Path, 'work', 'base');
    mkdirSync(join(base, PKG_DIR, 'src'), { recursive: true }); writeFileSync(join(base, PKG_DIR, 'src/svc.ts'), SVC);
    const tests = [candidate(ID_A, SOURCE_A), candidate(ID_B), candidate(ID_C, SOURCE_C)];
    dir.WriteGeneration(generation(base, tests));
    dir.WriteExecution({ RunID: RUN_ID, Tests: tests, Coverage: [{ CandidateTestID: ID_B, CoveredChangedLines: 4 }],
      Results: [...results(ID_A, 'Base', true), ...results(ID_A, 'Head', false), ...results(ID_B, 'Base', true), ...results(ID_B, 'Head', true), ...results(ID_C, 'Base', true), ...results(ID_C, 'Head', false)],
      TypeErrors: Object.fromEntries(tests.map((t) => [t.ID, { Base: null, Head: null }])) });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('judges surviving weak catches, ranks them, offers promotions and saves the run', async () => {
    const judge = vi.fn(async (_c: CatchContext): Promise<PanelResult> => ({ TPProb: 0.8, Buckets: [{ Model: 'm', Bucket: 'High', Reason: 'real regression' }], Median: 'High',
      Usage: [{ Model: 'judge-model', InputTokens: 11, OutputTokens: 2, CacheReadTokens: 0, CostUSD: 0.125 }] }));
    const store = new FileCatchStore(storeDir, redaction);
    const out = await AssessStep({ RunID: RUN_ID, RepoRoot: root, Settings: DEFAULT_SETTINGS, StoreDir: storeDir, Env: FULL_ENV,
      Deps: { JudgePanel: { Judge: judge }, Rules: new RuleFilter(AllRules()), Store: store, Redaction: redaction } });

    const a = out.Catches.find((c) => c.CandidateTestID === ID_A);
    expect(a).toMatchObject({ Verdict: { Label: 'WeakCatch' }, DroppedByRule: null, Median: 'High', TPProb: 0.8, Rank: 1, Reported: true });
    const c = out.Catches.find((x) => x.CandidateTestID === ID_C);
    expect(c).toMatchObject({ Verdict: { Label: 'WeakCatch' }, DroppedByRule: 'PrivateAccess', Median: null, Rank: null, Reported: false });
    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge.mock.calls[0][0].Test.ID).toBe(ID_A);
    expect(out.Promotions).toEqual([{ CandidateTestID: ID_B, RunID: RUN_ID, NewlyCoveredLines: 4, State: 'Offered' }]);
    expect(await store.GetRun(RUN_ID)).toMatchObject({ Status: 'Assessed' });
    expect((await store.GetRun(RUN_ID))?.TokensByModel).toContainEqual({ Model: 'judge-model', InputTokens: 11, OutputTokens: 2, CacheReadTokens: 0, CostUSD: 0.125 });
    expect((await store.ListCatches(RUN_ID)).map((x) => x.CandidateTestID).sort()).toEqual([ID_A, ID_B, ID_C].sort());
  });

  it('keeps one catch per test in the store when the step runs again on the same run', async () => {
    const judge = vi.fn(async (_c: CatchContext): Promise<PanelResult> => ({ TPProb: 0.8, Buckets: [{ Model: 'm', Bucket: 'High', Reason: 'r' }], Median: 'High', Usage: [] }));
    const store = new FileCatchStore(storeDir, redaction);
    const opts = { RunID: RUN_ID, RepoRoot: root, Settings: DEFAULT_SETTINGS, StoreDir: storeDir, Env: FULL_ENV,
      Deps: { JudgePanel: { Judge: judge }, Rules: new RuleFilter(AllRules()), Store: store, Redaction: redaction } };
    const first = await AssessStep(opts); const second = await AssessStep(opts);
    expect(second.Catches.map((c) => c.ID).sort()).toEqual(first.Catches.map((c) => c.ID).sort());
    expect((await store.ListCatches(RUN_ID)).map((x) => x.CandidateTestID).sort()).toEqual([ID_A, ID_B, ID_C].sort());
  });

  it('refuses a BaseRootDir outside the run folder before judging or saving', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'jit-outside-'));
    const dir = new RunDir(root, RUN_ID, redaction);
    dir.WriteGeneration(generation(outside, [candidate(ID_A, SOURCE_A)]));
    const judge = vi.fn(async (_c: CatchContext): Promise<PanelResult> => ({ TPProb: null, Buckets: [], Median: null, Usage: [] }));
    const store = new FileCatchStore(storeDir, redaction);
    await expect(AssessStep({ RunID: RUN_ID, RepoRoot: root, Settings: DEFAULT_SETTINGS, StoreDir: storeDir, Env: FULL_ENV,
      Deps: { JudgePanel: { Judge: judge }, Rules: new RuleFilter(AllRules()), Store: store, Redaction: redaction } })).rejects.toThrow(/base worktree/);
    expect(judge).not.toHaveBeenCalled();
    expect(await store.GetRun(RUN_ID)).toBeNull();
  });

  it('refuses before judging or saving when a judge vendor key is missing', async () => {
    const judge = vi.fn(async (_c: CatchContext): Promise<PanelResult> => ({ TPProb: null, Buckets: [], Median: null, Usage: [] }));
    const store = new FileCatchStore(storeDir, redaction);
    await expect(AssessStep({ RunID: RUN_ID, RepoRoot: root, Settings: DEFAULT_SETTINGS, StoreDir: storeDir, Env: { ...FULL_ENV, GEMINI_API_KEY: undefined },
      Deps: { JudgePanel: { Judge: judge }, Rules: new RuleFilter(AllRules()), Store: store, Redaction: redaction } })).rejects.toThrow(/GEMINI_API_KEY/);
    expect(judge).not.toHaveBeenCalled();
    expect(await store.GetRun(RUN_ID)).toBeNull();
  });

  it('an unknown run fails before the store folder is created', async () => {
    const fresh = mkdtempSync(join(tmpdir(), 'jit-assess-')); const store = join(fresh, 'store');
    await expect(AssessStep({ RunID: 'nope', RepoRoot: fresh, Settings: DEFAULT_SETTINGS, StoreDir: store, Env: FULL_ENV })).rejects.toThrow('run nope not found');
    expect(existsSync(store)).toBe(false);
    expect(existsSync(join(fresh, '.jit-catch', 'runs', 'nope'))).toBe(false);
  });
});
