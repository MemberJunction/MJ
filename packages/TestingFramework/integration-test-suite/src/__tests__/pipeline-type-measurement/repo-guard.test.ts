/**
 * repo-guard.test.ts — `--out` is refused inside any git working tree, including a linked worktree
 * (whose `.git` is a file) and a directory that does not exist yet.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssertOutputOutsideRepo, FindRepoRoot } from '../../pipeline-type-measurement/repo-guard';

const made: string[] = [];

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'pipeline-measure-'));
    made.push(dir);
    return dir;
}

afterEach(() => {
    made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe('AssertOutputOutsideRepo', () => {
    it('refuses a directory inside this repository', () => {
        const here = dirname(fileURLToPath(import.meta.url));
        expect(() => AssertOutputOutsideRepo(join(here, 'report-out'))).toThrow(/inside the git working tree/);
    });

    it('refuses a not-yet-created directory under a .git directory\'s tree', () => {
        const repo = tempDir();
        mkdirSync(join(repo, '.git'));
        expect(() => AssertOutputOutsideRepo(join(repo, 'reports', 'new'))).toThrow(/inside the git working tree/);
    });

    it('refuses a linked worktree, whose .git is a file', () => {
        const worktree = tempDir();
        writeFileSync(join(worktree, '.git'), 'gitdir: /somewhere/else\n');
        mkdirSync(join(worktree, 'out'));
        expect(() => AssertOutputOutsideRepo(join(worktree, 'out'))).toThrow(/inside the git working tree/);
    });

    it('accepts a directory outside every repository, returned absolute', () => {
        const outside = tempDir();
        expect(AssertOutputOutsideRepo(join(outside, 'report'))).toBe(join(outside, 'report'));
    });
});

describe('FindRepoRoot', () => {
    it('finds the directory holding .git, and nothing outside a repository', () => {
        const repo = tempDir();
        mkdirSync(join(repo, '.git'));
        mkdirSync(join(repo, 'a', 'b'), { recursive: true });
        expect(FindRepoRoot(join(repo, 'a', 'b'))).toMatch(/pipeline-measure-/);
        expect(FindRepoRoot(tempDir())).toBeNull();
    });
});
