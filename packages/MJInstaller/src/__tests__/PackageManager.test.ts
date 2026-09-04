import { describe, expect, it } from 'vitest';
import {
  PackageManagerCommands,
  resolvePackageManager,
  type PackageManagerType,
} from '../models/PackageManager.js';

describe('resolvePackageManager', () => {
  it('defaults to pnpm when no value is configured', () => {
    expect(resolvePackageManager(undefined)).toBe('pnpm');
  });

  it('honors an explicit npm override', () => {
    expect(resolvePackageManager('npm')).toBe('npm');
  });

  it('honors an explicit pnpm value', () => {
    expect(resolvePackageManager('pnpm')).toBe('pnpm');
  });
});

describe('PackageManagerCommands (pnpm)', () => {
  const pm = new PackageManagerCommands('pnpm');

  it('builds a pnpm install command', () => {
    expect(pm.Install()).toEqual({ Cmd: 'pnpm', Args: ['install'] });
  });

  it('builds a pnpm run command for a script', () => {
    expect(pm.RunScript('build')).toEqual({ Cmd: 'pnpm', Args: ['run', 'build'] });
  });

  it('builds a pnpm exec command for a local binary', () => {
    expect(pm.Exec('turbo', ['build', '--force'])).toEqual({
      Cmd: 'pnpm',
      Args: ['exec', 'turbo', 'build', '--force'],
    });
  });

  it('builds a pnpm dlx command for a remote package', () => {
    expect(pm.Dlx('@memberjunction/cli@6.1.0', ['codegen'])).toEqual({
      Cmd: 'pnpm',
      Args: ['dlx', '@memberjunction/cli@6.1.0', 'codegen'],
    });
  });

  it('names the pnpm lockfile', () => {
    expect(pm.LockfileName).toBe('pnpm-lock.yaml');
  });

  it('pins the packageManager manifest field to pnpm', () => {
    expect(pm.PackageManagerPin).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });
});

describe('PackageManagerCommands (npm)', () => {
  const pm = new PackageManagerCommands('npm');

  it('builds an npm install command with extra args', () => {
    expect(pm.Install(['--legacy-peer-deps'])).toEqual({
      Cmd: 'npm',
      Args: ['install', '--legacy-peer-deps'],
    });
  });

  it('builds an npm run command for a script', () => {
    expect(pm.RunScript('start:api')).toEqual({ Cmd: 'npm', Args: ['run', 'start:api'] });
  });

  it('routes exec through npx', () => {
    expect(pm.Exec('turbo', ['build'])).toEqual({ Cmd: 'npx', Args: ['turbo', 'build'] });
  });

  it('routes dlx through npx', () => {
    expect(pm.Dlx('@memberjunction/cli', ['migrate'])).toEqual({
      Cmd: 'npx',
      Args: ['@memberjunction/cli', 'migrate'],
    });
  });

  it('names the npm lockfile', () => {
    expect(pm.LockfileName).toBe('package-lock.json');
  });

  it('pins the packageManager manifest field to npm', () => {
    expect(pm.PackageManagerPin).toMatch(/^npm@\d+\.\d+\.\d+$/);
  });
});

describe('PackageManagerCommands.For', () => {
  it('builds the commands object from a config value with the pnpm default', () => {
    const values: Array<[PackageManagerType | undefined, PackageManagerType]> = [
      [undefined, 'pnpm'],
      ['pnpm', 'pnpm'],
      ['npm', 'npm'],
    ];
    for (const [input, expected] of values) {
      expect(PackageManagerCommands.For(input).Name).toBe(expected);
    }
  });
});
