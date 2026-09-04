import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { INTERACTIVE_ENV } from '@memberjunction/cli-core';
import {
  NonInteractiveError,
  isInteractiveRun,
  resolveOrPrompt,
  requireInteractive,
  failOnNonInteractive,
  withNonInteractiveHandling,
} from '../lib/interactive-guard';

/**
 * These cover the MJCLI half of the interactivity contract: the ~80 commands that are
 * still plain oclif `Command`s and therefore don't inherit `BaseCLIPlugin`'s handling.
 * Two properties matter, and they pull in opposite directions:
 *
 * - a human at a terminal still gets prompted, with no flag;
 * - a missing value in any automated context produces an error naming the flag,
 *   never a process that waits on stdin.
 */

/** A real terminal. */
const terminal = { env: {}, stdinIsTTY: true, stdoutIsTTY: true };
/** An agent or script: stdio is piped. */
const piped = { env: {}, stdinIsTTY: false, stdoutIsTTY: false };

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
  const originalStdin = process.stdin.isTTY;
  const originalStdout = process.stdout.isTTY;

  const setTTY = (isTTY: boolean) => {
    Object.defineProperty(process.stdin, 'isTTY', { value: isTTY, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true });
  };

  beforeEach(() => {
    delete process.env[INTERACTIVE_ENV];
  });

  afterEach(() => {
    delete process.env[INTERACTIVE_ENV];
    Object.defineProperty(process.stdin, 'isTTY', { value: originalStdin, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: originalStdout, configurable: true });
  });

  it('reads the real process state when given no overrides', () => {
    // vitest runs without a terminal, which is exactly the automation case.
    setTTY(false);
    expect(isInteractiveRun({ env: {} })).toBe(false);
  });

  it('honors the env var the prerun hook sets from --no-interactive', () => {
    setTTY(true);
    process.env[INTERACTIVE_ENV] = '0';
    expect(isInteractiveRun()).toBe(false);
  });

  it('accepts injected state so a caller can reason without touching the real process', () => {
    expect(isInteractiveRun(terminal)).toBe(true);
    expect(isInteractiveRun(piped)).toBe(false);
  });
});

describe('failOnNonInteractive', () => {
  it('routes a NonInteractiveError through oclif with exit 1 and the suggestion attached', () => {
    const { command, calls } = fakeCommand();
    const error = new NonInteractiveError('An entity name', 'Pass --entity "MJ: AI Models".', 'no-tty');

    expect(() => failOnNonInteractive(command, error)).toThrow('__oclif_error__');
    expect(calls).toHaveLength(1);
    expect(calls[0].exit).toBe(1);
    // The suggestion must be machine-visible, not only buried in prose.
    expect(calls[0].suggestions).toEqual(['Pass --entity "MJ: AI Models".']);
    expect(calls[0].message).toContain('no interactive terminal');
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
        interactivity: piped,
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
  it('prompts normally at a terminal — humans keep the flow they had', async () => {
    const prompt = vi.fn().mockResolvedValue('ai-prompts');
    await expect(
      resolveOrPrompt({
        flagValue: undefined,
        prompt,
        what: 'A choice',
        suggestion: 'Pass --setup-entity=no.',
        interactivity: terminal,
      })
    ).resolves.toBe('ai-prompts');
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('never invokes the prompt in any automated context, for any value shape', async () => {
    const prompt = vi.fn();
    const contexts = [
      piped,                                            // spawned by an agent
      { ...terminal, env: { CI: 'true' } },             // a CI runner with a pty
      { ...terminal, interactiveFlag: false },          // --no-interactive
      { ...terminal, env: { [INTERACTIVE_ENV]: '0' } }, // an agent harness pinning it off
      { ...terminal, env: { TERM: 'dumb' } },           // a terminal that cannot render one
    ];

    for (const interactivity of contexts) {
      await expect(
        resolveOrPrompt({
          flagValue: undefined,
          prompt,
          what: 'A choice',
          suggestion: 'Pass --setup-entity=no.',
          interactivity,
        })
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
      interactivity: piped,
    }).catch((e: unknown) => e as NonInteractiveError);

    expect(error.suggestion).toMatch(/^Pass --/);
  });
});

describe('requireInteractive', () => {
  it('allows a wizard-style command at a terminal', () => {
    expect(() =>
      requireInteractive('The legacy interactive installer', 'Drop --legacy.', terminal)
    ).not.toThrow();
  });

  it('blocks it when spawned, where it has no flag equivalents to fall back on', () => {
    expect(() =>
      requireInteractive('The legacy interactive installer', 'Drop --legacy to use the engine installer.', piped)
    ).toThrow(NonInteractiveError);
  });

  it('blocks it in CI, where a wizard would stall the build until it timed out', () => {
    expect(() =>
      requireInteractive('The legacy interactive installer', 'Drop --legacy.', { ...terminal, env: { CI: '1' } })
    ).toThrow(NonInteractiveError);
  });
});
