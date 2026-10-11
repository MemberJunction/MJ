/**
 * Tests for how `mj ai` commands end: the database pool is closed so the process can exit — it used
 * to hang after `mj ai agents run` printed its result — and stdout is never cut off or polluted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AI_COMMAND_EXIT_GRACE_MS,
  ArmExitSafetyNet,
  CloseAIProvider,
  EndAICommand,
  RouteConsoleToStderr,
} from '../lib/ai-command-lifecycle.js';

describe('ai-command-lifecycle', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  describe('RouteConsoleToStderr', () => {
    it('sends console.log, info, warn and debug to console.error until restored', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const originalLog = console.log;

      const restore = RouteConsoleToStderr();
      console.log('a');
      console.info('b');
      console.warn('c');
      console.debug('d');
      restore();

      expect(errorSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual(['a', 'b', 'c', 'd']);
      expect(console.log).toBe(originalLog);
    });
  });

  describe('CloseAIProvider', () => {
    it('closes the provider', async () => {
      const close = vi.fn(async () => undefined);
      await CloseAIProvider(close);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('reports a failed close on stderr instead of throwing', async () => {
      await expect(CloseAIProvider(async () => { throw new Error('socket hang up'); })).resolves.toBeUndefined();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('socket hang up'));
    });
  });

  describe('EndAICommand', () => {
    it('closes the pool and sets the exit code without exiting at once', async () => {
      vi.useFakeTimers();
      const close = vi.fn(async () => undefined);

      await EndAICommand(close, 1);

      expect(close).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
      expect(exitSpy).not.toHaveBeenCalled();
      vi.clearAllTimers();
    });
  });

  describe('ArmExitSafetyNet', () => {
    it('does not hold the process open', () => {
      const timer = ArmExitSafetyNet(0);
      expect(timer.hasRef()).toBe(false);
      clearTimeout(timer);
    });

    it('exits with the decided code after the grace period, once stdout has flushed', () => {
      vi.useFakeTimers();
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((_chunk: string, callback?: () => void) => {
        callback?.();
        return true;
      }) as typeof process.stdout.write);

      ArmExitSafetyNet(1);
      vi.advanceTimersByTime(AI_COMMAND_EXIT_GRACE_MS - 1);
      expect(exitSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(stdoutSpy).toHaveBeenCalledWith('', expect.any(Function));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
