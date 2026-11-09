/**
 * repo-guard.test.ts — `--out` is refused inside any git working tree, including a linked worktree
 * (whose `.git` is a file), a directory that does not exist yet, and a path through a symlink into a
 * repository; and an `--out` that cannot be written is refused before the run.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssertOutputOutsideRepo, FindRepoRoot, PrepareOutputDirectory } from '../../pipeline-type-measurement/repo-guard';

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

    it('refuses a path that reaches a repository through a symlink', () => {
        const repo = tempDir();
        mkdirSync(join(repo, '.git'));
        mkdirSync(join(repo, 'sub'));
        const outside = tempDir();
        symlinkSync(join(repo, 'sub'), join(outside, 'link'), 'dir');
        expect(() => AssertOutputOutsideRepo(join(outside, 'link', 'report'))).toThrow(/inside the git working tree/);
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

describe('PrepareOutputDirectory', () => {
    it('creates a missing directory and leaves nothing in it', () => {
        const out = join(tempDir(), 'a', 'report');
        PrepareOutputDirectory(out);
        expect(existsSync(out)).toBe(true);
        expect(readdirSync(out)).toEqual([]);
    });

    it('refuses an --out that is a file', () => {
        const file = join(tempDir(), 'report');
        writeFileSync(file, 'not a directory');
        expect(() => PrepareOutputDirectory(file)).toThrow(/--out '.*report' cannot be written/);
    });
});
