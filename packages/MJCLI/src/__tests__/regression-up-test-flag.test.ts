import { describe, it, expect, vi, afterEach } from 'vitest';
import { Config } from '@oclif/core';

const mocks = vi.hoisted(() => ({ SpawnInherit: vi.fn() }));

vi.mock('../lib/regression/docker-helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/regression/docker-helpers.js')>();
  return { ...actual, IsInsideMonorepo: () => true, SpawnInherit: mocks.SpawnInherit };
});

import TestRegressionUp from '../commands/test/regression/up.js';

async function runUp(args: string[]): Promise<void> {
  const config = new Config({ root: process.cwd() });
  vi.spyOn(config, 'runHook').mockResolvedValue({ successes: [], failures: [] });
  await new TestRegressionUp(args, config).run();
}

describe('mj test regression up --test', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.SpawnInherit.mockReset();
  });

  it('passes the test names to the stack as TEST_NAMES', async () => {
    mocks.SpawnInherit.mockResolvedValue(0);
    await runUp(['--detach', '--test', 'T001 - Login Smoke', '--test', 'T002 - Data Explorer Open Record']);

    const [, , options] = mocks.SpawnInherit.mock.calls[0];
    expect(options.env.TEST_NAMES).toBe('T001 - Login Smoke,T002 - Data Explorer Open Record');
  });

  it('rejects a test name that contains a comma', async () => {
    await expect(runUp(['--test', 'T001 - Login, Smoke'])).rejects.toThrow('comma');
    expect(mocks.SpawnInherit).not.toHaveBeenCalled();
  });
});
