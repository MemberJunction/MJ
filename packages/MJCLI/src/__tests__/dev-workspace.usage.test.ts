/**
 * Tests for the `dev` domain's progressive-disclosure surface: the usage
 * declarations (src/lib/dev-workspace/usage.ts), their registration through
 * CLIPluginRegistry, and that the tier-1 map and tier-2 detail both see them.
 *
 * The content assertions are deliberate: `mj dev usage` is the only place an
 * agent learns these rules before invoking, so the facts that would otherwise be
 * guessed wrong (parent must not be a git repo, the sentinel gate on clean,
 * member detection, the env var) are asserted to be present.
 */
import { describe, expect, it } from 'vitest';
import { CLIPluginRegistry } from '@memberjunction/cli-core';
import {
  DEV_DOMAIN_USAGE,
  DEV_WORKSPACE_CLEAN_USAGE,
  DEV_WORKSPACE_DOCTOR_USAGE,
  DEV_WORKSPACE_STATUS_USAGE,
  DEV_WORKSPACE_USAGE,
  RegisterDevWorkspaceUsage,
} from '../lib/dev-workspace/usage.js';
import { WORKSPACE_DIR_ENV_VAR } from '../lib/dev-workspace/dir-flag.js';
import { LIGHT_COMMANDS } from '../light-commands.js';

describe('dev domain usage declarations', () => {
  it('declares all four commands under the dev domain', () => {
    expect(DEV_DOMAIN_USAGE.map((u) => u.command)).toEqual([
      'dev:workspace',
      'dev:workspace:status',
      'dev:workspace:doctor',
      'dev:workspace:clean',
    ]);
    for (const usage of DEV_DOMAIN_USAGE) {
      expect(usage.domain).toBe('dev');
      expect(usage.summary.length).toBeGreaterThan(0);
      expect(usage.description).toBeDefined();
      expect(usage.examples?.length).toBeGreaterThan(0);
      expect(usage.runtime.class).toBeDefined();
    }
  });

  it('documents --dir with the env var on every command', () => {
    for (const usage of DEV_DOMAIN_USAGE) {
      const dirFlag = usage.flags?.find((f) => f.name === '--dir');
      expect(dirFlag, usage.command).toBeDefined();
      expect(dirFlag?.description).toContain(WORKSPACE_DIR_ENV_VAR);
      expect(usage.description).toContain(WORKSPACE_DIR_ENV_VAR);
    }
  });

  it('states the parent-directory rule on every command — the mistake an agent would make', () => {
    for (const usage of DEV_DOMAIN_USAGE) {
      expect(usage.description, usage.command).toMatch(/git repo/);
    }
  });

  it('teaches the generator: the five files, member detection, and overwrite safety', () => {
    const text = DEV_WORKSPACE_USAGE.description ?? '';
    expect(text).toContain('pnpm-workspace.yaml');
    expect(text).toContain('.npmrc');
    expect(text).toContain('turbo.json');
    expect(text).toContain('.mj-dev-workspace.json');
    expect(text).toContain('mj-app.json');
    expect(text).toContain('@mj-biz-apps');
    expect(text).toContain('memberjunction-workspace');
    expect(text).toMatch(/never overwritten silently|NEVER overwritten silently/);
    expect(text).toContain('--force');
    expect(text).toMatch(/peerDependencies/); // the shell-peer guidance
    expect(text).toContain('packages/*');
    expect(DEV_WORKSPACE_USAGE.flags?.map((f) => f.name)).toEqual(
      expect.arrayContaining(['--dir', '--include', '--exclude', '--no-install', '--force'])
    );
  });

  it('teaches clean: the sentinel gate, --force, --dry-run, and what survives', () => {
    const text = DEV_WORKSPACE_CLEAN_USAGE.description ?? '';
    expect(text).toContain('.mj-dev-workspace.json');
    expect(text).toContain('pnpm-lock.yaml');
    expect(text).toContain('node_modules');
    expect(text).toMatch(/without --force a valid/i);
    expect(text).toContain('--dry-run');
    expect(text).toMatch(/\.bak/);
    expect(text).toMatch(/member repo checkouts/i);
    expect(DEV_WORKSPACE_CLEAN_USAGE.flags?.map((f) => f.name)).toEqual(
      expect.arrayContaining(['--dir', '--dry-run', '--force'])
    );
  });

  it('teaches doctor: the non-zero exit, the census, and what a standalone install actually is', () => {
    const text = DEV_WORKSPACE_DOCTOR_USAGE.description ?? '';
    expect(text).toMatch(/read-only/i);
    expect(text).toMatch(/exits non-zero/i);
    expect(text).toContain('@angular/core');
    expect(text).toContain('@memberjunction/global');
    expect(text).toContain('one-copy census');
    // the trap: a plain member node_modules is NOT a standalone install
    expect(text).toContain('.package-lock.json');
    expect(text).toMatch(/NOT the plain node_modules/);
    expect(DEV_WORKSPACE_DOCTOR_USAGE.flags?.map((f) => f.name)).toEqual(['--dir']);
  });

  it('marks status as read-only and mentions the dir-resolution report', () => {
    const text = DEV_WORKSPACE_STATUS_USAGE.description ?? '';
    expect(text).toMatch(/read-only/i);
    expect(text).toMatch(/writes nothing/i);
    expect(text).toMatch(/flag, environment, or default/);
  });

  it('records that these commands need no MJ bootstrap', () => {
    for (const usage of DEV_DOMAIN_USAGE) {
      expect(usage.description, usage.command).toMatch(/Light command: no MJ bootstrap/);
    }
  });

  it('gives honest runtime classes — install dominates the generator, dry-run is instant', () => {
    expect(DEV_WORKSPACE_USAGE.runtime.class).toBe('variable');
    expect(DEV_WORKSPACE_USAGE.runtime.note).toMatch(/pnpm install/);
    expect(DEV_WORKSPACE_STATUS_USAGE.runtime.class).toBe('fast');
    expect(DEV_WORKSPACE_DOCTOR_USAGE.runtime.class).toBe('fast');
    expect(DEV_WORKSPACE_CLEAN_USAGE.runtime.class).toBe('moderate');
  });
});

describe('dev domain registration with the usage registry', () => {
  it('appears in the tier-2 domain detail, one entry per command', () => {
    RegisterDevWorkspaceUsage(); // idempotent; the module also self-registers on import
    const detail = CLIPluginRegistry.BuildDomainDetail('dev');
    expect(detail.commands.map((c) => c.command).sort()).toEqual([
      'dev:workspace',
      'dev:workspace:clean',
      'dev:workspace:doctor',
      'dev:workspace:status',
    ]);
  });

  it('appears in the tier-1 domain map with a summary and a runtime class', () => {
    RegisterDevWorkspaceUsage();
    const map = CLIPluginRegistry.BuildDomainMap();
    const dev = map.domains.find((d) => d.domain === 'dev');
    expect(dev).toBeDefined();
    expect(dev?.summary.length).toBeGreaterThan(0);
    // the loosest class across the domain, so a single timeout errs generous
    expect(dev?.runtime).toBe('variable');
  });

  it('registering twice does not duplicate an entry', () => {
    RegisterDevWorkspaceUsage();
    RegisterDevWorkspaceUsage();
    const detail = CLIPluginRegistry.BuildDomainDetail('dev');
    expect(detail.commands).toHaveLength(4);
  });
});

describe('dev usage command', () => {
  it('loads and targets the dev domain', async () => {
    const { default: DevUsage } = await import('../commands/dev/usage.js');
    expect(typeof DevUsage).toBe('function');
    expect(DevUsage.description).toMatch(/mj dev/);
  });

  it('is registered as a light command — usage must never pay for the bootstrap', () => {
    expect(LIGHT_COMMANDS.has('dev usage')).toBe(true);
    // consistent with the other tier-2 usage commands
    expect(LIGHT_COMMANDS.has('sync usage')).toBe(true);
    expect(LIGHT_COMMANDS.has('codegen usage')).toBe(true);
  });
});
