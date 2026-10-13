import { describe, it, expect, vi } from 'vitest';
import { ChildProcess, type SpawnOptions } from 'node:child_process';
import { HostSleepGuard, CAFFEINATE_PATH, type SpawnFunction, type SleepAssertionProcess } from '../lib/host-sleep-guard';

/** Stand-in for the spawned caffeinate process: a real (never spawned) ChildProcess with unref/kill recorded. */
class FakeChild extends ChildProcess {
    public Unrefed = false;
    public KilledWith: NodeJS.Signals | number | undefined;
    public override unref(): void {
        this.Unrefed = true;
    }
    public override kill(signal?: NodeJS.Signals | number): boolean {
        this.KilledWith = signal;
        return true;
    }
}

interface SpawnCall {
    Command: string;
    Args: readonly string[];
    Options: SpawnOptions;
}

function fakeSpawn(child: FakeChild, calls: SpawnCall[]): SpawnFunction {
    return (command: string, args: readonly string[], options: SpawnOptions): SleepAssertionProcess => {
        calls.push({ Command: command, Args: args, Options: options });
        return child;
    };
}

describe('HostSleepGuard.Acquire', () => {
    it('on macOS holds caffeinate idle+system sleep assertions bound to the given pid, unref\'d', () => {
        const child = new FakeChild();
        const calls: SpawnCall[] = [];
        const guard = HostSleepGuard.Acquire('darwin', 4242, fakeSpawn(child, calls));
        expect(calls).toHaveLength(1);
        expect(calls[0].Command).toBe(CAFFEINATE_PATH);
        expect(calls[0].Args).toEqual(['-i', '-s', '-w', '4242']);
        expect(calls[0].Options.stdio).toBe('ignore');
        expect(child.Unrefed).toBe(true);
        expect(guard.Active).toBe(true);
        expect(guard.Description).toBe('caffeinate -i -s -w 4242');
    });

    it('Release stops caffeinate once and is idempotent', () => {
        const child = new FakeChild();
        const guard = HostSleepGuard.Acquire('darwin', 1, fakeSpawn(child, []));
        guard.Release();
        expect(child.KilledWith).toBe('SIGTERM');
        expect(guard.Active).toBe(false);
        child.KilledWith = undefined;
        guard.Release();
        expect(child.KilledWith).toBeUndefined();
    });

    it('becomes inactive when caffeinate exits on its own', () => {
        const child = new FakeChild();
        const guard = HostSleepGuard.Acquire('darwin', 1, fakeSpawn(child, []));
        child.emit('exit', 0, null);
        expect(guard.Active).toBe(false);
    });

    it('a caffeinate spawn error warns and leaves the guard inactive, never throws', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const child = new FakeChild();
        const guard = HostSleepGuard.Acquire('darwin', 1, fakeSpawn(child, []));
        child.emit('error', new Error('spawn /usr/bin/caffeinate ENOENT'));
        expect(guard.Active).toBe(false);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ENOENT/));
        warn.mockRestore();
    });

    it('a synchronous spawn failure yields an inactive guard', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const throwing: SpawnFunction = () => { throw new Error('EPERM'); };
        const guard = HostSleepGuard.Acquire('darwin', 1, throwing);
        expect(guard.Active).toBe(false);
        expect(guard.Description).toMatch(/EPERM/);
        warn.mockRestore();
    });

    it('is a no-op off macOS (spawns nothing)', () => {
        const calls: SpawnCall[] = [];
        const guard = HostSleepGuard.Acquire('linux', 1, fakeSpawn(new FakeChild(), calls));
        expect(calls).toHaveLength(0);
        expect(guard.Active).toBe(false);
        guard.Release();
    });
});

describe('HostSleepGuard.Acquire — error text', () => {
    it('an error with an empty message still says what failed', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const child = new FakeChild();
        HostSleepGuard.Acquire('darwin', 1, fakeSpawn(child, []));
        child.emit('error', new Error(''));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown error'));
        warn.mockRestore();
    });
});

describe('HostSleepGuard.AcquireForRun', () => {
    it('logs exactly one status line naming the assertion when it holds one', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const guard = HostSleepGuard.AcquireForRun('darwin', 4242, fakeSpawn(new FakeChild(), []));
        try {
            expect(guard.Active).toBe(true);
            expect(log).toHaveBeenCalledTimes(1);
            expect(log).toHaveBeenCalledWith(expect.stringContaining('caffeinate -i -s -w 4242'));
        } finally {
            guard.Release();
            log.mockRestore();
        }
        expect(guard.Active).toBe(false);
    });

    it('logs nothing when it holds no assertion', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const guard = HostSleepGuard.AcquireForRun('linux', 1, fakeSpawn(new FakeChild(), []));
        expect(guard.Active).toBe(false);
        expect(log).not.toHaveBeenCalled();
        log.mockRestore();
    });
});
