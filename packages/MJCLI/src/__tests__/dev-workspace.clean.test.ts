/**
 * Tests for the teardown layer (src/lib/dev-workspace/clean.ts): the sentinel
 * reader, the refusal ladder (git-root parent, no sentinel without --force), the
 * plan being read-only, and a real clean removing exactly the owned set while
 * leaving member repos, .bak backups and unrelated files alone.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BuildSentinel, SENTINEL_MARKER } from '../lib/dev-workspace/build.js';
import {
  AssertCleanAllowed,
  CLEAN_TARGET_COUNT,
  ExecuteClean,
  LOCKFILE_NAME,
  NODE_MODULES_NAME,
  PlanClean,
  ReadSentinel,
  RenderCleanPlan,
} from '../lib/dev-workspace/clean.js';
import { GENERATED_FILE_NAMES, SENTINEL_FILE_NAME, WORKSPACE_FILE_NAMES } from '../lib/dev-workspace/write.js';
import { CreateFixtureParent, RemoveFixture } from './dev-workspace-fixture.js';

let parent: string | null = null;

afterEach(() => {
  if (parent !== null) RemoveFixture(parent);
  parent = null;
});

/** Writes a full generated workspace (files + sentinel) at the fixture parent. */
function seedWorkspace(parentDir: string, members: string[] = ['bizapps-x']): void {
  for (const name of WORKSPACE_FILE_NAMES) {
    writeFileSync(path.join(parentDir, name), `content of ${name}\n`, 'utf8');
  }
  writeFileSync(path.join(parentDir, SENTINEL_FILE_NAME), BuildSentinel(GENERATED_FILE_NAMES, members), 'utf8');
}

/** Writes the residue `pnpm install` leaves: a lockfile and a small node_modules tree. */
function seedInstallResidue(parentDir: string): void {
  writeFileSync(path.join(parentDir, LOCKFILE_NAME), 'lockfileVersion: 9\n', 'utf8');
  const nested = path.join(parentDir, NODE_MODULES_NAME, '.pnpm', 'chalk@5.0.0', 'node_modules', 'chalk');
  mkdirSync(nested, { recursive: true });
  writeFileSync(path.join(nested, 'package.json'), '{"name":"chalk"}', 'utf8');
}

describe('ReadSentinel', () => {
  it('reports absent when there is no sentinel', () => {
    parent = CreateFixtureParent({});
    expect(ReadSentinel(parent)).toEqual({ Kind: 'absent' });
  });

  it('reads a sentinel this tool wrote, with its files and members', () => {
    parent = CreateFixtureParent({});
    seedWorkspace(parent, ['bizapps-tasks', 'MJ-repo']);
    const result = ReadSentinel(parent);
    expect(result.Kind).toBe('valid');
    if (result.Kind !== 'valid') return;
    expect(result.Sentinel.generatedBy).toBe(SENTINEL_MARKER);
    expect(result.Sentinel.members).toEqual(['MJ-repo', 'bizapps-tasks']);
    expect(result.Sentinel.files).toContain(SENTINEL_FILE_NAME);
  });

  it('reports invalid (with a reason) for unparseable JSON', () => {
    parent = CreateFixtureParent({});
    writeFileSync(path.join(parent, SENTINEL_FILE_NAME), '{not json', 'utf8');
    const result = ReadSentinel(parent);
    expect(result.Kind).toBe('invalid');
    if (result.Kind !== 'invalid') return;
    expect(result.Reason).toMatch(/unparseable JSON/);
  });

  it('reports invalid for JSON without our marker', () => {
    parent = CreateFixtureParent({});
    writeFileSync(
      path.join(parent, SENTINEL_FILE_NAME),
      JSON.stringify({ generatedBy: 'someone else', files: [], members: [] }),
      'utf8'
    );
    const result = ReadSentinel(parent);
    expect(result.Kind).toBe('invalid');
    if (result.Kind !== 'invalid') return;
    expect(result.Reason).toContain(SENTINEL_MARKER);
  });

  it('reports invalid when files/members are not string lists', () => {
    parent = CreateFixtureParent({});
    writeFileSync(
      path.join(parent, SENTINEL_FILE_NAME),
      JSON.stringify({ generatedBy: SENTINEL_MARKER, files: [1, 2], members: 'nope' }),
      'utf8'
    );
    expect(ReadSentinel(parent).Kind).toBe('invalid');
  });
});

describe('AssertCleanAllowed', () => {
  it('refuses when the parent is itself a git repo root, even with --force', () => {
    parent = CreateFixtureParent({});
    const repoParent = path.join(parent, 'some-repo');
    mkdirSync(path.join(repoParent, '.git'), { recursive: true });
    seedWorkspace(repoParent);
    expect(() => AssertCleanAllowed(repoParent, false)).toThrow(/git repo root/);
    expect(() => AssertCleanAllowed(repoParent, true)).toThrow(/git repo root/);
  });

  it('refuses without a sentinel, naming --force and --dry-run --force', () => {
    parent = CreateFixtureParent({});
    for (const name of WORKSPACE_FILE_NAMES) writeFileSync(path.join(parent, name), 'hand-made\n', 'utf8');
    expect(() => AssertCleanAllowed(parent!, false)).toThrow(/hand-made, or generated before the sentinel/);
    expect(() => AssertCleanAllowed(parent!, false)).toThrow(/--force/);
    expect(() => AssertCleanAllowed(parent!, false)).toThrow(/--dry-run --force/);
  });

  it('refuses when the sentinel is present but not ours, quoting the reason', () => {
    parent = CreateFixtureParent({});
    writeFileSync(path.join(parent, SENTINEL_FILE_NAME), '{not json', 'utf8');
    expect(() => AssertCleanAllowed(parent!, false)).toThrow(/not a sentinel this tool wrote.*unparseable JSON/s);
  });

  it('allows a sentinel-less clean with --force, and reports what it found', () => {
    parent = CreateFixtureParent({});
    expect(AssertCleanAllowed(parent, true)).toEqual({ Kind: 'absent' });
  });

  it('allows a clean with a valid sentinel and no --force', () => {
    parent = CreateFixtureParent({});
    seedWorkspace(parent);
    expect(AssertCleanAllowed(parent, false).Kind).toBe('valid');
  });
});

describe('PlanClean', () => {
  it('rejects a relative parent path', () => {
    expect(() => PlanClean('relative/dir')).toThrow(/absolute/);
  });

  it('lists every owned path with the sentinel last, and deletes nothing', () => {
    parent = CreateFixtureParent({});
    seedWorkspace(parent);
    seedInstallResidue(parent);
    const plan = PlanClean(parent);
    expect(plan.Targets).toHaveLength(CLEAN_TARGET_COUNT);
    expect(plan.Targets.map((t) => t.Name)).toEqual([
      ...WORKSPACE_FILE_NAMES,
      LOCKFILE_NAME,
      NODE_MODULES_NAME,
      SENTINEL_FILE_NAME,
    ]);
    expect(plan.Targets.every((t) => t.Exists)).toBe(true);
    expect(plan.Targets.find((t) => t.Name === NODE_MODULES_NAME)?.Kind).toBe('directory');
    // read-only: planning must not remove anything
    for (const name of [...GENERATED_FILE_NAMES, LOCKFILE_NAME, NODE_MODULES_NAME]) {
      expect(existsSync(path.join(parent, name))).toBe(true);
    }
  });

  it('marks absent paths as not existing on a bare parent', () => {
    parent = CreateFixtureParent({});
    expect(PlanClean(parent).Targets.every((t) => !t.Exists)).toBe(true);
  });

  it('reports .bak backups without listing them as removal targets', () => {
    parent = CreateFixtureParent({});
    seedWorkspace(parent);
    writeFileSync(path.join(parent, 'package.json.bak'), 'previous\n', 'utf8');
    writeFileSync(path.join(parent, '.npmrc.bak'), 'previous\n', 'utf8');
    const plan = PlanClean(parent);
    expect(plan.PreservedBackups.sort()).toEqual(['.npmrc.bak', 'package.json.bak']);
    expect(plan.Targets.some((t) => t.Name.endsWith('.bak'))).toBe(false);
  });
});

describe('RenderCleanPlan', () => {
  it('lists only the paths that exist', () => {
    parent = CreateFixtureParent({});
    seedWorkspace(parent);
    const report = RenderCleanPlan(PlanClean(parent)).join('\n');
    expect(report).toContain('package.json');
    expect(report).toContain(SENTINEL_FILE_NAME);
    expect(report).not.toContain(LOCKFILE_NAME); // never installed, so nothing to remove
    expect(report).not.toContain(NODE_MODULES_NAME);
  });

  it('marks the node_modules target as a tree and names kept backups', () => {
    parent = CreateFixtureParent({});
    seedWorkspace(parent);
    seedInstallResidue(parent);
    writeFileSync(path.join(parent, 'turbo.json.bak'), 'previous\n', 'utf8');
    const report = RenderCleanPlan(PlanClean(parent)).join('\n');
    expect(report).toContain(`${NODE_MODULES_NAME}/ (tree)`);
    expect(report).toContain('keeping turbo.json.bak');
  });

  it('says there is nothing to remove on a bare parent', () => {
    parent = CreateFixtureParent({});
    expect(RenderCleanPlan(PlanClean(parent)).join('\n')).toContain('Nothing to remove');
  });
});

describe('ExecuteClean', () => {
  it('removes exactly the owned set and leaves member repos, backups and strangers alone', () => {
    parent = CreateFixtureParent({
      'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true, GitDir: true },
    });
    seedWorkspace(parent);
    seedInstallResidue(parent);
    writeFileSync(path.join(parent, 'package.json.bak'), 'previous\n', 'utf8');
    writeFileSync(path.join(parent, 'NOTES.md'), 'my own file\n', 'utf8');

    const result = ExecuteClean(PlanClean(parent));

    expect(result.Removed).toEqual([...WORKSPACE_FILE_NAMES, LOCKFILE_NAME, NODE_MODULES_NAME, SENTINEL_FILE_NAME]);
    expect(result.AlreadyGone).toEqual([]);
    expect(readdirSync(parent).sort()).toEqual(['NOTES.md', 'bizapps-x', 'package.json.bak']);
    expect(existsSync(path.join(parent, 'bizapps-x', 'package.json'))).toBe(true);
  });

  it('reports absent paths as already gone instead of erroring', () => {
    parent = CreateFixtureParent({});
    writeFileSync(path.join(parent, SENTINEL_FILE_NAME), BuildSentinel(GENERATED_FILE_NAMES, ['bizapps-x']), 'utf8');
    writeFileSync(path.join(parent, 'turbo.json'), 'partial\n', 'utf8');

    const result = ExecuteClean(PlanClean(parent));

    expect(result.Removed).toEqual(['turbo.json', SENTINEL_FILE_NAME]);
    expect(result.AlreadyGone).toEqual(['pnpm-workspace.yaml', '.npmrc', 'package.json', LOCKFILE_NAME, NODE_MODULES_NAME]);
    expect(readdirSync(parent)).toEqual([]);
  });

  it('removes a nested node_modules tree without following a symlink out of it', () => {
    parent = CreateFixtureParent({ outside: { RootPackageJson: { name: 'outside' } } });
    seedWorkspace(parent);
    seedInstallResidue(parent);
    const linkPath = path.join(parent, NODE_MODULES_NAME, 'escape-hatch');
    symlinkSync(path.join(parent, 'outside'), linkPath, 'dir');

    ExecuteClean(PlanClean(parent));

    expect(existsSync(path.join(parent, NODE_MODULES_NAME))).toBe(false);
    // the symlink target survived — the delete unlinked the link, it did not walk through it
    expect(existsSync(path.join(parent, 'outside', 'package.json'))).toBe(true);
  });

  it('is idempotent — a second clean removes nothing and reports everything gone', () => {
    parent = CreateFixtureParent({});
    seedWorkspace(parent);
    ExecuteClean(PlanClean(parent));
    const second = ExecuteClean(PlanClean(parent));
    expect(second.Removed).toEqual([]);
    expect(second.AlreadyGone).toHaveLength(CLEAN_TARGET_COUNT);
  });
});
