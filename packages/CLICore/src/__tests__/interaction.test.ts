import { describe, it, expect, vi } from 'vitest';
import {
  ResolveInteractivity,
  ResolveOrPrompt,
  RequireInteractive,
  NonInteractiveError,
  HUMAN_FRIENDLY_ENV,
  NON_INTERACTIVE_CODE,
} from '../interaction';

describe('ResolveInteractivity', () => {
  it('is non-interactive by default even on a full TTY — the agent-first inversion', () => {
    const d = ResolveInteractivity({ env: {}, stdinIsTTY: true });
    expect(d.interactive).toBe(false);
    expect(d.reason).toBe('agent-first-default');
  });

  it('opts in via --human-friendly when stdin is a TTY', () => {
    const d = ResolveInteractivity({ humanFriendlyFlag: true, env: {}, stdinIsTTY: true });
    expect(d).toEqual({ interactive: true, reason: 'human-friendly-flag' });
  });

  it('opts in via the env var the CLI root forwards', () => {
    const d = ResolveInteractivity({ env: { [HUMAN_FRIENDLY_ENV]: '1' }, stdinIsTTY: true });
    expect(d).toEqual({ interactive: true, reason: 'human-friendly-env' });
  });

  it('refuses to prompt without a TTY even when --human-friendly was asked for', () => {
    const d = ResolveInteractivity({ humanFriendlyFlag: true, env: {}, stdinIsTTY: false });
    expect(d).toEqual({ interactive: false, reason: 'no-tty' });
  });

  it('ignores an env value other than exactly "1"', () => {
    expect(ResolveInteractivity({ env: { [HUMAN_FRIENDLY_ENV]: 'true' }, stdinIsTTY: true }).interactive).toBe(false);
    expect(ResolveInteractivity({ env: { [HUMAN_FRIENDLY_ENV]: '0' }, stdinIsTTY: true }).interactive).toBe(false);
  });

  it('treats an explicit --no-human-friendly as the default, not as opt-in', () => {
    const d = ResolveInteractivity({ humanFriendlyFlag: false, env: { [HUMAN_FRIENDLY_ENV]: '1' }, stdinIsTTY: true });
    // The env var still opts in — the flag being false just means "not set by flag".
    expect(d.interactive).toBe(true);
  });
});

describe('ResolveOrPrompt', () => {
  const interactive = { env: { [HUMAN_FRIENDLY_ENV]: '1' }, stdinIsTTY: true };
  const headless = { env: {}, stdinIsTTY: true };

  it('returns the flag value without prompting when one was supplied', async () => {
    const prompt = vi.fn();
    const value = await ResolveOrPrompt({
      flagValue: 'MJ: AI Prompts',
      prompt,
      what: 'An entity name',
      suggestion: 'Pass --entity.',
      interactivity: interactive,
    });
    expect(value).toBe('MJ: AI Prompts');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('honors falsy-but-real flag values instead of treating them as missing', async () => {
    const prompt = vi.fn();
    await expect(
      ResolveOrPrompt({ flagValue: false, prompt, what: 'Overwrite', suggestion: 'Pass --overwrite.', interactivity: headless })
    ).resolves.toBe(false);
    await expect(
      ResolveOrPrompt({ flagValue: '', prompt, what: 'A name', suggestion: 'Pass --name.', interactivity: headless })
    ).resolves.toBe('');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('prompts when interactive and no flag was supplied', async () => {
    const prompt = vi.fn().mockResolvedValue('answered');
    const value = await ResolveOrPrompt({
      flagValue: undefined,
      prompt,
      what: 'An entity name',
      suggestion: 'Pass --entity.',
      interactivity: interactive,
    });
    expect(value).toBe('answered');
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('throws instead of hanging when headless, and never calls the prompt', async () => {
    const prompt = vi.fn();
    await expect(
      ResolveOrPrompt({
        flagValue: undefined,
        prompt,
        what: 'An entity name',
        suggestion: 'Pass --entity "MJ: AI Prompts".',
        interactivity: headless,
      })
    ).rejects.toBeInstanceOf(NonInteractiveError);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('carries a stable code and an actionable suggestion on the thrown error', async () => {
    const error = await ResolveOrPrompt({
      flagValue: undefined,
      prompt: async () => 'never',
      what: 'An entity name',
      suggestion: 'Pass --entity "MJ: AI Prompts".',
      interactivity: headless,
    }).catch((e: unknown) => e as NonInteractiveError);

    expect(error).toBeInstanceOf(NonInteractiveError);
    expect(error.code).toBe(NON_INTERACTIVE_CODE);
    expect(error.suggestion).toBe('Pass --entity "MJ: AI Prompts".');
    expect(error.reason).toBe('agent-first-default');
    // The message must teach both remedies: the flag for this value, and the escape hatch.
    expect(error.message).toContain('Pass --entity "MJ: AI Prompts".');
    expect(error.message).toContain('--human-friendly');
  });

  it('reports no-tty as the reason when --human-friendly was asked for without a terminal', async () => {
    const error = await ResolveOrPrompt({
      flagValue: undefined,
      prompt: async () => 'never',
      what: 'A section list',
      suggestion: 'Pass --sections.',
      interactivity: { humanFriendlyFlag: true, env: {}, stdinIsTTY: false },
    }).catch((e: unknown) => e as NonInteractiveError);

    expect(error.reason).toBe('no-tty');
  });
});

describe('RequireInteractive', () => {
  it('passes through when the run may prompt', () => {
    expect(() =>
      RequireInteractive('The setup wizard', 'Use mj install --config.', {
        env: { [HUMAN_FRIENDLY_ENV]: '1' },
        stdinIsTTY: true,
      })
    ).not.toThrow();
  });

  it('throws a NonInteractiveError naming the alternative when headless', () => {
    try {
      RequireInteractive('The setup wizard', 'Use mj install --config <file>.', { env: {}, stdinIsTTY: true });
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NonInteractiveError);
      expect((e as NonInteractiveError).suggestion).toBe('Use mj install --config <file>.');
    }
  });
});
