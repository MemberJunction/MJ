/**
 * @fileoverview The rigs refuse to write inside a git working tree, so corpus-derived output can
 * never be committed. Runs against throwaway directories under the OS temp directory.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AssertOutputOutsideRepo,
    FindRepoRoot,
    GENERATED_FILES_MANIFEST,
    IsPathInside,
    OutputCollisionError,
    OutputInsideRepoError,
    OutputNotEmptyError,
    ResolveRealPath,
    WriteGeneratedFiles,
    type GeneratedFile
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

describe('WriteGeneratedFiles', () => {
    const GENERATOR = 'test-generator';
    const suite = (...names: string[]): GeneratedFile[] => [
        ...names.map(name => ({ RelativePath: `tests/.${name}.json`, Content: `{"name":"${name}"}` })),
        { RelativePath: 'tests/.mj-sync.json', Content: '{}' },
        { RelativePath: 'generated-from.json', Content: '{}' }
    ];
    let n = 0;
    /** A fresh directory outside any repository, and the path of a directory inside it not made yet. */
    const scratch = (): string => join(outside, `generated-${++n}`);
    const read = (path: string): string => readFileSync(path, 'utf8');

    it('creates a new directory, writes the files, and lists them in its manifest', () => {
        const out = scratch();
        const result = WriteGeneratedFiles(out, suite('a', 'b'), { Generator: GENERATOR, Replace: false });
        expect(result).toEqual({ Written: 4, Removed: 0, Kept: [] });
        expect(read(join(out, 'tests', '.a.json'))).toBe('{"name":"a"}');
        expect(JSON.parse(read(join(out, GENERATED_FILES_MANIFEST)))).toEqual({
            generator: GENERATOR,
            files: ['generated-from.json', 'tests/.a.json', 'tests/.b.json', 'tests/.mj-sync.json']
        });
    });

    it('writes into an existing empty directory', () => {
        const out = scratch();
        mkdirSync(out);
        expect(WriteGeneratedFiles(out, suite('a'), { Generator: GENERATOR, Replace: false }).Written).toBe(3);
    });

    it('refuses a directory that holds anything, and leaves it exactly as it was', () => {
        // The reviewer's probe: an unrelated file where the rig writes its records.
        const out = scratch();
        mkdirSync(join(out, 'tests'), { recursive: true });
        writeFileSync(join(out, 'tests', 'keep-me.txt'), 'mine');
        expect(() => WriteGeneratedFiles(out, suite('a'), { Generator: GENERATOR, Replace: false })).toThrow(OutputNotEmptyError);
        expect(read(join(out, 'tests', 'keep-me.txt'))).toBe('mine');
        expect(existsSync(join(out, 'tests', '.a.json'))).toBe(false);
        expect(existsSync(join(out, GENERATED_FILES_MANIFEST))).toBe(false);
    });

    it('replacing an earlier run removes only the files its manifest lists; an unrelated file survives', () => {
        const out = scratch();
        WriteGeneratedFiles(out, [...suite('a', 'stale'), { RelativePath: 'old-only/.x.json', Content: '{}' }], { Generator: GENERATOR, Replace: false });
        writeFileSync(join(out, 'tests', 'keep-me.txt'), 'mine');
        const result = WriteGeneratedFiles(out, suite('a', 'b'), { Generator: GENERATOR, Replace: true });
        expect(result).toEqual({ Written: 4, Removed: 2, Kept: ['tests/keep-me.txt'] });
        expect(read(join(out, 'tests', 'keep-me.txt'))).toBe('mine');
        expect(existsSync(join(out, 'tests', '.stale.json'))).toBe(false);
        // A directory the earlier run's files left empty goes too.
        expect(existsSync(join(out, 'old-only'))).toBe(false);
        expect(read(join(out, 'tests', '.b.json'))).toBe('{"name":"b"}');
    });

    it('with no manifest, replacing removes nothing and refuses to overwrite a file it did not write', () => {
        const out = scratch();
        mkdirSync(join(out, 'tests'), { recursive: true });
        writeFileSync(join(out, 'tests', 'keep-me.txt'), 'mine');
        writeFileSync(join(out, 'generated-from.json'), 'someone else\'s');
        expect(() => WriteGeneratedFiles(out, suite('a'), { Generator: GENERATOR, Replace: true })).toThrow(OutputCollisionError);
        // Nothing changed: the refusal comes before any write.
        expect(read(join(out, 'generated-from.json'))).toBe('someone else\'s');
        expect(existsSync(join(out, 'tests', '.a.json'))).toBe(false);
        rmSync(join(out, 'generated-from.json'));
        expect(WriteGeneratedFiles(out, suite('a'), { Generator: GENERATOR, Replace: true })).toMatchObject({ Removed: 0, Kept: ['tests/keep-me.txt'] });
    });

    it('does not trust a manifest another generator wrote', () => {
        const out = scratch();
        WriteGeneratedFiles(out, suite('a'), { Generator: 'another-rig', Replace: false });
        // Its files are not this rig's to remove, and its manifest is not this rig's to overwrite.
        expect(() => WriteGeneratedFiles(out, [{ RelativePath: 'other/.z.json', Content: '{}' }], { Generator: GENERATOR, Replace: true }))
            .toThrow(OutputCollisionError);
        expect(existsSync(join(out, 'tests', '.a.json'))).toBe(true);
    });

    it('never follows a manifest entry or a symlink out of the directory', () => {
        const out = scratch();
        const victim = join(root, `victim-${n}`);
        mkdirSync(victim);
        writeFileSync(join(victim, 'precious.txt'), 'keep');
        mkdirSync(out);
        symlinkSync(victim, join(out, 'linked'));
        writeFileSync(join(out, GENERATED_FILES_MANIFEST), JSON.stringify({ generator: GENERATOR, files: ['../victim/precious.txt', 'linked/precious.txt'] }));
        // A planned file whose directory is the symlink is refused before anything changes...
        expect(() => WriteGeneratedFiles(out, [{ RelativePath: 'linked/new.json', Content: '{}' }], { Generator: GENERATOR, Replace: true }))
            .toThrow(OutputCollisionError);
        // ...and the manifest's entries, one climbing out and one through the symlink, are not removed.
        WriteGeneratedFiles(out, [{ RelativePath: 'fresh.json', Content: '{}' }], { Generator: GENERATOR, Replace: true });
        expect(read(join(victim, 'precious.txt'))).toBe('keep');
    });

    it('refuses a file path that is absolute or climbs out', () => {
        for (const bad of ['../escape.json', '/tmp/abs.json', 'tests/../../escape.json', '']) {
            expect(() => WriteGeneratedFiles(scratch(), [{ RelativePath: bad, Content: '{}' }], { Generator: GENERATOR, Replace: false })).toThrow(/must be relative/);
        }
        expect(() => WriteGeneratedFiles(scratch(), [{ RelativePath: GENERATED_FILES_MANIFEST, Content: '{}' }], { Generator: GENERATOR, Replace: false }))
            .toThrow(/written separately/);
    });
});
