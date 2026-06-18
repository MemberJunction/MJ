import { describe, it, expect } from 'vitest';
import hook from '../hooks/prerun';

/**
 * The agent-facing banner-suppression fix: `--format=json|md`, `--no-banner`,
 * and the usage commands must not print the figlet banner OR the userAgent line,
 * so machine-readable stdout stays clean.
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
  return { promise: (hook as unknown as (o: unknown) => Promise<void>)(options), logs };
}

describe('prerun banner suppression', () => {
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

  it('prints userAgent for a normal light command in text mode', async () => {
    const { promise, logs } = runHook([], 'bump');
    await promise;
    expect(logs.some((l) => l.includes('mj/test'))).toBe(true);
  });
});
