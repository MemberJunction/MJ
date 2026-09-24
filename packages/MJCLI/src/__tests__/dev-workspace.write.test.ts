/**
 * Tests for the write-safety layer (src/lib/dev-workspace/write.ts):
 * never overwrite silently, .bak on force, and the parent-must-not-be-a-git-repo
 * guard.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AssertParentDirSafe,
  FindExistingFiles,
  WORKSPACE_FILE_NAMES,
  WriteWorkspaceFiles,
} from '../lib/dev-workspace/write.js';
import type { GeneratedFile } from '../lib/dev-workspace/types.js';
import { CreateFixtureParent, RemoveFixture } from './dev-workspace-fixture.js';

let parent: string | null = null;

afterEach(() => {
  if (parent !== null) RemoveFixture(parent);
  parent = null;
});

const FILES: GeneratedFile[] = [
  { Name: 'pnpm-workspace.yaml', Content: 'yaml-content\n' },
  { Name: '.npmrc', Content: 'npmrc-content\n' },
  { Name: 'package.json', Content: '{"private":true}\n' },
  { Name: 'turbo.json', Content: '{"tasks":{}}\n' },
];

describe('AssertParentDirSafe', () => {
  it('rejects a parent that is itself a git repo root (.git directory)', () => {
    parent = CreateFixtureParent({});
    const repoParent = path.join(parent, 'some-repo');
    mkdirSync(path.join(repoParent, '.git'), { recursive: true });
    expect(() => AssertParentDirSafe(repoParent)).toThrow(/git repo root/);
  });

  it('rejects a parent whose .git is a worktree FILE, too', () => {
    const worktreeParent = CreateFixtureParent({});
    parent = worktreeParent;
    writeFileSync(path.join(worktreeParent, '.git'), 'gitdir: /somewhere/else\n', 'utf8');
    expect(() => AssertParentDirSafe(worktreeParent)).toThrow(/git repo root/);
  });

  it('rejects relative and nonexistent paths', () => {
    expect(() => AssertParentDirSafe('relative/dir')).toThrow(/absolute/);
    expect(() => AssertParentDirSafe('/nonexistent/mj-devws-parent')).toThrow(/does not exist/);
  });

  it('accepts a plain directory of sibling clones', () => {
    parent = CreateFixtureParent({ 'bizapps-x': { GitDir: true } }); // members may be git repos
    expect(() => AssertParentDirSafe(parent!)).not.toThrow();
  });
});

describe('WriteWorkspaceFiles', () => {
  it('writes all four files at the parent', () => {
    parent = CreateFixtureParent({});
    const result = WriteWorkspaceFiles(parent, FILES, false);
    expect(result.Written).toEqual(FILES.map((f) => f.Name));
    expect(result.BackedUp).toEqual([]);
    for (const file of FILES) {
      expect(readFileSync(path.join(parent, file.Name), 'utf8')).toBe(file.Content);
    }
  });

  it('refuses to overwrite an existing file without force, naming it and the flag', () => {
    parent = CreateFixtureParent({});
    writeFileSync(path.join(parent, 'package.json'), '{"pre":"existing"}', 'utf8');
    expect(() => WriteWorkspaceFiles(parent!, FILES, false)).toThrow(/package\.json.*--force/s);
    // and nothing else was written
    expect(existsSync(path.join(parent, 'pnpm-workspace.yaml'))).toBe(false);
  });

  it('with force, backs each existing file up to <name>.bak before overwriting', () => {
    parent = CreateFixtureParent({});
    writeFileSync(path.join(parent, 'package.json'), '{"pre":"existing"}', 'utf8');
    writeFileSync(path.join(parent, '.npmrc'), 'old-npmrc', 'utf8');
    const result = WriteWorkspaceFiles(parent, FILES, true);
    expect(result.BackedUp.sort()).toEqual(['.npmrc.bak', 'package.json.bak']);
    expect(readFileSync(path.join(parent, 'package.json.bak'), 'utf8')).toBe('{"pre":"existing"}');
    expect(readFileSync(path.join(parent, '.npmrc.bak'), 'utf8')).toBe('old-npmrc');
    expect(readFileSync(path.join(parent, 'package.json'), 'utf8')).toBe('{"private":true}\n');
  });
});

describe('FindExistingFiles', () => {
  it('reports which of the workspace files already exist', () => {
    parent = CreateFixtureParent({});
    writeFileSync(path.join(parent, 'turbo.json'), '{}', 'utf8');
    expect(FindExistingFiles(parent, WORKSPACE_FILE_NAMES)).toEqual(['turbo.json']);
  });
});
