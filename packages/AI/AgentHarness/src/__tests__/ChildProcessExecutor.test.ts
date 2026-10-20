import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { WrapChildProcess } from '../sandbox/ChildProcessExecutor';

/**
 * Minimal fake of the Node `ChildProcess` surface `WrapChildProcess` actually touches: stdout/stderr
 * streams, `exitCode`/`killed` flags, `kill(signal)`, and `EventEmitter`'s `once()` for
 * 'close'/'error'/'exit'. Mirrors real Node semantics that matter for this test: `killed` flips to
 * `true` synchronously as soon as `kill()` is called (NOT when the process actually exits) — see
 * `simulateExit()` for the separate, later "the OS actually terminated it" transition.
 */
class FakeChildProcess extends EventEmitter {
    public stdout = new PassThrough();
    public stderr = new PassThrough();
    public exitCode: number | null = null;
    public killed = false;
    public kill = vi.fn((_signal?: string) => {
        this.killed = true;
        return true;
    });

    /** Simulates the OS actually terminating the process (fires 'exit'/'close', matching real Node). */
    simulateExit(code: number | null = 0): void {
        this.exitCode = code;
        this.emit('exit', code);
        this.emit('close', code);
    }
}

describe('WrapChildProcess.Kill — SIGTERM/SIGKILL escalation (Round 16 leak fix)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('sends SIGTERM on the first call', () => {
        const child = new FakeChildProcess();
        const proc = WrapChildProcess(child as unknown as ChildProcessWithoutNullStreams);

        proc.Kill();

        expect(child.kill).toHaveBeenCalledTimes(1);
        expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('escalates to SIGKILL after the grace period if the process is still running', () => {
        const child = new FakeChildProcess();
        const proc = WrapChildProcess(child as unknown as ChildProcessWithoutNullStreams);

        proc.Kill();
        expect(child.kill).toHaveBeenCalledTimes(1); // SIGTERM only so far

        vi.advanceTimersByTime(5000);

        expect(child.kill).toHaveBeenCalledTimes(2);
        expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
    });

    it('does NOT escalate to SIGKILL once the process has actually exited, even though `killed` was already true from the SIGTERM call', () => {
        const child = new FakeChildProcess();
        const proc = WrapChildProcess(child as unknown as ChildProcessWithoutNullStreams);

        proc.Kill();
        // Node sets `killed = true` synchronously right after the kill() call succeeds — well before
        // (or even without) the process actually dying. Confirm the escalation logic does NOT trust
        // that flag to mean "already dead": if it did, the SIGKILL check below would spuriously pass.
        expect(child.killed).toBe(true);
        expect(child.exitCode).toBeNull();

        // The OS actually terminates the process before the grace period elapses.
        child.simulateExit(0);

        vi.advanceTimersByTime(5000);

        expect(child.kill).toHaveBeenCalledTimes(1); // no SIGKILL follow-up — the timer was cleared
    });

    it('is a no-op if the process has already exited before Kill() is called', () => {
        const child = new FakeChildProcess();
        child.simulateExit(0);
        const proc = WrapChildProcess(child as unknown as ChildProcessWithoutNullStreams);

        proc.Kill();

        expect(child.kill).not.toHaveBeenCalled();
    });

    it('is safe to call Kill() more than once', () => {
        const child = new FakeChildProcess();
        const proc = WrapChildProcess(child as unknown as ChildProcessWithoutNullStreams);

        proc.Kill();
        proc.Kill(); // second call: `killed` is already true from the first, so this is a no-op

        expect(child.kill).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(5000);

        expect(child.kill).toHaveBeenCalledTimes(2); // only the first call's escalation fires
    });

    it('does not leave a dangling force-kill timer after a prompt exit (no unhandled timer warnings)', () => {
        const child = new FakeChildProcess();
        const proc = WrapChildProcess(child as unknown as ChildProcessWithoutNullStreams);
        const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

        proc.Kill();
        child.simulateExit(0);

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
    });
});
