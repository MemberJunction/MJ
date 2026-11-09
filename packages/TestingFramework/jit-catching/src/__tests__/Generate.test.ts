import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GenerateError, GenerateStep, type GenerateTools } from '../pipeline/Generate';
import { RunDir } from '../pipeline/RunDir';
import { RedactionCheck } from '../sandbox/Redaction';
import { DEFAULT_SETTINGS } from '../settings';
import { SessionError } from '../generator/UsageCounter';
import type { ChangeAnalysis, GenerationRequest, GenerationResult, PreparedRevision, RevisionRef } from '../types';
import { analysis, BASE_SHA, candidate, FULL_ENV, HEAD_SHA, ID_A, PKG, PKG_DIR } from './helpers/pipelineFixtures';

describe('GenerateStep', () => {
  it('without a PR takes the title from the head commit, sends one DodgyDiff and one IntentAware request per risk, and keeps the base worktree', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-gen-')); const redaction = new RedactionCheck([]);
    const order: string[] = []; const requests: GenerationRequest[] = []; let pr: { Title: string; Body: string } | null = null;
    const a: ChangeAnalysis = { ...analysis(), Risks: [
      { ID: 'R1', File: `${PKG_DIR}/src/svc.ts`, Symbol: 'Open', WhatCouldBreak: 'x', HowObserved: 'y' },
      { ID: 'R2', File: 'packages/Other/src/o.ts', Symbol: 'O', WhatCouldBreak: 'x', HowObserved: 'y' },
      { ID: 'R3', File: `${PKG_DIR}/src/svc.ts`, Symbol: 'Close', WhatCouldBreak: 'x', HowObserved: 'y' }] };
    const tools: GenerateTools = {
      EnsureImage: async () => { order.push('image'); },
      Target: {
        Prepare: async (r: RevisionRef): Promise<PreparedRevision> => { order.push(`prepare ${r.Kind} ${r.SHA}`); return { Ref: r, RootDir: '/work/base' }; },
        BuildPackages: async (_r: PreparedRevision, p: string[]) => { order.push(`build ${p.join(',')}`); },
      },
      Analyzer: { Analyze: async (_run, text) => { pr = text; return a; }, Usage: { Model: 'claude-sonnet-5-5', InputTokens: 7, OutputTokens: 3, CacheReadTokens: 1, CostUSD: 0.25 } },
      Generator: { Generate: async (r: GenerationRequest): Promise<GenerationResult> => { requests.push(r); return { Tests: r.Method === 'DodgyDiff' ? [candidate(ID_A)] : [], Tokens: { Model: 'm', InputTokens: 2, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0.5 }, TranscriptPath: null, EndReason: 'success', Turns: 1 }; } },
      PackageMap: { Get: (n: string) => (n === PKG ? { Name: PKG, Dir: PKG_DIR, HasVitest: true, HasTests: true } : null), PackageForPath: (p: string) => (p.startsWith(`${PKG_DIR}/`) ? { Name: PKG, Dir: PKG_DIR, HasVitest: true, HasTests: true } : null) },
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const subject = vi.fn(async () => 'fix(x): keep Open');
    const { RunID } = await GenerateStep({ PR: null, BaseSHA: BASE_SHA, HeadSHA: HEAD_SHA, Trigger: 'Backtest', RepoRoot: root, Settings: DEFAULT_SETTINGS, Env: FULL_ENV,
      Deps: { GitHub: { GetPullRequest: vi.fn() }, Repo: { Fetch: async () => undefined, MergeBase: vi.fn(), Subject: subject }, Redaction: redaction, ForRun: () => tools } });

    expect(subject).toHaveBeenCalledWith(HEAD_SHA);
    expect(pr).toEqual({ Title: 'fix(x): keep Open', Body: '' });
    expect(order).toEqual(['image', `prepare Base ${BASE_SHA}`, `build ${PKG}`]);
    expect(requests.map((r) => [r.Method, r.Risk?.ID ?? null, r.PackageDir])).toEqual([['DodgyDiff', null, join('/work/base', PKG_DIR)], ['IntentAware', 'R1', join('/work/base', PKG_DIR)], ['IntentAware', 'R3', join('/work/base', PKG_DIR)]]);
    const g = new RunDir(root, RunID, redaction).ReadGeneration();
    expect(g.BaseRootDir).toBe('/work/base');
    expect(g.Run).toMatchObject({ PRNumber: null, Trigger: 'Backtest', BaseSHA: BASE_SHA, HeadSHA: HEAD_SHA, Status: 'Generated' });
    expect(g.Run.TokensByModel).toEqual([{ Model: 'claude-sonnet-5-5', Role: 'Analyzer', InputTokens: 7, OutputTokens: 3, CacheReadTokens: 1, CostUSD: 0.25 }, { Model: 'm', Role: 'Generator', InputTokens: 6, OutputTokens: 3, CacheReadTokens: 0, CostUSD: 1.5 }]);
    expect(g.Tests.map((t) => t.ID)).toEqual([ID_A]);
  });

  it('keeps one model\'s generator and analyzer usage apart by role, and records one session per request with its end reason', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-gen-')); const redaction = new RedactionCheck([]);
    const a: ChangeAnalysis = { ...analysis(), Risks: [
      { ID: 'R1', File: `${PKG_DIR}/src/svc.ts`, Symbol: 'Open', WhatCouldBreak: 'x', HowObserved: 'y' },
      { ID: 'R3', File: `${PKG_DIR}/src/svc.ts`, Symbol: 'Close', WhatCouldBreak: 'x', HowObserved: 'y' }] };
    const info = { Name: PKG, Dir: PKG_DIR, HasVitest: true, HasTests: true };
    const tools: GenerateTools = {
      EnsureImage: async () => undefined,
      Target: { Prepare: async (r: RevisionRef): Promise<PreparedRevision> => ({ Ref: r, RootDir: '/work/base' }), BuildPackages: async () => undefined },
      Analyzer: { Analyze: async () => a, Usage: { Model: 'm', InputTokens: 7, OutputTokens: 3, CacheReadTokens: 1, CostUSD: 0.25 } },
      Generator: { Generate: async (r: GenerationRequest): Promise<GenerationResult> => ({ Tests: r.Method === 'DodgyDiff' ? [candidate(ID_A)] : [],
        Tokens: { Model: 'm', InputTokens: 2, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0.5 }, TranscriptPath: null, EndReason: r.Method === 'DodgyDiff' ? 'success' : 'aborted_token_budget', Turns: 7 }) },
      PackageMap: { Get: () => info, PackageForPath: (p: string) => (p.startsWith(`${PKG_DIR}/`) ? info : null) },
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { RunID } = await GenerateStep({ PR: null, BaseSHA: BASE_SHA, HeadSHA: HEAD_SHA, Trigger: 'Local', RepoRoot: root, Settings: DEFAULT_SETTINGS, Env: FULL_ENV,
      Deps: { GitHub: { GetPullRequest: vi.fn() }, Repo: { Fetch: async () => undefined, MergeBase: vi.fn(), Subject: async () => 's' }, Redaction: redaction, ForRun: () => tools } });
    const g = new RunDir(root, RunID, redaction).ReadGeneration();
    expect(g.Run.TokensByModel.map((u) => [u.Model, u.Role])).toEqual([['m', 'Analyzer'], ['m', 'Generator']]);
    expect(g.Sessions.map((s) => [s.Method, s.RiskID, s.EndReason, s.Turns, s.Produced])).toEqual([['DodgyDiff', null, 'success', 7, 1], ['IntentAware', 'R1', 'aborted_token_budget', 7, 0], ['IntentAware', 'R3', 'aborted_token_budget', 7, 0]]);
  });

  it('records a session that throws as one failed test and still writes generation.json', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-gen-')); const redaction = new RedactionCheck([]);
    const a: ChangeAnalysis = { ...analysis(), Risks: [{ ID: 'R1', File: `${PKG_DIR}/src/svc.ts`, Symbol: 'Open', WhatCouldBreak: 'x', HowObserved: 'y' }] };
    const info = { Name: PKG, Dir: PKG_DIR, HasVitest: true, HasTests: true };
    const tools: GenerateTools = {
      EnsureImage: async () => undefined,
      Target: { Prepare: async (r: RevisionRef): Promise<PreparedRevision> => ({ Ref: r, RootDir: '/work/base' }), BuildPackages: async () => undefined },
      Analyzer: { Analyze: async () => a, Usage: { Model: 'claude-sonnet-5-5', InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0, CostUSD: 0 } },
      Generator: { Generate: async (r: GenerationRequest): Promise<GenerationResult> => {
        if (r.Method === 'IntentAware') throw new Error('agent crashed\n  at stack');
        return { Tests: [candidate(ID_A)], Tokens: { Model: 'm', InputTokens: 2, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0.5 }, TranscriptPath: null, EndReason: 'success', Turns: 1 };
      } },
      PackageMap: { Get: () => info, PackageForPath: () => info },
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { RunID } = await GenerateStep({ PR: null, BaseSHA: BASE_SHA, HeadSHA: HEAD_SHA, Trigger: 'Local', RepoRoot: root, Settings: DEFAULT_SETTINGS, Env: FULL_ENV,
      Deps: { GitHub: { GetPullRequest: vi.fn() }, Repo: { Fetch: async () => undefined, MergeBase: vi.fn(), Subject: async () => 's' }, Redaction: redaction, ForRun: () => tools } });
    const g = new RunDir(root, RunID, redaction).ReadGeneration();
    expect(g.Tests).toHaveLength(2);
    expect(g.Tests[0].ID).toBe(ID_A);
    expect(g.Tests[1]).toMatchObject({ Package: PKG, Method: 'IntentAware', RiskID: 'R1', GenerationOutcome: 'Failed', FailureReason: 'generation session failed: agent crashed', Source: '',
      Tokens: { Model: DEFAULT_SETTINGS.GeneratorModel, InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0, CostUSD: 0 } });
    expect(g.Tests[1].FilePath).toBe(`${PKG_DIR}/src/__tests__/jit/${g.Tests[1].ID}.jit.test.ts`);
    expect(g.Sessions[1]).toMatchObject({ EndReason: 'error', Turns: 0, Failed: 1 });
  });

  it('keeps the usage a failed session reported on its Failed test and in the run totals', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-gen-')); const redaction = new RedactionCheck([]);
    const info = { Name: PKG, Dir: PKG_DIR, HasVitest: true, HasTests: true };
    const spent = { Model: DEFAULT_SETTINGS.GeneratorModel, InputTokens: 900, OutputTokens: 40, CacheReadTokens: 300, CostUSD: 0.75 };
    const tools: GenerateTools = {
      EnsureImage: async () => undefined,
      Target: { Prepare: async (r: RevisionRef): Promise<PreparedRevision> => ({ Ref: r, RootDir: '/work/base' }), BuildPackages: async () => undefined },
      Analyzer: { Analyze: async () => analysis(), Usage: { Model: 'claude-sonnet-5-5', InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0, CostUSD: 0 } },
      Generator: { Generate: async (): Promise<GenerationResult> => { throw new SessionError('Claude Code process exited with code 1', spent); } },
      PackageMap: { Get: () => info, PackageForPath: () => info },
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { RunID } = await GenerateStep({ PR: null, BaseSHA: BASE_SHA, HeadSHA: HEAD_SHA, Trigger: 'Local', RepoRoot: root, Settings: DEFAULT_SETTINGS, Env: FULL_ENV,
      Deps: { GitHub: { GetPullRequest: vi.fn() }, Repo: { Fetch: async () => undefined, MergeBase: vi.fn(), Subject: async () => 's' }, Redaction: redaction, ForRun: () => tools } });
    const g = new RunDir(root, RunID, redaction).ReadGeneration();
    expect(g.Tests).toHaveLength(1);
    expect(g.Tests[0]).toMatchObject({ GenerationOutcome: 'Failed' });
    expect(g.Tests[0].Tokens).toEqual({ ...spent, Role: 'Generator' });
    expect(g.Run.TokensByModel).toContainEqual({ ...spent, Role: 'Generator' });
  });

  it('throws a GenerateError with the run ID, the analyzer and finished session usage and the cause when it fails after the analyzer ran', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-gen-')); const redaction = new RedactionCheck(['super-secret-value-123']);
    const info = { Name: PKG, Dir: PKG_DIR, HasVitest: true, HasTests: true };
    const tools: GenerateTools = {
      EnsureImage: async () => undefined,
      Target: { Prepare: async (r: RevisionRef): Promise<PreparedRevision> => ({ Ref: r, RootDir: '/work/base' }), BuildPackages: async () => undefined },
      Analyzer: { Analyze: async () => ({ ...analysis(), Summary: 'leaks super-secret-value-123' }), Usage: { Model: 'claude-sonnet-5-5', InputTokens: 7, OutputTokens: 3, CacheReadTokens: 1, CostUSD: 0.25 } },
      Generator: { Generate: async (): Promise<GenerationResult> => ({ Tests: [candidate(ID_A)], Tokens: { Model: 'm', InputTokens: 2, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0.5 }, TranscriptPath: null, EndReason: 'success', Turns: 1 }) },
      PackageMap: { Get: () => info, PackageForPath: () => info },
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const e = await GenerateStep({ PR: null, BaseSHA: BASE_SHA, HeadSHA: HEAD_SHA, Trigger: 'Local', RepoRoot: root, Settings: DEFAULT_SETTINGS, Env: FULL_ENV,
      Deps: { GitHub: { GetPullRequest: vi.fn() }, Repo: { Fetch: async () => undefined, MergeBase: vi.fn(), Subject: async () => 's' }, Redaction: redaction, ForRun: () => tools } }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(GenerateError);
    const ge = e as GenerateError;
    expect(ge.RunID).toMatch(/^\d{8}-\d{6}-/);
    expect(ge.Usage).toEqual([
      { Model: 'claude-sonnet-5-5', Role: 'Analyzer', InputTokens: 7, OutputTokens: 3, CacheReadTokens: 1, CostUSD: 0.25 },
      { Model: 'm', Role: 'Generator', InputTokens: 2, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0.5 },
    ]);
    expect(ge.cause).toBeInstanceOf(Error);
    expect(ge.message).toMatch(/generation\.json/);
  });

  it('with a PR and an explicit head uses the given base and head, fetches next, and takes the text from the PR', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-gen-')); const redaction = new RedactionCheck([]);
    const order: string[] = []; const fetches: string[] = []; let pr: { Title: string; Body: string } | null = null;
    const tools: GenerateTools = {
      EnsureImage: async () => { order.push('image'); },
      Target: {
        Prepare: async (r: RevisionRef): Promise<PreparedRevision> => { order.push(`prepare ${r.Kind} ${r.SHA}`); return { Ref: r, RootDir: '/work/base' }; },
        BuildPackages: async (_r: PreparedRevision, p: string[]) => { order.push(`build ${p.join(',')}`); },
      },
      Analyzer: { Analyze: async (_run, text) => { pr = text; return { ...analysis(), Risks: [] }; }, Usage: { Model: 'a', InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0, CostUSD: 0 } },
      Generator: { Generate: async (): Promise<GenerationResult> => ({ Tests: [], Tokens: { Model: 'm', InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0, CostUSD: 0 }, TranscriptPath: null, EndReason: 'success', Turns: 1 }) },
      PackageMap: { Get: (n: string) => (n === PKG ? { Name: PKG, Dir: PKG_DIR, HasVitest: true, HasTests: true } : null), PackageForPath: () => null },
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const getPr = vi.fn(async () => ({ Number: 12, Title: 'fix(x): keep Open', Body: 'Open must stay open.', HeadSHA: 'c'.repeat(40), BaseRef: 'next', HeadRepo: 'o/r', Author: 'a' }));
    const { RunID } = await GenerateStep({ PR: 12, BaseSHA: BASE_SHA, HeadSHA: HEAD_SHA, Trigger: 'Backtest', RepoRoot: root, Settings: DEFAULT_SETTINGS, Env: FULL_ENV,
      Deps: { GitHub: { GetPullRequest: getPr }, Repo: { Fetch: async (ref: string) => { fetches.push(ref); }, MergeBase: vi.fn(), Subject: vi.fn() }, Redaction: redaction, ForRun: () => tools } });

    expect(order).toEqual(['image', `prepare Base ${BASE_SHA}`, `build ${PKG}`]);
    expect(fetches).toEqual(['next']);
    expect(pr).toEqual({ Title: 'fix(x): keep Open', Body: 'Open must stay open.' });
    expect(new RunDir(root, RunID, redaction).ReadGeneration().Run).toMatchObject({ PRNumber: 12, Trigger: 'Backtest', BaseSHA: BASE_SHA, HeadSHA: HEAD_SHA });
  });

  it('refuses before any GitHub, repo or target call when a key is missing or Claude Code is the parent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-gen-'));
    for (const env of [{ ...FULL_ENV, ANTHROPIC_API_KEY: undefined }, { ...FULL_ENV, CLAUDECODE: '1' }]) {
      const forRun = vi.fn(); const getPr = vi.fn(); const fetch = vi.fn();
      await expect(GenerateStep({ PR: 12, Trigger: 'Local', RepoRoot: root, Settings: DEFAULT_SETTINGS, Env: env,
        Deps: { GitHub: { GetPullRequest: getPr }, Repo: { Fetch: fetch, MergeBase: vi.fn(), Subject: vi.fn() }, Redaction: new RedactionCheck([]), ForRun: forRun } })).rejects.toThrow(/ANTHROPIC_API_KEY|Claude Code/);
      expect(getPr).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(forRun).not.toHaveBeenCalled();
    }
  });
});
