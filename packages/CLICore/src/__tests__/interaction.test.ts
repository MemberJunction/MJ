import { describe, it, expect, vi } from 'vitest';
import {
  ResolveInteractivity,
  ResolveOrPrompt,
  RequireInteractive,
  NonInteractiveError,
  INTERACTIVE_ENV,
  NON_INTERACTIVE_CODE,
} from '../interaction';

/** A real terminal: both streams are TTYs and nothing says otherwise. */
const terminal = { env: {}, stdinIsTTY: true, stdoutIsTTY: true };
/** An agent or script: stdio is piped. */
const piped = { env: {}, stdinIsTTY: false, stdoutIsTTY: false };

describe('ResolveInteractivity — detection', () => {
  it('prompts at a real terminal with no flags — humans keep the behaviour they had', () => {
    expect(ResolveInteractivity(terminal)).toEqual({ interactive: true, reason: 'tty-detected' });
  });

  it('does not prompt when stdio is piped — the common agent case', () => {
    expect(ResolveInteractivity(piped)).toEqual({ interactive: false, reason: 'no-tty' });
  });

  it('requires BOTH streams: half a terminal cannot host a prompt', () => {
    // `mj sync init < /dev/null` and `mj sync init | tee` each break the prompt
    // in a different half; neither should be treated as interactive.
    expect(ResolveInteractivity({ env: {}, stdinIsTTY: false, stdoutIsTTY: true }).reason).toBe('no-tty');
    expect(ResolveInteractivity({ env: {}, stdinIsTTY: true, stdoutIsTTY: false }).reason).toBe('no-tty');
  });

  it('refuses in CI even when the runner allocated a terminal', () => {
    for (const name of ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE', 'JENKINS_URL', 'TF_BUILD']) {
      const d = ResolveInteractivity({ ...terminal, env: { [name]: 'true' } });
      expect(d, `${name} should suppress prompting`).toEqual({ interactive: false, reason: 'ci' });
    }
  });

  it('treats CI=false / CI=0 / CI="" as not-CI rather than as merely present', () => {
    for (const value of ['false', '0', '']) {
      expect(ResolveInteractivity({ ...terminal, env: { CI: value } }).interactive, `CI=${value}`).toBe(true);
    }
  });

  it('accepts a CI variable set to its own name, not just to true', () => {
    // TeamCity sets TEAMCITY_VERSION=2024.03; Jenkins sets JENKINS_URL=http://…
    expect(ResolveInteractivity({ ...terminal, env: { TEAMCITY_VERSION: '2024.03' } }).reason).toBe('ci');
    expect(ResolveInteractivity({ ...terminal, env: { JENKINS_URL: 'http://ci.local' } }).reason).toBe('ci');
  });

  it('refuses on a dumb terminal, which cannot render a prompt', () => {
    expect(ResolveInteractivity({ ...terminal, env: { TERM: 'dumb' } })).toEqual({
      interactive: false,
      reason: 'dumb-terminal',
    });
    expect(ResolveInteractivity({ ...terminal, env: { TERM: 'xterm-256color' } }).interactive).toBe(true);
  });
});

describe('ResolveInteractivity — explicit overrides', () => {
  it('--no-interactive wins over a real terminal', () => {
    expect(ResolveInteractivity({ ...terminal, interactiveFlag: false })).toEqual({
      interactive: false,
      reason: 'flag-off',
    });
  });

  it('--interactive wins over CI and over a dumb terminal', () => {
    expect(ResolveInteractivity({ ...terminal, interactiveFlag: true, env: { CI: 'true' } }).interactive).toBe(true);
    expect(ResolveInteractivity({ ...terminal, interactiveFlag: true, env: { TERM: 'dumb' } }).interactive).toBe(true);
  });

  it('--interactive cannot conjure a terminal that is not there', () => {
    expect(ResolveInteractivity({ ...piped, interactiveFlag: true })).toEqual({
      interactive: false,
      reason: 'no-tty',
    });
  });

  it('honors the env var below the flags and above detection', () => {
    // An agent harness that shells out through a pty sets this to 0 so nothing can block.
    expect(ResolveInteractivity({ ...terminal, env: { [INTERACTIVE_ENV]: '0' } })).toEqual({
      interactive: false,
      reason: 'env-off',
    });
    expect(ResolveInteractivity({ ...terminal, env: { [INTERACTIVE_ENV]: '1', CI: 'true' } })).toEqual({
      interactive: true,
      reason: 'env-on',
    });
    // ...but the flag still beats it.
    expect(
      ResolveInteractivity({ ...terminal, interactiveFlag: false, env: { [INTERACTIVE_ENV]: '1' } }).interactive
    ).toBe(false);
  });

  it('accepts true/false as well as 1/0 for the env var', () => {
    expect(ResolveInteractivity({ ...terminal, env: { [INTERACTIVE_ENV]: 'false' } }).reason).toBe('env-off');
    expect(ResolveInteractivity({ ...terminal, env: { [INTERACTIVE_ENV]: 'TRUE' } }).reason).toBe('env-on');
  });

  it('ignores an unparseable env value and falls through to detection', () => {
    expect(ResolveInteractivity({ ...terminal, env: { [INTERACTIVE_ENV]: 'maybe' } }).reason).toBe('tty-detected');
  });

  it('cannot be made interactive without a terminal by the env var either', () => {
    expect(ResolveInteractivity({ ...piped, env: { [INTERACTIVE_ENV]: '1' } }).reason).toBe('no-tty');
  });
});

describe('ResolveOrPrompt', () => {
  it('returns the flag value without prompting when one was supplied', async () => {
    const prompt = vi.fn();
    await expect(
      ResolveOrPrompt({
        flagValue: 'MJ: AI Prompts',
        prompt,
        what: 'An entity name',
        suggestion: 'Pass --entity.',
        interactivity: terminal,
      })
    ).resolves.toBe('MJ: AI Prompts');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('honors falsy-but-real flag values instead of treating them as missing', async () => {
    const prompt = vi.fn();
    await expect(
      ResolveOrPrompt({ flagValue: false, prompt, what: 'Overwrite', suggestion: 'Pass --overwrite.', interactivity: piped })
    ).resolves.toBe(false);
    await expect(
      ResolveOrPrompt({ flagValue: '', prompt, what: 'A name', suggestion: 'Pass --name.', interactivity: piped })
    ).resolves.toBe('');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('prompts at a terminal when no flag was supplied', async () => {
    const prompt = vi.fn().mockResolvedValue('answered');
    await expect(
      ResolveOrPrompt({
        flagValue: undefined,
        prompt,
        what: 'An entity name',
        suggestion: 'Pass --entity.',
        interactivity: terminal,
      })
    ).resolves.toBe('answered');
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('throws instead of hanging when piped, and never calls the prompt', async () => {
    const prompt = vi.fn();
    await expect(
      ResolveOrPrompt({
        flagValue: undefined,
        prompt,
        what: 'An entity name',
        suggestion: 'Pass --entity "MJ: AI Prompts".',
        interactivity: piped,
      })
    ).rejects.toBeInstanceOf(NonInteractiveError);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('carries a stable code, the reason, and an actionable suggestion', async () => {
    const error = await ResolveOrPrompt({
      flagValue: undefined,
      prompt: async () => 'never',
      what: 'An entity name',
      suggestion: 'Pass --entity "MJ: AI Prompts".',
      interactivity: piped,
    }).catch((e: unknown) => e as NonInteractiveError);

    expect(error).toBeInstanceOf(NonInteractiveError);
    expect(error.code).toBe(NON_INTERACTIVE_CODE);
    expect(error.suggestion).toBe('Pass --entity "MJ: AI Prompts".');
    expect(error.reason).toBe('no-tty');
    expect(error.message).toContain('Pass --entity "MJ: AI Prompts".');
  });
});

describe('NonInteractiveError messages explain the actual cause', () => {
  const messageFor = async (interactivity: Parameters<typeof ResolveInteractivity>[0]) =>
    (await ResolveOrPrompt({
      flagValue: undefined,
      prompt: async () => 'never',
      what: 'A choice',
      suggestion: 'Pass --setup-entity=no.',
      interactivity,
    }).catch((e: unknown) => e as NonInteractiveError)).message;

  it('names a missing terminal', async () => {
    expect(await messageFor(piped)).toContain('no interactive terminal');
  });

  it('names CI', async () => {
    expect(await messageFor({ ...terminal, env: { CI: 'true' } })).toContain('looks like CI');
  });

  it('names the flag the caller passed', async () => {
    expect(await messageFor({ ...terminal, interactiveFlag: false })).toContain('--no-interactive was passed');
  });

  it('offers --interactive only where it could actually help', async () => {
    // In CI a terminal exists, so --interactive is a real remedy...
    expect(await messageFor({ ...terminal, env: { CI: 'true' } })).toContain('pass --interactive');
    // ...but with no terminal at all, suggesting it would send the caller in a circle.
    expect(await messageFor(piped)).not.toContain('pass --interactive');
    // And when they turned it off themselves, the remedy is to stop doing that.
    expect(await messageFor({ ...terminal, interactiveFlag: false })).toContain('drop --no-interactive');
  });
});

describe('RequireInteractive', () => {
  it('passes through at a terminal', () => {
    expect(() => RequireInteractive('The setup wizard', 'Use mj install --config.', terminal)).not.toThrow();
  });

  it('throws a NonInteractiveError naming the alternative when piped', () => {
    try {
      RequireInteractive('The setup wizard', 'Use mj install --config <file>.', piped);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NonInteractiveError);
      expect((e as NonInteractiveError).suggestion).toBe('Use mj install --config <file>.');
    }
  });

  it('throws in CI, where a wizard would stall the build', () => {
    expect(() =>
      RequireInteractive('The legacy installer', 'Drop --legacy.', { ...terminal, env: { CI: '1' } })
    ).toThrow(NonInteractiveError);
  });
});
