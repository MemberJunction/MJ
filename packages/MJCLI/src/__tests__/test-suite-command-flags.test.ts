import { describe, it, expect, vi, afterEach } from 'vitest';
import { Config } from '@oclif/core';
import TestSuite from '../commands/test/suite.js';
import { SuiteCommand } from '@memberjunction/testing-cli';

describe('TestSuite CLI command (--shard and --transport flags)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('declares --shard and --transport flags on TestSuite.flags', () => {
    expect(TestSuite.flags.shard).toBeDefined();
    expect(TestSuite.flags.transport).toBeDefined();
    expect(TestSuite.flags.transport.options).toEqual(['server', 'client', 'all']);
  });

  it('forwards --shard and --transport to SuiteCommand.execute', async () => {
    const executeSpy = vi.spyOn(SuiteCommand.prototype, 'execute').mockResolvedValue(undefined);
    const config = new Config({ root: process.cwd() });
    vi.spyOn(config, 'runHook').mockResolvedValue({ successes: [], failures: [] });
    const cmd = new TestSuite(
      ['Integration Tests — Deterministic', '--transport=server', '--shard=2/3'],
      config,
    );

    await cmd.run();

    expect(executeSpy).toHaveBeenCalledTimes(1);
    const [suiteId, passedFlags] = executeSpy.mock.calls[0];
    expect(suiteId).toBe('Integration Tests — Deterministic');
    expect(passedFlags.transport).toBe('server');
    expect(passedFlags.shard).toBe('2/3');
  });

  it('forwards each --test to SuiteCommand.execute', async () => {
    const executeSpy = vi.spyOn(SuiteCommand.prototype, 'execute').mockResolvedValue(undefined);
    const config = new Config({ root: process.cwd() });
    vi.spyOn(config, 'runHook').mockResolvedValue({ successes: [], failures: [] });
    const cmd = new TestSuite(
      ['--name', 'MJ Explorer Regression Suite', '--test', 'T001 - Login Smoke', '--test', 'T002 - Data Explorer Open Record'],
      config,
    );

    await cmd.run();

    const [, passedFlags] = executeSpy.mock.calls[0];
    expect(passedFlags.test).toEqual(['T001 - Login Smoke', 'T002 - Data Explorer Open Record']);
  });
});
