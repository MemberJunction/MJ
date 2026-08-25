import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HUMAN_FRIENDLY_ENV } from '@memberjunction/cli-core';
import {
  NonInteractiveError,
  isInteractiveRun,
  resolveOrPrompt,
  requireInteractive,
  failOnNonInteractive,
  withNonInteractiveHandling,
} from '../lib/interactive-guard';

/**
 * These cover the MJCLI half of the agent-first inversion: the ~80 commands that are
 * still plain oclif `Command`s and therefore don't inherit `BaseCLIPlugin`'s handling.
 * The property that matters is uniform: a missing value must produce an error naming
 * the flag, never a process that waits on stdin.
 */

/** Stands in for an oclif Command's `error()`, which is typed as `never`-returning. */
function fakeCommand() {
  const calls: Array<{ message: string; suggestions?: string[]; exit?: number }> = [];
  const command = {
    error: (message: string | Error, options?: { exit?: number; suggestions?: string[] }): never => {
      calls.push({
        message: message instanceof Error ? message.message : message,
        suggestions: options?.suggestions,
        exit: options?.exit,
      });
      throw new Error('__oclif_error__');
    },
  };
  return { command, calls };
}

describe('isInteractiveRun', () => {
  const originalTTY = process.stdin.isTTY;

  beforeEach(() => {
    delete process.env[HUMAN_FRIENDLY_ENV];
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    delete process.env[HUMAN_FRIENDLY_ENV];
    Object.defineProperty(process.stdin, 'isTTY', { value: originalTTY, configurable: true });
  });

  it('is false on a bare terminal run — prompting is opt-in, not TTY-detected', () => {
    expect(isInteractiveRun()).toBe(false);
  });

  it('is true once the prerun hook has forwarded --human-friendly', () => {
    process.env[HUMAN_FRIENDLY_ENV] = '1';
    expect(isInteractiveRun()).toBe(true);
  });

  it('stays false without a TTY even when --human-friendly was forwarded', () => {
    process.env[HUMAN_FRIENDLY_ENV] = '1';
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    expect(isInteractiveRun()).toBe(false);
  });

  it('accepts injected state so a caller can reason without touching the real process', () => {
    expect(isInteractiveRun({ env: { [HUMAN_FRIENDLY_ENV]: '1' }, stdinIsTTY: true })).toBe(true);
    expect(isInteractiveRun({ env: {}, stdinIsTTY: true })).toBe(false);
  });
});

describe('failOnNonInteractive', () => {
  it('routes a NonInteractiveError through oclif with exit 1 and the suggestion attached', () => {
    const { command, calls } = fakeCommand();
    const error = new NonInteractiveError('An entity name', 'Pass --entity "MJ: AI Models".', 'agent-first-default');

    expect(() => failOnNonInteractive(command, error)).toThrow('__oclif_error__');
    expect(calls).toHaveLength(1);
    expect(calls[0].exit).toBe(1);
    // The suggestion must be machine-visible, not only buried in prose.
    expect(calls[0].suggestions).toEqual(['Pass --entity "MJ: AI Models".']);
    expect(calls[0].message).toContain('non-interactive');
  });

  it('re-throws any other error untouched so real failures keep their own handling', () => {
    const { command, calls } = fakeCommand();
    const boom = new Error('database unreachable');

    expect(() => failOnNonInteractive(command, boom)).toThrow('database unreachable');
    expect(calls).toHaveLength(0);
  });
});

describe('withNonInteractiveHandling', () => {
  it('passes a successful result straight through', async () => {
    const { command } = fakeCommand();
    await expect(withNonInteractiveHandling(command, async () => 'done')).resolves.toBe('done');
  });

  it('catches a NonInteractiveError raised deep inside the body', async () => {
    const { command, calls } = fakeCommand();

    const deeplyNested = async () => {
      await resolveOrPrompt({
        flagValue: undefined,
        prompt: async () => 'never',
        what: 'A section list',
        suggestion: 'Pass --sections=primaryKey,sync or --all.',
        interactivity: { env: {}, stdinIsTTY: true },
      });
    };

    await expect(withNonInteractiveHandling(command, deeplyNested)).rejects.toThrow('__oclif_error__');
    expect(calls[0].suggestions).toEqual(['Pass --sections=primaryKey,sync or --all.']);
  });

  it('lets an unrelated error propagate with its own message intact', async () => {
    const { command, calls } = fakeCommand();
    await expect(
      withNonInteractiveHandling(command, async () => {
        throw new Error('migration failed');
      })
    ).rejects.toThrow('migration failed');
    expect(calls).toHaveLength(0);
  });
});

describe('the guarded-prompt property', () => {
  const headless = { env: {}, stdinIsTTY: true };

  it('never invokes the prompt when headless, for any value shape', async () => {
    const prompt = vi.fn();
    const cases = [
      { what: 'A choice', suggestion: 'Pass --setup-entity=no.' },
      { what: 'A confirmation', suggestion: 'Pass --force.' },
      { what: 'A directory', suggestion: 'Pass --dir.' },
    ];

    for (const c of cases) {
      await expect(
        resolveOrPrompt({ flagValue: undefined, prompt, ...c, interactivity: headless })
      ).rejects.toBeInstanceOf(NonInteractiveError);
    }
    expect(prompt).not.toHaveBeenCalled();
  });

  it('always names a concrete flag in the suggestion, never a vague instruction', async () => {
    const error = await resolveOrPrompt({
      flagValue: undefined,
      prompt: async () => 'never',
      what: 'A choice',
      suggestion: 'Pass --setup-entity=ai-prompts|other|no.',
      interactivity: headless,
    }).catch((e: unknown) => e as NonInteractiveError);

    expect(error.suggestion).toMatch(/^Pass --/);
  });
});

describe('requireInteractive', () => {
  it('blocks a wizard-style command that has no flag equivalents', () => {
    expect(() =>
      requireInteractive('The legacy interactive installer', 'Drop --legacy to use the engine installer.', {
        env: {},
        stdinIsTTY: true,
      })
    ).toThrow(NonInteractiveError);
  });

  it('allows it once --human-friendly is in play', () => {
    expect(() =>
      requireInteractive('The legacy interactive installer', 'Drop --legacy.', {
        env: { [HUMAN_FRIENDLY_ENV]: '1' },
        stdinIsTTY: true,
      })
    ).not.toThrow();
  });
});
