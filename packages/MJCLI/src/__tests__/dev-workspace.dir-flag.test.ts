/**
 * Tests for the `--dir` resolution contract (src/lib/dev-workspace/dir-flag.ts).
 *
 * The precedence tests run oclif's OWN parser against each command's real flag
 * definitions — proving flag > env > default as the CLI will actually behave,
 * not just that the `env` property is present.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Parser } from '@oclif/core';
import {
  DescribeDirSource,
  ResolveDirSource,
  WORKSPACE_DIR_ENV_VAR,
} from '../lib/dev-workspace/dir-flag.js';

/** Restores the environment variable to whatever it was before each test. */
let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env[WORKSPACE_DIR_ENV_VAR];
  delete process.env[WORKSPACE_DIR_ENV_VAR];
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[WORKSPACE_DIR_ENV_VAR];
  else process.env[WORKSPACE_DIR_ENV_VAR] = savedEnv;
});

/** The three command classes, so every one is held to the same flag contract. */
async function loadCommands() {
  const [generate, status, clean] = await Promise.all([
    import('../commands/dev/workspace/index.js'),
    import('../commands/dev/workspace/status.js'),
    import('../commands/dev/workspace/clean.js'),
  ]);
  return [
    { Name: 'dev workspace', Flags: generate.default.flags },
    { Name: 'dev workspace status', Flags: status.default.flags },
    { Name: 'dev workspace clean', Flags: clean.default.flags },
  ];
}

describe('--dir env binding', () => {
  it('binds MJ_DEV_WORKSPACE_DIR with a "." default on all three commands', async () => {
    for (const command of await loadCommands()) {
      expect(command.Flags.dir.env, command.Name).toBe(WORKSPACE_DIR_ENV_VAR);
      expect(command.Flags.dir.default, command.Name).toBe('.');
      expect(command.Flags.dir.description, command.Name).toContain(WORKSPACE_DIR_ENV_VAR);
    }
  });
});

describe('--dir precedence (oclif parser, both orderings)', () => {
  it('prefers an explicit --dir over the environment variable', async () => {
    process.env[WORKSPACE_DIR_ENV_VAR] = '/from/env';
    for (const command of await loadCommands()) {
      const spaced = await Parser.parse(['--dir', '/from/flag'], { flags: command.Flags });
      expect(spaced.flags.dir, command.Name).toBe('/from/flag');
      const equals = await Parser.parse(['--dir=/from/flag'], { flags: command.Flags });
      expect(equals.flags.dir, command.Name).toBe('/from/flag');
    }
  });

  it('falls back to the environment variable when no --dir is given', async () => {
    process.env[WORKSPACE_DIR_ENV_VAR] = '/from/env';
    for (const command of await loadCommands()) {
      const parsed = await Parser.parse([], { flags: command.Flags });
      expect(parsed.flags.dir, command.Name).toBe('/from/env');
    }
  });

  it('falls back to the current directory when neither is given', async () => {
    for (const command of await loadCommands()) {
      const parsed = await Parser.parse([], { flags: command.Flags });
      expect(parsed.flags.dir, command.Name).toBe('.');
    }
  });
});

describe('ResolveDirSource', () => {
  it('reports flag for both --dir forms, even when the env var is also set', () => {
    expect(ResolveDirSource(['--dir', '/x'], '/from/env')).toBe('flag');
    expect(ResolveDirSource(['--dir=/x'], '/from/env')).toBe('flag');
    expect(ResolveDirSource(['status', '--dir=/x'], undefined)).toBe('flag');
  });

  it('reports env only when the variable holds a non-empty value', () => {
    expect(ResolveDirSource([], '/from/env')).toBe('env');
    expect(ResolveDirSource([], '')).toBe('default');
    expect(ResolveDirSource([], undefined)).toBe('default');
  });

  it('is not fooled by an unrelated flag that starts with the same letters', () => {
    expect(ResolveDirSource(['--dry-run'], undefined)).toBe('default');
    expect(ResolveDirSource(['--directory=/x'], undefined)).toBe('default');
  });
});

describe('DescribeDirSource', () => {
  it('names each source the way status reports it', () => {
    expect(DescribeDirSource('flag')).toBe('--dir flag');
    expect(DescribeDirSource('env')).toBe(`$${WORKSPACE_DIR_ENV_VAR}`);
    expect(DescribeDirSource('default')).toBe('default (current directory)');
  });
});
