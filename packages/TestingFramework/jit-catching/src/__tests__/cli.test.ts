import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Main, type CliDeps } from '../cli';
import { InfrastructureError } from '../target/VitestCatchTarget';

function deps(over: Partial<CliDeps> = {}): CliDeps {
  return {
    RepoRoot: async () => '/repo',
    GenerateStep: vi.fn(async () => ({ RunID: 'r1' })),
    ExecuteStep: vi.fn(async () => undefined),
    AssessStep: vi.fn(async () => ({ Catches: [], Promotions: [] })),
    RunAll: vi.fn(async () => ({ RunID: 'r1', Reported: [] })),
    MineCorpus: vi.fn(async () => ({ Clean: [], Bug: [] })),
    BacktestStep: vi.fn(async () => ({ ID: 'l', CorpusPath: '/c.json', Slice: 'Tuning' as const, Set: 'Bug' as const, Model: 'm', CreatedAt: '2026-11-09T10:00:00.000Z', Entries: [] })),
    ...over,
  };
}

describe('Main', () => {
  let stderr: string[];
  beforeEach(() => { stderr = []; vi.spyOn(process.stderr, 'write').mockImplementation((s: string | Uint8Array) => { stderr.push(String(s)); return true; }); });

  it('returns 2 with a usage error for a non-numeric --pr', async () => {
    const d = deps();
    expect(await Main(['generate', '--pr', 'x'], d)).toBe(2);
    expect(stderr.join('')).toMatch(/usage/);
    expect(d.GenerateStep).not.toHaveBeenCalled();
  });

  it('run --pr 12 calls RunAll with the PR, the settings, the default store and the Local trigger', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'jit-cli-')), 'settings.json'); writeFileSync(path, JSON.stringify({ Repeats: 5 }));
    const d = deps();
    expect(await Main(['run', '--pr', '12', '--settings', path], d)).toBe(0);
    expect(d.RunAll).toHaveBeenCalledWith(expect.objectContaining({ PR: 12, RepoRoot: '/repo', StoreDir: join('/repo', '.jit-catch', 'store'), Trigger: 'Local', Settings: expect.objectContaining({ Repeats: 5 }) }));
  });

  it('turns an InfrastructureError into one stderr line and exit code 1', async () => {
    const d = deps({ ExecuteStep: vi.fn(async () => { throw new InfrastructureError('install failed on Head: offline\n  at stack line'); }) });
    expect(await Main(['execute', '--run', 'r1'], d)).toBe(1);
    expect(stderr.join('')).toBe('jit-catch execute: install failed on Head: offline\n');
  });

  it('redacts token-shaped text in the one-line error', async () => {
    const token = 'ghp_' + 'A1b2C3d4'.repeat(5);
    const d = deps({ AssessStep: vi.fn(async () => { throw new Error(`gh failed: bad credentials ${token}`); }) });
    expect(await Main(['assess', '--run', 'r1'], d)).toBe(1);
    expect(stderr.join('')).not.toContain(token);
    expect(stderr.join('')).toMatch(/^jit-catch assess: /);
  });

  it('returns 2 with a usage error for a --run value that is not a plain run ID', async () => {
    const d = deps();
    expect(await Main(['execute', '--run', '../../x'], d)).toBe(2);
    expect(stderr.join('')).toMatch(/usage/);
    expect(d.ExecuteStep).not.toHaveBeenCalled();
  });
  it('corpus mine writes the mined Clean and Bug lists to --out and prints the counts', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'jit-cli-')), 'mined.json');
    const clean = [{ PR: 10, MergeSHA: 'a'.repeat(40), MergedAt: '2026-01-20T10:00:00Z', Title: 'feat: x', Files: ['packages/X/src/a.ts'] }];
    const d = deps({ MineCorpus: vi.fn(async () => ({ Clean: clean, Bug: [] })) });
    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => { stdout.push(String(s)); return true; });
    expect(await Main(['corpus', 'mine', '--since', '2026-01-01', '--until', '2026-03-31', '--out', out], d)).toBe(0);
    expect(d.MineCorpus).toHaveBeenCalledWith({ RepoRoot: '/repo', Since: '2026-01-01', Until: '2026-03-31' });
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({ Clean: clean, Bug: [] });
    expect(stdout.join('')).toMatch(/1 clean.*0 bug/);
  });

  it('backtest calls BacktestStep with the corpus, slice, set, model, the default --max-usd 50 and --only', async () => {
    const d = deps();
    expect(await Main(['backtest', '--corpus', 'c.json', '--slice', 'HeldOut', '--set', 'Both', '--model', 'gen-model', '--only', '3,5'], d)).toBe(0);
    expect(d.BacktestStep).toHaveBeenCalledWith(expect.objectContaining({ CorpusPath: resolve('c.json'), Slice: 'HeldOut', Set: 'Both', Model: 'gen-model', MaxUsd: 50, Only: [3, 5], RepoRoot: '/repo', StoreDir: join('/repo', '.jit-catch', 'store') }));
  });

  it('backtest --retry-failed sets RetryFailed', async () => {
    const d = deps();
    expect(await Main(['backtest', '--corpus', 'c.json', '--slice', 'Tuning', '--set', 'Bug', '--model', 'm', '--retry-failed'], d)).toBe(0);
    expect(d.BacktestStep).toHaveBeenCalledWith(expect.objectContaining({ RetryFailed: true }));
  });

  it('backtest returns 2 and names the option for a bad --slice, --set, --max-usd or --only, or a missing --corpus or --model', async () => {
    const d = deps();
    const base = { '--corpus': 'c.json', '--slice': 'Tuning', '--set': 'Bug', '--model': 'm' };
    const cases: [Record<string, string | null>, RegExp][] = [
      [{ '--slice': 'All' }, /--slice must be Tuning or HeldOut/], [{ '--set': 'Some' }, /--set must be Bug, Clean or Both/],
      [{ '--model': null }, /backtest needs --model/], [{ '--corpus': null }, /backtest needs --corpus/],
      [{ '--max-usd': '0' }, /--max-usd must be a positive number/], [{ '--only': '3,x' }, /--only must be PR numbers separated by commas/],
    ];
    for (const [over, message] of cases) {
      stderr.length = 0;
      const args = Object.entries({ ...base, ...over }).flatMap(([k, v]) => (v === null ? [] : [k, v]));
      expect(await Main(['backtest', ...args], d)).toBe(2);
      expect(stderr.join('')).toMatch(message);
    }
    expect(d.BacktestStep).not.toHaveBeenCalled();
  });
});
