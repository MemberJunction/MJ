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
      import('../commands/dev/workspace/doctor.js'),
      import('../commands/dev/workspace/clean.js'),
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

  it('dir defaults to the current directory on all four commands', async () => {
    const { default: DevWorkspace } = await import('../commands/dev/workspace/index.js');
    const { default: DevWorkspaceStatus } = await import('../commands/dev/workspace/status.js');
    const { default: DevWorkspaceDoctor } = await import('../commands/dev/workspace/doctor.js');
    const { default: DevWorkspaceClean } = await import('../commands/dev/workspace/clean.js');
    expect(DevWorkspace.flags.dir.default).toBe('.');
    expect(DevWorkspaceStatus.flags.dir.default).toBe('.');
    expect(DevWorkspaceDoctor.flags.dir.default).toBe('.');
    expect(DevWorkspaceClean.flags.dir.default).toBe('.');
  });

  it('include and exclude are repeatable', async () => {
    const { default: DevWorkspace } = await import('../commands/dev/workspace/index.js');
    expect(DevWorkspace.flags.include.multiple).toBe(true);
    expect(DevWorkspace.flags.exclude.multiple).toBe(true);
  });

  it('clean-members is tri-state: --clean-members / --no-clean-members / absent means ask', async () => {
    const { default: DevWorkspace } = await import('../commands/dev/workspace/index.js');
    const flag = DevWorkspace.flags['clean-members'];
    expect(flag.type).toBe('boolean');
    expect(flag.allowNo).toBe(true);
    expect(flag.default).toBeUndefined(); // absent -> interactive confirm, or a loud skip when non-interactive
  });
});

describe('dev workspace clean flag defaults', () => {
  it('dry-run and force both default to false — clean deletes only when asked', async () => {
    const { default: DevWorkspaceClean } = await import('../commands/dev/workspace/clean.js');
    expect(DevWorkspaceClean.flags['dry-run'].type).toBe('boolean');
    expect(DevWorkspaceClean.flags['dry-run'].default).toBe(false);
    expect(DevWorkspaceClean.flags.force.default).toBe(false);
  });

  it('documents the dry-run-first path in its examples', async () => {
    const { default: DevWorkspaceClean } = await import('../commands/dev/workspace/clean.js');
    expect(DevWorkspaceClean.examples.join('\n')).toContain('--dry-run');
  });
});

describe('dev workspace doctor flags', () => {
  it('takes --dir and nothing else — doctor diagnoses, it never changes behavior', async () => {
    const { default: DevWorkspaceDoctor } = await import('../commands/dev/workspace/doctor.js');
    expect(Object.keys(DevWorkspaceDoctor.flags)).toEqual(['dir']);
  });

  it('binds --dir to the shared environment variable', async () => {
    const { default: DevWorkspaceDoctor } = await import('../commands/dev/workspace/doctor.js');
    expect(DevWorkspaceDoctor.flags.dir.env).toBe('MJ_DEV_WORKSPACE_DIR');
  });

  it('describes itself as read-only with a non-zero exit on failure', async () => {
    const { default: DevWorkspaceDoctor } = await import('../commands/dev/workspace/doctor.js');
    expect(DevWorkspaceDoctor.description).toMatch(/Read-only/);
    expect(DevWorkspaceDoctor.description).toMatch(/exits non-zero/);
  });
});

describe('light-command registration', () => {
  it('dev commands run without the MJ bootstrap', () => {
    expect(LIGHT_COMMANDS.has('dev')).toBe(true);
    expect(LIGHT_COMMANDS.has('dev workspace')).toBe(true);
    expect(LIGHT_COMMANDS.has('dev workspace status')).toBe(true);
    expect(LIGHT_COMMANDS.has('dev workspace doctor')).toBe(true);
    expect(LIGHT_COMMANDS.has('dev workspace clean')).toBe(true);
  });
});
