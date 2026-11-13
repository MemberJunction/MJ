import { describe, it, expect, vi, afterEach } from 'vitest';
import { Config } from '@oclif/core';
import TestScripts from '../commands/test/scripts.js';
import { ScriptsCommand } from '@memberjunction/testing-cli';

describe('TestScripts CLI command (--format and --output flags)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards --format and --output to ScriptsCommand.execute', async () => {
    const executeSpy = vi.spyOn(ScriptsCommand.prototype, 'execute').mockResolvedValue(undefined);
    const config = new Config({ root: process.cwd() });
    vi.spyOn(config, 'runHook').mockResolvedValue({ successes: [], failures: [] });

    await new TestScripts(['--format', 'markdown', '--output', 'drift.md'], config).run();

    const [passedFlags] = executeSpy.mock.calls[0];
    expect(passedFlags.format).toBe('markdown');
    expect(passedFlags.output).toBe('drift.md');
  });
});
