import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    CleanRun: vi.fn(async () => undefined),
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
});
