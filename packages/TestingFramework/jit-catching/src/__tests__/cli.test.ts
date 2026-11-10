import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Main, type CliDeps } from '../cli';
import { InfrastructureError } from '../target/VitestCatchTarget';
import { RunAllError } from '../pipeline/Run';
import { z } from 'zod';

function deps(over: Partial<CliDeps> = {}): CliDeps {
  return {
    RepoRoot: async () => '/repo',
    GenerateStep: vi.fn(async () => ({ RunID: 'r1' })),
    ExecuteStep: vi.fn(async () => undefined),
    AssessStep: vi.fn(async () => ({ Catches: [], Promotions: [] })),
    RunAll: vi.fn(async () => ({ RunID: 'r1', Reported: [] })),
    MineCorpus: vi.fn(async () => ({ Clean: [], Bug: [] })),
    CleanRun: vi.fn(async () => undefined),
    LabelCatch: vi.fn(async () => undefined),
    LabelPacket: vi.fn(async () => '# packet\n'),
    BacktestStep: vi.fn(async () => ({ Ledger: { ID: 'l', CorpusPath: '/c.json', Slice: 'Tuning' as const, Set: 'Bug' as const, Model: 'm', CreatedAt: '2026-11-09T10:00:00.000Z', Entries: [] }, Stopped: null })),
    MatchStep: vi.fn(async () => ({ ID: 'l', CorpusPath: '/c.json', Slice: 'Tuning' as const, Set: 'Bug' as const, Model: 'm', CreatedAt: '2026-11-09T10:00:00.000Z', Entries: [] })),
    BuildGateReport: vi.fn(async () => ({ GeneratedAt: '2026-11-09T10:00:00.000Z', Models: [] })),
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

  it('prints the path: message pairs of a ZodError wrapped in a RunAllError', async () => {
    const zodError = z.object({ Status: z.string() }).safeParse({ Status: 1 }).error;
    const d = deps({ RunAll: vi.fn(async () => { throw new RunAllError('r1', 'Assess', zodError); }) });
    expect(await Main(['run', '--pr', '12'], d)).toBe(1);
    expect(stderr.join('')).toMatch(/^jit-catch run: Status: /);
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

  it('clean --run <id> calls CleanRun with the repository root and the run ID', async () => {
    const d = deps();
    expect(await Main(['clean', '--run', 'r1'], d)).toBe(0);
    expect(d.CleanRun).toHaveBeenCalledWith('/repo', 'r1', expect.anything());
  });

  it('returns 2 with a usage error for clean without --run or --all-finished', async () => {
    const d = deps();
    expect(await Main(['clean'], d)).toBe(2);
    expect(stderr.join('')).toMatch(/clean needs --run or --all-finished/);
    expect(d.CleanRun).not.toHaveBeenCalled();
  });

  it('label --catch --answer --user calls LabelCatch with the default store', async () => {
    const d = deps(); const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(await Main(['label', '--catch', id, '--answer', 'TestFault', '--user', 'octo'], d)).toBe(0);
    expect(d.LabelCatch).toHaveBeenCalledWith(expect.objectContaining({ StoreDir: join('/repo', '.jit-catch', 'store'), CatchID: id, Answer: 'TestFault', User: 'octo' }));
  });

  it('label --run prints the packet to stdout', async () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => { out.push(String(s)); return true; });
    const d = deps();
    expect(await Main(['label', '--run', 'r1'], d)).toBe(0);
    expect(d.LabelPacket).toHaveBeenCalledWith(expect.objectContaining({ RunID: 'r1', RepoRoot: '/repo', StoreDir: join('/repo', '.jit-catch', 'store') }));
    expect(out.join('')).toBe('# packet\n');
  });

  it('label without --catch or --run is a usage error', async () => {
    const d = deps();
    expect(await Main(['label'], d)).toBe(2);
    expect(stderr.join('')).toMatch(/usage/);
  });

  it('label with an --answer other than Bug, Intended or TestFault is a usage error', async () => {
    const d = deps();
    expect(await Main(['label', '--catch', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '--answer', 'AuthorChangedPR', '--user', 'octo'], d)).toBe(2);
    expect(stderr.join('')).toMatch(/--answer must be one of Bug, Intended, TestFault/);
    expect(d.LabelCatch).not.toHaveBeenCalled();
  });

  it('backtest calls BacktestStep with the corpus, slice, set, model, --max-usd and --only', async () => {
    const d = deps();
    expect(await Main(['backtest', '--corpus', 'c.json', '--slice', 'HeldOut', '--set', 'Both', '--model', 'claude-haiku-5-5', '--max-usd', '20', '--only', '3,5'], d)).toBe(0);
    expect(d.BacktestStep).toHaveBeenCalledWith(expect.objectContaining({ CorpusPath: resolve('c.json'), Slice: 'HeldOut', Set: 'Both', Model: 'claude-haiku-5-5', MaxUsd: 20, Only: [3, 5], RepoRoot: '/repo', StoreDir: join('/repo', '.jit-catch', 'store') }));
  });

  it('backtest returns 3 when the run stopped early', async () => {
    const d = deps({ BacktestStep: vi.fn(async () => ({ Ledger: { ID: 'l', CorpusPath: '/c.json', Slice: 'Tuning' as const, Set: 'Bug' as const, Model: 'm', CreatedAt: '2026-11-09T10:00:00.000Z', Entries: [] }, Stopped: 'cap' as const })) });
    expect(await Main(['backtest', '--corpus', 'c.json', '--slice', 'Tuning', '--set', 'Bug', '--model', 'claude-haiku-5-5', '--max-usd', '5'], d)).toBe(3);
  });

  it('label with both --catch and --run is a usage error', async () => {
    const d = deps();
    expect(await Main(['label', '--catch', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '--answer', 'Bug', '--user', 'octo', '--run', 'r1'], d)).toBe(2);
    expect(stderr.join('')).toMatch(/label needs --catch or --run, not both/);
    expect(d.LabelCatch).not.toHaveBeenCalled();
    expect(d.LabelPacket).not.toHaveBeenCalled();
  });

  it('corpus mine refuses to write a list that holds a key and leaves --out unwritten', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jit-cli-')); const out = join(dir, 'mined.json');
    const token = 'ghp_' + 'A1b2C3d4'.repeat(5);
    const clean = [{ PR: 10, MergeSHA: 'a'.repeat(40), MergedAt: '2026-01-20T10:00:00Z', Title: `feat: ${token}`, Files: ['packages/X/src/a.ts'] }];
    const d = deps({ MineCorpus: vi.fn(async () => ({ Clean: clean, Bug: [] })) });
    try {
      expect(await Main(['corpus', 'mine', '--since', '2026-01-01', '--until', '2026-03-31', '--out', out], d)).toBe(1);
      expect(existsSync(out)).toBe(false);
      expect(stderr.join('')).not.toContain(token);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('backtest --retry-failed sets RetryFailed', async () => {
    const d = deps();
    expect(await Main(['backtest', '--corpus', 'c.json', '--slice', 'Tuning', '--set', 'Bug', '--model', 'claude-haiku-5-5', '--max-usd', '5', '--retry-failed'], d)).toBe(0);
    expect(d.BacktestStep).toHaveBeenCalledWith(expect.objectContaining({ RetryFailed: true }));
  });

  it('backtest match calls MatchStep with the ledger ID and corpus', async () => {
    const d = deps();
    expect(await Main(['backtest', 'match', '--ledger', 'corpus-Tuning-Bug-m', '--corpus', 'c.json'], d)).toBe(0);
    expect(d.MatchStep).toHaveBeenCalledWith(expect.objectContaining({ LedgerID: 'corpus-Tuning-Bug-m', CorpusPath: resolve('c.json'), RepoRoot: '/repo', StoreDir: join('/repo', '.jit-catch', 'store') }));
    expect(d.BacktestStep).not.toHaveBeenCalled();
  });

  it('backtest match returns 2 for a ledger ID that is not a file name', async () => {
    const d = deps();
    expect(await Main(['backtest', 'match', '--ledger', '../x', '--corpus', 'c.json'], d)).toBe(2);
    expect(stderr.join('')).toMatch(/backtest match needs --ledger as a ledger ID/);
    expect(d.MatchStep).not.toHaveBeenCalled();
  });

  it('backtest returns 2 and names the option for a bad --slice, --set, --max-usd or --only, or a missing --corpus, --model or --max-usd', async () => {
    const d = deps();
    const base = { '--corpus': 'c.json', '--slice': 'Tuning', '--set': 'Bug', '--model': 'm', '--max-usd': '5' };
    const cases: [Record<string, string | null>, RegExp][] = [
      [{ '--slice': 'All' }, /--slice must be Tuning or HeldOut/], [{ '--set': 'Some' }, /--set must be Bug, Clean or Both/],
      [{ '--model': null }, /backtest needs --model/], [{ '--corpus': null }, /backtest needs --corpus/],
      [{ '--max-usd': '0' }, /--max-usd must be a positive number/], [{ '--only': '3,x' }, /--only must be PR numbers separated by commas/],
      [{ '--max-usd': null }, /backtest needs --max-usd/],
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

describe('Main warning listeners', () => {
  it('keeps the process warning listeners it was started with', async () => {
    const original = process.listeners('warning');
    const mine = (): void => undefined;
    process.removeAllListeners('warning');
    process.on('warning', mine);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await Main(['generate', '--pr', 'x'], deps());
      expect(process.listeners('warning')).toEqual([mine]);
    } finally {
      process.removeAllListeners('warning');
      for (const l of original) process.on('warning', l);
      vi.restoreAllMocks();
    }
  });
});

describe('Main backtest model', () => {
  it('returns 2 and names the priced models when --model has no price in the settings', async () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((s: string | Uint8Array) => { stderr.push(String(s)); return true; });
    const d = deps();
    expect(await Main(['backtest', '--corpus', 'c.json', '--slice', 'Tuning', '--set', 'Bug', '--model', 'unpriced-model', '--max-usd', '10'], d)).toBe(2);
    expect(stderr.join('')).toMatch(/--model unpriced-model has no price.*claude-haiku-5-5/);
    expect(d.BacktestStep).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('Main report', () => {
  let root: string;
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    root = mkdtempSync(join(tmpdir(), 'jit-cli-report-'));
    mkdirSync(join(root, '.jit-catch', 'backtests'), { recursive: true });
    for (const [id, model] of [['c-Tuning-Bug-m1', 'm1'], ['c-Tuning-Clean-m2', 'm2']]) {
      writeFileSync(join(root, '.jit-catch', 'backtests', `${id}.json`), JSON.stringify({ ID: id, CorpusPath: '/c.json', Slice: 'Tuning', Set: 'Bug', Model: model, CreatedAt: '2026-11-09T10:00:00.000Z', Entries: [] }));
    }
    writeFileSync(join(root, 'corpus.json'), JSON.stringify({ Version: 1, Seed: 1, Bug: [], Clean: [] }));
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });

  it('reads every --ledger and the corpus, builds the report and prints it to stdout', async () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => { out.push(String(s)); return true; });
    const d = deps({ RepoRoot: async () => root });
    expect(await Main(['report', '--ledger', 'c-Tuning-Bug-m1,c-Tuning-Clean-m2', '--corpus', join(root, 'corpus.json')], d)).toBe(0);
    expect(d.BuildGateReport).toHaveBeenCalledWith(expect.objectContaining({
      Ledgers: [expect.objectContaining({ ID: 'c-Tuning-Bug-m1' }), expect.objectContaining({ ID: 'c-Tuning-Clean-m2' })], Corpus: { Version: 1, Seed: 1, Bug: [], Clean: [] },
    }));
    expect(out.join('')).toMatch(/^# Gate-1 report/);
  });

  it('writes the report to --out', async () => {
    const d = deps({ RepoRoot: async () => root }); const file = join(root, 'gate.md');
    expect(await Main(['report', '--ledger', 'c-Tuning-Bug-m1', '--corpus', join(root, 'corpus.json'), '--out', file], d)).toBe(0);
    expect(readFileSync(file, 'utf8')).toMatch(/^# Gate-1 report/);
  });

  it('refuses to write or print a report that holds a key', async () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => { out.push(String(s)); return true; });
    const token = 'ghp_' + 'A1b2C3d4'.repeat(5);
    const report = { GeneratedAt: '2026-11-09T10:00:00.000Z', Models: [] };
    const d = deps({ RepoRoot: async () => root, BuildGateReport: vi.fn(async () => ({ ...report, GeneratedAt: token })) });
    const file = join(root, 'gate.md');
    expect(await Main(['report', '--ledger', 'c-Tuning-Bug-m1', '--corpus', join(root, 'corpus.json'), '--out', file], d)).toBe(1);
    expect(existsSync(file)).toBe(false);
    expect(await Main(['report', '--ledger', 'c-Tuning-Bug-m1', '--corpus', join(root, 'corpus.json')], d)).toBe(1);
    expect(out.join('')).not.toContain(token);
  });

  it('returns 2 when one --ledger item is not a ledger ID, and 1 when a ledger file is missing', async () => {
    const d = deps({ RepoRoot: async () => root });
    expect(await Main(['report', '--ledger', 'c-Tuning-Bug-m1,../x', '--corpus', 'c.json'], d)).toBe(2);
    expect(await Main(['report', '--ledger', 'nope', '--corpus', join(root, 'corpus.json')], d)).toBe(1);
    expect(d.BuildGateReport).not.toHaveBeenCalled();
  });
});
