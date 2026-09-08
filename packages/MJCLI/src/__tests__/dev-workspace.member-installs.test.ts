/**
 * Tests for standalone-install detection and cleanup
 * (src/lib/dev-workspace/member-installs.ts) against real temp fixtures.
 * The walk must be DEPTH-INDEPENDENT: the field hit 290 nested node_modules in
 * MJ, some 5 levels deep, and a -maxdepth guess was "exactly the mistake I made"
 * (#3795). Removal deletes only enumerated node_modules paths — never a glob —
 * and re-verifies the on-disk entry name before every deletion.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FindMemberInstallTrees, IsInsideDirectory, RemoveMemberInstallTrees } from '../lib/dev-workspace/member-installs.js';
import { CreateFixtureParent, RemoveFixture } from './dev-workspace-fixture.js';

let parent: string | null = null;

afterEach(() => {
  if (parent !== null) RemoveFixture(parent);
  parent = null;
});

describe('FindMemberInstallTrees', () => {
  it('finds root AND nested node_modules at any depth — never inside another node_modules', () => {
    parent = CreateFixtureParent({
      MJ: {
        RootPackageJson: { name: 'mj' },
        NodeModulesDirs: [
          'node_modules',
          'node_modules/some-dep/node_modules', // inside a found tree — must NOT be a separate hit
          'packages/MJCore/node_modules',
          'packages/AI/Vectors/Providers/Pinecone/node_modules', // the field's 5-deep shape
        ],
      },
    });
    const repoPath = path.join(parent, 'MJ');
    const scan = FindMemberInstallTrees(repoPath);
    expect(scan.Trees).toEqual([
      path.join(repoPath, 'node_modules'),
      path.join(repoPath, 'packages/AI/Vectors/Providers/Pinecone/node_modules'),
      path.join(repoPath, 'packages/MJCore/node_modules'),
    ]);
    expect(scan.UnreadableDirs).toEqual([]);
  });

  it('returns no trees for a repo with no installs, and skips dot-dirs like .git', () => {
    parent = CreateFixtureParent({
      clean: { RootPackageJson: { name: 'clean' }, GitDir: true, Packages: { Entities: { name: 'e' } } },
    });
    expect(FindMemberInstallTrees(path.join(parent, 'clean')).Trees).toEqual([]);
  });

  // Review probe7: an EACCES mid-walk used to THROW and abort between deletions.
  it('records an unreadable directory and continues — never a mid-run abort', () => {
    parent = CreateFixtureParent({
      MJ: { RootPackageJson: { name: 'mj' }, NodeModulesDirs: ['packages/a/node_modules'] },
    });
    const lockedDir = path.join(parent, 'MJ', 'packages', 'locked');
    mkdirSync(lockedDir, { recursive: true });
    chmodSync(lockedDir, 0o000);
    try {
      const scan = FindMemberInstallTrees(path.join(parent, 'MJ'));
      expect(scan.Trees).toEqual([path.join(parent, 'MJ', 'packages/a/node_modules')]);
      expect(scan.UnreadableDirs).toEqual([lockedDir]);
    } finally {
      chmodSync(lockedDir, 0o755); // so the fixture can be removed
    }
  });

  it('rejects a relative path (precondition)', () => {
    expect(() => FindMemberInstallTrees('relative/repo')).toThrow(/absolute/);
  });
});

describe('RemoveMemberInstallTrees', () => {
  it('removes exactly the enumerated trees and reports already-gone paths on a repeat run', () => {
    parent = CreateFixtureParent({
      MJ: { RootPackageJson: { name: 'mj' }, NodeModulesDirs: ['node_modules', 'packages/MJCore/node_modules'] },
    });
    const repoPath = path.join(parent, 'MJ');
    const trees = FindMemberInstallTrees(repoPath).Trees;
    const first = RemoveMemberInstallTrees(trees);
    expect(first.Removed).toEqual(trees);
    expect(first.AlreadyGone).toEqual([]);
    expect(first.Skipped).toEqual([]);
    expect(trees.some((t) => existsSync(t))).toBe(false);
    expect(existsSync(path.join(repoPath, 'package.json'))).toBe(true); // sources untouched

    const second = RemoveMemberInstallTrees(trees);
    expect(second.Removed).toEqual([]);
    expect(second.AlreadyGone).toEqual(trees);
  });

  // Review probe7: on case-insensitive APFS, rmSync('.../node_modules') deletes a
  // dir actually named Node_Modules. Deletion re-verifies the exact entry name.
  it('never deletes a case-variant directory through a node_modules path', () => {
    parent = CreateFixtureParent({ MJ: { RootPackageJson: { name: 'mj' } } });
    const variantDir = path.join(parent, 'MJ', 'Node_Modules');
    mkdirSync(variantDir);
    writeFileSync(path.join(variantDir, 'keep.txt'), 'PRECIOUS', 'utf8');
    const result = RemoveMemberInstallTrees([path.join(parent, 'MJ', 'node_modules')]);
    expect(result.Removed).toEqual([]); // nothing deleted on ANY filesystem
    expect(existsSync(path.join(variantDir, 'keep.txt'))).toBe(true);
  });

  it('refuses any path that is not an absolute node_modules dir (precondition, per-path)', () => {
    expect(() => RemoveMemberInstallTrees(['/tmp/some-repo/src'])).toThrow(/only deletes node_modules/);
    expect(() => RemoveMemberInstallTrees(['relative/node_modules'])).toThrow(/only deletes node_modules/);
  });
});

describe('IsInsideDirectory', () => {
  // Review probe7 item (c): an --include of a path-like name can place a member
  // OUTSIDE the parent; such members must never be enumerated for deletion.
  it('accepts only strict descendants of the parent directory', () => {
    expect(IsInsideDirectory('/parent', '/parent/MJ')).toBe(true);
    expect(IsInsideDirectory('/parent', '/parent/a/b/node_modules')).toBe(true);
    expect(IsInsideDirectory('/parent', '/parent')).toBe(false); // never the parent itself
    expect(IsInsideDirectory('/parent', '/parent/../elsewhere/repo')).toBe(false);
    expect(IsInsideDirectory('/parent', '/elsewhere/repo')).toBe(false);
  });

  it('rejects relative paths (precondition)', () => {
    expect(() => IsInsideDirectory('relative', '/x')).toThrow(/absolute/);
    expect(() => IsInsideDirectory('/x', 'relative')).toThrow(/absolute/);
  });
});
