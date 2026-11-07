import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GenerateStep, type GenerateTools } from '../pipeline/Generate';
import { RunDir } from '../pipeline/RunDir';
import { RedactionCheck } from '../sandbox/Redaction';
import { DEFAULT_SETTINGS } from '../settings';
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
      Analyzer: { Analyze: async (_run, text) => { pr = text; return a; } },
      Generator: { Generate: async (r: GenerationRequest): Promise<GenerationResult> => { requests.push(r); return { Tests: r.Method === 'DodgyDiff' ? [candidate(ID_A)] : [], Tokens: { Model: 'm', InputTokens: 2, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0.5 }, TranscriptPath: null }; } },
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
    expect(g.Run.TokensByModel).toEqual([{ Model: 'm', InputTokens: 6, OutputTokens: 3, CacheReadTokens: 0, CostUSD: 1.5 }]);
    expect(g.Tests.map((t) => t.ID)).toEqual([ID_A]);
  });

  it('records a session that throws as one failed test and still writes generation.json', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-gen-')); const redaction = new RedactionCheck([]);
    const a: ChangeAnalysis = { ...analysis(), Risks: [{ ID: 'R1', File: `${PKG_DIR}/src/svc.ts`, Symbol: 'Open', WhatCouldBreak: 'x', HowObserved: 'y' }] };
    const info = { Name: PKG, Dir: PKG_DIR, HasVitest: true, HasTests: true };
    const tools: GenerateTools = {
      EnsureImage: async () => undefined,
      Target: { Prepare: async (r: RevisionRef): Promise<PreparedRevision> => ({ Ref: r, RootDir: '/work/base' }), BuildPackages: async () => undefined },
      Analyzer: { Analyze: async () => a },
      Generator: { Generate: async (r: GenerationRequest): Promise<GenerationResult> => {
        if (r.Method === 'IntentAware') throw new Error('agent crashed\n  at stack');
        return { Tests: [candidate(ID_A)], Tokens: { Model: 'm', InputTokens: 2, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0.5 }, TranscriptPath: null };
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
