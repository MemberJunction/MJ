/**
 * Tests for the pnpm process wrappers (src/lib/dev-workspace/pnpm.ts).
 * No process is ever forked — the spawner is injected as a typed fake.
 */
import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { GetPnpmVersion, RunPnpmInstall } from '../lib/dev-workspace/pnpm.js';
import type { SpawnWorkspaceProcess, WorkspaceChildProcess, WorkspaceStdio } from '../lib/dev-workspace/pnpm.js';

/** Recorded arguments of one fake spawn call. */
interface SpawnCall {
  Command: string;
  Args: string[];
  Cwd: string;
  Stdio: WorkspaceStdio;
}

/** Controllable fake child process satisfying the narrow structural type. */
class FakeChildProcess extends EventEmitter implements WorkspaceChildProcess {
  public stdout = new EventEmitter();
  public KillSignals: string[] = [];

  public kill(signal?: NodeJS.Signals): boolean {
    this.KillSignals.push(signal ?? 'SIGTERM');
    return true;
  }
}

/** Builds a spawner that records its calls and hands back the given fake child. */
function fakeSpawner(child: FakeChildProcess, calls: SpawnCall[]): SpawnWorkspaceProcess {
  return (command, args, options) => {
    calls.push({ Command: command, Args: [...args], Cwd: options.cwd, Stdio: options.stdio });
    return child;
  };
}

describe('RunPnpmInstall', () => {
  it('spawns `pnpm install` at the parent with inherited stdio and resolves on exit 0', async () => {
    const child = new FakeChildProcess();
    const calls: SpawnCall[] = [];
    const promise = RunPnpmInstall('/the/parent', fakeSpawner(child, calls));
    child.emit('close', 0);
    await expect(promise).resolves.toBeUndefined();
    expect(calls).toEqual([{ Command: 'pnpm', Args: ['install'], Cwd: '/the/parent', Stdio: 'inherit' }]);
  });

  it('rejects with the exit code on a non-zero exit', async () => {
    const child = new FakeChildProcess();
    const promise = RunPnpmInstall('/the/parent', fakeSpawner(child, []));
    child.emit('close', 2);
    await expect(promise).rejects.toThrow(/exited with code 2/);
  });

  it('rejects with a pnpm-not-found hint when the spawn itself fails with ENOENT', async () => {
    const child = new FakeChildProcess();
    const promise = RunPnpmInstall('/the/parent', fakeSpawner(child, []));
    const enoent: NodeJS.ErrnoException = new Error('spawn pnpm ENOENT');
    enoent.code = 'ENOENT';
    child.emit('error', enoent);
    await expect(promise).rejects.toThrow(/pnpm not found on PATH/);
  });
});

describe('GetPnpmVersion', () => {
  it('returns the trimmed version from stdout on exit 0', async () => {
    const child = new FakeChildProcess();
    const calls: SpawnCall[] = [];
    const promise = GetPnpmVersion('/the/parent', fakeSpawner(child, calls));
    child.stdout.emit('data', Buffer.from('10.33.0\n'));
    child.emit('close', 0);
    await expect(promise).resolves.toBe('10.33.0');
    expect(calls[0].Args).toEqual(['--version']);
    expect(calls[0].Stdio).toEqual(['ignore', 'pipe', 'ignore']);
  });

  it('returns null when pnpm cannot be spawned (never throws)', async () => {
    const child = new FakeChildProcess();
    const promise = GetPnpmVersion('/the/parent', fakeSpawner(child, []));
    child.emit('error', new Error('spawn pnpm ENOENT'));
    await expect(promise).resolves.toBeNull();
  });

  it('returns null on a non-zero exit or non-version output', async () => {
    const failing = new FakeChildProcess();
    const failingPromise = GetPnpmVersion('/p', fakeSpawner(failing, []));
    failing.emit('close', 1);
    await expect(failingPromise).resolves.toBeNull();

    const garbled = new FakeChildProcess();
    const garbledPromise = GetPnpmVersion('/p', fakeSpawner(garbled, []));
    garbled.stdout.emit('data', Buffer.from('This project is configured to use npm\n'));
    garbled.emit('close', 0);
    await expect(garbledPromise).resolves.toBeNull();
  });
});
