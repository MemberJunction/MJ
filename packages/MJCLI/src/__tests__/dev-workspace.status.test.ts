/**
 * Tests for workspace status collection and rendering
 * (src/lib/dev-workspace/status.ts). Collection runs against temp fixtures;
 * parsing and rendering are pure. The pnpm version is injected — no spawns.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BuildWorkspaceYaml } from '../lib/dev-workspace/build.js';
import { CollectWorkspaceStatus, ParseWorkspaceMembers, RenderStatus } from '../lib/dev-workspace/status.js';
import type { WorkspaceStatus } from '../lib/dev-workspace/types.js';
import { CreateFixtureParent, RemoveFixture } from './dev-workspace-fixture.js';

let parent: string | null = null;

afterEach(() => {
  if (parent !== null) RemoveFixture(parent);
  parent = null;
});

describe('ParseWorkspaceMembers', () => {
  it('round-trips the members out of a generated pnpm-workspace.yaml', () => {
    const yaml = BuildWorkspaceYaml(['bizapps-tasks', 'bizapps-common', 'MJ-repo']);
    expect(ParseWorkspaceMembers(yaml)).toEqual(['MJ-repo', 'bizapps-common', 'bizapps-tasks']);
  });

  it('ignores the packages globs and the build-scripts allowlist entries', () => {
    const yaml = BuildWorkspaceYaml(['bizapps-x']);
    const members = ParseWorkspaceMembers(yaml);
    expect(members).toEqual(['bizapps-x']);
    expect(members).not.toContain('esbuild'); // allowlist entry, different yaml key
  });

  it('returns [] for empty input', () => {
    expect(ParseWorkspaceMembers('')).toEqual([]);
  });
});

describe('CollectWorkspaceStatus', () => {
  it('reports nothing generated on a bare parent', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true } });
    const status = CollectWorkspaceStatus(parent, '10.33.0');
    expect(status.Files.every((f) => !f.Exists)).toBe(true);
    expect(status.LockfileExists).toBe(false);
    expect(status.NodeModulesExists).toBe(false);
    expect(status.Members).toEqual([]);
    expect(status.DetectedCandidates).toEqual(['bizapps-x']);
    expect(status.CandidatesNotInWorkspace).toEqual(['bizapps-x']);
    expect(status.PinnedPnpm).toBeNull();
    expect(status.ParentIsGitRepo).toBe(false);
  });

  it('reports files, members, missing member dirs, and unlisted candidates', () => {
    parent = CreateFixtureParent({
      'bizapps-x': { RootPackageJson: { name: 'x' }, MjAppJson: true },
      'bizapps-y': { RootPackageJson: { name: 'y' }, MjAppJson: true },
    });
    writeFileSync(path.join(parent, 'pnpm-workspace.yaml'), BuildWorkspaceYaml(['bizapps-x', 'ghost-repo']), 'utf8');
    writeFileSync(path.join(parent, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.33.0' }), 'utf8');
    mkdirSync(path.join(parent, 'node_modules'));

    const status = CollectWorkspaceStatus(parent, '10.33.0');
    const existing = status.Files.filter((f) => f.Exists).map((f) => f.Name);
    expect(existing.sort()).toEqual(['package.json', 'pnpm-workspace.yaml']);
    expect(status.NodeModulesExists).toBe(true);
    expect(status.Members).toEqual(['bizapps-x', 'ghost-repo']);
    expect(status.MissingMemberDirs).toEqual(['ghost-repo']);
    expect(status.CandidatesNotInWorkspace).toEqual(['bizapps-y']);
    expect(status.PinnedPnpm).toBe('pnpm@10.33.0');
    expect(status.ActivePnpmVersion).toBe('10.33.0');
  });

  it('rejects a relative parent path', () => {
    expect(() => CollectWorkspaceStatus('relative/dir', null)).toThrow(/absolute/);
  });
});

/** A fully-populated status literal the render tests mutate per-case. */
function baseStatus(): WorkspaceStatus {
  return {
    ParentDir: '/the/parent',
    ParentIsGitRepo: false,
    Files: [
      { Name: 'pnpm-workspace.yaml', Exists: true },
      { Name: '.npmrc', Exists: true },
      { Name: 'package.json', Exists: true },
      { Name: 'turbo.json', Exists: false },
    ],
    LockfileExists: true,
    NodeModulesExists: false,
    Members: ['bizapps-x'],
    MissingMemberDirs: [],
    DetectedCandidates: ['bizapps-x', 'bizapps-y'],
    CandidatesNotInWorkspace: ['bizapps-y'],
    PinnedPnpm: 'pnpm@10.33.0',
    ActivePnpmVersion: '10.33.0',
  };
}

describe('RenderStatus', () => {
  it('shows file presence, members, unlisted candidates, and a pnpm match', () => {
    const report = RenderStatus(baseStatus());
    expect(report).toContain('pnpm-workspace.yaml');
    expect(report).toContain('turbo.json');
    expect(report).toContain('members (1): bizapps-x');
    expect(report).toContain('not in workspace: bizapps-y');
    expect(report).toContain('match');
  });

  it('flags a pnpm pin/active MISMATCH', () => {
    const status = { ...baseStatus(), ActivePnpmVersion: '9.15.0' };
    expect(RenderStatus(status)).toContain('MISMATCH');
  });

  it('flags pnpm not runnable at the parent', () => {
    const status = { ...baseStatus(), ActivePnpmVersion: null };
    expect(RenderStatus(status)).toContain('not runnable');
  });

  it('warns loudly when the parent is itself a git repo root', () => {
    const status = { ...baseStatus(), ParentIsGitRepo: true };
    expect(RenderStatus(status)).toContain('git repo root');
  });

  it('reports missing member dirs', () => {
    const status = { ...baseStatus(), Members: ['bizapps-x', 'ghost'], MissingMemberDirs: ['ghost'] };
    expect(RenderStatus(status)).toContain('missing on disk: ghost');
  });
});
