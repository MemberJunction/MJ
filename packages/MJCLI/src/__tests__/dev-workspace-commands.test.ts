/**
 * Wiring tests for the `mj dev workspace` commands: the modules load cleanly
 * (guards against undeclared-dependency crashes at runtime), the flags carry
 * the documented defaults, and the commands are registered as light (no MJ
 * bootstrap) in LIGHT_COMMANDS.
 */
import { describe, expect, it } from 'vitest';
import { LIGHT_COMMANDS } from '../light-commands.js';

describe('dev workspace command modules load cleanly', () => {
  it('loads every dev command module without throwing', async () => {
    const modules = await Promise.all([
      import('../commands/dev/index.js'),
      import('../commands/dev/workspace/index.js'),
      import('../commands/dev/workspace/status.js'),
    ]);
    for (const mod of modules) {
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe('function'); // command class
    }
  });
});

describe('dev workspace flag defaults', () => {
  it('install defaults to true and supports --no-install', async () => {
    const { default: DevWorkspace } = await import('../commands/dev/workspace/index.js');
    const flag = DevWorkspace.flags.install;
    expect(flag.type).toBe('boolean');
    expect(flag.default).toBe(true);
    expect(flag.allowNo).toBe(true);
  });

  it('force defaults to false (never overwrite silently)', async () => {
    const { default: DevWorkspace } = await import('../commands/dev/workspace/index.js');
    expect(DevWorkspace.flags.force.default).toBe(false);
  });

  it('offers no hoist-block flag — the hoist block was retired, not made opt-in', async () => {
    const { default: DevWorkspace } = await import('../commands/dev/workspace/index.js');
    expect(DevWorkspace.flags['hoist-block']).toBeUndefined();
    expect(DevWorkspace.examples.join('\n')).not.toContain('hoist');
  });

  it('dir defaults to the current directory on both commands', async () => {
    const { default: DevWorkspace } = await import('../commands/dev/workspace/index.js');
    const { default: DevWorkspaceStatus } = await import('../commands/dev/workspace/status.js');
    expect(DevWorkspace.flags.dir.default).toBe('.');
    expect(DevWorkspaceStatus.flags.dir.default).toBe('.');
  });

  it('include and exclude are repeatable', async () => {
    const { default: DevWorkspace } = await import('../commands/dev/workspace/index.js');
    expect(DevWorkspace.flags.include.multiple).toBe(true);
    expect(DevWorkspace.flags.exclude.multiple).toBe(true);
  });
});

describe('light-command registration', () => {
  it('dev commands run without the MJ bootstrap', () => {
    expect(LIGHT_COMMANDS.has('dev')).toBe(true);
    expect(LIGHT_COMMANDS.has('dev workspace')).toBe(true);
    expect(LIGHT_COMMANDS.has('dev workspace status')).toBe(true);
  });
});
