/**
 * @fileoverview The rigs refuse to write inside a git working tree, so corpus-derived output can
 * never be committed. Runs against throwaway directories under the OS temp directory.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AssertOutputOutsideRepo,
    FindRepoRoot,
    IsPathInside,
    OutputInsideRepoError,
    ResolveRealPath
} from '../decision-eval/output-paths';

let root: string;
let clone: string;
let worktree: string;
let outside: string;

beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'decision-eval-paths-')));
    clone = join(root, 'clone');
    worktree = join(root, 'worktree');
    outside = join(root, 'outside');
    mkdirSync(join(clone, '.git'), { recursive: true });
    mkdirSync(join(clone, 'packages', 'deep'), { recursive: true });
    mkdirSync(worktree, { recursive: true });
    // A worktree's .git is a file that points at the main repository.
    writeFileSync(join(worktree, '.git'), 'gitdir: /somewhere/else\n');
    mkdirSync(outside, { recursive: true });
    symlinkSync(join(clone, 'packages'), join(outside, 'link-into-clone'));
});

afterAll(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('FindRepoRoot', () => {
    it('walks up to the directory holding .git, as a directory or a file', () => {
        expect(FindRepoRoot(join(clone, 'packages', 'deep'))).toBe(clone);
        expect(FindRepoRoot(join(worktree, 'not', 'made', 'yet'))).toBe(worktree);
    });

    it('is null outside any repository', () => {
        expect(FindRepoRoot(join(outside, 'results'))).toBeNull();
    });

    it('finds the repository this package lives in', () => {
        const here = dirname(fileURLToPath(import.meta.url));
        expect(FindRepoRoot(here)).not.toBeNull();
    });
});

describe('AssertOutputOutsideRepo', () => {
    it('refuses a directory inside a repository, even one not created yet', () => {
        expect(() => AssertOutputOutsideRepo(join(clone, 'packages', 'deep', 'out'))).toThrow(OutputInsideRepoError);
        expect(() => AssertOutputOutsideRepo(join(worktree, 'out'))).toThrow(/inside the git repository at/);
    });

    it('refuses the repository root itself', () => {
        expect(() => AssertOutputOutsideRepo(clone)).toThrow(OutputInsideRepoError);
    });

    it('refuses a symlink that leads into a repository', () => {
        expect(() => AssertOutputOutsideRepo(join(outside, 'link-into-clone', 'out'))).toThrow(OutputInsideRepoError);
    });

    it('refuses a path inside a listed repository even when walking up finds none', () => {
        expect(() => AssertOutputOutsideRepo(join(outside, 'results'), [outside])).toThrow(OutputInsideRepoError);
    });

    it('refuses this package\'s own directory', () => {
        const here = dirname(fileURLToPath(import.meta.url));
        expect(() => AssertOutputOutsideRepo(join(here, 'decision-eval-out'))).toThrow(OutputInsideRepoError);
    });

    it('accepts a directory outside every repository, and returns it resolved', () => {
        expect(AssertOutputOutsideRepo(join(outside, 'results'), [clone])).toBe(join(outside, 'results'));
    });
});

describe('path helpers', () => {
    it('IsPathInside compares resolved paths, not prefixes', () => {
        expect(IsPathInside(join(clone, 'a'), clone)).toBe(true);
        expect(IsPathInside(clone, clone)).toBe(true);
        expect(IsPathInside(`${clone}-sibling`, clone)).toBe(false);
    });

    it('ResolveRealPath resolves the existing part and keeps the rest', () => {
        expect(ResolveRealPath(join(outside, 'link-into-clone', 'x', 'y'))).toBe(join(clone, 'packages', 'x', 'y'));
    });
});
