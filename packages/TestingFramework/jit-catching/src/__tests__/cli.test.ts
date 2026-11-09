import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
    LabelCatch: vi.fn(async () => undefined),
    LabelPacket: vi.fn(async () => '# packet\n'),
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
});
