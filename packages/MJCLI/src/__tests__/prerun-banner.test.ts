import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import hook from '../hooks/prerun';
import { HUMAN_FRIENDLY_ENV } from '@memberjunction/cli-core';

/**
 * The agent-facing banner-suppression contract: `--format=json|md`, `--no-banner`,
 * a piped stdout, and the usage commands must not print the figlet banner OR the
 * userAgent line, so machine-readable stdout stays clean.
 *
 * Also covers the two global flags the hook consumes out of argv on behalf of the
 * ~80 commands that don't declare them (`--no-banner`, `--human-friendly`).
 *
 * We pass LIGHT command ids only (no bootstrap import) so the hook's
 * maybeLoadBootstrap() stays a no-op during the test.
 */
function runHook(argv: string[], commandId: string) {
  const logs: string[] = [];
  const options = {
    argv,
    Command: { id: commandId },
    config: { userAgent: 'mj/test' },
    context: { log: (m: string) => logs.push(m) },
  };
  // The hook only reads `options`; `this` is unused.
  return { promise: (hook as unknown as (o: unknown) => Promise<void>)(options), logs, argv };
}

/** vitest runs without a TTY, so the human path has to be simulated explicitly. */
function setTTY(isTTY: boolean): void {
  Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true });
  Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
}

describe('prerun banner suppression', () => {
  const originalTTY = process.stdout.isTTY;

  beforeEach(() => {
    setTTY(true);
    delete process.env[HUMAN_FRIENDLY_ENV];
    delete process.env.MJ_CLI_NO_BANNER;
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalTTY, configurable: true });
    delete process.env[HUMAN_FRIENDLY_ENV];
    delete process.env.MJ_CLI_NO_BANNER;
  });

  it('suppresses banner + userAgent for --format=json (split form)', async () => {
    const { promise, logs } = runHook(['--format', 'json'], 'usage');
    await promise;
    expect(logs).toEqual([]);
  });

  it('suppresses banner + userAgent for --format=md (equals form)', async () => {
    const { promise, logs } = runHook(['--format=md'], 'usage');
    await promise;
    expect(logs).toEqual([]);
  });

  it('suppresses for the markdown alias too', async () => {
    const { promise, logs } = runHook(['--format=markdown'], 'bump');
    await promise;
    expect(logs).toEqual([]);
  });

  it('suppresses for --no-banner', async () => {
    const { promise, logs } = runHook(['--no-banner'], 'version');
    await promise;
    expect(logs).toEqual([]);
  });

  it('suppresses figlet AND userAgent for usage commands (text mode)', async () => {
    const { promise, logs } = runHook([], 'usage');
    await promise;
    // The agent-facing usage surface stays a terse domain map — no figlet, no
    // userAgent line, even in text mode.
    expect(logs).toEqual([]);
  });

  it('suppresses figlet AND userAgent for a tier-2 <domain> usage command (text mode)', async () => {
    const { promise, logs } = runHook([], 'sync usage');
    await promise;
    expect(logs).toEqual([]);
  });

  it('prints userAgent for a normal light command on a terminal', async () => {
    const { promise, logs } = runHook([], 'bump');
    await promise;
    expect(logs.some((l) => l.includes('mj/test'))).toBe(true);
  });

  it('suppresses all chrome when stdout is piped, with no flag required', async () => {
    setTTY(false);
    const { promise, logs } = runHook([], 'bump');
    await promise;
    expect(logs).toEqual([]);
  });
});

describe('prerun global flag consumption', () => {
  const originalTTY = process.stdout.isTTY;

  beforeEach(() => {
    setTTY(true);
    delete process.env[HUMAN_FRIENDLY_ENV];
    delete process.env.MJ_CLI_NO_BANNER;
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalTTY, configurable: true });
    delete process.env[HUMAN_FRIENDLY_ENV];
    delete process.env.MJ_CLI_NO_BANNER;
  });

  it('strips --human-friendly from argv so strict-parser commands do not reject it', async () => {
    const { promise, argv } = runHook(['--human-friendly', '--dir', 'x'], 'bump');
    await promise;
    expect(argv).toEqual(['--dir', 'x']);
  });

  it('forwards --human-friendly to the interactivity layer via env', async () => {
    const { promise } = runHook(['--human-friendly'], 'bump');
    await promise;
    expect(process.env[HUMAN_FRIENDLY_ENV]).toBe('1');
  });

  it('leaves the env unset when --human-friendly was not passed — non-interactive by default', async () => {
    const { promise } = runHook([], 'bump');
    await promise;
    expect(process.env[HUMAN_FRIENDLY_ENV]).toBeUndefined();
  });

  it('strips --no-banner from argv and signals it via env', async () => {
    const { promise, argv } = runHook(['--no-banner', 'foo'], 'bump');
    await promise;
    expect(argv).toEqual(['foo']);
    expect(process.env.MJ_CLI_NO_BANNER).toBe('1');
  });

  it('strips repeated occurrences of a global flag', async () => {
    const { promise, argv } = runHook(['--no-banner', 'a', '--no-banner', 'b'], 'bump');
    await promise;
    expect(argv).toEqual(['a', 'b']);
  });

  it('handles both global flags in one invocation', async () => {
    const { promise, argv } = runHook(['--human-friendly', '--no-banner', 'x'], 'bump');
    await promise;
    expect(argv).toEqual(['x']);
    expect(process.env[HUMAN_FRIENDLY_ENV]).toBe('1');
    expect(process.env.MJ_CLI_NO_BANNER).toBe('1');
  });
});
